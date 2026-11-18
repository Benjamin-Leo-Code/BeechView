# BeechView
Video player for HomeView

A Home Assistant app for watching the shows that Pinchflat downloads, laid out
for Apple HomeView's square 7" screen (1088 × 1088) in Safari.

- Every folder in your shows folder is a **channel**, newest activity first.
  Add a folder and it appears automatically (the page re-checks every
  30 seconds, or tap ↻).
- Every video beneath a channel folder is an **episode**, at any depth, so
  Pinchflat's `Season …/episode/` layout works. Episodes are listed newest
  first, with their thumbnail, a tidied title (no `s2026e092799` numbering or
  `[video id]`) and the date.
- Channel artwork comes from `poster.jpg` (or `folder.jpg`, `cover.jpg`,
  `fanart.jpg`) in the channel folder, otherwise the newest episode's thumbnail.
- **Work mode**: while chosen Home Assistant entities are all on (e.g. a
  working-day sensor and a work schedule), a separate work folder is shown
  instead, with an orange bar.
- Resume where you left off, a "Continue watching" row, watched ticks and
  auto-play of the next episode. Progress is stored in Safari on the device.

## Installing

1. In Home Assistant, go to **Settings → Apps → App store**, open the **⋮** menu,
   choose **Repositories** and add
   `https://github.com/Benjamin-Leo-Code/BeechView`.
2. Refresh the page, open **BeechView** and click **Install**. Building it
   takes a minute or two.
3. Follow the app's **Documentation** tab ([beechview/DOCS.md](beechview/DOCS.md))
   to add your shows folder as network storage, then click **Start**.
4. On HomeView, open `http://<home-assistant-ip>:8888` in Safari. No login is
   needed. BeechView is also available in the Home Assistant sidebar.

New versions appear as an **Update** button on the app's page (or turn on
**Auto update**).

## Video formats

Safari plays **MP4 / M4V / MOV** (H.264 or HEVC). WebM and MKV files are
listed but marked "may not play in Safari". In Pinchflat, set the media
profile's preferred container to **MP4** so everything plays on HomeView.

## Development

The app lives in [`beechview/`](beechview): `server.js` (a dependency-free
Node.js server) and `public/` (the page). Bump `version` in
`beechview/config.yaml` and add a `CHANGELOG.md` entry for each release so
Home Assistant offers the update.

```sh
cd beechview
npm test   # starts the server against a fake Pinchflat library
```
