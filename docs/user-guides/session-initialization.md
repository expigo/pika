# User Guide: Starting a Live Session

This guide explains how to start a live session in the Pika! Desktop app and how VirtualDJ history import works.

Going live is now a **single screen**. Click **GO LIVE** and the **Start New Session** modal shows everything in one place.

## Start New Session

1. Click the **GO LIVE** button in the top control bar.
2. Enter a **Set Title** (or use the generated default).
3. Depending on what Pika! detects, you'll see one or both optional sections:

### "Start with this track" (only if a song is playing right now)
If VirtualDJ is **actively playing** a track, you'll see a **Start with this track** toggle (on by default):
- **On** — the current song becomes the first track of your set (shown to dancers, recorded in your history).
- **Off** — start clean. Nothing is shown or recorded until the next song you mix in.

> If VirtualDJ is **closed or idle**, there is no "currently playing" track, so this section is hidden and you simply go live clean. The control bar shows **"Waiting for track…"** until you play something. (The last song sitting in VirtualDJ's history from an earlier set will **not** leak into your fresh session.)

### "Add my earlier set" (only if a recent set is detected)
If you've already been playing and Pika! finds tracks from before a ~30-minute break, you'll see an **Add my earlier set** toggle (off by default):
- Turn it on to backfill those tracks into this session and sync them to the cloud.
- **Start From** lets you pick which track to begin the import from — handy for skipping warm-up or soundcheck tracks.
- If those tracks look like they were **already saved** in a previous Pika! session, an inline warning appears so you don't create duplicate history. Leave the toggle off to start clean.

4. Click **Go Live**.

## Troubleshooting

### My fresh session shows an old song
This was a known issue and is fixed. If it recurs: the "currently playing" track is only used when VirtualDJ's most recent history entry is recent (within ~15 minutes). A song older than that is treated as "not playing", so a fresh session starts empty.

### Duplicate history
If the "Add my earlier set" warning says these tracks were already imported, leave the toggle **off** (start fresh). Only import again if a previous session crashed before it synced.

### Track not showing up
Pika! listens to VirtualDJ's history log. If a track doesn't show up immediately:
1. Ensure the track has been playing long enough to be logged (VirtualDJ's `historyDelay`/`historyMinPlayTime` threshold — default ~30–45s; 10s is recommended).
2. Check that the DJ name and VirtualDJ history path are set correctly in Pika! settings.
