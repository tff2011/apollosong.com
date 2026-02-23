/**
 * Remove production/stage directions so only human-readable lyrics remain.
 * Rule: nothing between square brackets should appear in the final PDF.
 */
export function stripLyricsTags(lyrics: string): string {
  if (!lyrics) {
    return "";
  }

  return lyrics
    // Remove any bracketed directive, including inline forms:
    // [Verse], [Intro: ...], [Call-and-response], etc.
    .replace(/\[[^\]\r\n]*\]/g, "")
    // Remove full-line directions in parentheses.
    .replace(/^\s*\([^)\r\n]*\)\s*$/gm, "")
    // Normalize whitespace around line breaks.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    // Keep stanza spacing tidy.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
