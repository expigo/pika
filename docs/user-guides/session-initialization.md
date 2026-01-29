# User Guide: Starting a Live Session

This guide explains how to start a live session in the Pika! Desktop app and how VirtualDJ history import works.

## Starting Fresh

If you are just starting your set and want to go live immediately:
1. Click the **GO LIVE** button in the top control bar.
2. If no recent history is detected, you will see the **Start New Session** modal.
3. Enter a **Session Title** (or use the generated default).
4. If a track is currently playing in VirtualDJ, you can choose to:
   - **Include Track & Go Live**: This adds the current song as the first track in your set.
   - **Ignore Track & Start Fresh**: This starts the session empty; the next song you mix in will be the first recorded track.

## Importing History

If you have already been playing for a while and want to sync your past tracks to the cloud:
1. Click **GO LIVE**.
2. If the app detects tracks played within the last 24 hours, the **Import History** modal will appear.
3. **Choose Your Start Point**: You can select which track to start the import from. Use this to skip "warm-up" tracks or sound checks.
4. **Seamless Transition**: The app automatically checks if your currently playing song is already in your history. 
   - If it is, you'll see a green "Seamless Transition" checkmark. 
   - If not, it will be added as a "Bridge" track to ensure your set history is complete.
5. Click **Go Live with X tracks** to begin.

## Troubleshooting

### "Duplicate Session Detected"
If you see this warning, it means the tracks you are trying to import were already part of a previous Pika! session. 
- **Recommended**: Click "Start New Session" to avoid doubling your history records.
- **Advanced**: Use "Import Anyway" only if you had a crash and need to resume a session that didn't sync correctly.

### Track Not Showing Up
Pika! listens to VirtualDJ's history log. If a track doesn't show up immediately:
1. Ensure the track has been playing for at least 30 seconds (VirtualDJ's default logging threshold).
2. Check that the DJ name is set correctly in Pika! settings.
