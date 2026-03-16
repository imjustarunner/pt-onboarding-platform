# Summit Stats Challenge – Phased Implementation Plan

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
