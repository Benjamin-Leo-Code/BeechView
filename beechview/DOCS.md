# BeechView

A touch-friendly video player for your Pinchflat shows, laid out for Apple
HomeView's square screen. Every folder in your shows folder is a show, and
new folders appear automatically.

## 1. Let Home Assistant see your shows

Your shows live on Unraid, so add the Unraid share as network storage:

1. Go to **Settings → System → Storage → Add network storage**.
2. Fill in:
   - **Name:** `unraid`
   - **Usage:** *Media*
   - **Server:** `192.168.10.80`
   - **Protocol:** *Samba/Windows (CIFS)*
   - **Remote share:** `files`
   - **Username / Password:** an Unraid user that can read the `files` share
     (leave blank if the share is public).
3. Click **Connect**.

Your shows are now at `/media/unraid/pinchflat/shows (watch)`, which is
this app's default **media_path**.

## 2. Options

| Option           | Meaning |
| ---------------- | ------- |
| `media_path`     | Folder whose sub-folders are the shows. Must start with `/media/`. |
| `rescan_seconds` | How long a folder scan is reused before checking for new shows again. |

## 3. Watch on HomeView

In Safari on HomeView, open `http://<home-assistant-ip>:8080`. This page needs no
Home Assistant login. You can change the port under **Network** on this
app's **Configuration** tab.

BeechView is also in the Home Assistant sidebar (turn on **Show in sidebar**
on the **Info** tab).

## Troubleshooting

- **"No shows yet"**: check the **Log** tab. It shows the folder being read and
  any error. Check that `media_path` matches the folder under
  **Media → unraid** in Home Assistant.
- **An episode won't play**: Safari only plays MP4/MOV. In Pinchflat, set the
  media profile's preferred container to MP4.
