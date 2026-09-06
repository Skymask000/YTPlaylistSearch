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

function renderFromState(s) {
  renderIdentity(s?.authIdentity);
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

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("sign-in-btn").addEventListener("click", () => onSignIn(false));
  document.getElementById("sign-out-btn").addEventListener("click", onSignOut);
  document.getElementById("add-account-btn").addEventListener("click", () => onSignIn(true));

  chrome.storage.onChanged.addListener(fetchState);
  await fetchState();
});
