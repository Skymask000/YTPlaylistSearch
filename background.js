import { getAuthToken, clearAuthToken, NotSignedInError } from "./src/auth.js";
import { getMyChannel, listMyPlaylists } from "./src/ytApi.js";
import { fetchPlaylistItems, withConcurrency } from "./src/ytPlaylistItems.js";
import { extractPlaylistId } from "./src/parseLink.js";

const DEFAULT_UI_STATE = {
  schemaVersion: 1,
  source: "mine",
  selectedPlaylistId: "ALL",
  linkUrl: "",
  linkPlaylistId: "",
  query: "",
  scopes: { song: true, channel: false, description: false, playlist: false },
  expandedGroups: {},
  fontScale: 13, // px; drives --base in popup.css. Clamped 11-18 by the popup.
};

// All playlistCache read-modify-writes funnel through this chain. Each mutator
// re-reads storage at the moment it runs, so a write that lands during another
// handler's await can't be clobbered by a stale snapshot. A later task runs five
// fetches concurrently and depends on this.
let cacheWriteChain = Promise.resolve();

// Bumped by handleSignOut and by handleSignIn's switchAccount path — the two
// places that invalidate the current playlist cache. Callers capture the
// generation in effect when their handler started, so a write queued by a
// superseded session (signed out / switched mid-flight) can be dropped instead
// of resurrecting that session's data into the next one.
let cacheGeneration = 0;

function updatePlaylistCache(mutate, generation) {
  const run = cacheWriteChain.then(async () => {
    // A sign-out or account switch bumps cacheGeneration; writes queued by the
    // superseded session must not resurrect its data.
    if (generation !== cacheGeneration) return;
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
    "loadProgress",
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
    loadProgress: s.loadProgress ?? { active: false, done: 0, total: 0 },
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
    if (switchAccount) {
      // A new identity is now established: the previous account's playlist
      // library must not remain visible/searchable under it.
      cacheGeneration += 1;
      await chrome.storage.local.remove(["playlistIndex", "playlistCache"]);
    }
    return { ok: true, identity };
  } catch (err) {
    if (err instanceof NotSignedInError) return { error: err.message };
    throw err;
  }
}

async function handleSignOut() {
  cacheGeneration += 1;
  await clearAuthToken();
  await chrome.storage.local.remove(["authIdentity", "playlistIndex", "playlistCache"]);
  return { ok: true };
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
  const gen = cacheGeneration;
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
    await updatePlaylistCache((cur) => ({ ...cur, [playlistId]: entry }), gen);
    return { ok: true, fromCache: false, count: items.length };
  } catch (err) {
    if (err instanceof NotSignedInError) return { error: "not_signed_in" };
    throw err;
  }
}

async function handleLoadAllPlaylists(force) {
  const gen = cacheGeneration;
  const state = await chrome.storage.local.get(["playlistIndex", "playlistCache"]);
  const idx = state.playlistIndex?.items;
  if (!idx || idx.length === 0) return { error: "no_playlist_index" };
  const cache = state.playlistCache ?? {};
  let done = 0;
  let total = 0;
  try {
    const token = await getAuthToken({ interactive: false });
    // Custom loop instead of using fetchAllMyPlaylists's aggregate return, so we
    // can persist each playlist to storage AS it arrives (better UX).
    const targets = force ? idx : idx.filter((p) => !(p.id in cache));
    total = targets.length;
    if (total === 0) {
      await chrome.storage.local.set({ loadProgress: { active: false, done: 0, total: 0 } });
      return { ok: true, addedCount: 0 };
    }
    await chrome.storage.local.set({ loadProgress: { active: true, done: 0, total, currentTitle: "" } });

    const tasks = targets.map((p) => async () => {
      // Session ended (sign-out / account switch) while this task was still
      // queued: no point spending an API call on a playlist nobody can see.
      if (cacheGeneration !== gen) return;
      const items = await fetchPlaylistItems(token, p.id);
      await updatePlaylistCache((cur) => ({
        ...cur,
        [p.id]: {
          fetchedAt: Date.now(),
          playlistId: p.id,
          playlistTitle: p.title,
          source: "mine",
          items,
        },
      }), gen);
      done += 1;
      await chrome.storage.local.set({
        loadProgress: { active: done < total, done, total, currentTitle: p.title },
      });
    });
    await withConcurrency(5, tasks);
    // Authoritative terminal state: per-worker progress writes can land out of order,
    // so the last one to arrive isn't necessarily the one with the highest `done`.
    await chrome.storage.local.set({
      loadProgress: { active: false, done: total, total, currentTitle: "" },
    });
    return { ok: true, addedCount: total };
  } catch (err) {
    await chrome.storage.local.set({
      // Report real counts: playlists fetched before the failure are already cached
      // and searchable, so `0/0` would tell the user nothing loaded when most did.
      loadProgress: { active: false, done, total, currentTitle: "", error: String(err?.message ?? err) },
    });
    if (err instanceof NotSignedInError) return { error: "not_signed_in" };
    throw err;
  }
}

async function handleLoadLinkPlaylist(url) {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) return { error: "invalid_url" };
  const gen = cacheGeneration;
  try {
    const token = await getAuthToken({ interactive: false });
    const items = await fetchPlaylistItems(token, playlistId);
    await updatePlaylistCache((cur) => ({
      ...cur,
      [playlistId]: {
        fetchedAt: Date.now(),
        playlistId,
        playlistTitle: "",
        source: "link",
        items,
      },
    }), gen);
    return { ok: true, playlistId, count: items.length };
  } catch (err) {
    if (err instanceof NotSignedInError) return { error: "not_signed_in" };
    if (err?.message?.startsWith("playlist_not_found")) return { error: "playlist_not_found" };
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
    case "refreshPlaylistIndex":
      return await handleRefreshPlaylistIndex();
    case "loadPlaylist":
      return await handleLoadPlaylist(msg.playlistId, msg.force === true);
    case "loadAllPlaylists":
      return await handleLoadAllPlaylists(msg.force === true);
    case "loadLinkPlaylist":
      return await handleLoadLinkPlaylist(msg.url);
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
