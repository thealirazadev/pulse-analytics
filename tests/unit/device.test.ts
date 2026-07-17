import { describe, expect, it } from "vitest";
import { classifyDevice, isBot, type DeviceClass } from "@/lib/ingest/device";

const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Mobile) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/120 Safari/537.36";

describe("isBot", () => {
  const bots = [
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "facebookexternalhit/1.1",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "AhrefsBot/7.0",
    "",
  ];
  it.each(bots)("flags %s as a bot", (ua) => {
    expect(isBot(ua)).toBe(true);
  });

  const humans = [DESKTOP, MAC, IPHONE, ANDROID_PHONE, IPAD, ANDROID_TABLET];
  it.each(humans)("does not flag %s as a bot", (ua) => {
    expect(isBot(ua)).toBe(false);
  });
});

describe("classifyDevice", () => {
  const cases: Array<[string, DeviceClass]> = [
    [DESKTOP, "desktop"],
    [MAC, "desktop"],
    [IPHONE, "mobile"],
    [ANDROID_PHONE, "mobile"],
    [IPAD, "tablet"],
    [ANDROID_TABLET, "tablet"],
    ["something entirely unrecognizable", "unknown"],
    ["", "unknown"],
  ];
  it.each(cases)("classifies %s", (ua, expected) => {
    expect(classifyDevice(ua)).toBe(expected);
  });
});
