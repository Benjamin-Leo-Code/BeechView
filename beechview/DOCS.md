# BeechView

A touch-friendly video player for your Pinchflat shows, laid out for Apple
HomeView's square screen. Every folder in your shows folder is a show, and
new folders appear automatically.

## 1. Let Home Assistant see your shows

Your shows live on Unraid, so add the Unraid share as network storage:

1. Go to **Settings → System → Storage → Add network storage**.
2. Fill in:
   - **Name:** `Unraid`
   - **Usage:** *Media*
   - **Server:** `192.168.10.80`
   - **Protocol:** *Samba/Windows (CIFS)*
   - **Remote share:** the share that holds `Videos/YouTube`
   - **Username / Password:** an Unraid user that can read that share
     (leave blank if the share is public).
3. Click **Connect**.

Your shows are now under **Media → Unraid**. The defaults expect the
channels in `/media/Unraid/Videos/YouTube` and the work channels in
`/media/Unraid/Videos/YouTube/Work`. Change the folders on the
**Configuration** tab if yours differ.

## 2. Options

| Option                       | Meaning |
| ---------------------------- | ------- |
| **Shows folder**             | Folder whose sub-folders are the channels. Must start with `/media/`. |
| **Rescan interval (seconds)**| How long a folder scan is reused before checking for new channels again. |
| **Work mode**                | Switch on to use work mode (below); switch off to always show the normal videos. |
| **Work entities**            | Work mode is active while *every* one of these is on. |
| **Work videos folder**       | Folder whose sub-folders are the work channels. Must start with `/media/`. If it is inside the shows folder, it is left out of the normal channels. |

### Work mode

While every **work entity** is on (by default
`binary_sensor.boot_room_working_day` and `schedule.work_schedule`), BeechView
shows the channels in the **work videos folder** instead of the normal ones.
The bar turns orange and the title reads **BeechView**Workday.

- Changes are picked up within about 30 seconds. A video that is playing is
  never interrupted; the switch happens when you leave it.
- If an entity can't be read, or the work folder can't be read, BeechView
  shows the normal videos and says why in the **Log** tab.
- Watch progress for work videos is kept separately.

## 3. Watch on HomeView

In Safari on HomeView, open `http://<home-assistant-ip>:8888`. This page needs no
Home Assistant login. You can change the port under **Network** on this
app's **Configuration** tab.

BeechView is also in the Home Assistant sidebar (turn on **Show in sidebar**
on the **Info** tab).

## Troubleshooting

- **"No shows yet"**: check the **Log** tab. It shows the folder being read and
  any error. Check that `media_path` matches the folder under
  **Media → Unraid** in Home Assistant (folder names are case-sensitive).
- **An episode won't play**: Safari only plays MP4/MOV. In Pinchflat, set the
  media profile's preferred container to MP4.
