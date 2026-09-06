# YT Playlist Search

A Chromium MV3 extension. Sign in with Google, then search across your own YouTube playlists — or paste any public playlist URL — with per-field scope checkboxes (song, channel, description, playlist name). Results are grouped by playlist. Play matches in a new browser tab, or (on Android/iOS) in the YouTube app.

Sister project of [YT Playlist Builder](https://github.com/Skymask000/YTPlaylistBuilder), sharing its auth pattern.

## Features (v0.1.0)

- Sign in with Google (OAuth), switch account without a full sign-out.
- Load a single playlist or all your playlists in parallel, cached for instant re-opens.
- Live client-side substring filter with AND-token semantics; scope checkboxes per field.
- Grouped-by-playlist results with collapsible sections.
- One-click play in a new browser tab; on mobile browsers (Kiwi on Android, Orion on iOS) an additional "Play in app" button opens the native YouTube app.

## Install (from source)

1. Open `chrome://extensions` in a Chromium-family browser (Chrome, Brave, Edge, Kiwi, Orion).
2. Enable Developer mode.
3. Click "Load unpacked" and select this folder.

## Setup (OAuth client)

Before sign-in works, replace `oauth2.client_id` in `manifest.json` with a real Google Cloud OAuth **Web application** client ID whose authorized redirect URI matches `https://<extension-id>.chromiumapp.org/` (trailing slash required). The extension ID is visible on `chrome://extensions` after Load unpacked.

The extension requests the `https://www.googleapis.com/auth/youtube` scope. During Google Cloud Testing mode, only listed test users can sign in.

## Tests

```
npm test
```

Node's built-in `--test` runner (Node ≥ 20). No dev dependencies.

## Privacy

See [PRIVACY.md](./PRIVACY.md). Nothing leaves your browser beyond calls to Google's YouTube Data API.

## License

MIT — see [LICENSE](./LICENSE).
