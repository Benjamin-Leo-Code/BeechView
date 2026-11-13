# BeechView
Video player for HomeView

A touch-friendly web app for watching the shows that Pinchflat downloads, laid
out for Apple HomeView's square 7" screen (1088 × 1088) in Safari.

- Every folder in `shows (watch)` is a **show**. Add a folder and it appears
  on the home screen automatically (the app re-checks every minute, or tap ↻).
- Every video beneath a show folder (at any depth, so Pinchflat's
  `Season …/episode/` layout works) is an **episode**, newest first, with its
  thumbnail and a tidied-up title (the `s2026e1105 -` prefix and `[videoId]`
  suffix are removed).
- Show artwork comes from `poster.jpg` (or `folder.jpg`, `cover.jpg`, `fanart.jpg`)
  in the show folder, otherwise the latest episode's thumbnail.
- Resume where you left off, a "Continue watching" row, watched ticks and
  auto-play of the next episode. Progress is stored in Safari on the device.
- No dependencies: one Node.js file serves the API, the page and the video
  (with the byte-range support Safari needs for seeking).

## Running it

The server must run on your home network with the shows folder mounted, e.g.
on the machine at `192.168.10.80`.

### Docker (recommended)

Edit the volume in `docker-compose.yml` so the left-hand side is the real path
to `shows (watch)` on that machine, then:

```sh
docker compose up -d --build
```

### Plain Node.js (18 or newer)

```sh
MEDIA_ROOT="/path/to/files/pinchflat/shows (watch)" npm start
```

Then on the HomeView open **http://192.168.10.80:8080** in Safari.

### Settings

| Variable           | Default  | Meaning                                       |
| ------------------ | -------- | --------------------------------------------- |
| `MEDIA_ROOT`       | `/media` | Folder whose sub-folders are the shows        |
| `PORT`             | `8080`   | Port to listen on                             |
| `SCAN_TTL_SECONDS` | `15`     | How long a folder scan is reused before rescanning |

## Video formats

Safari plays **MP4 / M4V / MOV** (H.264 or HEVC). WebM and MKV files are
listed but marked "may not play in Safari". In Pinchflat, set the media
profile's preferred container to **MP4** so everything plays on HomeView.

## Development

```sh
npm test   # spins up the server against a fake Pinchflat library
```
