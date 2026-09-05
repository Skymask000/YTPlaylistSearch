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
