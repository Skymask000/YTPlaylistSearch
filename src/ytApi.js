import { NotSignedInError, clearAuthToken } from "./auth.js";

const API_BASE = "https://www.googleapis.com/youtube/v3";

async function apiCall(token, method, path, { query = null, fetchImpl = fetch } = {}) {
  const url = new URL(API_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetchImpl(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await clearAuthToken();
    throw new NotSignedInError(json?.error?.message ?? "token revoked");
  }
  return { ok: res.ok, status: res.status, json };
}

export async function getMyChannel(token, opts = {}) {
  const { ok, json } = await apiCall(token, "GET", "/channels", {
    query: { part: "snippet", mine: "true" },
    fetchImpl: opts.fetchImpl,
  });
  if (!ok) throw new Error(json?.error?.message ?? "channels.list failed");
  const item = (json.items ?? [])[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
  };
}

export async function listMyPlaylists(token, opts = {}) {
  const { fetchImpl } = opts;
  const all = [];
  let pageToken = null;
  do {
    const query = { part: "snippet,contentDetails", mine: "true", maxResults: "50" };
    if (pageToken) query.pageToken = pageToken;
    const { ok, json } = await apiCall(token, "GET", "/playlists", { query, fetchImpl });
    if (!ok) throw new Error(`playlists.list failed: ${json?.error?.message ?? ""}`);
    for (const it of json.items ?? []) {
      all.push({
        id: it.id,
        title: it.snippet.title,
        itemCount: it.contentDetails.itemCount,
        thumbnailUrl: it.snippet.thumbnails?.default?.url ?? null,
      });
    }
    pageToken = json.nextPageToken ?? null;
  } while (pageToken);
  return all;
}
