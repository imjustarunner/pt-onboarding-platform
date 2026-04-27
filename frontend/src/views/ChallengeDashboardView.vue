<template>
  <div class="challenge-dashboard">
    <div v-if="loading" class="loading">Loading season…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!challenge" class="empty-state">Season not found.</div>
    <div v-else class="challenge-detail">
      <PlatformPreviewBanner
        v-if="isSuperadminPreview"
        :title="`Previewing ${challenge.class_name || challenge.className || 'season'} dashboard`"
        subtitle="This platform preview keeps the season experience visible while workout and enrollment actions stay read-only."
        tone="warm"
      />
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
      <!-- Manager trophy-posting prompt (per-login, dismissible) -->
      <RecognitionWeekPrompt
        v-if="challenge?.id && isChallengeManager"
        :season-id="challenge.id"
        @posted="standingsKey++"
      />

      <!-- Member recognition splash (first time seeing each week's awards) -->
      <SeasonRecognitionSplash
        v-if="challenge?.id"
        :season-id="challenge.id"
      />

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
            v-if="isChallengeManager && organizationSlug && !isSuperadminPreview"
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
        <!-- My Team shortcut -->
        <router-link
          v-if="myTeamId && organizationSlug && challengeId"
          :to="`/${organizationSlug}/season/${challengeId}/team/${myTeamId}`"
          class="my-team-btn"
        >
          {{ myTeamName ? `🏃 ${myTeamName}` : '🏃 My Team' }}
        </router-link>
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

      <!-- ── Pre-Season Countdown Banner ──────────────────────────── -->
      <div v-if="isPreSeason && seasonStartCountdown" class="preseason-countdown-banner">
        <div class="preseason-countdown-label">Season Starts In</div>
        <div class="preseason-countdown-units">
          <div class="preseason-countdown-unit">
            <span class="preseason-countdown-num">{{ seasonStartCountdown.days }}</span>
            <span class="preseason-countdown-sub">{{ seasonStartCountdown.days === 1 ? 'Day' : 'Days' }}</span>
          </div>
          <span class="preseason-countdown-sep">:</span>
          <div class="preseason-countdown-unit">
            <span class="preseason-countdown-num">{{ String(seasonStartCountdown.hours).padStart(2, '0') }}</span>
            <span class="preseason-countdown-sub">Hours</span>
          </div>
          <span class="preseason-countdown-sep">:</span>
          <div class="preseason-countdown-unit">
            <span class="preseason-countdown-num">{{ String(seasonStartCountdown.minutes).padStart(2, '0') }}</span>
            <span class="preseason-countdown-sub">Min</span>
          </div>
          <span class="preseason-countdown-sep">:</span>
          <div class="preseason-countdown-unit">
            <span class="preseason-countdown-num">{{ String(seasonStartCountdown.seconds).padStart(2, '0') }}</span>
            <span class="preseason-countdown-sub">Sec</span>
          </div>
        </div>
        <div class="preseason-countdown-meta">
          Pre-Season · Week {{ preSeasonWeek }} ·
          {{ challenge.starts_at || challenge.startsAt
              ? new Date(challenge.starts_at || challenge.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '' }}
        </div>
      </div>
      <!-- ──────────────────────────────────────────────────────────── -->

      <!-- Not-enrolled call-to-action — shown at the top so visitors immediately see it -->
      <div v-if="!isSuperadminPreview && !canParticipateInSeason && !requiresParticipationAcceptance" class="join-season-top-bar">
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
      <div v-else-if="!isSuperadminPreview && !canParticipateInSeason && requiresParticipationAcceptance" class="join-season-top-bar">
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
      <div v-if="canParticipateInSeason && !isSuperadminPreview" class="season-action-bar">
        <button type="button" class="season-action-btn season-action-btn--primary" @click="openLogWorkoutModal">
          <span class="season-action-icon">+</span> Log Workout
        </button>
        <button v-if="stravaImportAvailable" type="button" class="season-action-btn season-action-btn--strava" @click="openStravaImportModal">
          Import from Strava
        </button>
        <span v-else-if="STRAVA_COMING_SOON" class="season-action-btn season-action-btn--coming-soon" title="Strava integration coming soon">
          Strava <span class="coming-soon-tag">Coming Soon</span>
        </span>
        <button v-if="isChallengeManager && isBerlinChallenge" type="button" class="season-action-btn season-action-btn--secondary" @click="openBulkUploadModal">
          Bulk Upload On Behalf
        </button>
      </div>

      <!-- ── Pre-Season Standings Card ─────────────────────────────── -->
      <div v-if="isPreSeason" class="preseason-standings-card">
        <div class="preseason-standings-header">
          <span class="preseason-standings-title">Pre-Season Standings</span>
          <span class="preseason-standings-week">Week {{ preSeasonWeek }}</span>
        </div>
        <p class="preseason-standings-note">
          Pre-season workouts count toward club totals but not season records or team points.
        </p>

        <div v-if="preSeasonStatsLoading && !preSeasonStats" class="preseason-standings-loading">Loading…</div>
        <div v-else-if="!preSeasonStats || (!preSeasonStats.teamStandings?.length && !preSeasonStats.individualStandings?.length)" class="preseason-standings-empty">
          No pre-season workouts logged yet. Be the first!
        </div>
        <template v-else>
          <!-- Team standings -->
          <div v-if="preSeasonStats.teamStandings?.length" class="preseason-standings-section">
            <div class="preseason-standings-section-title">Teams</div>
            <ol class="preseason-standings-list">
              <li
                v-for="(team, idx) in preSeasonStats.teamStandings"
                :key="team.teamId ?? idx"
                class="preseason-standings-row"
              >
                <span class="preseason-standings-rank">{{ idx + 1 }}.</span>
                <span class="preseason-standings-name">{{ team.teamName }}</span>
                <span class="preseason-standings-stat">{{ team.miles.toFixed(1) }} mi</span>
                <span class="preseason-standings-stat preseason-standings-stat--secondary">{{ team.workouts }} wb</span>
              </li>
            </ol>
          </div>

          <!-- Individual standings -->
          <div v-if="preSeasonStats.individualStandings?.length" class="preseason-standings-section">
            <div class="preseason-standings-section-title">Individuals</div>
            <ol class="preseason-standings-list">
              <li
                v-for="(person, idx) in preSeasonStats.individualStandings.slice(0, 10)"
                :key="person.userId"
                class="preseason-standings-row"
              >
                <span class="preseason-standings-rank">{{ idx + 1 }}.</span>
                <span class="preseason-standings-name">
                  {{ person.firstName }} {{ person.lastName?.slice(0, 1) }}.
                  <span v-if="person.teamName" class="preseason-standings-team">({{ person.teamName }})</span>
                </span>
                <span class="preseason-standings-stat">{{ person.miles.toFixed(1) }} mi</span>
                <span class="preseason-standings-stat preseason-standings-stat--secondary">{{ person.workouts }} wb</span>
              </li>
            </ol>
          </div>
        </template>
      </div>
      <!-- ──────────────────────────────────────────────────────────── -->

      <!-- Matchup Standings & Schedule (additive — only when matchups enabled) -->
      <div v-if="matchupsEnabled" class="matchup-dash-section">
        <div id="section-matchups" class="mu-board">

          <!-- ── Board header: title + week nav ───────────────────── -->
          <div class="mu-board-header">
            <div class="mu-board-title-block">
              <h3 class="mu-board-title">WEEKLY MATCHUPS</h3>
              <div v-if="selectedDisplayWeekDate" class="mu-board-subtitle">
                Week {{ selectedDisplayWeekIdx + 1 }}
                <span class="mu-subtitle-dot">·</span>
                {{ fmtWeekDate(selectedDisplayWeekDate) }}
                <span class="mu-status-pill" :class="displayedWeekStatusClass">{{ displayedWeekStatusLabel }}</span>
              </div>
            </div>
            <div class="mu-week-nav">
              <select v-model="selectedDisplayWeekIdx" class="mu-week-select">
                <option v-for="(w, i) in matchupWeeks" :key="w.date" :value="i">Week {{ i + 1 }}</option>
              </select>
              <button class="mu-nav-btn" @click="navigateWeek(-1)" :disabled="selectedDisplayWeekIdx <= 0">‹</button>
              <button class="mu-nav-btn" @click="navigateWeek(1)" :disabled="selectedDisplayWeekIdx >= matchupWeeks.length - 1">›</button>
            </div>
          </div>

          <!-- ── Hero matchup cards ─────────────────────────────── -->
          <div v-if="matchupScheduleLoading && !matchupWeeks.length" class="mu-loading">Loading matchups…</div>
          <div v-else-if="!matchupWeeks.length" class="mu-empty">No matchup schedule available yet.</div>
          <div v-else class="mu-hero-cards">
            <div v-for="m in orientedDisplayMatchups" :key="m.id" class="mu-hero-card">

              <!-- LEFT side: [logo] [name···] [score] — score closest to VS -->
              <div
                class="mu-hero-side mu-hero-side--left"
                :class="{ 'mu-hero-side--winner': m.left.isWinner, 'mu-hero-side--leading': m.isLeading }"
                :style="{
                  background: `linear-gradient(to right, ${m.left.color}44 0%, ${m.left.color}18 55%, transparent 100%)`,
                  borderLeft: `3px solid ${m.left.color}`
                }"
              >
                <div class="mu-hero-logo-wrap" :style="{ borderColor: m.left.color }">
                  <img v-if="m.left.logo" :src="resolveUploadUrl(m.left.logo)" class="mu-hero-logo" alt="" />
                  <div v-else class="mu-hero-logo-placeholder" :style="{ color: m.left.color }">{{ (m.left.name || '?')[0].toUpperCase() }}</div>
                </div>
                <span class="mu-hero-team-label mu-hero-team-label--left">{{ m.left.name }}</span>
                <span class="mu-hero-score" :class="m.left.isWinner || m.isLeading ? 'mu-score--leader' : 'mu-score--trail'" :style="{ color: m.left.color }">
                  {{ m.left.score != null ? Number(m.left.score).toFixed(1) : '—' }}
                </span>
              </div>

              <!-- VS center -->
              <div class="mu-hero-center">
                <div class="mu-vs-diamond">
                  <span class="mu-vs-text">{{ m.isResolved ? (m.tied ? 'TIE' : 'FINAL') : 'VS' }}</span>
                </div>
                <div v-if="!m.isResolved && m.isCurrentWeek" class="mu-live-badge">
                  <span class="mu-live-dot"></span>LIVE
                </div>
              </div>

              <!-- RIGHT side: [score] [···name] [logo] — score closest to VS -->
              <div
                class="mu-hero-side mu-hero-side--right"
                :class="{ 'mu-hero-side--winner': m.right.isWinner }"
                :style="{
                  background: `linear-gradient(to left, ${m.right.color}44 0%, ${m.right.color}18 55%, transparent 100%)`,
                  borderRight: `3px solid ${m.right.color}`
                }"
              >
                <span class="mu-hero-score mu-score--trail" :style="{ color: m.right.color }">
                  {{ m.right.score != null ? Number(m.right.score).toFixed(1) : '—' }}
                </span>
                <span class="mu-hero-team-label mu-hero-team-label--right">{{ m.right.name }}</span>
                <div class="mu-hero-logo-wrap" :style="{ borderColor: m.right.color }">
                  <img v-if="m.right.logo" :src="resolveUploadUrl(m.right.logo)" class="mu-hero-logo" alt="" />
                  <div v-else class="mu-hero-logo-placeholder" :style="{ color: m.right.color }">{{ (m.right.name || '?')[0].toUpperCase() }}</div>
                </div>
              </div>
            </div>

            <div v-if="!orientedDisplayMatchups.length" class="mu-hero-none">
              No matchups scheduled for this week.
            </div>
          </div>

          <!-- ── Week-by-week accordion list ───────────────────────── -->
          <div class="mu-week-list">
            <div
              v-for="(week, wIdx) in matchupWeeks"
              :key="week.date"
              class="mu-week-item"
              :class="{ 'mu-week-item--current': week.date === matchupCurrentWeekStart }"
            >
              <button class="mu-week-row" @click="toggleMatchupWeek(week.date)">
                <span class="mu-wk-icon">📅</span>
                <span class="mu-wk-num">WEEK {{ wIdx + 1 }}</span>
                <span class="mu-wk-date">{{ fmtWeekDate(week.date) }}</span>
                <span class="mu-wk-pill" :class="{
                  'mu-pill--final': week.matchups.every(m => m.resolvedAt),
                  'mu-pill--live': week.date === matchupCurrentWeekStart && !week.matchups.every(m => m.resolvedAt),
                  'mu-pill--upcoming': week.date !== matchupCurrentWeekStart && !week.matchups.some(m => m.resolvedAt)
                }">
                  <template v-if="week.matchups.every(m => m.resolvedAt)">FINAL</template>
                  <template v-else-if="week.date === matchupCurrentWeekStart">IN PROGRESS</template>
                  <template v-else>UPCOMING</template>
                </span>
                <div class="mu-wk-preview">
                  <template v-for="(m, mi) in week.matchups" :key="m.id">
                    <span v-if="mi > 0" class="mu-wk-preview-sep">·</span>
                    <img v-if="m.team1Logo" :src="resolveUploadUrl(m.team1Logo)" class="mu-wk-logo" alt="" />
                    <span class="mu-wk-preview-name" :class="{ 'mu-wk-winner': m.winnerTeamId === m.team1Id }">{{ m.team1Name }}</span>
                    <span class="mu-wk-score" :class="{ 'mu-wk-score--leading': m.winnerTeamId === m.team1Id || (!m.resolvedAt && (m.team1LivePoints ?? 0) > (m.team2LivePoints ?? 0)) }">
                      {{ m.resolvedAt ? (m.team1Points != null ? m.team1Points.toFixed(1) : '') : (m.team1LivePoints != null ? m.team1LivePoints.toFixed(1) : '') }}
                    </span>
                    <span class="mu-wk-vs">VS</span>
                    <span class="mu-wk-score" :class="{ 'mu-wk-score--leading': m.winnerTeamId === m.team2Id || (!m.resolvedAt && (m.team2LivePoints ?? 0) > (m.team1LivePoints ?? 0)) }">
                      {{ m.resolvedAt ? (m.team2Points != null ? m.team2Points.toFixed(1) : '') : (m.team2LivePoints != null ? m.team2LivePoints.toFixed(1) : '') }}
                    </span>
                    <span class="mu-wk-preview-name mu-wk-preview-name--right" :class="{ 'mu-wk-winner': m.winnerTeamId === m.team2Id }">{{ m.team2Name }}</span>
                    <img v-if="m.team2Logo" :src="resolveUploadUrl(m.team2Logo)" class="mu-wk-logo" alt="" />
                  </template>
                </div>
                <span class="mu-wk-chevron">{{ matchupExpandedWeeks.has(week.date) ? '▲' : '▼' }}</span>
              </button>

              <!-- Expanded detail body -->
              <div v-if="matchupExpandedWeeks.has(week.date)" class="mu-week-body">
                <div v-for="m in week.matchups" :key="m.id" class="mu-body-row">
                  <div class="mu-body-team" :class="{ 'mu-body-winner': m.winnerTeamId === m.team1Id }">
                    <img v-if="m.team1Logo" :src="resolveUploadUrl(m.team1Logo)" class="mu-body-logo" alt="" />
                    <span>{{ m.team1Name }}</span>
                  </div>
                  <div class="mu-body-scores">
                    <span :class="{ 'mu-body-pts-win': m.winnerTeamId === m.team1Id }">
                      {{ m.resolvedAt ? (m.team1Points != null ? m.team1Points.toFixed(1) : '—') : (m.team1LivePoints != null ? m.team1LivePoints.toFixed(1) : '—') }}
                    </span>
                    <span class="mu-body-vs">vs</span>
                    <span :class="{ 'mu-body-pts-win': m.winnerTeamId === m.team2Id }">
                      {{ m.resolvedAt ? (m.team2Points != null ? m.team2Points.toFixed(1) : '—') : (m.team2LivePoints != null ? m.team2LivePoints.toFixed(1) : '—') }}
                    </span>
                  </div>
                  <div class="mu-body-team mu-body-team--right" :class="{ 'mu-body-winner': m.winnerTeamId === m.team2Id }">
                    <span>{{ m.team2Name }}</span>
                    <img v-if="m.team2Logo" :src="resolveUploadUrl(m.team2Logo)" class="mu-body-logo" alt="" />
                  </div>
                  <span v-if="m.isTie" class="mu-body-badge mu-body-badge--tie">TIE</span>
                  <span v-else-if="m.resolvedAt" class="mu-body-badge mu-body-badge--win">{{ m.winnerName }} wins</span>
                  <span v-else-if="week.date === matchupCurrentWeekStart" class="mu-body-badge mu-body-badge--live">● Live</span>
                  <span v-else class="mu-body-badge mu-body-badge--upcoming">Upcoming</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Season W/L Standings ───────────────────────────── -->
          <div v-if="matchupStandings.length || matchupsEnabled" class="mu-standings-block">
            <div class="mu-standings-header">
              <span class="mu-standings-title">Season Standings</span>
              <span class="mu-standings-cols">
                <span>W</span><span>L</span><span>T</span>
              </span>
            </div>
            <div
              v-for="(s, sIdx) in matchupStandings"
              :key="s.teamId"
              class="mu-standings-row"
              :class="{ 'mu-standings-row--mine': s.teamId === myTeamId }"
              :style="{ borderLeft: `3px solid ${s.teamColor || resolveMatchupTeamColor(s.teamId, null)}` }"
            >
              <span class="mu-s-rank">{{ s.rank }}</span>
              <div class="mu-s-team-cell">
                <img v-if="s.logoPath" :src="resolveUploadUrl(s.logoPath)" class="mu-s-logo" alt="" />
                <div v-else class="mu-s-logo mu-s-logo--placeholder" :style="{ background: s.teamColor || resolveMatchupTeamColor(s.teamId, null) }">
                  {{ (s.teamName || '?')[0].toUpperCase() }}
                </div>
                <span class="mu-s-name">{{ s.teamName }}</span>
              </div>
              <span class="mu-standings-wlt">
                <span class="mu-standings-w">{{ s.wins }}</span>
                <span class="mu-standings-l">{{ s.losses }}</span>
                <span class="mu-standings-t">{{ s.ties }}</span>
              </span>
            </div>
          </div>

        </div>
      </div>
      <!-- ──────────────────────────────────────────────────────────── -->

      <!-- Section scroll nav -->
      <nav class="dash-section-nav" aria-label="Jump to section">
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-activity')">Activity</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-chat')">Chat</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-leaderboard')">Leaderboard</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-scoreboard')">Scoreboard</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-team-progress')">Team Standings</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-summary')">Summary</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-weekly-challenges')">Weekly Challenges</button>
        <button class="dash-nav-pill" type="button" @click="scrollToSection('section-rules')">Season Rules</button>
        <button v-if="matchupsEnabled" class="dash-nav-pill" type="button" @click="scrollToSection('section-matchups')">Matchups</button>
        <span class="dash-section-nav-spacer" aria-hidden="true"></span>
        <button
          class="dash-nav-pill dash-nav-pill--customize"
          :class="{ 'dash-nav-pill--customize-on': dashboardLayout.editMode.value }"
          type="button"
          @click="toggleLayoutEdit"
        >
          {{ dashboardLayout.editMode.value ? 'Done' : 'Customize layout' }}
        </button>
        <button
          v-if="dashboardLayout.editMode.value"
          class="dash-nav-pill dash-nav-pill--reset"
          type="button"
          @click="resetLayoutOrder"
        >
          Reset
        </button>
      </nav>

      <p v-if="dashboardLayout.editMode.value" class="dash-layout-help">
        Use the ▲ and ▼ buttons on each card to put your dashboard in the order you want. Saved automatically per user.
      </p>

      <div class="challenge-sections">
        <!-- Activity feed — full-width, dominant, the main interaction surface -->
        <DashboardSectionWrapper
          :id="'activity'"
          :label="sectionLabel('activity')"
          :order="dashboardLayout.orderOf('activity')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('activity')"
          :disable-down="sectionIsLast('activity')"
          @move-up="moveSectionUp('activity')"
          @move-down="moveSectionDown('activity')"
        >
          <div id="section-activity" class="challenge-feed-full">
            <ChallengeActivityFeed
              :workouts="activity"
              :loading="activityLoading"
              :challenge-id="challengeId"
              :my-user-id="authStore.user?.id"
              :my-team-id="myTeamId"
              :is-manager="isChallengeManager"
              :activity-type-options="activityTypeOptions"
              :all-teams="teams"
              :club-id="challenge?.organization_id"
              :weekly-task-options="taggableWeeklyTaskOptions"
              :moderation-mode="challenge?.season_settings_json?.workoutModeration?.mode || 'treadmill_only'"
              @media-uploaded="refreshAfterActivityAction"
              @open-profile="({ userId, name }) => { profileUserId = userId; profileUserName = name; }"
            />
          </div>
        </DashboardSectionWrapper>

        <!-- Season / Team chat — full-width below the feed -->
        <DashboardSectionWrapper
          :id="'chat'"
          :label="sectionLabel('chat')"
          :order="dashboardLayout.orderOf('chat')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('chat')"
          :disable-down="sectionIsLast('chat')"
          @move-up="moveSectionUp('chat')"
          @move-down="moveSectionDown('chat')"
        >
          <div id="section-chat" class="challenge-chat-full">
            <ChallengeMessageFeed
              :challenge-id="challengeId"
              :my-user-id="authStore.user?.id"
              :is-manager="isChallengeManager"
              :team-mate-user-ids="myTeamMateUserIds"
              :mention-slugs="myChatMentionSlugs"
              team-accent-color="#ea580c"
            />
          </div>
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          :id="'leaderboard'"
          :label="sectionLabel('leaderboard')"
          :order="dashboardLayout.orderOf('leaderboard')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('leaderboard')"
          :disable-down="sectionIsLast('leaderboard')"
          @move-up="moveSectionUp('leaderboard')"
          @move-down="moveSectionDown('leaderboard')"
        >
          <div id="section-leaderboard" class="challenge-section">
            <ChallengeLeaderboard
              :leaderboard="leaderboard"
              :loading="leaderboardLoading"
              :challenge-id="challengeId"
              :season-starts-at="challenge?.starts_at || challenge?.startsAt"
              :season-ends-at="challenge?.ends_at || challenge?.endsAt"
              @open-profile="({ userId, name }) => { profileUserId = userId; profileUserName = name; }"
            />
          </div>
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          :id="'scoreboard'"
          :label="sectionLabel('scoreboard')"
          :order="dashboardLayout.orderOf('scoreboard')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('scoreboard')"
          :disable-down="sectionIsLast('scoreboard')"
          @move-up="moveSectionUp('scoreboard')"
          @move-down="moveSectionDown('scoreboard')"
        >
          <div id="section-scoreboard" class="challenge-section">
            <ChallengeScoreboard :challenge-id="challengeId" :season-starts-at="challenge?.starts_at || challenge?.startsAt" :season-ends-at="challenge?.ends_at || challenge?.endsAt" />
          </div>
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          :id="'team-standings'"
          :label="sectionLabel('team-standings')"
          :order="dashboardLayout.orderOf('team-standings')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('team-standings')"
          :disable-down="sectionIsLast('team-standings')"
          @move-up="moveSectionUp('team-standings')"
          @move-down="moveSectionDown('team-standings')"
        >
          <div id="section-team-progress" class="challenge-section">
            <SeasonWeekTeamDistanceTracker
              :challenge-id="challengeId"
              :season-starts-at="challenge?.starts_at || challenge?.startsAt"
              :season-ends-at="challenge?.ends_at || challenge?.endsAt"
              :week-cutoff-time="challengeWeekSchedule.cutoff"
              :week-time-zone="challengeWeekSchedule.tz"
              :challenge-updated-at="challenge?.updated_at || challenge?.updatedAt || null"
              :club-id="challenge?.organization_id || null"
              @week-boundary="onTeamProgressWeekBoundary"
            />
          </div>
        </DashboardSectionWrapper>

        <!-- Season Recognition Standings -->
        <div v-if="challenge?.id" class="challenge-section" style="padding: 0 0 4px;">
          <SeasonRecognitionStandings
            :key="standingsKey"
            :season-id="challenge.id"
            @open-profile="({ userId, name }) => { profileUserId = userId; profileUserName = name; }"
          />
        </div>

        <DashboardSectionWrapper
          :id="'summary'"
          :label="sectionLabel('summary')"
          :order="dashboardLayout.orderOf('summary')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('summary')"
          :disable-down="sectionIsLast('summary')"
          @move-up="moveSectionUp('summary')"
          @move-down="moveSectionDown('summary')"
        >
          <div id="section-summary" class="challenge-section">
              <h2>📈 Weekly leaders + season summary</h2>
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
                  <p class="hint" style="margin-top: 8px;">
                    Weekly team miles and goals are in <a href="#section-weekly-goals">Team Standings</a> above.
                  </p>
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
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          :id="'club-records'"
          :label="sectionLabel('club-records')"
          :order="dashboardLayout.orderOf('club-records')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('club-records')"
          :disable-down="sectionIsLast('club-records')"
          @move-up="moveSectionUp('club-records')"
          @move-down="moveSectionDown('club-records')"
        >
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
        </DashboardSectionWrapper>

        <!-- Race Divisions -->
        <DashboardSectionWrapper
          :id="'race-divisions'"
          :label="sectionLabel('race-divisions')"
          :order="dashboardLayout.orderOf('race-divisions')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('race-divisions')"
          :disable-down="sectionIsLast('race-divisions')"
          @move-up="moveSectionUp('race-divisions')"
          @move-down="moveSectionDown('race-divisions')"
        >
            <div class="challenge-section">
              <div class="rd-section-header">
                <div>
                  <h2>Race Divisions</h2>
                  <p class="section-hint">Races must be tagged as a Race when logging. Only actual race distances qualify.</p>
                </div>
                <div class="rd-header-controls">
                  <div class="race-tabs race-tabs--global">
                    <button class="race-tab-btn" :class="{ active: raceDivisionTab === 'season' }" @click="raceDivisionTab = 'season'">This Season</button>
                    <button class="race-tab-btn" :class="{ active: raceDivisionTab === 'alltime' }" @click="raceDivisionTab = 'alltime'">All-Time</button>
                  </div>
                  <button
                    v-if="raceDivisions.some(d => !d.hasEntries)"
                    class="rd-expand-btn"
                    @click="raceDivisionsShowAll = !raceDivisionsShowAll"
                  >{{ raceDivisionsShowAll ? 'Hide Empty' : 'Show All' }}</button>
                </div>
              </div>

              <div v-if="raceDivisionsLoading" class="loading-inline">Loading race divisions…</div>
              <div v-else-if="!raceDivisions.length" class="race-empty" style="padding:16px 0">No race divisions configured.</div>
              <div v-else class="race-divisions-grid">
                <div
                  v-for="div in raceDivisions.filter(d => raceDivisionsShowAll || d.hasEntries)"
                  :key="div.key"
                  class="race-division-card"
                >
                  <div class="race-division-header">
                    <span class="race-badge">
                      <img v-if="div.iconUrl" :src="div.iconUrl" class="race-division-icon-img" :alt="div.label" />
                      <span v-else>{{ div.emoji }}</span>
                      {{ div.shortLabel }}
                    </span>
                    <div>
                      <h4>{{ div.label }}</h4>
                    </div>
                  </div>
                  <ul class="race-members-list">
                    <template v-if="raceDivisionTab === 'season'">
                      <li v-for="(m, i) in div.season" :key="`${div.key}-s-${m.userId}`">
                        <span class="race-rank">{{ i + 1 }}.</span>
                        <span class="race-member-name">{{ m.name }}</span>
                        <span class="race-member-time">{{ m.bestTimeText }}</span>
                        <span v-if="m.completionCount > 1" class="race-member-count">×{{ m.completionCount }}</span>
                      </li>
                      <li v-if="!div.season.length" class="race-empty">No season races yet.</li>
                    </template>
                    <template v-else>
                      <li v-for="(m, i) in div.allTime" :key="`${div.key}-a-${m.userId}`">
                        <span class="race-rank">{{ i + 1 }}.</span>
                        <span class="race-member-name">{{ m.name }}</span>
                        <span class="race-member-time">{{ m.bestTimeText }}</span>
                        <span v-if="m.completionCount > 1" class="race-member-count">×{{ m.completionCount }}</span>
                      </li>
                      <li v-if="!div.allTime.length" class="race-empty">No all-time races yet.</li>
                    </template>
                  </ul>
                </div>
              </div>

              <!-- When all have entries, offer the expand anyway -->
              <div v-if="!raceDivisionsLoading && raceDivisions.length && raceDivisions.every(d => d.hasEntries)" style="margin-top:8px;">
                <button class="rd-expand-btn" @click="raceDivisionsShowAll = !raceDivisionsShowAll">
                  {{ raceDivisionsShowAll ? 'Collapse' : 'Expand All Divisions' }}
                </button>
              </div>
            </div>
        </DashboardSectionWrapper>

        <!-- My Trophy Case -->
        <DashboardSectionWrapper
          v-if="myTrophyCase && (myTrophyCase.raceClubs?.length || myTrophyCase.recordsHeld?.length || myTrophyCase.personalRecords?.length)"
          :id="'my-trophy-case'"
          :label="sectionLabel('my-trophy-case')"
          :order="dashboardLayout.orderOf('my-trophy-case')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('my-trophy-case')"
          :disable-down="sectionIsLast('my-trophy-case')"
          @move-up="moveSectionUp('my-trophy-case')"
          @move-down="moveSectionDown('my-trophy-case')"
        >
          <div class="challenge-section my-trophy-section">
            <h2>🏆 My Trophy Case</h2>

            <!-- Race Club Badges -->
            <div v-if="myTrophyCase.raceClubs?.length" class="my-trophy-badges">
              <div
                v-for="rc in myTrophyCase.raceClubs"
                :key="rc.id"
                class="my-trophy-badge"
              >
                <img
                  v-if="rc.earnedTier?.iconUrl"
                  :src="rc.earnedTier.iconUrl"
                  class="my-trophy-badge-icon"
                  alt=""
                />
                <span v-else class="my-trophy-badge-emoji">🏅</span>
                <div class="my-trophy-badge-body">
                  <span class="my-trophy-badge-label">{{ rc.earnedTier?.label || rc.label }}</span>
                  <span class="my-trophy-badge-count">{{ rc.count }}× completed</span>
                  <span v-if="rc.nextTier" class="my-trophy-badge-next">
                    {{ rc.nextTier.count - rc.count }} more for
                    <img v-if="rc.nextTier.iconUrl" :src="rc.nextTier.iconUrl" class="my-trophy-next-icon" alt="" />
                    {{ rc.nextTier.label || `${rc.nextTier.count}× tier` }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Personal Records -->
            <div v-if="myTrophyCase.personalRecords?.length" class="my-trophy-records">
              <div class="my-trophy-records-title">Personal Records</div>
              <div
                v-for="r in myTrophyCase.personalRecords"
                :key="r.id"
                class="my-trophy-record-row"
                :class="{ 'my-trophy-record-row--cr': r.isClubRecord }"
              >
                <div class="my-trophy-record-icon-wrap">
                  <img v-if="r.iconUrl" :src="r.iconUrl" class="my-trophy-record-icon" alt="" />
                  <span v-else class="my-trophy-record-icon-ph">⭐</span>
                </div>
                <span class="my-trophy-record-label">
                  {{ r.label }}
                  <span v-if="r.isClubRecord" class="my-trophy-cr-badge" title="You also hold the club record!">📋 CR</span>
                </span>
                <span class="my-trophy-record-value">
                  {{ formatPrValue(r) }}
                  <span v-if="r.unit && r.metricKey !== 'race_chip_time_seconds'" class="my-trophy-record-unit">{{ r.unit }}</span>
                </span>
                <span v-if="r.context" class="my-trophy-record-year">{{ r.context }}</span>
              </div>
            </div>

            <!-- Club Records Held -->
            <div v-if="myTrophyCase.recordsHeld?.filter(r => !myTrophyCase.personalRecords?.some(pr => pr.id === r.id)).length" class="my-trophy-records" style="margin-top:12px;">
              <div class="my-trophy-records-title">Club Records You Hold</div>
              <div
                v-for="r in myTrophyCase.recordsHeld.filter(r => !myTrophyCase.personalRecords?.some(pr => pr.id === r.id))"
                :key="r.id"
                class="my-trophy-record-row"
              >
                <div class="my-trophy-record-icon-wrap">
                  <img v-if="r.iconUrl" :src="r.iconUrl" class="my-trophy-record-icon" alt="" />
                  <span v-else class="my-trophy-record-icon-ph">📋</span>
                </div>
                <span class="my-trophy-record-label">{{ r.label }}</span>
                <span class="my-trophy-record-value">
                  {{ r.value != null ? r.value : '—' }}
                  <span v-if="r.unit" class="my-trophy-record-unit">{{ r.unit }}</span>
                </span>
                <span v-if="r.holderYear" class="my-trophy-record-year">{{ r.holderYear }}</span>
              </div>
            </div>
          </div>
        </DashboardSectionWrapper>

        <!-- Kudos Stats Section -->
        <DashboardSectionWrapper
          v-if="kudosStats || kudosStatsLoading"
          :id="'kudos-stats'"
          :label="sectionLabel('kudos-stats')"
          :order="dashboardLayout.orderOf('kudos-stats')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('kudos-stats')"
          :disable-down="sectionIsLast('kudos-stats')"
          @move-up="moveSectionUp('kudos-stats')"
          @move-down="moveSectionDown('kudos-stats')"
        >
            <div class="challenge-section kudos-stats-section">
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
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          :id="'team-list'"
          :label="sectionLabel('team-list')"
          :order="dashboardLayout.orderOf('team-list')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('team-list')"
          :disable-down="sectionIsLast('team-list')"
          @move-up="moveSectionUp('team-list')"
          @move-down="moveSectionDown('team-list')"
        >
          <div class="challenge-section">
            <ChallengeTeamList
              :teams="teams"
              :loading="teamsLoading"
              :challenge-id="challengeId"
              :organization-slug="organizationSlug"
              :club-id="challenge?.organization_id || null"
            />
          </div>
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          :id="'elimination'"
          :label="sectionLabel('elimination')"
          :order="dashboardLayout.orderOf('elimination')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('elimination')"
          :disable-down="sectionIsLast('elimination')"
          @move-up="moveSectionUp('elimination')"
          @move-down="moveSectionDown('elimination')"
        >
          <div class="challenge-section">
            <ChallengeEliminationBoard :challenge-id="challengeId" :is-manager="isChallengeManager" :season-starts-at="challenge?.starts_at || challenge?.startsAt" />
          </div>
        </DashboardSectionWrapper>

        <DashboardSectionWrapper
          v-if="(isChallengeManager || isTeamCaptain) && !teamsFinalized"
          :id="'draft-report'"
          :label="sectionLabel('draft-report')"
          :order="dashboardLayout.orderOf('draft-report')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('draft-report')"
          :disable-down="sectionIsLast('draft-report')"
          @move-up="moveSectionUp('draft-report')"
          @move-down="moveSectionDown('draft-report')"
        >
          <div class="challenge-section">
            <ChallengeDraftReport :challenge-id="challengeId" :can-edit="isChallengeManager" />
            <div v-if="isChallengeManager" class="finalize-teams-panel">
              <button class="btn btn-primary btn-sm" type="button" :disabled="finalizingTeams" @click="finalizeTeamsForSeason">
                {{ finalizingTeams ? 'Finalizing…' : 'Finalize Teams' }}
              </button>
              <span class="hint">Hides this draft report from the season dashboard for managers and captains.</span>
            </div>
          </div>
        </DashboardSectionWrapper>

        <!-- Treadmillpocalypse banner is contextual; not part of the reorderable layout. -->
        <div v-if="treadmillpocalypseWeek" class="challenge-section treadmillpocalypse-banner dash-fixed-top">
          <div class="treadmillpocalypse-inner">
            <img v-if="treadmillpocalypseIconUrl" :src="treadmillpocalypseIconUrl" class="treadmillpocalypse-icon" alt="" />
            <div class="treadmillpocalypse-text">
              <strong>🚫 Treadmillpocalypse Week</strong>
              <span>Outdoor GPS workouts only — no treadmill allowed this week.</span>
            </div>
          </div>
        </div>

        <DashboardSectionWrapper
          :id="'weekly-challenges'"
          :label="sectionLabel('weekly-challenges')"
          :order="dashboardLayout.orderOf('weekly-challenges')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('weekly-challenges')"
          :disable-down="sectionIsLast('weekly-challenges')"
          @move-up="moveSectionUp('weekly-challenges')"
          @move-down="moveSectionDown('weekly-challenges')"
        >
          <div id="section-weekly-challenges" class="challenge-section">
            <ChallengeWeeklyTasks
              :challenge-id="challengeId"
              :my-user-id="authStore.user?.id"
              :is-captain="isTeamCaptain"
              :is-manager="isChallengeManager"
              :season-starts-at="challenge?.starts_at || challenge?.startsAt"
              :season-ends-at="challenge?.ends_at || challenge?.endsAt"
              @tag-task="openWorkoutTagging"
            />
          </div>
        </DashboardSectionWrapper>

        <!-- Captain Applications — manager view + member apply UI -->
        <DashboardSectionWrapper
          v-if="(!captainApplicationsFinalized && isChallengeManager) || (canParticipateInSeason && captainApplicationOpen && !isTeamCaptain)"
          :id="'captain-applications'"
          :label="sectionLabel('captain-applications')"
          :order="dashboardLayout.orderOf('captain-applications')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('captain-applications')"
          :disable-down="sectionIsLast('captain-applications')"
          @move-up="moveSectionUp('captain-applications')"
          @move-down="moveSectionDown('captain-applications')"
        >
        <section
          class="challenge-section"
        >
          <h2>Captain Applications</h2>

          <!-- ── Member: show own application status or apply form ── -->
          <template v-if="!isChallengeManager">
            <!-- Already applied -->
            <template v-if="myOwnCaptainApp">
              <div class="captain-app-card captain-app-card--mine">
                <div class="captain-app-header">
                  <div class="captain-app-who">
                    <strong>{{ authStore.user?.first_name }} {{ authStore.user?.last_name }}</strong>
                    <span class="captain-app-subtitle">Applied for Captain</span>
                  </div>
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
        </DashboardSectionWrapper>

        <!-- Season Rules — pinned to the bottom by default; users can re-order. -->
        <DashboardSectionWrapper
          :id="'rules'"
          :label="sectionLabel('rules')"
          :order="dashboardLayout.orderOf('rules')"
          :editing="dashboardLayout.editMode.value"
          :disable-up="sectionIsFirst('rules')"
          :disable-down="sectionIsLast('rules')"
          @move-up="moveSectionUp('rules')"
          @move-down="moveSectionDown('rules')"
        >
          <div id="section-rules" class="challenge-section">
            <div class="rules-collapse-head">
              <button class="rules-collapse-toggle" type="button" @click="rulesCollapsed = !rulesCollapsed">
                <span>{{ rulesCollapsed ? 'Show Season Rules' : 'Hide Season Rules' }}</span>
                <span aria-hidden="true">{{ rulesCollapsed ? '+' : '−' }}</span>
              </button>
            </div>
            <ChallengeRules v-if="!rulesCollapsed" :challenge="challenge" />
          </div>
        </DashboardSectionWrapper>

        <!-- Log Workout Modal -->
        <div v-if="showLogWorkoutModal" class="modal-overlay" @click.self="finishLoggingWorkouts">
          <div class="modal-content modal-wide log-workout-modal" @click.stop>
            <div class="log-workout-modal-header">
              <h2>{{ isAddingAnotherWorkout ? 'Log Another Workout' : 'Log Workout' }}</h2>
              <button type="button" class="modal-close-btn" @click="finishLoggingWorkouts">✕</button>
            </div>

            <!-- ── Success prompt: "Add another for today?" ──────────── -->
            <div v-if="workoutSuccessPrompt" class="workout-success-prompt">
              <div class="workout-success-icon">✅</div>
              <h3 class="workout-success-title">Workout logged!</h3>
              <p class="workout-success-sub">You've logged {{ todayWorkoutCount }} workout{{ todayWorkoutCount !== 1 ? 's' : '' }} today. Daily totals are combined on the leaderboard.</p>
              <div class="workout-success-actions">
                <button type="button" class="btn btn-primary" @click="addAnotherWorkout">
                  + Add another workout for today
                </button>
                <button type="button" class="btn btn-ghost" @click="finishLoggingWorkouts">
                  Done
                </button>
              </div>
            </div>

            <form v-else class="workout-form" @submit.prevent="submitWorkout">

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
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:3px;">
                      <input v-model.number="workoutForm.durationHours" type="number" min="0" max="99" placeholder="0" style="width:52px;" />
                      <span style="font-size:0.82em;color:#64748b;">hr</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:3px;">
                      <input v-model.number="workoutForm.durationMinutes" type="number" min="0" max="59" placeholder="0" style="width:52px;" />
                      <span style="font-size:0.82em;color:#64748b;">min</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:3px;">
                      <input v-model.number="workoutForm.durationSeconds" type="number" min="0" max="59" placeholder="0" style="width:52px;" />
                      <span style="font-size:0.82em;color:#64748b;">sec</span>
                    </div>
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
                  <option v-for="t in taggableWeeklyTaskOptions" :key="`weekly-task-option-${t.id}`" :value="t.id">{{ t.name }}</option>
                </select>
                <small class="hint" v-if="selectedTaskProofPolicyLabel">Proof policy: {{ selectedTaskProofPolicyLabel }}</small>
                <!-- Multi-run disclaimer -->
                <div v-if="isAddingAnotherWorkout || todayWorkoutCount > 0" class="multirun-disclaimer">
                  <span class="multirun-disclaimer-icon">ℹ️</span>
                  <span>Each workout is submitted separately. If your weekly challenge was not included in one of your previous runs, you must tag it in this submission.</span>
                </div>
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
                <span v-else-if="STRAVA_COMING_SOON" class="btn btn-secondary btn--coming-soon" title="Strava integration coming soon">Strava <span class="coming-soon-tag">Soon</span></span>
                <button type="button" class="btn btn-ghost" @click="finishLoggingWorkouts">Cancel</button>
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

        <div v-if="showBulkUploadModal && isBerlinChallenge" class="modal-overlay" @click.self="closeBulkUploadModal">
          <div class="modal-content modal-wide bulk-upload-modal">
            <h2>Bulk Upload On Behalf</h2>
            <p class="hint">Upload up to 50 screenshots at once — OCR will auto-fill fields. <span class="bulk-hint-warn">Red fields</span> need your attention before submitting.</p>

            <!-- ① Global date picker -->
            <div class="bulk-batch-date-row">
              <label class="bulk-batch-date-label">
                📅 Workout date (applied to all)
                <input
                  v-model="bulkBatchDate"
                  type="date"
                  class="bulk-batch-date-input"
                  @change="applyBulkBatchDate"
                />
              </label>
              <span class="bulk-batch-date-hint">Changes the date on all items at once. You can still edit each one individually.</span>
            </div>

            <!-- ② File chooser -->
            <label class="bulk-file-btn">
              <input type="file" multiple accept="image/*" :disabled="bulkScanning" @change="onBulkFilesSelected" style="display:none" />
              {{ bulkScanning ? '⏳ Scanning…' : (bulkItems.length ? '+ Add more screenshots' : '📸 Choose screenshots') }}
            </label>
            <div v-if="bulkUploadError" class="error-inline">{{ bulkUploadError }}</div>

            <!-- ③ Item cards in upload order -->
            <div v-if="bulkItems.length" class="bulk-review-list">
              <div
                v-for="(item, cardIdx) in bulkItems"
                :key="item.clientItemId"
                class="bulk-review-card"
                :class="{ 'needs-match': item.needsMemberSelection || !item.userId, 'has-missing': !item.activityType || item.distanceValue == null || (!item.durationMinutes && !item.durationSeconds) }"
              >
                <div class="bulk-review-head">
                  <span class="bulk-card-num">#{{ cardIdx + 1 }}</span>
                  <strong class="bulk-card-name">{{ item.originalName }}</strong>
                  <span class="bulk-ocr-badge" :class="{ 'ocr-low': (item.confidence || 0) < 60 }">{{ item.confidence || 0 }}% OCR</span>
                  <!-- Challenge detected hint -->
                  <span v-if="item.challengeDetected" class="bulk-challenge-hint" title="Screenshot text contains a checkmark and challenge keywords — verify and tag below">
                    ✅ Challenge?
                  </span>
                </div>

                <div class="bulk-review-grid">
                  <!-- Member (required) -->
                  <label class="bulk-field" :class="{ 'bulk-field--missing': !item.userId }">
                    Member <span class="bulk-req">*</span>
                    <select v-model.number="item.userId" required>
                      <option :value="null">— Select member —</option>
                      <option v-for="m in bulkRosterMembers" :key="m.userId" :value="m.userId">{{ m.displayName }}{{ m.teamName ? ` – ${m.teamName}` : '' }}</option>
                    </select>
                  </label>

                  <!-- Activity (required) -->
                  <label class="bulk-field" :class="{ 'bulk-field--missing': !item.activityType }">
                    Activity <span class="bulk-req">*</span>
                    <select v-model="item.activityType">
                      <option value="">— Select —</option>
                      <option v-for="opt in activityTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </label>

                  <!-- Distance (required) -->
                  <label class="bulk-field" :class="{ 'bulk-field--missing': item.distanceValue == null || item.distanceValue === '' }">
                    Distance (mi) <span class="bulk-req">*</span>
                    <input v-model.number="item.distanceValue" type="number" step="0.01" min="0" placeholder="e.g. 8.01" />
                  </label>

                  <!-- Duration (required — at least minutes) -->
                  <label class="bulk-field bulk-field--duration" :class="{ 'bulk-field--missing': (item.durationMinutes == null || item.durationMinutes === '') && (item.durationSeconds == null || item.durationSeconds === '') }">
                    Moving time <span class="bulk-req">*</span>
                    <div class="bulk-duration-row">
                      <input v-model.number="item.durationMinutes" type="number" min="0" placeholder="min" />
                      <span class="bulk-duration-sep">:</span>
                      <input v-model.number="item.durationSeconds" type="number" min="0" max="59" placeholder="sec" style="width:52px" />
                    </div>
                  </label>

                  <!-- Terrain (required — dropdown) -->
                  <label class="bulk-field" :class="{ 'bulk-field--missing': !item.terrain }">
                    Terrain <span class="bulk-req">*</span>
                    <select v-model="item.terrain">
                      <option value="">— Select —</option>
                      <option value="Road">Road</option>
                      <option value="Trail">Trail</option>
                      <option value="Track">Track</option>
                      <option value="Beach">Beach</option>
                      <option value="Treadmill">Treadmill</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>

                  <!-- Elevation gain (optional) -->
                  <label class="bulk-field">
                    Elevation gain (ft)
                    <input
                      :value="item.elevationGainMeters != null ? Math.round(item.elevationGainMeters * 3.28084) : ''"
                      @input="item.elevationGainMeters = $event.target.value !== '' ? Math.round(Number($event.target.value) / 3.28084) : null"
                      type="number"
                      min="0"
                      placeholder="e.g. 170"
                    />
                  </label>

                  <!-- Calories (optional) -->
                  <label class="bulk-field">
                    Calories
                    <input v-model.number="item.caloriesBurned" type="number" min="0" placeholder="Optional" />
                  </label>

                  <!-- Heart rate (optional) -->
                  <label class="bulk-field">
                    Avg HR (bpm)
                    <input v-model.number="item.averageHeartrate" type="number" min="30" max="250" placeholder="Optional" />
                  </label>

                  <!-- Completed datetime (editable per-item) -->
                  <label class="bulk-field">
                    Time of day
                    <input v-model="item.completedAt" type="datetime-local" />
                  </label>

                  <!-- Weekly challenge tag -->
                  <label class="bulk-field bulk-field--wide">
                    Weekly challenge
                    <span v-if="item.challengeDetected && !item.weeklyTaskId" class="bulk-challenge-nudge">↑ Screenshot may include a challenge</span>
                    <select v-model="item.weeklyTaskId">
                      <option :value="null">None</option>
                      <option v-for="t in weeklyTaskOptions" :key="`bulk-task-${t.id}`" :value="t.id">{{ t.name }}</option>
                    </select>
                  </label>

                  <label class="checkbox-label bulk-field--wide"><input v-model="item.isRace" type="checkbox" /> 🏅 This was a race</label>
                  <template v-if="item.isRace">
                    <label class="bulk-field">Race distance (mi) <input v-model.number="item.raceDistanceMiles" type="number" step="0.01" min="0" /></label>
                    <label class="bulk-field">Chip time (sec) <input v-model.number="item.raceChipTimeSeconds" type="number" min="0" /></label>
                    <label class="bulk-field">Overall place <input v-model.number="item.raceOverallPlace" type="number" min="0" /></label>
                  </template>
                </div>

                <p v-if="item.needsMemberSelection || !item.userId" class="bulk-match-warning">⚠️ Member not auto-detected — select one above.</p>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="closeBulkUploadModal">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="bulkSubmitting || !bulkItems.length || bulkItems.some((i) => !i.userId || !i.activityType || i.distanceValue == null || (!i.durationMinutes && !i.durationSeconds) || !i.terrain)"
                @click="submitBulkWorkouts"
              >
                {{ bulkSubmitting ? 'Submitting…' : `Submit ${bulkItems.length} Workout${bulkItems.length !== 1 ? 's' : ''}` }}
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
        <p class="hint">
          Banner / splash also post to your team Messages thread so people can reply.
          Choose <strong>Message (thread only)</strong> to skip the banner entirely.
        </p>
        <div v-if="teamMsgError" class="error-inline">{{ teamMsgError }}</div>
        <div class="form-row">
          <label>Type</label>
          <select v-model="teamMsgDraft.displayType" class="form-control">
            <option value="announcement">Banner (scrolling line)</option>
            <option value="splash">Splash (pop-up)</option>
            <option value="message">Message (thread only)</option>
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
        <div v-if="teamMsgDraft.displayType !== 'message'" class="form-row form-row--2">
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

    <MemberProfileModal
      :club-id="challenge?.organization_id || null"
      :user-id="profileUserId"
      :member-name="profileUserName"
      @close="profileUserId = null"
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
import { useSeasonWeeks } from '../composables/useSeasonWeeks.js';
import { useSuperadminPlatformPreview } from '../composables/useSuperadminPlatformPreview.js';
import { challengeProofPolicyLabel } from '../utils/challengeProofPolicies.js';
import { toUploadsUrl } from '../utils/uploadsUrl.js';
import { getWeekDeadline, getTodayDeadline, timeUntil, formatInTimezone, countdownUrgency } from '../utils/timezones.js';
import PlatformPreviewBanner from '../components/admin/PlatformPreviewBanner.vue';
import ChallengeRules from '../components/challenge/ChallengeRules.vue';
import ChallengeTeamList from '../components/challenge/ChallengeTeamList.vue';
import ChallengeLeaderboard from '../components/challenge/ChallengeLeaderboard.vue';
import ChallengeScoreboard from '../components/challenge/ChallengeScoreboard.vue';
import ChallengeEliminationBoard from '../components/challenge/ChallengeEliminationBoard.vue';
import ChallengeWeeklyTasks from '../components/challenge/ChallengeWeeklyTasks.vue';
import ChallengeActivityFeed from '../components/challenge/ChallengeActivityFeed.vue';
import SeasonWeekTeamDistanceTracker from '../components/challenge/SeasonWeekTeamDistanceTracker.vue';
import ChallengeMessageFeed from '../components/challenge/ChallengeMessageFeed.vue';
import ChallengeDraftReport from '../components/challenge/ChallengeDraftReport.vue';
import ChallengeParticipationAgreementModal from '../components/challenge/ChallengeParticipationAgreementModal.vue';
import DashboardSectionWrapper from '../components/dashboard/DashboardSectionWrapper.vue';
import RecognitionWeekPrompt from '../components/sstc/RecognitionWeekPrompt.vue';
import SeasonRecognitionStandings from '../components/sstc/SeasonRecognitionStandings.vue';
import SeasonRecognitionSplash from '../components/sstc/SeasonRecognitionSplash.vue';
import MemberProfileModal from '../components/shared/MemberProfileModal.vue';
import { useDashboardLayout } from '../composables/useDashboardLayout';

const REORDERABLE_SECTIONS = [
  { id: 'activity', label: 'Recent Activity' },
  { id: 'chat', label: 'Season Chat' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'scoreboard', label: 'Scoreboard' },
  { id: 'team-standings', label: 'Team Standings' },
  { id: 'summary', label: 'Weekly Leaders & Summary' },
  { id: 'club-records', label: 'Club Records' },
  { id: 'race-divisions', label: 'Race Divisions' },
  { id: 'kudos-stats', label: 'Kudos This Week' },
  { id: 'team-list', label: 'Team Roster' },
  { id: 'elimination', label: 'Elimination Board' },
  { id: 'draft-report', label: 'Draft Report' },
  { id: 'weekly-challenges', label: 'Weekly Challenges' },
  { id: 'captain-applications', label: 'Captain Applications' },
  { id: 'rules', label: 'Season Rules' },
];
const REORDERABLE_DEFAULT_ORDER = REORDERABLE_SECTIONS.map((s) => s.id);
const REORDERABLE_LABEL_BY_ID = Object.fromEntries(REORDERABLE_SECTIONS.map((s) => [s.id, s.label]));

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const { isSuperadminPreview, appendPreviewQueryToRoute } = useSuperadminPlatformPreview({ route, authStore });

const dashboardLayout = useDashboardLayout({
  kind: 'season',
  userId: computed(() => authStore.user?.id ?? null),
  defaultOrder: REORDERABLE_DEFAULT_ORDER,
});
const sectionLabel = (id) => REORDERABLE_LABEL_BY_ID[id] || id;
const sectionStyle = (id) => dashboardLayout.orderStyle(id);
const sectionIsFirst = (id) => dashboardLayout.isFirst(id);
const sectionIsLast = (id) => dashboardLayout.isLast(id);
const moveSectionUp = (id) => dashboardLayout.moveUp(id);
const moveSectionDown = (id) => dashboardLayout.moveDown(id);
const toggleLayoutEdit = () => { dashboardLayout.editMode.value = !dashboardLayout.editMode.value; };
const resetLayoutOrder = () => dashboardLayout.resetOrder();
const challenge = ref(null);
const providerMembers = ref([]);
const seasonBannerDismissed = ref(false);
const standingsKey = ref(0); // incremented after manager posts trophies to refresh standings
const profileUserId = ref(null);
const profileUserName = ref('');
const loading = ref(true);
const error = ref(null);
const leaderboard = ref(null);
const leaderboardLoading = ref(false);
const teams = ref([]);
const teamsLoading = ref(false);
const finalizingTeams = ref(false);
const rulesCollapsed = ref(false);
const myTeamFromApi = ref(null); // user's own team loaded from /my/summary
const activity = ref([]);
const activityLoading = ref(false);
const participationAgreementStatus = ref(null);
const participationAcceptanceSubmitting = ref(false);
const participationAcceptanceError = ref('');
const defaultWorkoutForm = () => ({
  activityType: '',
  distanceValue: null,
  durationHours: null,
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
/** How many workouts the member has already logged today in this season. */
const todayWorkoutCount = ref(0);
/** True when the modal is showing the "success + add another?" prompt. */
const workoutSuccessPrompt = ref(false);
/** True when the member chose "Add another" — shows multi-run disclaimer. */
const isAddingAnotherWorkout = ref(false);

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
const showBulkUploadModal = ref(false);
const bulkScanning = ref(false);
const bulkSubmitting = ref(false);
const bulkUploadError = ref('');
const bulkItems = ref([]);
const bulkRosterMembers = ref([]);
/** Global date applied to all bulk items at once (YYYY-MM-DD). */
const bulkBatchDate = ref(new Date().toISOString().slice(0, 10));
const captainApplications = ref([]);
const captainAppsLoading = ref(false);
const draftSessionStatus = ref(null);
const captainAppsError = ref('');
const captainsFinalizeSubmitting = ref(false);
const captainApplyText = ref('');
const captainApplySubmitting = ref(false);
const captainApplyError = ref('');
const weeklyTaskOptions = ref([]);
const currentWeekAssignments = ref([]);
const treadmillpocalypseWeek = ref(null);
const treadmillpocalypseIconUrl = ref(null);
const seasonSummary = ref(null);
const seasonSummaryLoading = ref(false);
/** Synced from Team Weekly Progress so season-summary uses the same week boundaries as the scoreboard. */
const seasonSummaryWeekStart = ref(null);
const recordBoards = ref({ seasonRecords: [], clubAllTimeRecords: [] });
const recordBoardsLoading = ref(false);
const raceDivisions = ref([]);          // array of { key, label, emoji, season[], allTime[], hasEntries }
const raceDivisionsLoading = ref(false);
const raceDivisionTab = ref('season');
const raceDivisionsShowAll = ref(false);

// Kudos stats
const kudosStats = ref(null);
const kudosStatsLoading = ref(false);

const { weekStartDate: activeSeasonWeekStart } = useSeasonWeeks(
  computed(() => challenge.value?.starts_at || challenge.value?.startsAt || null),
  {
    defaultToLatest: false,
    seasonEndsAtRef: computed(() => challenge.value?.ends_at || challenge.value?.endsAt || null)
  }
);

const challengeId = computed(() => route.params.id || route.params.challengeId);
const organizationSlug = computed(() => route.params.organizationSlug || null);
const agencySlugForDraft = computed(() => challenge.value?.organization_slug || null);
const teamsFinalized = computed(() => !!challenge.value?.season_settings_json?.teams?.teamsFinalized);
const rulesCollapsedStorageKey = computed(() => {
  const userPart = authStore.user?.id || 'anon';
  return challengeId.value ? `challenge:${challengeId.value}:rulesCollapsed:${userPart}` : null;
});
const isBerlinChallenge = computed(() => {
  const slug = String(challenge.value?.organization_slug || organizationSlug.value || '').trim().toLowerCase();
  const name = String(challenge.value?.organization_name || '').trim().toLowerCase();
  return slug === 'berlin' || name.includes('berlin');
});

const SSC_HOME_SLUGS = new Set(
  ['sstc', 'sstc', 'summit-stats', String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'sstc').trim().toLowerCase()].filter(Boolean)
);
const backRoute = computed(() => {
  const slug = organizationSlug.value;
  if (slug) {
    if (SSC_HOME_SLUGS.has(String(slug).toLowerCase())) {
      return appendPreviewQueryToRoute(`/${slug}/my_club_dashboard`);
    }
    return appendPreviewQueryToRoute(`/${slug}/dashboard`);
  }
  return appendPreviewQueryToRoute('/dashboard');
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
  const settings = challenge.value?.season_settings_json;
  const category = settings && typeof settings === 'object' ? settings?.event?.category : null;
  if (String(category || 'run_ruck').toLowerCase() !== 'fitness') {
    return [
      { value: 'run', label: 'Run' },
      { value: 'ruck', label: 'Ruck' }
    ];
  }
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

// ── Pre-season state ─────────────────────────────────────────────
const nowTick = ref(Date.now());
let _nowTickInterval = null;

const isPreSeason = computed(() => {
  if (challenge.value?.status !== 'active') return false;
  const startsAt = challenge.value?.starts_at || challenge.value?.startsAt;
  if (!startsAt) return false;
  return nowTick.value < new Date(startsAt).getTime();
});

const seasonStartCountdown = computed(() => {
  const startsAt = challenge.value?.starts_at || challenge.value?.startsAt;
  if (!startsAt || !isPreSeason.value) return null;
  const diff = Math.max(0, new Date(startsAt).getTime() - nowTick.value);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days:    Math.floor(totalSeconds / 86400),
    hours:   Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
});

const preSeasonWeek = computed(() => {
  const activatedAt = challenge.value?.activated_at;
  if (!activatedAt || !isPreSeason.value) return 1;
  const elapsed = Math.max(0, nowTick.value - new Date(activatedAt).getTime());
  return Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1;
});

const preSeasonStats = ref(null);
const preSeasonStatsLoading = ref(false);
let _preSeasonStatsInterval = null;

const loadPreSeasonStats = async () => {
  const id = challengeId.value;
  if (!id || !isPreSeason.value) return;
  preSeasonStatsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/pre-season-stats`, { skipGlobalLoading: true });
    preSeasonStats.value = r.data?.available ? r.data : null;
  } catch {
    // best-effort
  } finally {
    preSeasonStatsLoading.value = false;
  }
};
// ─────────────────────────────────────────────────────────────────

// ── Matchup schedule & standings ──────────────────────────────────────────
const matchupsEnabled = computed(() => {
  const s = challenge.value?.season_settings_json;
  const settings = typeof s === 'string' ? (() => { try { return JSON.parse(s); } catch { return {}; } })() : (s || {});
  return settings?.matchups?.enabled === true;
});

const matchupWeeks = ref([]);
const matchupStandings = ref([]);
const matchupScheduleLoading = ref(false);
const matchupStandingsLoading = ref(false);
const matchupExpandedWeeks = ref(new Set());
// The current week's start date as returned by the backend (authoritative)
const matchupCurrentWeekStart = ref(null);

const resolveUploadUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = toUploadsUrl(path) || '';
  const v = encodeURIComponent(String(path));
  return `${base}${base.includes('?') ? '&' : '?'}v=${v}`;
};

const currentWeekMatchups = computed(() => {
  if (!matchupCurrentWeekStart.value) return [];
  const week = matchupWeeks.value.find((w) => w.date === matchupCurrentWeekStart.value);
  return week?.matchups || [];
});

const loadMatchupSchedule = async () => {
  if (!challengeId.value || !matchupsEnabled.value) return;
  matchupScheduleLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${challengeId.value}/matchup-schedule`);
    const weeks = r.data?.weeks || [];
    matchupWeeks.value = weeks;
    if (r.data?.currentWeekStart) matchupCurrentWeekStart.value = r.data.currentWeekStart;
    // Auto-expand: current week, or most recent resolved week
    const toOpen = matchupCurrentWeekStart.value
      || weeks.filter((w) => w.matchups.some((m) => m.resolvedAt)).at(-1)?.date
      || weeks.at(-1)?.date;
    if (toOpen) matchupExpandedWeeks.value = new Set([toOpen]);
    // Set hero display to current week (or most recent)
    const heroIdx = matchupCurrentWeekStart.value
      ? weeks.findIndex((w) => w.date === matchupCurrentWeekStart.value)
      : weeks.findLastIndex((w) => w.matchups.some((m) => m.resolvedAt));
    selectedDisplayWeekIdx.value = Math.max(0, heroIdx);
  } catch { /* best-effort */ }
  finally { matchupScheduleLoading.value = false; }
};

const loadMatchupStandings = async () => {
  if (!challengeId.value || !matchupsEnabled.value) return;
  matchupStandingsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${challengeId.value}/matchup-standings`);
    matchupStandings.value = r.data?.standings || [];
  } catch { /* best-effort */ }
  finally { matchupStandingsLoading.value = false; }
};

const toggleMatchupWeek = (date) => {
  const s = new Set(matchupExpandedWeeks.value);
  s.has(date) ? s.delete(date) : s.add(date);
  matchupExpandedWeeks.value = s;
};

const selectedDisplayWeekIdx = ref(0);

const displayedWeekMatchups = computed(() =>
  matchupWeeks.value[selectedDisplayWeekIdx.value]?.matchups || []
);

// Per-matchup view model: leader always on left, with display-ready colors
const TEAM_FALLBACK_PALETTE = ['#b45309','#2563eb','#dc2626','#7c3aed','#0891b2','#15803d','#c026d3','#d97706'];
const allTeamIds = computed(() => {
  const ids = [];
  for (const w of matchupWeeks.value) {
    for (const m of w.matchups) {
      if (!ids.includes(m.team1Id)) ids.push(m.team1Id);
      if (!ids.includes(m.team2Id)) ids.push(m.team2Id);
    }
  }
  return ids;
});
const resolveMatchupTeamColor = (teamId, rawColor) => {
  if (rawColor) return rawColor;
  const idx = allTeamIds.value.indexOf(teamId);
  return TEAM_FALLBACK_PALETTE[(idx >= 0 ? idx : 0) % TEAM_FALLBACK_PALETTE.length];
};

const orientedDisplayMatchups = computed(() =>
  displayedWeekMatchups.value.map((m) => {
    const isResolved = !!m.resolvedAt;
    const t1Score = isResolved ? (m.team1Points ?? 0) : (m.team1LivePoints ?? 0);
    const t2Score = isResolved ? (m.team2Points ?? 0) : (m.team2LivePoints ?? 0);
    // Winner (or current leader) goes on the left
    const swapSides = t2Score > t1Score || (isResolved && m.winnerTeamId === m.team2Id && m.winnerTeamId !== m.team1Id);
    const left  = swapSides ? { id: m.team2Id, name: m.team2Name, logo: m.team2Logo, color: resolveMatchupTeamColor(m.team2Id, m.team2Color), score: t2Score, isWinner: m.winnerTeamId === m.team2Id } : { id: m.team1Id, name: m.team1Name, logo: m.team1Logo, color: resolveMatchupTeamColor(m.team1Id, m.team1Color), score: t1Score, isWinner: m.winnerTeamId === m.team1Id };
    const right = swapSides ? { id: m.team1Id, name: m.team1Name, logo: m.team1Logo, color: resolveMatchupTeamColor(m.team1Id, m.team1Color), score: t1Score, isWinner: m.winnerTeamId === m.team1Id } : { id: m.team2Id, name: m.team2Name, logo: m.team2Logo, color: resolveMatchupTeamColor(m.team2Id, m.team2Color), score: t2Score, isWinner: m.winnerTeamId === m.team2Id };
    const isLeading = !isResolved && left.score > right.score;
    const tied = isResolved && m.isTie;
    return { ...m, left, right, isLeading, tied, isResolved, isCurrentWeek: selectedDisplayWeekDate.value === matchupCurrentWeekStart.value };
  })
);

const selectedDisplayWeekDate = computed(() =>
  matchupWeeks.value[selectedDisplayWeekIdx.value]?.date || null
);

const navigateWeek = (dir) => {
  const next = selectedDisplayWeekIdx.value + dir;
  if (next >= 0 && next < matchupWeeks.value.length) selectedDisplayWeekIdx.value = next;
};

const displayedWeekStatusLabel = computed(() => {
  const week = matchupWeeks.value[selectedDisplayWeekIdx.value];
  if (!week) return '';
  if (week.matchups.every((m) => m.resolvedAt)) return 'FINAL';
  if (week.date === matchupCurrentWeekStart.value) return 'IN PROGRESS';
  return 'UPCOMING';
});

const displayedWeekStatusClass = computed(() => {
  const lbl = displayedWeekStatusLabel.value;
  if (lbl === 'FINAL') return 'mu-pill--final';
  if (lbl === 'IN PROGRESS') return 'mu-pill--live';
  return 'mu-pill--upcoming';
});
// ─────────────────────────────────────────────────────────────────────────────

const isChallengeManager = computed(() => {
  // Server-side authoritative flag — covers club_manager, assistant_manager, admin, staff
  if (challenge.value?.can_manage === true) return true;
  // Fallback for known privileged global roles (in case can_manage hasn't loaded yet)
  const role = String(authStore.user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus', 'club_manager', 'assistant_manager'].includes(role)) return true;
  return false;
});

const isTeamCaptain = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  return (teams.value || []).some((t) => Number(t.team_manager_user_id) === myId);
});

const captainApplicationOpen = computed(() =>
  !!(challenge.value?.captain_application_open ?? challenge.value?.captainApplicationOpen)
  && !(challenge.value?.captains_finalized ?? challenge.value?.captainsFinalized)
);

const captainApplicationsFinalized = computed(() =>
  !!(challenge.value?.captains_finalized ?? challenge.value?.captainsFinalized)
);

// For non-managers the backend only returns their own record (or empty).
const myOwnCaptainApp = computed(() => {
  if (isChallengeManager.value) return null;
  return captainApplications.value[0] ?? null;
});

const myTeamId = computed(() => {
  // Prefer the server-resolved team (reliable for non-captains too)
  const apiTeamId = myTeamFromApi.value?.team_id ?? myTeamFromApi.value?.teamId;
  if (apiTeamId) return Number(apiTeamId);
  const myId = Number(authStore.user?.id || 0);
  const myTeam = (teams.value || []).find((t) =>
    (t.members || []).some((m) => Number(m.provider_user_id || m.user_id) === myId)
    || Number(t.team_manager_user_id) === myId
  );
  return myTeam?.id || null;
});

const myTeamName = computed(() => {
  const apiTeamName = myTeamFromApi.value?.team_name ?? myTeamFromApi.value?.teamName;
  if (apiTeamName) return apiTeamName;
  const tid = myTeamId.value;
  if (!tid) return null;
  const t = (teams.value || []).find((x) => Number(x.id) === Number(tid));
  return t?.team_name || null;
});

const myTeamMateUserIds = computed(() => {
  const tid = myTeamId.value;
  if (!tid) return [];
  const t = (teams.value || []).find((x) => Number(x.id) === Number(tid));
  if (!t) return [];
  const ids = (Array.isArray(t.members) ? t.members : [])
    .map((m) => Number(m.provider_user_id ?? m.user_id))
    .filter((n) => Number.isFinite(n) && n > 0);
  const cap = Number(t.team_manager_user_id);
  if (cap && !ids.includes(cap)) ids.push(cap);
  return ids;
});

const taggableWeeklyTaskOptions = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  return (weeklyTaskOptions.value || []).filter((task) => {
    if (String(task?.mode || '') === 'full_team') return true;
    const assignment = (currentWeekAssignments.value || []).find((row) =>
      Number(row.task_id) === Number(task.id) && Number(row.provider_user_id) === myId
    );
    return !!assignment;
  });
});

const myChatMentionSlugs = computed(() => {
  const u = authStore.user;
  if (!u) return [];
  const fn = String(u.first_name || '').trim();
  const ln = String(u.last_name || '').trim();
  const un = String(u.username || '').replace(/^@/, '').trim();
  const emailHead = String(u.email || '').split('@')[0] || '';
  const compact = `${fn}${ln}`.replace(/\s+/g, '');
  const candidates = [
    fn, ln, un, emailHead, compact,
    `${fn}${ln}`, `${fn}.${ln}`, `${fn}_${ln}`, `${fn}-${ln}`
  ].map((s) => String(s).toLowerCase()).filter((s) => s.length > 1);
  return [...new Set(candidates)];
});

const captainTeamId = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  const t = (teams.value || []).find((x) => Number(x.team_manager_user_id) === myId);
  return t?.id || null;
});

const showTeamMessageModal = ref(false);
const teamMsgSubmitting = ref(false);
const teamMsgError = ref('');
const lastTeamMessageThreadId = ref(null);
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
  if (d.displayType === 'message') return true;
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
      display_type: d.displayType === 'splash' ? 'splash' : (d.displayType === 'message' ? 'message' : 'announcement')
    };
    if (d.displayType !== 'message') {
      payload.starts_at = new Date(d.startsAt);
      payload.ends_at = new Date(d.endsAt);
      const splash = String(d.splashImageUrl || '').trim();
      if (splash) payload.splash_image_url = splash;
    }
    const resp = await api.post(`/summit-stats/clubs/${cid}/seasons/${classId}/teams/${tid}/announcements`, payload, { skipGlobalLoading: true });
    showTeamMessageModal.value = false;
    if (resp?.data?.chat?.thread_id) {
      lastTeamMessageThreadId.value = Number(resp.data.chat.thread_id);
    }
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
  return challengeProofPolicyLabel(t?.proof_policy || 'none');
});

const resolveSeasonAssetUrl = (path, type = 'banner') => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  // Match My Club behavior: load directly from uploads path.
  // Dedicated logo/banner endpoints can get stale in some iOS WebView caches.
  const base = toUploadsUrl(path) || '';
  const version = encodeURIComponent(String(path || challenge.value?.updated_at || Date.now()));
  return `${base}${base.includes('?') ? '&' : '?'}v=${version}`;
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
    seasonSummaryWeekStart.value = null;
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
    // Sync currentAgency to this season's club so navigating to club management
    // from within this season view lands on the correct club (multi-club users).
    const classOrgId = Number(challenge.value?.organization_id || 0);
    if (classOrgId) {
      const curId = Number(agencyStore.currentAgency?.id || 0);
      if (curId !== classOrgId) {
        const userAgencies = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
        const match = userAgencies.find((a) => Number(a?.id) === classOrgId);
        if (match) agencyStore.setCurrentAgency(match);
      }
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
    // Also resolve the user's own team via participation summary (reliable for non-captains)
    try {
      const s = await api.get('/learning-program-classes/my/summary', { skipGlobalLoading: true });
      const myTeams = Array.isArray(s.data?.teams) ? s.data.teams : [];
      const match = myTeams.find((t) => Number(t.challenge_id ?? t.challengeId) === Number(id));
      myTeamFromApi.value = match || null;
    } catch {
      myTeamFromApi.value = null;
    }
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
  const week = activeSeasonWeekStart.value;
  if (!id || !week) return;
  try {
    const r = await api.get(`/learning-program-classes/${id}/weekly-tasks`, {
      params: { week },
      skipGlobalLoading: true
    });
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

const loadCurrentWeekAssignments = async () => {
  const id = challengeId.value;
  const week = activeSeasonWeekStart.value;
  if (!id || !week) return;
  try {
    const r = await api.get(`/learning-program-classes/${id}/weekly-assignments`, {
      params: { week },
      skipGlobalLoading: true
    });
    currentWeekAssignments.value = Array.isArray(r.data?.assignments) ? r.data.assignments : [];
  } catch {
    currentWeekAssignments.value = [];
  }
};

const loadSeasonSummary = async () => {
  const id = challengeId.value;
  if (!id) return;
  seasonSummaryLoading.value = true;
  try {
    const params = {};
    const w = seasonSummaryWeekStart.value;
    if (w) params.weekStart = String(w).slice(0, 10);
    const r = await api.get(`/learning-program-classes/${id}/season-summary`, { params, skipGlobalLoading: true });
    seasonSummary.value = r.data || null;
  } catch {
    seasonSummary.value = null;
  } finally {
    seasonSummaryLoading.value = false;
  }
};

const challengeWeekSchedule = computed(() => {
  const s = challenge.value?.season_settings_json?.schedule || {};
  return {
    cutoff: String(s.weekEndsSundayAt || challenge.value?.week_start_time || '00:00'),
    tz: String(s.weekTimeZone || 'UTC')
  };
});

const onTeamProgressWeekBoundary = (ymd) => {
  const y = String(ymd || '').slice(0, 10);
  if (!y) return;
  if (seasonSummaryWeekStart.value === y) return;
  seasonSummaryWeekStart.value = y;
  loadSeasonSummary();
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

// ── My Trophy Case ────────────────────────────────────────────────────────────
const myTrophyCase = ref(null);

const formatPrValue = (r) => {
  if (r.metricKey === 'race_chip_time_seconds' && r.value != null) {
    const s = Math.round(Number(r.value));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }
  return r.value != null ? r.value : '—';
};

const loadMyTrophyCase = async () => {
  const clubId = Number(challenge.value?.organization_id || 0);
  if (!clubId) return;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId}/my-trophy-case`, { skipGlobalLoading: true });
    myTrophyCase.value = data || null;
  } catch {
    myTrophyCase.value = null;
  }
};

const loadRaceDivisions = async () => {
  const id = challengeId.value;
  if (!id) return;
  raceDivisionsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/race-divisions`, { skipGlobalLoading: true });
    raceDivisions.value = Array.isArray(r.data?.divisions) ? r.data.divisions : [];
    raceDivisionsShowAll.value = false;
  } catch {
    raceDivisions.value = [];
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

const finalizeTeamsForSeason = async () => {
  const id = challengeId.value;
  if (!id || !challenge.value) return;
  finalizingTeams.value = true;
  try {
    const currentSettings = challenge.value.season_settings_json && typeof challenge.value.season_settings_json === 'object'
      ? challenge.value.season_settings_json
      : {};
    const nextSettings = {
      ...currentSettings,
      teams: {
        ...(currentSettings.teams || {}),
        teamsFinalized: true,
        teamsFinalizedAt: new Date().toISOString()
      }
    };
    await api.put(`/learning-program-classes/${id}`, { seasonSettingsJson: nextSettings }, { skipGlobalLoading: true });
    await loadChallenge();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to finalize teams');
  } finally {
    finalizingTeams.value = false;
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
      durationMinutes: ((Number(workoutForm.value.durationHours) || 0) * 60 + (Number(workoutForm.value.durationMinutes) || 0)) || null,
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
    todayWorkoutCount.value += 1;
    // Show "add another?" prompt instead of closing immediately
    workoutSuccessPrompt.value = true;
    await Promise.all([loadLeaderboard(), loadActivity(), loadCurrentWeekAssignments(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats(), loadMyTrophyCase()]);
  } catch (e) {
    if (Number(e?.response?.status || 0) === 428) {
      await loadChallenge();
    }
    workoutError.value = e?.response?.data?.error?.message || 'Failed to submit workout';
  } finally {
    workoutSubmitting.value = false;
  }
};

/** User confirmed "Done" after the success prompt — close the modal. */
const finishLoggingWorkouts = () => {
  workoutSuccessPrompt.value = false;
  isAddingAnotherWorkout.value = false;
  showLogWorkoutModal.value = false;
};

/** User chose "Add another workout for today" — reset form but keep context. */
const addAnotherWorkout = () => {
  workoutSuccessPrompt.value = false;
  isAddingAnotherWorkout.value = true;
  workoutForm.value = defaultWorkoutForm();
  visionExtracted.value = false;
  visionError.value = null;
};

/** Open the log workout modal and reset multi-run state. */
const openLogWorkoutModal = () => {
  workoutForm.value = defaultWorkoutForm();
  workoutError.value = '';
  workoutSuccessPrompt.value = false;
  isAddingAnotherWorkout.value = false;
  // Count today's existing workouts logged by this user so we know if it's a multi-run day
  const today = new Date().toDateString();
  const myId = authStore.user?.id;
  todayWorkoutCount.value = (activity.value || []).filter((a) => {
    if (myId && a.user_id && Number(a.user_id) !== Number(myId)) return false;
    try { return new Date(a.completed_at).toDateString() === today; } catch { return false; }
  }).length;
  showLogWorkoutModal.value = true;
};

const loadBulkRosterMembers = async () => {
  const id = challengeId.value;
  if (!id || !isChallengeManager.value) return;
  try {
    const { data } = await api.get(`/learning-program-classes/${id}/roster`, { skipGlobalLoading: true });
    bulkRosterMembers.value = Array.isArray(data?.members) ? data.members : [];
  } catch {
    bulkRosterMembers.value = [];
  }
};

const openBulkUploadModal = async () => {
  bulkBatchDate.value = new Date().toISOString().slice(0, 10);
  bulkItems.value = [];
  bulkUploadError.value = '';
  showBulkUploadModal.value = true;
  if (!bulkRosterMembers.value.length) await loadBulkRosterMembers();
};

/** Apply the global batch date to all existing bulk items (preserving OCR time). */
const applyBulkBatchDate = () => {
  bulkItems.value = bulkItems.value.map((item) => {
    const existingTime = String(item.completedAt || '').slice(11, 16) || '00:00';
    return { ...item, completedAt: `${bulkBatchDate.value}T${existingTime}` };
  });
};

const closeBulkUploadModal = () => {
  showBulkUploadModal.value = false;
  bulkUploadError.value = '';
};

const currentDatetimeLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const onBulkFilesSelected = async (event) => {
  const id = challengeId.value;
  const files = Array.from(event.target?.files || []).slice(0, 50);
  if (!id || !files.length) return;
  bulkScanning.value = true;
  bulkUploadError.value = '';
  try {
    const fd = new FormData();
    files.forEach((file) => fd.append('files', file));
    const { data } = await api.post(`/learning-program-classes/${id}/workouts/bulk-scan`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    bulkRosterMembers.value = Array.isArray(data?.members) ? data.members : bulkRosterMembers.value;
    // Preserve upload order by using the index from the response array
    const newItems = (Array.isArray(data?.items) ? data.items : []).map((item, idx) => {
      const ex = item.extracted || {};
      const rawText = String(item.rawText || '');
      const hint = String(ex.activityTypeHint || '').toLowerCase();
      const activityType = ({ running: 'run', run: 'run', ruck: 'ruck', walking: 'walk', walk: 'walk', cycling: 'cycling', bike: 'cycling', steps: 'steps' }[hint]) || hint || '';
      // Challenge detected: look for checkmark emoji followed by challenge keywords in the caption/rawText
      const challengeDetected = /[✅✓☑]/.test(rawText) && /(?:run|mile|challenge|min|ruck|walk)/i.test(rawText);
      // Use global batch date + time from OCR (or midnight if only date was set)
      const ocrTime = ex.completedAt ? String(ex.completedAt).slice(11, 16) : '00:00';
      const completedAt = `${bulkBatchDate.value}T${ocrTime}`;
      return {
        ...item,
        _uploadIdx: idx,   // preserve order
        userId: item.matchedUserId || null,
        activityType,
        distanceValue: ex.distanceMiles ?? null,
        durationMinutes: ex.durationMinutes ?? null,
        durationSeconds: ex.durationSeconds ?? null,
        caloriesBurned: ex.caloriesBurned ?? null,
        averageHeartrate: ex.averageHeartrate ?? null,
        elevationGainMeters: ex.elevationGainMeters ?? null,
        terrain: ex.terrain || '',
        completedAt,
        weeklyTaskId: null,
        challengeDetected,
        isRace: false,
        raceDistanceMiles: null,
        raceChipTimeSeconds: null,
        raceOverallPlace: null,
        ocrConfidence: item.confidence || 0
      };
    });
    // Append to existing items (if manager uploads more files) — sorted by upload index
    bulkItems.value = [...bulkItems.value, ...newItems].sort((a, b) => a._uploadIdx - b._uploadIdx);
  } catch (e) {
    bulkUploadError.value = e?.response?.data?.error?.message || 'Bulk scan failed';
  } finally {
    bulkScanning.value = false;
    if (event.target) event.target.value = '';
  }
};

const submitBulkWorkouts = async () => {
  const id = challengeId.value;
  if (!id || !bulkItems.value.length) return;
  bulkSubmitting.value = true;
  bulkUploadError.value = '';
  try {
    const payload = {
      items: bulkItems.value.map((item) => ({
        clientItemId: item.clientItemId,
        userId: item.userId,
        filePath: item.filePath,
        extracted: item.extracted || null,
        rawText: item.rawText || null,
        ocrConfidence: item.ocrConfidence ?? item.confidence ?? null,
        activityType: item.activityType,
        distanceValue: item.distanceValue,
        durationMinutes: item.durationMinutes,
        durationSeconds: item.durationSeconds,
        caloriesBurned: item.caloriesBurned,
        averageHeartrate: item.averageHeartrate,
        elevationGainMeters: item.elevationGainMeters || null,
        terrain: item.terrain || null,
        completedAt: item.completedAt,
        weeklyTaskId: item.weeklyTaskId || null,
        isRace: item.isRace === true,
        raceDistanceMiles: item.raceDistanceMiles || null,
        raceChipTimeSeconds: item.raceChipTimeSeconds || null,
        raceOverallPlace: item.raceOverallPlace || null
      }))
    };
    const { data } = await api.post(`/learning-program-classes/${id}/workouts/bulk-on-behalf`, payload);
    if (data?.errors?.length) {
      bulkUploadError.value = `${data.created?.length || 0} created, ${data.errors.length} need fixes. ${data.errors[0]?.message || ''}`;
      bulkItems.value = bulkItems.value.filter((item) => data.errors.some((err) => err.clientItemId === item.clientItemId));
    } else {
      bulkItems.value = [];
      showBulkUploadModal.value = false;
    }
    await Promise.all([loadLeaderboard(), loadActivity(), loadCurrentWeekAssignments(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats(), loadMyTrophyCase()]);
  } catch (e) {
    bulkUploadError.value = e?.response?.data?.error?.message || 'Bulk submit failed';
  } finally {
    bulkSubmitting.value = false;
  }
};

const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const refreshAfterActivityAction = async () => {
  await Promise.all([loadActivity(), loadLeaderboard(), loadCurrentWeekAssignments(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats(), loadMyTrophyCase()]);
};

const openWorkoutTagging = (task) => {
  if (!task?.id) return;
  workoutForm.value.weeklyTaskId = Number(task.id);
  showLogWorkoutModal.value = true;
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

// Parse a YYYY-MM-DD date string as UTC noon to avoid timezone-offset day shifts,
// then format it for display (e.g. "Sun Apr 26").
const fmtWeekDate = (ymd) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const stravaActivityUrl = (activityId) => {
  const id = Number(activityId || 0);
  if (!id) return 'https://www.strava.com';
  return `https://www.strava.com/activities/${id}`;
};

// Strava API approval is pending — hide import for all users until approved.
const STRAVA_COMING_SOON = true;

const stravaImportAvailable = computed(
  () => !STRAVA_COMING_SOON && !!(stravaStatus.value?.connected && stravaStatus.value?.stravaRolloutEnabled !== false)
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
    await Promise.all([loadLeaderboard(), loadActivity(), loadCurrentWeekAssignments(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions(), loadKudosStats(), loadMyTrophyCase()]);
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
  if (rulesCollapsedStorageKey.value) {
    rulesCollapsed.value = localStorage.getItem(rulesCollapsedStorageKey.value) === '1';
  }
  await loadChallenge();
  if (challenge.value) {
    await Promise.all([
      loadLeaderboard(),
      loadTeams(),
      loadActivity(),
      loadCaptainApplications(),
      loadDraftSessionStatus(),
      loadWeeklyTaskOptions(),
      loadCurrentWeekAssignments(),
      loadSeasonSummary(),
      loadRecordBoards(),
      loadRaceDivisions(),
      loadKudosStats(),
      loadStravaStatus(),
      loadBulkRosterMembers()
    ]);
  }
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 30000); // refresh every 30 s

  // Pre-season: start 1-second tick and load standings
  _nowTickInterval = setInterval(() => { nowTick.value = Date.now(); }, 1000);
  if (isPreSeason.value) {
    await loadPreSeasonStats();
    _preSeasonStatsInterval = setInterval(loadPreSeasonStats, 60000);
  }

  // Matchups
  if (matchupsEnabled.value) {
    await Promise.all([loadMatchupSchedule(), loadMatchupStandings()]);
  }
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
  if (_nowTickInterval) clearInterval(_nowTickInterval);
  if (_preSeasonStatsInterval) clearInterval(_preSeasonStatsInterval);
  // Restore the URL-based route slug so the branding reverts to the host org after leaving.
  const urlSlug = String(route.params.organizationSlug || '').trim().toLowerCase();
  if (urlSlug) brandingStore.setActiveRouteSlug(urlSlug);
});

watch(challengeId, () => {
  if (rulesCollapsedStorageKey.value) {
    rulesCollapsed.value = localStorage.getItem(rulesCollapsedStorageKey.value) === '1';
  }
  loadChallenge().then(() => {
    if (challenge.value) {
      Promise.all([loadLeaderboard(), loadTeams(), loadActivity(), loadCaptainApplications(), loadWeeklyTaskOptions(), loadCurrentWeekAssignments(), loadSeasonSummary(), loadRecordBoards(), loadRaceDivisions()]);
    }
  });
});

watch(rulesCollapsed, (collapsed) => {
  if (!rulesCollapsedStorageKey.value) return;
  localStorage.setItem(rulesCollapsedStorageKey.value, collapsed ? '1' : '0');
});

watch(activeSeasonWeekStart, (week) => {
  if (!week || !challengeId.value || !challenge.value) return;
  Promise.all([loadWeeklyTaskOptions(), loadCurrentWeekAssignments()]);
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
  box-sizing: border-box;
  width: 100%;
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
.season-announcement-text { flex: 1; min-width: 0; word-break: break-word; }
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
.my-team-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  margin-bottom: 2px;
  padding: 8px 18px;
  background: linear-gradient(135deg, #ff6b35 0%, #ff8c5e 100%);
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  border-radius: 20px;
  text-decoration: none;
  box-shadow: 0 2px 8px rgba(255,107,53,0.25);
  transition: opacity 0.15s, box-shadow 0.15s;
}
.my-team-btn:hover {
  opacity: 0.9;
  box-shadow: 0 4px 14px rgba(255,107,53,0.4);
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
.dash-section-nav-spacer {
  flex: 1 1 auto;
  min-width: 0;
}
.dash-nav-pill--customize {
  border-color: #fb923c;
  color: #9a3412;
  background: #fff7ed;
}
.dash-nav-pill--customize:hover {
  background: #fb923c;
  color: #fff;
  border-color: #fb923c;
}
.dash-nav-pill--customize-on {
  background: #fb923c;
  color: #fff;
  border-color: #fb923c;
}
.dash-nav-pill--reset {
  border-color: #cbd5e1;
  color: #475569;
}
.dash-nav-pill--reset:hover {
  background: #475569;
  color: #fff;
  border-color: #475569;
}
.dash-layout-help {
  margin: -8px 0 12px;
  padding: 10px 14px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  border-radius: 10px;
  font-size: 0.88rem;
}
.dash-fixed-top {
  /* Sits above all reorderable cards regardless of saved order. */
  order: -1;
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
.season-action-btn--coming-soon {
  background: #f1f5f9;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
  cursor: default;
  opacity: 0.85;
}
.btn--coming-soon {
  opacity: 0.75;
  cursor: default;
  pointer-events: none;
}
.coming-soon-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 5px;
  vertical-align: middle;
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

/* ── Pre-Season Countdown Banner ─────────────────────────────── */
.preseason-countdown-banner {
  background: linear-gradient(135deg, #1a2e1a 0%, #243824 100%);
  color: #fff;
  text-align: center;
  padding: 28px 20px 20px;
  border-radius: 10px;
  margin: 0 0 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}
.preseason-countdown-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.65);
  margin-bottom: 14px;
}
.preseason-countdown-units {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
}
.preseason-countdown-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 64px;
}
.preseason-countdown-num {
  font-size: 52px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}
.preseason-countdown-sub {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.55);
  margin-top: 4px;
}
.preseason-countdown-sep {
  font-size: 42px;
  font-weight: 300;
  color: rgba(255,255,255,0.35);
  line-height: 1.1;
  padding-bottom: 18px;
  user-select: none;
}
.preseason-countdown-meta {
  margin-top: 14px;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.04em;
}
@media (max-width: 480px) {
  .preseason-countdown-num { font-size: 36px; }
  .preseason-countdown-unit { min-width: 48px; }
  .preseason-countdown-sep { font-size: 30px; padding-bottom: 12px; }
}

/* ── Pre-Season Standings Card ──────────────────────────────── */
.preseason-standings-card {
  background: #f8faf8;
  border: 1px solid #d1e8d1;
  border-radius: 10px;
  padding: 18px 20px;
  margin: 0 0 16px;
}
.preseason-standings-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
.preseason-standings-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a2e1a;
}
.preseason-standings-week {
  font-size: 12px;
  font-weight: 600;
  color: #4a7a4a;
  background: #e0f0e0;
  border-radius: 20px;
  padding: 2px 8px;
}
.preseason-standings-note {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 14px;
}
.preseason-standings-loading,
.preseason-standings-empty {
  font-size: 13px;
  color: #6b7280;
  text-align: center;
  padding: 12px 0;
}
.preseason-standings-section {
  margin-bottom: 14px;
}
.preseason-standings-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #4a7a4a;
  margin-bottom: 6px;
}
.preseason-standings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preseason-standings-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 5px 8px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e5f0e5;
}
.preseason-standings-rank {
  font-weight: 700;
  color: #4a7a4a;
  min-width: 22px;
}
.preseason-standings-name {
  flex: 1;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preseason-standings-team {
  font-weight: 400;
  color: #6b7280;
  font-size: 12px;
}
.preseason-standings-stat {
  font-weight: 600;
  white-space: nowrap;
  min-width: 52px;
  text-align: right;
  color: #1a2e1a;
}
.preseason-standings-stat--secondary {
  color: #6b7280;
  font-weight: 500;
  min-width: 38px;
}

/* ═══════════════════════════════════════════════════════════════════
   WEEKLY MATCHUPS — dark sports-board
═══════════════════════════════════════════════════════════════════ */
.matchup-dash-section { margin: 16px 0; }

/* Board shell */
.mu-board {
  background: #0e1621;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  color: #e2e8f0;
}

/* ── Board header ── */
.mu-board-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.mu-board-title {
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
}
.mu-board-subtitle {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.mu-subtitle-dot { opacity: 0.4; }

/* Status pills */
.mu-status-pill,
.mu-wk-pill {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}
.mu-pill--live    { background: #fbbf24; color: #1a0c00; }
.mu-pill--final   { background: #3b82f6; color: #fff; }
.mu-pill--upcoming{ background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.12); }

/* Week navigation */
.mu-week-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.mu-week-select {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
}
.mu-week-select option { background: #1a2638; color: #e2e8f0; }
.mu-nav-btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 1.2rem;
  font-weight: 700;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
  line-height: 1;
}
.mu-nav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
.mu-nav-btn:disabled { opacity: 0.28; cursor: default; }

/* ── Hero matchup cards ── */
.mu-hero-cards { display: flex; flex-direction: column; gap: 3px; }
.mu-loading, .mu-empty { color: rgba(255,255,255,0.35); font-size: 0.9rem; padding: 24px 22px; }
.mu-hero-none { color: rgba(255,255,255,0.35); font-size: 0.88rem; padding: 20px 22px; text-align: center; }

.mu-hero-card {
  display: flex;
  align-items: stretch;
  min-height: 110px;
  position: relative;
}

/* Left team side */
.mu-hero-side {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  padding: 18px 16px 18px 20px;
  min-width: 0;
  transition: background 0.2s;
}
.mu-hero-side--left {
  border-right: 1px solid rgba(255,255,255,0.05);
}
.mu-hero-side--right {
  padding: 18px 20px 18px 16px;
  border-left: 1px solid rgba(255,255,255,0.05);
}

.mu-hero-logo-wrap {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.12);
}
.mu-hero-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
.mu-hero-logo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 900;
  color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.06);
}

.mu-hero-team-label {
  flex: 1;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mu-hero-team-label--left  { text-align: left; }
.mu-hero-team-label--right { text-align: right; }
.mu-hero-score {
  font-weight: 900;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.mu-score--leader { font-size: 2.6rem; text-shadow: 0 0 18px currentColor; }
.mu-score--trail  { font-size: 1.65rem; opacity: 0.9; text-shadow: 0 0 8px currentColor; }

/* VS center */
.mu-hero-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 6px;
  flex-shrink: 0;
  z-index: 1;
  background: #0e1621;
}
.mu-vs-diamond {
  width: 46px;
  height: 46px;
  background: #1a2840;
  border: 1px solid rgba(255,255,255,0.12);
  transform: rotate(45deg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mu-vs-text {
  transform: rotate(-45deg);
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  color: rgba(255,255,255,0.7);
  white-space: nowrap;
}
.mu-live-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #ef4444;
  white-space: nowrap;
}
.mu-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  animation: mu-pulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes mu-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

/* ── Week accordion list ── */
.mu-week-list {
  border-top: 1px solid rgba(255,255,255,0.07);
}
.mu-week-item { border-bottom: 1px solid rgba(255,255,255,0.06); }
.mu-week-item:last-child { border-bottom: none; }
.mu-week-item--current > .mu-week-row {
  background: rgba(251,191,36,0.06);
}

.mu-week-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: #cbd5e1;
  font-size: 0.82rem;
  transition: background 0.12s;
  flex-wrap: wrap;
}
.mu-week-row:hover { background: rgba(255,255,255,0.04); }

.mu-wk-icon { font-size: 0.85rem; opacity: 0.5; flex-shrink: 0; }
.mu-wk-num  { font-weight: 800; font-size: 0.8rem; letter-spacing: 0.05em; color: #fff; flex-shrink: 0; }
.mu-wk-date { font-size: 0.75rem; color: rgba(255,255,255,0.4); flex-shrink: 0; }
.mu-wk-pill { flex-shrink: 0; }

.mu-wk-preview {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
}
.mu-wk-logo { width: 16px; height: 16px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }
.mu-wk-preview-name {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}
.mu-wk-preview-name--right { text-align: right; }
.mu-wk-winner { color: #fbbf24; font-weight: 700; }
.mu-wk-preview-sep { color: rgba(255,255,255,0.2); font-size: 0.7rem; }
.mu-wk-score {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255,255,255,0.45);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.mu-wk-score--leading { color: #fbbf24; }
.mu-wk-vs { font-size: 0.66rem; color: rgba(255,255,255,0.25); letter-spacing: 0.04em; flex-shrink: 0; }
.mu-wk-chevron { font-size: 0.65rem; color: rgba(255,255,255,0.3); margin-left: auto; flex-shrink: 0; }

/* Expanded week body */
.mu-week-body {
  padding: 4px 16px 12px;
  background: rgba(0,0,0,0.2);
}
.mu-body-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-wrap: wrap;
}
.mu-body-row:last-child { border-bottom: none; }
.mu-body-team { display: flex; align-items: center; gap: 6px; flex: 1; font-size: 0.85rem; color: rgba(255,255,255,0.7); }
.mu-body-team--right { justify-content: flex-end; text-align: right; }
.mu-body-winner { color: #fbbf24; font-weight: 700; }
.mu-body-logo { width: 20px; height: 20px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.mu-body-scores {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
}
.mu-body-pts-win { color: #fbbf24; }
.mu-body-vs { font-size: 0.7rem; color: rgba(255,255,255,0.25); font-weight: 400; }
.mu-body-badge {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}
.mu-body-badge--win      { background: #1e3a8a; color: #93c5fd; }
.mu-body-badge--tie      { background: #713f12; color: #fde68a; }
.mu-body-badge--live     { background: #7f1d1d; color: #fca5a5; }
.mu-body-badge--upcoming { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.35); }

/* ── Standings (collapsible) ── */
/* ── Season Standings block ─────────────────────────────────── */
.mu-standings-block {
  border-top: 1px solid rgba(255,255,255,0.07);
  padding: 4px 0 2px;
}
.mu-standings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px 6px;
}
.mu-standings-title {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
}
.mu-standings-cols {
  display: flex;
  gap: 18px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.3);
}
.mu-standings-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  border-left: 3px solid transparent;
}
.mu-standings-row:last-child { border-bottom: none; }
.mu-standings-row--mine { background: rgba(255,255,255,0.03); }
.mu-s-rank { font-size: 0.72rem; color: rgba(255,255,255,0.3); font-weight: 700; width: 14px; flex-shrink: 0; }
.mu-s-team-cell { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; }
.mu-s-name { font-size: 0.83rem; font-weight: 600; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu-s-logo { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; flex-shrink: 0; }
.mu-s-logo--placeholder { display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 800; color: #fff; border-radius: 5px; }
.mu-standings-wlt { display: flex; gap: 18px; font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.mu-standings-w { color: #4ade80; font-weight: 700; width: 12px; text-align: center; }
.mu-standings-l { color: #f87171; font-weight: 700; width: 12px; text-align: center; }
.mu-standings-t { color: rgba(255,255,255,0.35); font-weight: 700; width: 12px; text-align: center; }
/* ─────────────────────────────────────────────────────────────── */

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
.rd-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.rd-header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rd-expand-btn {
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  color: #475569;
  white-space: nowrap;
}
.rd-expand-btn:hover { background: #f1f5f9; }
.race-divisions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.race-division-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.race-division-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border-bottom: 1px solid #e2e8f0;
}
.race-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 1.3rem;
  line-height: 1;
  font-weight: 600;
}
.race-division-icon-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
}
.race-division-header h4 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
}
.race-tabs--global {
  display: flex;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  overflow: hidden;
}
.race-tabs--global .race-tab-btn {
  padding: 5px 12px;
  font-size: 0.8rem;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #64748b;
  white-space: nowrap;
}
.race-tabs--global .race-tab-btn.active {
  background: #3b82f6;
  color: #fff;
  font-weight: 600;
}
.race-members-list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  max-height: 200px;
  overflow-y: auto;
}
.race-members-list li {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.85em;
}
.race-members-list li:last-child { border-bottom: none; }
.race-rank { color: #94a3b8; font-size: 0.78em; width: 16px; flex-shrink: 0; }
.race-member-name { flex: 1; font-weight: 500; }
.race-member-time { color: #475569; font-variant-numeric: tabular-nums; font-size: 0.85em; }
.race-member-count {
  background: #e2e8f0;
  border-radius: 10px;
  padding: 1px 5px;
  font-size: 0.75em;
  color: #64748b;
}
.race-empty {
  color: #94a3b8;
  font-style: italic;
  font-size: 0.83em;
  justify-content: center;
  padding: 10px 12px !important;
}

/* ── My Trophy Case ──────────────────────────── */
.my-trophy-section h2 { margin-bottom: 12px; }

.my-trophy-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.my-trophy-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  padding: 10px 14px;
  min-width: 180px;
  max-width: 260px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.my-trophy-badge-icon {
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 8px;
  flex-shrink: 0;
}

.my-trophy-badge-emoji {
  font-size: 36px;
  flex-shrink: 0;
  line-height: 1;
}

.my-trophy-badge-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.my-trophy-badge-label {
  font-weight: 700;
  font-size: 13px;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.my-trophy-badge-count {
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.my-trophy-badge-next {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #fbbf24;
  flex-wrap: wrap;
}

.my-trophy-next-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  border-radius: 3px;
}

.my-trophy-records { margin-top: 4px; }

.my-trophy-records-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #94a3b8;
  margin-bottom: 8px;
}

.my-trophy-record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
.my-trophy-record-row:last-child { border-bottom: none; }

.my-trophy-record-icon-wrap {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  position: relative;
}
.my-trophy-record-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 5px;
  display: block;
  transition: transform 0.18s ease;
  cursor: zoom-in;
  position: relative;
  z-index: 0;
}
.my-trophy-record-icon:hover {
  transform: scale(3);
  z-index: 10;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}
.my-trophy-record-icon-ph { font-size: 20px; width: 32px; text-align: center; flex-shrink: 0; line-height: 32px; }

.my-trophy-record-row--cr { background: #eff6ff; border-radius: 6px; padding-left: 6px; padding-right: 6px; }

.my-trophy-cr-badge {
  font-size: 10px;
  font-weight: 700;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 999px;
  padding: 1px 5px;
  margin-left: 4px;
  vertical-align: middle;
}

.my-trophy-record-label {
  flex: 1;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.my-trophy-record-value {
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.my-trophy-record-unit { font-size: 10px; font-weight: 400; color: #94a3b8; margin-left: 2px; }
.my-trophy-record-year { font-size: 11px; color: #94a3b8; flex-shrink: 0; }

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
.bulk-upload-modal {
  width: min(980px, 96vw);
  max-height: 90vh;
  overflow-y: auto;
}
.bulk-hint-warn { color: #dc2626; font-weight: 600; }
.bulk-textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.success-inline {
  padding: 12px 14px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  margin: 10px 0;
}

/* ── Global batch date ──────────────────────────────────── */
.bulk-batch-date-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 14px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
  padding: 10px 14px;
  margin: 10px 0;
}
.bulk-batch-date-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}
.bulk-batch-date-input {
  padding: 4px 8px;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  font-size: 0.9rem;
}
.bulk-batch-date-hint { font-size: 0.8rem; color: #64748b; align-self: center; }

/* ── File chooser button ────────────────────────────────── */
.bulk-file-btn {
  display: inline-block;
  cursor: pointer;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  padding: 10px 18px;
  border-radius: 10px;
  margin: 8px 0;
  user-select: none;
}
.bulk-file-btn:hover { opacity: .9; }

/* ── Item list ──────────────────────────────────────────── */
.bulk-review-list {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}
.bulk-review-card {
  border: 1px solid #dbe4ef;
  border-radius: 14px;
  padding: 14px;
  background: #f8fafc;
}
.bulk-review-card.needs-match {
  border-color: #f97316;
  background: #fff7ed;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}
.bulk-review-card.has-missing {
  border-color: #fca5a5;
}
.bulk-review-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.bulk-card-num {
  background: #1d4ed8;
  color: #fff;
  font-weight: 800;
  font-size: 11px;
  border-radius: 999px;
  padding: 2px 7px;
  flex-shrink: 0;
}
.bulk-card-name { font-weight: 600; font-size: 0.9rem; flex: 1; }
.bulk-ocr-badge {
  font-size: 11px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 999px;
  padding: 2px 7px;
  font-weight: 600;
  flex-shrink: 0;
}
.bulk-ocr-badge.ocr-low { background: #fef3c7; color: #92400e; }
.bulk-challenge-hint {
  font-size: 12px;
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 700;
  flex-shrink: 0;
  cursor: default;
}
.bulk-challenge-nudge {
  display: block;
  font-size: 11px;
  color: #065f46;
  font-weight: 600;
  margin-bottom: 3px;
}

/* ── Field grid ──────────────────────────────────────────── */
.bulk-review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.bulk-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
}
.bulk-field input,
.bulk-field select {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
  min-width: 0;
}
.bulk-field--missing input,
.bulk-field--missing select {
  border-color: #dc2626;
  background: #fef2f2;
}
.bulk-field--missing {
  color: #dc2626;
}
.bulk-req { color: #dc2626; }
.bulk-field--wide { grid-column: 1 / -1; }
.bulk-field--duration .bulk-duration-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.bulk-field--duration input { width: 60px; }
.bulk-duration-sep { font-weight: 700; color: #64748b; }
.checkbox-label.bulk-field--wide {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  cursor: pointer;
}
.bulk-match-warning {
  margin: 10px 0 0;
  color: #9a3412;
  font-weight: 700;
  font-size: 0.85rem;
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

/* ── Success prompt: "Add another?" ─────────────────────── */
.workout-success-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 32px 16px;
  text-align: center;
}
.workout-success-icon { font-size: 2.8rem; line-height: 1; }
.workout-success-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}
.workout-success-sub {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
  max-width: 340px;
}
.workout-success-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 280px;
  margin-top: 8px;
}

/* ── Multi-run disclaimer ────────────────────────────────── */
.multirun-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #92400e;
  line-height: 1.4;
}
.multirun-disclaimer-icon { flex-shrink: 0; font-size: 14px; margin-top: 1px; }
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
.finalize-teams-panel {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rules-collapse-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.rules-collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-weight: 700;
  cursor: pointer;
}
.captain-app-card--mine {
  border-color: #c8102e;
  background: #fff8f8;
}
.captain-app-who {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.captain-app-subtitle {
  font-size: 0.78rem;
  color: #c8102e;
  font-weight: 500;
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
  0% { transform: translateX(100%); }
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
