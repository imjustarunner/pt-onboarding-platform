<template>
  <div class="sstc-dashboard">
    <section v-if="pendingApplications.length" class="card dash-section dash-section--pending-applications">
      <div class="section-header">
        <div>
          <h2>Club Application Pending</h2>
          <p>Your join request is in review. You can message the club manager or open the club page while you wait.</p>
        </div>
      </div>
      <div class="stack-list">
        <article v-for="application in pendingApplications" :key="application.id" class="application-card application-card--hero">
          <div
            class="application-card-banner"
            :style="applicationBannerStyle(application)"
          >
            <div class="application-card-banner-overlay">
              <div class="application-card-brand">
                <img
                  v-if="application.logoUrl"
                  :src="toUploadsUrl(application.logoUrl) || application.logoUrl"
                  class="application-card-logo"
                  alt=""
                />
                <div>
                  <p class="application-card-eyebrow">{{ SUMMIT_STATS_TEAM_CHALLENGE_NAME }}</p>
                  <h3>{{ application.clubName }}</h3>
                  <p class="application-card-subtitle">
                    Applied {{ formatDate(application.appliedAt) }}
                    <span v-if="application.managerName"> • Managed by {{ application.managerName }}</span>
                  </p>
                </div>
              </div>
              <span class="pill pill--pending-application">Pending</span>
            </div>
          </div>
          <div class="application-card-body">
            <p class="application-card-copy">
              We’ve saved your application and it’s waiting on club review.
            </p>
            <div class="membership-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="contactingApplicationId === application.id"
                @click="contactClubManagerFromApplication(application)"
              >
                {{ contactingApplicationId === application.id ? 'Opening chat…' : 'Message Club Manager' }}
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="openPendingApplicationClub(application)"
              >
                View Club
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="dashboard-hero card dash-section dash-section--hero">
      <div>
        <p class="eyebrow">{{ SUMMIT_STATS_TEAM_CHALLENGE_NAME }}</p>
        <h1>My club dashboard</h1>
        <p class="hero-copy">
          Your home for clubs and seasons. Open a season to see leaderboards, workouts, and each week's team challenges
          (the weekly tasks your team completes).
        </p>
      </div>
      <label class="sstc-dark-mode-toggle" :title="isDarkMode ? 'Turn off dark mode' : 'Turn on dark mode'">
        <span class="sstc-dark-mode-text">Dark mode</span>
        <span class="sstc-toggle-switch" :class="{ 'sstc-toggle-switch--on': isDarkMode }" aria-hidden="true">
          <span class="sstc-toggle-thumb"></span>
        </span>
        <input
          type="checkbox"
          class="sstc-dark-mode-input"
          :checked="isDarkMode"
          @change="onDarkModeToggle"
        />
      </label>
    </section>

    <!-- Club-wide banner + splashes (same API as main org dashboard) -->
    <div
      v-if="!loading && !dashboardError && clubDashboardBannerTexts.length"
      class="sstc-announcement-banner"
      role="region"
      aria-label="Club announcements"
    >
      <div class="sstc-announcement-inner">
        <div class="sstc-announcement-track">
          <span
            v-for="(t, idx) in clubDashboardBannerTexts"
            :key="`b-${idx}-${String(t).slice(0, 24)}`"
            class="sstc-announcement-item"
          >{{ t }}</span>
          <span
            v-for="(t, idx) in clubDashboardBannerTexts"
            :key="`br-${idx}-${String(t).slice(0, 24)}`"
            class="sstc-announcement-item"
            aria-hidden="true"
          >{{ t }}</span>
        </div>
      </div>
    </div>

    <section v-if="loading" class="card dash-section dash-section--loading">
      Loading your dashboard…
    </section>

    <section v-if="dashboardError" class="card card-error dash-section dash-section--error">
      {{ dashboardError }}
    </section>

    <section class="card dash-section dash-section--seasons-current">
      <div class="section-header">
        <div>
          <h2>Current and Upcoming Seasons</h2>
          <p>What's live now or coming up — stats here are for each season you're in.</p>
        </div>
      </div>
      <div v-if="currentSeasons.length" class="season-list">
        <div
          v-for="season in currentSeasons"
          :key="season.classId"
          class="season-card season-card--rich"
          :class="{ 'season-card--has-banner': !!season.bannerImagePath }"
        >
          <!-- Banner hero -->
          <div
            v-if="season.bannerImagePath"
            class="season-card-banner"
            :style="{ backgroundImage: `url(${resolveSeasonImgUrl(season.classId, 'banner')})` }"
          >
            <img
              v-if="season.logoImagePath"
              :src="resolveSeasonImgUrl(season.classId, 'logo')"
              class="season-card-logo"
              alt=""
            />
            <div class="season-card-banner-overlay">
              <div class="season-card-banner-title">{{ season.className }}</div>
              <div class="season-card-banner-club">{{ season.clubName }}</div>
            </div>
            <span class="pill season-card-pill" :class="pillClass(season.bucket)">
              {{ season.bucket === 'upcoming' ? 'Upcoming' : 'Current' }}
            </span>
          </div>

          <!-- Header (no banner fallback) -->
          <div v-else class="season-card-top">
            <div class="season-card-title-group">
              <img
                v-if="season.logoImagePath"
                :src="resolveSeasonImgUrl(season.classId, 'logo')"
                class="season-card-logo-inline"
                alt=""
              />
              <div>
                <strong>{{ season.className }}</strong>
                <div class="muted">{{ season.clubName }}</div>
              </div>
            </div>
            <span class="pill" :class="pillClass(season.bucket)">{{ season.bucket === 'upcoming' ? 'Upcoming' : 'Current' }}</span>
          </div>

          <!-- Body -->
          <div class="season-card-body">
            <div class="season-meta">
              <span v-if="season.teamName" class="season-team-badge">{{ season.teamName }}</span>
              <span class="season-dates">{{ formatSeasonDates(season) }}</span>
            </div>
            <div class="season-stats-row">
              <div class="season-stat">
                <span class="season-stat-val">{{ formatWhole(season.totalPoints) }}</span>
                <span class="season-stat-label">pts</span>
              </div>
              <div class="season-stat-divider" aria-hidden="true"></div>
              <div class="season-stat">
                <span class="season-stat-val">{{ formatDecimal(season.totalMiles) }}</span>
                <span class="season-stat-label">mi</span>
              </div>
              <div class="season-stat-divider" aria-hidden="true"></div>
              <div class="season-stat">
                <span class="season-stat-val">{{ formatWhole(season.workoutCount) }}</span>
                <span class="season-stat-label">workouts</span>
              </div>
            </div>
            <div class="season-card-actions">
              <button type="button" class="btn btn-primary btn-sm" @click="openSeason(season)">
                Open Season
              </button>
              <button
                v-if="season.bucket !== 'upcoming'"
                type="button"
                class="btn btn-upload btn-sm"
                @click="router.push({ path: `/${navSlug}/season/${season.classId}`, query: { openUpload: '1' } })"
              >⬆ Log Workout</button>
              <template v-if="isManagedClub(season.clubId)">
                <router-link
                  :to="`/${navSlug}/club/seasons?manageSeason=${season.classId}`"
                  class="btn btn-secondary btn-sm"
                >Manage</router-link>
                <router-link
                  :to="`/${navSlug}/club/seasons?editSeason=${season.classId}`"
                  class="btn btn-secondary btn-sm"
                >Edit</router-link>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>
          No current seasons yet.
          <router-link :to="`/${orgSlug}/clubs`" class="text-link">Browse clubs</router-link>
          or wait for the next season launch.
        </p>
      </div>

      <!-- Seasons open to join -->
      <template v-if="availableSeasons.length">
        <div class="available-seasons-divider">
          <span>Open to join</span>
        </div>
        <div class="season-list">
          <div
            v-for="season in availableSeasons"
            :key="`avail-${season.classId}`"
            class="season-card season-card--rich season-card--available"
            :class="{ 'season-card--has-banner': !!season.bannerImagePath }"
          >
            <div v-if="season.bannerImagePath" class="season-card-banner season-card-banner--sm"
              :style="{ backgroundImage: `url(${resolveSeasonImgUrl(season.classId, 'banner')})` }"
            >
              <img v-if="season.logoImagePath" :src="resolveSeasonImgUrl(season.classId, 'logo')" class="season-card-logo" alt="" />
              <div class="season-card-banner-overlay">
                <div class="season-card-banner-title">{{ season.className }}</div>
                <div class="season-card-banner-club">{{ season.clubName }}</div>
              </div>
              <span class="pill season-card-pill pill--open">Active</span>
            </div>
            <div v-else class="season-card-top">
              <div class="season-card-title-group">
                <img v-if="season.logoImagePath" :src="resolveSeasonImgUrl(season.classId, 'logo')" class="season-card-logo-inline" alt="" />
                <div>
                  <strong>{{ season.className }}</strong>
                  <div class="muted">{{ season.clubName }}</div>
                </div>
              </div>
              <span class="pill pill--open">Active</span>
            </div>
            <div class="season-card-body">
              <div class="season-meta">
                <span class="season-dates">{{ formatSeasonDates(season) }}</span>
              </div>
              <div class="season-card-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="joiningSeasonId === season.classId"
                  @click="joinAndOpenSeason(season)"
                >
                  {{ joiningSeasonId === season.classId ? 'Joining…' : 'Join Season' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>

    <section class="card my-stats-compact dash-section dash-section--my-stats">
      <div class="my-stats-compact-head">
        <h2>My stats</h2>
        <span class="muted">All-time (across seasons)</span>
      </div>
      <div class="my-stats-rows">
        <div class="my-stats-row">
          <span class="my-stats-kpi"><strong>{{ formatWhole(summary?.stats?.totalPoints) }}</strong> pts</span>
          <span class="my-stats-dot" aria-hidden="true">·</span>
          <span class="my-stats-kpi"><strong>{{ formatWhole(summary?.stats?.totalWorkouts) }}</strong> workouts</span>
          <span class="my-stats-dot" aria-hidden="true">·</span>
          <span class="my-stats-kpi"><strong>{{ formatDecimal(summary?.stats?.totalMiles) }}</strong> mi</span>
        </div>
        <div class="my-stats-row my-stats-row--secondary">
          <span>Longest run <strong>{{ formatDecimal(summary?.stats?.longestRunMiles) }}</strong> mi</span>
          <span class="my-stats-dot" aria-hidden="true">·</span>
          <span>Best workout <strong>{{ formatWhole(summary?.stats?.bestWorkoutPoints) }}</strong> pts</span>
          <span class="my-stats-dot" aria-hidden="true">·</span>
          <span>Longest <strong>{{ formatWhole(summary?.stats?.longestWorkoutMinutes) }}</strong> min</span>
        </div>
      </div>
    </section>

    <!-- ── Club Feed ──────────────────────────────────────────────── -->
    <section v-if="primaryClubId" class="card dash-section dash-section--club-feed">
      <ClubFeedPanel
        :club-id="Number(primaryClubId)"
        variant="member-home"
      />
    </section>

    <section class="card dash-section dash-section--strava">
      <div class="section-header">
        <div>
          <h2>Fitness integrations</h2>
          <p class="muted">Connect a fitness platform to import workouts into your season automatically or on demand.</p>
        </div>
      </div>

      <!-- Strava row -->
      <div class="integ-row" :class="{ 'integ-row--disabled': !stravaRolloutActive }">
        <img src="/logos/strava/compatible-with-strava.svg" class="integ-logo integ-logo--strava-mark" alt="Compatible with Strava" />
        <div class="integ-body">
          <div class="integ-name">Strava</div>
          <div v-if="stravaStatus?.connected" class="integ-status integ-status--connected">
            Connected as <strong>{{ stravaStatus.username || 'Strava athlete' }}</strong>
            <span v-if="stravaStatus.connectedAt" class="muted"> &middot; {{ formatStravaDate(stravaStatus.connectedAt) }}</span>
          </div>
          <div v-else class="integ-status">Not connected &mdash; use &ldquo;Import from Strava&rdquo; on your season dashboard after connecting.</div>
        </div>
        <div class="integ-action">
          <template v-if="stravaRolloutActive">
            <div v-if="stravaDisconnectError" class="inline-error" style="margin-bottom:6px;font-size:0.8em;">{{ stravaDisconnectError }}</div>
            <button v-if="stravaStatus?.connected" type="button" class="btn btn-secondary btn-sm" :disabled="stravaDisconnecting" @click="disconnectStrava">
              {{ stravaDisconnecting ? 'Disconnecting…' : 'Disconnect' }}
            </button>
            <span v-else-if="stravaStatus && !stravaStatus.stravaConfigured" class="integ-badge integ-badge--warn">Not configured</span>
            <a v-else :href="stravaConnectUrl" class="btn-strava-connect-image-link" aria-label="Connect with Strava">
              <img src="/logos/strava/connect-with-strava.svg" alt="Connect with Strava" class="btn-strava-connect-image" />
            </a>
          </template>
          <span v-else class="integ-badge integ-badge--soon">Pilot only</span>
        </div>
      </div>
      <p class="integ-attribution">
        Compatible with Strava. This application is independent and is not developed or sponsored by Strava.
      </p>
      <p class="integ-attribution integ-attribution--muted">
        Activity data sourced through Strava may include Garmin-origin data where applicable.
      </p>

      <!-- Garmin row (coming soon) -->
      <div class="integ-row integ-row--soon">
        <div class="integ-logo integ-logo--garmin">G</div>
        <div class="integ-body">
          <div class="integ-name">Garmin Connect <span class="integ-badge integ-badge--soon">Coming soon</span></div>
          <div class="integ-status">Full activity sync &mdash; same data as Strava (distance, HR, splits, calories).</div>
        </div>
        <div class="integ-action"><span class="integ-badge integ-badge--soon">Coming soon</span></div>
      </div>

      <!-- Future integrations -->
      <div class="integ-future-wrap">
        <button type="button" class="integ-future-toggle" @click="showFutureInteg = !showFutureInteg">
          {{ showFutureInteg ? '\u25b2 Hide' : '\u25be View' }} future integrations ({{ FUTURE_INTEGRATIONS.length }})
        </button>
        <div v-if="showFutureInteg" class="integ-future-grid">
          <div v-for="fi in FUTURE_INTEGRATIONS" :key="fi.name" class="integ-future-item">
            <div class="integ-future-name">{{ fi.name }}</div>
            <div class="integ-future-note">{{ fi.note }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid-two dash-section dash-section--club-account">
      <article class="card">
        <div class="section-header">
          <div>
            <h2>Club Access</h2>
            <p v-if="summary?.pendingClubAccess?.hasClub">Your active clubs and competition roles.</p>
            <p v-else>You're signed in to {{ SUMMIT_STATS_TEAM_CHALLENGE_NAME }}, but you still need a club to unlock the full competition experience.</p>
          </div>
        </div>

        <div v-if="memberships.length" class="stack-list">
          <div v-for="membership in memberships" :key="`${membership.clubId}-${membership.classId || 'club'}`" class="membership-card">
            <div class="membership-top">
              <div>
                <strong>{{ membership.clubName }}</strong>
                <div class="muted">{{ membershipLocation(membership) }}</div>
              </div>
              <span class="pill" :class="pillClass(membership.membershipStatus || membership.clubRole)">
                {{ membershipBadgeText(membership) }}
              </span>
            </div>
            <div class="membership-body">
              <div v-if="membership.teamName" class="meta-line">Team: {{ membership.teamName }}</div>
              <div v-if="membership.className" class="meta-line">Season: {{ membership.className }}</div>
              <div class="meta-line">
                {{ formatWhole(membership.totalPoints) }} pts • {{ formatDecimal(membership.totalMiles) }} mi • {{ formatWhole(membership.workoutCount) }} workouts
              </div>
            </div>
            <div class="membership-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="openClub(membership.clubId)">
                Open Club
              </button>
              <button
                v-if="isManagedClub(membership.clubId)"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="switchToClubContext(membership.clubId, 'settings')"
              >
                Club Settings
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>
            No active club memberships yet.
            <router-link :to="`/${orgSlug}/clubs`" class="text-link">Browse clubs</router-link>
            to find one.
          </p>
        </div>
      </article>

      <article ref="accountSnapshotCardRef" class="card account-snapshot-card">
        <div class="section-header section-header--account">
          <div>
            <h2>Account Snapshot</h2>
            <p>Your profile, preferences, and billing status.</p>
          </div>
          <div v-if="!accountEditing" class="account-header-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="startAccountEdit">
              Edit account
            </button>
          </div>
          <div v-else class="account-header-actions account-header-actions--edit">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="accountSaving" @click="cancelAccountEdit">
              Cancel
            </button>
            <button type="button" class="btn btn-primary btn-sm" :disabled="accountSaving" @click="saveAccountEdit">
              {{ accountSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>

        <div v-if="accountSaveError" class="inline-error account-inline-error">{{ accountSaveError }}</div>

        <div class="account-snapshot-layout">
          <div class="account-avatar-col">
            <div class="account-avatar" aria-hidden="true">
              <img v-if="profilePhotoDisplayUrl" :src="profilePhotoDisplayUrl" alt="" class="account-avatar-img" />
              <div v-else class="account-avatar-fallback">{{ accountInitials }}</div>
            </div>
            <input
              ref="accountPhotoInput"
              type="file"
              class="account-photo-input"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              @change="onAccountPhotoSelected"
            />
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="accountPhotoUploading || !userId"
              @click="accountPhotoInput?.click()"
            >
              {{ accountPhotoUploading ? 'Uploading…' : 'Change photo' }}
            </button>
            <p v-if="accountPhotoError" class="account-photo-error">{{ accountPhotoError }}</p>
            <p class="account-photo-hint muted">Shown on your club profile and team pages.</p>
          </div>

          <div class="account-snapshot-main">
            <template v-if="!accountEditing">
              <dl class="profile-grid">
                <div>
                  <dt>Name</dt>
                  <dd>{{ fullName }}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{{ summary?.member?.email || '—' }}</dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{{ summary?.member?.timezone || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Billing</dt>
                  <dd>{{ summary?.account?.billingPlan || 'Free account' }}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{{ summary?.account?.phone || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>City &amp; state (public)</dt>
                  <dd>{{ publicHomeLocationDisplay }}</dd>
                </div>
                <div class="profile-grid-row--wide">
                  <dt>Street &amp; ZIP (private)</dt>
                  <dd class="account-home-private-dd">{{ privateHomeAddressDisplay }}</dd>
                  <p class="account-home-privacy-note muted">
                    Only city and state appear on your public club profile. The full address powers local weather where available.
                  </p>
                </div>
                <div>
                  <dt>Gender</dt>
                  <dd>{{ summary?.account?.gender ? formatGenderOptionLabel(summary.account.gender) : 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Date of birth</dt>
                  <dd>{{ formatDOBDisplay(summary?.account?.dateOfBirth) }}</dd>
                </div>
                <div v-if="allowCustomPronouns">
                  <dt>Pronouns</dt>
                  <dd>{{ formatText(summary?.account?.pronouns) }}</dd>
                </div>
                <div>
                  <dt>Average miles / week</dt>
                  <dd>
                    {{ summary?.account?.averageMilesPerWeek == null ? 'Not set' : `${formatDecimal(summary.account.averageMilesPerWeek)} mi` }}
                  </dd>
                </div>
                <div>
                  <dt>Physical activity / week</dt>
                  <dd>
                    {{ summary?.account?.averageHoursPerWeek == null ? 'Not set' : `${formatDecimal(summary.account.averageHoursPerWeek)} hrs` }}
                  </dd>
                </div>
              </dl>

              <div class="long-answer-list">
                <div>
                  <h3>How you heard about the club</h3>
                  <p>{{ formatParagraph(summary?.account?.heardAboutClub) }}</p>
                </div>
                <div>
                  <h3>Running and fitness background</h3>
                  <p>{{ formatParagraph(summary?.account?.runningFitnessBackground) }}</p>
                </div>
                <div>
                  <h3>Current activities</h3>
                  <p>{{ formatParagraph(summary?.account?.currentFitnessActivities) }}</p>
                </div>
              </div>
            </template>

            <form v-else class="account-edit-form" @submit.prevent="saveAccountEdit">
              <div class="profile-grid profile-grid--edit">
                <label class="account-field">
                  First name
                  <input v-model="accountForm.firstName" type="text" autocomplete="given-name" />
                </label>
                <label class="account-field">
                  Last name
                  <input v-model="accountForm.lastName" type="text" autocomplete="family-name" />
                </label>
                <div class="account-field account-field--readonly">
                  <span class="account-field-label">Email</span>
                  <span class="account-readonly-value">{{ summary?.member?.email || '—' }}</span>
                </div>
                <div class="account-field account-field--readonly">
                  <span class="account-field-label">Billing</span>
                  <span class="account-readonly-value">{{ summary?.account?.billingPlan || 'Free account' }}</span>
                </div>
                <label class="account-field">
                  Timezone
                  <select v-model="accountForm.timezone" autocomplete="timezone">
                    <option value="">Not set</option>
                    <option v-if="timezoneExtraOption" :value="timezoneExtraOption">{{ timezoneExtraOption }} (current)</option>
                    <optgroup v-for="grp in TIMEZONE_GROUPS" :key="grp.label" :label="grp.label">
                      <option v-for="z in grp.zones" :key="z.value" :value="z.value">{{ z.label }}</option>
                    </optgroup>
                  </select>
                </label>
                <label class="account-field">
                  Phone
                  <input v-model="accountForm.phone" type="tel" autocomplete="tel" />
                </label>
                <div class="account-field account-field--block account-home-edit-block">
                  <span class="account-field-label">Home address</span>
                  <p class="account-home-privacy-note muted">
                    City and state are shared on your club’s public pages. Street and ZIP stay private and are used for weather.
                  </p>
                  <label class="account-field account-field--block account-field--inner">
                    Street address
                    <input
                      v-model="accountForm.homeStreetAddress"
                      type="text"
                      autocomplete="street-address"
                      placeholder="123 Main St"
                    />
                  </label>
                  <label class="account-field account-field--block account-field--inner">
                    Apt / suite (optional)
                    <input v-model="accountForm.homeAddressLine2" type="text" autocomplete="address-line2" />
                  </label>
                  <div class="account-home-city-state-zip">
                    <label class="account-field account-field--inner">
                      City
                      <input v-model="accountForm.homeCity" type="text" autocomplete="address-level2" />
                    </label>
                    <label class="account-field account-field--inner">
                      State
                      <input v-model="accountForm.homeState" type="text" autocomplete="address-level1" />
                    </label>
                    <label class="account-field account-field--inner">
                      ZIP / postal code
                      <input v-model="accountForm.homePostalCode" type="text" autocomplete="postal-code" />
                    </label>
                  </div>
                </div>
                <label class="account-field">
                  Gender
                  <select v-model="accountForm.genderSelect">
                    <option value="">Not set</option>
                    <option v-for="g in genderSelectChoices" :key="g" :value="g">{{ formatGenderOptionLabel(g) }}</option>
                  </select>
                </label>
                <label class="account-field">
                  Date of birth
                  <input v-model="accountForm.dateOfBirth" type="date" autocomplete="bday" />
                </label>
                <label v-if="allowCustomPronouns" class="account-field">
                  Pronouns
                  <input
                    v-model="accountForm.pronouns"
                    type="text"
                    maxlength="64"
                    placeholder="e.g., she/her, he/him, they/them"
                  />
                </label>
                <label class="account-field">
                  Average miles / week
                  <select v-model="accountForm.averageMilesPerWeek">
                    <option v-for="opt in averageMilesOptionsWithExtra" :key="`m-${opt.value}`" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </label>
                <label class="account-field">
                  Physical activity / week
                  <select v-model="accountForm.averageHoursPerWeek">
                    <option v-for="opt in physicalHoursOptionsWithExtra" :key="`h-${opt.value}`" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </label>
              </div>

              <div class="long-answer-list long-answer-list--edit">
                <label class="account-field account-field--block">
                  How you heard about the club
                  <textarea v-model="accountForm.heardAboutClub" rows="3" />
                </label>
                <label class="account-field account-field--block">
                  Running and fitness background
                  <textarea v-model="accountForm.runningFitnessBackground" rows="3" />
                </label>
                <label class="account-field account-field--block">
                  Current activities
                  <textarea v-model="accountForm.currentFitnessActivities" rows="3" />
                </label>
              </div>
            </form>
          </div>
        </div>

        <div class="membership-actions">
          <router-link :to="`/${orgSlug}/clubs`" class="btn btn-secondary btn-sm">
            Apply to a Club
          </router-link>
        </div>

        <!-- Security card -->
        <div v-if="!accountEditing" class="snapshot-security-card">
          <div class="snapshot-security-header">
            <strong>Security</strong>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="$router.push('/change-password')"
            >
              Change Password
            </button>
          </div>
          <p class="snapshot-security-hint">
            You can change your password at any time.
          </p>

          <!-- Biometric login toggle (native app only) -->
          <div v-if="biometricSupported" class="biometric-toggle-row">
            <div class="biometric-toggle-info">
              <strong>{{ biometricLabel }}</strong>
              <span class="biometric-toggle-hint">Sign in with {{ biometricLabel }} instead of typing your password.</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" :checked="biometricEnabled" @change="toggleBiometric" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </article>
    </section>

    <section class="card dash-section dash-section--past">
      <div class="section-header">
        <div>
          <h2>Past Seasons</h2>
          <p>Your completed season history and archived results.</p>
        </div>
      </div>
      <div v-if="pastSeasons.length" class="season-history">
        <button
          v-for="season in pastSeasons"
          :key="season.classId"
          type="button"
          class="season-history-row"
          @click="openSeason(season)"
        >
          <span>
            <strong>{{ season.className }}</strong>
            <span class="muted"> · {{ season.clubName }}</span>
          </span>
          <span>{{ formatWhole(season.totalPoints) }} pts</span>
        </button>
      </div>
      <div v-else class="empty-state">
        <p>No archived seasons yet.</p>
      </div>
    </section>

    <section v-if="managedClubs.length" class="dash-section dash-section--applications">
      <article class="card">
        <div class="section-header">
          <div>
            <h2>Manager Tools</h2>
            <p>Your club-scoped management access lives here, not in the personal dashboard header.</p>
          </div>
        </div>
        <div class="stack-list">
          <div v-for="club in managedClubs" :key="club.id" class="membership-card">
            <div class="membership-top">
              <div>
                <strong>{{ club.name }}</strong>
                <div class="muted">{{ membershipLocation(club) }}</div>
              </div>
              <span class="pill" :class="pillClass(club.club_role)">{{ clubRoleLabel(club.club_role) }}</span>
            </div>
            <div class="membership-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="switchToClubContext(club.id, 'dashboard')">
                Open Club
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="switchToClubContext(club.id, 'seasons')">
                Season Management
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="switchToClubContext(club.id, 'settings')">
                Club Settings
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- One-time splash (display_type: splash) — dismiss or remind in 24h -->
    <div
      v-if="currentClubSplash"
      class="sstc-blocking-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Club announcement"
    >
      <div class="sstc-blocking-splash-card">
        <div class="sstc-blocking-splash-head">
          <span class="sstc-blocking-splash-brand">{{ clubSplashBrandLabel }}</span>
        </div>
        <h3 class="sstc-blocking-splash-title">{{ clubSplashTitle }}</h3>
        <div v-if="currentClubSplash.splash_image_url" class="sstc-blocking-splash-image-wrap">
          <img :src="toUploadsUrl(currentClubSplash.splash_image_url)" alt="" class="sstc-blocking-splash-image" />
        </div>
        <p class="sstc-blocking-splash-message">{{ currentClubSplash.message || '' }}</p>
        <div v-if="currentClubSplash.ends_at" class="sstc-blocking-splash-meta">
          Scheduled through {{ formatClubSplashEndsAt(currentClubSplash.ends_at) }}
        </div>
        <div class="sstc-blocking-splash-actions">
          <button type="button" class="btn btn-secondary" @click="remindLaterClubSplash">Remind me later</button>
          <button type="button" class="btn btn-primary" @click="dismissClubSplash">Dismiss</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import { NATIVE_APP_ORG_SLUG, isSummitPlatformRouteSlug } from '../utils/summitPlatformSlugs.js';
import ClubFeedPanel from '../components/sstc/ClubFeedPanel.vue';
import {
  AVERAGE_MILES_PER_WEEK_OPTIONS,
  PHYSICAL_ACTIVITY_HOURS_OPTIONS
} from '../constants/sscAccountFormOptions.js';
import { TIMEZONE_GROUPS, ALL_TIMEZONES } from '../utils/timezones.js';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { setDarkMode } from '../utils/darkMode.js';
import {
  isNativePlatform,
  checkBiometricAvailability,
  hasSavedToken,
  saveBiometricToken,
  clearBiometricToken
} from '../utils/biometricAuth.js';
import api from '../services/api';
import { useAffiliationClubAnnouncements } from '../composables/useAffiliationClubAnnouncements.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const orgSlug = computed(() => String(route.params?.organizationSlug || 'sstc').toLowerCase());
// Always use the platform slug for season/dashboard navigation so the long club slug never leaks
const navSlug = computed(() => isSummitPlatformRouteSlug(orgSlug.value) ? orgSlug.value : NATIVE_APP_ORG_SLUG);

const loading = ref(false);
const dashboardError = ref('');
const summary = ref(null);
const applications = ref([]);
const clubContext = ref(null);
const contactingApplicationId = ref(null);

// Biometric login state
const biometricSupported = ref(false);
const biometricEnabled = ref(false);
const biometricLabel = ref('Face ID');

const initBiometric = async () => {
  if (!isNativePlatform()) return;
  const info = await checkBiometricAvailability();
  biometricSupported.value = info.available;
  if (info.available) {
    const type = String(info.biometryType || '').toLowerCase();
    if (type.includes('face')) biometricLabel.value = 'Face ID';
    else if (type.includes('touch') || type.includes('fingerprint')) biometricLabel.value = 'Touch ID';
    else biometricLabel.value = 'Biometric Login';
    biometricEnabled.value = await hasSavedToken();
  }
};

const toggleBiometric = async (e) => {
  const enabled = e.target.checked;
  if (enabled) {
    const token = authStore.token;
    const user = authStore.user;
    if (token) {
      await saveBiometricToken(token, user);
      biometricEnabled.value = true;
    }
  } else {
    await clearBiometricToken();
    biometricEnabled.value = false;
  }
};
const accountSnapshotCardRef = ref(null);
const accountEditing = ref(false);
const accountSaving = ref(false);
const accountSaveError = ref('');
const accountPhotoInput = ref(null);
const accountPhotoUploading = ref(false);
const accountPhotoError = ref('');
const accountForm = reactive({
  firstName: '',
  lastName: '',
  timezone: '',
  phone: '',
  homeStreetAddress: '',
  homeAddressLine2: '',
  homeCity: '',
  homeState: '',
  homePostalCode: '',
  genderSelect: '',
  pronouns: '',
  dateOfBirth: '',
  averageMilesPerWeek: '',
  averageHoursPerWeek: '',
  heardAboutClub: '',
  runningFitnessBackground: '',
  currentFitnessActivities: ''
});
const stravaStatus = ref(null);
const stravaDisconnecting = ref(false);
const stravaDisconnectError = ref('');
const showFutureInteg = ref(false);
const isDarkMode = ref(document.documentElement.getAttribute('data-theme') === 'dark');
const darkModeObserver = typeof document !== 'undefined'
  ? new MutationObserver(() => {
      isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark';
    })
  : null;

const FUTURE_INTEGRATIONS = [
  { name: 'Coros',         note: 'GPS running & multisport watches' },
  { name: 'Nike Run Club', note: 'Running & training tracking' },
  { name: 'Amazfit',       note: 'Zepp OS smartwatch platform' },
  { name: 'Oura Ring',     note: 'Readiness, sleep & activity ring' },
  { name: 'Samsung Health', note: 'Galaxy Watch & Health app' },
  { name: 'Peloton',       note: 'Cycling, running & strength classes' },
  { name: 'Suunto',        note: 'Sports & outdoor GPS watches' },
  { name: 'Zwift',         note: 'Virtual cycling & running platform' },
  { name: 'Polar',         note: 'Heart-rate & training load tracking' },
  { name: 'Apple Watch',   note: 'Workouts via Apple Health export' },
];
const stravaConnectUrl = computed(() => {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '') || window.location.origin;
  return `${base}/api/strava/connect`;
});
/** Backend sets stravaRolloutEnabled: false when account is not on the pilot allowlist. */
const stravaRolloutActive = computed(() => {
  const s = stravaStatus.value;
  if (s == null) return true;
  return s.stravaRolloutEnabled !== false;
});
const stravaRolloutDisabled = computed(
  () => stravaStatus.value && stravaStatus.value.stravaRolloutEnabled === false
);

const onDarkModeToggle = (event) => {
  const enabled = !!event?.target?.checked;
  const uid = authStore.user?.id;
  if (uid) setDarkMode(uid, enabled);
  isDarkMode.value = enabled;
};

const formatStravaDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

/** Affiliation club id for banner + splash APIs (current club or first member club). */
const announcementClubId = computed(() => {
  const raw = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const cur = raw || null;
  if (cur && String(cur.organization_type || cur.organizationType || '').toLowerCase() === 'affiliation') {
    const id = Number(cur.id || 0);
    return id > 0 ? id : null;
  }
  const list = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  const arr = Array.isArray(list) ? list : [];
  const aff = arr.find((a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation');
  return aff && Number(aff.id) > 0 ? Number(aff.id) : null;
});

const splashBrandLabelForAnnouncements = computed(() => {
  const m = summary.value?.memberships?.find((x) => Number(x?.clubId) === Number(announcementClubId.value));
  const name = String(m?.clubName || '').trim();
  return name || SUMMIT_STATS_TEAM_CHALLENGE_NAME;
});

const {
  clubDashboardBannerTexts,
  currentClubSplash,
  clubSplashTitle,
  clubSplashBrandLabel,
  formatClubSplashEndsAt,
  dismissClubSplash,
  remindLaterClubSplash
} = useAffiliationClubAnnouncements(announcementClubId, splashBrandLabelForAnnouncements);

const memberships = computed(() => Array.isArray(summary.value?.memberships) ? summary.value.memberships : []);

/** Primary club the user is affiliated with — used to render the ClubFeedPanel. */
const primaryClubId = computed(() => memberships.value?.[0]?.clubId ?? null);
const currentSeasons = computed(() => Array.isArray(summary.value?.seasons?.current) ? summary.value.seasons.current : []);
const pastSeasons = computed(() => Array.isArray(summary.value?.seasons?.past) ? summary.value.seasons.past : []);
const availableSeasons = computed(() => Array.isArray(summary.value?.seasons?.available) ? summary.value.seasons.available : []);
const joiningSeasonId = ref(null);
const pendingApplications = computed(() =>
  (applications.value || []).filter((app) => String(app.status || '').toLowerCase() === 'pending')
);
const managedClubs = computed(() => Array.isArray(clubContext.value?.managedClubs) ? clubContext.value.managedClubs : []);
const fullName = computed(() => {
  const first = String(summary.value?.member?.firstName || '').trim();
  const last = String(summary.value?.member?.lastName || '').trim();
  return `${first} ${last}`.trim() || 'Your account';
});

const publicHomeLocationDisplay = computed(() => {
  const a = summary.value?.account;
  const city = String(a?.homeCity || '').trim();
  const st = String(a?.homeState || '').trim();
  if (city && st) return `${city}, ${st}`;
  if (city || st) return city || st;
  return 'Not set';
});

const privateHomeAddressDisplay = computed(() => {
  const a = summary.value?.account;
  const line1 = String(a?.homeStreetAddress || '').trim();
  const line2 = String(a?.homeAddressLine2 || '').trim();
  const city = String(a?.homeCity || '').trim();
  const st = String(a?.homeState || '').trim();
  const zip = String(a?.homePostalCode || '').trim();
  const cityState = [city, st].filter(Boolean).join(', ');
  const tail = [cityState, zip].filter(Boolean).join(' ');
  const parts = [line1, line2, tail].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Not set';
});

const userId = computed(() => {
  const id = authStore.user?.id;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
});

const fetchStravaStatus = async () => {
  if (!userId.value) return;
  stravaDisconnectError.value = '';
  try {
    const r = await api.get('/strava/status', { skipGlobalLoading: true });
    stravaStatus.value = r.data || null;
  } catch {
    stravaStatus.value = null;
  }
};

const disconnectStrava = async () => {
  stravaDisconnectError.value = '';
  try {
    stravaDisconnecting.value = true;
    await api.delete('/strava/disconnect');
    stravaStatus.value = { ...stravaStatus.value, connected: false, username: null, connectedAt: null };
  } catch (e) {
    stravaDisconnectError.value = e?.response?.data?.error?.message || 'Failed to disconnect Strava.';
  } finally {
    stravaDisconnecting.value = false;
  }
};

const profilePhotoDisplayUrl = computed(() => {
  const fromDash = toUploadsUrl(summary.value?.member?.profilePhotoUrl);
  if (fromDash) return fromDash;
  const u = authStore.user?.profile_photo_url || authStore.user?.profilePhotoUrl || authStore.user?.profile_photo_path;
  return toUploadsUrl(u);
});

const genderSelectChoices = computed(
  () => summary.value?.accountSettings?.genderOptions || ['male', 'female']
);
const allowCustomPronouns = computed(() => summary.value?.accountSettings?.allowCustomPronouns === true);

const normalizeGenderKey = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const formatGenderOptionLabel = (g) => {
  const raw = String(g || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const timezoneExtraOption = computed(() => {
  const v = String(accountForm.timezone || '').trim();
  if (!v) return null;
  return ALL_TIMEZONES.some((z) => z.value === v) ? null : v;
});

const averageMilesOptionsWithExtra = computed(() => {
  const raw = String(accountForm.averageMilesPerWeek || '').trim();
  if (!raw) return AVERAGE_MILES_PER_WEEK_OPTIONS;
  if (AVERAGE_MILES_PER_WEEK_OPTIONS.some((o) => o.value === raw)) return AVERAGE_MILES_PER_WEEK_OPTIONS;
  return [
    { value: raw, label: `${raw} mi (current)` },
    ...AVERAGE_MILES_PER_WEEK_OPTIONS.filter((o) => o.value !== '')
  ];
});

const physicalHoursOptionsWithExtra = computed(() => {
  const raw = String(accountForm.averageHoursPerWeek || '').trim();
  if (!raw) return PHYSICAL_ACTIVITY_HOURS_OPTIONS;
  if (PHYSICAL_ACTIVITY_HOURS_OPTIONS.some((o) => o.value === raw)) return PHYSICAL_ACTIVITY_HOURS_OPTIONS;
  return [
    { value: raw, label: `${raw} hrs (current)` },
    ...PHYSICAL_ACTIVITY_HOURS_OPTIONS.filter((o) => o.value !== '')
  ];
});

const accountInitials = computed(() => {
  const first = String(
    (accountEditing.value ? accountForm.firstName : summary.value?.member?.firstName) || ''
  ).trim();
  const last = String(
    (accountEditing.value ? accountForm.lastName : summary.value?.member?.lastName) || ''
  ).trim();
  const a = first ? first[0] : '';
  const b = last ? last[0] : '';
  return `${a}${b}`.toUpperCase() || 'U';
});

const fillAccountFormFromSummary = () => {
  const m = summary.value?.member;
  const a = summary.value?.account;
  accountForm.firstName = String(m?.firstName || '').trim();
  accountForm.lastName = String(m?.lastName || '').trim();
  accountForm.timezone = String(m?.timezone || '').trim();
  accountForm.phone = String(a?.phone || '').trim();
  accountForm.homeStreetAddress = String(a?.homeStreetAddress || '').trim();
  accountForm.homeAddressLine2 = String(a?.homeAddressLine2 || '').trim();
  accountForm.homeCity = String(a?.homeCity || '').trim();
  accountForm.homeState = String(a?.homeState || '').trim();
  accountForm.homePostalCode = String(a?.homePostalCode || '').trim();

  const rawGender = String(a?.gender || '').trim();
  const opts = genderSelectChoices.value;
  if (!rawGender) {
    accountForm.genderSelect = '';
  } else {
    const match = opts.find((o) => normalizeGenderKey(o) === normalizeGenderKey(rawGender));
    if (match !== undefined) {
      accountForm.genderSelect = match;
    } else {
      accountForm.genderSelect = '';
    }
  }
  accountForm.pronouns = allowCustomPronouns.value ? String(a?.pronouns || '').trim() : '';
  accountForm.dateOfBirth = a?.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : '';

  accountForm.averageMilesPerWeek =
    a?.averageMilesPerWeek != null && Number.isFinite(Number(a.averageMilesPerWeek))
      ? String(Number(a.averageMilesPerWeek))
      : '';
  accountForm.averageHoursPerWeek =
    a?.averageHoursPerWeek != null && Number.isFinite(Number(a.averageHoursPerWeek))
      ? String(Number(a.averageHoursPerWeek))
      : '';
  accountForm.heardAboutClub = String(a?.heardAboutClub || '').trim();
  accountForm.runningFitnessBackground = String(a?.runningFitnessBackground || '').trim();
  accountForm.currentFitnessActivities = String(a?.currentFitnessActivities || '').trim();
};

const startAccountEdit = () => {
  accountSaveError.value = '';
  fillAccountFormFromSummary();
  accountEditing.value = true;
};

const cancelAccountEdit = () => {
  accountSaveError.value = '';
  accountEditing.value = false;
};

const parseOptionalDecimal = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const saveAccountEdit = async () => {
  accountSaving.value = true;
  accountSaveError.value = '';
  try {
    const genderPayload = accountForm.genderSelect.trim() || null;

    await api.put('/summit-stats/me/account-snapshot', {
      firstName: accountForm.firstName,
      lastName: accountForm.lastName,
      timezone: accountForm.timezone.trim() || null,
      phone: accountForm.phone.trim() || null,
      homeStreetAddress: accountForm.homeStreetAddress.trim() || null,
      homeAddressLine2: accountForm.homeAddressLine2.trim() || null,
      homeCity: accountForm.homeCity.trim() || null,
      homeState: accountForm.homeState.trim() || null,
      homePostalCode: accountForm.homePostalCode.trim() || null,
      gender: genderPayload,
      pronouns: allowCustomPronouns.value ? (accountForm.pronouns.trim() || null) : undefined,
      dateOfBirth: accountForm.dateOfBirth?.trim() || null,
      averageMilesPerWeek: parseOptionalDecimal(accountForm.averageMilesPerWeek),
      averageHoursPerWeek: parseOptionalDecimal(accountForm.averageHoursPerWeek),
      heardAboutClub: accountForm.heardAboutClub.trim() || null,
      runningFitnessBackground: accountForm.runningFitnessBackground.trim() || null,
      currentFitnessActivities: accountForm.currentFitnessActivities.trim() || null
    });
    accountEditing.value = false;
    await authStore.refreshUser();
    await loadDashboard();
  } catch (error) {
    accountSaveError.value =
      error?.response?.data?.error?.message || 'Could not save your profile. Please try again.';
  } finally {
    accountSaving.value = false;
  }
};

const onAccountPhotoSelected = async (event) => {
  accountPhotoError.value = '';
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  if (!userId.value) {
    accountPhotoError.value = 'Sign in required.';
    return;
  }
  const formData = new FormData();
  formData.append('photo', file);
  accountPhotoUploading.value = true;
  try {
    await api.post(`/users/${userId.value}/profile-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await authStore.refreshUser();
    await loadDashboard();
  } catch (error) {
    accountPhotoError.value = error?.response?.data?.error?.message || 'Failed to upload photo.';
  } finally {
    accountPhotoUploading.value = false;
    try {
      if (accountPhotoInput.value) accountPhotoInput.value.value = '';
    } catch {
      /* ignore */
    }
  }
};

const loadDashboard = async () => {
  loading.value = true;
  dashboardError.value = '';
  try {
    const [dashboardRes, applicationsRes, contextRes] = await Promise.all([
      api.get('/summit-stats/me/dashboard', { skipGlobalLoading: true }),
      api.get('/summit-stats/my-applications', { skipGlobalLoading: true }),
      api.get('/summit-stats/club-manager-context', { skipGlobalLoading: true })
    ]);
    summary.value = dashboardRes.data || null;
    applications.value = applicationsRes.data?.applications || [];
    clubContext.value = contextRes.data || null;
  } catch (error) {
    dashboardError.value =
      error?.response?.data?.error?.message || `Failed to load your ${SUMMIT_STATS_TEAM_CHALLENGE_NAME} dashboard.`;
  } finally {
    loading.value = false;
  }
};

const applicationBannerStyle = (application) => {
  const raw = String(application?.bannerImageUrl || '').trim();
  const bannerUrl = raw ? (toUploadsUrl(raw) || raw) : '';
  if (!bannerUrl) {
    return {
      background: 'linear-gradient(135deg, #0f3d7a 0%, #1d4ed8 48%, #f97316 100%)'
    };
  }
  return {
    backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.58)), url(${bannerUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };
};

const openPendingApplicationClub = (application) => {
  const clubRef = application?.publicClubRef || application?.clubSlug || application?.clubId;
  if (!clubRef) return;
  router.push(`/${orgSlug.value}/clubs/${clubRef}`);
};

const contactClubManagerFromApplication = async (application) => {
  const clubId = Number(application?.clubId || 0);
  if (!clubId) return;
  contactingApplicationId.value = Number(application.id || 0) || clubId;
  try {
    const { data } = await api.post(`/summit-stats/clubs/${clubId}/contact-manager`);
    router.push({
      path: `/${orgSlug.value}/messages`,
      query: {
        agencyId: String(data?.agencyId || ''),
        threadId: String(data?.threadId || '')
      }
    });
  } catch (error) {
    window.alert(error?.response?.data?.error?.message || 'Failed to open the club manager chat.');
  } finally {
    contactingApplicationId.value = null;
  }
};

const formatWhole = (value) => Number(value || 0).toLocaleString();
const formatDecimal = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const formatText = (value) => String(value || '').trim() || 'Not set';
const formatParagraph = (value) => String(value || '').trim() || 'Nothing added yet.';
const formatDOBDisplay = (raw) => {
  if (!raw) return 'Not set';
  let iso = String(raw).trim();
  // Convert MM/DD/YYYY → YYYY-MM-DD so Date parses it correctly
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) {
    const [m, d, y] = iso.split('/');
    iso = `${y}-${m}-${d}`;
  }
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return 'Not set';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};
const formatDate = (value) => {
  if (!value) return 'recently';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const resolveSeasonImgUrl = (classId, type = 'banner') => {
  if (!classId) return '';
  const apiBase = String(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
  return `${apiBase}/learning-program-classes/${classId}/${type}`;
};

const formatSeasonDates = (season) => {
  if (!season?.startsAt && !season?.endsAt) return 'Dates not set';
  const fmt = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (season.startsAt && season.endsAt) return `${fmt(season.startsAt)} - ${fmt(season.endsAt)}`;
  if (season.startsAt) return `Starts ${fmt(season.startsAt)}`;
  return `Ends ${fmt(season.endsAt)}`;
};
const membershipLocation = (entry) => [entry?.city, entry?.state].filter(Boolean).join(', ') || 'Location not set';
const clubRoleLabel = (role) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'assistant_manager') return 'Assistant manager';
  return 'Member';
};
const membershipBadgeText = (membership) => {
  if (membership?.clubRole) return clubRoleLabel(membership.clubRole);
  const status = String(membership?.membershipStatus || '').toLowerCase();
  if (status === 'active') return 'Active member';
  if (status === 'completed') return 'Past member';
  return 'Member';
};
const pillClass = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (['active', 'current', 'manager'].includes(normalized)) return 'pill--green';
  if (['upcoming', 'pending', 'assistant_manager'].includes(normalized)) return 'pill--blue';
  if (['denied', 'closed', 'archived'].includes(normalized)) return 'pill--red';
  return 'pill--neutral';
};

const currentUserAgencies = computed(() => {
  const list = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  return Array.isArray(list) ? list : [];
});

const switchToClubContext = async (clubId, target = 'dashboard') => {
  const match = currentUserAgencies.value.find((agency) => Number(agency?.id) === Number(clubId));
  if (match) {
    agencyStore.setCurrentAgency(match);
  }
  if (target === 'settings') {
    await router.push(`/${navSlug.value}/club/settings`);
    return;
  }
  if (target === 'seasons') {
    await router.push(`/${navSlug.value}/club/seasons`);
    return;
  }
  if (target === 'club_manager_dashboard') {
    await router.push(`/${navSlug.value}/club_manager_dashboard`);
    return;
  }
  await router.push(`/${navSlug.value}/my_club_dashboard`);
};

const openSeason = async (season) => {
  if (!season?.classId) return;
  await router.push(`/${navSlug.value}/season/${season.classId}`);
};

const joinAndOpenSeason = async (season) => {
  if (!season?.classId || joiningSeasonId.value) return;
  joiningSeasonId.value = season.classId;
  try {
    await api.post(`/learning-program-classes/${season.classId}/join`);
    await router.push(`/${navSlug.value}/season/${season.classId}`);
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Could not join season. Please try again.');
    joiningSeasonId.value = null;
  }
};

const openClub = async (clubId) => {
  const id = Number(clubId);
  if (!id) return;
  const match = currentUserAgencies.value.find((agency) => Number(agency?.id) === id);
  if (match) {
    agencyStore.setCurrentAgency(match);
  }
  await router.push(`/${orgSlug.value}/clubs/${id}`);
};

const isManagedClub = (clubId) => {
  const id = Number(clubId);
  if (managedClubs.value.some((club) => Number(club.id) === id)) return true;
  const roleNorm = (r) => String(r || '').toLowerCase();
  return memberships.value.some(
    (m) => Number(m.clubId) === id && ['manager', 'assistant_manager'].includes(roleNorm(m.clubRole))
  );
};

const scrollToAccountSnapshot = async () => {
  if (String(route.query?.view || '').trim().toLowerCase() !== 'account') return;
  await nextTick();
  const el = accountSnapshotCardRef.value;
  if (!el || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

onMounted(async () => {
  if (!currentUserAgencies.value.length) {
    await agencyStore.fetchUserAgencies();
  }
  if (darkModeObserver) {
    darkModeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  await loadDashboard();
  await fetchStravaStatus();
  await scrollToAccountSnapshot();
  initBiometric();
});

onBeforeUnmount(() => {
  if (darkModeObserver) darkModeObserver.disconnect();
});

watch(() => route.params.organizationSlug, () => {
  loadDashboard();
});

watch(
  () => [route.query?.view, loading.value],
  async ([view, isLoading]) => {
    if (isLoading) return;
    if (String(view || '').trim().toLowerCase() !== 'account') return;
    await scrollToAccountSnapshot();
  }
);

</script>

<style scoped>
.sstc-dashboard {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
  padding: 24px;
}

.dashboard-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  background: linear-gradient(135deg, #fff8ef 0%, #f8fbff 100%);
}

.sstc-dark-mode-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #0f172a;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
}

.sstc-dark-mode-text {
  white-space: nowrap;
}

.sstc-dark-mode-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.sstc-toggle-switch {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: #cbd5e1;
  padding: 3px;
  transition: background 0.2s ease;
}

.sstc-toggle-switch--on {
  background: linear-gradient(135deg, #2563eb 0%, #0f172a 100%);
}

.sstc-toggle-thumb {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.18);
  transform: translateX(0);
  transition: transform 0.2s ease;
}

.sstc-toggle-switch--on .sstc-toggle-thumb {
  transform: translateX(20px);
}

.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  color: #d97706;
  font-weight: 700;
}

.dashboard-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
}

.hero-copy {
  margin: 12px 0 0;
  max-width: 640px;
  color: #556274;
}

.text-link {
  color: #2563eb;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.text-link:hover {
  color: #1d4ed8;
}

.grid-two {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.my-stats-compact {
  padding: 14px 18px;
  max-width: 520px;
  margin-inline: auto;
  width: 100%;
}

.my-stats-compact-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.my-stats-compact-head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.my-stats-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.my-stats-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 0.95rem;
  color: #0f172a;
}

.my-stats-row--secondary {
  font-size: 0.82rem;
  color: #64748b;
}

.my-stats-row--secondary strong {
  color: #475569;
  font-weight: 700;
}

.my-stats-kpi strong {
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
}

.my-stats-dot {
  color: #cbd5e1;
  user-select: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.section-header h2 {
  margin: 0 0 6px;
  font-size: 1.2rem;
}

.section-header p {
  margin: 0;
  color: #64748b;
}

.section-header--account {
  flex-wrap: wrap;
  align-items: center;
}

.account-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.account-header-actions--edit {
  gap: 10px;
}

.account-inline-error {
  margin: 0 0 14px;
}

.account-snapshot-layout {
  display: grid;
  grid-template-columns: minmax(0, 140px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.account-avatar-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.account-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #e2e8f0;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-avatar-fallback {
  font-size: 1.75rem;
  font-weight: 800;
  color: #64748b;
}

.account-photo-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.account-photo-error {
  margin: 0;
  font-size: 0.82rem;
  color: #b91c1c;
}

.account-photo-hint {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  max-width: 140px;
}

.account-snapshot-main {
  min-width: 0;
}

.account-edit-form .account-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #0f172a;
  font-weight: 600;
  font-size: 0.82rem;
}

.account-field-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  font-weight: 700;
}

.account-field--readonly {
  padding-top: 2px;
}

.account-readonly-value {
  font-weight: 500;
  color: #0f172a;
  font-size: 0.95rem;
}

.account-field--block {
  grid-column: 1 / -1;
}

.account-edit-form input,
.account-edit-form textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 10px 12px;
  font: inherit;
  font-weight: 400;
  color: #0f172a;
}

.account-edit-form textarea {
  resize: vertical;
  min-height: 72px;
}

.account-edit-form select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 10px 12px;
  font: inherit;
  font-weight: 400;
  color: #0f172a;
  background: #fff;
}

.account-field-nested {
  margin-top: 8px;
}

.profile-grid--edit {
  margin-bottom: 14px;
}

.long-answer-list--edit {
  margin-top: 4px;
}

.stack-list {
  display: grid;
  gap: 14px;
}

.membership-card,
.application-card,
/* ── Season card base ─────────────────────────────────────────── */
.season-card {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px;
  background: #fbfdff;
}

.application-card--hero {
  padding: 0;
  overflow: hidden;
  border-radius: 22px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.10);
}

.application-card-banner {
  min-height: 180px;
  display: flex;
  align-items: flex-end;
  background: linear-gradient(135deg, #0f3d7a 0%, #1d4ed8 48%, #f97316 100%);
}

.application-card-banner-overlay {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px;
  color: #fff;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.68), rgba(15, 23, 42, 0.20));
}

.application-card-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.application-card-logo {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.94);
  padding: 8px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}

.application-card-brand h3 {
  margin: 0;
  font-size: 1.7rem;
  line-height: 1.1;
}

.application-card-eyebrow {
  margin: 0 0 6px;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.application-card-subtitle {
  margin: 8px 0 0;
  font-size: 0.98rem;
  color: rgba(255, 255, 255, 0.92);
}

.application-card-body {
  padding: 20px 22px 22px;
}

.application-card-copy {
  margin: 0;
  color: #526071;
}

.pill--pending-application {
  background: rgba(255, 255, 255, 0.92);
  color: #1d4ed8;
  font-weight: 800;
}

.season-card--rich {
  padding: 0;
  overflow: hidden;
  border-radius: 20px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.07);
  transition: box-shadow 0.2s;
}
.season-card--rich:hover { box-shadow: 0 4px 22px rgba(0,0,0,0.12); }

.season-card--available {
  border-color: #bfdbfe;
  background: #eff6ff;
}

/* Banner hero */
.season-card-banner {
  position: relative;
  height: 130px;
  background-size: cover;
  background-position: center;
  border-radius: 0;
  display: flex;
  align-items: flex-end;
}
.season-card-banner--sm { height: 90px; }
.season-card-banner-overlay {
  padding: 10px 14px 10px 14px;
  flex: 1;
  min-width: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.60) 0%, transparent 100%);
  border-radius: 0;
}
.season-card-banner-title {
  font-weight: 800;
  font-size: 1.05em;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.season-card-banner-club {
  font-size: 0.8em;
  color: rgba(255,255,255,0.8);
  margin-top: 1px;
}
.season-card-pill {
  position: absolute;
  top: 10px;
  right: 12px;
}
.season-card-logo {
  position: absolute;
  top: 10px;
  left: 12px;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: contain;
  background: rgba(255,255,255,0.9);
  padding: 3px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.18);
}

/* No-banner header */
.season-card-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 14px 16px 0;
}
.season-card-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}
.season-card-logo-inline {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: contain;
  background: #f1f5f9;
  padding: 3px;
  flex-shrink: 0;
}

/* Card body */
.season-card-body {
  padding: 12px 16px 14px;
}

.season-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* Stats row */
.season-stats-row {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 10px;
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px 14px;
  gap: 4px;
}
.season-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}
.season-stat-val {
  font-weight: 800;
  font-size: 1.1em;
  color: #0f172a;
  line-height: 1.1;
}
.season-stat-label {
  font-size: 0.72em;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.season-stat-divider {
  width: 1px;
  height: 30px;
  background: #e2e8f0;
  margin: 0 4px;
}

/* Meta */
.season-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  color: #64748b;
  font-size: 0.85em;
}
.season-team-badge {
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 600;
  font-size: 0.82em;
  white-space: nowrap;
}
.season-dates { color: #94a3b8; }

.available-seasons-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 20px 0 12px;
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.available-seasons-divider::before,
.available-seasons-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.pill--open {
  background: #dcfce7;
  color: #166534;
}

.membership-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.membership-body,
.season-totals {
  margin-top: 10px;
  color: #526071;
}

.meta-line + .meta-line {
  display: inline-block;
  margin-left: 10px;
}

.membership-actions,
.founder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.snapshot-security-card {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}
.snapshot-security-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.snapshot-security-hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: #6b7280;
}

/* Biometric toggle */
.biometric-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}
.biometric-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.biometric-toggle-hint {
  font-size: 12px;
  color: #6b7280;
}
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
}
.toggle-switch input { display: none; }
.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.2s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.toggle-switch input:checked + .toggle-slider { background: #16a34a; }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(22px); }

.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.pill--green {
  background: #dcfce7;
  color: #166534;
}

.pill--blue {
  background: #dbeafe;
  color: #1d4ed8;
}

.pill--red {
  background: #fee2e2;
  color: #b91c1c;
}

.pill--neutral {
  background: #e2e8f0;
  color: #334155;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0 0 18px;
}

.profile-grid dt {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  margin-bottom: 4px;
}

.profile-grid dd {
  margin: 0;
  color: #0f172a;
}

.profile-grid-row--wide {
  grid-column: 1 / -1;
}

.account-home-private-dd {
  font-weight: 500;
  line-height: 1.45;
}

.account-home-privacy-note {
  margin: 8px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.account-home-edit-block {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px 16px;
  background: #f8fafc;
  gap: 10px;
}

.account-home-edit-block > .account-field-label {
  display: block;
  margin-bottom: 2px;
}

.account-field--inner {
  font-weight: 600;
  font-size: 0.82rem;
  margin-top: 10px;
}

.account-field--inner:first-of-type {
  margin-top: 6px;
}

.account-home-city-state-zip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 2px;
}

@media (max-width: 640px) {
  .account-home-city-state-zip {
    grid-template-columns: 1fr;
  }
}

.long-answer-list {
  display: grid;
  gap: 14px;
}

.long-answer-list h3 {
  margin: 0 0 4px;
  font-size: 0.95rem;
}

.long-answer-list p,
.muted {
  margin: 0;
  color: #64748b;
}

.season-list,
.season-history {
  display: grid;
  gap: 14px;
}

.season-history-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.empty-state {
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  padding: 18px;
  color: #64748b;
}

.empty-state p {
  margin: 0 0 12px;
}

.founder-card--disabled {
  opacity: 0.9;
}

.founder-form {
  display: grid;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.founder-form label {
  display: grid;
  gap: 6px;
  color: #0f172a;
  font-weight: 600;
}

.founder-form input,
.founder-form textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 12px 14px;
  font: inherit;
  font-weight: 400;
}

.checkbox-row {
  grid-template-columns: auto 1fr;
  align-items: flex-start;
}

.checkbox-row input {
  width: auto;
  margin-top: 3px;
}

.founder-notice,
.inline-error,
.card-error {
  border-radius: 14px;
  padding: 14px 16px;
}

.founder-notice {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.inline-error,
.card-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.dash-section--strava .strava-dash-body {
  margin-top: 4px;
}
.dash-section--strava .strava-dash-line {
  margin: 0 0 12px;
  line-height: 1.5;
}
.dash-section--strava .strava-dash-error {
  margin-bottom: 10px;
}

.sstc-announcement-banner {
  background: linear-gradient(90deg, #eff6ff 0%, #ffffff 100%);
  border-left: 4px solid #2563eb;
  border-radius: 16px;
  padding: 8px 0;
  margin-bottom: 0;
  overflow: hidden;
  max-width: 100%;
  contain: paint;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.sstc-announcement-inner {
  overflow: hidden;
  width: 100%;
  max-width: 100%;
}
.sstc-announcement-track {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  /* Use transform (not padding-left) for the start position so it doesn't affect scroll/layout width */
  transform: translateX(100%);
  animation: sstcBannerMarquee 28s linear infinite;
  white-space: nowrap;
  color: #1d4ed8;
  font-weight: 600;
  font-size: clamp(14px, 3.5vw, 16px);
}
.sstc-announcement-banner:hover .sstc-announcement-track {
  animation-play-state: paused;
}
@keyframes sstcBannerMarquee {
  0% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(-50%);
  }
}

.sstc-blocking-splash {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(15, 23, 42, 0.72);
  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-bottom));
}
.sstc-blocking-splash-card {
  width: min(700px, 96vw);
  max-height: min(90vh, 900px);
  overflow-y: auto;
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 20px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.12);
}
.sstc-blocking-splash-head {
  margin-bottom: 8px;
}
.sstc-blocking-splash-brand {
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}
.sstc-blocking-splash-title {
  margin: 0 0 10px 0;
  color: #1d4ed8;
  font-size: clamp(22px, 6vw, 32px);
  line-height: 1.15;
}
.sstc-blocking-splash-image-wrap {
  margin: 0 0 12px 0;
  border-radius: 12px;
  overflow: hidden;
  background: #f1f5f9;
}
.sstc-blocking-splash-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(40vh, 360px);
  object-fit: contain;
}
.sstc-blocking-splash-message {
  margin: 0;
  color: #0f172a;
  font-size: clamp(16px, 4.2vw, 1.25rem);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.sstc-blocking-splash-meta {
  margin-top: 10px;
  color: #64748b;
  font-size: 12px;
}
.sstc-blocking-splash-actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .sstc-dashboard {
    padding: 10px 12px;
    gap: 12px;
  }

  .card {
    padding: 16px;
    border-radius: 16px;
  }

  .dashboard-hero,
  .grid-two,
  .form-row,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .account-snapshot-layout {
    grid-template-columns: 1fr;
  }

  .account-avatar-col {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .account-photo-hint {
    max-width: none;
  }

  .dashboard-hero {
    display: grid;
  }

  .sstc-dark-mode-toggle {
    justify-self: start;
  }

  .my-stats-row {
    justify-content: flex-start;
  }

  .membership-top,
  .season-card-top,
  .season-history-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .application-card-banner-overlay,
  .application-card-brand {
    flex-direction: column;
    align-items: flex-start;
  }

  .application-card-logo {
    width: 60px;
    height: 60px;
  }

  /* Season card: ensure everything fits within screen width */
  .season-card {
    max-width: 100%;
    overflow: hidden;
  }
  .season-totals {
    font-size: 0.82rem;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  .season-card-actions {
    gap: 6px;
  }
  .season-card-actions .btn {
    font-size: 0.78rem;
    padding: 5px 10px;
  }
  .season-meta {
    font-size: 0.82rem;
    word-break: break-word;
  }
}

/* ── Fitness Integrations shared styles ─────────────────────────── */
.integ-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.integ-row--soon    { opacity: 0.72; }
.integ-row--disabled { opacity: 0.5; }
.integ-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 900;
  color: white;
  flex-shrink: 0;
}
.integ-logo--strava  { background: #fc4c02; }
.integ-logo--garmin  { background: #007cc2; }
.integ-body { flex: 1; min-width: 0; }
.integ-name {
  font-weight: 700;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.integ-status { font-size: 0.82rem; color: var(--text-secondary, #64748b); margin-top: 2px; }
.integ-status--connected { color: #16a34a; font-weight: 600; }
.integ-action { flex-shrink: 0; }
.integ-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 7px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.integ-badge--soon { background: #e0f2fe; color: #0369a1; }
.integ-badge--warn { background: #fef9c3; color: #a16207; }
.btn-strava-connect-image-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
.btn-strava-connect-image {
  height: 48px;
  width: auto;
  max-width: 100%;
  display: block;
}
.integ-logo--strava-mark {
  width: 120px;
  height: auto;
  border-radius: 0;
  background: transparent;
  object-fit: contain;
  padding: 0;
}
.integ-attribution {
  margin: 10px 0 0;
  font-size: 12px;
  color: #334155;
}
.integ-attribution--muted {
  margin-top: 6px;
  color: #64748b;
}
.integ-future-wrap  { padding-top: 10px; }
.integ-future-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
}
.integ-future-toggle:hover { color: #0f172a; }
.integ-future-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.integ-future-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}
.integ-future-name { font-weight: 700; font-size: 0.82rem; }
.integ-future-note { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
.btn-upload {
  background: linear-gradient(135deg, #dc2626, #ef4444);
  color: #fff;
  border: none;
  font-weight: 700;
}
.btn-upload:hover { opacity: 0.88; }
</style>
