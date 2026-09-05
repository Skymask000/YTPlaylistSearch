import { test } from "node:test";
import assert from "node:assert/strict";
import { isMobile, detectPlatform, getPlayUrls } from "../src/platform.js";

test("isMobile: uaData.mobile true wins", () => {
  assert.equal(isMobile({ mobile: true }, "Mozilla/5.0 (Windows NT 10.0)"), true);
});

test("isMobile: uaData.mobile false wins", () => {
  assert.equal(isMobile({ mobile: false }, "Mozilla/5.0 (Linux; Android 12; Pixel)"), false);
});

test("isMobile: uaData undefined falls back to UA regex", () => {
  assert.equal(isMobile(undefined, "Mozilla/5.0 (Linux; Android 12; Pixel)"), true);
  assert.equal(isMobile(undefined, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), true);
  assert.equal(isMobile(undefined, "Mozilla/5.0 (Windows NT 10.0)"), false);
});

test("detectPlatform: iOS, Android, desktop", () => {
  assert.equal(detectPlatform({ mobile: true }, "Mozilla/5.0 (iPhone)"), "ios");
  assert.equal(detectPlatform({ mobile: true }, "Mozilla/5.0 (iPad)"), "ios");
  assert.equal(detectPlatform({ mobile: true }, "Mozilla/5.0 (Linux; Android 12)"), "android");
  assert.equal(detectPlatform(undefined, "Mozilla/5.0 (Macintosh)"), "desktop");
});

test("getPlayUrls: playlist context included", () => {
  const { tabUrl, appUrl } = getPlayUrls("vidX", "PLy", "android");
  assert.equal(tabUrl, "https://www.youtube.com/watch?v=vidX&list=PLy");
  assert.equal(appUrl, "vnd.youtube:vidX");
});

test("getPlayUrls: iOS scheme", () => {
  assert.equal(getPlayUrls("vidX", "PLy", "ios").appUrl, "youtube://vidX");
});

test("getPlayUrls: desktop → appUrl null", () => {
  assert.equal(getPlayUrls("vidX", "PLy", "desktop").appUrl, null);
});

test("getPlayUrls: no playlistId → no &list=", () => {
  assert.equal(getPlayUrls("vidX", null, "desktop").tabUrl, "https://www.youtube.com/watch?v=vidX");
  assert.equal(getPlayUrls("vidX", "", "desktop").tabUrl, "https://www.youtube.com/watch?v=vidX");
});
