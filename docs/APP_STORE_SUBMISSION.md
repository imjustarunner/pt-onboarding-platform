# Summit Stats Team Challenge — App Store Submission Pack

This document collects everything you need to copy/paste into App Store Connect,
plus the readiness checklist. It is meant to be filled in side-by-side with the
submission flow.

---

## 1. App identity

| Field | Value |
| --- | --- |
| App Name | Summit Stats Team Challenge |
| Subtitle (max 30 chars) | Run, ruck & rally your club |
| Bundle ID | `com.plottwist.sstc` |
| SKU | `sstc-ios-1` |
| Primary Category | Health & Fitness |
| Secondary Category | Social Networking |
| Age Rating | 12+ (Infrequent/Mild Mature/Suggestive Themes — none expected; user-generated content present) |

## 2. Keywords (100 chars max, comma separated)

```
running,ruck,rucking,club,team,fitness,challenge,strava,leaderboard,workout,
season,training,community
```

## 3. Promotional text (170 chars, can be updated without review)

```
A new season just dropped. Tag a workout, climb the team leaderboard, and
cheer on your club every day of the season.
```

## 4. App description (4000 chars max)

```
Summit Stats Team Challenge turns your run, ruck, walk, hike, or fitness
session into points for your club.

Join your club's season, get matched to a team, and watch the leaderboards
move every time a teammate logs a workout. Whether you ran a fast 5k, rucked
a tough 10-miler, or knocked out an early-morning treadmill session, every
qualifying mile counts.

WHAT YOU CAN DO
• Tag a workout in seconds — manual entry or upload a screenshot from your
  watch app and let the OCR fill in the details.
• Connect Strava to import your latest activity straight into the season.
• Rep your club. Pick a team, climb the individual and team leaderboards,
  and earn shoutouts for race days, dawn patrols, and split-run weeks.
• Take on weekly challenges — self-elect, captain-assigned, or full-team
  missions that drop fresh every week.
• Cheer your teammates with kudos, emoji reactions, comments, and team chat.
• Stay in the loop with announcements, club splash screens, and a season
  context bar that always shows your team and current season at a glance.

FOR CAPTAINS AND CLUB MANAGERS
• Assign weekly challenges, declare bye weeks, and review submitted proof.
• Run a club-wide feed for announcements, photos, and recognition.
• Configure scoring, terrain rules, race divisions, and recognition
  categories from the in-app workspace.

PRIVACY AND SAFETY
• Sign in once and use Face ID for fast, secure access.
• Delete your account or block another user at any time from Settings.
• Every workout photo and message can be reported to our moderators, who
  review flagged content within 24 hours.

Summit Stats Team Challenge is built by Plot Twist for athletic clubs that
want a simple, fun way to stay accountable together — all season long.
```

## 5. What's New (release notes for v1.0)

```
Welcome to Summit Stats Team Challenge!
• Tag run, ruck, walk, hike, cycling, and fitness workouts
• Strava import + on-device screenshot OCR
• Season and team leaderboards with kudos, emoji, and comments
• Weekly challenges, bye weeks, race tracking, and recognition
• Club feed, season chat, and team chat
```

## 6. Required URLs

| Field | URL |
| --- | --- |
| Privacy Policy | https://summit.plottwist.co/privacy |
| Terms of Use / EULA | https://summit.plottwist.co/terms |
| Support URL | https://summit.plottwist.co/support |
| Marketing URL (optional) | https://summit.plottwist.co |

> Replace these with your actual hosted pages. Apple will follow the link and
> reject the submission if it 404s, doesn't load on mobile, or doesn't mention
> the data your app actually collects.

## 7. Review notes (Apple reviewers only)

```
Demo account (Captain + Club Manager):
  Email:    apple-review@plottwist.co
  Password: <SET BEFORE EACH SUBMISSION>
  Org slug: sstc
  After login, the season Dashboard, Team Chat, Club Feed, and Activity Feed
  are all reachable from the bottom navigation.

Notes:
- The app is a wrapper around our Summit Stats web platform via Capacitor.
- Sign-in via email/password only on iOS. Google sign-in is intentionally
  hidden on iOS (Capacitor.getPlatform() === 'ios') so Apple 4.8 (Sign In
  With Apple) does not apply to this bundle.
- Permissions:
  * Camera / Photo Library — used when a member taps "Tag workout" and chooses
    a screenshot from their watch app, or to attach an image to a club post.
  * Face ID — optional, only used to unlock the saved login.
  * Microphone — used by clinical-staff features that are not exposed in the
    public Summit Stats build; will not prompt for normal users.
- Account deletion: Settings → Danger Zone → Delete My Account. Two-step
  confirmation, immediate erasure of profile + workouts.
- Report content: tap the "⋯" button on any workout, comment, or chat
  message; reasons + optional block of the author.
- Block users: same "⋯" menu, or Settings → Blocked Users to unblock later.
- Reports are reviewed by our team within 24 hours per our community
  guidelines linked from the privacy policy.
```

## 8. Export compliance

Choose: **Uses standard encryption only (HTTPS).** The app already declares
this with `ITSAppUsesNonExemptEncryption = false` in Info.plist.

## 9. Age rating questionnaire — answers

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Sexual content / nudity | None |
| Profanity / crude humor | Infrequent/Mild (chat) |
| Alcohol, tobacco, or drug use | None |
| Mature/suggestive themes | None |
| Horror/fear themes | None |
| Prolonged graphic or sadistic violence | None |
| Gambling | None |
| Unrestricted web access | No |
| Medical/treatment information | None |
| User-generated content | **Yes** |
| Contests | **Yes (in-app, no real-money prizes)** |

This will likely yield a **12+** rating because of UGC + contests.

## 10. App Privacy nutrition label

Apple wants you to declare *every type of data* the app collects, *and* for each
type, whether it's linked to identity and used for tracking. Here's the
breakdown derived from the codebase.

### Data Linked to You (used for app functionality, not tracking)

| Data Type | Purpose |
| --- | --- |
| **Contact Info → Name** | App functionality, Customer support |
| **Contact Info → Email Address** | App functionality, Customer support |
| **Contact Info → Phone Number** *(optional, for some clubs)* | App functionality |
| **Identifiers → User ID** | App functionality, Analytics |
| **User Content → Photos or Videos** *(workout screenshots, treadmill photo, club post images)* | App functionality |
| **User Content → Other User Content** *(workout notes, chat messages, comments, club posts)* | App functionality |
| **Health & Fitness → Fitness** *(distance, duration, heart rate, calories, pace, terrain, manual workouts, Strava imports)* | App functionality |
| **Sensitive Info → None** | n/a |
| **Diagnostics → Crash Data, Performance Data** *(only if you wire Sentry/Crashlytics later)* | App functionality, Analytics |

### Data Not Collected

- Precise location, coarse location (the app does not request background or
  always-on location; the location-when-in-use string is defensive only).
- Browsing history, search history.
- Financial info, payment info (handled by Stripe via the web — out of app).
- Sensitive Info (race, religion, political views, sexual orientation, etc.).
- Contacts.

### Tracking

- The app **does not use** the IDFA, does not share data with third-party data
  brokers, and does not track users across other apps and websites.
- Answer: **Data is not used to track you.**

If you later add a third-party SDK that tracks (e.g., Meta Pixel, Branch,
Adjust), update this section and add `NSUserTrackingUsageDescription` plus the
ATT prompt before that SDK initializes.

## 11. Required visual assets

- **App icon** (1024×1024 PNG, no alpha, no rounded corners)
- **iPhone 6.7" screenshots** (1290×2796) — minimum 3, max 10
- **iPhone 6.5" screenshots** (1242×2688) — minimum 3, max 10
- **iPad 13" screenshots** (2064×2752) — required only if you ship to iPad
- **App Preview videos** (optional)
- **Launch screen** — already configured via `LaunchScreen.storyboard`

Suggested screenshot order:

1. Season dashboard with leaderboard
2. Tag a workout (form)
3. Activity feed with kudos + reactions
4. Weekly challenges board
5. Team chat
6. Club feed
7. Settings → Privacy & Safety (block / delete)

## 12. Pre-submission readiness checklist

- [x] **In-app account deletion** — `UserPreferencesHub` → Danger Zone
- [x] **Report content** on workouts, comments, and chat messages
- [x] **Block user** in-app + manage list in Settings
- [x] **Privacy/Camera/Photos/Mic/FaceID/Location usage strings** in `Info.plist`
- [x] **Encryption declaration** (`ITSAppUsesNonExemptEncryption = false`)
- [x] **Sign In With Apple** — N/A. Google sign-in is now hidden on iOS
      (`Capacitor.getPlatform() === 'ios'`), so Apple 4.8 does not apply to
      this bundle. The web app keeps Google for everyone else. (See section 13.)
- [ ] **Demo account** (apple-review@plottwist.co) provisioned with captain +
      manager + season membership
- [ ] **Privacy policy + Terms + Support pages** live and reachable
- [ ] **App icon** (1024×1024) finalized
- [ ] **Screenshots** in 6.7" and 6.5" sizes
- [ ] **Apple Developer Program** active (org D-U-N-S verified if LLC)
- [ ] **TestFlight beta** completed with at least 2 external testers, no
      crashes for 24 hours
- [ ] **App Store Connect record** created with bundle id `com.plottwist.sstc`
- [ ] **Build uploaded** via Xcode → Distribute App → App Store Connect

## 13. Sign In With Apple — resolved by hiding Google on iOS

App Store Review Guideline **4.8** requires Sign In With Apple any time an app
offers a third-party social login. We took the lowest-effort path: the iOS
bundle hides Google sign-in entirely.

Implementation, in `frontend/src/views/LoginView.vue`:

- A constant `isIOSNative = Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform()`
  is computed at module load.
- The "Continue as … with Google" remembered-login button is gated behind
  `!isIOSNative`.
- `getRememberedGoogleLogin()` is skipped on iOS, so a stale remembered Google
  selection cannot pre-fill the form.
- The `verifyUser` and `currentEmployeeRescue` flows no longer auto-redirect
  to `/auth/google/start` on iOS — they fall through to password mode with a
  short message telling the user that Google sign-in is on the web only.
- `continueWithGoogle()` and `startRememberedGoogleLogin()` are early-returns
  on iOS as belt-and-suspenders against any future entry point.

The web app (and Android, if/when shipped) keep Google login unchanged.

If you ever want to re-enable Google on iOS, you must implement Sign In With
Apple at the same time. Sketch:

- Enable the *Sign In with Apple* capability in Xcode.
- Install `@capacitor-community/apple-sign-in`.
- Add a "Continue with Apple" button on `LoginView.vue`.
- Add a backend route that verifies the Apple identity token (`audience`,
  `nonce`, signature against Apple's JWKS), then upserts the user by the
  stable Apple `sub` claim and links it to an existing email match.
- Handle the private relay email (`@privaterelay.appleid.com`).
- Add a "Linked Sign-In Methods" panel so users can connect/disconnect
  Apple alongside Google.

## 14. Realistic ship timeline (from today)

| Step | Time |
| --- | --- |
| Apple Developer enrollment (org, with D-U-N-S) | 1–3 weeks |
| Resolve SIWA blocker (option 1 above is same-day) | 0–1 day |
| Privacy policy / terms / support pages live | 1–3 days |
| Demo account provisioned | < 1 hour |
| App icon + 6 screenshots | 1–2 days |
| Xcode signing, archive, TestFlight upload | 1 day |
| TestFlight crash-free soak | 1–2 days |
| Apple review (median) | 24–48 hours |
| Buffer for one rejection round-trip | 2–5 days |

Best case (account already enrolled, SIWA hidden, assets ready): ~1 week
from today.
Realistic (new org enrollment, SIWA implemented, one rejection cycle):
~3–6 weeks.
