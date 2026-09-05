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
  return {
    authIdentity: s.authIdentity ?? null,
    playlistIndex: s.playlistIndex ?? null,
    playlistCache: s.playlistCache ?? {},
    uiState: { ...DEFAULT_UI_STATE, ...(s.uiState ?? {}) },
  };
}

async function writeUiState(patch) {
  const current = (await chrome.storage.local.get("uiState")).uiState ?? DEFAULT_UI_STATE;
  const merged = { ...current, ...patch, schemaVersion: 1 };
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
