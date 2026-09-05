# Privacy Policy — YT Playlist Search

YT Playlist Search is a browser extension that searches across your own YouTube playlists, or any public YouTube playlist you provide the URL for.

## What data the extension accesses

- Your Google account, only after you explicitly sign in from the popup.
- The list of playlists on your YouTube channel (title, ID, item count) via the YouTube Data API v3.
- The items inside playlists you choose to search (video title, channel/uploader, published date, and up to the first 500 characters of the description).
- Your basic YouTube channel profile (channel title and avatar) so the popup can show which account is signed in.

## What data leaves your browser

Nothing. All fetched data is stored in `chrome.storage.local` — your browser's local extension storage. The extension never sends your playlist contents or any personal data to any server other than YouTube itself, and only to authenticate and read your own data.

## OAuth scope

The extension requests the `https://www.googleapis.com/auth/youtube` scope. This is the scope needed to read your playlists via the YouTube Data API. It also allows writes (create/modify playlists), but this extension only reads — it never modifies playlists.

## Sign-out

Clicking "Sign out" clears the cached OAuth token from local storage. Clicking "Add account" begins a fresh sign-in flow so you can switch Google accounts.

## Third parties

None. There are no analytics, no crash reporting, no telemetry. Network calls are made only to Google's YouTube Data API and YouTube's own authentication endpoints.

## Contact

Open a GitHub issue on this project's repository if you have questions.
