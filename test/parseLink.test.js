import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPlaylistId } from "../src/parseLink.js";

test("extractPlaylistId: /playlist?list=", () => {
  assert.equal(
    extractPlaylistId("https://www.youtube.com/playlist?list=PLxxx1234_-abc"),
    "PLxxx1234_-abc",
  );
});

test("extractPlaylistId: /watch?v=X&list=Y", () => {
  assert.equal(
    extractPlaylistId("https://www.youtube.com/watch?v=abc123&list=PLyyy567"),
    "PLyyy567",
  );
});

test("extractPlaylistId: youtu.be short URL with list param", () => {
  assert.equal(
    extractPlaylistId("https://youtu.be/abc123?list=PLzzz890"),
    "PLzzz890",
  );
});

test("extractPlaylistId: URL with no list param", () => {
  assert.equal(
    extractPlaylistId("https://www.youtube.com/watch?v=abc123"),
    null,
  );
});

test("extractPlaylistId: non-YouTube host", () => {
  assert.equal(
    extractPlaylistId("https://example.com/playlist?list=PLxxx"),
    null,
  );
});

test("extractPlaylistId: malformed URL string", () => {
  assert.equal(extractPlaylistId("not a url"), null);
});

test("extractPlaylistId: empty string", () => {
  assert.equal(extractPlaylistId(""), null);
});

test("extractPlaylistId: list value with invalid chars is rejected", () => {
  assert.equal(
    extractPlaylistId("https://www.youtube.com/playlist?list=PL$$$"),
    null,
  );
});

test("extractPlaylistId: m.youtube.com is accepted", () => {
  assert.equal(
    extractPlaylistId("https://m.youtube.com/playlist?list=PLmob123"),
    "PLmob123",
  );
});
