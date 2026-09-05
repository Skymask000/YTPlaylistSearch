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

async function handleMessage(msg) {
  switch (msg?.action) {
    case "getState":
      return await readAll();
    case "setUiState":
      await writeUiState(msg.patch ?? {});
      return { ok: true };
    case "signIn":
    case "signOut":
    case "refreshPlaylistIndex":
    case "loadPlaylist":
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
