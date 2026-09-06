import { filter } from "./src/searchFilter.js";
import { detectPlatform, getPlayUrls } from "./src/platform.js";

const platform = detectPlatform(navigator.userAgentData, navigator.userAgent);

let state = null;
let lastSubmittedUrl = null;

function currentPlaylistIds(state) {
  const { source, selectedPlaylistId, linkPlaylistId } = state.uiState;
  if (source === "link") {
    // Task 15 persists linkPlaylistId alongside linkUrl when a link playlist loads.
    return linkPlaylistId && state.playlistCache[linkPlaylistId] ? [linkPlaylistId] : [];
  }
  if (selectedPlaylistId === "ALL") {
    // "ALL" means the user's own playlists only — never external link playlists.
    return Object.keys(state.playlistCache).filter((id) => state.playlistCache[id].source === "mine");
  }
  return state.playlistCache[selectedPlaylistId] ? [selectedPlaylistId] : [];
}

function buildFlatWorking(state) {
  const ids = currentPlaylistIds(state);
  const flat = [];
  for (const id of ids) {
    const entry = state.playlistCache[id];
    if (!entry) continue;
    for (const it of entry.items) {
      flat.push({ ...it, playlistId: id, playlistTitle: entry.playlistTitle });
    }
  }
  return flat;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderItemRow(item) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.unavailable ? " unavailable" : "");
  const title = document.createElement("div");
  title.className = "item-title";
  title.innerHTML = `<span title="${escapeHtml(item.title)}">${escapeHtml(item.title || "(no title)")}</span> <small>— ${escapeHtml(item.channelTitle || "")}</small>`;
  row.appendChild(title);
  const actions = document.createElement("div");
  actions.className = "item-actions";
  if (!item.unavailable) {
    const { tabUrl, appUrl } = getPlayUrls(item.videoId, item.playlistId, platform);
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.textContent = platform === "desktop" ? "▶ Play" : "▶ Tab";
    tabBtn.title = "Open in a new browser tab";
    tabBtn.addEventListener("click", () => chrome.tabs.create({ url: tabUrl, active: true }));
    actions.appendChild(tabBtn);
    if (appUrl) {
      const appBtn = document.createElement("button");
      appBtn.type = "button";
      appBtn.textContent = "📱 App";
      appBtn.title = "Open in the YouTube app";
      appBtn.addEventListener("click", () => chrome.tabs.create({ url: appUrl, active: true }));
      actions.appendChild(appBtn);
    }
  } else {
    const disabled = document.createElement("span");
    disabled.textContent = "Unavailable";
    disabled.style.color = "var(--muted)";
    actions.appendChild(disabled);
  }
  row.appendChild(actions);
  return row;
}

function renderResults(s) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  if (!s?.authIdentity) return;
  const working = buildFlatWorking(s);
  const matched = filter(working, s.uiState.query ?? "", s.uiState.scopes);

  // Group by playlistId, preserving playlistIndex order (or link-source order otherwise)
  const orderIds = s.playlistIndex?.items?.map((p) => p.id) ?? [];
  const groupsMap = new Map();
  for (const it of matched) {
    if (!groupsMap.has(it.playlistId)) groupsMap.set(it.playlistId, []);
    groupsMap.get(it.playlistId).push(it);
  }
  // Emit in orderIds order first, then any leftover (link playlists).
  const emitted = new Set();
  const emitOne = (playlistId) => {
    const bucket = groupsMap.get(playlistId);
    if (!bucket) return;
    emitted.add(playlistId);
    const entry = s.playlistCache[playlistId];
    const totalInPlaylist = entry?.items?.length ?? 0;
    const expanded = s.uiState.expandedGroups?.[playlistId] !== false; // default expanded
    const group = document.createElement("div");
    group.className = "playlist-group";
    const header = document.createElement("div");
    header.className = "playlist-group-header";
    header.innerHTML = `<span class="caret">${expanded ? "▼" : "▶"}</span> ${escapeHtml(entry?.playlistTitle || (entry?.source === "link" ? "External playlist" : playlistId))} (${bucket.length} shown / ${totalInPlaylist})`;
    header.addEventListener("click", () => toggleGroup(playlistId));
    group.appendChild(header);
    if (expanded) {
      const body = document.createElement("div");
      body.className = "playlist-group-body";
      for (const it of bucket) body.appendChild(renderItemRow(it));
      group.appendChild(body);
    }
    container.appendChild(group);
  };
  for (const id of orderIds) emitOne(id);
  for (const id of groupsMap.keys()) if (!emitted.has(id)) emitOne(id);
}

async function toggleGroup(playlistId) {
  const cur = state.uiState.expandedGroups ?? {};
  const nextExpanded = !(cur[playlistId] !== false);
  await chrome.runtime.sendMessage({
    action: "setUiState",
    patch: { expandedGroups: { ...cur, [playlistId]: nextExpanded } },
  });
}

let filterDebounce = null;
function onFilterInput(value) {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(async () => {
    await chrome.runtime.sendMessage({ action: "setUiState", patch: { query: value } });
  }, 120);
}

async function onScopeChange() {
  const scopes = {
    song: document.getElementById("scope-song").checked,
    channel: document.getElementById("scope-channel").checked,
    description: document.getElementById("scope-description").checked,
    playlist: document.getElementById("scope-playlist").checked,
  };
  await chrome.runtime.sendMessage({ action: "setUiState", patch: { scopes } });
}

function setStatus(text, isError = false) {
  const el = document.getElementById("status-line");
  el.textContent = text ?? "";
  el.classList.toggle("error", isError);
}

async function fetchState() {
  state = await chrome.runtime.sendMessage({ action: "getState" });
  renderFromState(state);
}

function renderIdentity(identity) {
  const strip = document.getElementById("identity-strip");
  const avatar = document.getElementById("identity-avatar");
  const name = document.getElementById("identity-name");
  const signIn = document.getElementById("sign-in-btn");
  const signOut = document.getElementById("sign-out-btn");
  const addAcc = document.getElementById("add-account-btn");
  const cta = document.getElementById("signed-out-cta");

  if (identity && identity.title) {
    name.textContent = identity.title;
    if (identity.thumbnailUrl) {
      avatar.src = identity.thumbnailUrl;
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
    }
    signIn.hidden = true;
    cta.hidden = true;
    signOut.hidden = false;
    addAcc.hidden = false;
  } else {
    name.textContent = "";
    avatar.hidden = true;
    signOut.hidden = true;
    addAcc.hidden = true;
    signIn.hidden = false;
    cta.hidden = false;
  }
}

async function onSignIn(switchAccount) {
  setStatus("Signing in…");
  const res = await chrome.runtime.sendMessage({ action: "signIn", switchAccount });
  if (res?.error) {
    setStatus(`Sign-in failed: ${res.error}`, true);
  } else {
    setStatus(`Signed in as ${res.identity?.title ?? "(unknown)"}.`);
    // The popup may already be open when a (new or switched) identity signs in,
    // so the startup one-shot index fetch never runs for this session — fetch
    // it here instead, for both the normal and switchAccount paths.
    setStatus("Loading your playlists…");
    await chrome.runtime.sendMessage({ action: "refreshPlaylistIndex" });
    setStatus("");
  }
  await fetchState();
}

async function onSignOut() {
  setStatus("Signing out…");
  await chrome.runtime.sendMessage({ action: "signOut" });
  setStatus("Signed out.");
  await fetchState();
}

function humanAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function renderSourceAreas(uiState) {
  const isMine = uiState.source === "mine";
  document.getElementById("source-mine").checked = isMine;
  document.getElementById("source-link").checked = !isMine;
  document.getElementById("mine-area").hidden = !isMine;
  document.getElementById("link-area").hidden = isMine;
  const linkInput = document.getElementById("link-input");
  // Don't clobber what the user is actively typing — renderFromState runs on every
  // storage change, which can land mid-keystroke.
  if (document.activeElement !== linkInput) linkInput.value = uiState.linkUrl ?? "";
}

function renderPlaylistSelect(playlistIndex, selectedId) {
  const sel = document.getElementById("playlist-select");
  const items = playlistIndex?.items ?? [];
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title));
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "ALL";
  all.textContent = "Search All Playlists";
  sel.appendChild(all);
  for (const p of sorted) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.title;
    sel.appendChild(opt);
  }
  sel.value = selectedId ?? "ALL";
}

function renderFreshness(uiState, playlistCache) {
  const el = document.getElementById("last-refreshed");
  const id = uiState.selectedPlaylistId;
  if (!id) { el.textContent = ""; return; }
  if (id === "ALL") {
    const times = Object.values(playlistCache ?? {}).map((e) => e.fetchedAt).filter(Boolean);
    if (times.length === 0) { el.textContent = "Not loaded yet"; el.title = ""; return; }
    // The figure shown is the STALEST of the cached playlists — the conservative
    // answer to "how out of date might this be?". The label stays plain and the
    // precision lives in the tooltip, rather than a cryptic "Oldest:" prefix.
    el.textContent = `Refreshed ${humanAgo(Math.min(...times))}`;
    el.title = `Oldest of ${times.length} cached playlist${times.length === 1 ? "" : "s"}`
      + `; newest ${humanAgo(Math.max(...times))}`;
  } else {
    const entry = playlistCache?.[id];
    el.textContent = entry ? `Refreshed ${humanAgo(entry.fetchedAt)}` : "Not loaded yet";
    el.title = entry ? "This playlist was last fetched from YouTube then" : "";
  }
}

function renderProgress(loadProgress) {
  const container = document.getElementById("progress-container");
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");
  if (!loadProgress?.active && !(loadProgress?.total > 0 && loadProgress.done === loadProgress.total)) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const pct = loadProgress.total > 0 ? Math.round((loadProgress.done / loadProgress.total) * 100) : 0;
  fill.style.width = `${pct}%`;
  // Colour is meaningful here: blue while working, green once finished, red only
  // when the load actually failed. Progress is never red.
  const failed = Boolean(loadProgress.error);
  fill.classList.toggle("failed", failed);
  fill.classList.toggle("complete", !failed && !loadProgress.active);
  text.textContent = loadProgress.active
    ? `Loading ${loadProgress.done}/${loadProgress.total}${loadProgress.currentTitle ? `: ${loadProgress.currentTitle}` : ""}`
    : failed
      ? `Stopped after ${loadProgress.done}/${loadProgress.total}.`
      : `Loaded ${loadProgress.done}/${loadProgress.total}.`;
}

const FONT_MIN = 11;
const FONT_MAX = 18;
const FONT_DEFAULT = 13;

function renderFontScale(uiState) {
  const raw = Number(uiState?.fontScale);
  const scale = Number.isFinite(raw) ? Math.min(FONT_MAX, Math.max(FONT_MIN, raw)) : FONT_DEFAULT;
  document.documentElement.style.setProperty("--base", `${scale}px`);
  document.getElementById("font-smaller").disabled = scale <= FONT_MIN;
  document.getElementById("font-larger").disabled = scale >= FONT_MAX;
}

async function onFontStep(delta) {
  const cur = Number(state?.uiState?.fontScale) || FONT_DEFAULT;
  const next = Math.min(FONT_MAX, Math.max(FONT_MIN, cur + delta));
  if (next === cur) return;
  await chrome.runtime.sendMessage({ action: "setUiState", patch: { fontScale: next } });
}

const WIDTH_MIN = 360;
const WIDTH_MAX = 780;
const WIDTH_DEFAULT = 520;
let lastPersistedWidth = null;
let widthPersistTimer = null;

// Applied ONCE at startup, not from renderFromState. Persisting a drag writes
// storage, which fires onChanged, which re-renders — re-applying the width there
// would fight the user mid-drag.
function initPopupWidth(uiState) {
  const app = document.getElementById("app");
  if (!app) return;
  const raw = Number(uiState?.popupWidth);
  const w = Number.isFinite(raw)
    ? Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, raw))
    : WIDTH_DEFAULT;
  app.style.width = `${w}px`;
  lastPersistedWidth = w;

  if (typeof ResizeObserver === "undefined") return;
  new ResizeObserver(() => {
    clearTimeout(widthPersistTimer);
    widthPersistTimer = setTimeout(async () => {
      const next = Math.round(app.getBoundingClientRect?.().width ?? 0);
      if (!next || next === lastPersistedWidth) return;
      lastPersistedWidth = next;
      await chrome.runtime.sendMessage({ action: "setUiState", patch: { popupWidth: next } });
    }, 300); // debounce: a drag fires this continuously
  }).observe(app);
}

function renderFromState(s) {
  // Runs before the signed-out early return: text size is a display preference,
  // so it must apply to the sign-in screen too.
  renderFontScale(s?.uiState);
  renderIdentity(s?.authIdentity);
  if (!s?.authIdentity) {
    document.getElementById("source-fieldset").hidden = true;
    document.getElementById("mine-area").hidden = true;
    document.getElementById("link-area").hidden = true;
    document.getElementById("scope-fieldset").hidden = true;
    document.getElementById("filter-input").hidden = true;
    document.getElementById("results").innerHTML = "";
    return;
  }
  document.getElementById("source-fieldset").hidden = false;
  document.getElementById("scope-fieldset").hidden = false;
  document.getElementById("filter-input").hidden = false;
  renderSourceAreas(s.uiState);
  renderPlaylistSelect(s.playlistIndex, s.uiState.selectedPlaylistId);
  renderFreshness(s.uiState, s.playlistCache);
  renderProgress(s.loadProgress);
  // Restore inputs from persisted state (but don't clobber if user is typing).
  const filterEl = document.getElementById("filter-input");
  if (document.activeElement !== filterEl) filterEl.value = s.uiState.query ?? "";
  document.getElementById("scope-song").checked = !!s.uiState.scopes.song;
  document.getElementById("scope-channel").checked = !!s.uiState.scopes.channel;
  document.getElementById("scope-description").checked = !!s.uiState.scopes.description;
  document.getElementById("scope-playlist").checked = !!s.uiState.scopes.playlist;
  renderResults(s);
}

async function onSourceChange(newSource) {
  await chrome.runtime.sendMessage({ action: "setUiState", patch: { source: newSource } });
  // fetchState will fire via onChanged.
}

async function onSelectChange(playlistId) {
  await chrome.runtime.sendMessage({ action: "setUiState", patch: { selectedPlaylistId: playlistId } });
  if (playlistId === "ALL") {
    setStatus("Loading all playlists…");
    const res = await chrome.runtime.sendMessage({ action: "loadAllPlaylists" });
    if (res?.error === "not_signed_in") setStatus("You're signed out — sign in again to load playlists.", true);
    else if (res?.error) setStatus(`Load failed: ${res.error}`, true);
    else setStatus("");
  } else {
    setStatus("Loading playlist…");
    const res = await chrome.runtime.sendMessage({ action: "loadPlaylist", playlistId });
    if (res?.error === "not_signed_in") setStatus("You're signed out — sign in again to load playlists.", true);
    else if (res?.error) setStatus(`Load failed: ${res.error}`, true);
    else setStatus(res.fromCache ? "" : `Loaded ${res.count} items.`);
  }
}

async function onRefreshClick() {
  const id = state?.uiState?.selectedPlaylistId ?? "ALL";
  setStatus("Refreshing…");
  const action = id === "ALL" ? "loadAllPlaylists" : "loadPlaylist";
  const payload = id === "ALL" ? { action, force: true } : { action, playlistId: id, force: true };
  const res = await chrome.runtime.sendMessage(payload);
  if (res?.error === "not_signed_in") setStatus("You're signed out — sign in again to load playlists.", true);
  else if (res?.error) setStatus(`Refresh failed: ${res.error}`, true);
  else setStatus("Refreshed.");
}

async function onLinkSubmit() {
  const url = document.getElementById("link-input").value.trim();
  // Enter and blur both call this, so clicking away after pressing Enter would
  // otherwise refire the same load. Also stops an unchanged blur from refetching.
  if (!url || url === lastSubmittedUrl) return;
  lastSubmittedUrl = url;
  setStatus("Loading external playlist…");
  const res = await chrome.runtime.sendMessage({ action: "loadLinkPlaylist", url });
  if (res?.error === "invalid_url") {
    lastSubmittedUrl = null;
    setStatus("Invalid YouTube URL — no playlist ID found.", true);
  } else if (res?.error === "playlist_not_found") {
    lastSubmittedUrl = null;
    setStatus("Playlist not found (private or removed).", true);
  } else if (res?.error === "not_signed_in") {
    lastSubmittedUrl = null;
    setStatus("You're signed out — sign in again to load playlists.", true);
  } else if (res?.error) {
    lastSubmittedUrl = null;
    setStatus(`Load failed: ${res.error}`, true);
  } else {
    setStatus(`Loaded ${res.count} items.`);
  }
  // Persist the URL and the resolved playlist ID together, so Task 16 can select
  // the active link playlist by ID directly instead of string-matching the URL.
  await chrome.runtime.sendMessage({
    action: "setUiState",
    patch: { linkUrl: url, linkPlaylistId: res?.playlistId ?? "" },
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("sign-in-btn").addEventListener("click", () => onSignIn(false));
  document.getElementById("sign-out-btn").addEventListener("click", onSignOut);
  document.getElementById("add-account-btn").addEventListener("click", () => onSignIn(true));

  document.getElementById("source-mine").addEventListener("change", () => onSourceChange("mine"));
  document.getElementById("source-link").addEventListener("change", () => onSourceChange("link"));
  document.getElementById("playlist-select").addEventListener("change", (e) => onSelectChange(e.target.value));
  document.getElementById("refresh-btn").addEventListener("click", onRefreshClick);

  const linkInput = document.getElementById("link-input");
  linkInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onLinkSubmit(); } });
  linkInput.addEventListener("blur", onLinkSubmit);

  document.getElementById("filter-input").addEventListener("input", (e) => onFilterInput(e.target.value));
  document.getElementById("font-smaller").addEventListener("click", () => onFontStep(-1));
  document.getElementById("font-larger").addEventListener("click", () => onFontStep(+1));
  document.getElementById("scope-song").addEventListener("change", onScopeChange);
  document.getElementById("scope-channel").addEventListener("change", onScopeChange);
  document.getElementById("scope-description").addEventListener("change", onScopeChange);
  document.getElementById("scope-playlist").addEventListener("change", onScopeChange);

  chrome.storage.onChanged.addListener(fetchState);
  await fetchState();
  initPopupWidth(state?.uiState);   // once, after state is known

  // Auto-refresh playlist index on first sign-in if missing.
  if (state?.authIdentity && !state?.playlistIndex) {
    setStatus("Loading your playlists…");
    await chrome.runtime.sendMessage({ action: "refreshPlaylistIndex" });
    setStatus("");
  }
});
