import { test } from "node:test";
import assert from "node:assert/strict";

// Stub globalThis.chrome BEFORE importing ytApi/auth, so `clearAuthToken`'s
// call to chrome.storage.local.remove is observable. auth.js touches `chrome`
// only inside functions, so import order after this assignment is safe.
globalThis.chrome = {
  storage: {
    local: {
      removed: [],
      remove(key) { this.removed.push(key); return Promise.resolve(); },
    },
  },
};

const { listMyPlaylists, getMyChannel } = await import("../src/ytApi.js");
const { NotSignedInError } = await import("../src/auth.js");

function stubFetch(responses) {
  let calls = 0;
  const impl = async () => {
    const r = responses[calls++];
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body ?? {} };
  };
  impl.calls = () => calls;
  return impl;
}

test("listMyPlaylists: paginates and includes thumbnailUrl", async () => {
  const fetchImpl = stubFetch([
    { body: {
        nextPageToken: "T2",
        items: [{ id: "PL1", snippet: { title: "One", thumbnails: { default: { url: "u1" } } }, contentDetails: { itemCount: 10 } }],
    } },
    { body: {
        items: [{ id: "PL2", snippet: { title: "Two", thumbnails: { default: { url: "u2" } } }, contentDetails: { itemCount: 20 } }],
    } },
  ]);
  const out = await listMyPlaylists("tok", { fetchImpl });
  assert.deepEqual(out, [
    { id: "PL1", title: "One", itemCount: 10, thumbnailUrl: "u1" },
    { id: "PL2", title: "Two", itemCount: 20, thumbnailUrl: "u2" },
  ]);
  assert.equal(fetchImpl.calls(), 2);
});

test("listMyPlaylists: 401 clears token and throws NotSignedInError", async () => {
  chrome.storage.local.removed = [];
  const fetchImpl = stubFetch([{ ok: false, status: 401, body: { error: { message: "Invalid Credentials" } } }]);
  await assert.rejects(
    () => listMyPlaylists("tok", { fetchImpl }),
    (err) => err instanceof NotSignedInError,
  );
  assert.deepEqual(chrome.storage.local.removed, ["authToken"]);
});

test("getMyChannel: returns normalized channel, or null when empty", async () => {
  const withOne = stubFetch([{ body: { items: [{ id: "UCabc", snippet: { title: "MyChan", thumbnails: { default: { url: "avatar" } } } }] } }]);
  assert.deepEqual(await getMyChannel("tok", { fetchImpl: withOne }), {
    id: "UCabc", title: "MyChan", thumbnailUrl: "avatar",
  });
  const empty = stubFetch([{ body: { items: [] } }]);
  assert.equal(await getMyChannel("tok", { fetchImpl: empty }), null);
});
