# YT Playlist Search

Chromium MV3 extension. Search across your own YouTube playlists, or any public playlist by URL. Client-side substring filter with per-field scope checkboxes; results grouped by playlist; play in a new tab (or in the native YouTube app on mobile).

## Install (from source)

1. Open `chrome://extensions` (Chromium-family browsers).
2. Enable "Developer mode".
3. "Load unpacked" → select this folder.

## Setup

Before sign-in works, replace `oauth2.client_id` in `manifest.json` with a real Google Cloud OAuth **Web application** client ID whose authorized redirect URI is `https://<extension-id>.chromiumapp.org/` (trailing slash required). The extension ID is shown on `chrome://extensions` after "Load unpacked".

## Tests

```
npm test
```

Uses Node's built-in `--test` runner (Node ≥ 20). No dev dependencies.

## License

MIT — see `LICENSE`.
