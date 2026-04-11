<template>
  <div class="challenge-dashboard">
    <div v-if="loading" class="loading">Loading season…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!challenge" class="empty-state">Season not found.</div>
    <div v-else class="challenge-detail">
      <div
        v-if="clubDashboardBannerTexts.length"
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
      <!-- Season announcement banner (collapsible, manager-editable) -->
      <div
        v-if="challenge.season_announcement_text && !seasonBannerDismissed"
        class="season-announcement-banner"
      >
        <span class="season-announcement-text">📢 {{ challenge.season_announcement_text }}</span>
        <button class="season-announcement-close" type="button" @click="seasonBannerDismissed = true" aria-label="Dismiss">✕</button>
      </div>

      <!-- Season Hero Banner -->
      <div
        v-if="challenge.banner_image_path"
        class="season-hero-banner"
        :style="{ backgroundImage: `url(${resolveSeasonAssetUrl(challenge.banner_image_path, 'banner')})`, backgroundPosition: `${challenge.banner_focal_x ?? 50}% ${challenge.banner_focal_y ?? 50}%` }"
      >
        <div class="season-hero-overlay">
          <img
            v-if="challenge.logo_image_path"
            :src="resolveSeasonAssetUrl(challenge.logo_image_path, 'logo')"
            class="season-hero-logo"
            :alt="challenge.class_name || 'Season logo'"
          />
          <div class="season-hero-info">
            <h1 class="season-hero-title">{{ challenge.class_name || challenge.className }}</h1>
            <span class="challenge-status-badge" :class="statusClass(challenge)">{{ formatStatus(challenge) }}</span>
          </div>
        </div>
      </div>

      <!-- Challenge Overview -->
      <div class="challenge-overview">
        <div class="challenge-overview-top">
          <router-link :to="backRoute" class="back-link">← Back to My Dashboard</router-link>
          <router-link
            v-if="isChallengeManager && organizationSlug"
            :to="`/${isSummitPlatformRouteSlug(organizationSlug) ? organizationSlug : NATIVE_APP_ORG_SLUG}/club/seasons?manageSeason=${challenge.id}`"
            class="btn btn-secondary btn-sm manage-season-btn"
          >⚙ Manage Season</router-link>
        </div>
        <div class="challenge-title-row" :class="{ 'challenge-title-row--has-banner': !!challenge.banner_image_path }">
          <div v-if="!challenge.banner_image_path" style="display:flex; align-items:center; gap:10px;">
            <img
              v-if="challenge.logo_image_path"
              :src="resolveSeasonAssetUrl(challenge.logo_image_path, 'logo')"
              class="season-inline-logo"
              :alt="challenge.class_name || 'Season logo'"
            />
            <h1>{{ challenge.class_name || challenge.className }}</h1>
          </div>
          <h1 v-else style="display:none" aria-hidden="true">{{ challenge.class_name || challenge.className }}</h1>
          <span class="challenge-status-badge" :class="statusClass(challenge)">{{ formatStatus(challenge) }}</span>
        </div>
        <p v-if="challenge.description" class="challenge-description">{{ challenge.description }}</p>
        <div v-if="challenge.starts_at || challenge.ends_at" class="challenge-dates hint">
          {{ formatDates(challenge) }}
        </div>

        <!-- Countdown row: daily + weekly -->
        <div class="countdown-row">
          <!-- Daily workout submission countdown -->
          <div v-if="dailyCountdown" class="week-countdown week-countdown--daily" :class="`week-countdown--${dailyCountdownClass}`">
            <span class="week-countdown__icon">🕐</span>
            <span class="week-countdown__text">
              <strong>{{ dailyCountdown }}</strong> to submit today's workouts
              <span v-if="dailyDeadlineLabel" class="week-countdown__deadline"> · Due {{ dailyDeadlineLabel }}</span>
            </span>
          </div>
          <!-- Weekly challenge deadline countdown -->
          <div v-if="weekCountdown" class="week-countdown" :class="`week-countdown--${weekCountdownClass}`">
            <span class="week-countdown__icon">⏱</span>
            <span class="week-countdown__text">
              <strong>{{ weekCountdown }}</strong> left to submit challenges this week
              <span v-if="weekDeadlineLabel" class="week-countdown__deadline"> · Deadline {{ weekDeadlineLabel }}</span>
            </span>
          </div>
        </div>
        <router-link
          v-if="challenge.organization_id"
          :to="`/club-store/${challenge.organization_id}`"
          class="club-store-link"
        >
          View Club Store
        </router-link>
        <div v-if="captainTeamId && challenge.organization_id" class="team-captain-msg-row">
          <button type="button" class="btn btn-secondary btn-sm" @click="openTeamMessageModal">
            Message your team
          </button>
          <span class="hint">Scheduled announcement to your team roster only.</span>
        </div>
        <!-- Live Draft banner — visible to all season participants when draft is live or pending -->
        <div v-if="draftSessionStatus === 'in_progress' || draftSessionStatus === 'pending'" class="live-draft-banner">
          <span v-if="draftSessionStatus === 'in_progress'" class="live-draft-dot" />
          <div class="live-draft-banner__text">
            <span v-if="draftSessionStatus === 'in_progress'" class="live-draft-banner__label">Team Draft Live Now</span>
            <span v-else class="live-draft-banner__label">Team Draft Starting Soon</span>
            <span class="live-draft-banner__sub">
              {{ draftSessionStatus === 'in_progress' ? 'Captains are picking their teams — watch live!' : 'The draft has been set up and is ready to start.' }}
            </span>
          </div>
          <router-link
            :to="`/${challenge.organization_id ? (agencySlugForDraft || organizationSlug) : organizationSlug}/season/${challengeId}/draft`"
            class="btn btn-primary btn-sm live-draft-banner__btn"
          >
            {{ draftSessionStatus === 'in_progress' ? 'Watch Live →' : 'View Draft Room →' }}
          </router-link>
        </div>
      </div>

      <!-- Not-enrolled call-to-action — shown at the top so visitors immediately see it -->
      <div v-if="!canParticipateInSeason && !requiresParticipationAcceptance" class="join-season-top-bar">
        <div class="join-season-top-content">
          <span class="join-season-top-msg">👀 You're viewing this season in read-only mode.</span>
          <button
            type="button"
            class="btn btn-primary join-season-top-btn"
            :disabled="joinSeasonBusy"
            @click="joinSeason"
          >
            {{ joinSeasonBusy ? 'Joining…' : 'Join this season' }}
          </button>
        </div>
        <p v-if="joinSeasonError" class="error-inline" style="margin-top:6px; text-align:center;">{{ joinSeasonError }}</p>
      </div>
      <div v-else-if="!canParticipateInSeason && requiresParticipationAcceptance" class="join-season-top-bar">
        <div class="join-season-top-content">
          <span class="join-season-top-msg">📋 Accept the participation agreement to start logging workouts.</span>
        </div>
      </div>

      <!-- Strava duplicate import notice -->
      <div v-if="stravaDuplicateMessage && !showStravaImportModal" class="strava-duplicate-notice" style="margin-bottom: 12px;">
        {{ stravaDuplicateMessage }}
        <button type="button" class="btn btn-ghost btn-sm" style="margin-left: 8px;" @click="stravaDuplicateMessage = ''">✕</button>
      </div>

      <!-- Quick-action bar -->
      <div v-if="canParticipateInSeason" class="season-action-bar">
        <button type="button" class="season-action-btn season-action-btn--primary" @click="showLogWorkoutModal = true">
          <span class="season-action-icon">+</span> Log Workout
        </button>
        <button v-if="stravaImportAvailable" type="button" class="season-action-btn season-action-btn--strava" @click="openStravaImportModal">
          Import from Strava
        </button>
      </div>

      <!-- Section scroll nav -->
      <nav class="dash-section-nav" aria-label="Jump to section">
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-activity')">Activity</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-chat')">Chat</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-leaderboard')">Leaderboard</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-scoreboard')">Scoreboard</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-team-progress')">Team Progress</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-summary')">Summary</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-weekly-challenges')">Weekly Challenges</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-rules')">Season Rules</button>
      </nav>

      <div class="challenge-sections">
        <!-- Activity feed — full-width, dominant, the main interaction surface -->
        <div id="section-activity" class="challenge-feed-full">
          <ChallengeActivityFeed
            :workouts="activity"
            :loading="activityLoading"
            :challenge-id="challengeId"
            :my-user-id="authStore.user?.id"
            :my-team-id="myTeamId"
            :is-manager="isChallengeManager"
            :activity-type-options="activityTypeOptions"
            :club-id="challenge?.organization_id"
            :weekly-task-options="weeklyTaskOptions"
            @media-uploaded="refreshAfterActivityAction"
          />
        </div>

        <!-- Season / Team chat — full-width below the feed -->
        <div id="section-chat" class="challenge-chat-full">
          <ChallengeMessageFeed
            :challenge-id="challengeId"
            :my-user-id="authStore.user?.id"
            :is-manager="isChallengeManager"
          />
        </div>

        <div class="challenge-two-col">
          <div class="challenge-col-left">
            <div id="section-leaderboard" class="challenge-section">
              <ChallengeLeaderboard :leaderboard="leaderboard" :loading="leaderboardLoading" />
            </div>
            <div id="section-scoreboard" class="challenge-section">
              <ChallengeScoreboard :challenge-id="challengeId" :season-starts-at="challenge?.starts_at || challenge?.startsAt" :season-ends-at="challenge?.ends_at || challenge?.endsAt" />
            </div>
            <div id="section-team-progress" class="challenge-section">
              <ChallengeTeamWeeklyProgress :challenge-id="challengeId" :season-starts-at="challenge?.starts_at || challenge?.startsAt" :season-ends-at="challenge?.ends_at || challenge?.endsAt" />
            </div>
            <div id="section-summary" class="challenge-section">
              <h2>📈 Weekly + Season Summary</h2>
              <div v-if="seasonSummaryLoading" class="loading-inline">Loading summary…</div>
              <div v-else-if="!seasonSummary" class="hint">Summary data will appear after workouts are logged.</div>
              <div v-else class="summary-grid">
                <div class="summary-card">
                  <h4>Top Athletes (Week)</h4>
                  <ol>
                    <li v-for="r in seasonSummary.weeklySummary?.topAthletes || []" :key="`wa-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ formatPts(r.total_points) }} pts
                    </li>
                  </ol>
                </div>
                <div class="summary-card">
                  <h4>Top Teams (Week)</h4>
                  <ol>
                    <li v-for="r in seasonSummary.weeklySummary?.topTeams || []" :key="`wt-${r.team_id}`">
                      {{ r.team_name }} — {{ formatPts(r.total_points) }} pts
                    </li>
                  </ol>
                </div>
                <div class="summary-card">
                  <h4>Season Standings</h4>
                  <div class="hint" style="margin-bottom: 6px;">
                    Club totals: {{ formatPts(seasonSummary.weeklySummary?.seasonPointsTotal) }} pts ·
                    {{ Number(seasonSummary.weeklySummary?.seasonMilesTotal || 0).toFixed(2) }} miles
                  </div>
                  <div><strong>Top Individuals</strong></div>
                  <ol>
                    <li v-for="r in seasonSummary.seasonStandings?.topIndividuals || []" :key="`si-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ formatPts(r.total_points) }} pts<template v-if="r.total_miles > 0"> · {{ Number(r.total_miles).toFixed(2) }} mi</template>
                    </li>
                  </ol>
                  <div><strong>Top Masters</strong></div>
                  <ol>
                    <li v-for="r in seasonSummary.seasonStandings?.topMasters || []" :key="`sm-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ formatPts(r.total_points) }} pts
                    </li>
                  </ol>
                  <div><strong>Top Ladies</strong></div>
                  <ol>
                    <li v-for="r in seasonSummary.seasonStandings?.topLadies || []" :key="`sl-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ formatPts(r.total_points) }} pts
                    </li>
                  </ol>
                </div>
              </div>
            </div>
            <div class="challenge-section">
              <h2>Club Records</h2>
              <div v-if="recordBoardsLoading" class="loading-inline">Loading records…</div>
              <div v-else class="summary-grid">
                <div class="summary-card">
                  <h4>Current Season Records</h4>
                  <ul>
                    <li v-for="r in recordBoards.seasonRecords || []" :key="`season-record-${r.metricKey}`">
                      <strong>{{ r.label }}:</strong> {{ r.holderName }} ({{ r.valueText }})
                    </li>
                  </ul>
                  <div v-if="!(recordBoards.seasonRecords || []).length" class="hint">No season records yet.</div>
                </div>
                <div class="summary-card">
                  <h4>Club All-Time Board</h4>
                  <ul>
                    <li v-for="r in recordBoards.clubAllTimeRecords || []" :key="`alltime-record-${r.metricKey}`">
                      <strong>{{ r.label }}:</strong> {{ r.holderName }} ({{ r.valueText }})
                    </li>
                  </ul>
                  <div v-if="!(recordBoards.clubAllTimeRecords || []).length" class="hint">No all-time records yet.</div>
                </div>
              </div>
            </div>

            <!-- Race Divisions -->
            <div class="challenge-section">
              <h2>Race Divisions</h2>
              <p class="section-hint">Members are auto-enrolled when they log a qualifying run distance.</p>
              <div v-if="raceDivisionsLoading" class="loading-inline">Loading race divisions…</div>
              <div v-else class="race-divisions-grid">
                <!-- Half Marathon Club -->
                <div class="race-division-card">
                  <div class="race-division-header hm-header">
                    <span class="race-badge">🏃 13.1</span>
                    <div>
                      <h4>Half Marathon Club</h4>
                      <p class="race-threshold">Runs of 13.1+ miles</p>
                    </div>
                  </div>
                  <div class="race-tabs">
                    <button
                      class="race-tab-btn"
                      :class="{ active: raceDivisionTab === 'season' }"
                      @click="raceDivisionTab = 'season'"
                    >This Season</button>
                    <button
                      class="race-tab-btn"
                      :class="{ active: raceDivisionTab === 'alltime' }"
                      @click="raceDivisionTab = 'alltime'"
                    >All-Time</button>
                  </div>
                  <ul class="race-members-list" v-if="raceDivisionTab === 'season'">
                    <li v-for="m in raceDivisions.halfMarathon?.season || []" :key="`hm-s-${m.userId}`">
                      <span class="race-member-name">{{ m.name }}</span>
                      <span class="race-member-time">{{ m.bestTimeText }}</span>
                      <span v-if="m.completionCount > 1" class="race-member-count">×{{ m.completionCount }}</span>
                    </li>
                    <li v-if="!(raceDivisions.halfMarathon?.season || []).length" class="race-empty">No season entries yet.</li>
                  </ul>
                  <ul class="race-members-list" v-else>
                    <li v-for="m in raceDivisions.halfMarathon?.allTime || []" :key="`hm-a-${m.userId}`">
                      <span class="race-member-name">{{ m.name }}</span>
                      <span class="race-member-time">{{ m.bestTimeText }}</span>
                      <span v-if="m.completionCount > 1" class="race-member-count">×{{ m.completionCount }}</span>
                    </li>
                    <li v-if="!(raceDivisions.halfMarathon?.allTime || []).length" class="race-empty">No all-time entries yet.</li>
                  </ul>
                </div>

                <!-- Marathon Club -->
                <div class="race-division-card">
                  <div class="race-division-header marathon-header">
                    <span class="race-badge">🏅 26.2</span>
                    <div>
                      <h4>Marathon Club</h4>
                      <p class="race-threshold">Runs of 26.2+ miles</p>
                    </div>
                  </div>
                  <div class="race-tabs">
                    <button
                      class="race-tab-btn"
                      :class="{ active: raceDivisionTab === 'season' }"
                      @click="raceDivisionTab = 'season'"
                    >This Season</button>
                    <button
                      class="race-tab-btn"
                      :class="{ active: raceDivisionTab === 'alltime' }"
                      @click="raceDivisionTab = 'alltime'"
                    >All-Time</button>
                  </div>
                  <ul class="race-members-list" v-if="raceDivisionTab === 'season'">
                    <li v-for="m in raceDivisions.marathon?.season || []" :key="`m-s-${m.userId}`">
                      <span class="race-member-name">{{ m.name }}</span>
                      <span class="race-member-time">{{ m.bestTimeText }}</span>
                      <span v-if="m.completionCount > 1" class="race-member-count">×{{ m.completionCount }}</span>
                    </li>
                    <li v-if="!(raceDivisions.marathon?.season || []).length" class="race-empty">No season entries yet.</li>
                  </ul>
                  <ul class="race-members-list" v-else>
                    <li v-for="m in raceDivisions.marathon?.allTime || []" :key="`m-a-${m.userId}`">
                      <span class="race-member-name">{{ m.name }}</span>
                      <span class="race-member-time">{{ m.bestTimeText }}</span>
                      <span v-if="m.completionCount > 1" class="race-member-count">×{{ m.completionCount }}</span>
                    </li>
                    <li v-if="!(raceDivisions.marathon?.allTime || []).length" class="race-empty">No all-time entries yet.</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Kudos Stats Section -->
            <div v-if="kudosStats || kudosStatsLoading" class="challenge-section kudos-stats-section">
              <h2>👊 Kudos This Week</h2>
              <div v-if="kudosStatsLoading" class="loading-inline">Loading kudos…</div>
              <div v-else-if="kudosStats" class="kudos-stats-content">
                <!-- My budget pill -->
                <div class="kudos-budget-pill">
                  <span class="kudos-budget-remaining">{{ kudosStats.myBudget?.remaining ?? 2 }}</span>
                  <span class="kudos-budget-label">/ 2 kudos left this week</span>
                </div>

                <div class="kudos-stats-grid">
                  <!-- Most kudos received (individual) -->
                  <div class="kudos-stat-card" v-if="kudosStats.weekly?.topReceived?.length">
                    <div class="kudos-stat-title">🏆 Most Kudos Received</div>
                    <div
                      v-for="(p, i) in kudosStats.weekly.topReceived.slice(0, 5)"
                      :key="`kr-${i}`"
                      class="kudos-stat-row"
                    >
                      <span class="kudos-rank">{{ i + 1 }}</span>
                      <span class="kudos-name">{{ p.first_name }} {{ p.last_name }}</span>
                      <span class="kudos-num">{{ p.kudos_received }}</span>
                    </div>
                  </div>

                  <!-- Most kudos given (most generous) -->
                  <div class="kudos-stat-card" v-if="kudosStats.weekly?.topGiven?.length">
                    <div class="kudos-stat-title">💪 Most Generous</div>
                    <div
                      v-for="(p, i) in kudosStats.weekly.topGiven.slice(0, 5)"
                      :key="`kg-${i}`"
                      class="kudos-stat-row"
                    >
                      <span class="kudos-rank">{{ i + 1 }}</span>
                      <span class="kudos-name">{{ p.first_name }} {{ p.last_name }}</span>
                      <span class="kudos-num">{{ p.kudos_given }}</span>
                    </div>
                  </div>

                  <!-- Top workout this week -->
                  <div class="kudos-stat-card" v-if="kudosStats.weekly?.topWorkout?.length">
                    <div class="kudos-stat-title">🔥 Most Kudoed Workout</div>
                    <div
                      v-for="(w, i) in kudosStats.weekly.topWorkout.slice(0, 3)"
                      :key="`kw-${i}`"
                      class="kudos-stat-row"
                    >
                      <span class="kudos-rank">{{ i + 1 }}</span>
                      <span class="kudos-name">{{ w.first_name }} {{ w.last_name }} — {{ w.activity_type }}</span>
                      <span class="kudos-num">{{ w.kudos_count }}</span>
                    </div>
                  </div>

                  <!-- Team — most received from other teams -->
                  <div class="kudos-stat-card" v-if="kudosStats.weekly?.teamMostReceived?.length">
                    <div class="kudos-stat-title">🤝 Most Cross-Team Kudos Received</div>
                    <div
                      v-for="(t, i) in kudosStats.weekly.teamMostReceived.slice(0, 3)"
                      :key="`ktr-${i}`"
                      class="kudos-stat-row"
                    >
                      <span class="kudos-rank">{{ i + 1 }}</span>
                      <span class="kudos-name">{{ t.team_name }}</span>
                      <span class="kudos-num">{{ t.kudos_received }}</span>
                    </div>
                  </div>

                  <!-- Team — gave most to other teams -->
                  <div class="kudos-stat-card" v-if="kudosStats.weekly?.teamMostGivenCross?.length">
                    <div class="kudos-stat-title">🌍 Most Kudos Given Cross-Team</div>
                    <div
                      v-for="(t, i) in kudosStats.weekly.teamMostGivenCross.slice(0, 3)"
                      :key="`ktc-${i}`"
                      class="kudos-stat-row"
                    >
                      <span class="kudos-rank">{{ i + 1 }}</span>
                      <span class="kudos-name">{{ t.team_name }}</span>
                      <span class="kudos-num">{{ t.kudos_given }}</span>
                    </div>
                  </div>

                  <!-- Team — gave most within own team -->
                  <div class="kudos-stat-card" v-if="kudosStats.weekly?.teamMostGivenIntra?.length">
                    <div class="kudos-stat-title">❤️ Most Team Spirit</div>
                    <div
                      v-for="(t, i) in kudosStats.weekly.teamMostGivenIntra.slice(0, 3)"
                      :key="`kti-${i}`"
                      class="kudos-stat-row"
                    >
                      <span class="kudos-rank">{{ i + 1 }}</span>
                      <span class="kudos-name">{{ t.team_name }}</span>
                      <span class="kudos-num">{{ t.kudos_given_intra }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="hint">No kudos given this week yet. Be the first!</p>
            </div>
          </div>
        </div>

        <div class="challenge-section">
          <ChallengeTeamList :teams="teams" :loading="teamsLoading" />
        </div>
        <div class="challenge-section">
          <ChallengeEliminationBoard :challenge-id="challengeId" :is-manager="isChallengeManager" :season-starts-at="challenge?.starts_at || challenge?.startsAt" />
        </div>
        <div v-if="isChallengeManager || isTeamCaptain" class="challenge-section">
          <ChallengeDraftReport :challenge-id="challengeId" :can-edit="isChallengeManager" />
        </div>
        <div v-if="treadmillpocalypseWeek" class="challenge-section treadmillpocalypse-banner">
          <div class="treadmillpocalypse-inner">
            <img v-if="treadmillpocalypseIconUrl" :src="treadmillpocalypseIconUrl" class="treadmillpocalypse-icon" alt="" />
            <div class="treadmillpocalypse-text">
              <strong>🚫 Treadmillpocalypse Week</strong>
              <span>Outdoor GPS workouts only — no treadmill allowed this week.</span>
            </div>
          </div>
        </div>
        <div id="section-weekly-challenges" class="challenge-section">
          <ChallengeWeeklyTasks :challenge-id="challengeId" :my-user-id="authStore.user?.id" :is-captain="isTeamCaptain" :season-starts-at="challenge?.starts_at || challenge?.startsAt" :season-ends-at="challenge?.ends_at || challenge?.endsAt" />
        </div>

        <!-- Captain Applications — manager view + member apply UI -->
        <section
          v-if="isChallengeManager || (canParticipateInSeason && captainApplicationOpen && !isTeamCaptain)"
          class="challenge-section"
        >
          <h2>Captain Applications</h2>

          <!-- ── Member: show own application status or apply form ── -->
          <template v-if="!isChallengeManager">
            <!-- Already applied -->
            <template v-if="myOwnCaptainApp">
              <div class="captain-app-card captain-app-card--mine">
                <div class="captain-app-header">
                  <span>Your application</span>
                  <span class="captain-app-status" :class="`status-${String(myOwnCaptainApp.status || '').toLowerCase()}`">
                    {{ myOwnCaptainApp.status }}
                  </span>
                </div>
                <p v-if="myOwnCaptainApp.application_text" class="hint">{{ myOwnCaptainApp.application_text }}</p>
                <p v-if="myOwnCaptainApp.manager_notes" class="hint" style="color:#c8102e;">Manager note: {{ myOwnCaptainApp.manager_notes }}</p>
              </div>
            </template>
            <!-- Not yet applied -->
            <template v-else>
              <p class="hint" style="margin-bottom:12px;">Interested in leading a team? Submit your captain application below — the season manager will review it.</p>
              <form class="captain-apply-form" @submit.prevent="submitCaptainApplication">
                <textarea
                  v-model="captainApplyText"
                  class="captain-apply-textarea"
                  placeholder="Tell the manager why you'd be a great team captain (optional)…"
                  rows="3"
                  maxlength="1000"
                  :disabled="captainApplySubmitting"
                />
                <div class="captain-apply-actions">
                  <button type="submit" class="btn btn-primary" :disabled="captainApplySubmitting">
                    {{ captainApplySubmitting ? 'Submitting…' : 'Apply for Captain' }}
                  </button>
                  <span v-if="captainApplyError" class="error-inline">{{ captainApplyError }}</span>
                </div>
              </form>
            </template>
          </template>

          <!-- ── Manager: full applications list + controls ── -->
          <template v-else>
            <div v-if="captainAppsLoading" class="loading-inline">Loading applications…</div>
            <div v-else-if="captainAppsError" class="error-inline">{{ captainAppsError }}</div>
            <div v-else class="captain-apps-list">
              <div v-if="!captainApplications.length" class="empty-hint">No captain applications yet.</div>
              <article
                v-for="app in captainApplications"
                :key="`captain-app-${app.id}`"
                class="captain-app-card"
              >
                <div class="captain-app-header">
                  <strong>{{ app.first_name }} {{ app.last_name }}</strong>
                  <span class="captain-app-status" :class="`status-${String(app.status || '').toLowerCase()}`">{{ app.status }}</span>
                </div>
                <p v-if="app.application_text" class="hint">{{ app.application_text }}</p>
                <p v-if="app.manager_notes" class="hint">Manager note: {{ app.manager_notes }}</p>
                <div v-if="String(app.status || '').toLowerCase() === 'pending'" class="captain-app-actions">
                  <button class="btn btn-primary btn-small" @click="reviewCaptain(app.id, 'approved')">Approve</button>
                  <button class="btn btn-secondary btn-small" @click="reviewCaptain(app.id, 'rejected')">Reject</button>
                </div>
              </article>
            </div>
            <div class="captain-finalize">
              <button class="btn btn-secondary" :disabled="captainsFinalizeSubmitting" @click="finalizeCaptainsForSeason">
                {{ captainsFinalizeSubmitting ? 'Finalizing…' : 'Finalize Captains' }}
              </button>
              <span class="hint">This closes captain applications for the season.</span>
            </div>
          </template>
        </section>

        <!-- Weekly Challenges Display -->
        <section v-if="weeklyTaskOptions.length" class="challenge-section">
          <h2>This Week's Challenges</h2>
          <div class="weekly-task-cards">
            <div
              v-for="task in weeklyTaskOptions"
              :key="`task-card-${task.id}`"
              class="weekly-task-display-card"
              :class="{ 'task-season-long': Number(task.is_season_long) === 1 }"
            >
              <div class="task-display-header">
                <strong class="task-display-name">{{ task.name }}</strong>
                <span v-if="Number(task.is_season_long) === 1" class="task-badge task-badge-season">Season Challenge</span>
                <span v-else class="task-badge task-badge-week">Week</span>
              </div>
              <p v-if="task.description" class="task-display-desc">{{ task.description }}</p>

              <!-- Criteria summary chips -->
              <div v-if="taskCriteriaSummary(task).length" class="task-criteria-chips">
                <span v-for="chip in taskCriteriaSummary(task)" :key="chip" class="criteria-chip">{{ chip }}</span>
              </div>

              <!-- Split-run progress -->
              <div v-if="splitRunProgress(task)" class="split-run-progress">
                {{ splitRunProgress(task).logged }} of {{ splitRunProgress(task).required }} logged
                <span class="split-run-checks">
                  <span v-for="n in splitRunProgress(task).required" :key="n" :class="n <= splitRunProgress(task).logged ? 'split-check done' : 'split-check pending'">
                    {{ n <= splitRunProgress(task).logged ? '✓' : '○' }}
                  </span>
                </span>
              </div>

              <!-- Tag to workout button shortcut -->
              <button
                class="btn btn-sm btn-secondary task-tag-btn"
                @click="workoutForm.weeklyTaskId = task.id"
                :class="{ 'task-tag-active': Number(workoutForm.weeklyTaskId) === Number(task.id) }"
              >
                {{ Number(workoutForm.weeklyTaskId) === Number(task.id) ? '✓ Tagged to Log Workout' : 'Tag to Workout' }}
              </button>
            </div>
          </div>
        </section>


        <!-- Season Rules — pinned to the bottom, reachable via nav anchor -->
        <div id="section-rules" class="challenge-section">
          <ChallengeRules :challenge="challenge" />
        </div>

        <!-- Log Workout Modal -->
        <div v-if="showLogWorkoutModal" class="modal-overlay" @click.self="showLogWorkoutModal = false">
          <div class="modal-content modal-wide log-workout-modal" @click.stop>
            <div class="log-workout-modal-header">
              <h2>Log Workout</h2>
              <button type="button" class="modal-close-btn" @click="showLogWorkoutModal = false">✕</button>
            </div>
            <form class="workout-form" @submit.prevent="submitWorkout">

              <!-- ① Workout screenshot — primary data source via Vision OCR -->
              <div class="workout-upload-section">
                <div class="workout-upload-label">
                  <span class="upload-step-badge">1</span>
                  <span>Upload workout screenshot <span class="optional-tag">auto-fills fields</span></span>
                </div>
                <p class="upload-hint">Upload a screenshot from Garmin, Apple Watch, Strava, etc. AI will read your distance, time, and activity type. You can edit anything it gets wrong.</p>
                <input
                  ref="screenshotInputRef"
                  type="file"
                  accept="image/*"
                  style="display:none"
                  @change="onScreenshotSelected"
                />
                <div v-if="!workoutForm.screenshotFile" class="vision-file-area vision-file-area--primary" @click="screenshotInputRef?.click()">
                  <span class="vision-drop-icon">📸</span>
                  <span>Tap to attach your workout screenshot</span>
                </div>
                <div v-else class="vision-preview-row">
                  <img :src="workoutForm.screenshotPreviewUrl" class="screenshot-thumbnail screenshot-thumbnail--lg" alt="Workout screenshot" />
                  <div class="vision-preview-actions">
                    <div v-if="visionScanning" class="vision-scanning-badge">🔍 Analyzing…</div>
                    <div v-else-if="visionExtracted" class="vision-extracted-banner">
                      ✅ Fields auto-filled — edit anything below as needed.
                      <span v-if="visionConfidence > 0" class="confidence-badge">{{ visionConfidence }}% confidence</span>
                    </div>
                    <div v-if="visionError" class="vision-error-banner">{{ visionError }}</div>
                    <div class="vision-controls">
                      <button type="button" class="btn btn-sm btn-secondary" :disabled="visionScanning" @click="analyzeScreenshot">
                        {{ visionScanning ? '🔍 Re-analyzing…' : '🔍 Re-analyze' }}
                      </button>
                      <button type="button" class="btn btn-sm btn-ghost" @click="clearScreenshot">✕ Remove</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ② Workout data fields (auto-filled by Vision, manually editable) -->
              <div class="workout-upload-label" style="margin-top:16px;">
                <span class="upload-step-badge">2</span>
                <span>Review &amp; complete workout details</span>
              </div>

              <div class="form-row">
                <label>Activity type</label>
                <select v-model="workoutForm.activityType" required>
                  <option value="">Select…</option>
                  <option v-for="opt in activityTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="form-row-group">
                <div class="form-row">
                  <label>Distance (miles)</label>
                  <input v-model.number="workoutForm.distanceValue" type="number" step="0.01" min="0" placeholder="Optional" />
                </div>
                <div class="form-row">
                  <label>Duration</label>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <input v-model.number="workoutForm.durationMinutes" type="number" min="0" placeholder="min" style="width:64px;" />
                    <span style="font-size:0.85em;color:#64748b;">:</span>
                    <input v-model.number="workoutForm.durationSeconds" type="number" min="0" max="59" placeholder="sec" style="width:56px;" />
                  </div>
                </div>
                <div class="form-row">
                  <label>Avg Heart Rate <span class="hint-inline">(bpm — optional)</span></label>
                  <input v-model.number="workoutForm.averageHeartrate" type="number" min="30" max="250" placeholder="Auto-filled from screenshot" />
                </div>
                <div class="form-row" v-if="pointsAutoComputed != null">
                  <label>Points <span class="hint-inline">(auto from miles)</span></label>
                  <span class="points-preview">{{ pointsAutoComputed }} pts</span>
                </div>
                <div class="form-row" v-else>
                  <label>Points</label>
                  <input v-model.number="workoutForm.points" type="number" min="0" required />
                </div>
              </div>
              <div class="form-row">
                <label>Terrain</label>
                <select v-model="workoutForm.terrain">
                  <option value="">— Select terrain —</option>
                  <option value="Road">Road</option>
                  <option value="Trail">Trail</option>
                  <option value="Track">Track</option>
                  <option value="Beach">Beach</option>
                  <option value="Treadmill">Treadmill</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="form-row">
                <label>Weekly challenge tag</label>
                <select v-model="workoutForm.weeklyTaskId">
                  <option :value="null">None</option>
                  <option v-for="t in weeklyTaskOptions" :key="`weekly-task-option-${t.id}`" :value="t.id">{{ t.name }}</option>
                </select>
                <small class="hint" v-if="selectedTaskProofPolicyLabel">Proof policy: {{ selectedTaskProofPolicyLabel }}</small>
              </div>
              <div class="form-row race-toggle-row">
                <label class="race-toggle-label">
                  <input v-model="workoutForm.isRace" type="checkbox" />
                  🏅 This was a race
                </label>
              </div>
              <div v-if="workoutForm.isRace" class="race-details-panel">
                <div class="race-fields-row">
                  <div class="form-col">
                    <label>Race distance (mi)</label>
                    <input v-model.number="workoutForm.raceDistanceMiles" type="number" min="0" step="0.01" placeholder="e.g. 13.1" />
                  </div>
                  <div class="form-col">
                    <label>Chip time</label>
                    <div class="time-input-row">
                      <input v-model.number="workoutForm.raceChipMinutes" type="number" min="0" placeholder="min" style="width:64px" />
                      <span>:</span>
                      <input v-model.number="workoutForm.raceChipSeconds" type="number" min="0" max="59" placeholder="sec" style="width:64px" />
                    </div>
                  </div>
                  <div class="form-col">
                    <label>Overall place</label>
                    <input v-model.number="workoutForm.raceOverallPlace" type="number" min="1" placeholder="e.g. 42" />
                  </div>
                </div>
                <small class="hint">You can tag both a race <em>and</em> a weekly challenge above.</small>
              </div>
              <div class="form-row">
                <label><input v-model="workoutForm.isTreadmill" type="checkbox" /> Completed on a treadmill</label>
              </div>
              <div class="form-row">
                <label>Notes</label>
                <textarea v-model="workoutForm.workoutNotes" rows="2" placeholder="Optional" />
              </div>

              <!-- ③ Treadmill proof photo (required when treadmill is checked) -->
              <div v-if="workoutForm.isTreadmill" class="workout-upload-section workout-upload-section--required">
                <div class="workout-upload-label">
                  <span class="upload-step-badge upload-step-badge--required">!</span>
                  <span>Treadmill screen photo <span class="required-tag">required</span></span>
                </div>
                <p class="upload-hint">Photo of the treadmill display showing distance and time. This is separate from your watch screenshot above.</p>
                <input ref="treadmillProofInputRef" type="file" accept="image/*" style="display:none" @change="onTreadmillProofSelected" />
                <div v-if="!workoutForm.treadmillProofFile" class="vision-file-area" @click="treadmillProofInputRef?.click()">
                  <span class="vision-drop-icon">🏃</span>
                  <span>Tap to attach treadmill screen photo</span>
                </div>
                <div v-else class="vision-preview-row">
                  <img :src="workoutForm.treadmillProofPreviewUrl" class="screenshot-thumbnail screenshot-thumbnail--lg" alt="Treadmill proof" />
                  <div class="vision-preview-actions">
                    <button type="button" class="btn btn-sm btn-ghost" @click="clearTreadmillProof">✕ Remove</button>
                  </div>
                </div>
              </div>

              <!-- ④ Map image (optional) -->
              <div class="workout-upload-section workout-upload-section--optional">
                <div class="workout-upload-label">
                  <span class="upload-step-badge upload-step-badge--optional">+</span>
                  <span>Route map <span class="optional-tag">optional</span></span>
                </div>
                <p class="upload-hint">Attach a map screenshot if your challenge requires it or if you want to share your route.</p>
                <input ref="mapImageInputRef" type="file" accept="image/*" style="display:none" @change="onMapImageSelected" />
                <div v-if="!workoutForm.mapImageFile" class="vision-file-area vision-file-area--compact" @click="mapImageInputRef?.click()">
                  <span class="vision-drop-icon">🗺️</span>
                  <span>Tap to attach a map image</span>
                </div>
                <div v-else class="vision-preview-row">
                  <img :src="workoutForm.mapImagePreviewUrl" class="screenshot-thumbnail screenshot-thumbnail--lg" alt="Route map" />
                  <div class="vision-preview-actions">
                    <button type="button" class="btn btn-sm btn-ghost" @click="clearMapImage">✕ Remove</button>
                  </div>
                </div>
              </div>

              <div v-if="workoutError" class="error-inline" style="margin:8px 0;">{{ workoutError }}</div>
              <div class="form-buttons">
                <button type="submit" class="btn btn-primary" :disabled="workoutSubmitting">
                  {{ workoutSubmitting ? 'Submitting…' : 'Log Workout' }}
                </button>
                <button v-if="stravaImportAvailable" type="button" class="btn btn-secondary" @click="showLogWorkoutModal = false; openStravaImportModal()">
                  Import from Strava
                </button>
                <button type="button" class="btn btn-ghost" @click="showLogWorkoutModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Strava Import Modal -->
        <div v-if="showStravaImportModal" class="modal-overlay" @click.self="closeStravaImportModal">
          <div class="modal-content modal-wide">
            <h2>Import from Strava</h2>
            <img src="/logos/strava/compatible-with-strava.svg" alt="Compatible with Strava" class="strava-compatible-logo" />
            <p class="hint">Only <strong>today's</strong> activities can be imported. Points are calculated from distance or duration. Descriptions, elevation, and route maps are included automatically.</p>
            <p class="hint">
              Compatible with Strava. This application is independent and is not developed or sponsored by Strava.
            </p>
            <div v-if="stravaActivitiesLoading" class="loading-inline">Loading your Strava activities…</div>
            <div v-else-if="stravaActivitiesError" class="error-inline">{{ stravaActivitiesError }}</div>
            <div v-else class="strava-activity-list">
              <label v-for="a in stravaActivities" :key="a.id" class="strava-activity-item" :class="{ selected: selectedStravaIds.includes(a.id) }">
                <input type="checkbox" :value="a.id" v-model="selectedStravaIds" class="strava-activity-check" />
                <div class="strava-activity-body">
                  <div class="strava-activity-top">
                    <span class="activity-name">{{ a.name || 'Untitled' }}</span>
                    <span class="strava-activity-badges">
                      <span v-if="a.map?.summary_polyline" class="strava-badge strava-badge--map" title="Route map available">📍 Map</span>
                      <span v-if="a.average_heartrate" class="strava-badge strava-badge--hr" title="Heart rate data available">❤️ HR</span>
                      <span v-if="a.total_elevation_gain > 5" class="strava-badge strava-badge--elev" title="Elevation gain">⛰ {{ Math.round(a.total_elevation_gain * 3.28084) }}ft</span>
                      <span v-if="a.calories" class="strava-badge strava-badge--cal" title="Calories">🔥 {{ Math.round(a.calories) }} cal</span>
                    </span>
                  </div>
                  <div class="strava-activity-meta">
                    <span class="strava-meta-pill">{{ a.sport_type || a.type }}</span>
                    <span>{{ formatStravaDistance(a.distance) }}</span>
                    <span>{{ formatStravaDuration(a.moving_time || a.elapsed_time) }}</span>
                    <span v-if="a.average_heartrate">{{ Math.round(a.average_heartrate) }} bpm avg</span>
                    <span class="strava-meta-date">{{ formatStravaDate(a.start_date) }}</span>
                    <a class="strava-view-link" :href="stravaActivityUrl(a.id)" target="_blank" rel="noopener noreferrer">View on Strava</a>
                  </div>
                </div>
              </label>
              <div v-if="!stravaActivities.length" class="empty-hint">No activities from today found. Only workouts completed today can be imported.</div>
            </div>
            <div v-if="stravaDuplicateMessage" class="strava-duplicate-notice">
              {{ stravaDuplicateMessage }}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="closeStravaImportModal">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="!selectedStravaIds.length || stravaImporting"
                @click="importSelectedStrava"
              >
                {{ stravaImporting ? 'Importing…' : `Import ${selectedStravaIds.length} selected` }}
              </button>
            </div>
            <div style="text-align: center; margin-top: 12px;">
              <button type="button" class="btn btn-ghost btn-sm" @click="closeStravaImportModal(); showLogWorkoutModal = true;">
                Manual Upload
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

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

    <div v-if="showTeamMessageModal" class="modal-overlay" @click.self="showTeamMessageModal = false">
      <div class="modal-content modal-wide team-msg-modal" @click.stop>
        <h2>Message your team</h2>
        <p class="hint">Only members on your team receive this (via the club announcement system).</p>
        <div v-if="teamMsgError" class="error-inline">{{ teamMsgError }}</div>
        <div class="form-row">
          <label>Type</label>
          <select v-model="teamMsgDraft.displayType" class="form-control">
            <option value="announcement">Banner (scrolling line)</option>
            <option value="splash">Splash (pop-up)</option>
          </select>
        </div>
        <div class="form-row">
          <label>Title (optional)</label>
          <input v-model="teamMsgDraft.title" type="text" maxlength="255" class="form-control" />
        </div>
        <div class="form-row">
          <label>Message</label>
          <textarea v-model="teamMsgDraft.message" rows="4" maxlength="1200" class="form-control" />
        </div>
        <div v-if="teamMsgDraft.displayType === 'splash'" class="form-row">
          <label>Splash image (optional)</label>
          <input v-model="teamMsgDraft.splashImageUrl" type="url" class="form-control" placeholder="https://…" />
          <input
            ref="teamSplashFileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="team-msg-file"
            :disabled="teamSplashUploading"
            @change="onTeamSplashFile"
          />
          <span v-if="teamSplashUploading" class="hint">Uploading…</span>
        </div>
        <div class="form-row form-row--2">
          <label>Starts<br />
            <input v-model="teamMsgDraft.startsAt" type="datetime-local" class="form-control" />
          </label>
          <label>Ends<br />
            <input v-model="teamMsgDraft.endsAt" type="datetime-local" class="form-control" />
          </label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="showTeamMessageModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="teamMsgSubmitting || !canSubmitTeamMsg" @click="submitTeamAnnouncement">
            {{ teamMsgSubmitting ? 'Posting…' : 'Post to team' }}
          </button>
        </div>
      </div>
    </div>

    <ChallengeParticipationAgreementModal
      :open="showParticipationAgreementModal"
      :challenge-name="challenge?.class_name || challenge?.className || ''"
      :agreement="currentParticipationAgreement"
      :default-signature-name="defaultParticipationSignatureName"
      :submitting="participationAcceptanceSubmitting"
      :error="participationAcceptanceError"
      @submit="acceptParticipationAgreement"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useBrandingStore } from '../store/branding';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import { NATIVE_APP_ORG_SLUG, isSummitPlatformRouteSlug } from '../utils/summitPlatformSlugs.js';
import { useAffiliationClubAnnouncements } from '../composables/useAffiliationClubAnnouncements.js';
import { toUploadsUrl } from '../utils/uploadsUrl.js';
import { getWeekDeadline, getTodayDeadline, timeUntil, formatInTimezone, countdownUrgency } from '../utils/timezones.js';
import ChallengeRules from '../components/challenge/ChallengeRules.vue';
import ChallengeTeamList from '../components/challenge/ChallengeTeamList.vue';
import ChallengeLeaderboard from '../components/challenge/ChallengeLeaderboard.vue';
import ChallengeScoreboard from '../components/challenge/ChallengeScoreboard.vue';
import ChallengeEliminationBoard from '../components/challenge/ChallengeEliminationBoard.vue';
import ChallengeWeeklyTasks from '../components/challenge/ChallengeWeeklyTasks.vue';
import ChallengeActivityFeed from '../components/challenge/ChallengeActivityFeed.vue';
import ChallengeTeamWeeklyProgress from '../components/challenge/ChallengeTeamWeeklyProgress.vue';
import ChallengeMessageFeed from '../components/challenge/ChallengeMessageFeed.vue';
import ChallengeDraftReport from '../components/challenge/ChallengeDraftReport.vue';
import ChallengeParticipationAgreementModal from '../components/challenge/ChallengeParticipationAgreementModal.vue';

const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const challenge = ref(null);
const providerMembers = ref([]);
const seasonBannerDismissed = ref(false);
const loading = ref(true);
const error = ref(null);
const leaderboard = ref(null);
const leaderboardLoading = ref(false);
const teams = ref([]);
const teamsLoading = ref(false);
const activity = ref([]);
const activityLoading = ref(false);
const participationAgreementStatus = ref(null);
const participationAcceptanceSubmitting = ref(false);
const participationAcceptanceError = ref('');
const defaultWorkoutForm = () => ({
  activityType: '',
  distanceValue: null,
  durationMinutes: null,
  durationSeconds: null,
  caloriesBurned: null,
  averageHeartrate: null,
  points: 0,
  workoutNotes: '',
  weeklyTaskId: null,
  isTreadmill: false,
  terrain: '',
  // Race fields
  isRace: false,
  raceDistanceMiles: null,
  raceChipMinutes: null,
  raceChipSeconds: null,
  raceOverallPlace: null,
  // Primary workout screenshot → Vision OCR source + stored as proof
  screenshotFile: null,
  screenshotPreviewUrl: null,
  screenshotFilePath: null,
  // Treadmill screen photo (required when isTreadmill = true)
  treadmillProofFile: null,
  treadmillProofPreviewUrl: null,
  treadmillProofFilePath: null,
  // Optional map image
  mapImageFile: null,
  mapImagePreviewUrl: null,
  mapImageFilePath: null
});
const workoutForm = ref(defaultWorkoutForm());
const workoutSubmitting = ref(false);
const workoutError = ref('');
const showLogWorkoutModal = ref(false);

// Vision OCR state
const screenshotInputRef = ref(null);
const treadmillProofInputRef = ref(null);
const mapImageInputRef = ref(null);
const visionScanning = ref(false);
const visionExtracted = ref(false);
const visionError = ref(null);
const visionConfidence = ref(0);
const stravaStatus = ref(null);
const showStravaImportModal = ref(false);
const stravaActivities = ref([]);
const stravaActivitiesLoading = ref(false);
const stravaActivitiesError = ref(null);
const selectedStravaIds = ref([]);
const stravaImporting = ref(false);
const stravaDuplicateMessage = ref('');
const captainApplications = ref([]);
const captainAppsLoading = ref(false);
const draftSessionStatus = ref(null);
const captainAppsError = ref('');
const captainsFinalizeSubmitting = ref(false);
const captainApplyText = ref('');
const captainApplySubmitting = ref(false);
const captainApplyError = ref('');
const weeklyTaskOptions = ref([]);
const treadmillpocalypseWeek = ref(null);
const treadmillpocalypseIconUrl = ref(null);
const seasonSummary = ref(null);
const seasonSummaryLoading = ref(false);
const recordBoards = ref({ seasonRecords: [], clubAllTimeRecords: [] });
const recordBoardsLoading = ref(false);
const raceDivisions = ref({ halfMarathon: { season: [], allTime: [] }, marathon: { season: [], allTime: [] } });
const raceDivisionsLoading = ref(false);
const raceDivisionTab = ref('season');

// Kudos stats
const kudosStats = ref(null);
const kudosStatsLoading = ref(false);

const challengeId = computed(() => route.params.id || route.params.challengeId);
const organizationSlug = computed(() => route.params.organizationSlug || null);
const agencySlugForDraft = computed(() => challenge.value?.organization_slug || null);

const SSC_HOME_SLUGS = new Set(
  ['sstc', 'sstc', 'summit-stats', String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'sstc').trim().toLowerCase()].filter(Boolean)
);
const backRoute = computed(() => {
  const slug = organizationSlug.value;
  if (slug) {
    if (SSC_HOME_SLUGS.has(String(slug).toLowerCase())) return `/${slug}/my_club_dashboard`;
    return `/${slug}/dashboard`;
  }
  return '/dashboard';
});

const announcementClubId = computed(() => {
  const id = Number(challenge.value?.organization_id || 0);
  return id > 0 ? id : null;
});
const splashBrandLabelForAnnouncements = computed(() => {
  const n = String(challenge.value?.organization_name || '').trim();
  return n || SUMMIT_STATS_TEAM_CHALLENGE_NAME;
});
const {
  clubDashboardBannerTexts,
  currentClubSplash,
  clubSplashTitle,
  clubSplashBrandLabel,
  formatClubSplashEndsAt,
  loadClubAnnouncements,
  dismissClubSplash,
  remindLaterClubSplash
} = useAffiliationClubAnnouncements(announcementClubId, splashBrandLabelForAnnouncements);

const canSubmitWorkout = computed(() => {
  const members = providerMembers.value || [];
  const myId = authStore.user?.id;
  return members.some((m) => Number(m.provider_user_id) === Number(myId) && ['active', 'completed'].includes(String(m.membership_status || '').toLowerCase()));
});

const currentParticipationAgreement = computed(() => {
  const statusAgreement = participationAgreementStatus.value?.agreement;
  if (statusAgreement && typeof statusAgreement === 'object') return statusAgreement;
  const settings = challenge.value?.season_settings_json;
  return settings && typeof settings === 'object' ? (settings.participationAgreement || null) : null;
});

const requiresParticipationAcceptance = computed(() =>
  canSubmitWorkout.value && participationAgreementStatus.value?.requiresAcceptance === true
);

const participationAccepted = computed(() =>
  !requiresParticipationAcceptance.value || participationAgreementStatus.value?.accepted === true
);

const canParticipateInSeason = computed(() => canSubmitWorkout.value && participationAccepted.value);

const showParticipationAgreementModal = computed(() =>
  requiresParticipationAcceptance.value &&
  !participationAccepted.value &&
  !!currentParticipationAgreement.value
);

const defaultParticipationSignatureName = computed(() => {
  const first = String(authStore.user?.first_name || '').trim();
  const last = String(authStore.user?.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ').trim();
});

const activityTypeOptions = computed(() => {
  const raw = challenge.value?.activity_types_json;
  const toLabel = (t) => String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (Array.isArray(raw) && raw.length) return raw.map((t) => ({ value: t, label: toLabel(t) }));
  if (typeof raw === 'object' && raw && Object.keys(raw).length) return Object.keys(raw).map((k) => ({ value: k, label: toLabel(k) }));
  return [
    { value: 'run', label: 'Run' },
    { value: 'ruck', label: 'Ruck' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'walk', label: 'Walk' },
    { value: 'workout_session', label: 'Workout Session' },
    { value: 'steps', label: 'Steps' }
  ];
});

const eventCategory = computed(() => {
  const settings = challenge.value?.season_settings_json;
  const category = settings && typeof settings === 'object' ? settings?.event?.category : null;
  return String(category || 'run_ruck').toLowerCase() === 'fitness' ? 'fitness' : 'run_ruck';
});

// Mirrors the backend scoring logic — computes points from distance for run_ruck seasons.
// Returns a number when auto-computable, null when manual entry is needed.
const pointsAutoComputed = computed(() => {
  const scoring = challenge.value?.season_settings_json?.scoring || {};
  const metric = String(scoring.runRuckScoringMetric || 'distance').toLowerCase();
  if (eventCategory.value !== 'run_ruck' || metric === 'calories') return null;
  const dist = Number(workoutForm.value?.distanceValue);
  if (!dist || dist <= 0) return null;
  const activityLow = String(workoutForm.value?.activityType || '').toLowerCase();
  const milesPerPoint = activityLow.includes('ruck')
    ? (Number(scoring.ruckMilesPerPoint || 1) || 1)
    : (Number(scoring.runMilesPerPoint  || 1) || 1);
  return Math.max(0, Math.round((dist / milesPerPoint) * 100) / 100);
});



// ── Week deadline countdown ──────────────────────────────────────
const weekSchedule = computed(() => {
  const s = challenge.value?.season_settings_json;
  if (!s || typeof s !== 'object') return null;
  const sched = s.schedule || {};
  return {
    weekStartsOn:     sched.weekStartsOn     || 'monday',
    weekEndsSundayAt: sched.weekEndsSundayAt || '23:59',
    weekTimeZone:     sched.weekTimeZone     || 'UTC'
  };
});

const weekDeadline = computed(() => {
  const s = weekSchedule.value;
  if (!s) return null;
  return getWeekDeadline(s.weekStartsOn, s.weekEndsSundayAt, s.weekTimeZone);
});

const weekCountdown     = ref('');
const weekDeadlineLabel = computed(() => {
  const d = weekDeadline.value;
  if (!d) return '';
  const s = weekSchedule.value;
  return formatInTimezone(d, s?.weekTimeZone || 'UTC', '12h');
});
const weekCountdownClass = computed(() => {
  if (!weekDeadline.value) return '';
  return countdownUrgency(weekDeadline.value);
});

// ── Daily submission deadline countdown ──────────────────────────
const dailyDeadlineTime = computed(() => {
  const s = challenge.value?.season_settings_json;
  return (s?.participation?.dailyDeadlineTime) || '23:59';
});

const dailyDeadline = computed(() => {
  const s = weekSchedule.value;
  const tz = s?.weekTimeZone || 'UTC';
  return getTodayDeadline(tz, dailyDeadlineTime.value, weekDeadline.value || null);
});

const dailyCountdown      = ref('');
const dailyDeadlineLabel  = computed(() => {
  const d = dailyDeadline.value;
  if (!d) return '';
  const s = weekSchedule.value;
  return formatInTimezone(d, s?.weekTimeZone || 'UTC', '12h');
});
const dailyCountdownClass = computed(() => {
  if (!dailyDeadline.value) return '';
  return countdownUrgency(dailyDeadline.value);
});

let countdownTimer = null;
const tickCountdown = () => {
  weekCountdown.value = weekDeadline.value ? timeUntil(weekDeadline.value) : '';
  const dd = dailyDeadline.value;
  dailyCountdown.value = dd && dd > new Date() ? timeUntil(dd) : '';
};
// ─────────────────────────────────────────────────────────────────

const isChallengeManager = computed(() => {
  // Server-side authoritative flag — covers club_manager, assistant_manager, admin, staff
  if (challenge.value?.can_manage === true) return true;
  // Fallback for known privileged global roles (in case can_manage hasn't loaded yet)
  const role = String(authStore.user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus', 'club_manager'].includes(role)) return true;
  return false;
});

const isTeamCaptain = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  return (teams.value || []).some((t) => Number(t.team_manager_user_id) === myId);
});

const captainApplicationOpen = computed(() =>
  !!(challenge.value?.captain_application_open) && !(challenge.value?.captains_finalized)
);

// For non-managers the backend only returns their own record (or empty).
const myOwnCaptainApp = computed(() => {
  if (isChallengeManager.value) return null;
  return captainApplications.value[0] ?? null;
});

const myTeamId = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  const myTeam = (teams.value || []).find((t) =>
    (t.members || []).some((m) => Number(m.provider_user_id || m.user_id) === myId)
    || Number(t.team_manager_user_id) === myId
  );
  return myTeam?.id || null;
});

const captainTeamId = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  const t = (teams.value || []).find((x) => Number(x.team_manager_user_id) === myId);
  return t?.id || null;
});

const showTeamMessageModal = ref(false);
const teamMsgSubmitting = ref(false);
const teamMsgError = ref('');
const teamSplashUploading = ref(false);
const teamSplashFileInput = ref(null);
const teamMsgDraft = ref({
  title: '',
  message: '',
  displayType: 'announcement',
  splashImageUrl: '',
  startsAt: '',
  endsAt: ''
});

const toTeamMsgLocalInput = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const openTeamMessageModal = () => {
  const now = new Date();
  const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  teamMsgDraft.value = {
    title: '',
    message: '',
    displayType: 'announcement',
    splashImageUrl: '',
    startsAt: toTeamMsgLocalInput(now),
    endsAt: toTeamMsgLocalInput(in24)
  };
  teamMsgError.value = '';
  showTeamMessageModal.value = true;
};

const canSubmitTeamMsg = computed(() => {
  const d = teamMsgDraft.value;
  if (!String(d.message || '').trim()) return false;
  if (!d.startsAt || !d.endsAt) return false;
  const starts = new Date(d.startsAt);
  const ends = new Date(d.endsAt);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) return false;
  return ends.getTime() > starts.getTime();
});

const onTeamSplashFile = async (e) => {
  const file = e.target.files?.[0];
  const cid = Number(challenge.value?.organization_id || 0);
  if (!file || !cid) return;
  teamSplashUploading.value = true;
  teamMsgError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post(`/summit-stats/clubs/${cid}/feed/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipGlobalLoading: true
    });
    if (r.data?.url) teamMsgDraft.value = { ...teamMsgDraft.value, splashImageUrl: r.data.url };
  } catch (err) {
    teamMsgError.value = err.response?.data?.error?.message || 'Image upload failed';
  } finally {
    teamSplashUploading.value = false;
    if (teamSplashFileInput.value) teamSplashFileInput.value.value = '';
  }
};

const submitTeamAnnouncement = async () => {
  if (!canSubmitTeamMsg.value || teamMsgSubmitting.value) return;
  const cid = Number(challenge.value?.organization_id || 0);
  const classId = Number(challengeId.value);
  const tid = Number(captainTeamId.value);
  if (!cid || !classId || !tid) return;
  teamMsgSubmitting.value = true;
  teamMsgError.value = '';
  try {
    const d = teamMsgDraft.value;
    const payload = {
      title: String(d.title || '').trim() || null,
      message: String(d.message || '').trim(),
      display_type: d.displayType === 'splash' ? 'splash' : 'announcement',
      starts_at: new Date(d.startsAt),
      ends_at: new Date(d.endsAt)
    };
    const splash = String(d.splashImageUrl || '').trim();
    if (splash) payload.splash_image_url = splash;
    await api.post(`/summit-stats/clubs/${cid}/seasons/${classId}/teams/${tid}/announcements`, payload, { skipGlobalLoading: true });
    showTeamMessageModal.value = false;
    await loadClubAnnouncements();
  } catch (err) {
    teamMsgError.value = err.response?.data?.error?.message || 'Failed to post';
  } finally {
    teamMsgSubmitting.value = false;
  }
};

const selectedTaskProofPolicyLabel = computed(() => {
  const id = Number(workoutForm.value.weeklyTaskId || 0);
  if (!id) return '';
  const t = (weeklyTaskOptions.value || []).find((x) => Number(x.id) === id);
  const policy = String(t?.proof_policy || '').toLowerCase();
  if (policy === 'photo_required') return 'Photo required';
  if (policy === 'gps_or_photo') return 'GPS or photo required';
  if (policy === 'gps_required_no_treadmill') return 'GPS required and treadmill not allowed';
  return policy ? policy : 'No proof required';
});

// Criteria summary chips for a weekly task
const taskCriteriaSummary = (task) => {
  const chips = [];
  const raw = task?.criteria_json;
  if (!raw) return chips;
  const c = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!c) return chips;
  if (c.challengeType) chips.push(c.challengeType.replace('_', ' '));
  if (c.activityTypes?.length) chips.push(c.activityTypes.slice(0, 3).join(' / '));
  if (c.terrain?.length) chips.push(c.terrain.join(' / '));
  if (c.distance?.minMiles) chips.push(`${c.distance.minMiles}+ mi`);
  if (c.duration?.minMinutes) chips.push(`${c.duration.minMinutes}+ min`);
  if (c.pace?.maxSecondsPerMile) {
    const m = Math.floor(c.pace.maxSecondsPerMile / 60);
    const s = String(c.pace.maxSecondsPerMile % 60).padStart(2, '0');
    chips.push(`≤ ${m}:${s}/mi`);
  }
  if (c.timeOfDay?.start && c.timeOfDay?.end) chips.push(`${c.timeOfDay.start}–${c.timeOfDay.end}`);
  if (c.splitRuns?.count > 1) chips.push(`${c.splitRuns.count} runs/day`);
  return chips;
};

// Split-run progress for the current day
const splitRunProgress = (task) => {
  const raw = task?.criteria_json;
  if (!raw) return null;
  const c = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!c?.splitRuns?.count || c.splitRuns.count < 2) return null;
  // Count today's workouts in the activity feed tagged to this task
  const todayStr = new Date().toISOString().slice(0, 10);
  const tagged = (activity.value || []).filter((w) => {
    return Number(w.weekly_task_id) === Number(task.id)
      && String(w.completed_at || w.created_at || '').slice(0, 10) === todayStr;
  });
  return { logged: tagged.length, required: c.splitRuns.count };
};

const resolveSeasonAssetUrl = (path, type = 'banner') => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  // Use the dedicated serve endpoint (reads from GCS via DB path — no URL-encoding issues)
  const id = challenge.value?.id;
  if (id) {
    const apiBase = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    return `${apiBase}/learning-program-classes/${id}/${type}`;
  }
  return `/uploads/${path.replace(/^\/+/, '')}`;
};

const formatStatus = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'draft') return 'Draft';
  if (s === 'closed') return 'Closed';
  if (s === 'archived') return 'Archived';
  return s || '—';
};

const statusClass = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'closed') return 'status-closed';
  return '';
};

const loadChallenge = async () => {
  const id = challengeId.value;
  if (!id) {
    error.value = 'Invalid challenge';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const r = await api.get(`/learning-program-classes/${id}`, { skipGlobalLoading: true });
    challenge.value = r.data?.class || null;
    providerMembers.value = Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : [];
    participationAgreementStatus.value = r.data?.participationAgreementStatus || null;
    participationAcceptanceError.value = '';
    // Apply the season's club branding regardless of the URL slug so colors/fonts
    // always match the club (e.g. sstc/season/3 shows Your Superhero's Superheros branding).
    const clubSlug = challenge.value?.organization_slug;
    if (clubSlug && clubSlug !== organizationSlug.value) {
      // Temporarily override the active route slug so _resolveActivePalette picks
      // up the club's cached palette for computed colors.
      brandingStore.setActiveRouteSlug(clubSlug);
      // Fetch-and-apply the club's theme (cached after first load so re-renders are instant).
      brandingStore.fetchAgencyTheme(clubSlug, { pageContext: 'season' }).catch(() => {});
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load challenge';
    challenge.value = null;
    participationAgreementStatus.value = null;
  } finally {
    loading.value = false;
  }
};

const acceptParticipationAgreement = async (payload) => {
  const id = challengeId.value;
  if (!id) return;
  participationAcceptanceSubmitting.value = true;
  participationAcceptanceError.value = '';
  try {
    await api.post(`/learning-program-classes/${id}/participation-agreement/accept`, payload, { skipGlobalLoading: true });
    await loadChallenge();
  } catch (e) {
    participationAcceptanceError.value = e?.response?.data?.error?.message || 'Failed to save participation agreement';
  } finally {
    participationAcceptanceSubmitting.value = false;
  }
};

const loadLeaderboard = async () => {
  const id = challengeId.value;
  if (!id) return;
  leaderboardLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/leaderboard`, { skipGlobalLoading: true });
    leaderboard.value = r.data || null;
  } catch {
    leaderboard.value = null;
  } finally {
    leaderboardLoading.value = false;
  }
};

const loadTeams = async () => {
  const id = challengeId.value;
  if (!id) return;
  teamsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/teams`, { skipGlobalLoading: true });
    teams.value = Array.isArray(r.data?.teams) ? r.data.teams : [];
  } catch {
    teams.value = [];
  } finally {
    teamsLoading.value = false;
  }
};

const loadActivity = async () => {
  const id = challengeId.value;
  if (!id) return;
  activityLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/activity`, { skipGlobalLoading: true });
    activity.value = Array.isArray(r.data?.workouts) ? r.data.workouts : [];
  } catch {
    activity.value = [];
  } finally {
    activityLoading.value = false;
  }
};

const loadWeeklyTaskOptions = async () => {
  const id = challengeId.value;
  if (!id) return;
  try {
    const r = await api.get(`/learning-program-classes/${id}/weekly-tasks`, { skipGlobalLoading: true });
    weeklyTaskOptions.value = Array.isArray(r.data?.tasks) ? r.data.tasks : [];
    const tp = r.data?.treadmillpocalypse;
    treadmillpocalypseWeek.value = (tp?.active === true) ? tp : null;
    if (tp?.active && tp?.icon && String(tp.icon).startsWith('icon:')) {
      const iconId = parseInt(String(tp.icon).replace('icon:', ''), 10);
      if (iconId) {
        try {
          const { data: iconData } = await api.get(`/icons/${iconId}`, { skipGlobalLoading: true });
          treadmillpocalypseIconUrl.value = iconData?.url || null;
        } catch { treadmillpocalypseIconUrl.value = null; }
      }
    } else {
      treadmillpocalypseIconUrl.value = null;
    }
  } catch {
    weeklyTaskOptions.value = [];
    treadmillpocalypseWeek.value = null;
  }
};

const loadSeasonSummary = async () => {
  const id = challengeId.value;
  if (!id) return;
  seasonSummaryLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/season-summary`, { skipGlobalLoading: true });
    seasonSummary.value = r.data || null;
  } catch {
    seasonSummary.value = null;
  } finally {
    seasonSummaryLoading.value = false;
  }
};

const loadRecordBoards = async () => {
  const id = challengeId.value;
  if (!id) return;
  recordBoardsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/record-boards`, { skipGlobalLoading: true });
    recordBoards.value = {
      seasonRecords: Array.isArray(r.data?.seasonRecords) ? r.data.seasonRecords : [],
      clubAllTimeRecords: Array.isArray(r.data?.clubAllTimeRecords) ? r.data.clubAllTimeRecords : []
    };
  } catch {
    recordBoards.value = { seasonRecords: [], clubAllTimeRecords: [] };
  } finally {
    recordBoardsLoading.value = false;
  }
};

const loadKudosStats = async () => {
  const id = challengeId.value;
  if (!id) return;
  kudosStatsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/kudos-stats`, { skipGlobalLoading: true });
    kudosStats.value = r.data || null;
  } catch {
    kudosStats.value = null;
  } finally {
    kudosStatsLoading.value = false;
  }
};

const loadRaceDivisions = async () => {
  const id = challengeId.value;
  if (!id) return;
  raceDivisionsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/race-divisions`, { skipGlobalLoading: true });
    raceDivisions.value = {
      halfMarathon: {
        season: Array.isArray(r.data?.halfMarathon?.season) ? r.data.halfMarathon.season : [],
        allTime: Array.isArray(r.data?.halfMarathon?.allTime) ? r.data.halfMarathon.allTime : []
      },
      marathon: {
        season: Array.isArray(r.data?.marathon?.season) ? r.data.marathon.season : [],
        allTime: Array.isArray(r.data?.marathon?.allTime) ? r.data.marathon.allTime : []
      }
    };
  } catch {
    raceDivisions.value = { halfMarathon: { season: [], allTime: [] }, marathon: { season: [], allTime: [] } };
  } finally {
    raceDivisionsLoading.value = false;
  }
};

const loadCaptainApplications = async () => {
  const id = challengeId.value;
  if (!id) return;
  captainAppsLoading.value = true;
  captainAppsError.value = '';
  try {
    const r = await api.get(`/learning-program-classes/${id}/captain-applications`, { skipGlobalLoading: true });
    captainApplications.value = Array.isArray(r.data?.applications) ? r.data.applications : [];
  } catch (e) {
    captainApplications.value = [];
    captainAppsError.value = e?.response?.data?.error?.message || 'Failed to load captain applications';
  } finally {
    captainAppsLoading.value = false;
  }
};

const loadDraftSessionStatus = async () => {
  const id = challengeId.value;
  if (!id) return;
  try {
    const { data } = await api.get(`/learning-program-classes/${id}/draft-session`, { skipGlobalLoading: true });
    draftSessionStatus.value = data?.session?.status || null;
  } catch { draftSessionStatus.value = null; }
};

const reviewCaptain = async (applicationId, status) => {
  const id = challengeId.value;
  if (!id || !applicationId) return;
  try {
    await api.put(`/learning-program-classes/${id}/captain-applications/${applicationId}`, { status });
    await Promise.all([loadCaptainApplications(), loadChallenge()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update captain application');
  }
};

const finalizeCaptainsForSeason = async () => {
  const id = challengeId.value;
  if (!id) return;
  captainsFinalizeSubmitting.value = true;
  try {
    await api.post(`/learning-program-classes/${id}/captains/finalize`);
    await Promise.all([loadChallenge(), loadCaptainApplications()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to finalize captains');
  } finally {
    captainsFinalizeSubmitting.value = false;
  }
};

const submitCaptainApplication = async () => {
  const id = challengeId.value;
  if (!id) return;
  captainApplySubmitting.value = true;
  captainApplyError.value = '';
  try {
    await api.post(`/learning-program-classes/${id}/captain-applications`, {
      applicationText: captainApplyText.value.trim() || null
    }, { skipGlobalLoading: true });
    captainApplyText.value = '';
    await loadCaptainApplications();
  } catch (e) {
    captainApplyError.value = e?.response?.data?.error?.message || 'Failed to submit application';
  } finally {
    captainApplySubmitting.value = false;
  }
};

// ── Vision screenshot helpers ─────────────────────────────────────────────
const onScreenshotSelected = (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;
  workoutForm.value.screenshotFile = file;
  workoutForm.value.screenshotPreviewUrl = URL.createObjectURL(file);
  workoutForm.value.screenshotFilePath = null;
  visionExtracted.value = false;
  visionError.value = null;
  // Auto-analyze immediately when file is selected
  analyzeScreenshot();
};

const clearScreenshot = () => {
  if (workoutForm.value.screenshotPreviewUrl) URL.revokeObjectURL(workoutForm.value.screenshotPreviewUrl);
  workoutForm.value.screenshotFile = null;
  workoutForm.value.screenshotPreviewUrl = null;
  workoutForm.value.screenshotFilePath = null;
  visionExtracted.value = false;
  visionError.value = null;
  if (screenshotInputRef.value) screenshotInputRef.value.value = '';
};

// Treadmill proof image handlers
const onTreadmillProofSelected = (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;
  if (workoutForm.value.treadmillProofPreviewUrl) URL.revokeObjectURL(workoutForm.value.treadmillProofPreviewUrl);
  workoutForm.value.treadmillProofFile = file;
  workoutForm.value.treadmillProofPreviewUrl = URL.createObjectURL(file);
  workoutForm.value.treadmillProofFilePath = null;
};
const clearTreadmillProof = () => {
  if (workoutForm.value.treadmillProofPreviewUrl) URL.revokeObjectURL(workoutForm.value.treadmillProofPreviewUrl);
  workoutForm.value.treadmillProofFile = null;
  workoutForm.value.treadmillProofPreviewUrl = null;
  workoutForm.value.treadmillProofFilePath = null;
  if (treadmillProofInputRef.value) treadmillProofInputRef.value.value = '';
};

// Map image handlers
const onMapImageSelected = (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;
  if (workoutForm.value.mapImagePreviewUrl) URL.revokeObjectURL(workoutForm.value.mapImagePreviewUrl);
  workoutForm.value.mapImageFile = file;
  workoutForm.value.mapImagePreviewUrl = URL.createObjectURL(file);
  workoutForm.value.mapImageFilePath = null;
};
const clearMapImage = () => {
  if (workoutForm.value.mapImagePreviewUrl) URL.revokeObjectURL(workoutForm.value.mapImagePreviewUrl);
  workoutForm.value.mapImageFile = null;
  workoutForm.value.mapImagePreviewUrl = null;
  workoutForm.value.mapImageFilePath = null;
  if (mapImageInputRef.value) mapImageInputRef.value.value = '';
};

const analyzeScreenshot = async () => {
  const id = challengeId.value;
  const file = workoutForm.value.screenshotFile;
  if (!id || !file) return;
  visionScanning.value = true;
  visionError.value = null;
  visionExtracted.value = false;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(`/learning-program-classes/${id}/workouts/scan-screenshot`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    workoutForm.value.screenshotFilePath = data.filePath || null;
    const ex = data.extracted || {};
    const anyExtracted = ex.distanceMiles != null || ex.durationMinutes != null || ex.caloriesBurned != null || ex.averageHeartrate != null;
    if (ex.distanceMiles    != null && !workoutForm.value.distanceValue)    workoutForm.value.distanceValue    = ex.distanceMiles;
    if (ex.durationMinutes  != null && !workoutForm.value.durationMinutes)  workoutForm.value.durationMinutes  = ex.durationMinutes;
    if (ex.durationSeconds  != null && !workoutForm.value.durationSeconds)  workoutForm.value.durationSeconds  = ex.durationSeconds;
    if (ex.caloriesBurned   != null && !workoutForm.value.caloriesBurned)   workoutForm.value.caloriesBurned   = ex.caloriesBurned;
    if (ex.averageHeartrate != null && !workoutForm.value.averageHeartrate) workoutForm.value.averageHeartrate = ex.averageHeartrate;
    if (ex.terrain         && !workoutForm.value.terrain)                  workoutForm.value.terrain         = ex.terrain;
    if (ex.activityTypeHint && !workoutForm.value.activityType) {
      // Normalize hint to canonical lowercase form used by the activity type options
      const hintMap = { run: 'run', ruck: 'ruck', walk: 'walk', cycling: 'cycling', steps: 'steps',
        'trail run': 'run', jog: 'run', bike: 'cycling', ride: 'cycling' };
      workoutForm.value.activityType = hintMap[ex.activityTypeHint.toLowerCase()] || ex.activityTypeHint.toLowerCase();
    }
    visionConfidence.value = data.confidence || 0;
    // Only show "auto-filled" banner when OCR actually ran and found something
    visionExtracted.value = data.visionEnabled && anyExtracted;
    if (!data.visionEnabled) {
      visionError.value = 'Vision OCR is not enabled on this server. File was uploaded for manual review.';
    } else if (!anyExtracted) {
      visionError.value = 'Could not extract workout data from this image. Please fill in the fields manually.';
    }
  } catch (e) {
    visionError.value = e?.response?.data?.error?.message || 'Screenshot analysis failed. File will be attached on submit.';
  } finally {
    visionScanning.value = false;
  }
};

const submitWorkout = async () => {
  const id = challengeId.value;
  if (!id || !workoutForm.value.activityType) return;
  workoutSubmitting.value = true;
  workoutError.value = '';
  try {
    const uploadFile = async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/learning-program-classes/${id}/workouts/scan-screenshot`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data.filePath || null;
    };
    // Upload workout screenshot (Vision OCR source) if not already uploaded
    if (workoutForm.value.screenshotFile && !workoutForm.value.screenshotFilePath) {
      try { workoutForm.value.screenshotFilePath = await uploadFile(workoutForm.value.screenshotFile); }
      catch { /* non-blocking */ }
    }
    // Upload treadmill proof if not yet uploaded
    if (workoutForm.value.treadmillProofFile && !workoutForm.value.treadmillProofFilePath) {
      try { workoutForm.value.treadmillProofFilePath = await uploadFile(workoutForm.value.treadmillProofFile); }
      catch { /* non-blocking */ }
    }
    // Upload map image if not yet uploaded
    if (workoutForm.value.mapImageFile && !workoutForm.value.mapImageFilePath) {
      try { workoutForm.value.mapImageFilePath = await uploadFile(workoutForm.value.mapImageFile); }
      catch { /* non-blocking */ }
    }
    const raceChipTimeSec = workoutForm.value.isRace
      ? ((Number(workoutForm.value.raceChipMinutes) || 0) * 60 + (Number(workoutForm.value.raceChipSeconds) || 0)) || null
      : null;
    await api.post(`/learning-program-classes/${id}/workouts`, {
      activityType: workoutForm.value.activityType,
      distanceValue: workoutForm.value.distanceValue || null,
      durationMinutes: workoutForm.value.durationMinutes || null,
      durationSeconds: workoutForm.value.durationSeconds != null ? workoutForm.value.durationSeconds : null,
      caloriesBurned: workoutForm.value.caloriesBurned || null,
      averageHeartrate: workoutForm.value.averageHeartrate || null,
      points: pointsAutoComputed.value != null ? pointsAutoComputed.value : (workoutForm.value.points || 0),
      workoutNotes: workoutForm.value.workoutNotes || null,
      weeklyTaskId: workoutForm.value.weeklyTaskId || null,
      isTreadmill: workoutForm.value.isTreadmill === true,
      terrain: workoutForm.value.terrain || null,
      isRace: workoutForm.value.isRace === true,
      raceDistanceMiles: workoutForm.value.isRace ? (workoutForm.value.raceDistanceMiles || null) : null,
      raceChipTimeSeconds: raceChipTimeSec,
      raceOverallPlace: workoutForm.value.isRace ? (workoutForm.value.raceOverallPlace || null) : null,
      screenshotFilePath: workoutForm.value.screenshotFilePath || null,
      treadmillProofFilePath: workoutForm.value.treadmillProofFilePath || null,
      mapImageFilePath: workoutForm.value.mapImageFilePath || null
    });
    // Revoke object URLs
    if (workoutForm.value.screenshotPreviewUrl) URL.revokeObjectURL(workoutForm.value.screenshotPreviewUrl);
    if (workoutForm.value.treadmillProofPreviewUrl) URL.revokeObjectURL(workoutForm.value.treadmillProofPreviewUrl);
    if (workoutForm.value.mapImagePreviewUrl) URL.revokeObjectURL(workoutForm.value.mapImagePreviewUrl);
    workoutForm.value = defaultWorkoutForm();
    visionExtracted.value = false;
    visionError.value = null;
    showLogWorkoutModal.value = false;
    await Promise.all([loadLeaderboard(), loadActivity(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats()]);
  } catch (e) {
    if (Number(e?.response?.status || 0) === 428) {
      await loadChallenge();
    }
    workoutError.value = e?.response?.data?.error?.message || 'Failed to submit workout';
  } finally {
    workoutSubmitting.value = false;
  }
};

const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const refreshAfterActivityAction = async () => {
  await Promise.all([loadActivity(), loadLeaderboard(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats()]);
};

const formatDates = (c) => {
  const start = c?.starts_at || c?.startsAt;
  const end = c?.ends_at || c?.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};

const formatPts = (v) => parseFloat(Number(v || 0).toFixed(2));

const formatStravaDistance = (meters) => {
  if (!meters) return '—';
  const miles = Number(meters) / 1609.34;
  return `${miles.toFixed(1)} mi`;
};
const formatStravaDuration = (sec) => {
  if (!sec) return '—';
  const m = Math.floor(Number(sec) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const formatStravaDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
const stravaActivityUrl = (activityId) => {
  const id = Number(activityId || 0);
  if (!id) return 'https://www.strava.com';
  return `https://www.strava.com/activities/${id}`;
};

const stravaImportAvailable = computed(
  () => !!(stravaStatus.value?.connected && stravaStatus.value?.stravaRolloutEnabled !== false)
);

const loadStravaStatus = async () => {
  try {
    const r = await api.get('/strava/status', { skipGlobalLoading: true });
    stravaStatus.value = r.data || null;
  } catch {
    stravaStatus.value = null;
  }
};


const joinSeasonBusy = ref(false);
const joinSeasonError = ref('');
const joinSeason = async () => {
  if (joinSeasonBusy.value) return;
  joinSeasonBusy.value = true;
  joinSeasonError.value = '';
  try {
    await api.post(`/learning-program-classes/${challengeId.value}/join`, {}, { skipGlobalLoading: true });
    // Refresh provider members so canParticipateInSeason recalculates to true.
    const r = await api.get(`/learning-program-classes/${challengeId.value}`, { skipGlobalLoading: true });
    providerMembers.value = Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : providerMembers.value;
    participationAgreementStatus.value = r.data?.participationAgreementStatus || participationAgreementStatus.value;
  } catch (e) {
    joinSeasonError.value = e.response?.data?.error?.message || 'Could not join — try again.';
  } finally {
    joinSeasonBusy.value = false;
  }
};

const openStravaImportModal = async () => {
  if (stravaStatus.value?.stravaRolloutEnabled === false || !stravaStatus.value?.connected) return;
  showStravaImportModal.value = true;
  selectedStravaIds.value = [];
  stravaActivities.value = [];
  stravaActivitiesError.value = null;
  stravaActivitiesLoading.value = true;
  try {
    // Fetch only today's activities: after = start of today in local time (as UTC epoch seconds)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const after = Math.floor(todayStart.getTime() / 1000);
    const r = await api.get('/strava/activities', { params: { after, per_page: 50 }, skipGlobalLoading: true });
    // Use the browser's local date (en-CA gives YYYY-MM-DD) to match start_date_local from Strava
    const todayDateStr = new Date().toLocaleDateString('en-CA');
    const all = Array.isArray(r.data?.activities) ? r.data.activities : [];
    stravaActivities.value = all.filter((a) => {
      const d = (a.start_date_local || a.start_date || '').slice(0, 10);
      return d === todayDateStr;
    });
  } catch (e) {
    stravaActivitiesError.value = e?.response?.data?.error?.message || 'Failed to load Strava activities';
  } finally {
    stravaActivitiesLoading.value = false;
  }
};

const closeStravaImportModal = () => {
  showStravaImportModal.value = false;
  stravaDuplicateMessage.value = '';
};

const importSelectedStrava = async () => {
  const id = challengeId.value;
  if (!id || !selectedStravaIds.value.length) return;
  stravaImporting.value = true;
  stravaDuplicateMessage.value = '';
  try {
    const { data } = await api.post('/strava/import', {
      learningClassId: id,
      activityIds: selectedStravaIds.value
    });
    const imported = data?.imported ?? 0;
    const skipped = data?.skipped ?? 0;
    if (imported === 0 && skipped > 0) {
      stravaDuplicateMessage.value = `${skipped === 1 ? 'This activity has' : `${skipped} activities have`} already been uploaded and ${skipped === 1 ? 'was' : 'were'} not imported again.`;
      return;
    }
    closeStravaImportModal();
    await Promise.all([loadLeaderboard(), loadActivity(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats()]);
    if (skipped > 0) {
      stravaDuplicateMessage.value = `${skipped === 1 ? '1 activity was' : `${skipped} activities were`} already uploaded and not imported again.`;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to import activities');
  } finally {
    stravaImporting.value = false;
  }
};

onMounted(async () => {
  await loadChallenge();
  if (challenge.value) {
    await Promise.all([
      loadLeaderboard(),
      loadTeams(),
      loadActivity(),
      loadCaptainApplications(),
      loadDraftSessionStatus(),
      loadWeeklyTaskOptions(),
      loadSeasonSummary(),
      loadRecordBoards(),
      loadRaceDivisions(),
      loadKudosStats(),
      loadStravaStatus()
    ]);
  }
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 30000); // refresh every 30 s
  if (route.query?.strava === 'import' && stravaImportAvailable.value) {
    await openStravaImportModal();
  } else if (route.query?.openUpload === '1') {
    // Quick-upload shortcut: prefer Strava import if connected, else open manual form
    if (stravaImportAvailable.value) {
      await openStravaImportModal();
    } else {
      showLogWorkoutModal.value = true;
    }
  } else if (route.query?.openManual === '1') {
    showLogWorkoutModal.value = true;
  }
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
  // Restore the URL-based route slug so the branding reverts to the host org after leaving.
  const urlSlug = String(route.params.organizationSlug || '').trim().toLowerCase();
  if (urlSlug) brandingStore.setActiveRouteSlug(urlSlug);
});

watch(challengeId, () => {
  loadChallenge().then(() => {
    if (challenge.value) {
      Promise.all([loadLeaderboard(), loadTeams(), loadActivity(), loadCaptainApplications(), loadWeeklyTaskOptions(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions()]);
    }
  });
});

// Auto-set isTreadmill when terrain = Treadmill is selected in workout form
watch(() => workoutForm.value.terrain, (terrain) => {
  if (terrain === 'Treadmill') {
    workoutForm.value.isTreadmill = true;
  } else if (workoutForm.value.isTreadmill && terrain && terrain !== 'Treadmill') {
    workoutForm.value.isTreadmill = false;
  }
});
</script>

<style scoped>
.challenge-dashboard {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  overflow-x: hidden;
}
/* ── Season announcement banner ── */
/* ── Season Hero Banner ── */
.season-hero-banner {
  width: 100%;
  height: 220px;
  background-size: cover;
  background-repeat: no-repeat;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  margin-bottom: 0;
}
.season-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.0) 55%);
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 18px 20px;
}
.season-hero-logo {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  object-fit: contain;
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(2px);
  flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.4);
}
.season-hero-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.season-hero-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  margin: 0;
  line-height: 1.2;
}
.season-inline-logo {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: contain;
  flex-shrink: 0;
}
.challenge-title-row--has-banner h1 {
  display: none;
}

.season-announcement-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: linear-gradient(90deg, #fff3cd 0%, #ffe9a0 100%);
  border-left: 4px solid #f0ad4e;
  padding: 10px 16px;
  border-radius: 6px;
  margin-bottom: 14px;
  font-size: 0.93em;
  font-weight: 500;
  color: #7a5c00;
}
.season-announcement-text { flex: 1; }
.season-announcement-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1em;
  color: #7a5c00;
  opacity: 0.6;
  flex-shrink: 0;
}
.season-announcement-close:hover { opacity: 1; }

/* ── Challenge overview header ── */
.challenge-overview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}
.manage-season-btn { white-space: nowrap; }

.challenge-overview {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-color, #ddd);
}
.back-link {
  display: inline-block;
  color: var(--link-color, #0066cc);
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}
.challenge-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.challenge-title-row h1 {
  margin: 0;
}
.challenge-status-badge {
  font-size: 0.85em;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
}
.challenge-status-badge.status-active {
  background: #e8f5e9;
  color: #2e7d32;
}
.challenge-status-badge.status-closed {
  background: #f5f5f5;
  color: #666;
}
.challenge-description {
  margin: 8px 0;
  color: var(--text-muted, #666);
  line-height: 1.5;
}
.challenge-dates {
  margin-top: 4px;
}

/* ── Week countdown banner ── */
.countdown-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.countdown-row .week-countdown { margin-top: 0; }
.week-countdown {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.week-countdown--daily {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e3a8a;
}
.week-countdown--warning {
  background: #fefce8;
  border-color: #fde047;
  color: #854d0e;
}
.week-countdown--urgent {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #991b1b;
}
.week-countdown__icon {
  font-size: 16px;
}
.week-countdown__deadline {
  opacity: .75;
  font-weight: 400;
  font-size: 13px;
}
.club-store-link {
  display: inline-block;
  margin-top: 12px;
  color: var(--link-color, #0066cc);
  text-decoration: none;
  font-weight: 500;
}
.club-store-link:hover {
  text-decoration: underline;
}
/* ── Top join bar (shown before all content for non-enrolled visitors) ── */
.join-season-top-bar {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 16px;
  border-left: 4px solid #c8102e;
}
.join-season-top-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.join-season-top-msg {
  color: #e2e8f0;
  font-size: 0.95rem;
  font-weight: 500;
}
.join-season-top-btn {
  white-space: nowrap;
  font-weight: 700;
  padding: 9px 22px;
  flex-shrink: 0;
}

.join-season-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 20px;
  background: #f8faff;
  border: 2px dashed #c8102e;
  border-radius: 10px;
}
.join-season-msg {
  margin: 0;
  font-size: 1rem;
  color: #444;
}
.join-season-btn {
  white-space: nowrap;
  font-weight: 700;
  padding: 10px 24px;
}
/* Scroll navigation bar */
.dash-section-nav {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: #f8f8f8;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
}
.dash-nav-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #555;
  background: #fff;
  border: 1px solid #ddd;
  text-decoration: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  scroll-behavior: smooth;
}
.dash-nav-pill:hover {
  background: #c8102e;
  color: #fff;
  border-color: #c8102e;
}

.season-action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 14px 16px;
  background: #fff;
  border: 2px solid #c8102e;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(200,16,46,0.08);
  flex-wrap: wrap;
}
.season-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  border: none;
  transition: filter 0.15s;
}
.season-action-btn:hover { filter: brightness(0.92); }
.season-action-btn--primary {
  background: #c8102e;
  color: #fff;
}
.season-action-btn--strava {
  background: #fc4c02;
  color: #fff;
}
.season-action-icon {
  font-size: 1.2rem;
  font-weight: 900;
  line-height: 1;
}
.challenge-feed-full {
  /* Activity feed takes full width — no artificial height cap */
  width: 100%;
}
.challenge-chat-full {
  /* Chat also full width, sits below the activity feed */
  width: 100%;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
@media (max-width: 740px) {
  .season-action-bar { flex-direction: column; align-items: stretch; }
  .season-action-btn { justify-content: center; }
}
.challenge-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.challenge-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr);
  gap: 16px;
}
.challenge-col-left,
.challenge-col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.challenge-section {
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.treadmillpocalypse-banner {
  background: linear-gradient(135deg, #1e3a5f 0%, #c0392b 100%);
  border-color: #a93226;
  padding: 14px 18px;
}
.treadmillpocalypse-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}
.treadmillpocalypse-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 8px;
}
.treadmillpocalypse-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #fff;
}
.treadmillpocalypse-text strong {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.treadmillpocalypse-text span {
  font-size: 0.88rem;
  opacity: 0.88;
}
.challenge-section h2 {
  margin: 0 0 16px 0;
  font-size: 1.15em;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}
.summary-grid {
  display: grid;
  gap: 12px;
}
.summary-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  background: #f8fafc;
}
.summary-card h4 {
  margin: 0 0 10px;
  font-size: 0.82em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #e63946;
}
.summary-card ol {
  margin: 0;
  padding-left: 18px;
  font-size: 0.9em;
  line-height: 1.7;
  color: #334155;
}
.summary-card ul {
  margin: 0;
  padding-left: 18px;
  font-size: 0.9em;
  line-height: 1.7;
  color: #334155;
}
.section-hint {
  margin: -6px 0 12px;
  font-size: 0.85em;
  color: #888;
}
.race-divisions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.race-division-card {
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.race-division-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.hm-header {
  background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
}
.marathon-header {
  background: linear-gradient(135deg, #fff8e1, #ffe082);
}
.race-badge {
  font-size: 1.6rem;
  line-height: 1;
}
.race-division-header h4 {
  margin: 0 0 2px;
  font-size: 1rem;
  font-weight: 700;
}
.race-threshold {
  margin: 0;
  font-size: 0.78em;
  color: #666;
}
.race-tabs {
  display: flex;
  border-bottom: 1px solid #eee;
}
.race-tab-btn {
  flex: 1;
  padding: 6px 10px;
  border: none;
  background: transparent;
  font-size: 0.82em;
  cursor: pointer;
  color: #666;
  transition: background 0.15s;
}
.race-tab-btn.active {
  background: #f5f5f5;
  font-weight: 600;
  color: #222;
  border-bottom: 2px solid #3498db;
}
.race-members-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  max-height: 220px;
  overflow-y: auto;
}
.race-members-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-bottom: 1px solid #f5f5f5;
  font-size: 0.88em;
}
.race-members-list li:last-child {
  border-bottom: none;
}
.race-member-name {
  flex: 1;
  font-weight: 500;
}
.race-member-time {
  color: #555;
  font-variant-numeric: tabular-nums;
}
.race-member-count {
  background: #eee;
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 0.78em;
  color: #555;
}
.race-empty {
  color: #aaa;
  font-style: italic;
  font-size: 0.85em;
  justify-content: center;
}
.workout-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-row label {
  font-size: 0.9em;
}
.form-row input,
.form-row select,
.form-row textarea {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.hint-inline {
  font-size: 0.8em;
  color: var(--text-muted, #888);
  font-weight: 400;
}
.points-preview {
  font-size: 0.95em;
  color: var(--primary, #2563eb);
  padding: 6px 8px;
  background: rgba(37,99,235,0.07);
  border-radius: 6px;
}
.points-preview em { font-size: 0.85em; color: var(--text-muted, #888); }
.race-toggle-row { margin-top: 4px; }
.race-toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.92em;
  cursor: pointer;
}
.race-details-panel {
  background: #fff8e1;
  border: 1px solid #f0cc70;
  border-radius: 8px;
  padding: 12px 14px;
  margin: 4px 0 8px;
}
.race-fields-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.form-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.86em;
}
.form-col label { font-weight: 600; color: #555; }
.form-col input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.time-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.form-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-content.modal-wide {
  min-width: 480px;
}
.log-workout-modal {
  width: min(560px, 96vw);
}

/* ── Full-screen modals on mobile / Capacitor ─────────────────── */
@media (max-width: 600px) {
  .modal-overlay {
    align-items: flex-end;
  }
  .modal-content,
  .modal-content.modal-wide,
  .log-workout-modal {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    max-height: 92dvh;
    height: 92dvh;
    border-radius: 16px 16px 0 0;
    padding: 20px 16px;
    padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
.log-workout-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.log-workout-modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}
.modal-close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}
.modal-close-btn:hover {
  background: #f0f0f0;
  color: #333;
}
.strava-duplicate-notice {
  background: #fff8e1;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 10px 14px;
  margin: 12px 0 4px;
  font-size: 14px;
  color: #92400e;
}
.strava-activity-list {
  max-height: min(400px, 45dvh);
  overflow-y: auto;
  margin: 16px 0;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.strava-activity-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s;
}
.strava-activity-item:hover {
  background: #f8fafc;
}
.strava-activity-item.selected {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.strava-activity-check {
  flex-shrink: 0;
  margin-top: 3px;
}
.strava-activity-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.strava-activity-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.activity-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary, #0f172a);
}
.strava-activity-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.strava-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}
.strava-badge--map { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
.strava-badge--hr  { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
.strava-badge--elev { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.strava-badge--cal  { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
.strava-activity-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted, #64748b);
}
.strava-meta-pill {
  background: #f1f5f9;
  border-radius: 4px;
  padding: 1px 6px;
  font-weight: 500;
  font-size: 11px;
  color: #334155;
}
.strava-meta-date {
  margin-left: auto;
}
.strava-view-link {
  color: #fc5200;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.strava-compatible-logo {
  height: 20px;
  width: auto;
  margin: 6px 0 4px;
  display: block;
}
.activity-meta {
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.loading-inline,
.error-inline {
  padding: 16px;
  color: var(--text-muted, #666);
}
.error-inline {
  color: #c62828;
}
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.captain-apps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.captain-app-card {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafafa;
}
.captain-app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.captain-app-status {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 999px;
  padding: 2px 8px;
  border: 1px solid #ddd;
}
.captain-app-status.status-pending {
  background: #fff8e1;
}
.captain-app-status.status-approved {
  background: #e8f5e9;
}
.captain-app-status.status-rejected {
  background: #ffebee;
}
.captain-app-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.captain-finalize {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.captain-app-card--mine {
  border-color: #c8102e;
  background: #fff8f8;
}
.captain-apply-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.captain-apply-textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}
.captain-apply-textarea:focus {
  outline: none;
  border-color: #c8102e;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.12);
}
.captain-apply-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
@media (max-width: 980px) {
  .challenge-two-col {
    grid-template-columns: 1fr;
  }
}

/* ── Kudos stats ─────────────────────────────────────────────────────────── */
.kudos-stats-section h2 { margin: 0 0 12px; font-size: 1.05em; }
.kudos-budget-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #fff7ed;
  border: 1.5px solid #fed7aa;
  border-radius: 20px;
  padding: 4px 14px;
  margin-bottom: 14px;
  font-size: 0.85em;
}
.kudos-budget-remaining {
  font-size: 1.4em;
  font-weight: 800;
  color: #ea580c;
}
.kudos-budget-label { color: #9a3412; font-weight: 500; }
.kudos-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.kudos-stat-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
}
.kudos-stat-title {
  font-size: 0.8em;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}
.kudos-stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 0.85em;
  border-bottom: 1px solid #f1f5f9;
}
.kudos-stat-row:last-child { border-bottom: none; }
.kudos-rank {
  font-size: 0.75em;
  font-weight: 700;
  color: #94a3b8;
  min-width: 16px;
}
.kudos-name { flex: 1; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kudos-num {
  font-weight: 700;
  color: #ea580c;
  min-width: 24px;
  text-align: right;
}

/* ── Weekly task display cards ──────────────────────────────────────────── */
.weekly-task-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.weekly-task-display-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-season-long {
  border-color: #c4b5fd;
  background: #faf5ff;
}
.task-display-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.task-display-name {
  font-size: 0.95em;
  color: #1e293b;
  flex: 1;
}
.task-badge {
  font-size: 0.72em;
  border-radius: 12px;
  padding: 2px 8px;
  font-weight: 600;
}
.task-badge-week    { background: #dbeafe; color: #1d4ed8; }
.task-badge-season  { background: #ede9fe; color: #6d28d9; }
.task-display-desc {
  font-size: 0.85em;
  color: #64748b;
  margin: 0;
}
.task-criteria-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.criteria-chip {
  font-size: 0.75em;
  background: #f1f5f9;
  color: #334155;
  border-radius: 12px;
  padding: 2px 8px;
  border: 1px solid #e2e8f0;
}
.split-run-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82em;
  color: #475569;
}
.split-run-checks { display: flex; gap: 4px; }
.split-check {
  font-size: 0.9em;
  width: 18px;
  text-align: center;
}
.split-check.done { color: #16a34a; font-weight: 700; }
.split-check.pending { color: #94a3b8; }
.task-tag-btn {
  align-self: flex-start;
  margin-top: 2px;
}
.task-tag-active {
  background: #dcfce7 !important;
  border-color: #86efac !important;
  color: #15803d !important;
}

/* ── Workout upload sections ─────────────────────────────────────────────── */
.optional-tag {
  font-size: 0.75em;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 5px;
}
.required-tag {
  font-size: 0.75em;
  font-weight: 600;
  color: #dc2626;
  margin-left: 5px;
}
.workout-upload-section {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #f8fafc;
}
.workout-upload-section--required {
  border-color: #fca5a5;
  background: #fff8f8;
}
.workout-upload-section--optional {
  border-color: #e2e8f0;
  background: #fafafa;
}
.workout-upload-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.92em;
  color: #334155;
  margin-bottom: 6px;
}
.upload-step-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #1d4ed8;
  color: #fff;
  font-size: 0.78em;
  font-weight: 700;
  flex-shrink: 0;
}
.upload-step-badge--required { background: #dc2626; }
.upload-step-badge--optional { background: #94a3b8; }
.upload-hint {
  font-size: 0.8em;
  color: #64748b;
  margin: 0 0 10px 0;
  line-height: 1.4;
}
.vision-file-area {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 18px;
  text-align: center;
  cursor: pointer;
  color: #64748b;
  font-size: 0.9em;
  transition: border-color 0.2s, background 0.2s;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.vision-file-area--primary { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.vision-file-area--primary:hover { border-color: #3b82f6; background: #dbeafe; }
.vision-file-area--compact { padding: 12px; }
.vision-file-area:hover { border-color: #94a3b8; background: #f1f5f9; }
.vision-drop-icon { font-size: 1.5em; }
.vision-preview-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.vision-preview-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.vision-scanning-badge {
  font-size: 0.84em;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  padding: 6px 10px;
}
.screenshot-thumbnail {
  max-width: 100%;
  max-height: 120px;
  border-radius: 6px;
  object-fit: contain;
  border: 1px solid #e2e8f0;
}
.screenshot-thumbnail--lg {
  max-height: 180px;
  min-width: 80px;
  max-width: 160px;
}
.vision-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.btn-sm {
  font-size: 0.82em;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: none;
}
.btn-ghost {
  background: transparent;
  color: #64748b;
  border: 1px solid #cbd5e1;
}
.btn-ghost:hover { background: #f1f5f9; }
.vision-extracted-banner {
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.82em;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.confidence-badge {
  margin-left: auto;
  background: #065f46;
  color: #fff;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 0.78em;
  white-space: nowrap;
}
.vision-error-banner {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #7f1d1d;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.82em;
}
.form-row-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.form-row-group .form-row { margin-bottom: 0; }

.team-captain-msg-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* Live Draft banner */
.live-draft-banner {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(16,185,129,.12), rgba(99,102,241,.1));
  border: 1px solid rgba(16,185,129,.25);
  flex-wrap: wrap;
}
.live-draft-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #10b981; flex-shrink: 0;
  animation: ldPulse 1.4s ease-in-out infinite;
}
@keyframes ldPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.live-draft-banner__text {
  display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
}
.live-draft-banner__label { font-weight: 700; font-size: 14px; }
.live-draft-banner__sub { font-size: 12px; color: var(--text-secondary, #6b7280); }
.live-draft-banner__btn { flex-shrink: 0; text-decoration: none; }
.team-msg-modal .form-row {
  margin-bottom: 12px;
}
.team-msg-modal .form-row--2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.team-msg-file {
  margin-top: 6px;
  font-size: 0.85em;
}
.form-control {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}

/* Match My club dashboard announcement UI */
.sstc-announcement-banner {
  background: linear-gradient(90deg, #eff6ff 0%, #ffffff 100%);
  border-left: 4px solid #2563eb;
  border-radius: 16px;
  padding: 8px 0;
  margin-bottom: 18px;
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
  padding-left: 100%;
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
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
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
</style>
