# Counseling Session Interface and Modular Activity/Game System Specification

**Document type:** Product, UX, interaction, content, and engineering specification  
**Version:** 1.0  
**Primary use case:** Live one-to-one counseling sessions between a provider/therapist and a client  
**Primary client device:** Mobile phone  
**Primary provider device:** Web application on a laptop or desktop  
**Secondary client device:** Web browser or tablet  
**Core design requirement:** Activities and games operate inside the active counseling session without interrupting the video call or replacing the relationship between the provider and client.

**Related docs:** [MENTAL_HEALTH_GAMES_PLATFORM_PLAN.md](./MENTAL_HEALTH_GAMES_PLATFORM_PLAN.md), [GAMES_SUBMODULE_INTEGRATION.md](./GAMES_SUBMODULE_INTEGRATION.md)

**Implementation status:** Phase 3 — Feelings Adventure, Coping Quest, Emotion Charades, Calm Down Builder, and StoryShelf are embedded ActivityHost plugins (`current_pilot`, each gated by an `activity.*` feature flag). Phase 2 shell, Phase 4 Feelings Capture, and Phase 5 Space Cabin remain available as pilots when their flags are enabled.

---

## 1. Executive Summary

The platform supports two closely connected session experiences:

1. **Standard Counseling Mode** — Conventional video counseling with persistent video, audio controls, chat, session notes, goals, resources, and access to activities.
2. **Activity/Game Mode** — A shared interactive experience launched from the standard session. The activity becomes the primary visual focus while provider and client remain visible and able to speak.

All activities use a shared plug-and-play activity framework. A new activity registers its name, platforms, content, controls, session events, accessibility features, and completion behavior without redesigning the counseling interface.

## 2. Product Assumptions

- **Emotion Dice** — first current game (Phase 2).
- **Peaceful Pond** — second current/pilot game (Phase 2); feature-flagged until enabled.
- **Mood Check-In** — core activity; Phase 1 `live_current`.
- **Thought Explorer** — existing standalone game; registered in the unified activity registry with `launch_mode: standalone`.
- Production availability is controlled by the activity registry, not hard-coded UI lists.

### 2.1 Status Definitions

| Status | Meaning |
|---|---|
| `live_current` | Available to authorized users in production |
| `current_pilot` | Limited cohort / org / test |
| `planned` | Designed but not generally available |
| `disabled` | In registry but not shown |
| `retired` | Not for new sessions; historical data may remain |

### 2.2 Platform Labels

| Label | Meaning |
|---|---|
| Mobile Only | Mobile client only |
| Mobile + Web | Usable on both |
| Mobile + Web, Web Full-Fidelity | Both; richer on web |

## 3. Activity Inventory

| Activity | Type | Status | Platform | Launch mode |
|---|---|---|---|---|
| Mood Check-In | Core activity | `live_current` | Mobile + Web | embedded |
| Thought Explorer | Standalone game | `live_current` (gated by games flags) | Mobile + Web | standalone |
| Emotion Dice | Discussion game | `live_current` (gated by `activity.emotionDice.enabled`) | Mobile + Web | embedded |
| Peaceful Pond | Calming game | `current_pilot` (gated by `activity.peacefulPond.enabled`) | Mobile + Web | embedded |
| Feelings Adventure | Cooperative board | `current_pilot` (gated by `activity.feelingsAdventure.enabled`) | Mobile + Web | embedded |
| Coping Quest | Choice/consequence | `current_pilot` (gated by `activity.copingQuest.enabled`) | Mobile + Web | embedded |
| Emotion Charades | Expressive | `current_pilot` (gated by `activity.emotionCharades.enabled`) | Mobile + Web | embedded |
| Feelings Capture | Touch matching | `current_pilot` (gated by `activity.feelingsCapture.enabled`) | Mobile-primary (+ web tap UI) | embedded |
| Calm Down Builder | Sequence builder | `current_pilot` (gated by `activity.calmDownBuilder.enabled`) | Mobile + Web | embedded |
| Space Cabin Conversation | Immersive narrative | `current_pilot` (gated by `activity.spaceCabin.enabled`) | Mobile + Web (web full-fidelity) | embedded |
| StoryShelf | Guided reading | `current_pilot` (gated by `activity.storyShelf.enabled`) | Mobile + Web | embedded |
| Test Game | Integration harness | `disabled` | Web | standalone |

## 4. Product Principles (summary)

1. Human relationship remains primary — videos stay visible/accessible during activities.
2. Client autonomy — decline, pause, skip, return, hide self-view, avoid saving reflections.
3. Provider-guided, not dominated.
4. No automatic diagnosis from activity outcomes.
5. Mobile-first simplicity.
6. Progressive enhancement on web (private notes, facilitation panel).
7. Data minimization — no default A/V recording by activities.
8. Immediate return to counseling (≤2 taps).

## 5. Session Lifecycle

Pre-Session → Joining → Connected Counseling → Activity Preview → Client Prompt → Activity Active → Reflection → Return to Counseling → Session Closing → Session Ended.

Activities are not exposed before join unless the org explicitly allows pre-session exercises.

## 6. Standard Counseling Interface (shared)

- Session header (logo, secure/quality indicators, duration, provider name, help, End Session)
- Video stage (provider/client tiles, mute/camera-off, hide self-view without disabling camera)
- Primary controls: mic, camera, speaker, pause/return, more, end
- Chat (non-dominant)
- Notes: provider-private / shared / client journal / activity reflections — client never sees provider-private
- Goals and resources panels (structural in Phase 1; content depth later)

## 7. Mobile vs Web

- **Client mobile:** portrait default; provider large + PIP self-view; activity canvas vertical; bottom controls collapse during focused activity.
- **Provider web:** three-region layout (nav | main | context); Focus Mode for activities; private facilitation panel.

## 8. ActivityHost

Every activity runs inside `ActivityHost`. Activities do not own the video call, session header, end-session, permissions, or private provider notes.

Required regions: session header, participant video, activity title, canvas, shared prompt, reflection, session controls, provider context (web), accessibility/pause, connection state.

### State machine

```
INACTIVE → PREVIEW → CLIENT_PROMPT → (DECLINED → INACTIVE | ACCEPTED → LOADING → READY → ACTIVE)
ACTIVE ↔ PAUSED | RECONNECTING
ACTIVE → ROUND_COMPLETE → REFLECTING → COMPLETED → RETURNING → INACTIVE
```

Shared session service is authoritative for activity id, round, turn, prompt, selections, pause, completion, reconnect.

## 9. ActivityPlugin contract

```ts
interface ActivityPlugin {
  manifest: ActivityManifest;
  initialize(context: ActivityContext): Promise<void>;
  loadContent(contentPackId: string, options?: ActivityContentOptions): Promise<void>;
  start(initialState?: ActivitySavedState): Promise<void>;
  pause(reason?: ActivityPauseReason): Promise<void>;
  resume(): Promise<void>;
  handleSessionEvent(event: SessionEvent): Promise<void>;
  handleParticipantAction(action: ParticipantAction): Promise<void>;
  getSharedState(): ActivitySharedState;
  getPrivateProviderState?(): ActivityPrivateProviderState;
  createCheckpoint(): Promise<ActivityCheckpoint>;
  restoreCheckpoint(checkpoint: ActivityCheckpoint): Promise<void>;
  complete(result: ActivityCompletionResult): Promise<void>;
  teardown(): Promise<void>;
}
```

## 10. Mood Check-In (Phase 1 embedded activity)

- Type: core counseling activity; `live_current`; Mobile + Web; 1–5 minutes; no scoring.
- Flow: launch → client selects mood (Great/Good/Okay/Stressed/Overwhelmed) → optional intensity 1–5 → optional note → share or not → discussion prompt → complete/skip/return.
- Store: mood category, intensity, time in session, whether note shared, client-approved note text.
- Do not store: unshared drafts as clinical facts, diagnostic labels, facial/voice inference.

## 11. Privacy and safety (Phase 1 baseline)

- Immediate pause and return for both roles
- Skip / decline without loss of access
- No hidden recording; no facial emotion recognition; no diagnostic scoring
- Provider can force return to standard counseling
- Provider-private notes on a separate authorization path

## 12. Phase roadmap

| Phase | Deliver |
|---|---|
| **1** | Session shell, video, chat, notes, ActivityHost, registry, Mood Check-In, Thought Explorer via registry |
| **2 (this implementation)** | Generic ActivityHost, Emotion Dice (`live_current`), Peaceful Pond (`current_pilot`), server-authoritative dice rolls, reflection dock, checkpoints, Current/Pilot badges, reduced-motion |
| **3 (this implementation)** | Feelings Adventure, Coping Quest, Emotion Charades, Calm Down Builder, StoryShelf (`current_pilot`, feature-flagged) |
| **4 (this implementation)** | Feelings Capture (`current_pilot`), optional haptics, touch matching, static mode |
| **5 (this implementation)** | Space Cabin Conversation (`current_pilot`), immersive/performance profiles V1, narrative branching |

## 13. Sample registry JSON

```json
{
  "activities": [
    { "id": "mood-check-in", "status": "live_current", "platforms": ["mobile", "web"], "type": "core_activity", "launchMode": "embedded" },
    { "id": "thought-explorer", "status": "live_current", "platforms": ["mobile", "web"], "type": "standalone_game", "launchMode": "standalone", "featureFlag": "gamesPlatformEnabled" },
    { "id": "emotion-dice", "status": "live_current", "platforms": ["mobile", "web"], "type": "discussion_game", "launchMode": "embedded", "featureFlag": "activity.emotionDice.enabled" },
    { "id": "peaceful-pond", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "calming_game", "launchMode": "embedded", "featureFlag": "activity.peacefulPond.enabled" },
    { "id": "feelings-adventure", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "cooperative_board_game", "launchMode": "embedded", "featureFlag": "activity.feelingsAdventure.enabled" },
    { "id": "coping-quest", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "choice_consequence_game", "launchMode": "embedded", "featureFlag": "activity.copingQuest.enabled" },
    { "id": "emotion-charades", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "expressive_game", "launchMode": "embedded", "featureFlag": "activity.emotionCharades.enabled" },
    { "id": "calm-down-builder", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "sequence_builder", "launchMode": "embedded", "featureFlag": "activity.calmDownBuilder.enabled" },
    { "id": "story-shelf", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "shared_reading", "launchMode": "embedded", "featureFlag": "activity.storyShelf.enabled" },
    { "id": "feelings-capture", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "touch_matching_game", "launchMode": "embedded", "featureFlag": "activity.feelingsCapture.enabled" },
    { "id": "space-cabin-conversation", "status": "current_pilot", "platforms": ["mobile", "web"], "type": "immersive_narrative", "launchMode": "embedded", "webFullFidelity": true, "featureFlag": "activity.spaceCabin.enabled" }
  ]
}
```

## 14. Engineering notes for this repo

- Video: Vonage Video (server: `vonageVideo.service.js`; client: shared `VideoSessionRoom.vue`). Application ID (not account API key) is required for JWT client tokens; errors must never render raw JWTs in the UI.
- Activity packages live under `frontend/src/activities/<id>/` (first-party Vue plugins). `ActivityHost` loads them dynamically from `frontend/src/activities/index.js`.
- Emotion Dice rolls / Phase 3 draws: `POST /api/counseling/sessions/:sessionId/activity/roll` (server-authoritative for Emotion Dice roll/reroll, Feelings Adventure `draw`, Emotion Charades `deal`).
- Standalone games continue to load from `/games-content/*` via the games submodule.
- Personal Thought Explorer progress remains on `GET/PUT /api/games/progress/:gameKey`; live session activity state uses `counseling_session_activity_runtime`.
- Migrations for counseling tables live in `database/migrations/` only.
- Session create/from-appointment: provider (or super_admin) + agency membership; `providerUserId` always from `req.user.id`. Activity accept is client-only.

---

## 15. Emotion Dice (Phase 2)

- Type: discussion game; `live_current`; feature flag `activity.emotionDice.enabled`; Mobile + Web; embedded.
- Packs: core-6 (Happy/Sad/Anxious/Angry/Surprised/Calm) and alt-6 (Proud/Frustrated/Lonely/Excited/Embarrassed/Hopeful).
- Shared state: `round`, `maximumRounds`, `currentTurn`, `currentEmotionId`, `currentPromptId`, `rollHistory`, `paused`, `promptDepth`, `packId`.
- Client escapes: reroll, skip prompt, lighter prompt, hypothetical, ask provider first, exit.
- Die face is never invented on the client; animation may play locally while waiting for the roll API.

## 16. Peaceful Pond (Phase 2 pilot)

- Type: calming game; `current_pilot`; feature flag `activity.peacefulPond.enabled` (hidden when flag off).
- Flow: worry select → breathing cue → tap-to-place → ripple → settle → reflection → optional repeat → calm check-in.
- Language: “set down / make space / return later” — never erase / suppress / disappear.
- Shared state: `worriesPlaced[]`, `currentWorry`, `phase`, `breathingSeconds`, `calmRating`, `reflection`.
- Reduced motion: static pond + fade (no pulse/shimmer).


## 17. Feelings Adventure (Phase 3 pilot)

- Type: cooperative board; `current_pilot`; flag `activity.feelingsAdventure.enabled`.
- Flow: provider picks pack → client picks token → draw situation (server) → name feelings / optional body clue / next step → move 1–3 spaces by participation → special spaces → finish/reflect.
- Shared state: `phase`, `packId`, `clientToken`, `clientPosition`, `currentTurn`, `currentSituationId`, `history`.
- No winner/loser scoring; answers are never graded as wrong.

## 18. Coping Quest (Phase 3 pilot)

- Type: choice/consequence; `current_pilot`; flag `activity.copingQuest.enabled`.
- Flow: scenario → coping card → short-term consequence → discuss context → advance → optional coping plan.
- Provider may mark cards helpful / unhelpful / context_dependent / worth_discussing — never permanent universal good/bad.

## 19. Emotion Charades (Phase 3 pilot)

- Type: expressive turn-taking; `current_pilot`; flag `activity.emotionCharades.enabled`.
- Private emotion dealt via server `action: deal`; guesser never sees label until `revealed`.
- Optional scoring language only (“you recognized it” / “close guess”) — no shame framing; no video/facial analysis stored.

## 20. Calm Down Builder (Phase 3 pilot)

- Type: sequence builder; `current_pilot`; flag `activity.calmDownBuilder.enabled`.
- Flow: optional before check-in → place 3–5 tools on path → practice guided steps → after check-in → optional Calm Plan save.
- No scoring; client may skip/reorder/exit.

## 21. StoryShelf (Phase 3 pilot)

- Type: guided reading; `current_pilot`; flag `activity.storyShelf.enabled`.
- Flow: topic shelf → story preview (content notes) → reading mode → paginated shared read → discussion markers → reflection.
- Grief set includes content notes and decline path; no automatic voice recording.

## 22. Feelings Capture (Phase 4 pilot)

- Type: touch matching / visual matching discussion game; `current_pilot`; feature flag `activity.feelingsCapture.enabled`.
- Platforms: mobile-primary; web shows a tap-friendly layout with a “best on mobile” note (not full drag fidelity).
- Modes: Shared Capture, Compare Perspectives, Client-Led, Untimed Calm (default).
- Flow: situation → tap emotion characters → group selections → discuss why each may fit → next situation → mixed-feelings reflection.
- Shared state: `phase`, `mode`, `situationId`, `round`, `maximumRounds`, `selectedShared` / `selectedClient` / `selectedProvider`, `hapticsEnabled` (default false), `staticMode` (default true), `discussionEmotionId`, `reflection`.
- Accessibility: static mode, tap (not required drag), no required timer, text labels on every emotion, large targets, reduced motion, vibration off by default (`navigator.vibrate` only when enabled).
- Privacy: no diagnostic scoring; skip situation / skip activity; pause/exit via ActivityHost.

## 23. Space Cabin Conversation (Phase 5 pilot)

- Type: immersive narrative; `current_pilot`; feature flag `activity.spaceCabin.enabled`; Mobile + Web (`webFullFidelity`); embedded in ActivityHost.
- Missions: First Contact, Alien Misunderstanding, Mission Stress, Homesick Traveler, Crew Conflict, Unknown Emotion.
- Dialogue: curated branching content packs (no generative dialogue in V1); client escapes (clarify, skip, ask provider, pause); provider controls (pause alien, repeat line, discussion prompt, skip scene, calmer mood, difficulty, branch jump).
- Scene-performance profiles (§26.12): `high` | `balanced` | `mobile` | `low_bandwidth` | `reduced_motion` — stored in shared runtime; OS reduced-motion forces `reduced_motion`.
- Immersive profiles V1: scene mood (`curious` | `calm` | `warm` | `tense`) + performance profile selection — not a full identity system.
- Rendering: CSS/SVG cabin (stars, planet, alien, holo table); richer on web, reduced on mobile / low bandwidth; no 3D engine.
- Shared state: `phase`, `missionId`, `nodeId`, `performanceProfile`, `sceneMood`, `difficulty`, `alienPaused`, `captionsOn`, `clientPauseRequested`, `discussionPrompt`, `branchPath`, `dialogueHistory`, `reflection`.
- Debrief prompts from product spec; no diagnostic scoring; pause/return via ActivityHost reflection dock.

---

*This document is the engineering source of truth for Phase 1–5 registry behavior and embedded activity pilots.*
