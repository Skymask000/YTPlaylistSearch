import { test } from "node:test";
import assert from "node:assert/strict";
import { extractItems } from "../src/ytPlaylistItems.js";

const NORMAL_RESPONSE = {
  items: [
    {
      snippet: {
        title: "Bohemian Rhapsody",
        description: "Official music video for Queen - Bohemian Rhapsody.",
        publishedAt: "2025-01-15T10:00:00Z",
        position: 0,
        videoOwnerChannelTitle: "Queen Official",
        resourceId: { kind: "youtube#video", videoId: "fJ9rUzIMcZQ" },
      },
    },
    {
      snippet: {
        title: "Radio Ga Ga",
        description: "",
        publishedAt: "2025-02-01T10:00:00Z",
        position: 1,
        videoOwnerChannelTitle: "Queen Official",
        resourceId: { kind: "youtube#video", videoId: "azdwsXLmrHE" },
      },
    },
  ],
};

test("extractItems: normalizes typical response", () => {
  const items = extractItems(NORMAL_RESPONSE);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    videoId: "fJ9rUzIMcZQ",
    title: "Bohemian Rhapsody",
    channelTitle: "Queen Official",
    descriptionShort: "Official music video for Queen - Bohemian Rhapsody.",
    publishedAt: "2025-01-15T10:00:00Z",
    position: 0,
    unavailable: false,
  });
});

test("extractItems: descriptionShort truncated to 500 chars", () => {
  const long = "x".repeat(1000);
  const resp = {
    items: [
      {
        snippet: {
          title: "T",
          description: long,
          publishedAt: "2025-01-01T00:00:00Z",
          position: 0,
          videoOwnerChannelTitle: "C",
          resourceId: { kind: "youtube#video", videoId: "v1" },
        },
      },
    ],
  };
  assert.equal(extractItems(resp)[0].descriptionShort.length, 500);
});

test("extractItems: 'Private video' flagged unavailable", () => {
  const resp = {
    items: [
      {
        snippet: {
          title: "Private video",
          description: "",
          publishedAt: "2025-01-01T00:00:00Z",
          position: 5,
          videoOwnerChannelTitle: undefined,
          resourceId: { kind: "youtube#video", videoId: "hidden1" },
        },
      },
      {
        snippet: {
          title: "Deleted video",
          description: "",
          publishedAt: "2025-01-01T00:00:00Z",
          position: 6,
          videoOwnerChannelTitle: undefined,
          resourceId: { kind: "youtube#video", videoId: "hidden2" },
        },
      },
      {
        snippet: {
          title: "[Private video]",
          description: "",
          publishedAt: "2025-01-01T00:00:00Z",
          position: 7,
          videoOwnerChannelTitle: undefined,
          resourceId: { kind: "youtube#video", videoId: "hidden3" },
        },
      },
    ],
  };
  const items = extractItems(resp);
  assert.equal(items.length, 3);
  for (const it of items) assert.equal(it.unavailable, true);
});

test("extractItems: skips non-video resource kinds", () => {
  const resp = {
    items: [
      {
        snippet: {
          title: "Not a video",
          description: "",
          publishedAt: "2025-01-01T00:00:00Z",
          position: 0,
          videoOwnerChannelTitle: "",
          resourceId: { kind: "youtube#playlist", playlistId: "PLxxx" },
        },
      },
    ],
  };
  assert.equal(extractItems(resp).length, 0);
});

test("extractItems: missing channelTitle becomes empty string, not undefined", () => {
  const resp = {
    items: [
      {
        snippet: {
          title: "T",
          description: "",
          publishedAt: "2025-01-01T00:00:00Z",
          position: 0,
          resourceId: { kind: "youtube#video", videoId: "v1" },
        },
      },
    ],
  };
  assert.equal(extractItems(resp)[0].channelTitle, "");
});

test("extractItems: response with no items returns []", () => {
  assert.deepEqual(extractItems({}), []);
  assert.deepEqual(extractItems({ items: [] }), []);
});

import { fetchPlaylistItems, withConcurrency } from "../src/ytPlaylistItems.js";

function stubFetch(responses) {
  let calls = 0;
  const impl = async () => {
    const r = responses[calls++];
    if (!r) throw new Error(`stubFetch: no response for call #${calls}`);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
    };
  };
  impl.calls = () => calls;
  return impl;
}

test("fetchPlaylistItems: paginates via nextPageToken and aggregates", async () => {
  const page1 = {
    body: {
      nextPageToken: "T2",
      items: [
        { snippet: { title: "A", description: "", publishedAt: "2025-01-01T00:00:00Z", position: 0, videoOwnerChannelTitle: "C", resourceId: { kind: "youtube#video", videoId: "v1" } } },
      ],
    },
  };
  const page2 = {
    body: {
      items: [
        { snippet: { title: "B", description: "", publishedAt: "2025-01-01T00:00:00Z", position: 1, videoOwnerChannelTitle: "C", resourceId: { kind: "youtube#video", videoId: "v2" } } },
      ],
    },
  };
  const fetchImpl = stubFetch([page1, page2]);
  const progress = [];
  const items = await fetchPlaylistItems("tok", "PLx", {
    fetchImpl,
    onProgress: (p) => progress.push(p),
  });
  assert.deepEqual(items.map((i) => i.videoId), ["v1", "v2"]);
  assert.equal(fetchImpl.calls(), 2);
  assert.deepEqual(progress, [
    { pagesDone: 1, itemsSoFar: 1 },
    { pagesDone: 2, itemsSoFar: 2 },
  ]);
});

test("fetchPlaylistItems: 404 throws 'playlist_not_found'", async () => {
  const fetchImpl = stubFetch([{ ok: false, status: 404, body: { error: { message: "Playlist not found." } } }]);
  await assert.rejects(
    () => fetchPlaylistItems("tok", "PLdead", { fetchImpl }),
    (err) => err.message.startsWith("playlist_not_found"),
  );
});

test("fetchPlaylistItems: other error status throws generic Error", async () => {
  const fetchImpl = stubFetch([{ ok: false, status: 500, body: { error: { message: "Backend Error" } } }]);
  await assert.rejects(
    () => fetchPlaylistItems("tok", "PLx", { fetchImpl }),
    (err) => !err.message.startsWith("playlist_not_found") && err.message.includes("500"),
  );
});

test("withConcurrency: preserves input order despite parallelism", async () => {
  const delays = [30, 5, 20, 1, 10];
  const tasks = delays.map((ms, i) => () => new Promise((r) => setTimeout(() => r(i), ms)));
  const results = await withConcurrency(2, tasks);
  assert.deepEqual(results, [0, 1, 2, 3, 4]);
});

test("withConcurrency: caps in-flight at limit", async () => {
  let inFlight = 0;
  let peak = 0;
  const tasks = Array.from({ length: 10 }, () => async () => {
    inFlight++;
    if (inFlight > peak) peak = inFlight;
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
    return null;
  });
  await withConcurrency(3, tasks);
  assert.ok(peak <= 3, `peak=${peak}`);
});

test("withConcurrency: a rejecting task propagates without cancelling others", async () => {
  const tasks = [
    () => Promise.resolve("a"),
    () => Promise.reject(new Error("boom")),
    () => Promise.resolve("c"),
  ];
  await assert.rejects(() => withConcurrency(2, tasks), /boom/);
});
