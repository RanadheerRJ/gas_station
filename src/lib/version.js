// Keep the displayed version tied to the release version in package.json.
// Vite bundles JSON imports at build time, so this is also available offline.
import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;
