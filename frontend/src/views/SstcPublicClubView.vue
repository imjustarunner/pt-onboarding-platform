<template>
  <div class="pub-page">
    <!-- Loading -->
    <div v-if="loading" class="pub-loading">
      <div class="spinner"></div>
      <p>Loading club…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="pub-error">
      <div class="error-icon">⚠️</div>
      <h2>{{ error }}</h2>
      <p class="pub-error-hint">This club may not exist, or the link may be wrong.</p>
      <router-link :to="`/${orgSlug}/clubs`" class="btn btn-ghost">Browse clubs</router-link>
    </div>

    <template v-else-if="clubData">

      <!-- ── Hero ─────────────────────────────────────────────── -->
      <div class="pub-hero" :style="heroStyle">
        <div class="pub-hero-inner">
          <div class="pub-hero-brand">
            <img v-if="clubData.club.logoUrl" :src="toUploadsUrl(clubData.club.logoUrl) || clubData.club.logoUrl" class="pub-logo" alt="Club logo" />
            <div class="pub-hero-text">
              <h1 class="pub-club-name">{{ clubData.club.name }}</h1>
              <p v-if="bannerTitleLine" class="pub-hero-subtitle pub-hero-tagline">{{ bannerTitleLine }}</p>
              <p v-if="bannerSubtitleLine" class="pub-hero-subtitle">{{ bannerSubtitleLine }}</p>
              <p class="pub-member-count">
                <span class="member-dot"></span>
                {{
                  (configuredStats.find(s => s.key === 'member_count')?.value ?? clubData.stats.memberCount)
                  .toLocaleString()
                }} member{{
                  (configuredStats.find(s => s.key === 'member_count')?.value ?? clubData.stats.memberCount) !== 1 ? 's' : ''
                }} strong
              </p>
              <p v-if="viewer.isMember" class="hero-member-note hero-member-note--hero">You're a member of this club.</p>
              <p v-else-if="pendingApplicationForClub" class="hero-member-note hero-member-note--hero">Your club application is pending review.</p>
            </div>
          </div>
          <div v-if="!viewer.isMember" class="hero-actions">
            <template v-if="pendingApplicationForClub">
              <div class="hero-pending-pill">Application Pending</div>
              <div class="hero-pending-copy">
                Applied {{ formatDate(pendingApplicationForClub.appliedAt) }}. We’ll notify you once the manager reviews it.
              </div>
              <button type="button" class="btn-hero-join" :disabled="contactingManager" @click="contactManager">
                {{ contactingManager ? 'Opening chat…' : 'Message Club Manager' }}
              </button>
            </template>
            <template v-else>
              <button type="button" class="btn-hero-join" @click="goJoin">Join Our Club</button>
              <router-link v-if="!isSignedIn" :to="loginTo" class="btn-hero-join btn-hero-join--secondary">Login Now</router-link>
            </template>
          </div>
        </div>
      </div>

      <!-- ── Quick actions (distinct hues) ───────────────────── -->
      <div class="pub-action-bar-wrap">
        <div class="pub-action-bar">
          <router-link
            v-if="isSignedIn"
            :to="`/${orgSlug}/dashboard`"
            class="pub-act pub-act--dashboard"
          >My Dashboard</router-link>
          <a
            v-if="clubData.publicStore?.enabled && clubData.publicStore?.url"
            class="pub-act pub-act--store"
            :href="clubData.publicStore.url"
            target="_blank"
            rel="noopener"
          >{{ clubData.publicStore.title || 'Team store' }}</a>
          <button type="button" class="pub-act pub-act--records" @click="scrollToClubRecords">Team records</button>
          <router-link
            v-if="isSignedIn"
            :to="membersDirectoryTo"
            class="pub-act pub-act--members"
          >Members</router-link>
          <button
            v-else
            type="button"
            class="pub-act pub-act--members"
            @click="goMembersGuest"
          >Members</button>
          <button
            v-if="isSignedIn && (clubData.companyEventsPreview || []).length"
            type="button"
            class="pub-act pub-act--events"
            @click="scrollToClubEvents"
          >Events</button>
          <button
            v-if="isSignedIn && primarySeasonButton"
            type="button"
            class="pub-act pub-act--season"
            @click="goSeason"
          >{{ seasonButtonLabel }}</button>
          <button
            v-if="isSignedIn && primarySeasonButton"
            type="button"
            class="pub-act pub-act--upload"
            @click="goQuickUpload"
          >⬆ Log Workout</button>
        </div>

        <!-- ── Manager quick-links row ───────────────────────── -->
        <div v-if="isSignedIn && viewer.isManager" class="pub-mgr-bar">
          <span class="pub-mgr-bar-label">Manage:</span>
          <router-link :to="`/${orgSlug}/club/seasons`" class="pub-mgr-link">Season Management</router-link>
          <router-link :to="`/${orgSlug}/club/settings`" class="pub-mgr-link">Club Settings</router-link>
          <router-link :to="`/${orgSlug}/admin/users`" class="pub-mgr-link">Members</router-link>
        </div>
      </div>

      <!-- ── Stats strip ─────────────────────────────────────── -->
      <div class="pub-stats-wrap" :class="{ 'pub-stats-wrap--compact': viewer.isMember }">
        <div class="pub-stats-bar" :class="{ 'pub-stats-bar--compact': viewer.isMember }">
          <template v-if="configuredStats.length">
            <div
              v-for="stat in configuredStats"
              :key="stat.key"
              class="stat-pill"
              :class="{ 'stat-pill--race': stat.key === 'half_marathon_count' || stat.key === 'marathon_count' }"
            >
              <img v-if="stat.iconUrl" :src="stat.iconUrl" alt="" class="stat-icon stat-icon-img" />
              <span class="stat-icon" v-else-if="stat.icon">{{ stat.icon }}</span>
              <span class="stat-value">{{ fmtPubStat(stat) }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
          </template>
          <template v-else>
            <div class="stat-pill">
              <span class="stat-icon">👥</span>
              <span class="stat-value">{{ clubData.stats.memberCount.toLocaleString() }}</span>
              <span class="stat-label">Active Members</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">🏃</span>
              <span class="stat-value">{{ formatMiles(clubData.stats.totalMiles) }}</span>
              <span class="stat-label">Total Miles</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">💪</span>
              <span class="stat-value">{{ clubData.stats.totalWorkouts.toLocaleString() }}</span>
              <span class="stat-label">Total Workouts</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">⭐</span>
              <span class="stat-value">{{ clubData.stats.totalPoints.toLocaleString() }}</span>
              <span class="stat-label">Total Points</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">🏆</span>
              <span class="stat-value">{{ clubData.stats.seasonCount }}</span>
              <span class="stat-label">Seasons Completed</span>
            </div>
          </template>
        </div>
      </div>

      <!-- ── Main content ────────────────────────────────────── -->
      <div class="pub-content">
        <div v-if="pendingApplicationForClub" class="pub-card pub-pending-card">
          <div class="card-label">Application pending</div>
          <div class="pub-pending-card-row">
            <div>
              <h3>We’ve got your request for {{ clubData.club.name }}</h3>
              <p>Your application was submitted on {{ formatDate(pendingApplicationForClub.appliedAt) }} and is waiting on manager approval.</p>
            </div>
            <button type="button" class="btn-hero-join btn-hero-join--compact" :disabled="contactingManager" @click="contactManager">
              {{ contactingManager ? 'Opening chat…' : 'Message Club Manager' }}
            </button>
          </div>
          <p v-if="contactManagerError" class="pub-pending-error">{{ contactManagerError }}</p>
        </div>


        <!-- Club feed (members see full feed; guests see public items when manager enables) -->
        <div v-if="showClubFeedBlock" class="pub-feed-card-wrap">
          <div class="pub-card pub-feed-card">
            <div class="card-label">💬 Club feed</div>
            <div v-if="!authStore.isAuthenticated" class="pub-feed-guest-row">
              <p class="pub-feed-guest-hint">
                {{
                  publicFeedEnabledForPage
                    ? 'Sign in to post updates to the club feed.'
                    : 'Sign in to see activity and post updates to the group.'
                }}
              </p>
              <router-link
                class="pub-feed-signin"
                :to="{ path: `/${orgSlug}/login`, query: { redirect: route.fullPath } }"
              >Sign in</router-link>
            </div>
            <ClubFeedPanel
              v-if="clubData.club?.id && (authStore.isAuthenticated || publicFeedEnabledForPage)"
              :club-id="Number(clubData.club.id)"
              variant="public"
              :post-season-id="feedPostSeasonId"
              :show-composer="viewer.isMember"
              :allow-club-wide-posts="viewer.isMember"
              :public-feed-enabled="publicFeedEnabledForPage"
              :use-public-feed-endpoint="feedUsePublicEndpoint"
            />
          </div>
        </div>

        <!-- Current season + active participants -->
        <div class="pub-row" v-if="(showCurrentSeasonBlock && (clubData.upcomingSeason || clubData.currentSeason)) || (showActiveParticipantsBlock && clubData.activeParticipants?.length)">
          <div v-if="showCurrentSeasonBlock && clubData.upcomingSeason" class="pub-card pub-season-card pub-season-card--upcoming">
            <div class="card-label">Upcoming Season</div>
            <div class="season-name">{{ clubData.upcomingSeason.name }}</div>
            <div class="season-countdown" v-if="clubData.upcomingSeason.daysUntilStart != null">
              {{ seasonCountdownText(clubData.upcomingSeason.daysUntilStart) }}
            </div>
            <p v-if="clubData.upcomingSeason.description" class="season-description">
              {{ clubData.upcomingSeason.description }}
            </p>
            <div class="season-meta">
              <span class="season-status-pill" :class="`status-${clubData.upcomingSeason.status || 'draft'}`">
                {{ clubData.upcomingSeason.status || 'draft' }}
              </span>
              <span v-if="clubData.upcomingSeason.startsAt" class="season-date">
                Starts {{ formatDate(clubData.upcomingSeason.startsAt) }}
              </span>
              <span v-if="clubData.upcomingSeason.startsAt && clubData.upcomingSeason.endsAt" class="season-sep">→</span>
              <span v-if="clubData.upcomingSeason.endsAt" class="season-date">
                Ends {{ formatDate(clubData.upcomingSeason.endsAt) }}
              </span>
            </div>
            <div v-if="viewer.isMember && joinCtaForUpcoming" class="season-join-actions">
              <button
                v-if="joinCtaForUpcoming === 'open'"
                type="button"
                class="btn-season-join"
                :disabled="joinBusy"
                @click="joinUpcomingSeason"
              >
                {{ joinBusy ? 'Joining…' : 'Join season now' }}
              </button>
              <button
                v-else-if="joinCtaForUpcoming === 'request'"
                type="button"
                class="btn-season-join btn-season-join--outline"
                :disabled="joinBusy || viewer.pendingSeasonJoinRequest"
                @click="requestSeasonJoinAfterDeadline"
              >
                {{ joinBusy ? 'Sending…' : (viewer.pendingSeasonJoinRequest ? 'Request pending' : 'Request to join') }}
              </button>
              <p v-if="joinCtaForUpcoming === 'request' && viewer.pendingSeasonJoinRequest" class="season-join-note">
                Your request is pending manager approval.
              </p>
            </div>
          </div>

          <div v-if="showCurrentSeasonBlock && clubData.currentSeason" class="pub-card pub-season-card">
            <div class="card-label">Current Season</div>
            <div class="season-name">{{ clubData.currentSeason.name }}</div>
            <p v-if="clubData.currentSeason.description" class="season-description">
              {{ clubData.currentSeason.description }}
            </p>
            <div class="season-meta">
              <span class="season-status-pill" :class="`status-${clubData.currentSeason.status || 'active'}`">
                {{ clubData.currentSeason.status || 'active' }}
              </span>
              <span v-if="clubData.currentSeason.startsAt" class="season-date">
                {{ formatDate(clubData.currentSeason.startsAt) }}
              </span>
              <span v-if="clubData.currentSeason.startsAt && clubData.currentSeason.endsAt" class="season-sep">→</span>
              <span v-if="clubData.currentSeason.endsAt" class="season-date">
                {{ formatDate(clubData.currentSeason.endsAt) }}
              </span>
            </div>
            <!-- Season miles summary -->
            <div v-if="pubSeasonMiles.loaded" class="pub-season-miles-bar">
              <div class="pub-season-miles-stat">
                <span class="pub-season-miles-label">This week</span>
                <span class="pub-season-miles-value">{{ pubSeasonMiles.weekMiles.toLocaleString(undefined, { maximumFractionDigits: 1 }) }}<span class="pub-season-miles-unit"> mi</span></span>
              </div>
              <div class="pub-season-miles-divider"></div>
              <div class="pub-season-miles-stat">
                <span class="pub-season-miles-label">Season total</span>
                <span class="pub-season-miles-value">{{ pubSeasonMiles.totalMiles.toLocaleString(undefined, { maximumFractionDigits: 1 }) }}<span class="pub-season-miles-unit"> mi</span></span>
              </div>
            </div>

            <!-- Recognition standings below the season card -->
            <div v-if="clubData.currentSeason.id" class="pub-season-recognition">
              <SeasonRecognitionStandings
                :season-id="clubData.currentSeason.id"
                :compact="true"
              />
            </div>
            <!-- Weekly matchup widget -->
            <div v-if="publicMatchup.enabled" class="pub-matchup-widget">
              <!-- Current week matchup cards -->
              <div v-if="publicMatchup.matchups.length" class="pub-mu-header">
                <span class="pub-mu-title">This Week's Matchup</span>
                <span v-if="publicMatchup.matchups.some(m => !m.resolvedAt)" class="pub-mu-live">● Live</span>
              </div>
              <div
                v-for="m in pubOrientedMatchups"
                :key="m.id"
                class="pub-mu-card"
              >
                <!-- Left (leader) -->
                <div
                  class="pub-mu-side pub-mu-side--left"
                  :style="{ background: `linear-gradient(to right, ${m.left.color}44 0%, ${m.left.color}14 60%, transparent 100%)`, borderLeft: `3px solid ${m.left.color}` }"
                >
                  <div class="pub-mu-logo-wrap" :style="{ borderColor: m.left.color }">
                    <img v-if="m.left.logo" :src="toUploadsUrl(m.left.logo)" class="pub-mu-logo" alt="" />
                    <div v-else class="pub-mu-logo-placeholder" :style="{ background: m.left.color }">{{ (m.left.name||'?')[0].toUpperCase() }}</div>
                  </div>
                  <div class="pub-mu-info">
                    <span class="pub-mu-team">{{ m.left.name }}</span>
                    <span class="pub-mu-score pub-mu-score--leader" :style="{ color: m.left.color }">
                      {{ m.left.score != null ? Number(m.left.score).toFixed(1) : '—' }}
                    </span>
                  </div>
                </div>
                <!-- Center -->
                <div class="pub-mu-center">
                  <span class="pub-mu-vs">{{ m.isResolved ? (m.tied ? 'TIE' : 'FINAL') : 'VS' }}</span>
                </div>
                <!-- Right (trailer) -->
                <div
                  class="pub-mu-side pub-mu-side--right"
                  :style="{ background: `linear-gradient(to left, ${m.right.color}44 0%, ${m.right.color}14 60%, transparent 100%)`, borderRight: `3px solid ${m.right.color}` }"
                >
                  <div class="pub-mu-info pub-mu-info--right">
                    <span class="pub-mu-team">{{ m.right.name }}</span>
                    <span class="pub-mu-score pub-mu-score--trail" :style="{ color: m.right.color }">
                      {{ m.right.score != null ? Number(m.right.score).toFixed(1) : '—' }}
                    </span>
                  </div>
                  <div class="pub-mu-logo-wrap" :style="{ borderColor: m.right.color }">
                    <img v-if="m.right.logo" :src="toUploadsUrl(m.right.logo)" class="pub-mu-logo" alt="" />
                    <div v-else class="pub-mu-logo-placeholder" :style="{ background: m.right.color }">{{ (m.right.name||'?')[0].toUpperCase() }}</div>
                  </div>
                </div>
              </div>
              <!-- W/L Standings -->
              <div v-if="publicMatchup.standings.length" class="pub-mu-standings">
                <div class="pub-mu-standings-header">
                  <span>Season Standings</span>
                  <span class="pub-mu-standings-cols"><span>W</span><span>L</span><span>T</span></span>
                </div>
                <div
                  v-for="s in publicMatchup.standings"
                  :key="s.teamId"
                  class="pub-mu-standings-row"
                  :style="{ borderLeft: `3px solid ${s.teamColor || pubTeamFallback(s.teamId)}` }"
                >
                  <span class="pub-mu-s-rank">{{ s.rank }}</span>
                  <div class="pub-mu-s-team">
                    <img v-if="s.logoPath" :src="toUploadsUrl(s.logoPath)" class="pub-mu-s-logo" alt="" />
                    <div v-else class="pub-mu-s-logo pub-mu-s-logo--ph" :style="{ background: s.teamColor || pubTeamFallback(s.teamId) }">{{ (s.teamName||'?')[0].toUpperCase() }}</div>
                    <span class="pub-mu-s-name">{{ s.teamName }}</span>
                  </div>
                  <span class="pub-mu-s-wlt">
                    <span class="pub-mu-s-w">{{ s.wins }}</span>
                    <span class="pub-mu-s-l">{{ s.losses }}</span>
                    <span class="pub-mu-s-t">{{ s.ties }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="showActiveParticipantsBlock && clubData.activeParticipants?.length"
            id="club-participants-section"
            class="pub-card pub-participants-card"
          >
            <div class="card-label">Active Participants</div>
            <p class="pub-participants-hint">
              Public preview — {{ rosterNameFormat === 'initial_last' ? 'initial and last name' : 'first name and last initial' }} only. This page does not open the full member directory.
            </p>
            <div class="participant-chips">
              <component
                v-for="(p, idx) in clubData.activeParticipants.slice(0, 36)"
                :key="`p-${idx}-${p.displayName}`"
                :is="(authStore.user && p.userId) ? 'button' : 'span'"
                class="participant-chip"
                :class="{ 'participant-chip--clickable': authStore.user && p.userId }"
                :title="p.teamName || ''"
                @click="openParticipantProfile(p)"
              >
                {{ formatParticipantName(p) }}
              </component>
              <span v-if="clubData.activeParticipants.length > 36" class="participant-chip participant-chip--more">
                +{{ clubData.activeParticipants.length - 36 }} more
              </span>
            </div>
          </div>
        </div>

        <!-- Featured workout -->
        <div v-if="showFeaturedWorkoutBlock && clubData.featuredWorkout" class="pub-card pub-featured-card">
          <div class="card-label">🔥 Top Workout This Week</div>
          <div class="featured-grid">
            <img
              v-if="clubData.featuredWorkout.imageUrl"
              :src="clubData.featuredWorkout.imageUrl"
              class="featured-image"
              alt="Featured workout"
            />
            <div class="featured-body">
              <div class="featured-type">{{ clubData.featuredWorkout.activityType }}</div>
              <div class="featured-distance">{{ Number(clubData.featuredWorkout.distanceMiles || 0).toFixed(1) }} <span class="featured-unit">mi</span></div>
              <div class="featured-tags">
                <span class="ftag ftag--kudos">👏 {{ clubData.featuredWorkout.kudosCount }} kudos</span>
                <span v-if="clubData.featuredWorkout.terrain" class="ftag">{{ clubData.featuredWorkout.terrain }}</span>
                <span v-if="clubData.featuredWorkout.teamName" class="ftag">{{ clubData.featuredWorkout.teamName }}</span>
              </div>
              <div class="featured-byline">
                By {{ clubData.featuredWorkout.byline || 'Member' }}
                <span v-if="clubData.featuredWorkout.completedAt"> · {{ formatDate(clubData.featuredWorkout.completedAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Photo album -->
        <div v-if="showPhotoAlbumBlock && (clubData.albumSlides?.length || isManagerOrCaptain)" class="pub-card pub-album-card">
          <div class="album-card-head">
            <div class="card-label">📸 Club Album</div>
            <div v-if="isManagerOrCaptain" class="album-mgr-actions">
              <input
                ref="albumUploadRef"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                multiple
                class="visually-hidden-file"
                @change="onAlbumUpload"
              />
              <button
                type="button"
                class="album-mgr-btn"
                :disabled="albumUploading || albumSaving"
                @click="albumUploadRef?.click()"
              >{{ albumUploading ? 'Uploading…' : '+ Add Photos' }}</button>
              <button
                v-if="clubData.albumSlides?.length"
                type="button"
                class="album-mgr-btn album-mgr-btn--remove"
                :disabled="albumSaving"
                @click="removeAlbumSlide(albumSlideIndex)"
              >✕ Remove</button>
            </div>
          </div>
          <div v-if="!clubData.albumSlides?.length" class="album-empty-hint">
            No photos yet. Upload your first club photo using the button above.
          </div>
          <template v-else>
            <div class="album-shell">
              <button class="album-nav" @click="prevSlide" aria-label="Previous">‹</button>
              <div class="album-frame">
                <img :src="toUploadsUrl(currentAlbumSlide.imageUrl) || currentAlbumSlide.imageUrl" class="album-image" alt="Club photo" />
                <div v-if="currentAlbumSlide.caption" class="album-caption">{{ currentAlbumSlide.caption }}</div>
              </div>
              <button class="album-nav" @click="nextSlide" aria-label="Next">›</button>
            </div>
            <div class="album-dots">
              <button
                v-for="(_, idx) in clubData.albumSlides"
                :key="`dot-${idx}`"
                class="album-dot"
                :class="{ active: idx === albumSlideIndex }"
                @click="albumSlideIndex = idx"
              />
            </div>
          </template>
        </div>

        <!-- Club Records + Race Divisions side by side -->
        <div
          id="club-records"
          class="pub-row"
          v-if="visibleClubRecords.length || (Array.isArray(clubData.raceDivisions) ? clubData.raceDivisions.some(d => d.allTime?.length) : false)"
        >
          <div v-if="visibleClubRecords.length" class="pub-card pub-records-card">
            <div class="card-label">🏅 Club Records</div>
            <div class="records-list">
              <div
                v-for="record in visibleClubRecords"
                :key="record.id || record.label"
                class="record-row"
              >
                <div class="record-icon-wrap">
                  <img v-if="record.iconUrl" :src="record.iconUrl" alt="" class="record-icon" />
                  <span v-else class="record-icon-placeholder"></span>
                </div>
                <span class="record-label">{{ record.label }}</span>
                <span class="record-spacer"></span>
                <span class="record-value">
                  {{ formatRecordValue(record) }}
                  <span v-if="displayRecordUnit(record)" class="record-unit">{{ displayRecordUnit(record) }}</span>
                </span>
                <span v-if="record.holderName || record.holderYear || record.holderTeam" class="record-meta">
                  {{ record.holderName || '—' }}<template v-if="record.holderYear"> · {{ record.holderYear }}</template><template v-if="record.holderTeam"> · {{ record.holderTeam }}</template>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Race Completion Clubs (standalone row — not dependent on club records existing) -->
        <div
          v-if="raceClubs.length"
          class="pub-row"
        >
          <div class="pub-card pub-race-clubs-card">
            <div class="card-label">Race Completion Clubs</div>
            <div class="pub-rc-clubs">
              <div
                v-for="rc in raceClubs"
                :key="rc.id"
                class="pub-rc-club"
              >
                <!-- Club header: icon + name -->
                <div class="pub-rc-club-head">
                  <img
                    v-if="rc.topTier?.iconUrl"
                    :src="rc.topTier.iconUrl"
                    :alt="rc.label"
                    class="pub-rc-club-icon"
                  />
                  <span v-else class="pub-rc-club-icon-ph">🏅</span>
                  <span class="pub-rc-club-name">{{ rc.label }}</span>
                </div>
                <!-- Members list -->
                <ul class="pub-rc-members">
                  <li
                    v-for="m in rc.members"
                    :key="m.userId"
                    class="pub-rc-member"
                  >
                    <button
                      type="button"
                      class="pub-rc-member-name"
                      :class="{ 'pub-rc-member-name--clickable': m.linked && m.userId }"
                      @click="m.linked && m.userId ? openRaceMemberProfile(m) : null"
                    >{{ m.name }}</button>
                    <span class="pub-rc-member-badges">
                      <img
                        v-if="m.earnedTier?.iconUrl"
                        :src="m.earnedTier.iconUrl"
                        :alt="m.earnedTier.label || String(m.earnedTier.count)"
                        class="pub-rc-tier-icon"
                        :title="`${m.count}× ${rc.label}`"
                      />
                    </span>
                    <span class="pub-rc-member-count">{{ m.count }}×</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- CTA (guests only) -->
        <div v-if="!viewer.isMember && !pendingApplicationForClub" class="pub-cta-card">
          <div class="cta-inner">
            <div class="cta-text">
              <div class="cta-eyebrow">Join the team</div>
              <h2 class="cta-headline">Join {{ clubData.club.name }}</h2>
              <p class="cta-body">
                Compete in weekly fitness challenges, track your miles, earn points,
                and climb the leaderboard alongside your teammates.
              </p>
              <ul class="cta-perks">
                <li><span class="perk-icon">📍</span> Weekly goal tracking with per-person &amp; team totals</li>
                <li><span class="perk-icon">🏆</span> Season recognition awards &amp; division categories</li>
                <li><span class="perk-icon">📊</span> Live leaderboards and scorecards</li>
                <li><span class="perk-icon">🔗</span> Invite friends &amp; earn referral credit</li>
              </ul>
            </div>
            <div class="cta-actions">
              <button type="button" class="btn-cta" @click="goJoin">Join {{ clubData.club.name }}</button>
              <router-link :to="loginTo" class="btn-cta btn-cta--secondary">Login Now</router-link>
              <p class="cta-note">Already a member? <router-link :to="loginTo">Sign in</router-link></p>
            </div>
          </div>
        </div>

        <!-- Upcoming events (public preview) -->
        <div
          v-if="(clubData.companyEventsPreview || []).length"
          id="club-events-section"
          class="pub-card pub-events-preview-card"
        >
          <div class="card-label">Club events</div>
          <ul class="events-preview-list">
            <li v-for="ev in clubData.companyEventsPreview" :key="ev.id" class="events-preview-row">
              <span class="ev-title">{{ ev.title }}</span>
              <span class="ev-when">{{ formatDate(ev.startsAt) }}</span>
            </li>
          </ul>
        </div>

      </div><!-- /pub-content -->
    </template>

    <!-- Member profile modal (logged-in users clicking active participants or race names) -->
    <MemberProfileModal
      v-if="clubNumericId && profileUserId"
      :clubId="clubNumericId"
      :userId="profileUserId"
      :memberName="profileUserName"
      @close="profileUserId = null; profileUserName = '';"
    />

    <!-- Public profile modal (guests clicking race division names) -->
    <Teleport to="body">
      <div v-if="pubProfileOpen" class="pub-prof-backdrop" @click.self="closePubProfile">
        <div class="pub-prof-modal" role="dialog" aria-modal="true" aria-labelledby="pub-prof-title">
          <button type="button" class="pub-prof-close" aria-label="Close" @click="closePubProfile">×</button>
          <div v-if="pubProfileLoading" class="pub-prof-loading">Loading…</div>
          <div v-else-if="pubProfileError" class="pub-prof-error">{{ pubProfileError }}</div>
          <template v-else-if="pubProfileData">
            <div class="pub-prof-top">
              <div class="pub-prof-avatar">
                <img v-if="pubProfileData.profilePhotoUrl" :src="pubProfileData.profilePhotoUrl" alt="" class="pub-prof-avatar-img" />
                <div v-else class="pub-prof-avatar-fallback">{{ pubProfileData.initials || '?' }}</div>
              </div>
              <div>
                <h2 id="pub-prof-title" class="pub-prof-name">{{ pubProfileData.displayName }}</h2>
                <p v-if="pubProfileData.homeCity || pubProfileData.homeState" class="pub-prof-loc">
                  {{ [pubProfileData.homeCity, pubProfileData.homeState].filter(Boolean).join(', ') }}
                </p>
              </div>
            </div>

            <div class="pub-prof-section">
              <div class="pub-prof-section-label">All-time in this club</div>
              <div class="pub-prof-stats">
                <div class="pub-prof-stat"><strong>{{ pubProfileData.stats?.totalMiles ?? 0 }}</strong><span>mi</span></div>
                <div class="pub-prof-stat"><strong>{{ pubProfileData.stats?.workoutCount ?? 0 }}</strong><span>workouts</span></div>
                <div v-if="pubProfileData.stats?.longestRunMiles" class="pub-prof-stat">
                  <strong>{{ pubProfileData.stats.longestRunMiles }}</strong><span>longest run</span>
                </div>
              </div>
            </div>

            <template v-if="pubProfileHasTrophies">
              <div class="pub-prof-section">
                <div class="pub-prof-section-label">🏆 Trophies</div>

                <div v-if="pubProfileData.raceClubBadges?.length" class="pub-prof-badges">
                  <div
                    v-for="rc in pubProfileData.raceClubBadges"
                    :key="rc.id"
                    class="pub-prof-badge"
                    :title="`${rc.label} — ${rc.count}× completed`"
                  >
                    <img v-if="rc.earnedTier?.iconUrl" :src="rc.earnedTier.iconUrl" class="pub-prof-badge-icon" alt="" />
                    <span v-else class="pub-prof-badge-emoji">🏅</span>
                    <div class="pub-prof-badge-info">
                      <span class="pub-prof-badge-name">{{ rc.label }}</span>
                      <span class="pub-prof-badge-count">{{ rc.count }}×</span>
                    </div>
                  </div>
                </div>

                <div v-if="pubProfileData.recordsHeld?.length" class="pub-prof-records">
                  <div
                    v-for="r in pubProfileData.recordsHeld"
                    :key="r.id"
                    class="pub-prof-record"
                    :title="`${r.label}${r.value != null ? ': ' + r.value + (r.unit ? ' ' + r.unit : '') : ''}${r.holderYear ? ' · ' + r.holderYear : ''}`"
                  >
                    <span class="pub-prof-record-trophy">🏆</span>
                    <span class="pub-prof-record-label">{{ r.label }}</span>
                    <span class="pub-prof-record-value">{{ r.value != null ? `${r.value}${r.unit ? ' ' + r.unit : ''}` : '' }}</span>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="pub-prof-section pub-prof-no-trophies">No trophies yet — check back later!</div>

            <p class="pub-prof-signin-hint">
              <router-link :to="loginTo">Sign in</router-link> to see the full profile.
            </p>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { toUploadsUrl } from '../utils/uploadsUrl';
import ClubFeedPanel from '../components/sstc/ClubFeedPanel.vue';
import MemberProfileModal from '../components/shared/MemberProfileModal.vue';
import SeasonRecognitionStandings from '../components/sstc/SeasonRecognitionStandings.vue';

const route  = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading  = ref(true);
const error    = ref('');
const clubData = ref(null);
const configuredStats = ref([]);
const raceClubs = ref([]);
const publicMatchup  = ref({ enabled: false, matchups: [], standings: [] });
const pubSeasonMiles = ref({ loaded: false, totalMiles: 0, weekMiles: 0 });
const profileUserId = ref(null);
const profileUserName = ref('');
const albumSlideIndex = ref(0);
const albumUploading = ref(false);
const albumSaving = ref(false);
const albumUploadRef = ref(null);
const joinBusy = ref(false);
const myApplications = ref([]);
const contactingManager = ref(false);
const contactManagerError = ref('');
let albumAutoplayTimer = null;
/** Avoid duplicate fetch when route updates after canonical slug redirect. */
const lastLoadedRouteKey = ref('');

const orgSlug = computed(() => route.params.organizationSlug || 'ssc');
const clubRef = computed(() => route.params.clubId);
const clubNumericId = computed(() => clubData.value?.club?.id ? Number(clubData.value.club.id) : null);

const openParticipantProfile = (p) => {
  if (!authStore.user || !p.userId) return;
  profileUserId.value = p.userId;
  profileUserName.value = p.displayName || '';
};

// Public profile modal (for race division member names — works with or without login)
const pubProfileOpen = ref(false);
const pubProfileLoading = ref(false);
const pubProfileError = ref('');
const pubProfileData = ref(null);

const openRaceMemberProfile = async (m) => {
  if (!m?.userId) return;
  // Logged-in users: use the rich MemberProfileModal
  if (authStore.user) {
    profileUserId.value = m.userId;
    profileUserName.value = m.name || '';
    return;
  }
  // Guests: use the lightweight public profile
  pubProfileData.value = null;
  pubProfileError.value = '';
  pubProfileOpen.value = true;
  pubProfileLoading.value = true;
  try {
    const { data } = await api.get(
      `/summit-stats/clubs/${clubNumericId.value}/members/${m.userId}/public-profile`,
      { skipAuthRedirect: true }
    );
    pubProfileData.value = data;
  } catch (e) {
    pubProfileError.value = e?.response?.data?.error?.message || 'Could not load profile.';
  } finally {
    pubProfileLoading.value = false;
  }
};

const closePubProfile = () => {
  pubProfileOpen.value = false;
  pubProfileData.value = null;
  pubProfileError.value = '';
};

const pubProfileHasTrophies = computed(() => {
  if (!pubProfileData.value) return false;
  return (pubProfileData.value.raceClubBadges?.length > 0) ||
         (pubProfileData.value.recordsHeld?.length > 0);
});

const viewer = computed(() => {
  const v = clubData.value?.viewer;
  if (v) return v;
  return { isAuthenticated: false, isMember: false, clubRole: null, isManager: false, seasonMembershipByClassId: {}, pendingSeasonJoinRequest: null, pendingApplication: null };
});

/** Client-side session (Pinia + localStorage user). Public API may not see HttpOnly cookies on cross-origin calls, so `viewer.isMember` is unreliable for UI chrome. */
const isSignedIn = computed(() => authStore.isAuthenticated);
const pendingApplicationForClub = computed(() => {
  const viewerPending = viewer.value?.pendingApplication;
  if (viewerPending?.id) return viewerPending;
  const clubId = Number(clubData.value?.club?.id || 0);
  if (!clubId) return null;
  return (myApplications.value || []).find(
    (app) => Number(app?.clubId || 0) === clubId && String(app?.status || '').toLowerCase() === 'pending'
  ) || null;
});

const membersDirectoryTo = computed(() => {
  const ref =
    clubData.value?.club?.canonicalClubRef ||
    clubRef.value ||
    clubData.value?.club?.id;
  if (ref == null || ref === '') return `/${orgSlug.value}/clubs`;
  return `/${orgSlug.value}/clubs/${ref}/members`;
});

const loginTo = computed(() => ({
  path: `/${orgSlug.value}/login`,
  query: { redirect: route.fullPath }
}));

const goJoin = () => {
  const numericClubId = Number(clubData.value?.club?.id || 0);
  if (!numericClubId) return;
  router.push({ path: `/${orgSlug.value}/join`, query: { club: numericClubId } });
};

const loadMyApplications = async () => {
  if (!authStore.isAuthenticated) {
    myApplications.value = [];
    return;
  }
  try {
    const { data } = await api.get('/summit-stats/my-applications', { skipGlobalLoading: true });
    myApplications.value = Array.isArray(data?.applications) ? data.applications : [];
  } catch {
    myApplications.value = [];
  }
};

const contactManager = async () => {
  const clubId = Number(clubData.value?.club?.id || 0);
  if (!clubId) return;
  if (!authStore.isAuthenticated) {
    router.push({ path: `/${orgSlug.value}/login`, query: { redirect: route.fullPath } });
    return;
  }
  contactingManager.value = true;
  contactManagerError.value = '';
  try {
    const { data } = await api.post(`/summit-stats/clubs/${clubId}/contact-manager`);
    router.push({
      path: `/${orgSlug.value}/messages`,
      query: {
        agencyId: String(data?.agencyId || ''),
        threadId: String(data?.threadId || '')
      }
    });
  } catch (e) {
    contactManagerError.value = e?.response?.data?.error?.message || 'Failed to open the club manager chat.';
  } finally {
    contactingManager.value = false;
  }
};

const scrollToClubRecords = () => {
  const id = Number(clubData.value?.club?.id || 0);
  if (!id) return;
  router.push(`/${orgSlug.value}/clubs/${id}/records`);
};

const scrollToClubEvents = () => {
  const el = document.getElementById('club-events-section');
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const seasonMembership = (classId) => {
  const map = viewer.value?.seasonMembershipByClassId || {};
  return map?.[Number(classId)] || null;
};

const joinCtaForUpcoming = computed(() => {
  const us = clubData.value?.upcomingSeason;
  if (!us?.id || !viewer.value.isMember) return null;
  if (seasonMembership(us.id)) return null;
  const phase = us.joinPhase;
  if (phase === 'not_open') return null;
  if (phase === 'open') return 'open';
  if (phase === 'request_only') return 'request';
  return null;
});

const primarySeasonButton = computed(() => {
  const cur = clubData.value?.currentSeason;
  const up = clubData.value?.upcomingSeason;
  if (cur?.id) return { kind: 'current', id: cur.id };
  if (up?.id && authStore.isAuthenticated) return { kind: 'upcoming', id: up.id };
  return null;
});

const seasonButtonLabel = computed(() => {
  if (clubData.value?.currentSeason?.id) return 'Current season';
  return 'Upcoming season';
});

const goSeason = () => {
  const cur = clubData.value?.currentSeason;
  const up = clubData.value?.upcomingSeason;
  const id = cur?.id || up?.id;
  if (!id) return;
  router.push(`/${orgSlug.value}/season/${id}`);
};

const goQuickUpload = () => {
  const cur = clubData.value?.currentSeason;
  const id = cur?.id;
  if (!id) return;
  router.push({ path: `/${orgSlug.value}/season/${id}`, query: { openUpload: '1' } });
};

const joinUpcomingSeason = async () => {
  const us = clubData.value?.upcomingSeason;
  if (!us?.id) return;
  joinBusy.value = true;
  try {
    await api.post(`/learning-program-classes/${us.id}/join`);
    await reloadPublic();
  } catch (e) {
    const code = e?.response?.data?.code;
    const msg = e?.response?.data?.error?.message || e?.message || 'Could not join';
    if (code === 'ENROLLMENT_CLOSED') {
      await requestSeasonJoinAfterDeadline();
    } else {
      window.alert(msg);
    }
  } finally {
    joinBusy.value = false;
  }
};

const requestSeasonJoinAfterDeadline = async () => {
  const us = clubData.value?.upcomingSeason;
  const clubId = Number(clubData.value?.club?.id || 0);
  if (!us?.id || !clubId) return;
  joinBusy.value = true;
  try {
    await api.post(`/summit-stats/clubs/${clubId}/seasons/${us.id}/join-request`);
    await reloadPublic();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || 'Could not submit request';
    window.alert(msg);
  } finally {
    joinBusy.value = false;
  }
};

const reloadPublic = async () => {
  const pubRes = await api.get(`/summit-stats/clubs/${clubRef.value}/public`, { skipAuthRedirect: true });
  clubData.value = pubRes?.data || null;
  await loadMyApplications();
};

const loadClubPage = async () => {
  const routeKey = `${route.params.organizationSlug}|${route.params.clubId}`;
  if (!clubRef.value) {
    error.value = 'Club not found.';
    loading.value = false;
    clubData.value = null;
    raceClubs.value = [];
    lastLoadedRouteKey.value = '';
    return;
  }
  if (routeKey === lastLoadedRouteKey.value) {
    loading.value = false;
    return;
  }
  error.value = '';
  contactManagerError.value = '';
  try {
    const pubRes = await api.get(`/summit-stats/clubs/${clubRef.value}/public`, { skipAuthRedirect: true });
    clubData.value = pubRes?.data || null;
    const canon = clubData.value?.club?.canonicalClubRef;
    const curRef = String(clubRef.value || '').trim();
    if (canon && String(canon).toLowerCase() !== curRef.toLowerCase()) {
      lastLoadedRouteKey.value = `${orgSlug.value}|${String(canon)}`;
      await router.replace({ path: `/${orgSlug.value}/clubs/${canon}`, query: route.query });
      const pubRes2 = await api.get(`/summit-stats/clubs/${clubRef.value}/public`, { skipAuthRedirect: true });
      clubData.value = pubRes2?.data || null;
    }
    lastLoadedRouteKey.value = `${orgSlug.value}|${String(route.params.clubId)}`;
    const numericClubId = Number(clubData.value?.club?.id || 0);
    if (
      numericClubId &&
      authStore.isAuthenticated &&
      String(authStore.user?.role || '').toLowerCase() === 'club_manager'
    ) {
      const match = (agencyStore.userAgencies || []).find((a) => Number(a?.id) === numericClubId);
      if (match) agencyStore.setCurrentAgency(match);
    }
    if (numericClubId) {
      const seasonId = clubData.value?.currentSeason?.id;
      const [statsRes, raceClubsRes, matchupRes, milesRes] = await Promise.allSettled([
        api.get(`/summit-stats/clubs/${numericClubId}/stats`, { skipAuthRedirect: true }),
        api.get(`/summit-stats/clubs/${numericClubId}/race-clubs`, { skipAuthRedirect: true }),
        seasonId
          ? api.get(`/learning-program-classes/${seasonId}/matchup-public`, { skipAuthRedirect: true })
          : Promise.reject(new Error('no season')),
        seasonId
          ? api.get(`/learning-program-classes/${seasonId}/season-miles-summary`, { skipAuthRedirect: true })
          : Promise.reject(new Error('no season'))
      ]);
      if (statsRes.status === 'fulfilled' && Array.isArray(statsRes.value?.data?.stats)) {
        configuredStats.value = statsRes.value.data.stats;
      }
      if (raceClubsRes.status === 'fulfilled' && Array.isArray(raceClubsRes.value?.data?.raceClubs)) {
        raceClubs.value = raceClubsRes.value.data.raceClubs.filter(rc => rc.members?.length > 0);
      }
      if (matchupRes.status === 'fulfilled' && matchupRes.value?.data?.enabled) {
        publicMatchup.value = matchupRes.value.data;
      } else {
        publicMatchup.value = { enabled: false, matchups: [], standings: [] };
      }
      if (milesRes.status === 'fulfilled' && milesRes.value?.data) {
        pubSeasonMiles.value = { loaded: true, totalMiles: milesRes.value.data.totalMiles || 0, weekMiles: milesRes.value.data.weekMiles || 0 };
      }
    }
    await loadMyApplications();
    albumSlideIndex.value = 0;
    startAlbumAutoplay();
  } catch (e) {
    const status = e?.response?.status;
    const msg = e?.response?.data?.error?.message;
    if (status === 404 || (msg && /not found/i.test(msg))) {
      const refStr = String(clubRef.value || '').trim();
      error.value = /^\d+$/.test(refStr)
        ? 'This club could not be found. A numeric link (e.g. /clubs/387) only works if that club exists in this environment. Use your public slug from Club settings (e.g. /clubs/your-slug), or browse clubs.'
        : 'This club could not be found.';
    } else {
      error.value = msg || 'Could not load this club page.';
    }
    clubData.value = null;
    lastLoadedRouteKey.value = '';
  } finally {
    loading.value = false;
  }
};

const publicPageConfig = computed(() => clubData.value?.club?.publicPageConfig || {});
/** Manager enabled public visibility for club-wide posts on this public page. */
const publicFeedEnabledForPage = computed(() => publicPageConfig.value?.publicFeedEnabled === true);
/** Guests and signed-in non-members load the unauthenticated public feed slice. */
const feedUsePublicEndpoint = computed(() => {
  if (!publicPageConfig.value?.publicFeedEnabled) return false;
  return !authStore.isAuthenticated || !viewer.value.isMember;
});
const bannerTitleLine = computed(() => String(publicPageConfig.value?.bannerTitle || '').trim());
const bannerSubtitleLine = computed(() => String(publicPageConfig.value?.bannerSubtitle || '').trim());
const showClubFeedBlock = computed(() => publicPageConfig.value?.showClubFeed !== false);
const feedPostSeasonId = computed(() => {
  const cur = clubData.value?.currentSeason?.id;
  const up = clubData.value?.upcomingSeason?.id;
  return cur || up || null;
});
const heroStyle = computed(() => {
  const rawBanner = String(publicPageConfig.value?.bannerImageUrl || '').trim();
  if (!rawBanner) return {};
  const banner = toUploadsUrl(rawBanner) || rawBanner;
  const fx = Number(publicPageConfig.value?.bannerFocalX ?? 50);
  const fy = Number(publicPageConfig.value?.bannerFocalY ?? 50);
  return {
    backgroundImage: `linear-gradient(rgba(15,23,42,.65), rgba(15,23,42,.65)), url(${banner})`,
    backgroundSize: 'cover',
    backgroundPosition: `${fx}% ${fy}%`
  };
});
const showCurrentSeasonBlock = computed(() => publicPageConfig.value?.showCurrentSeason !== false);

// ── Public matchup widget helpers ─────────────────────────────
const PUB_TEAM_PALETTE = ['#b45309','#2563eb','#dc2626','#7c3aed','#0891b2','#15803d','#c026d3','#d97706'];
const pubAllTeamIds = computed(() => {
  const ids = [];
  for (const m of publicMatchup.value.matchups || []) {
    if (!ids.includes(m.team1Id)) ids.push(m.team1Id);
    if (!ids.includes(m.team2Id)) ids.push(m.team2Id);
  }
  for (const s of publicMatchup.value.standings || []) {
    if (!ids.includes(s.teamId)) ids.push(s.teamId);
  }
  return ids;
});
const pubTeamFallback = (teamId) => {
  const idx = pubAllTeamIds.value.indexOf(teamId);
  return PUB_TEAM_PALETTE[(idx >= 0 ? idx : 0) % PUB_TEAM_PALETTE.length];
};
const pubOrientedMatchups = computed(() =>
  (publicMatchup.value.matchups || []).map((m) => {
    const isResolved = !!m.resolvedAt;
    const t1Score = isResolved ? (m.team1Points ?? 0) : (m.team1LivePoints ?? 0);
    const t2Score = isResolved ? (m.team2Points ?? 0) : (m.team2LivePoints ?? 0);
    const swap = t2Score > t1Score || (isResolved && m.winnerTeamId === m.team2Id && m.winnerTeamId !== m.team1Id);
    const c1 = m.team1Color || pubTeamFallback(m.team1Id);
    const c2 = m.team2Color || pubTeamFallback(m.team2Id);
    const left  = swap ? { id: m.team2Id, name: m.team2Name, logo: m.team2Logo, color: c2, score: t2Score, isWinner: m.winnerTeamId === m.team2Id } : { id: m.team1Id, name: m.team1Name, logo: m.team1Logo, color: c1, score: t1Score, isWinner: m.winnerTeamId === m.team1Id };
    const right = swap ? { id: m.team1Id, name: m.team1Name, logo: m.team1Logo, color: c1, score: t1Score, isWinner: m.winnerTeamId === m.team1Id } : { id: m.team2Id, name: m.team2Name, logo: m.team2Logo, color: c2, score: t2Score, isWinner: m.winnerTeamId === m.team2Id };
    return { ...m, left, right, isResolved, tied: !!m.isTie };
  })
);
const showActiveParticipantsBlock = computed(() => publicPageConfig.value?.showActiveParticipants !== false);
const rosterNameFormat = computed(() => publicPageConfig.value?.rosterNameFormat || 'full');

const formatParticipantName = (p) => {
  const raw = String(p?.displayName || '').trim();
  if (rosterNameFormat.value === 'initial_last') {
    // raw is already "First L." format from backend; convert to "F. LastName" if we have parts
    const fn = String(p?.firstName || '').trim();
    const ln = String(p?.lastName || '').trim();
    if (fn && ln) return `${fn.charAt(0).toUpperCase()}. ${ln}`;
  }
  return raw || 'Member';
};

const goMembersGuest = () => {
  router.push(membersDirectoryTo.value);
};

const showFeaturedWorkoutBlock = computed(() => publicPageConfig.value?.showFeaturedWorkout !== false);
const showPhotoAlbumBlock = computed(() => publicPageConfig.value?.showPhotoAlbum !== false);
const currentAlbumSlide = computed(() => {
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (!slides.length) return { imageUrl: '', caption: '' };
  const idx = Math.max(0, Math.min(albumSlideIndex.value, slides.length - 1));
  return slides[idx] || { imageUrl: '', caption: '' };
});

const formatMiles = (n) => {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const formatSecondsAsTime = (totalSeconds) => {
  const s = Math.round(Number(totalSeconds));
  if (!Number.isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const formatRecordValue = (record) => {
  if (record.value == null) return '—';
  if (String(record.unit || '').toLowerCase() === 'seconds') return formatSecondsAsTime(record.value);
  return record.value;
};

const displayRecordUnit = (record) => {
  if (String(record.unit || '').toLowerCase() === 'seconds') return '';
  return record.unit || '';
};

// Only show records that have a value AND a holder (hides auto-fill records with no qualifying data yet)
const visibleClubRecords = computed(() =>
  (clubData.value?.clubRecords || []).filter(
    (r) => r.value != null && (r.holderName || r.holderUserId)
  )
);

const decimalStatKeys = new Set(['total_miles', 'run_miles', 'ruck_miles']);
const fmtPubStat = (stat) => {
  const n = Number(stat.value ?? 0);
  if (decimalStatKeys.has(stat.key)) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString();
};

const formatDate = (raw) => {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(raw);
  }
};

const seasonCountdownText = (daysUntilStart) => {
  const days = Number(daysUntilStart);
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return 'Starts today';
  if (days === 1) return 'Starts in 1 day';
  return `Starts in ${days} days`;
};

const nextSlide = () => {
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (!slides.length) return;
  albumSlideIndex.value = (albumSlideIndex.value + 1) % slides.length;
};
const prevSlide = () => {
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (!slides.length) return;
  albumSlideIndex.value = (albumSlideIndex.value - 1 + slides.length) % slides.length;
};
const startAlbumAutoplay = () => {
  if (albumAutoplayTimer) clearInterval(albumAutoplayTimer);
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (slides.length < 2) return;
  albumAutoplayTimer = setInterval(() => nextSlide(), 4500);
};

const isManagerOrCaptain = computed(() => {
  if (!viewer.value.isAuthenticated) return false;
  if (viewer.value.isManager) return true;
  const role = String(viewer.value.clubRole || '').toLowerCase();
  return role === 'captain';
});

const saveAlbumSlides = async (slides) => {
  const clubId = clubData.value?.club?.id;
  if (!clubId) return;
  albumSaving.value = true;
  try {
    const config = { ...(clubData.value?.club?.publicPageConfig || {}), albumSlides: slides };
    await api.put(`/summit-stats/clubs/${clubId}/public-page-config`, config);
    if (clubData.value) {
      clubData.value = { ...clubData.value, albumSlides: slides };
    }
    albumSlideIndex.value = Math.min(albumSlideIndex.value, Math.max(0, slides.length - 1));
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save album');
  } finally {
    albumSaving.value = false;
  }
};

const removeAlbumSlide = async (idx) => {
  const slides = [...(clubData.value?.albumSlides || [])];
  slides.splice(idx, 1);
  await saveAlbumSlides(slides);
};

const onAlbumUpload = async (event) => {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  albumUploading.value = true;
  try {
    const uploaded = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('logo', file);
      const { data } = await api.post('/logos/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (data?.path) uploaded.push({ imageUrl: data.path, caption: '' });
      else if (data?.url) uploaded.push({ imageUrl: data.url, caption: '' });
    }
    if (uploaded.length) {
      const current = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
      await saveAlbumSlides([...current, ...uploaded].slice(0, 20));
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || e?.message || 'Upload failed');
  } finally {
    albumUploading.value = false;
    if (albumUploadRef.value) albumUploadRef.value.value = '';
  }
};

onMounted(async () => {
  loading.value = true;
  await loadClubPage();
});

watch(
  () => `${route.params.organizationSlug}|${route.params.clubId}`,
  async (newKey, oldKey) => {
    if (oldKey === undefined) return;
    if (newKey === oldKey) return;
    loading.value = true;
    await loadClubPage();
  }
);

watch(
  () => authStore.isAuthenticated,
  async () => {
    await loadMyApplications();
  }
);

onBeforeUnmount(() => {
  if (albumAutoplayTimer) clearInterval(albumAutoplayTimer);
});
</script>

<style scoped>
/* ─── Base ────────────────────────────────────────────────────── */
.pub-page {
  min-height: 100vh;
  background: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* ─── Loading / Error ─────────────────────────────────────────── */
.pub-loading,
.pub-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 16px;
  text-align: center;
  color: #64748b;
}
.error-icon { font-size: 2.5rem; }
.pub-error h2 { margin: 0; font-size: 1.25rem; color: #0f172a; }
.pub-error-hint { margin: 0; font-size: 0.9rem; color: #64748b; max-width: 320px; }
.spinner {
  width: 40px; height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #1d4ed8;
  border-radius: 50%;
  animation: spin .75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Hero ────────────────────────────────────────────────────── */
.pub-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%);
  color: #fff;
  padding: 64px 24px 88px;
  position: relative;
  overflow: hidden;
}
.pub-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 70% 50%, rgba(99,102,241,.28) 0%, transparent 70%);
  pointer-events: none;
}
.pub-hero-inner {
  max-width: 1040px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 28px;
  position: relative;
  z-index: 1;
}
.pub-hero-brand {
  display: flex;
  align-items: center;
  gap: 20px;
}
.pub-logo {
  width: 96px;
  height: 96px;
  aspect-ratio: 1;
  border-radius: 16px;
  object-fit: contain;
  background: rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255,255,255,.25);
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.25);
  flex-shrink: 0;
}
.pub-hero-text {}
.pub-club-name {
  margin: 0;
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #fff;
}
.pub-hero-subtitle {
  margin: 8px 0 0;
  font-size: 1rem;
  color: rgba(255,255,255,.75);
  font-weight: 400;
}
.pub-hero-tagline {
  font-size: 1.05rem;
  font-weight: 600;
  color: rgba(255,255,255,.9);
}
.pub-member-count {
  margin: 10px 0 0;
  font-size: 13px;
  color: rgba(255,255,255,.6);
  display: flex;
  align-items: center;
  gap: 6px;
}
.member-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 6px #4ade80;
}
.hero-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  width: min(100%, 320px);
}
.hero-pending-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-weight: 800;
}
.hero-pending-copy {
  width: 100%;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.95rem;
  line-height: 1.45;
  text-align: right;
}
.btn-hero-join {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 32px;
  background: #fff;
  color: #1d4ed8;
  font-size: 15px;
  font-weight: 800;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,.22);
  transition: transform .15s, box-shadow .15s;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
  max-width: 100%;
  width: 100%;
  text-decoration: none;
  line-height: 1.25;
  box-sizing: border-box;
}
.btn-hero-join:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.28); }
.btn-hero-shop {
  padding: 10px 22px;
  background: rgba(255,255,255,.12);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,.3);
  text-decoration: none;
  transition: background .15s;
  white-space: nowrap;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.btn-hero-shop:hover { background: rgba(255,255,255,.22); }
.hero-member-note {
  margin: 0 0 8px;
  font-size: 14px;
  color: rgba(255,255,255,.85);
  font-weight: 600;
}
.hero-member-note--hero {
  margin: 12px 0 0;
}
.btn-hero-join--secondary {
  text-decoration: none;
  text-align: center;
  background: rgba(255,255,255,.18);
  color: #fff;
  border: 1.5px solid rgba(255,255,255,.45);
}
.btn-hero-join--secondary:hover {
  background: rgba(255,255,255,.28);
}
.btn-hero-join--compact {
  width: auto;
  min-width: 220px;
  padding: 12px 22px;
}

/* ─── Quick action bar ───────────────────────────────────────── */
.pub-action-bar-wrap {
  max-width: 1040px;
  margin: -24px auto 0;
  padding: 0 24px 12px;
  position: relative;
  z-index: 12;
  width: 100%;
  box-sizing: border-box;
}
.pub-action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  row-gap: 12px;
  column-gap: 12px;
  justify-content: center;
  align-items: center;
  align-content: center;
  width: 100%;
  box-sizing: border-box;
}
.pub-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  text-decoration: none;
  color: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
  transition: transform 0.12s, box-shadow 0.12s;
  flex: 0 0 auto;
  flex-shrink: 0;
  max-width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
}
.pub-act:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
}
@media (max-width: 520px) {
  .pub-action-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .pub-act {
    width: 100%;
    justify-content: center;
    white-space: normal;
    text-align: center;
  }
}
.pub-act--store { background: linear-gradient(135deg, #059669, #10b981); }
.pub-act--records { background: linear-gradient(135deg, #7c3aed, #a78bfa); }
.pub-act--members { background: linear-gradient(135deg, #0e7490, #14b8a6); }
.pub-act--events { background: linear-gradient(135deg, #c2410c, #f97316); }
.pub-act--season { background: linear-gradient(135deg, #b45309, #eab308); }
.pub-act--upload { background: linear-gradient(135deg, #dc2626, #ef4444); font-weight: 700; }
.pub-act--dashboard {
  background: linear-gradient(135deg, #334155, #64748b);
  text-decoration: none;
}

/* ─── Manager quick-links row ────────────────────────────────── */
.pub-mgr-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(30, 58, 138, 0.06);
  border-top: 1px solid rgba(30, 58, 138, 0.12);
}
.pub-mgr-bar-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(30, 58, 138, 0.65);
  flex-shrink: 0;
}
.pub-mgr-link {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary, #1e3a8a);
  text-decoration: none;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(30, 58, 138, 0.2);
  background: rgba(255, 255, 255, 0.7);
  transition: background 0.14s, border-color 0.14s;
}
.pub-mgr-link:hover {
  background: #fff;
  border-color: rgba(30, 58, 138, 0.4);
}

/* ─── Club feed card (public page) ───────────────────────────── */
.pub-feed-card-wrap {
  margin-bottom: 0;
}
.pub-feed-guest-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.pub-feed-card .pub-feed-guest-hint {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
}
.pub-feed-signin {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
  width: fit-content;
}
.pub-feed-signin:hover {
  filter: brightness(1.05);
}

/* ─── Stats strip ─────────────────────────────────────────────── */
.pub-stats-wrap {
  max-width: 1040px;
  /* Pull up to tuck under hero without covering the action buttons (was -36px, overlapped the pill row). */
  margin: -18px auto 0;
  padding: 0 24px;
  position: relative;
  z-index: 10;
}
.pub-stats-wrap--compact {
  max-width: 640px;
  margin-top: -14px;
}
.pub-pending-card {
  border: 1px solid #bfdbfe;
  background: linear-gradient(135deg, #eff6ff 0%, #ffffff 78%);
}
.pub-pending-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.pub-pending-card-row h3 {
  margin: 0 0 6px;
  font-size: 1.2rem;
  color: #0f172a;
}
.pub-pending-card-row p {
  margin: 0;
  color: #475569;
}
.pub-pending-error {
  margin: 14px 0 0;
  color: #b91c1c;
  font-weight: 600;
}
.pub-stats-bar {
  display: flex;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(15,23,42,.12);
  overflow: hidden;
  border: 1px solid rgba(226,232,240,.8);
}
.pub-stats-bar--compact {
  flex-wrap: wrap;
  border-radius: 14px;
}
.pub-stats-bar--compact .stat-pill {
  flex: 1 1 33%;
  min-width: 30%;
  padding: 12px 10px 10px;
}
.pub-stats-bar--compact .stat-value {
  font-size: 1.25rem;
}
.pub-stats-bar--compact .stat-label {
  font-size: 9px;
}
.stat-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 12px 18px;
  border-right: 1px solid #f1f5f9;
  gap: 3px;
}
.stat-pill:last-child { border-right: none; }
.stat-pill--race { background: linear-gradient(135deg, #fffbeb, #fef3c7); }
.stat-icon { font-size: 2.6rem; margin-bottom: 4px; line-height: 1; }
.stat-icon-img { width: 60px; height: 60px; object-fit: contain; }
.stat-value {
  font-size: 1.6rem;
  font-weight: 900;
  color: #1d4ed8;
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: #94a3b8;
}
@media (max-width: 600px) {
  .pub-stats-bar { flex-wrap: wrap; }
  .stat-pill { min-width: 50%; border-right: none; border-bottom: 1px solid #f1f5f9; }
  .stat-pill:last-child { border-bottom: none; }
}

/* ─── Content layout ──────────────────────────────────────────── */
.pub-content {
  max-width: 1040px;
  margin: 36px auto 64px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.pub-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 680px) { .pub-row { grid-template-columns: 1fr; } }

/* ─── Base card ───────────────────────────────────────────────── */
.pub-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px 28px 24px;
  box-shadow: 0 2px 12px rgba(15,23,42,.06);
  border: 1px solid rgba(226,232,240,.7);
}
.card-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #94a3b8;
  margin-bottom: 14px;
}

/* ─── Season card ─────────────────────────────────────────────── */
.pub-season-card {}

/* Season miles summary bar inside season card */
.pub-season-miles-bar {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: 10px;
  padding: 12px 18px;
  margin: 12px 0 4px;
}
.pub-season-miles-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}
.pub-season-miles-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}
.pub-season-miles-value {
  font-size: 24px;
  font-weight: 800;
  color: #f1f5f9;
  line-height: 1.15;
  margin-top: 1px;
}
.pub-season-miles-unit { font-size: 12px; font-weight: 600; color: #64748b; }
.pub-season-miles-divider {
  width: 1px;
  height: 36px;
  background: #334155;
  flex-shrink: 0;
  margin: 0 14px;
}
.pub-season-recognition { margin-top: 14px; }

/* ── Public matchup widget ─────────────────────────────────── */
.pub-matchup-widget {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
  background: #0d1520;
  border: 1px solid rgba(255,255,255,0.08);
}
.pub-mu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
}
.pub-mu-title { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: rgba(255,255,255,0.45); }
.pub-mu-live { font-size: 0.68rem; font-weight: 700; color: #f87171; letter-spacing: 0.04em; animation: pulse 1.5s ease-in-out infinite; }
.pub-mu-card { display: flex; align-items: stretch; min-height: 80px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.pub-mu-card:last-of-type { border-bottom: none; }
.pub-mu-side { display: flex; align-items: center; gap: 10px; flex: 1; padding: 12px 14px; min-width: 0; }
.pub-mu-side--right { flex-direction: row-reverse; }
.pub-mu-logo-wrap { width: 40px; height: 40px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(255,255,255,0.1); flex-shrink: 0; }
.pub-mu-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
.pub-mu-logo-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 800; color: #fff; }
.pub-mu-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.pub-mu-info--right { align-items: flex-end; text-align: right; }
.pub-mu-team { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pub-mu-score { font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
.pub-mu-score--leader { font-size: 1.9rem; text-shadow: 0 0 12px currentColor; }
.pub-mu-score--trail  { font-size: 1.3rem; opacity: 0.65; }
.pub-mu-center { display: flex; align-items: center; justify-content: center; padding: 0 8px; flex-shrink: 0; }
.pub-mu-vs { font-size: 0.65rem; font-weight: 900; color: rgba(255,255,255,0.4); letter-spacing: 0.05em; }

.pub-mu-standings { border-top: 1px solid rgba(255,255,255,0.07); padding: 4px 0 2px; }
.pub-mu-standings-header { display: flex; justify-content: space-between; align-items: center; padding: 7px 14px 5px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.3); }
.pub-mu-standings-cols { display: flex; gap: 14px; }
.pub-mu-standings-row { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); border-left: 3px solid transparent; }
.pub-mu-standings-row:last-child { border-bottom: none; }
.pub-mu-s-rank { font-size: 0.7rem; color: rgba(255,255,255,0.3); font-weight: 700; width: 12px; flex-shrink: 0; }
.pub-mu-s-team { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.pub-mu-s-logo { width: 20px; height: 20px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.pub-mu-s-logo--ph { display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 800; color: #fff; border-radius: 4px; }
.pub-mu-s-name { font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pub-mu-s-wlt { display: flex; gap: 14px; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.pub-mu-s-w { color: #4ade80; font-weight: 700; width: 10px; text-align: center; }
.pub-mu-s-l { color: #f87171; font-weight: 700; width: 10px; text-align: center; }
.pub-mu-s-t { color: rgba(255,255,255,0.3); font-weight: 700; width: 10px; text-align: center; }
.pub-season-card--upcoming {
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
  border-color: #fdba74;
}
.season-name {
  font-size: 1.35rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}
.season-countdown {
  display: inline-flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #fff1db;
  color: #c2410c;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.season-description {
  margin: 0 0 12px;
  color: #475569;
  line-height: 1.55;
}
.season-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #64748b;
}
.season-status-pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  background: #dbeafe;
  color: #1d4ed8;
}
.season-status-pill.status-closed { background: #fee2e2; color: #b91c1c; }
.season-status-pill.status-archived { background: #f1f5f9; color: #64748b; }
.season-sep { color: #cbd5e1; font-weight: 300; }
.season-date { font-size: 13px; }

/* ─── Participants card (read-only public preview; no directory links) ─ */
.pub-participants-hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: #64748b;
}
.participant-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.participant-chip {
  padding: 5px 11px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: default;
  user-select: none;
}
.participant-chip--more {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #64748b;
}
.participant-chip--clickable {
  cursor: pointer;
  background: #fff;
  border-color: #c7d2fe;
  color: #4338ca;
  transition: background 0.15s, border-color 0.15s;
}
.participant-chip--clickable:hover {
  background: #eef2ff;
  border-color: #818cf8;
}

/* ─── Featured workout card ───────────────────────────────────── */
.pub-featured-card { border-left: 4px solid #f59e0b; }
.featured-grid {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 600px) { .featured-grid { grid-template-columns: 1fr; } }
.featured-image {
  width: 100%;
  height: 148px;
  object-fit: cover;
  border-radius: 10px;
  background: #f8fafc;
}
.featured-body { display: flex; flex-direction: column; gap: 8px; }
.featured-type {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #f59e0b;
}
.featured-distance {
  font-size: 2.2rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.04em;
  line-height: 1;
}
.featured-unit { font-size: 1rem; font-weight: 600; color: #64748b; }
.featured-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.ftag {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.ftag--kudos { background: #fdf4ff; color: #9333ea; border-color: #e9d5ff; }
.featured-byline { font-size: 12px; color: #94a3b8; }

/* ─── Album card ──────────────────────────────────────────────── */
.pub-album-card {}
.album-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.album-card-head .card-label { margin-bottom: 0; }
.album-mgr-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.album-mgr-btn {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1.5px solid #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
  cursor: pointer;
}
.album-mgr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.album-mgr-btn--remove {
  border-color: #fecaca;
  background: #fff;
  color: #dc2626;
}
.album-mgr-btn--remove:hover { background: #fef2f2; }
.album-empty-hint {
  padding: 24px 0;
  text-align: center;
  color: #94a3b8;
  font-size: 0.88rem;
}
.visually-hidden-file {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.album-shell {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  gap: 12px;
}
.album-frame {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #0f172a;
  aspect-ratio: 4 / 3;
  max-height: min(56vw, 480px);
  width: 100%;
}
.album-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
  transition: opacity .3s;
}
.album-caption {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 14px 16px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(transparent, rgba(2,6,23,.8));
}
.album-nav {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  font-size: 24px;
  color: #374151;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
  transition: background .12s, box-shadow .12s;
}
.album-nav:hover { background: #f8fafc; box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.album-dots {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.album-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #cbd5e1;
  border: none;
  cursor: pointer;
  transition: background .15s, transform .15s;
}
.album-dot.active { background: #1d4ed8; transform: scale(1.35); }

/* ─── Records card ────────────────────────────────────────────── */
.pub-records-card { padding: 16px 16px 12px; }
.pub-records-card .card-label { margin-bottom: 8px; }
.records-list { display: flex; flex-direction: column; }
.record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  min-width: 0;
}
.record-row:last-child { border-bottom: none; }

.record-icon-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  position: relative;
}
.record-icon-placeholder { display: block; width: 36px; height: 36px; }
.record-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 4px;
  display: block;
  transition: transform 0.18s ease;
  cursor: zoom-in;
  position: relative;
  z-index: 0;
}
.record-icon:hover {
  transform: scale(3);
  z-index: 10;
  border-radius: 6px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25);
}
.record-spacer { flex: 0 0 4px; }
.record-label { color: #374151; font-weight: 500; flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.record-value { font-weight: 800; color: #1d4ed8; font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.record-unit { font-weight: 500; font-size: 11px; color: #94a3b8; margin-left: 2px; }
.record-meta { font-size: 11px; color: #64748b; white-space: nowrap; flex-shrink: 0; }

/* ─── Race divisions card ─────────────────────────────────────── */
/* ── Public Race Completion Clubs card ─────────────────────── */
.pub-race-clubs-card { }

.pub-rc-clubs {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pub-rc-club {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  min-width: 0;
  width: 100%;
}

.pub-rc-club-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.pub-rc-club-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 4px;
}

.pub-rc-club-icon-ph {
  font-size: 22px;
  line-height: 1;
}

.pub-rc-club-name {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.pub-rc-members {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  max-height: 220px;
  overflow-y: auto;
}

.pub-rc-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-bottom: 1px solid #f1f5f9;
  min-width: 0;
  overflow: hidden;
}
.pub-rc-member:last-child { border-bottom: none; }

.pub-rc-member-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: default;
}
.pub-rc-member-name--clickable {
  cursor: pointer;
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pub-rc-member-name--clickable:hover {
  color: #1d4ed8;
}

.pub-rc-member-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
  max-width: 50%;
}

.pub-rc-tier-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.pub-rc-member-count {
  font-size: 13px;
  font-weight: 800;
  color: #1d4ed8;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.pub-race-card {}
.race-intro { margin: -6px 0 14px; font-size: 12.5px; color: #94a3b8; }
.race-blocks { display: flex; flex-direction: column; gap: 14px; }
.race-block { border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; }
.race-block--hm { background: #f0fdf4; border-color: #bbf7d0; }
.race-block--marathon { background: #fffbeb; border-color: #fde68a; }
.race-block-head {
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
  border-bottom: 1px solid rgba(0,0,0,.06);
  display: flex;
  align-items: center;
  gap: 6px;
}
.race-block-head small { font-weight: 500; font-size: 11px; color: #6b7280; margin-left: 2px; }
.race-list {
  list-style: none;
  margin: 0; padding: 4px 0;
  max-height: 180px;
  overflow-y: auto;
}
.race-list li {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  font-size: 13px;
  border-bottom: 1px solid rgba(0,0,0,.04);
}
.race-list li:last-child { border-bottom: none; }
.race-name { flex: 1; font-weight: 600; color: #1f2937; }
.race-time { font-variant-numeric: tabular-nums; color: #6b7280; font-size: 12px; }

.season-join-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.btn-season-join {
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
.btn-season-join:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-season-join--outline {
  background: #fff;
  color: #1d4ed8;
  border: 2px solid #93c5fd;
}
.season-join-note {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.pub-events-preview-card {}
.events-preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.events-preview-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: #334155;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f5f9;
}
.events-preview-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.ev-title { font-weight: 700; }
.ev-when { color: #64748b; font-size: 13px; white-space: nowrap; }

/* ─── CTA card ────────────────────────────────────────────────── */
.pub-cta-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%);
  border-radius: 20px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(29,78,216,.25);
  position: relative;
}
.pub-cta-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 80% 50%, rgba(99,102,241,.35) 0%, transparent 65%);
  pointer-events: none;
}
.cta-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
  padding: 48px 44px;
  position: relative;
  z-index: 1;
}
.cta-text { flex: 1; min-width: 260px; }
.cta-eyebrow {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: #93c5fd;
  margin-bottom: 10px;
}
.cta-headline {
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 14px;
}
.cta-body {
  font-size: 14.5px;
  color: rgba(255,255,255,.7);
  line-height: 1.65;
  margin: 0 0 20px;
  max-width: 420px;
}
.cta-perks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.cta-perks li {
  font-size: 13.5px;
  color: rgba(255,255,255,.8);
  display: flex;
  align-items: center;
  gap: 8px;
}
.perk-icon { font-size: 15px; flex-shrink: 0; }
.cta-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  width: min(100%, 420px);
}
.btn-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 15px 36px;
  background: #fff;
  color: #1d4ed8;
  font-size: 15px;
  font-weight: 800;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
  box-shadow: 0 6px 24px rgba(0,0,0,.2);
  transition: transform .15s, box-shadow .15s;
  width: 100%;
  max-width: 100%;
  text-decoration: none;
  line-height: 1.25;
  box-sizing: border-box;
}
.btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(0,0,0,.28); }
.btn-cta--secondary {
  background: rgba(255,255,255,.12);
  color: #fff;
  border: 1.5px solid rgba(255,255,255,.28);
}
.btn-cta--secondary:hover {
  background: rgba(255,255,255,.2);
}
.cta-note { font-size: 12px; color: rgba(255,255,255,.5); margin: 0; }
.cta-note a { color: rgba(255,255,255,.8); text-underline-offset: 3px; }

@media (max-width: 720px) {
  /* ── Compact hero strip on mobile ─────────────────── */
  .pub-hero {
    padding: 16px 16px 20px;
  }
  .pub-hero-inner {
    gap: 12px;
    flex-direction: row;
    align-items: center;
    flex-wrap: nowrap;
  }
  .pub-hero-brand {
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  .pub-logo {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    padding: 4px;
  }
  .pub-club-name {
    font-size: 1.05rem;
    letter-spacing: -0.02em;
  }
  .pub-hero-subtitle {
    margin: 2px 0 0;
    font-size: 0.8rem;
  }
  .pub-hero-tagline {
    font-size: 0.82rem;
  }
  .pub-member-count {
    margin: 4px 0 0;
    font-size: 11px;
  }
  .hero-member-note {
    display: none;
  }
  .hero-actions {
    align-items: stretch;
    width: auto;
    flex-shrink: 0;
  }
  .hero-pending-copy {
    text-align: center;
  }
  .cta-inner {
    padding: 24px 16px;
  }
  .cta-text,
  .cta-actions {
    min-width: 0;
    width: 100%;
  }
  .pub-pending-card-row {
    flex-direction: column;
    align-items: stretch;
  }
}

/* ─── Ghost button ────────────────────────────────────────────── */
.btn-ghost {
  display: inline-flex;
  align-items: center;
  padding: 9px 20px;
  border-radius: 8px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background .12s;
}
.btn-ghost:hover { background: #f8fafc; }

/* ─── Public profile modal (guests clicking race names) ──────── */
.pub-prof-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,.55);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.pub-prof-modal {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,.2);
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
  position: relative;
}
.pub-prof-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  font-size: 22px;
  color: #94a3b8;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}
.pub-prof-close:hover { color: #1e293b; }
.pub-prof-loading, .pub-prof-error {
  text-align: center;
  padding: 24px 0;
  color: #64748b;
}
.pub-prof-top {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid #e2e8f0;
}
.pub-prof-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}
.pub-prof-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.pub-prof-avatar-fallback {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pub-prof-name {
  margin: 0 0 2px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}
.pub-prof-loc { margin: 0; font-size: 12px; color: #64748b; }
.pub-prof-section { margin-bottom: 16px; }
.pub-prof-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 8px;
}
.pub-prof-stats {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.pub-prof-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.pub-prof-stat strong {
  font-size: 1.4rem;
  font-weight: 900;
  color: #1d4ed8;
  line-height: 1;
}
.pub-prof-stat span {
  font-size: 10px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .05em;
}
.pub-prof-badges {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pub-prof-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.pub-prof-badge-icon { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
.pub-prof-badge-emoji { font-size: 22px; flex-shrink: 0; }
.pub-prof-badge-info { display: flex; flex-direction: column; gap: 1px; }
.pub-prof-badge-name { font-size: 13px; font-weight: 700; color: #1e293b; }
.pub-prof-badge-count { font-size: 11px; color: #64748b; }
.pub-prof-records { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.pub-prof-record {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 10px;
  background: #fffbeb;
  border-radius: 6px;
  border: 1px solid #fde68a;
}
.pub-prof-record-trophy { flex-shrink: 0; }
.pub-prof-record-label { flex: 1; font-weight: 600; color: #1e293b; }
.pub-prof-record-value { font-weight: 700; color: #92400e; }
.pub-prof-no-trophies { font-size: 13px; color: #94a3b8; text-align: center; padding: 8px 0; }
.pub-prof-signin-hint {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}
.pub-prof-signin-hint a { color: #2563eb; text-decoration: none; font-weight: 600; }
</style>
