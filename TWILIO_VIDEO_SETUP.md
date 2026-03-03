# Twilio Video Setup for Supervision Sessions

This guide explains how to enable Twilio Video for supervision meetings so attendance is **automatically tracked** when participants join and leave (instead of relying on popup open/close with Google Meet).

## Prerequisites

- Existing Twilio account (you already have this for SMS/voice)
- Backend env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`

## 1. Create an API Key (US1 region)

Twilio Video access tokens require an **API Key** (not the main Auth Token). The key must be in the **US1** region.

1. Go to [Twilio Console → Account → API keys](https://www.twilio.com/console/runtime/api-keys)
2. Click **Create API key**
3. Name it (e.g. `Video for supervision`)
4. **Important:** Set region to **US1** (United States)
5. When configuring permissions (Recordings / Rooms), enable:
   - **`rooms.recordings`** – Required to fetch recordings when a room ends
   - **`rooms.recording-rules`** – Required for room recording
   - **`recordings`** – Access to recordings
   - **`recordings.recording-settings`** – Optional; enables encrypted storage
   - **`rooms.transcriptions`** – Optional; for Twilio’s built-in transcription (if used)
6. Copy the **SID** and **Secret** (the secret is shown only once)

## 2. Add environment variables

Add to your backend `.env`:

```env
# Twilio Video (supervision sessions)
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your_api_key_secret
TWILIO_VIDEO_WEBHOOK_URL=https://your-app-domain.com/api/twilio/video/webhook

# Required for calendar join links and session list "Join" buttons
FRONTEND_URL=https://your-app-domain.com
```

- **`TWILIO_VIDEO_WEBHOOK_URL`** – Your public backend URL + `/api/twilio/video/webhook`. Twilio POSTs participant connect/disconnect and room-ended events here.
- **`FRONTEND_URL`** – Your public frontend URL (no trailing slash). Used for join links in Google Calendar events and session lists.

## 3. Run the migration

```bash
cd database && node run-migrations.js
```

This adds `twilio_room_sid` and `twilio_room_unique_name` to `supervision_sessions`.

## 4. How it works

1. **Join with app** – When a supervisor or supervisee clicks "Join with app" on a supervision session, the app:
   - Fetches an access token from `GET /api/supervision/sessions/:id/video-token`
   - Creates or reuses a Twilio Video room named `supervision-{sessionId}`
   - Opens the in-app video UI

2. **Deep link from calendar** – Calendar events include a join URL (`FRONTEND_URL/join/supervision/{sessionId}`). Users who click it are redirected to login if needed, then into the video room.

3. **Attendance tracking** – When participants connect or disconnect, Twilio sends webhooks to your `TWILIO_VIDEO_WEBHOOK_URL`. The backend records these as `joined`/`left` events in `supervision_session_attendance_events` and recomputes `supervision_session_attendance_rollups`.

4. **Recording & transcription** – Rooms are created with `recordParticipantsOnConnect: true`. When a room ends, the backend fetches recordings, transcribes them (see below), and saves transcript + AI summary to `supervision_session_artifacts`.

5. **Payroll** – The app minutes in the supervision conflicts report and payroll reflect actual time in the video room.

## 5. Transcription (optional)

Automatic transcription after a room ends requires converting Twilio’s mka/opus recordings to WAV for Google Speech-to-Text.

**Option A: Install ffmpeg** (recommended if you want transcripts)

- **macOS:** `brew install ffmpeg`
- **Ubuntu/Debian:** `apt-get install ffmpeg`
- **Docker:** Add `RUN apt-get update && apt-get install -y ffmpeg` to your Dockerfile

**Option B: Skip transcription** – Without ffmpeg, video, attendance, and hours still work; only transcripts and AI summaries are skipped.

**Option C: Twilio transcriptions** – If you enable `rooms.transcriptions` and use Twilio’s transcription API, you may be able to avoid ffmpeg. This would require code changes to the transcription pipeline.

## 6. Twilio Video overview

- **Rooms** – Up to 50 participants; media goes through Twilio’s SFU (Selective Forwarding Unit).
- **Recordings** – Each participant’s audio/video is stored as separate files. Recordings can be stored in Twilio Cloud or external AWS S3.
- **Quotas** – Twilio enforces concurrent rooms/participants and REST API limits. Use status callbacks to reduce read requests.
- **Networking** – WebRTC; ensure required ports/protocols are open for end users.

## 7. Fallback

If Twilio Video is not configured (`TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` missing), the "Join with app" button will show an error. Users can continue using the Google Meet link ("Open Meet" / "Start tracked") for sessions that have one.
