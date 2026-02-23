/**
 * HTML template for premium frameable lyrics PDF.
 * Uses elegant fonts and gold/cream color palette.
 */
import { stripLyricsTags } from "./lyrics-cleaner";

type PaperSize = "A4" | "A3";
type Locale = "en" | "pt" | "es" | "fr" | "it";

interface TemplateOptions {
  recipientName: string;
  lyrics: string;
  locale: string;
  size: PaperSize;
  songName?: string;
  genre?: string;
  spotifyUrl?: string;
  spotifyQrCodeDataUrl?: string;
}

interface Branding {
  brand: string;
  byline: string;
  subtitle: string;
  url: string;
  instagram: string;
  whatsapp: string;
}

const BRANDING: Record<Locale, Branding> = {
  pt: {
    brand: "Apollo Song",
    byline: "por ApolloSong",
    subtitle: "Uma canção escrita do coração",
    url: "www.apollosong.com/pt",
    instagram: "@apollosongbr",
    whatsapp: "+55 (61) 99579-0193",
  },
  en: {
    brand: "ApolloSong",
    byline: "",
    subtitle: "A song written from the heart",
    url: "www.apollosong.com",
    instagram: "@apollosong",
    whatsapp: "+55 (61) 99579-0193",
  },
  es: {
    brand: "ApolloSong",
    byline: "por ApolloSong",
    subtitle: "Una canción escrita desde el corazón",
    url: "www.apollosong.com/es",
    instagram: "@apollosong",
    whatsapp: "+55 (61) 99579-0193",
  },
  fr: {
    brand: "ChansonDivine",
    byline: "par ApolloSong",
    subtitle: "Une chanson écrite du coeur",
    url: "www.apollosong.com/fr",
    instagram: "@apollosong",
    whatsapp: "+55 (61) 99579-0193",
  },
  it: {
    brand: "ApolloSong",
    byline: "di ApolloSong",
    subtitle: "Una canzone scritta dal cuore",
    url: "www.apollosong.com/it",
    instagram: "@apollosong",
    whatsapp: "+55 (61) 99579-0193",
  },
};

const COLUMN_FLOW_TEXT: Record<Locale, string> = {
  pt: "Leia ↓ depois →",
  en: "Read ↓ then →",
  es: "Lee ↓ luego →",
  fr: "Lisez ↓ puis →",
  it: "Leggi ↓ poi →",
};

const CONTINUATION_TEXT: Record<Locale, { next: string; prev: string }> = {
  pt: { next: "↪ continua na coluna 2", prev: "↩ continuação da coluna 1" },
  en: { next: "↪ continue in column 2", prev: "↩ continued from column 1" },
  es: { next: "↪ continúa en la columna 2", prev: "↩ continúa de la columna 1" },
  fr: { next: "↪ continue dans la colonne 2", prev: "↩ suite de la colonne 1" },
  it: { next: "↪ continua nella colonna 2", prev: "↩ continua dalla colonna 1" },
};

const SPOTIFY_TEXT: Record<Locale, string> = {
  pt: "Ouça no Spotify",
  en: "Listen on Spotify",
  es: "Escucha en Spotify",
  fr: "Écoutez sur Spotify",
  it: "Ascolta su Spotify",
};

// Genre labels for display
const GENRE_LABELS: Record<string, string> = {
  pop: "Pop",
  country: "Country",
  rock: "Rock",
  "jovem-guarda": "Jovem Guarda",
  "rock-classico": "Rock Clássico",
  "pop-rock-brasileiro": "Pop Rock Brasileiro",
  "heavy-metal": "Heavy Metal",
  eletronica: "Eletrônica",
  "eletronica-afro-house": "Afro House",
  "eletronica-progressive-house": "Progressive House",
  "eletronica-melodic-techno": "Melodic Techno",
  rnb: "R&B",
  jazz: "Jazz",
  worship: "Worship",
  hiphop: "Rap",
  funk: "Funk",
  "funk-carioca": "Funk Carioca",
  "funk-paulista": "Funk Paulista",
  "funk-melody": "Funk Melody",
  brega: "Brega",
  "brega-romantico": "Brega Romântico",
  tecnobrega: "Tecnobrega",
  reggae: "Reggae",
  lullaby: "Infantil",
  "lullaby-ninar": "Canções de Ninar",
  "lullaby-animada": "Infantil Animada",
  samba: "Samba",
  pagode: "Pagode",
  "pagode-de-mesa": "Pagode de Mesa",
  "pagode-romantico": "Pagode Romântico",
  "pagode-universitario": "Pagode Universitário",
  forro: "Forró",
  "sertanejo-raiz": "Sertanejo Raiz",
  "sertanejo-universitario": "Sertanejo Universitário",
  "sertanejo-romantico": "Sertanejo Romântico",
  "forro-pe-de-serra": "Forró Pé-de-Serra",
  "forro-pe-de-serra-rapido": "Forró Pé-de-Serra",
  "forro-pe-de-serra-lento": "Forró Pé-de-Serra",
  "forro-universitario": "Forró Universitário",
  "forro-eletronico": "Forró Eletrônico",
  axe: "Axé",
  mpb: "MPB",
  "mpb-bossa-nova": "Bossa Nova",
  "mpb-cancao-brasileira": "MPB",
  "mpb-pop": "Pop MPB",
  "mpb-intimista": "MPB Intimista",
  bossa: "Bossa Nova",
  latina: "Música Latina",
  salsa: "Salsa",
  merengue: "Merengue",
  bachata: "Bachata",
  bolero: "Bolero",
  cumbia: "Cumbia",
  ranchera: "Ranchera",
  balada: "Balada",
  adoracion: "Adoración",
  chanson: "Chanson Française",
  variete: "Variété Française",
  napoletana: "Canzone Napoletana",
  lirico: "Lirico",
  tarantella: "Tarantella",
};

// Color palette
const COLORS = {
  gold: "#C9A84C",
  goldLight: "#D4BC6A",
  text: "#F0EDE6",
  background: "#0A0E1A",
  cream: "#FFFDF8",
};

// Thresholds for layout decisions
const TWO_COLUMN_THRESHOLD_A4 = 28; // Use 2 columns if more than 28 lines on A4
const TWO_COLUMN_THRESHOLD_A3 = 28; // Use 2 columns if more than 28 lines on A3

function countLyricLines(lyrics: string): number {
  return lyrics.split("\n").filter((line) => line.trim() !== "").length;
}

function countStanzaBreaks(lyrics: string): number {
  return lyrics.split("\n").filter((line) => line.trim() === "").length;
}

/**
 * Calculate optimal font size based on line count, paper size, and columns.
 */
function calculateFontSize(
  lineCount: number,
  size: PaperSize,
  twoColumns: boolean
): number {
  const scale = size === "A3" ? 1.4 : 1;

  if (twoColumns) {
    // With 2 columns
    const linesPerColumn = Math.ceil(lineCount / 2);
    if (linesPerColumn <= 18) return 18 * scale;
    if (linesPerColumn <= 25) return 17 * scale;
    if (linesPerColumn <= 35) return 16 * scale;
    // Very long lyrics (50-70 lines total = 25-35 per column)
    if (linesPerColumn <= 45) return 14 * scale;
    // Extremely long (>70 lines) - smallest allowed
    return 12 * scale;
  }

  // Single column (max ~28 lines on A4)
  if (lineCount <= 15) return 20 * scale;
  if (lineCount <= 22) return 18 * scale;
  if (lineCount <= 28) return 16 * scale;
  return 16 * scale;
}

/**
 * Calculate available height for lyrics in mm
 */
function getAvailableHeight(size: PaperSize): number {
  const pageHeight = size === "A3" ? 420 : 297;
  const padding = size === "A3" ? 28 : 20;
  const headerHeight = size === "A3" ? 50 : 40; // logo + name + subtitle + divider
  const footerHeight = size === "A3" ? 30 : 25; // divider + contacts
  const safetyMargin = 10; // extra margin to prevent cutting

  return pageHeight - (padding * 2) - headerHeight - footerHeight - safetyMargin;
}

/**
 * Calculate required height for lyrics in mm
 */
function getRequiredHeight(
  lineCount: number,
  stanzaBreaks: number,
  fontSize: number,
  lineHeight: number
): number {
  // Convert px to mm (assuming 96 DPI: 1mm ≈ 3.78px)
  const pxToMm = 0.265;
  const lineHeightMm = fontSize * lineHeight * pxToMm;
  const stanzaBreakMm = fontSize * lineHeight * pxToMm; // full line height for breaks

  return (lineCount * lineHeightMm) + (stanzaBreaks * stanzaBreakMm);
}

interface FitCheckResult {
  fits: boolean;
  message: string | null;
  suggestion: "A3" | "reduce_font" | null;
  calculatedHeight: number;
  availableHeight: number;
}

/**
 * Check if lyrics will fit on the page with current settings.
 * Returns detailed info about fit status.
 */
export function checkLyricsFit(
  lyrics: string,
  size: PaperSize
): FitCheckResult {
  const cleanLyrics = stripLyricsTags(lyrics);
  const lineCount = countLyricLines(cleanLyrics);
  const stanzaBreaks = countStanzaBreaks(cleanLyrics);

  const threshold = size === "A3" ? TWO_COLUMN_THRESHOLD_A3 : TWO_COLUMN_THRESHOLD_A4;
  const useTwoColumns = lineCount > threshold;

  const fontSize = calculateFontSize(lineCount, size, useTwoColumns);
  const lineHeight = calculateLineHeight(fontSize);

  const availableHeight = getAvailableHeight(size);

  let requiredHeight: number;
  if (useTwoColumns) {
    // In 2 columns, height is based on the taller column
    const linesPerColumn = Math.ceil(lineCount / 2);
    const breaksPerColumn = Math.ceil(stanzaBreaks / 2);
    requiredHeight = getRequiredHeight(linesPerColumn, breaksPerColumn, fontSize, lineHeight);
  } else {
    requiredHeight = getRequiredHeight(lineCount, stanzaBreaks, fontSize, lineHeight);
  }

  const fits = requiredHeight <= availableHeight;

  if (fits) {
    return {
      fits: true,
      message: null,
      suggestion: null,
      calculatedHeight: requiredHeight,
      availableHeight,
    };
  }

  // Doesn't fit - suggest solution
  if (size === "A4") {
    return {
      fits: false,
      message: `Letra muito longa para A4 (${Math.round(requiredHeight)}mm necessários, ${Math.round(availableHeight)}mm disponíveis). Use tamanho A3.`,
      suggestion: "A3",
      calculatedHeight: requiredHeight,
      availableHeight,
    };
  }

  return {
    fits: false,
    message: `Letra muito longa mesmo para A3 (${Math.round(requiredHeight)}mm necessários, ${Math.round(availableHeight)}mm disponíveis). Considere editar a letra.`,
    suggestion: "reduce_font",
    calculatedHeight: requiredHeight,
    availableHeight,
  };
}

/**
 * Calculate line height based on font size.
 */
function calculateLineHeight(fontSize: number): number {
  if (fontSize >= 18) return 1.5;
  if (fontSize >= 16) return 1.45;
  return 1.4;
}

/**
 * Split lyrics into two columns.
 * Always prefers stanza breaks; only splits mid-stanza if no breaks exist.
 */
function splitLyricsIntoColumns(
  lyrics: string
): { col1: string; col2: string; splitAtStanza: boolean } {
  const lines = lyrics.split("\n");
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  const targetChars = totalChars / 2;

  const stanzaBreaks = lines
    .map((line, index) => (line.trim() === "" ? index : -1))
    .filter((index) => index > 0 && index < lines.length - 1);

  let bestStanzaSplit: number | null = null;
  let bestStanzaDiff = Infinity;

  for (const breakPos of stanzaBreaks) {
    const charsBeforeBreak = lines
      .slice(0, breakPos)
      .reduce((sum, line) => sum + line.length, 0);
    const diff = Math.abs(charsBeforeBreak - targetChars);

    if (diff < bestStanzaDiff) {
      bestStanzaDiff = diff;
      bestStanzaSplit = breakPos;
    }
  }

  if (bestStanzaSplit !== null) {
    return {
      col1: lines.slice(0, bestStanzaSplit).join("\n").trim(),
      col2: lines.slice(bestStanzaSplit + 1).join("\n").trim(),
      splitAtStanza: true,
    };
  }

  let charCount = 0;
  let idealSplit = Math.ceil(lines.length / 2);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    charCount += line.length;
    if (charCount >= targetChars) {
      idealSplit = i;
      break;
    }
  }

  const splitIndex = Math.min(Math.max(idealSplit, 1), lines.length - 1);

  return {
    col1: lines.slice(0, splitIndex).join("\n").trim(),
    col2: lines.slice(splitIndex).join("\n").trim(),
    splitAtStanza: false,
  };
}

/**
 * Convert lyrics text to HTML with proper line breaks.
 */
function lyricsToHtml(lyrics: string): string {
  return lyrics
    .split("\n")
    .map((line) => {
      if (line.trim() === "") {
        return '<div class="stanza-break"></div>';
      }
      return `<p class="lyric-line">${escapeHtml(line)}</p>`;
    })
    .join("\n");
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate the complete HTML document for the frameable lyrics PDF.
 */
export function generateFrameableLyricsHtml(options: TemplateOptions): string {
  const { recipientName, lyrics, locale, size, songName, genre, spotifyUrl, spotifyQrCodeDataUrl } = options;
  const cleanLyrics = stripLyricsTags(lyrics);
  const genreLabel = genre ? GENRE_LABELS[genre] || genre : null;
  const resolvedLocale = (locale as Locale) || "en";
  const branding = BRANDING[resolvedLocale] || BRANDING.en;
  const spotifyText = SPOTIFY_TEXT[resolvedLocale] || SPOTIFY_TEXT.en;

  const lineCount = countLyricLines(cleanLyrics);
  const threshold = size === "A3" ? TWO_COLUMN_THRESHOLD_A3 : TWO_COLUMN_THRESHOLD_A4;
  const useTwoColumns = lineCount > threshold;

  const fontSize = calculateFontSize(lineCount, size, useTwoColumns);
  const lineHeight = calculateLineHeight(fontSize);
  const continuationSize = Math.max(9, Math.round(fontSize * 0.7));
  const columnFlowSize = Math.max(9, Math.round(fontSize * 0.65));

  const pageWidth = size === "A3" ? "297mm" : "210mm";
  const pageHeight = size === "A3" ? "420mm" : "297mm";
  const padding = size === "A3" ? "28mm" : "20mm";
  const borderWidth = size === "A3" ? "3px" : "2px";

  // Generate lyrics HTML - use manual column split for two columns
  let lyricsHtml: string;
  if (useTwoColumns) {
    const { col1, col2, splitAtStanza } = splitLyricsIntoColumns(cleanLyrics);
    const flowText = COLUMN_FLOW_TEXT[resolvedLocale] || COLUMN_FLOW_TEXT.en;
    const continuationText = CONTINUATION_TEXT[resolvedLocale] || CONTINUATION_TEXT.en;
    const showContinuation = !splitAtStanza;
    const continuationNote = showContinuation
      ? `<div class="continuation-note">${escapeHtml(continuationText.next)}</div>`
      : "";
    const continuationResume = showContinuation
      ? `<div class="continuation-resume">${escapeHtml(continuationText.prev)}</div>`
      : "";
    lyricsHtml = `
      <div class="column-flow">
        <span class="column-number">1</span>
        <span class="column-instruction">${escapeHtml(flowText)}</span>
        <span class="column-number">2</span>
      </div>
      <div class="lyrics-columns">
        <div class="lyrics-column">${lyricsToHtml(col1)}${continuationNote}</div>
        <div class="lyrics-column">${continuationResume}${lyricsToHtml(col2)}</div>
      </div>`;
  } else {
    lyricsHtml = `<div class="lyrics-content">${lyricsToHtml(cleanLyrics)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="${resolvedLocale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lyrics - ${escapeHtml(recipientName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <style>
    @page {
      size: ${size};
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: ${pageWidth};
      height: ${pageHeight};
      background-color: ${COLORS.background};
    }

    body {
      font-family: 'Cormorant Garamond', Georgia, serif;
      color: ${COLORS.text};
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .page {
      width: ${pageWidth};
      height: ${pageHeight};
      padding: ${padding};
      background-color: ${COLORS.cream};
      position: relative;
      display: flex;
      flex-direction: column;
    }

    /* Decorative border */
    .border-frame {
      position: absolute;
      top: 10mm;
      left: 10mm;
      right: 10mm;
      bottom: 10mm;
      border: ${borderWidth} solid ${COLORS.gold};
      pointer-events: none;
    }

    .border-frame::before,
    .border-frame::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      border: ${borderWidth} solid ${COLORS.gold};
    }

    .border-frame::before {
      top: -8px;
      left: -8px;
      border-right: none;
      border-bottom: none;
    }

    .border-frame::after {
      bottom: -8px;
      right: -8px;
      border-left: none;
      border-top: none;
    }

    /* Corner ornaments */
    .corner-ornament {
      position: absolute;
      width: 30px;
      height: 30px;
      color: ${COLORS.gold};
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .corner-tl { top: 5mm; left: 5mm; }
    .corner-tr { top: 5mm; right: 5mm; }
    .corner-bl { bottom: 5mm; left: 5mm; }
    .corner-br { bottom: 5mm; right: 5mm; }

    /* Header section */
    .header {
      text-align: center;
      margin-bottom: ${size === "A3" ? "15px" : "10px"};
      flex-shrink: 0;
    }

    .brand-logo {
      margin-bottom: 8px;
    }

    .brand-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: ${size === "A3" ? "22px" : "16px"};
      font-weight: 600;
      color: ${COLORS.text};
      letter-spacing: -0.5px;
    }

    .brand-byline {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: ${size === "A3" ? "11px" : "9px"};
      color: ${COLORS.text};
      opacity: 0.7;
      margin-top: 1px;
    }

    .recipient-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: ${size === "A3" ? "32px" : "24px"};
      font-weight: 600;
      color: ${COLORS.text};
      margin-bottom: 4px;
      line-height: 1.2;
    }

    .song-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: ${size === "A3" ? "32px" : "24px"};
      font-weight: 600;
      font-style: italic;
      color: ${COLORS.text};
    }

    .title-separator {
      margin: 0 12px;
      font-weight: 300;
      opacity: 0.6;
    }

    .subtitle {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: ${size === "A3" ? "14px" : "11px"};
      font-style: italic;
      color: ${COLORS.goldLight};
      letter-spacing: 0.5px;
    }

    .genre-tag {
      display: inline-block;
      margin-top: 8px;
      padding: ${size === "A3" ? "6px 16px" : "4px 12px"};
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: ${size === "A3" ? "12px" : "10px"};
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: ${COLORS.gold};
      border: 1px solid ${COLORS.gold};
      border-radius: 20px;
    }

    /* Decorative divider */
    .divider {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: ${size === "A3" ? "12px" : "8px"} 0;
      flex-shrink: 0;
    }

    .divider-line {
      width: 50px;
      height: 1px;
      background: linear-gradient(90deg, transparent, ${COLORS.gold}, transparent);
    }

    .divider-ornament {
      margin: 0 12px;
      color: ${COLORS.gold};
      font-size: 14px;
    }

    /* Lyrics section */
    .lyrics-container {
      flex: 1;
      padding-top: 5px;
      min-height: 0;
      overflow: hidden;
    }

    .lyrics-content {
      max-width: 90%;
      margin: 0 auto;
      text-align: left;
    }

    .column-flow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 auto 8px;
      font-size: ${columnFlowSize}px;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: ${COLORS.gold};
      opacity: 0.8;
    }

    .column-number {
      width: 2em;
      height: 2em;
      border: 1px solid ${COLORS.gold};
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      flex-shrink: 0;
    }

    .column-instruction {
      flex: 1;
      text-align: center;
      font-size: 0.9em;
    }

    .lyrics-columns {
      display: flex;
      gap: 30px;
      width: 100%;
    }

    .lyrics-column {
      flex: 1;
      text-align: left;
    }

    .lyrics-column:first-child {
      border-right: 1px solid ${COLORS.gold}30;
      padding-right: 15px;
    }

    .lyrics-column:last-child {
      padding-left: 15px;
    }

    .lyric-line {
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      margin: 0;
      padding: 0;
    }

    .stanza-break {
      height: ${Math.round(fontSize * lineHeight)}px;
    }

    .continuation-note,
    .continuation-resume {
      font-size: ${continuationSize}px;
      line-height: 1.2;
      color: ${COLORS.gold};
      font-style: italic;
      opacity: 0.85;
      margin-top: 0.6em;
      margin-bottom: 0.3em;
    }

    .continuation-note {
      text-align: right;
    }

    .continuation-resume {
      text-align: left;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 15px;
      flex-shrink: 0;
    }

    .footer-divider {
      width: 30px;
      height: 1px;
      background: ${COLORS.gold};
      margin: 0 auto 6px;
    }

    .footer-contacts {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: ${size === "A3" ? "16px" : "14px"};
      color: ${COLORS.gold};
      display: flex;
      justify-content: center;
      align-items: center;
      gap: ${size === "A3" ? "24px" : "18px"};
      flex-wrap: wrap;
    }

    .footer-contact {
      color: ${COLORS.gold};
      text-decoration: none;
    }

    .footer-contact:hover {
      text-decoration: underline;
    }

    .footer-separator {
      opacity: 0.5;
    }

    /* Spotify QR Code */
    .spotify-qr {
      position: absolute;
      top: ${size === "A3" ? "14mm" : "12mm"};
      right: ${size === "A3" ? "14mm" : "12mm"};
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      z-index: 10;
    }

    .spotify-logo {
      width: ${size === "A3" ? "24px" : "18px"};
      height: ${size === "A3" ? "24px" : "18px"};
    }

    .spotify-qr img {
      width: ${size === "A3" ? "80px" : "60px"};
      height: ${size === "A3" ? "80px" : "60px"};
      border-radius: 6px;
    }

    .spotify-qr-label {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: ${size === "A3" ? "14px" : "11px"};
      color: ${COLORS.text};
      text-align: center;
      letter-spacing: 0.3px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="border-frame"></div>

    <span class="corner-ornament corner-tl">&#10022;</span>
    <span class="corner-ornament corner-tr">&#10022;</span>
    <span class="corner-ornament corner-bl">&#10022;</span>
    <span class="corner-ornament corner-br">&#10022;</span>

    ${spotifyQrCodeDataUrl ? `
    <div class="spotify-qr">
      <svg class="spotify-logo" viewBox="0 0 24 24" fill="#1DB954">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
      <a href="${escapeHtml(spotifyUrl || "")}" target="_blank">
        <img src="${spotifyQrCodeDataUrl}" alt="Spotify QR Code" />
      </a>
      <span class="spotify-qr-label">${escapeHtml(spotifyText)}</span>
    </div>
    ` : ""}

    <div class="header">
      <div class="brand-logo">
        <div class="brand-name">${escapeHtml(branding.brand)}</div>
        ${branding.byline ? `<div class="brand-byline">${escapeHtml(branding.byline)}</div>` : ""}
      </div>
      <h1 class="recipient-name">
        ${escapeHtml(recipientName)}${songName ? `<span class="title-separator">—</span><span class="song-name">${escapeHtml(songName)}</span>` : ""}
      </h1>
      <div class="subtitle">${escapeHtml(branding.subtitle)}</div>
      ${genreLabel ? `<span class="genre-tag">${escapeHtml(genreLabel)}</span>` : ""}
    </div>

    <div class="divider">
      <span class="divider-line"></span>
      <span class="divider-ornament">&#10045;</span>
      <span class="divider-line"></span>
    </div>

    <div class="lyrics-container">
      ${lyricsHtml}
    </div>

    <div class="footer">
      <div class="footer-divider"></div>
      <div class="footer-contacts">
        <a href="https://${branding.url}" class="footer-contact" target="_blank">${escapeHtml(branding.url)}</a>
        <span class="footer-separator">•</span>
        <a href="https://instagram.com/${branding.instagram.replace('@', '')}" class="footer-contact" target="_blank">${escapeHtml(branding.instagram)}</a>
        <span class="footer-separator">•</span>
        <a href="https://wa.me/5561995790193" class="footer-contact" target="_blank">${escapeHtml(branding.whatsapp)}</a>
      </div>
    </div>
  </div>
  <script>
    (function() {
      var MAX_ATTEMPTS = 20;
      var SAFETY_MARGIN = 15;

      function measureOverflow() {
        var pageEl = document.querySelector(".page");
        var footer = document.querySelector(".footer");
        var lyricsContainer = document.querySelector(".lyrics-container");
        if (!pageEl || !footer || !lyricsContainer) {
          return 0;
        }

        var pageRect = pageEl.getBoundingClientRect();
        var footerRect = footer.getBoundingClientRect();
        var footerTop = footerRect.top - pageRect.top;

        var maxBottom = 0;
        var elements = document.querySelectorAll(
          ".lyric-line, .stanza-break, .continuation-note, .continuation-resume"
        );
        elements.forEach(function(el) {
          var rect = el.getBoundingClientRect();
          var bottom = rect.bottom - pageRect.top;
          if (bottom > maxBottom) {
            maxBottom = bottom;
          }
        });

        var containerBottom = lyricsContainer.getBoundingClientRect().bottom - pageRect.top;
        var actualBottom = Math.max(maxBottom, containerBottom);
        return Math.max(0, actualBottom - footerTop + SAFETY_MARGIN);
      }

      function scaleDown(factor) {
        var textBlocks = document.querySelectorAll(
          ".lyric-line, .continuation-note, .continuation-resume, .column-flow"
        );
        textBlocks.forEach(function(el) {
          if (!(el instanceof HTMLElement)) return;
          var currentSize = parseFloat(getComputedStyle(el).fontSize);
          if (!isFinite(currentSize)) return;
          var nextSize = currentSize * factor;
          el.style.fontSize = nextSize + "px";
        });

        var breaks = document.querySelectorAll(".stanza-break");
        breaks.forEach(function(el) {
          if (!(el instanceof HTMLElement)) return;
          var currentHeight = parseFloat(getComputedStyle(el).height);
          if (!isFinite(currentHeight)) return;
          var nextHeight = currentHeight * factor;
          el.style.height = nextHeight + "px";
        });

        var lines = document.querySelectorAll(".lyric-line");
        lines.forEach(function(el) {
          if (!(el instanceof HTMLElement)) return;
          var style = getComputedStyle(el);
          var currentSize = parseFloat(style.fontSize);
          var currentLineHeight = parseFloat(style.lineHeight);
          if (!isFinite(currentSize) || !isFinite(currentLineHeight) || currentSize === 0) {
            return;
          }
          var currentRatio = currentLineHeight / currentSize;
          var nextRatio = Math.max(1.25, currentRatio * 0.98);
          el.style.lineHeight = String(nextRatio);
        });
      }

      async function fitLyrics() {
        try {
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
          }

          var attempts = 0;
          while (attempts < MAX_ATTEMPTS) {
            var overflow = measureOverflow();
            if (overflow <= 0) break;

            var factor = overflow > 100 ? 0.90 : overflow > 50 ? 0.93 : 0.95;
            scaleDown(factor);
            await new Promise(function(resolve) { setTimeout(resolve, 50); });
            attempts++;
          }
        } finally {
          window.__lyricsFitDone = true;
        }
      }

      window.__fitLyrics = fitLyrics;
      fitLyrics();
    })();
  </script>
</body>
</html>`;
}
