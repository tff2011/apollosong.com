#!/bin/bash

# Configuration
# Default debugging port
PORT=9222
# User data directory (optional, if you want a specific profile for Suno)
# Leave empty to use your DEFAULT Chrome profile (risky if you close it, better to use a specific one)
# Or set a path like "$HOME/suno-chrome-profile"
USER_DATA_DIR="$HOME/suno-chrome-profile"

echo "🚀 Launching Google Chrome for Suno Automation..."
echo "📍 Debug Port: $PORT"
echo "📂 User Data: $USER_DATA_DIR"

# MacOS path for Google Chrome
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -f "$CHROME_PATH" ]; then
    echo "❌ Google Chrome not found at standard path: $CHROME_PATH"
    echo "Please update the path in this script."
    exit 1
fi

# Create directory if it doesn't exist
mkdir -p "$USER_DATA_DIR"

# Launch Chrome
# --remote-debugging-port=$PORT: Enables CDP
# --no-first-run: Skips First Run Experience
# --no-default-browser-check: Skips default browser check
# --user-data-dir: Uses a separate profile to not interfere with your main browsing
"$CHROME_PATH" \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --autoplay-policy=no-user-gesture-required \
  --start-maximized \
  "https://suno.com/create" &

echo "✅ Chrome launched!"
echo "👉 Please Log In to Suno manually in the opened window."
echo "👉 Once logged in, run your automation with: SUNO_CHROME_CDP_URL=http://127.0.0.1:$PORT npm run ..."
