/**
 * CSS Selectors for Suno.com elements
 * These selectors are based on Suno's UI and may need adjustment if Suno updates their interface
 */

export const SELECTORS = {
    // Create page URL
    CREATE_URL: "https://suno.com/create",
    // Library search input (clips page)
    LIBRARY_SEARCH_INPUT: 'input[aria-label="Search clips"], input[placeholder="Search"][aria-label], input[placeholder="Search"]',

    // Lyrics textarea - anchor to the "Lyrics" section heading to avoid matching Simple-mode "Song Description".
    // Also exclude containers that include BOTH "Lyrics" and "Styles" headings (often a parent panel),
    // so we don't accidentally target the wrong textarea.
    // NOTE: Keep generic aria-label fallbacks, but prefer section-scoped selectors first.
    LYRICS_TEXTAREA: 'textarea[placeholder*="write some lyrics" i]:visible, textarea:below(:text-is("Lyrics")):above(:text-is("Styles")):visible, [contenteditable]:below(:text-is("Lyrics")):above(:text-is("Styles")):visible, [role="textbox"]:below(:text-is("Lyrics")):above(:text-is("Styles")):visible, section:has(h2:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) textarea:visible, section:has(h3:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) textarea:visible, div:has(h2:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) textarea:visible, div:has(h3:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) textarea:visible, section:has(h2:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) [contenteditable]:visible, section:has(h3:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) [contenteditable]:visible, div:has(h2:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) [contenteditable]:visible, div:has(h3:has-text("Lyrics")):not(:has(h2:has-text("Styles"))):not(:has(h3:has-text("Styles"))) [contenteditable]:visible, section:has-text("Lyrics"):not(:has-text("Styles")) textarea:visible, div:has-text("Lyrics"):not(:has-text("Styles")) textarea:visible, section:has-text("Lyrics"):not(:has-text("Styles")) [contenteditable]:visible, div:has-text("Lyrics"):not(:has-text("Styles")) [contenteditable]:visible, [role="textbox"][aria-label*="lyrics" i]:visible, [contenteditable][aria-label*="lyrics" i]:visible, textarea[aria-label*="lyrics" i]:visible, textarea[name*="lyrics" i]:visible, textarea[placeholder*="lyrics" i]:visible, textarea[placeholder*="instrumental" i]:visible',

    // Custom Mode Toggle - MUST be enabled to see lyrics input
    CUSTOM_MODE_TOGGLE: '[role="tab"]:has-text("Custom"), button[role="tab"]:has-text("Custom"), button[role="switch"]:has-text("Custom"), button:has-text("Custom Mode"), [data-testid="custom-mode-toggle"]',

    // Style/Genre input field
    // IMPORTANT: Do NOT use overly generic textarea selectors here (e.g. maxlength-only),
    // otherwise we can end up filling the Lyrics textarea and wasting credits.
    // Prefer selecting the input inside the "Styles" section and exclude parent panels that also contain "Lyrics".
    // NOTE: avoid `:not(:has-text("Lyrics"))` here because style prompts often contain the word "lyrics",
    // which would exclude the correct input. Also, Suno sometimes nests Lyrics+Styles under the same parent.
    STYLE_INPUT: 'textarea:below(:text-is("Styles")):above(:text-is("Advanced Options")):visible, [contenteditable]:below(:text-is("Styles")):above(:text-is("Advanced Options")):visible, [role="textbox"]:below(:text-is("Styles")):above(:text-is("Advanced Options")):visible, textarea:below(:text-is("Styles")):visible, [contenteditable]:below(:text-is("Styles")):visible, [role="textbox"]:below(:text-is("Styles")):visible, section:has(h2:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) textarea:visible, section:has(h3:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) textarea:visible, div:has(h2:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) textarea:visible, div:has(h3:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) textarea:visible, section:has(h2:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) [contenteditable]:visible, section:has(h3:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) [contenteditable]:visible, div:has(h2:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) [contenteditable]:visible, div:has(h3:has-text("Styles")):not(:has(h2:has-text("Lyrics"))):not(:has(h3:has-text("Lyrics"))) [contenteditable]:visible, [role="textbox"][aria-label*="style" i]:visible, [contenteditable][aria-label*="style" i]:visible, textarea[placeholder*="style" i]:visible, textarea[placeholder*="bass" i]:visible, textarea[placeholder*="hip-hop" i]:visible, textarea[placeholder*="r&b" i]:visible',
    TITLE_INPUT: 'input[placeholder="Song Title (Optional)"]:visible, input[placeholder*="Song Title" i]:visible, input[aria-label*="Song Title" i]:visible, input[placeholder*="Title" i]:visible, input[aria-label*="Title" i]:visible',

    // Style in Advanced Options (fallback/secondary)
    ADVANCED_STYLE_INPUT: 'input[placeholder*="style"], input[placeholder*="Style"], .advanced-options-panel input',

    // Advanced Options section
    // Button or link to expand advanced options
    ADVANCED_OPTIONS_BUTTON: 'button:has-text("Advanced"), button:has(svg path[d*="m12 12.604"]), [data-testid="advanced-options"], .advanced-options-toggle, button:has-text("Options")',
    ADVANCED_OPTIONS_PANEL: '.advanced-options-panel, [data-expanded="true"]',

    // Vocal Gender selection
    VOCAL_MALE: 'button:has(span:text-is("Male")), button:has-text("Male"), [data-testid="vocal-male"]',
    VOCAL_FEMALE: 'button:has(span:text-is("Female")), button:has-text("Female"), [data-testid="vocal-female"]',

    // Create button
    // New UI uses `aria-label="Create song"` and the page can contain other "Create" buttons/links.
    // Keep the generic text fallback last.
    CREATE_BUTTON: 'button[aria-label="Create song"]:visible, [data-testid="create-button"]:visible, button[type="submit"]:visible, button:has-text("Create"):visible',

    // Song cards - generated songs appear as cards
    // The workspace list uses a specific structure
    SONG_CARD: '[data-testid="song-card"], .song-card-container, article[role="gridcell"]',
    SONG_LINK: 'a[href^="/song/"]', // Link that contains the song ID
    SONG_DURATION: '[data-testid="duration"], .duration, time',
    // Regex to match duration format like "3:07" or "2:45"
    DURATION_REGEX: /\d{1,2}:\d{2}/,

    // Download menu
    // Three-dot menu on song card (Wait for it on the specific song card)
    SONG_MENU_BUTTON: 'button[data-context-menu-trigger="true"]:has(path[d^="M6 14"]), button[aria-label*="menu"], button[aria-label*="More"], button[aria-label*="more"], button[aria-label*="Options"], button[aria-label*="options"], button[aria-label*="actions"], button[title*="More"], button[title*="more"], button[aria-haspopup="menu"], [data-testid="more-button"]',
    DOWNLOAD_OPTION: 'button:has-text("Download"), [role="menuitem"]:has-text("Download"), a:has-text("Download"), button:has(path[d^="M12 15.575"]), [data-testid="download-option"]',
    DOWNLOAD_MP3: 'button:has-text("MP3"), button:has-text("Audio"), [role="menuitem"]:has-text("MP3"), [role="menuitem"]:has-text("Audio"), a:has-text("MP3"), a:has-text("Audio"), button:has(path[d^="M9 20"]), [data-testid="mp3-option"]',

    // Credits display
    // Usually shown in header or sidebar
    CREDITS_DISPLAY: '.credits, [data-testid="credits"], .credit-balance, .remaining-credits, [class*="Credits"]',
    CREDITS_NUMBER: '.credits-number, .credit-count, [data-credits]',

    // Loading/Processing indicators
    LOADING_INDICATOR: '.loading, .spinner, [data-loading="true"], .processing',
    GENERATING_INDICATOR: '.generating, [data-status="generating"], .in-progress',

    // Error messages
    ERROR_MESSAGE: '.error, .error-message, [data-error], .alert-error',

    // Login/Auth status
    LOGGED_OUT_INDICATOR: 'button:has-text("Sign in"), button:has-text("Log in"), a:has-text("Sign in")',
    USER_AVATAR: '.user-avatar, .profile-avatar, [data-testid="user-menu"]',

    // CAPTCHA
    CAPTCHA_FRAME: 'iframe[src*="suno.com/captcha"], iframe[src*="captcha.suno.com"], iframe[src*="hcaptcha-assets-prod.suno.com"], iframe[src*="/static/hcaptcha.html"], iframe[src*="hcaptcha.com"], iframe[src*="newassets.hcaptcha.com"], iframe[title*="hCaptcha"], iframe[title*="hcaptcha"], iframe[aria-label*="hCaptcha"], [role="dialog"] iframe[src*="hcaptcha"], [data-state="open"] iframe[src*="hcaptcha"]',
};

// Timeouts for various operations (in milliseconds)
export const TIMEOUTS = {
    // Page load timeout
    PAGE_LOAD: 30000,

    // Wait for element to appear
    ELEMENT_VISIBLE: 10000,

    // Wait for song generation to complete (can take several minutes)
    SONG_GENERATION: 600000, // 10 minutes

    // Wait between checking song status
    POLL_INTERVAL: 5000, // 5 seconds

    // Wait after clicking create
    AFTER_CREATE: 3000,

    // Wait for download to start
    DOWNLOAD_START: 30000, // Increased from 10s to handle slower second song downloads

    // Wait for download to complete
    DOWNLOAD_COMPLETE: 30000,
};

// URLs
export const URLS = {
    CREATE: "https://suno.com/create",
    HOME: "https://suno.com",
    LOGIN: "https://suno.com/signin",
    LIBRARY: "https://suno.com/me",
};
