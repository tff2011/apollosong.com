import os from "os";
import path from "path";

// Keep DistroKid files outside the repo to avoid broad file tracing in builds.
const DISTROKID_DOWNLOADS_DIR =
    process.env.DISTROKID_TMP_DIR ||
    path.join(os.tmpdir(), "apollosong", "distrokid");

// Persistent browser profile so DistroKid keeps recognizing the same "device".
const DISTROKID_PROFILE_DIR =
    process.env.DISTROKID_PROFILE_DIR ||
    path.join(os.homedir(), ".apollosong", "distrokid-chrome-profile");

export { DISTROKID_DOWNLOADS_DIR, DISTROKID_PROFILE_DIR };
