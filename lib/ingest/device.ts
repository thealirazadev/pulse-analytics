/**
 * User-agent classification without a third-party parser. Bots are detected
 * first and dropped by the collect handler; real traffic is bucketed into a
 * coarse device class. Deliberately small and heuristic — good enough for a
 * device breakdown, never a fingerprint.
 */

export type DeviceClass = "desktop" | "mobile" | "tablet" | "unknown";

const BOT_PATTERN =
  /bot|crawl|spider|slurp|mediapartners|feedfetcher|facebookexternalhit|embedly|quora link preview|pinterest|redditbot|applebot|whatsapp|telegram|discord|slackbot|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|headless|phantomjs|puppeteer|playwright|python-requests|scrapy|curl\/|wget\/|axios\/|go-http-client|okhttp|libwww|java\/|node-fetch|http-client|lighthouse|gtmetrix|pingdom|uptimerobot/i;

const TABLET_PATTERN =
  /ipad|playbook|silk|kindle|(android(?!.*mobile))|tablet/i;

const MOBILE_PATTERN =
  /mobile|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|iemobile|webos/i;

const DESKTOP_PATTERN = /windows nt|macintosh|mac os x|cros|x11|linux/i;

/** True for common crawlers, monitors, preview fetchers, and HTTP libraries. */
export function isBot(userAgent: string): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

/** Classify a (non-bot) user agent into a coarse device class. */
export function classifyDevice(userAgent: string): DeviceClass {
  if (!userAgent) return "unknown";
  if (TABLET_PATTERN.test(userAgent)) return "tablet";
  if (MOBILE_PATTERN.test(userAgent)) return "mobile";
  if (DESKTOP_PATTERN.test(userAgent)) return "desktop";
  return "unknown";
}
