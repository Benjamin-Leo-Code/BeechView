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

Choose one: Home Assistant, Unraid, Docker Compose or plain Node.js.

### Home Assistant app

BeechView installs as a Home Assistant app. You can watch on HomeView at
`http://<home-assistant-ip>:8080` without logging in, and it also appears
in the Home Assistant sidebar.

**Install it.** Pick the option that matches the repo's visibility:

- **Private repo: install as a local app.**
  1. In Home Assistant, install the **Samba share** app from the app store and start it.
  2. Download this repo as a ZIP (**Code → Download ZIP**) and unzip it.
  3. Copy the whole `beechview` folder into the `addons` share, i.e.
     `\\<home-assistant-ip>\addons\beechview`.
  4. Go to **Settings → Apps → App store**, open the **⋮** menu, choose
     **Check for updates** and refresh the page. **BeechView** appears
     under **Local apps**.
- **Public repo: add it as a repository.** In **Settings → Apps → App store**,
  open the **⋮** menu, choose **Repositories** and add
  `https://github.com/Benjamin-Leo-Code/BeechView`.

Click **BeechView**, then **Install**. Building the app takes a minute or two.
Before you start it, follow the app's **Documentation** tab
([beechview/DOCS.md](beechview/DOCS.md)). It shows how to add your Unraid
share under **Settings → System → Storage** so BeechView can see the shows.

### Unraid

This uses Unraid's standard `node:22-alpine` image, so nothing needs building.

1. **Copy BeechView to Unraid.** Download this repo as a ZIP (on GitHub:
   **Code → Download ZIP**) and unzip it. Then copy the whole `beechview`
   folder from the ZIP into the `appdata` share (`\\192.168.10.80\appdata`, or
   `smb://192.168.10.80/appdata` on a Mac). You should end up with
   `appdata/beechview/server.js` and `appdata/beechview/public/`.
   If `appdata` isn't visible, set **Shares → appdata → SMB Export** to *Yes*.
2. **Install the template.** Copy `unraid/my-beechview.xml` into the flash
   drive's `config/plugins/dockerMan/templates-user/` folder
   (`\\192.168.10.80\flash\config\plugins\dockerMan\templates-user\`).
   If the `flash` share isn't visible, go to **Main → Flash** (click the
   flash device) and set **SMB Security Settings → Export** to *Yes*.
3. **Create the container.** Go to **Docker → Add Container**, choose
   **beechview** from the **Template** drop-down, and check the two folders:
   - *App folder*: `/mnt/user/appdata/beechview`
   - *Shows folder*: where `shows (watch)` lives, e.g.
     `/mnt/user/files/pinchflat/shows (watch)`

   If something else already uses port 8080, change *Web UI port*. Click **Apply**.
4. On the HomeView, open **http://192.168.10.80:8080** in Safari.

To update BeechView later, copy the new files over the old ones in
`appdata/beechview` and restart the container. If it says "No shows yet",
check the container's **Logs**: they show which folder it is reading.

### Docker Compose (other machines)

Edit the volume in `docker-compose.yml` so the left-hand side is the real path
to `shows (watch)` on that machine, then:

```sh
docker compose up -d --build
```

### Plain Node.js (18 or newer)

```sh
cd beechview
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
cd beechview
npm test   # spins up the server against a fake Pinchflat library
```
