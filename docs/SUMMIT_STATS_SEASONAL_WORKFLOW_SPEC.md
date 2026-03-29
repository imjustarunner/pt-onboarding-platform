# Summit Stats Seasonal Workflow Spec

## Goal

Deliver a season-first Summit Stats experience where participants can discover each new season, apply for captain, join, and engage in a dashboard with stats, workouts, comments/media, and messaging.

## Terminology Clarification

- **Season** = the parent container (`learning_program_classes`) that runs for a date range.
- **Weekly challenges** = the 3 task assignments generated/managed each week inside a season (captain assigns or member volunteers).
- In UI copy, we should prefer **Season** for the parent object and reserve **Challenge** for weekly tasks.

## Product Flow

1. Manager configures season settings and starts season.
2. Participants see season splash card(s) with:
   - Apply for Captain (until captains are finalized)
   - Join Season
3. Joined users see season in dashboard and open season dashboard.
4. Manager reviews captain applications and finalizes captains.
5. Season dashboard supports:
   - Leaderboards + weekly scoreboard
   - Team weekly member progress (behind/met/ahead)
   - Workout feed with media + comments
   - Team message feed

## Backend Data Model

- `learning_program_classes` seasonal fields:
  - `captain_application_open`
  - `captains_finalized`
  - `season_splash_enabled`
  - `season_announcement_text`
  - `season_settings_json`
- `challenge_captain_applications`
- `challenge_messages`
- `challenge_workout_comments`
- `challenge_workout_media`
- `challenge_workout_vision_jobs`

## API Contract (Implemented)

- `GET /api/learning-program-classes/discover`
- `POST /api/learning-program-classes/:classId/join`
- `GET /api/learning-program-classes/:classId/captain-applications`
- `POST /api/learning-program-classes/:classId/captain-applications`
- `PUT /api/learning-program-classes/:classId/captain-applications/:applicationId`
- `POST /api/learning-program-classes/:classId/captains/finalize`
- `GET /api/learning-program-classes/:classId/team-weekly-progress`
- `GET /api/learning-program-classes/:classId/messages`
- `POST /api/learning-program-classes/:classId/messages`
- `GET /api/learning-program-classes/:classId/workouts/:workoutId/comments`
- `POST /api/learning-program-classes/:classId/workouts/:workoutId/comments`
- `DELETE /api/learning-program-classes/:classId/workout-comments/:commentId`
- `POST /api/learning-program-classes/:classId/workouts/:workoutId/media`

## UI Surface (Implemented)

- `SummitStatsDashboardView.vue`
  - season splash cards
  - join/apply CTAs
- `ChallengeDashboardView.vue`
  - two-column season dashboard
  - captain application manager panel
- `ChallengeTeamWeeklyProgress.vue`
- `ChallengeMessageFeed.vue`
- `ChallengeActivityFeed.vue`
  - workout card color accents
  - media preview
  - comments thread/post/delete

## Integration Scaffolding

- Google Vision queue hook:
  - `backend/src/services/challengeWorkoutVision.service.js`
  - jobs inserted into `challenge_workout_vision_jobs`
- WhatsApp bridge adapter scaffold:
  - `backend/src/services/challengeMessageBridge.service.js`
  - default provider: `in_app`
  - scaffold provider: `whatsapp` (feature flag controlled)

## Milestone Checklist

- [x] Season lifecycle fields + model wiring
- [x] Season splash + join flow
- [x] Captain apply/review/finalize flow
- [x] Team weekly progress + dual feed layout
- [x] Workout comments + GIF/image uploads
- [x] Vision queue hooks + WhatsApp adapter scaffold
- [ ] Vision worker execution path (queued -> completed/failed)
- [ ] WhatsApp bridge production implementation (webhook/outbound)
