import { test } from "node:test";
import assert from "node:assert/strict";
import { filter } from "../src/searchFilter.js";

function makeItem(overrides = {}) {
  return {
    videoId: "abc",
    title: "",
    channelTitle: "",
    descriptionShort: "",
    publishedAt: "2025-01-01T00:00:00Z",
    position: 0,
    unavailable: false,
    playlistId: "PL1",
    playlistTitle: "",
    ...overrides,
  };
}

const ALL_OFF = { song: false, channel: false, description: false, playlist: false };
const SONG_ONLY = { ...ALL_OFF, song: true };

test("empty query returns all items", () => {
  const items = [makeItem({ title: "A" }), makeItem({ title: "B" })];
  assert.equal(filter(items, "", SONG_ONLY).length, 2);
  assert.equal(filter(items, "   ", SONG_ONLY).length, 2);
});

test("song scope: substring match on title, case-insensitive", () => {
  const items = [
    makeItem({ title: "Bohemian Rhapsody" }),
    makeItem({ title: "Radio Ga Ga" }),
  ];
  assert.deepEqual(filter(items, "rhap", SONG_ONLY).map((i) => i.title), [
    "Bohemian Rhapsody",
  ]);
});

test("AND semantics: every token must match", () => {
  const items = [
    makeItem({ title: "Under Pressure" }),
    makeItem({ title: "Under the Bridge" }),
    makeItem({ title: "Bridge Over Troubled Water" }),
  ];
  assert.deepEqual(
    filter(items, "under bridge", SONG_ONLY).map((i) => i.title),
    ["Under the Bridge"],
  );
});

test("channel scope only: title text is ignored", () => {
  const items = [
    makeItem({ title: "Queen Song", channelTitle: "Someone Else" }),
    makeItem({ title: "Random", channelTitle: "QueenOfficial" }),
  ];
  const scopes = { ...ALL_OFF, channel: true };
  assert.deepEqual(filter(items, "queen", scopes).map((i) => i.title), ["Random"]);
});

test("description scope only: matches on descriptionShort", () => {
  const items = [
    makeItem({ title: "A", descriptionShort: "Live at Wembley 1985" }),
    makeItem({ title: "B", descriptionShort: "Studio recording" }),
  ];
  const scopes = { ...ALL_OFF, description: true };
  assert.deepEqual(filter(items, "wembley", scopes).map((i) => i.title), ["A"]);
});

test("playlist scope only: matches on playlistTitle", () => {
  const items = [
    makeItem({ title: "X", playlistTitle: "Workout Mix" }),
    makeItem({ title: "Y", playlistTitle: "Study Beats" }),
  ];
  const scopes = { ...ALL_OFF, playlist: true };
  assert.deepEqual(filter(items, "workout", scopes).map((i) => i.title), ["X"]);
});

test("multiple scopes: haystack is the union of enabled fields", () => {
  const items = [
    makeItem({ title: "Song A", channelTitle: "QueenOfficial" }),
    makeItem({ title: "Song B", channelTitle: "Random" }),
  ];
  const scopes = { song: true, channel: true, description: false, playlist: false };
  // 'queen' hits Song A via channel; 'song' hits both via title.
  assert.deepEqual(
    filter(items, "queen song", scopes).map((i) => i.title),
    ["Song A"],
  );
});

test("no scopes enabled: nothing can match a non-empty query", () => {
  const items = [makeItem({ title: "Anything" })];
  assert.equal(filter(items, "any", ALL_OFF).length, 0);
});

test("unavailable items are still filterable (they participate)", () => {
  const items = [
    makeItem({ title: "Available Song", unavailable: false }),
    makeItem({ title: "Available Match", unavailable: false }),
    makeItem({ title: "Deleted Match", unavailable: true }),
  ];
  const matches = filter(items, "match", SONG_ONLY);
  assert.deepEqual(matches.map((i) => i.title), ["Available Match", "Deleted Match"]);
});
