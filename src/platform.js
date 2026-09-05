const MOBILE_RE = /Mobi|Android|iPhone|iPad|iPod/i;
const IOS_RE = /iPhone|iPad|iPod/i;
const ANDROID_RE = /Android/i;

export function isMobile(uaData, ua) {
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;
  return MOBILE_RE.test(ua ?? "");
}

export function detectPlatform(uaData, ua) {
  if (!isMobile(uaData, ua)) return "desktop";
  if (IOS_RE.test(ua ?? "")) return "ios";
  if (ANDROID_RE.test(ua ?? "")) return "android";
  return "desktop";
}

export function getPlayUrls(videoId, playlistId, platform) {
  let tabUrl = `https://www.youtube.com/watch?v=${videoId}`;
  if (playlistId) tabUrl += `&list=${playlistId}`;
  let appUrl = null;
  if (platform === "android") appUrl = `vnd.youtube:${videoId}`;
  else if (platform === "ios") appUrl = `youtube://${videoId}`;
  return { tabUrl, appUrl };
}
