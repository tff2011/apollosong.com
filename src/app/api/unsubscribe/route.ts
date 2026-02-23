import { NextRequest, NextResponse } from "next/server";
import { validateUnsubscribeToken, unsubscribeEmail } from "~/lib/email-unsubscribe";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const locale = searchParams.get("locale") || "en";

  // Validate required parameters
  if (!email || !token) {
    return NextResponse.redirect(
      new URL(`/${locale}/unsubscribe?error=missing_params`, request.url)
    );
  }

  // Validate token
  if (!validateUnsubscribeToken(email, token)) {
    return NextResponse.redirect(
      new URL(`/${locale}/unsubscribe?error=invalid_token`, request.url)
    );
  }

  try {
    // Unsubscribe the email
    await unsubscribeEmail(email, "user_request");

    // Redirect to success page
    return NextResponse.redirect(
      new URL(`/${locale}/unsubscribe?success=true`, request.url)
    );
  } catch (error) {
    console.error("Failed to unsubscribe email:", error);
    return NextResponse.redirect(
      new URL(`/${locale}/unsubscribe?error=server_error`, request.url)
    );
  }
}
