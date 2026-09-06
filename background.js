import { getAuthToken, clearAuthToken, NotSignedInError } from "./src/auth.js";
import { getMyChannel, listMyPlaylists } from "./src/ytApi.js";
import { fetchPlaylistItems } from "./src/ytPlaylistItems.js";

const DEFAULT_UI_STATE = {
  schemaVersion: 1,
  source: "mine",
  selectedPlaylistId: "ALL",
  linkUrl: "",
  linkPlaylistId: "",
  query: "",
  scopes: { song: true, channel: false, description: false, playlist: false },
  expandedGroups: {},
};

// All playlistCache read-modify-writes funnel through this chain. Each mutator
// re-reads storage at the moment it runs, so a write that lands during another
// handler's await can't be clobbered by a stale snapshot. A later task runs five
// fetches concurrently and depends on this.
let cacheWriteChain = Promise.resolve();

function updatePlaylistCache(mutate) {
  const run = cacheWriteChain.then(async () => {
    const cur = (await chrome.storage.local.get("playlistCache")).playlistCache ?? {};
    await chrome.storage.local.set({ playlistCache: mutate(cur) });
  });
  // Park a SETTLED copy on the chain so one failed write can't poison later ones.
  // `run` is returned unchanged, so this call's caller still sees its own rejection.
  cacheWriteChain = run.catch(() => {});
  return run;
}

async function readAll() {
  const s = await chrome.storage.local.get([
    "authIdentity",
    "playlistIndex",
    "playlistCache",
    "uiState",
  ]);
  const uiState = { ...DEFAULT_UI_STATE, ...(s.uiState ?? {}) };
  // `scopes` is a fixed 4-key shape. Backfill it explicitly so uiState written
  // before this fix (or otherwise missing keys) self-heals on read instead of
  // silently hiding search-scope checkboxes.
  uiState.scopes = { ...DEFAULT_UI_STATE.scopes, ...(s.uiState?.scopes ?? {}) };
  // expandedGroups is NOT backfilled the same way: its keys are dynamic playlist
  // IDs, not a fixed shape, so replace-semantics (via the spread above) is
  // correct there -- merging would make an entry impossible to ever remove.
  return {
    authIdentity: s.authIdentity ?? null,
    playlistIndex: s.playlistIndex ?? null,
    playlistCache: s.playlistCache ?? {},
    uiState,
  };
}

async function writeUiState(patch) {
  const current = (await chrome.storage.local.get("uiState")).uiState ?? DEFAULT_UI_STATE;
  const merged = { ...current, ...patch, schemaVersion: 1 };
  // `scopes` is a fixed 4-key shape. Merge it key-by-key so a partial patch
  // (e.g. a single checkbox toggle) cannot drop the keys it didn't mention,
  // and backfill from defaults so older or corrupted stored state self-heals.
  merged.scopes = { ...DEFAULT_UI_STATE.scopes, ...current.scopes, ...(patch.scopes ?? {}) };
  // expandedGroups is NOT merged the same way: its keys are dynamic playlist IDs,
  // so deep-merging would make entries impossible to ever remove. Replace-semantics
  // (via the spread above) is correct there.
  await chrome.storage.local.set({ uiState: merged });
  return merged;
}

async function handleSignIn(switchAccount) {
  try {
    const token = await getAuthToken({ interactive: true, switchAccount });
    const identity = await getMyChannel(token);
    await chrome.storage.local.set({ authIdentity: identity });
    return { ok: true, identity };
  } catch (err) {
    if (err instanceof NotSignedInError) return { error: err.message };
    throw err;
  }
}

async function handleSignOut() {
  await clearAuthToken();
  await chrome.storage.local.remove(["authIdentity", "playlistIndex", "playlistCache"]);
  return { ok: true };
}

async function handleRefreshIdentity() {
  try {
    const token = await getAuthToken({ interactive: false });
    const identity = await getMyChannel(token);
    await chrome.storage.local.set({ authIdentity: identity });
    return { ok: true, identity };
  } catch (err) {
    if (err instanceof NotSignedInError) return { ok: false, identity: null };
    throw err;
  }
}

async function handleRefreshPlaylistIndex() {
  try {
    const token = await getAuthToken({ interactive: false });
    const items = await listMyPlaylists(token);
    const playlistIndex = { schemaVersion: 1, fetchedAt: Date.now(), items };
    await chrome.storage.local.set({ playlistIndex });
    return { ok: true, playlistIndex };
  } catch (err) {
    if (err instanceof NotSignedInError) return { error: "not_signed_in" };
    throw err;
  }
}

async function handleLoadPlaylist(playlistId, force) {
  if (!playlistId) return { error: "missing_playlistId" };
  const state = await chrome.storage.local.get(["playlistCache", "playlistIndex"]);
  const cache = state.playlistCache ?? {};
  if (!force && cache[playlistId]) return { ok: true, fromCache: true };
  try {
    const token = await getAuthToken({ interactive: false });
    const items = await fetchPlaylistItems(token, playlistId);
    const idx = state.playlistIndex?.items ?? [];
    const meta = idx.find((p) => p.id === playlistId);
    const entry = {
      fetchedAt: Date.now(),
      playlistId,
      playlistTitle: meta?.title ?? "",
      source: "mine",
      items,
    };
    await updatePlaylistCache((cur) => ({ ...cur, [playlistId]: entry }));
    return { ok: true, fromCache: false, count: items.length };
  } catch (err) {
    if (err instanceof NotSignedInError) return { error: "not_signed_in" };
    throw err;
  }
}

async function handleMessage(msg) {
  switch (msg?.action) {
    case "getState":
      return await readAll();
    case "setUiState":
      await writeUiState(msg.patch ?? {});
      return { ok: true };
    case "signIn":
      return await handleSignIn(msg.switchAccount === true);
    case "signOut":
      return await handleSignOut();
    case "refreshIdentity":
      return await handleRefreshIdentity();
    case "refreshPlaylistIndex":
      return await handleRefreshPlaylistIndex();
    case "loadPlaylist":
      return await handleLoadPlaylist(msg.playlistId, msg.force === true);
    case "loadAllPlaylists":
    case "loadLinkPlaylist":
      return { error: "not_implemented" };
    default:
      return { error: "unknown_action" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ error: String(err?.message ?? err) }));
  return true; // keep the channel open for the async response
});
