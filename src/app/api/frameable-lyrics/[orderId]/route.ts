import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { enqueuePdfGenerationSingle } from "~/server/queues/pdf-generation";

type PaperSize = "A4" | "A3";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { searchParams } = new URL(request.url);
  const sizeParam = searchParams.get("size")?.toUpperCase();
  const size: PaperSize = sizeParam === "A3" ? "A3" : "A4";
  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  const wantsDownloadPage = searchParams.get("download") === "1" || acceptsHtml;

  const htmlResponse = (html: string, status = 200) =>
    new NextResponse(html, {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });

  const renderProcessingPage = () => {
    const refreshSeconds = 5;
    return htmlResponse(
      `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="${refreshSeconds}" />
    <title>Gerando PDF...</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #060912; margin: 0; }
      .wrap { max-width: 560px; margin: 12vh auto; padding: 24px; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0; font-size: 14px; color: #475569; }
      .hint { margin-top: 12px; font-size: 12px; color: #64748b; }
      a { color: #2563eb; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Gerando seu PDF ${size}...</h1>
        <p>Esse download será iniciado automaticamente assim que o arquivo estiver pronto.</p>
        <p class="hint">Se preferir, você pode <a href="">atualizar manualmente</a>.</p>
      </div>
    </div>
  </body>
</html>`,
      202
    );
  };

  const renderErrorPage = (message: string, status = 400) =>
    htmlResponse(
      `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Não foi possível baixar</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #060912; margin: 0; }
      .wrap { max-width: 560px; margin: 12vh auto; padding: 24px; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0; font-size: 14px; color: #475569; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Não foi possível baixar o PDF</h1>
        <p>${message}</p>
      </div>
    </div>
  </body>
</html>`,
      status
    );

  if (!orderId) {
    return wantsDownloadPage
      ? renderErrorPage("O pedido informado é inválido.", 400)
      : NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  try {
    // Fetch order to check for pre-generated PDF
    const order = await db.songOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        recipientName: true,
        hasLyrics: true,
        status: true,
        lyricsPdfA4Url: true,
        lyricsPdfA3Url: true,
        lyricsPdfGeneratedAt: true,
        correctedLyricsAt: true,
        lyricsGeneratedAt: true,
        orderType: true,
        parentOrderId: true,
        parentOrder: {
          select: { hasLyrics: true },
        },
        childOrders: {
          select: {
            hasLyrics: true,
            orderType: true,
          },
        },
      },
    });

    if (!order) {
      return wantsDownloadPage
        ? renderErrorPage("Pedido não encontrado.", 404)
        : NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check if any child LYRICS_UPSELL order has hasLyrics
    const hasLyricsUpsell = order.childOrders?.some(
      (child) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics
    );

    // Check if lyrics are available (own purchase, upsell child, or parent purchase)
    if (!order.hasLyrics && !hasLyricsUpsell && !order.parentOrder?.hasLyrics) {
      return wantsDownloadPage
        ? renderErrorPage("O adicional de letra não foi comprado para este pedido.", 403)
        : NextResponse.json(
            { error: "Lyrics add-on not purchased for this order" },
            { status: 403 }
          );
    }

    if (order.status !== "COMPLETED") {
      return wantsDownloadPage
        ? renderErrorPage("O pedido ainda não foi finalizado.", 404)
        : NextResponse.json(
            { error: "Order not yet completed" },
            { status: 404 }
          );
    }

    // Check if PDF is already generated
    let pdfUrl = size === "A4" ? order.lyricsPdfA4Url : order.lyricsPdfA3Url;

    // Check if PDF is stale (lyrics were updated after PDF was generated)
    // This includes either corrections (correctedLyricsAt) or a regenerated lyrics timestamp (lyricsGeneratedAt).
    const lyricsUpdatedAt =
      order.correctedLyricsAt && order.lyricsGeneratedAt
        ? order.correctedLyricsAt > order.lyricsGeneratedAt
          ? order.correctedLyricsAt
          : order.lyricsGeneratedAt
        : order.correctedLyricsAt ?? order.lyricsGeneratedAt ?? null;
    const isPdfStale =
      pdfUrl &&
      lyricsUpdatedAt &&
      (!order.lyricsPdfGeneratedAt || lyricsUpdatedAt > order.lyricsPdfGeneratedAt);

    if (isPdfStale) {
      console.log(
        `📄 [PDF] Stale PDF detected for order ${orderId}: lyricsUpdatedAt=${lyricsUpdatedAt?.toISOString()} > lyricsPdfGeneratedAt=${order.lyricsPdfGeneratedAt?.toISOString()}`
      );
      // Invalidate cached URLs and queue regeneration
      await db.songOrder.update({
        where: { id: orderId },
        data: {
          lyricsPdfA4Url: null,
          lyricsPdfA3Url: null,
          lyricsPdfGeneratedAt: null,
        },
      });
      pdfUrl = null;
    }

    if (pdfUrl) {
      // When download=1, serve an HTML page that triggers a single download via JS
      // This avoids double-download caused by meta-refresh on the processing page
      if (wantsDownloadPage) {
        const directUrl = request.url.replace(/[?&]download=1/, "").replace(/&$/, "");
        return htmlResponse(
          `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Download iniciado</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #060912; margin: 0; }
      .wrap { max-width: 560px; margin: 12vh auto; padding: 24px; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0; font-size: 14px; color: #475569; }
      .hint { margin-top: 12px; font-size: 12px; color: #64748b; }
      a { color: #2563eb; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Download iniciado!</h1>
        <p>Seu PDF ${size} está sendo baixado.</p>
        <p class="hint">Se o download não iniciou, <a href="${directUrl}">clique aqui</a>.</p>
      </div>
    </div>
    <script>
      var a = document.createElement("a");
      a.href = ${JSON.stringify(directUrl)};
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
    </script>
  </body>
</html>`
        );
      }

      // Direct access (no download=1): return PDF binary with download headers
      const pdfResponse = await fetch(pdfUrl, { cache: "no-store" });
      if (!pdfResponse.ok) {
        return NextResponse.json(
          { error: "Failed to fetch PDF from storage" },
          { status: 500 }
        );
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();

      // Remove accents and special characters for safe filename
      const safeName = order.recipientName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-") // Replace non-alphanumeric with dash
        .replace(/-+/g, "-") // Collapse multiple dashes
        .replace(/^-|-$/g, ""); // Trim dashes

      const filename = `letra-${safeName}-${size.toLowerCase()}.pdf`;

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": pdfBuffer.byteLength.toString(),
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // PDF not yet generated - queue generation with HIGH priority (user requested)
    await enqueuePdfGenerationSingle(orderId, size);

    return wantsDownloadPage
      ? renderProcessingPage()
      : NextResponse.json(
          {
            error: "PDF is being generated",
            message: "Please try again in a few moments",
            status: "processing",
          },
          { status: 202 }
        );
  } catch (error) {
    console.error("Error fetching lyrics PDF:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return wantsDownloadPage
      ? renderErrorPage("Erro interno ao gerar o PDF.", 500)
      : NextResponse.json(
          { error: "Failed to get PDF", details: errorMessage },
          { status: 500 }
        );
  }
}
