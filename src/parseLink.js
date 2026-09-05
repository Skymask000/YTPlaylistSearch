const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const VALID_ID = /^[A-Za-z0-9_-]+$/;

export function extractPlaylistId(url) {
  if (typeof url !== "string" || url.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const list = parsed.searchParams.get("list");
  if (!list || !VALID_ID.test(list)) return null;
  return list;
}
