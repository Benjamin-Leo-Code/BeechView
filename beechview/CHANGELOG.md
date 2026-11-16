# Changelog

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
