const UNAVAILABLE_TITLES = new Set([
  "Private video",
  "Deleted video",
  "[Private video]",
  "[Deleted video]",
]);

export function extractItems(apiResponse) {
  const out = [];
  for (const it of apiResponse?.items ?? []) {
    const sn = it.snippet ?? {};
    if (sn.resourceId?.kind !== "youtube#video") continue;
    const title = sn.title ?? "";
    out.push({
      videoId: sn.resourceId.videoId,
      title,
      channelTitle: sn.videoOwnerChannelTitle ?? "",
      descriptionShort: (sn.description ?? "").slice(0, 500),
      publishedAt: sn.publishedAt ?? "",
      position: sn.position ?? 0,
      unavailable: UNAVAILABLE_TITLES.has(title),
    });
  }
  return out;
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

export async function fetchPlaylistItems(token, playlistId, opts = {}) {
  const { onProgress, fetchImpl = fetch } = opts;
  const all = [];
  let pageToken = null;
  let pagesDone = 0;
  do {
    const url = new URL(API_BASE + "/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error?.message ?? `status_${res.status}`;
      if (res.status === 404) throw new Error(`playlist_not_found: ${msg}`);
      throw new Error(`playlistItems.list failed: ${res.status} ${msg}`);
    }
    const body = await res.json();
    const items = extractItems(body);
    all.push(...items);
    pagesDone += 1;
    onProgress?.({ pagesDone, itemsSoFar: all.length });
    pageToken = body.nextPageToken ?? null;
  } while (pageToken);
  return all;
}

export async function withConcurrency(limit, tasks) {
  const results = new Array(tasks.length);
  let next = 0;
  let firstError = null;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= tasks.length) return;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  if (firstError) throw firstError;
  return results;
}
