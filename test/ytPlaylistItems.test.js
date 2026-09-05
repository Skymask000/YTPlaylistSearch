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
