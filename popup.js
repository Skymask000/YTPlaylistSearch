let state = null;

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
  if (res?.error) setStatus(`Sign-in failed: ${res.error}`, true);
  else setStatus(`Signed in as ${res.identity?.title ?? "(unknown)"}.`);
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
  document.getElementById("link-input").value = uiState.linkUrl ?? "";
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
    if (times.length === 0) { el.textContent = "Not yet loaded."; return; }
    el.textContent = `Oldest refreshed ${humanAgo(Math.min(...times))}`;
  } else {
    const entry = playlistCache?.[id];
    el.textContent = entry ? `Refreshed ${humanAgo(entry.fetchedAt)}` : "Not yet loaded.";
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
  text.textContent = loadProgress.active
    ? `Loading ${loadProgress.done}/${loadProgress.total}${loadProgress.currentTitle ? `: ${loadProgress.currentTitle}` : ""}`
    : `Loaded ${loadProgress.done}/${loadProgress.total}.`;
}

function renderFromState(s) {
  renderIdentity(s?.authIdentity);
  if (!s?.authIdentity) {
    document.getElementById("source-fieldset").hidden = true;
    document.getElementById("mine-area").hidden = true;
    document.getElementById("link-area").hidden = true;
    return;
  }
  document.getElementById("source-fieldset").hidden = false;
  renderSourceAreas(s.uiState);
  renderPlaylistSelect(s.playlistIndex, s.uiState.selectedPlaylistId);
  renderFreshness(s.uiState, s.playlistCache);
  renderProgress(s.loadProgress);
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
  if (!url) return;
  setStatus("Loading external playlist…");
  const res = await chrome.runtime.sendMessage({ action: "loadLinkPlaylist", url });
  if (res?.error === "invalid_url") setStatus("Invalid YouTube URL — no playlist ID found.", true);
  else if (res?.error === "playlist_not_found") setStatus("Playlist not found (private or removed).", true);
  else if (res?.error === "not_signed_in") setStatus("You're signed out — sign in again to load playlists.", true);
  else if (res?.error) setStatus(`Load failed: ${res.error}`, true);
  else setStatus(`Loaded ${res.count} items.`);
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
  document.getElementById("refresh-link").addEventListener("click", onRefreshClick);

  const linkInput = document.getElementById("link-input");
  linkInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onLinkSubmit(); } });
  linkInput.addEventListener("blur", onLinkSubmit);

  chrome.storage.onChanged.addListener(fetchState);
  await fetchState();

  // Auto-refresh playlist index on first sign-in if missing.
  if (state?.authIdentity && !state?.playlistIndex) {
    setStatus("Loading your playlists…");
    await chrome.runtime.sendMessage({ action: "refreshPlaylistIndex" });
    setStatus("");
  }
});
