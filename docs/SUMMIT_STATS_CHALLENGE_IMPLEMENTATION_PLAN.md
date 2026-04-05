# Summit Stats Team Challenge – Phased Implementation Plan

## Phase 1: Data Model Updates (Completed)

- Migration `559_summit_stats_challenge_tables.sql`: `challenge_teams`, `challenge_team_members`, `challenge_workouts`
- Extended `learning_program_classes` with `activity_types_json`, `scoring_rules_json`, `weekly_goal_minimum`
- Models: `ChallengeTeam.model.js`, `ChallengeWorkout.model.js`
- Extended `LearningProgramClass.model.js` for new fields

## Phase 2: Role/Permission Updates (Completed)

- `canManageChallenges` in `capabilities.js` for admin, super_admin, provider_plus
- `canManageTeam` in `challengePermissions.js` for provider_plus when team_manager
- Comment in `learningProgramClasses.controller.js` documenting provider_plus = Team Manager

## Phase 3: Dashboard Updates (Completed)

- Challenges rail card in `DashboardView.vue` when user has challenge memberships
- `loadMyChallenges` fetches `/learning-program-classes/my`
- `ChallengesTab.vue` lists challenges; links to Challenge Dashboard
- Mounted `learning-program-classes` routes in `server.js`
- Routes: `/challenges/:id`, `/:organizationSlug/challenges/:id`

## Phase 4: Challenge/Class Conversion (Completed)

- Controller create/update supports `activityTypesJson`, `scoringRulesJson`, `weeklyGoalMinimum`
- IntakeLinksView: "Challenge" option and label for `learning_class` scope
- `getScopeTypeLabel` maps `learning_class` → "Challenge"

## Phase 5: Teams, Leaderboards, Activity Feed (Completed)

- `challenges.controller.js`: teams CRUD, leaderboard, activity feed, workout submission
- Routes under `/learning-program-classes/:classId/`
- `ChallengeDashboardView.vue`: leaderboards (individual/team), teams list, workout form, activity feed

## Future Enhancements

- Screenshot upload for workouts
- Weekly leaderboard UI
- Comments/reactions on workouts
- Admin UI for creating challenges with activity types and scoring rules

## Phase 6: Seasonal Workflow Core (Completed)

- Migration `619_summit_stats_season_lifecycle_fields.sql` adds season lifecycle/settings fields:
  - `captain_application_open`
  - `captains_finalized`
  - `season_splash_enabled`
  - `season_announcement_text`
  - `season_settings_json`
- `LearningProgramClass.model.js` now maps these fields for create/update/duplicate/read paths.
- `learningProgramClasses.controller.js` supports these fields in create/update payloads.
- Added discover/join APIs:
  - `GET /api/learning-program-classes/discover`
  - `POST /api/learning-program-classes/:classId/join`
- `SummitStatsDashboardView.vue` now renders season splash cards with:
  - Apply for captain CTA (when open)
  - Join season CTA
  - Open season dashboard CTA when already joined

## Phase 7: Captain Applications (Completed)

- Migration `620_summit_stats_captain_applications.sql`.
- New model: `ChallengeCaptainApplication.model.js`.
- New APIs:
  - `GET /api/learning-program-classes/:classId/captain-applications`
  - `POST /api/learning-program-classes/:classId/captain-applications`
  - `PUT /api/learning-program-classes/:classId/captain-applications/:applicationId`
  - `POST /api/learning-program-classes/:classId/captains/finalize`
- `ChallengeDashboardView.vue` includes captain application review/finalize manager UI.

## Phase 8: Season Dashboard Modules (Completed)

- Added weekly team progress API:
  - `GET /api/learning-program-classes/:classId/team-weekly-progress`
- Added in-app season message feed APIs:
  - `GET /api/learning-program-classes/:classId/messages`
  - `POST /api/learning-program-classes/:classId/messages`
- New migration/model:
  - `621_summit_stats_challenge_messages.sql`
  - `ChallengeMessage.model.js`
- New components:
  - `ChallengeTeamWeeklyProgress.vue`
  - `ChallengeMessageFeed.vue`
- `ChallengeDashboardView.vue` uses a two-column layout:
  - Left: season stats/leaderboards/weekly progress
  - Right: workout feed + message feed

## Phase 9: Workout Comments + GIF Uploads (Completed)

- Migration `622_summit_stats_workout_comments_media.sql`.
- New models:
  - `ChallengeWorkoutComment.model.js`
  - `ChallengeWorkoutMedia.model.js`
- New APIs:
  - `GET /api/learning-program-classes/:classId/workouts/:workoutId/comments`
  - `POST /api/learning-program-classes/:classId/workouts/:workoutId/comments`
  - `DELETE /api/learning-program-classes/:classId/workout-comments/:commentId`
  - `POST /api/learning-program-classes/:classId/workouts/:workoutId/media` (gif/image upload)
- `ChallengeActivityFeed.vue` now supports:
  - workout card color accents by activity type
  - media previews
  - comment thread toggle/post/delete

## Phase 10: Vision Hooks + WhatsApp Bridge Scaffold (Completed)

- Migration `623_summit_stats_workout_vision_jobs.sql`.
- New service: `challengeWorkoutVision.service.js` with `enqueueWorkoutVision(...)` hook.
- Vision hook is called on:
  - workout submission
  - workout media upload
- New service: `challengeMessageBridge.service.js` with adapter contract:
  - `postMessageToChannel`
  - `ingestExternalMessage`
  - `mapExternalAuthor`
- Providers:
  - `in_app` default provider
  - `whatsapp` scaffold provider behind `WHATSAPP_BRIDGE_ENABLED=1`
