# Changelog

## 1.3.2

- The "Continue watching" row is hidden on the work (BeechViewWorkday) home
  screen. It still shows on the normal home screen, and work videos still
  resume where you left off.

## 1.3.1

- New default folders: shows in `/media/Unraid/Videos/YouTube`, work videos
  in `/media/Unraid/Videos/YouTube/Work`.
- If the work folder is inside the shows folder, it is left out of the normal
  channels, so work videos only appear in work mode.

## 1.3.0

- The web page is now on port **8888** (was 8080): open
  `http://<home-assistant-ip>:8888` on HomeView.
- New **work mode**: while every configured work entity is on (by default
  `binary_sensor.boot_room_working_day` and `schedule.work_schedule`),
  BeechView shows the videos in the work videos folder instead, with an orange
  bar and the title BeechView**Workday**. Configure or switch it off on the
  Configuration tab.
- The page checks for changes every 30 seconds (was every minute).

## 1.2.4

- BeechView is now Home Assistant only: removed the Docker Compose file, the
  Unraid template and the settings that were only used outside Home Assistant.
- Home Assistant's watchdog now checks the app and restarts it if it stops
  responding.

## 1.2.3

- Fixed: opening a channel link directly (e.g. .../#/show/Geoff%20Marshall)
  went to the home screen. BeechView now opens the screen in the address,
  still with a fresh scan of the library.
- Fixed: on HomeView, opening a channel briefly showed it and then went back
  to the home screen. HomeView's browser appears to reload the page whenever
  the address changes. BeechView now detects this and switches to changing
  screens without touching the address, so no reloads happen.

## 1.2.2

- Fixed (likely cause): opening a channel could jump back to the home
  screen. Safari on HomeView reloads a page that uses too much memory, and
  every thumbnail was being loaded at once. Images now load lazily as they
  scroll into view.
- If Safari reloads the page while you are in a channel, it now reopens that
  channel instead of going to the home screen.
- The page now writes short notes to the app's Log (page opened/reloaded,
  channel opened, errors) to help diagnose problems on HomeView.

## 1.2.1

- Fixed: Pinchflat numbering such as s2026e092799 is now removed even when it
  is joined to the title with an underscore, and is shown as the episode date.

## 1.2.0

- The bottom bar floats slightly in from the edges so HomeView's rounded
  corners no longer clip the title or refresh button.
- Shows are ordered by their most recently downloaded video, newest first.
- Series and episode numbers (e.g. s2026e1105, S01E05, Season 1 Episode 5,
  1x05) are removed from video titles. Pinchflat's date-based numbering is
  shown as the episode date instead.
- Removed the "Shows" heading from the home screen.
- Channel page: removed the Play button, moved the sort button to the right
  and added the channel name above the episode count.

## 1.1.1

- Fixed: the bottom bar now stays on screen while you scroll (also inside the
  Home Assistant sidebar); the list scrolls underneath it.
- Fixed: opening a show while the library was refreshing could jump back to the
  home screen. Background refreshes now only redraw the screen you are on, and
  a slow show is retried instead of sending you home.
- Show and episode links work with any characters in folder names.
- Rescans read a few folders at a time so thumbnails stay quick.

## 1.1.0

- The title and refresh button now sit in a bar fixed to the bottom of the screen.
- Removed the clock.
- Shows "Loading…" until the library arrives, retrying automatically if the
  server isn't ready, instead of briefly saying there are no shows.
- Always opens on the home screen with a fresh scan of the folders.
- The server scans the folders as soon as it starts and refreshes them in the
  background, so pages open straight away.

## 1.0.0

- First release: show browser and player for HomeView, Home Assistant app.
