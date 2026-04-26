<template>
  <div class="container">
    <div class="club-settings-header">
      <h1>Club Settings</h1>
      <p>Simple controls for your club brand and billing.</p>
    </div>

    <div v-if="loading" class="loading">Loading club settings...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="cards-grid">
      <section class="settings-card">
        <div class="card-header">
          <h2>Club Identity</h2>
          <p>Logo, icon, and colors used in your club portal.</p>
        </div>

        <div class="field">
          <label>Logo input method</label>
          <div class="mode-row">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: logoInputMethod === 'url' }"
              @click="logoInputMethod = 'url'"
            >
              URL
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: logoInputMethod === 'upload' }"
              @click="logoInputMethod = 'upload'"
            >
              Upload
            </button>
          </div>
        </div>

        <div v-if="logoInputMethod === 'url'" class="field">
          <label>Logo URL</label>
          <input v-model="form.logoUrl" type="url" placeholder="https://example.com/logo.png" />
        </div>

        <div v-else class="field">
          <label>Upload logo</label>
          <input
            ref="logoInputRef"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
            @change="onUploadLogo"
          />
          <div v-if="uploadingLogo" class="hint">Uploading logo...</div>
          <div class="hint">Recommended: square image, 256x256 or larger.</div>
        </div>

        <div v-if="resolvedLogoUrl" class="logo-preview">
          <img :src="resolvedLogoUrl" alt="Club logo preview" />
        </div>

        <div class="field">
          <label>Club main icon</label>
          <div class="icon-row">
            <IconSelector v-model="form.iconId" :summit-stats-club-id="currentAgencyId" />
            <button
              v-if="form.iconId"
              type="button"
              class="btn btn-danger btn-sm"
              @click="form.iconId = null"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="colors-grid">
          <div class="field">
            <label>Primary color</label>
            <input v-model="form.primaryColor" type="color" class="color-picker" />
            <input v-model="form.primaryColor" type="text" placeholder="#0f172a" />
          </div>
          <div class="field">
            <label>Secondary color</label>
            <input v-model="form.secondaryColor" type="color" class="color-picker" />
            <input v-model="form.secondaryColor" type="text" placeholder="#1e40af" />
          </div>
        </div>

        <div class="field">
          <label>Club font</label>
          <select v-model="form.fontFamily" class="club-font-select">
            <optgroup label="Web-safe stacks">
              <option v-for="opt in clubFontPresets" :key="`p-${opt.value || '__default'}`" :value="opt.value">
                {{ opt.label }}
              </option>
            </optgroup>
            <optgroup v-if="uploadedFontFamilies.length" label="Uploaded fonts (platform and tenant)">
              <option v-for="name in uploadedFontFamilies" :key="`u-${name}`" :value="familyToCssStack(name)">
                {{ name }}
              </option>
            </optgroup>
            <optgroup v-if="extraFontOption" label="Other">
              <option :value="extraFontOption.value">{{ extraFontOption.label }}</option>
            </optgroup>
          </select>
          <p class="hint">
            Choose a web-safe stack, or fonts uploaded under platform / tenant branding (same library as agency settings). Preview updates after you save.
          </p>
        </div>

        <div class="actions-row">
          <button type="button" class="btn btn-primary" :disabled="savingIdentity" @click="saveIdentity">
            {{ savingIdentity ? 'Saving...' : 'Save Club Identity' }}
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Billing</h2>
          <p>Essential billing details for this club.</p>
        </div>

        <div class="billing-beta-notice" role="status">
          <strong>Free trial (beta)</strong>
          <span>
            Your club is on a complimentary beta account. No subscription or card is required right now.
            When paid billing goes live, you will configure payment methods and invoices here.
          </span>
        </div>

        <div v-if="billingError" class="error">{{ billingError }}</div>
        <div v-if="billingLoading" class="hint">Loading billing...</div>

        <div v-else>
          <div class="billing-summary">
            <div><strong>Client payments mode:</strong> {{ billingSettings.clientPaymentsMode || 'not_configured' }}</div>
            <div><strong>Invoice count:</strong> {{ invoices.length }}</div>
            <div><strong>Payment methods:</strong> {{ paymentMethods.length }}</div>
          </div>

          <div class="mini-list">
            <h3>Payment Methods</h3>
            <div v-if="paymentMethods.length === 0" class="hint">No payment methods on file.</div>
            <div v-for="m in paymentMethods.slice(0, 3)" :key="m.id" class="mini-row">
              <span>{{ m.card_brand || m.brand || 'Card' }} •••• {{ m.last4 || '----' }}</span>
              <button
                v-if="!m.isDefault"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="setDefaultPaymentMethod(m.id)"
              >
                Set Default
              </button>
              <span v-else class="pill">Default</span>
            </div>
          </div>

          <div class="mini-list">
            <h3>Recent Invoices</h3>
            <div v-if="invoices.length === 0" class="hint">No invoices yet.</div>
            <div v-for="inv in invoices.slice(0, 5)" :key="inv.id" class="mini-row">
              <span>#{{ inv.id }} - {{ formatCurrency(inv.total_cents ?? inv.totalCents) }}</span>
              <button type="button" class="btn btn-secondary btn-sm" @click="downloadInvoice(inv.id)">
                PDF
              </button>
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-secondary" :disabled="billingLoading" @click="loadBilling">
              Refresh Billing
            </button>
          </div>
        </div>
      </section>

      <!-- ── Announcements & splashes (club-wide) ────────── -->
      <section v-if="currentAgencyId" class="settings-card">
        <div class="card-header">
          <h2>Announcements &amp; splashes</h2>
          <p>
            Banner posts scroll across the top of members&apos; club dashboard. Splashes show once as a full-screen pop-up; members can dismiss or choose &quot;remind me later&quot; (24 hours). Emoji and line breaks are supported in the message.
          </p>
        </div>
        <div v-if="clubAnnouncementsError" class="error">{{ clubAnnouncementsError }}</div>
        <div v-if="clubAnnouncementsLoading" class="hint">Loading announcements…</div>
        <div v-else class="settings-form">
          <div class="field">
            <label>Type</label>
            <select v-model="clubAnnouncementDraft.displayType">
              <option value="announcement">Banner (scrolling line)</option>
              <option value="splash">Splash (one-time pop-up)</option>
            </select>
          </div>
          <div class="field">
            <label>Title (optional)</label>
            <input v-model="clubAnnouncementDraft.title" type="text" maxlength="255" placeholder="Short headline" />
          </div>
          <div class="field">
            <label>Message</label>
            <textarea v-model="clubAnnouncementDraft.message" rows="4" maxlength="1200" placeholder="Your announcement…" />
          </div>
          <div v-if="clubAnnouncementDraft.displayType === 'splash'" class="field">
            <label>Splash image (optional)</label>
            <input
              v-model="clubAnnouncementDraft.splashImageUrl"
              type="url"
              maxlength="512"
              placeholder="https://…"
            />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="club-splash-file-input"
              :disabled="clubSplashUploading"
              @change="onClubAnnouncementSplashFile"
            />
            <p v-if="clubSplashUploading" class="hint">Uploading image…</p>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Starts</label>
              <input v-model="clubAnnouncementDraft.startsAt" type="datetime-local" />
            </div>
            <div class="field">
              <label>Ends</label>
              <input v-model="clubAnnouncementDraft.endsAt" type="datetime-local" />
            </div>
          </div>
          <p class="hint">Announcements must be two weeks or less per post. Members see banners and splashes for this club only.</p>
          <div class="actions-row">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="clubAnnouncementSubmitting || !canSubmitClubAnnouncement"
              @click="postClubAnnouncement"
            >
              {{ clubAnnouncementSubmitting ? 'Posting…' : 'Post to club' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="clubAnnouncementsLoading" @click="loadClubAnnouncementsList">
              Refresh list
            </button>
          </div>
        </div>
        <div v-if="clubAnnouncementsList.length" class="mini-list" style="margin-top: 16px;">
          <h3>Recent &amp; scheduled</h3>
          <div v-for="row in clubAnnouncementsList.slice(0, 12)" :key="row.id" class="mini-row">
            <div>
              <strong>{{ row.display_type === 'splash' ? 'Splash' : 'Banner' }}</strong>
              <span class="hint" style="margin-left: 8px;">{{ formatAnnouncementWindow(row) }}</span>
              <div class="hint" style="margin-top: 4px;">{{ truncateAnnouncement(row.message) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Time Preferences ────────────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>Time Preferences</h2>
          <p>Set the club's home timezone and how times are displayed to members.</p>
        </div>

        <div v-if="timePrefsError" class="error">{{ timePrefsError }}</div>
        <div v-if="timePrefsLoading" class="hint">Loading…</div>

        <div v-else class="settings-form">
          <div class="field">
            <label>Club timezone</label>
            <select v-model="timePrefsForm.timezone">
              <option value="">— Not set (uses season timezone) —</option>
              <optgroup v-for="grp in TIMEZONE_GROUPS" :key="grp.label" :label="grp.label">
                <option v-for="tz in grp.zones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
              </optgroup>
            </select>
            <p class="hint">Season deadlines are shown to members relative to this timezone unless they set their own.</p>
          </div>

          <div class="field">
            <label>Clock format</label>
            <div class="toggle-row">
              <label class="toggle-option" :class="{ active: timePrefsForm.timeFormat === '12h' }">
                <input type="radio" v-model="timePrefsForm.timeFormat" value="12h" hidden />
                12-hour (1:30 PM)
              </label>
              <label class="toggle-option" :class="{ active: timePrefsForm.timeFormat === '24h' }">
                <input type="radio" v-model="timePrefsForm.timeFormat" value="24h" hidden />
                24-hour (13:30)
              </label>
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-primary" :disabled="savingTimePrefs" @click="saveTimePrefs">
              {{ savingTimePrefs ? 'Saving…' : 'Save Time Preferences' }}
            </button>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Club Records</h2>
          <p>Seed starting records. Records are broken automatically — when a submitted workout beats a tracked metric, a verification request appears below for a manager to approve.</p>
        </div>
        <div v-if="recordsError" class="error">{{ recordsError }}</div>

        <div v-if="clubRecords.length === 0" class="hint" style="margin-bottom: 12px;">No records yet. Add your first all-time club record below.</div>

        <div class="cr-cards">
          <div v-for="(record, idx) in clubRecords" :key="record.id || `record-${idx}`" class="cr-card" :class="{ 'cr-card--open': record._open }">

            <!-- Collapsed header — always visible -->
            <button type="button" class="cr-card-toggle" @click="record._open = !record._open">
              <div class="cr-card-toggle-left">
                <span class="cr-toggle-arrow">{{ record._open ? '▼' : '▶' }}</span>
                <span v-if="record.iconId" class="cr-toggle-icon-wrap">
                  <!-- show a tiny icon preview if we have one -->
                  <span class="cr-toggle-icon-ph">🏅</span>
                </span>
                <span class="cr-toggle-label">{{ record.label || 'Untitled record' }}</span>
                <span v-if="record.value != null" class="cr-toggle-value">
                  {{ record.metricKey === 'race_chip_time_seconds' ? getRaceTimeDisplay(record) : record.value }}
                  <span v-if="recordUnitForMetric(record.metricKey) && record.metricKey !== 'race_chip_time_seconds'" class="cr-toggle-unit">{{ recordUnitForMetric(record.metricKey) }}</span>
                </span>
                <span class="cr-toggle-pills">
                  <span v-if="record.activityType" class="cr-mini-pill">{{ record.activityType }}</span>
                  <span v-if="record.terrain" class="cr-mini-pill">{{ record.terrain }}</span>
                  <span v-if="record.gender" class="cr-mini-pill cr-mini-pill--gender">{{ record.gender === 'male' ? 'Men' : 'Women' }}</span>
                </span>
              </div>
              <button type="button" class="cr-remove-btn" title="Remove record" @click.stop="removeRecord(idx)">✕</button>
            </button>

            <!-- Expanded body -->
            <div v-if="record._open" class="cr-card-body">
              <!-- Icon + label -->
              <div class="cr-card-head" style="border-bottom:none;padding-bottom:0;">
                <div class="cr-icon-slot">
                  <IconSelector
                    v-model="record.iconId"
                    :summit-stats-club-id="currentAgencyId"
                    :context="`club-record-${currentAgencyId || 'none'}-${idx}`"
                  />
                </div>
                <input v-model="record.label" type="text" placeholder="Record name (e.g. Longest Road Run)" class="cr-label-input" />
              </div>

              <!-- Metric + value -->
              <div class="cr-row">
                <div class="cr-field">
                  <label class="cr-field-label">Metric</label>
                  <select v-model="record.metricKey" class="cr-select">
                    <option value="">— Select metric —</option>
                    <optgroup label="Individual">
                      <option v-for="opt in recordMetricOptions.filter(o => o.group === 'Individual')" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </optgroup>
                    <optgroup label="Team">
                      <option v-for="opt in recordMetricOptions.filter(o => o.group === 'Team')" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </optgroup>
                    <optgroup label="Club-Wide">
                      <option v-for="opt in recordMetricOptions.filter(o => o.group === 'Club')" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </optgroup>
                  </select>
                </div>
                <div class="cr-field cr-field--sm">
                  <label class="cr-field-label">Current record value</label>
                  <div v-if="record.metricKey === 'race_chip_time_seconds'" class="cr-value-wrap">
                    <input
                      :value="getRaceTimeDisplay(record)"
                      type="text"
                      placeholder="H:MM:SS or M:SS"
                      class="cr-input"
                      @change="e => setRaceTimeFromInput(record, e.target.value)"
                    />
                    <span class="cr-unit-badge">time</span>
                  </div>
                  <div v-else class="cr-value-wrap">
                    <input v-model.number="record.value" type="number" step="0.01" placeholder="0" class="cr-input" />
                    <span v-if="recordUnitForMetric(record.metricKey)" class="cr-unit-badge">{{ recordUnitForMetric(record.metricKey) }}</span>
                  </div>
                </div>
              </div>

              <!-- Lower-is-better + race distance -->
              <div v-if="recordLowerIsBetter(record.metricKey)" class="cr-row">
                <div class="cr-filter-pill cr-filter-pill--speed">⚡ Lower is better — fastest time wins</div>
              </div>
              <div v-if="record.metricKey === 'race_chip_time_seconds'" class="cr-row">
                <div class="cr-field">
                  <label class="cr-field-label">Race distance <span class="cr-optional">(filters to matching races)</span></label>
                  <select v-model="record.raceDistance" class="cr-select">
                    <option :value="null">Any race distance</option>
                    <option :value="1">1 Mile</option>
                    <option :value="3.107">5K (3.107 mi)</option>
                    <option :value="6.214">10K (6.214 mi)</option>
                    <option :value="9.321">15K (9.321 mi)</option>
                    <option :value="13.109">Half Marathon (13.109 mi)</option>
                    <option :value="26.219">Marathon (26.219 mi)</option>
                    <option :value="31.069">50K (31.069 mi)</option>
                    <option :value="50">50 Mile</option>
                    <option :value="62.137">100K (62.137 mi)</option>
                    <option :value="100">100 Mile</option>
                  </select>
                </div>
              </div>

              <!-- Filters -->
              <div class="cr-row">
                <div class="cr-field">
                  <label class="cr-field-label">Activity type <span class="cr-optional">(filter)</span></label>
                  <select v-model="record.activityType" class="cr-select">
                    <option value="">Any activity</option>
                    <option value="Run">Run</option>
                    <option value="Walk">Walk</option>
                    <option value="Bike">Bike / Ride</option>
                    <option value="Swim">Swim</option>
                    <option value="Workout">Workout</option>
                    <option value="Hike">Hike</option>
                  </select>
                </div>
                <div class="cr-field">
                  <label class="cr-field-label">Terrain <span class="cr-optional">(filter)</span></label>
                  <select v-model="record.terrain" class="cr-select">
                    <option value="">Any terrain</option>
                    <option value="Road">Road</option>
                    <option value="Trail">Trail</option>
                    <option value="Track">Track</option>
                    <option value="Treadmill">Treadmill</option>
                    <option value="Beach">Beach</option>
                    <option value="Indoor">Indoor</option>
                  </select>
                </div>
              </div>

              <!-- Gender filter -->
              <div class="cr-row">
                <div class="cr-field cr-field--sm">
                  <label class="cr-field-label">Gender <span class="cr-optional">(filter)</span></label>
                  <select v-model="record.gender" class="cr-select">
                    <option value="">Open (any gender)</option>
                    <option v-if="clubAvailableGenders.includes('male')" value="male">Men</option>
                    <option v-if="clubAvailableGenders.includes('female')" value="female">Women</option>
                    <template v-if="!clubAvailableGenders.length">
                      <option value="male">Men</option>
                      <option value="female">Women</option>
                    </template>
                  </select>
                </div>
              </div>

              <!-- Filter summary pill -->
              <div v-if="record.activityType || record.terrain || record.gender" class="cr-filter-pill">
                Matches: <strong>{{ record.activityType || 'Any activity' }}</strong>
                <template v-if="record.terrain"> · <strong>{{ record.terrain }}</strong></template>
                <template v-if="record.gender"> · <strong>{{ record.gender === 'male' ? 'Men' : 'Women' }}</strong></template>
                workouts only
              </div>

              <!-- Record holder -->
              <div class="cr-row">
                <div class="cr-field">
                  <label class="cr-field-label">Holder — link to member <span class="cr-optional">(connects to trophy case)</span></label>
                  <select
                    class="cr-input"
                    :value="record.holderUserId || ''"
                    @change="(e) => {
                      const uid = Number(e.target.value) || null;
                      record.holderUserId = uid;
                      if (uid) {
                        const m = clubMembersForRecords.find(m => m.id === uid);
                        if (m) record.holderName = `${m.firstName} ${m.lastName}`.trim();
                      }
                    }"
                  >
                    <option value="">— Not linked to a member —</option>
                    <option v-for="m in clubMembersForRecords" :key="m.id" :value="m.id">
                      {{ m.displayName }}
                    </option>
                  </select>
                </div>
                <div class="cr-field">
                  <label class="cr-field-label">Holder name <span class="cr-optional">(override or fill manually)</span></label>
                  <input v-model="record.holderName" type="text" placeholder="Who holds this record" class="cr-input" />
                </div>
              </div>
              <div class="cr-row">
                <div class="cr-field cr-field--xs">
                  <label class="cr-field-label">Year <span class="cr-optional">(optional)</span></label>
                  <input v-model.number="record.holderYear" type="number" min="1900" max="2999" step="1" placeholder="2024" class="cr-input" />
                </div>
                <div class="cr-field cr-field--sm">
                  <label class="cr-field-label">Team</label>
                  <input v-model="record.holderTeam" type="text" placeholder="Team name" class="cr-input" />
                </div>
              </div>

              <!-- Notes -->
              <div class="cr-row">
                <div class="cr-field cr-field--full">
                  <label class="cr-field-label">Notes <span class="cr-optional">(optional)</span></label>
                  <input v-model="record.notes" type="text" placeholder="Any additional context" class="cr-input" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="actions-row" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" @click="addRecord">+ Add Record</button>
          <button type="button" class="btn btn-primary" :disabled="savingRecords" @click="saveRecords">
            {{ savingRecords ? 'Saving...' : 'Save Club Records' }}
          </button>
        </div>

        <!-- Pending verifications -->
        <div v-if="recordVerifications.length > 0 || verificationsLoading" class="cr-verifications">
          <h3 class="cr-verif-heading">Pending Record Verifications</h3>
          <div v-if="verificationsLoading" class="hint">Loading…</div>
          <div v-for="v in recordVerifications" :key="`verification-${v.id}`" class="cr-verif-row">
            <div class="cr-verif-info">
              <span class="cr-verif-label">{{ v.record_label }}</span>
              <span class="cr-verif-values">
                {{ Number(v.current_value).toFixed(2) }} → <strong>{{ Number(v.candidate_value).toFixed(2) }}</strong>
              </span>
              <span class="cr-verif-by">by {{ `${v.first_name || ''} ${v.last_name || ''}`.trim() || `User ${v.challenger_user_id}` }}</span>
            </div>
            <div class="cr-verif-actions">
              <button type="button" class="btn btn-primary btn-sm" @click="reviewVerification(v.id, 'approved')">Approve</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="reviewVerification(v.id, 'rejected')">Reject</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Race Completion Clubs ───────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>Race Completion Clubs</h2>
          <p>
            Track how many times members finish each race distance. Award tiered badge icons
            (e.g. 1× club icon, 5× icon, 10× icon). Badges appear in each member's Trophy Case.
          </p>
        </div>
        <div v-if="raceClubsError" class="error">{{ raceClubsError }}</div>

        <div v-if="raceClubs.length === 0" class="hint" style="margin-bottom:12px;">
          No race clubs yet. Add one below for each distance you want to track.
        </div>

        <div class="rc-club-cards">
          <div v-for="(club, ci) in raceClubs" :key="club.id" class="rc-club-card">
            <!-- Header row -->
            <div class="cr-card-head">
              <input v-model="club.label" type="text" placeholder="Club name (e.g. Marathon Club)" class="cr-label-input" />
              <button type="button" class="cr-remove-btn" title="Remove" @click="removeRaceClub(ci)">✕</button>
            </div>

            <!-- Distance + tolerance -->
            <div class="cr-row">
              <div class="cr-field">
                <label class="cr-field-label">Race distance</label>
                <select v-model="club.raceDistanceMiles" class="cr-select">
                  <option :value="null">— Select distance —</option>
                  <option :value="1">1 Mile</option>
                  <option :value="3.107">5K (3.107 mi)</option>
                  <option :value="6.214">10K (6.214 mi)</option>
                  <option :value="9.321">15K (9.321 mi)</option>
                  <option :value="13.109">Half Marathon (13.109 mi)</option>
                  <option :value="26.219">Marathon (26.219 mi)</option>
                  <option :value="31.069">50K (31.069 mi)</option>
                  <option :value="50">50 Mile</option>
                  <option :value="62.137">100K (62.137 mi)</option>
                  <option :value="100">100 Mile</option>
                </select>
              </div>
              <div class="cr-field cr-field--xs">
                <label class="cr-field-label">Tolerance %</label>
                <div class="cr-value-wrap">
                  <input v-model.number="club.tolerancePct" type="number" min="1" max="30" step="1" class="cr-input" />
                  <span class="cr-unit-badge">%</span>
                </div>
              </div>
            </div>

            <!-- Tiers -->
            <div class="rc-tiers-label">Badge Tiers</div>
            <div class="rc-tiers">
              <div v-for="(tier, ti) in club.tiers" :key="ti" class="rc-tier-row">
                <div class="rc-tier-count">
                  <label class="cr-field-label">At</label>
                  <div class="cr-value-wrap">
                    <input v-model.number="tier.count" type="number" min="1" step="1" class="cr-input" style="width:64px" />
                    <span class="cr-unit-badge">×</span>
                  </div>
                </div>
                <div class="rc-tier-icon">
                  <label class="cr-field-label">Icon</label>
                  <IconSelector
                    v-model="tier.iconId"
                    :summit-stats-club-id="currentAgencyId"
                    :context="`race-club-${currentAgencyId}-${ci}-tier-${ti}`"
                  />
                </div>
                <div class="rc-tier-label-field">
                  <label class="cr-field-label">Badge label <span class="cr-optional">(optional)</span></label>
                  <input v-model="tier.label" type="text" :placeholder="`${tier.count}× ${club.label || 'Club'}`" class="cr-input" />
                </div>
                <button type="button" class="cr-remove-btn" @click="removeTier(ci, ti)" title="Remove tier">✕</button>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" @click="addTier(ci)">+ Add Tier</button>
            </div>

            <!-- Members in this club -->
            <div class="rc-members-section">
              <div class="rc-members-header-row">
                <span class="rc-tiers-label" style="margin-bottom:0;">Members</span>
                <button
                  type="button"
                  class="rc-members-toggle-btn"
                  @click="toggleMembersPanel(ci)"
                >
                  {{ club._membersOpen ? 'Hide' : 'Manage members ↓' }}
                </button>
              </div>

              <!-- Current members with counts (always visible summary) -->
              <div v-if="currentMembersForClub(club).length" class="rc-current-members">
                <div
                  v-for="m in currentMembersForClub(club)"
                  :key="m.userId"
                  class="rc-current-member-row"
                >
                  <span :class="['rc-linked-dot', m.linked ? 'rc-linked-dot--linked' : 'rc-linked-dot--unlinked']" :title="m.linked ? 'Has account' : 'No account yet'"></span>
                  <span class="rc-cm-name">{{ m.name }}</span>
                  <span class="rc-cm-breakdown">
                    <span v-if="autoCountForMember(club.id, m.userId)" class="rc-cm-auto" title="Auto-tracked from workouts">{{ autoCountForMember(club.id, m.userId) }} auto</span>
                    <span v-if="m.seedCount" class="rc-cm-seed" title="Manually entered">+{{ m.seedCount }} manual</span>
                  </span>
                  <span class="rc-cm-total">{{ m.total }}×</span>
                  <button type="button" class="rc-cm-edit-btn" @click="openQuickEdit(club, ci, m)" title="Edit count">✎</button>
                </div>
              </div>
              <div v-else-if="!club._membersOpen" class="rc-no-members-hint">
                No completions recorded yet. Use "Manage members" to add past completions.
              </div>

              <!-- Expanded: quick-add + full table -->
              <div v-if="club._membersOpen" class="rc-members-body">
                <div v-if="raceClubMembersLoading" class="hint">Loading members…</div>
                <template v-else>
                  <!-- Quick add / edit form -->
                  <div class="rc-quick-add">
                    <div class="rc-quick-add-tabs">
                      <button
                        type="button"
                        :class="['rc-qa-tab', !club._addNewMode ? 'rc-qa-tab--active' : '']"
                        @click="club._addNewMode = false"
                      >Select existing member</button>
                      <button
                        type="button"
                        :class="['rc-qa-tab', club._addNewMode ? 'rc-qa-tab--active' : '']"
                        @click="club._addNewMode = true"
                      >+ Add someone not in the list</button>
                    </div>

                    <!-- Existing member mode -->
                    <template v-if="!club._addNewMode">
                      <div class="rc-quick-add-title">Set total completions for a member</div>
                      <div class="rc-quick-add-row">
                        <select v-model="club._quickAddUserId" class="cr-select" style="flex:1;">
                          <option :value="null">— Select member —</option>
                          <option v-for="m in allClubMembers" :key="m.userId" :value="m.userId">
                            {{ m.name }}{{ !m.linked ? ' (unlinked)' : '' }}
                          </option>
                        </select>
                        <div class="cr-value-wrap" style="flex:0 0 auto;">
                          <input
                            v-model.number="club._quickAddCount"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            class="cr-input"
                            style="width:72px;"
                          />
                          <span class="cr-unit-badge">total</span>
                        </div>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          :disabled="!club._quickAddUserId"
                          @click="quickAddMember(club)"
                        >Set</button>
                      </div>
                    </template>

                    <!-- New person mode -->
                    <template v-else>
                      <div class="rc-quick-add-title">Enter their name to add them</div>
                      <div class="rc-quick-add-row" style="flex-wrap:wrap;gap:6px;">
                        <input
                          v-model="club._newFirstName"
                          type="text"
                          placeholder="First name or initial *"
                          maxlength="50"
                          class="cr-input"
                          style="flex:1;min-width:80px;"
                        />
                        <input
                          v-model="club._newLastName"
                          type="text"
                          placeholder="Last name *"
                          class="cr-input"
                          style="flex:1;min-width:100px;"
                        />
                        <input
                          v-model="club._newEmail"
                          type="email"
                          placeholder="Email (optional, for linking later)"
                          class="cr-input"
                          style="flex:2;min-width:180px;"
                        />
                        <div class="cr-value-wrap" style="flex:0 0 auto;">
                          <input
                            v-model.number="club._newCount"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="1"
                            class="cr-input"
                            style="width:64px;"
                          />
                          <span class="cr-unit-badge">total</span>
                        </div>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          :disabled="!club._newFirstName || club._creatingPlaceholder"
                          @click="createAndAddPlaceholder(club, ci)"
                        >{{ club._creatingPlaceholder ? 'Adding…' : 'Add' }}</button>
                      </div>
                      <div v-if="club._newError" class="rc-qa-error">{{ club._newError }}</div>
                    </template>

                    <p class="rc-members-hint" style="margin-top:6px;">
                      "Total" is the full count including past and future completions.
                      <span class="rc-linked-dot rc-linked-dot--linked"></span> Linked account &nbsp;
                      <span class="rc-linked-dot rc-linked-dot--unlinked"></span> No account yet
                    </p>
                  </div>

                  <!-- Full table -->
                  <div class="rc-member-table" style="margin-top:10px;">
                    <input
                      v-model="club._memberSearch"
                      type="text"
                      placeholder="Search member…"
                      class="cr-input"
                      style="width:100%;margin-bottom:8px;"
                    />
                    <div class="rc-member-header">
                      <span>Member</span>
                      <span>Auto</span>
                      <span>Manual</span>
                      <span>Total</span>
                    </div>
                    <div
                      v-for="m in filteredClubMembers(club)"
                      :key="m.userId"
                      class="rc-member-row"
                      :class="{ 'rc-member-row--unlinked': !m.linked }"
                    >
                      <span class="rc-member-name">
                        <span :class="['rc-linked-dot', m.linked ? 'rc-linked-dot--linked' : 'rc-linked-dot--unlinked']"></span>
                        {{ m.name }}
                        <span v-if="!m.linked && m.claimEmail" class="rc-claim-email">({{ m.claimEmail }})</span>
                      </span>
                      <span class="rc-member-auto">{{ autoCountForMember(club.id, m.userId) }}</span>
                      <span class="rc-member-seed">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          :value="seedCountForMember(club, m.userId)"
                          @change="setSeedCount(club, m.userId, $event.target.value)"
                          @input="setSeedCount(club, m.userId, $event.target.value)"
                          class="rc-seed-input"
                        />
                      </span>
                      <span class="rc-member-total">
                        {{ autoCountForMember(club.id, m.userId) + seedCountForMember(club, m.userId) }}
                      </span>
                    </div>
                    <div v-if="!filteredClubMembers(club).length" class="hint" style="padding:8px 0;">
                      No members found.
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div class="actions-row" style="margin-top:16px;">
          <button type="button" class="btn btn-secondary" @click="addRaceClub">+ Add Race Club</button>
          <button type="button" class="btn btn-primary" :disabled="savingRaceClubs" @click="saveRaceClubs">
            {{ savingRaceClubs ? 'Saving…' : 'Save Race Clubs' }}
          </button>
        </div>
      </section>

      <!-- ── Team Store ──────────────────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>🛒 Team Store</h2>
          <p>
            Link your club to an external store (e.g. CustomInk, BSNS, Shopify). When enabled, a
            store rail appears on every member's dashboard.
          </p>
        </div>

        <div v-if="storeConfigError" class="error">{{ storeConfigError }}</div>
        <div v-if="storeConfigLoading" class="hint">Loading…</div>

        <div v-else class="store-config-body">
          <div class="field">
            <label class="cap-toggle-label">
              <input v-model="storeForm.enabled" type="checkbox" class="cap-check" />
              Enable team store for members
            </label>
          </div>

          <template v-if="storeForm.enabled">
            <div class="field">
              <label>Store title <span class="cap-opt">(shown to members)</span></label>
              <input
                v-model="storeForm.title"
                type="text"
                class="store-input"
                placeholder="Team Store"
                maxlength="120"
              />
            </div>

            <div class="field">
              <label>Short description <span class="cap-opt">(optional)</span></label>
              <input
                v-model="storeForm.description"
                type="text"
                class="store-input"
                placeholder="Gear up for the season — apparel and accessories."
                maxlength="300"
              />
            </div>

            <div class="field">
              <label>Button label</label>
              <input
                v-model="storeForm.buttonText"
                type="text"
                class="store-input"
                placeholder="Shop Now"
                maxlength="60"
              />
            </div>

            <div class="field">
              <label>External store URL <span class="cap-opt">(full https:// link)</span></label>
              <input
                v-model="storeForm.url"
                type="url"
                class="store-input"
                placeholder="https://your-store.com"
                maxlength="500"
              />
            </div>

            <!-- Live preview -->
            <div v-if="storeForm.url" class="store-preview">
              <div class="store-preview-label">Preview</div>
              <div class="store-preview-rail">
                <div class="store-rail-icon">🛒</div>
                <div class="store-rail-body">
                  <div class="store-rail-title">{{ storeForm.title || 'Team Store' }}</div>
                  <div v-if="storeForm.description" class="store-rail-desc">{{ storeForm.description }}</div>
                </div>
                <a :href="storeForm.url" target="_blank" rel="noopener" class="store-rail-btn">
                  {{ storeForm.buttonText || 'Shop Now' }}
                </a>
              </div>
            </div>
          </template>

          <div class="actions-row" style="margin-top: 12px;">
            <button type="button" class="btn btn-primary" :disabled="savingStoreConfig" @click="saveStoreConfig">
              {{ savingStoreConfig ? 'Saving…' : 'Save Store Settings' }}
            </button>
          </div>
        </div>
      </section>

      <!-- ── Public Club Page ───────────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>🌐 Public Club Page</h2>
          <p>Customize your public-facing club page with a banner, highlights, and a photo slider.</p>
        </div>

        <div v-if="publicPageConfigError" class="error">{{ publicPageConfigError }}</div>
        <div v-if="publicPageConfigLoading" class="hint">Loading…</div>

        <div v-else class="store-config-body">
          <div class="field">
            <label>Public URL slug <span class="cap-opt">(optional)</span></label>
            <input
              v-model="publicPageForm.publicSlug"
              type="text"
              class="store-input"
              placeholder="your-club-name"
              maxlength="64"
            />
            <div class="hint">
              Lowercase letters, numbers, and dashes. If set, your public URL becomes:
              <code>{{ publicPageUrlPreview }}</code>
              Renaming the slug keeps previously shared links working; visitors are sent to the current URL.
            </div>
          </div>

          <div class="field">
            <label>Banner title <span class="cap-opt">(optional)</span></label>
            <input
              v-model="publicPageForm.bannerTitle"
              type="text"
              class="store-input"
              placeholder="Run Together. Rise Together."
              maxlength="120"
            />
          </div>
          <div class="field">
            <label>Banner subtitle <span class="cap-opt">(optional)</span></label>
            <input
              v-model="publicPageForm.bannerSubtitle"
              type="text"
              class="store-input"
              placeholder="Join our community and take on this season's challenge."
              maxlength="220"
            />
          </div>
          <div class="field">
            <label>Banner image <span class="cap-opt">(optional)</span></label>
            <BannerEditor
              :image-url="publicPageForm.bannerImageUrl"
              :focal-x="publicPageForm.bannerFocalX"
              :focal-y="publicPageForm.bannerFocalY"
              :uploading="bannerImageUploading"
              :saving="clubBannerSaving"
              :show-remove="!!publicPageForm.bannerImageUrl"
              upload-label="Upload Banner Image"
              upload-label-replace="Change Banner Image"
              @upload="onClubBannerFile"
              @save-focal="onClubBannerSaveFocal"
              @remove="onClubBannerRemove"
            />
            <input
              v-model="publicPageForm.bannerImageUrl"
              type="url"
              class="store-input"
              placeholder="Or paste an image URL directly"
              maxlength="500"
            />
          </div>

          <div class="field">
            <label class="cap-toggle-label"><input v-model="publicPageForm.showCurrentSeason" type="checkbox" class="cap-check" /> Show current season block</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showActiveParticipants" type="checkbox" class="cap-check" /> Show active participants</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showFeaturedWorkout" type="checkbox" class="cap-check" /> Show featured workout (most kudos this week)</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showPhotoAlbum" type="checkbox" class="cap-check" /> Show sliding photo album</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showClubFeed" type="checkbox" class="cap-check" /> Show club feed on the public club page</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.publicFeedEnabled" type="checkbox" class="cap-check" /> Allow posts to appear on the public club page (members can mark club-wide posts as Public)</label>
          </div>

          <div class="field">
            <label style="font-weight:700;font-size:13px;">Member name display (public roster &amp; directory)</label>
            <div class="cap-radio-group">
              <label class="cap-toggle-label">
                <input type="radio" v-model="publicPageForm.rosterNameFormat" value="full" class="cap-check" />
                Full name (e.g. Joshua Absher)
              </label>
              <label class="cap-toggle-label">
                <input type="radio" v-model="publicPageForm.rosterNameFormat" value="initial_last" class="cap-check" />
                First initial + last name (e.g. J. Absher)
              </label>
            </div>
            <div class="hint">Applies to the public member directory and the active participants list on your club page.</div>
          </div>

          <!-- Gender options for registration form -->
          <div class="field" style="margin-top: 8px;">
            <label style="font-weight: 700; font-size: 13px;">Registration form — gender options</label>
            <div class="hint" style="margin-bottom: 10px;">
              Members can always leave this blank. Only selected options appear in join/profile forms.
            </div>
            <div class="gender-options-list">
              <label
                v-for="opt in BUILT_IN_GENDER_OPTIONS"
                :key="opt.value"
                class="gender-option-row"
              >
                <input
                  type="checkbox"
                  :checked="genderOptionsSelected.includes(opt.value)"
                  @change="toggleBuiltInGender(opt.value)"
                  class="cap-check"
                />
                {{ opt.label }}
              </label>
              <!-- Custom options (non-built-in) -->
              <div
                v-for="val in genderOptionsSelected.filter(v => !isBuiltInGender(v))"
                :key="val"
                class="gender-option-row gender-option-custom"
              >
                <span class="gender-custom-chip">{{ val }}</span>
                <button type="button" class="gender-remove-btn" @click="removeGenderOption(val)">✕</button>
              </div>
            </div>
            <div v-if="!showGenderAddTools" class="gender-add-row">
              <button type="button" class="btn btn-sm btn-secondary" @click="showGenderAddTools = true">Add option</button>
            </div>
            <div v-else class="gender-add-row">
              <input
                v-model="customGenderInput"
                type="text"
                class="store-input"
                style="max-width: 220px;"
                placeholder="Add custom option…"
                maxlength="60"
                @keydown.enter.prevent="addCustomGender"
              />
              <button type="button" class="btn btn-sm" @click="addCustomGender">Add</button>
              <button
                type="button"
                class="btn btn-sm btn-secondary"
                :disabled="allowCustomPronouns"
                @click="enableCustomPronouns"
              >
                {{ allowCustomPronouns ? 'Pronouns enabled' : 'Add pronouns' }}
              </button>
            </div>
            <div v-if="allowCustomPronouns" class="hint">
              Pronouns are enabled for this club. Members can optionally set pronouns in join/profile forms.
            </div>
          </div>

          <div class="field">
            <label>Photo album slides</label>
            <input
              ref="albumUploadInputRef"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
              class="visually-hidden-file"
              multiple
              @change="onAlbumImagesSelected"
            />
            <div class="image-upload-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="albumImagesUploading"
                @click="albumUploadInputRef?.click()"
              >
                {{ albumImagesUploading ? 'Uploading…' : '+ Upload Photos' }}
              </button>
            </div>
            <textarea
              v-model="publicPageAlbumInput"
              rows="5"
              class="store-input"
              style="max-width: 100%; min-height: 110px;"
              placeholder="https://example.com/photo-1.jpg&#10;https://example.com/photo-2.jpg"
            />
            <div v-if="publicPageAlbumPreviewUrls.length" class="album-preview-grid">
              <div v-for="(url, idx) in publicPageAlbumPreviewUrls" :key="`${url}-${idx}`" class="album-preview-item">
                <img :src="url" alt="Album preview" />
                <button type="button" class="album-preview-remove" @click="removeAlbumSlide(idx)">✕</button>
              </div>
            </div>
            <div class="hint">Only manager/captain-uploaded photos appear here. You can also add photos directly from the club's public page. If no photos are uploaded, the album section is hidden.</div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-primary" :disabled="savingPublicPageConfig" @click="savePublicPageConfig">
              {{ savingPublicPageConfig ? 'Saving…' : 'Save Public Page Settings' }}
            </button>
          </div>
        </div>
      </section>

      <!-- ── Club Stats Configuration ───────────────────── -->
      <section class="settings-card stats-config-card">
        <div class="card-header">
          <h2>📊 Club Stats Display</h2>
          <p>
            Choose which stats appear on your club dashboard and public page. Enter historical seed values
            for any stats that were accumulating before this app — they'll be added to everything logged here.
          </p>
        </div>

        <div v-if="statsConfigError" class="error">{{ statsConfigError }}</div>
        <div v-if="statsConfigLoading" class="hint">Loading stats config…</div>

        <div v-else class="stats-config-body">
          <!-- Add stat picker -->
          <div class="stats-add-row" v-if="availableStatsToAdd.length">
            <select v-model="statsPickerSelected" class="stats-picker-select">
              <option value="">+ Add a stat to track…</option>
              <option v-for="s in availableStatsToAdd" :key="s.key" :value="s.key">
                {{ s.icon }} {{ s.label }}{{ s.unit ? ` (${s.unit})` : '' }}
              </option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="addStat" :disabled="!statsPickerSelected">
              Add
            </button>
          </div>

          <!-- Configured stats list -->
          <div class="stats-config-list">
            <div
              v-for="(stat, idx) in statsConfigForm"
              :key="stat.key"
              class="stat-config-row"
              :class="{ 'stat-disabled': !stat.enabled }"
            >
              <div class="stat-config-left">
                <button class="stat-toggle-btn" :title="stat.enabled ? 'Hide stat' : 'Show stat'" @click="stat.enabled = !stat.enabled">
                  <span>{{ stat.enabled ? '👁' : '🚫' }}</span>
                </button>
                <div class="stat-icon-display">
                  <img v-if="stat.iconUrl" :src="stat.iconUrl" alt="" class="stat-icon-img" />
                  <span v-else-if="!stat.iconId">{{ stat.icon }}</span>
                </div>
                <div class="stat-icon-picker">
                  <IconSelector
                    v-model="stat.iconId"
                    :summit-stats-club-id="currentAgencyId"
                    :context="`club-stats-${currentAgencyId || 'none'}-${stat.key}`"
                  />
                </div>
                <div class="stat-config-info">
                  <input
                    v-model="stat.label"
                    class="stat-label-input"
                    type="text"
                    placeholder="Stat label"
                    maxlength="60"
                  />
                  <span class="stat-key-badge">{{ stat.key }}</span>
                </div>
              </div>

              <div class="stat-config-right">
                <div class="stat-seed-field">
                  <label class="stat-seed-label">Historical starting value</label>
                  <div class="stat-seed-row">
                    <input
                      v-model.number="stat.seedValue"
                      type="number"
                      min="0"
                      step="0.1"
                      class="stat-seed-input"
                      placeholder="0"
                    />
                    <span class="stat-unit-badge" v-if="stat.unit">{{ stat.unit }}</span>
                  </div>
                  <div class="stat-value-preview" v-if="stat.liveValue != null">
                    <span class="stat-preview-label">Live from app:</span>
                    <span class="stat-preview-num">{{ formatStatNum(stat.liveValue, stat.key) }} {{ stat.unit }}</span>
                    <span class="stat-preview-sep">→</span>
                    <span class="stat-preview-total">Total: {{ formatStatNum((stat.seedValue || 0) + (stat.liveValue || 0), stat.key) }} {{ stat.unit }}</span>
                  </div>
                </div>
                <div class="stat-order-btns">
                  <button class="order-btn" :disabled="idx === 0" @click="moveStat(idx, -1)" title="Move up">↑</button>
                  <button class="order-btn" :disabled="idx === statsConfigForm.length - 1" @click="moveStat(idx, 1)" title="Move down">↓</button>
                  <button class="order-btn danger" @click="removeStat(idx)" title="Remove">✕</button>
                </div>
              </div>
            </div>

            <div v-if="!statsConfigForm.length" class="hint">
              No stats configured yet. Use the dropdown above to add stats you want to track and display.
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-secondary" @click="loadStatsConfig" :disabled="statsConfigLoading">
              Refresh
            </button>
            <button type="button" class="btn btn-primary" :disabled="savingStatsConfig" @click="saveStatsConfig">
              {{ savingStatsConfig ? 'Saving…' : 'Save Stats Config' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Race Divisions (SSTC-level) -->
      <section class="settings-card">
        <div class="settings-card-header">
          <h2>Race Divisions</h2>
          <p>Assign system icons and enable/disable race distances for all seasons. Seasons inherit these icons as defaults.</p>
        </div>
        <div v-if="rdLoading" class="hint">Loading…</div>
        <div v-else-if="rdError" class="error">{{ rdError }}</div>
        <div v-else>
          <div class="rd-distance-list">
            <div
              v-for="dist in allRaceDistances"
              :key="dist.key"
              class="rd-distance-row"
              :class="{ 'rd-distance-row--off': !rdEnabled.includes(dist.key) }"
            >
              <div class="rd-distance-toggle">
                <label class="rd-toggle-label">
                  <input
                    type="checkbox"
                    :checked="rdEnabled.includes(dist.key)"
                    :disabled="rdLocked"
                    @change="toggleRdKey(dist.key, $event.target.checked)"
                  />
                  <span class="rd-distance-name">
                    <span class="rd-default-emoji">{{ dist.defaultEmoji }}</span>
                    <strong>{{ dist.label }}</strong>
                    <span class="hint" style="font-size:0.78rem;">{{ dist.minMiles }}–{{ dist.maxMiles }} mi</span>
                  </span>
                </label>
              </div>
              <div class="rd-icon-picker" v-if="!rdLocked">
                <IconSelector
                  :modelValue="getRdIconId(dist.key)"
                  :summitStatsClubId="currentAgencyId"
                  :context="`race-div-${dist.key}-${currentAgencyId}`"
                  @update:modelValue="(id) => setRdIcon(dist.key, id)"
                />
              </div>
              <div v-else class="hint rd-locked-hint">🔒 locked</div>
            </div>
          </div>

          <!-- Custom distances added at club level -->
          <div v-if="rdCustomDistances.length" class="rd-custom-section">
            <div class="rd-section-label">Custom Distances</div>
            <div class="rd-distance-list" style="margin-top:6px;">
              <div
                v-for="(cd, idx) in rdCustomDistances"
                :key="cd.key"
                class="rd-distance-row"
                :class="{ 'rd-distance-row--off': !rdEnabled.includes(cd.key) }"
              >
                <label class="rd-toggle-label" style="flex:1;min-width:0;">
                  <input
                    type="checkbox"
                    :checked="rdEnabled.includes(cd.key)"
                    :disabled="rdLocked"
                    @change="toggleRdKey(cd.key, $event.target.checked)"
                  />
                  <span class="rd-distance-name">
                    <span class="rd-default-emoji">{{ cd.defaultEmoji || '🏁' }}</span>
                    <strong>{{ cd.label }}</strong>
                    <span class="hint" style="font-size:0.78rem;">{{ cd.minMiles }}–{{ cd.maxMiles }} mi</span>
                  </span>
                </label>
                <div class="rd-icon-picker" v-if="!rdLocked">
                  <IconSelector
                    :modelValue="getRdIconId(cd.key)"
                    :summitStatsClubId="currentAgencyId"
                    :context="`race-div-${cd.key}-${currentAgencyId}`"
                    @update:modelValue="(id) => setRdIcon(cd.key, id)"
                  />
                </div>
                <button v-if="!rdLocked" type="button" class="btn-remove-icon rd-remove-btn" @click="removeCustomDistance(idx)" title="Remove distance">×</button>
              </div>
            </div>
          </div>

          <!-- Add new custom distance -->
          <div v-if="!rdLocked" class="rd-add-section">
            <div class="rd-section-label">Add Custom Distance</div>
            <div class="rd-add-form">
              <input v-model="rdNewLabel" type="text" class="rd-add-input" placeholder="Label (e.g. 25K)" maxlength="40" />
              <input v-model.number="rdNewMin" type="number" step="0.1" min="0" class="rd-add-input rd-add-input--sm" placeholder="Min mi" />
              <input v-model.number="rdNewMax" type="number" step="0.1" min="0" class="rd-add-input rd-add-input--sm" placeholder="Max mi" />
              <input v-model="rdNewEmoji" type="text" class="rd-add-input rd-add-input--emoji" placeholder="🏁" maxlength="4" />
              <button type="button" class="btn btn-secondary" :disabled="!rdNewLabel || !rdNewMin || !rdNewMax" @click="addCustomDistance">+ Add</button>
            </div>
            <p class="hint" style="font-size:0.78rem;margin-top:4px;">Min/max miles define the range a tagged race must fall within to count for this division.</p>
          </div>

          <div class="form-actions" style="margin-top:16px; gap:8px; flex-wrap:wrap;">
            <template v-if="!rdLocked">
              <button type="button" class="btn btn-primary" :disabled="rdSaving" @click="saveRdConfig">
                {{ rdSaving ? 'Saving…' : 'Save Race Division Settings' }}
              </button>
              <button type="button" class="btn btn-secondary" :disabled="rdSaving" @click="lockRdConfig">
                🔒 Lock Config
              </button>
              <span v-if="rdSaveMsg" style="font-size:0.85rem;color:#16a34a;font-weight:600;">{{ rdSaveMsg }}</span>
            </template>
            <template v-else>
              <p class="hint">🔒 Config is locked. Unlock to edit icons or distances.</p>
              <button type="button" class="btn btn-secondary" :disabled="rdSaving" @click="unlockRdConfig">
                🔓 Unlock Config
              </button>
              <span v-if="rdSaveMsg" style="font-size:0.85rem;color:#16a34a;font-weight:600;">{{ rdSaveMsg }}</span>
            </template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { RACE_DISTANCES } from '../../utils/raceDistances.js';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { TIMEZONE_GROUPS } from '../../utils/timezones.js';
import { useSummitStatsChallengeChrome } from '../../composables/useSummitStatsChallengeChrome';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import IconSelector from '../../components/admin/IconSelector.vue';
import BannerEditor from '../../components/ui/BannerEditor.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const isSsc = useSummitStatsChallengeChrome();

const isAffiliationOrg = (a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation';

/**
 * Summit club APIs key off the affiliation (club) agency id. If currentAgency is the platform tenant,
 * localStorage, or org switcher left a non-affiliation selected, records/time prefs return 404 / 403.
 */
const resolveClubAgencyForSettings = () => {
  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  const affiliations = list.filter(isAffiliationOrg);
  if (!affiliations.length) return null;

  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  const currentId = Number(current?.id || 0);
  if (current && isAffiliationOrg(current) && affiliations.some((x) => Number(x.id) === currentId)) {
    return current;
  }

  const routeSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (routeSlug) {
    const bySlug = affiliations.find(
      (x) => String(x.slug || x.portal_url || x.portalUrl || '').trim().toLowerCase() === routeSlug
    );
    if (bySlug) return bySlug;
  }

  const qClub = Number(route.query?.clubId || route.query?.club || 0);
  if (qClub && affiliations.some((x) => Number(x.id) === qClub)) {
    return affiliations.find((x) => Number(x.id) === qClub) || null;
  }

  return affiliations[0] || null;
};

const loading = ref(true);
const error = ref('');
const savingIdentity = ref(false);
const uploadingLogo = ref(false);
const logoInputRef = ref(null);
const logoInputMethod = ref('url');

const billingLoading = ref(false);
const billingError = ref('');
const billingSettings = ref({});
const paymentMethods = ref([]);
const invoices = ref([]);
const clubRecords = ref([]);
const clubAvailableGenders = ref([]);  // ['male','female'] — loaded from club member profiles
const recordsError = ref('');
const savingRecords = ref(false);
const clubMembersForRecords = ref([]); // { id, firstName, lastName, displayName } for holder dropdown
const recordVerifications = ref([]);
const verificationsLoading = ref(false);
const recordMetricOptions = [
  // ── Individual records ──────────────────────────────────────────────────
  { group: 'Individual',
    value: 'distance_miles',                label: 'Longest Single Run/Workout (miles)',     unit: 'miles',   lowerIsBetter: false },
  { group: 'Individual',
    value: 'weekly_distance_miles',         label: 'Most Miles by One Person in a Week',    unit: 'miles',   lowerIsBetter: false },
  { group: 'Individual',
    value: 'monthly_distance_miles',        label: 'Most Miles by One Person in a Month',   unit: 'miles',   lowerIsBetter: false },
  { group: 'Individual',
    value: 'duration_minutes',              label: 'Longest Single Workout (minutes)',       unit: 'minutes', lowerIsBetter: false },
  { group: 'Individual',
    value: 'season_distance_miles',         label: 'Most Miles by One Person (full season)', unit: 'miles',   lowerIsBetter: false },
  { group: 'Individual',
    value: 'points',                        label: 'Most Points in One Workout',             unit: 'points',  lowerIsBetter: false },
  { group: 'Individual',
    value: 'race_chip_time_seconds',        label: 'Fastest Race Time (chip seconds)',       unit: 'seconds', lowerIsBetter: true  },
  // ── Team records ────────────────────────────────────────────────────────
  { group: 'Team',
    value: 'team_weekly_distance_miles',    label: 'Most Team Miles in a Single Week',      unit: 'miles',   lowerIsBetter: false },
  { group: 'Team',
    value: 'team_monthly_distance_miles',   label: 'Most Team Miles in a Single Month',     unit: 'miles',   lowerIsBetter: false },
  { group: 'Team',
    value: 'team_season_distance_miles',    label: 'Most Team Miles in a Season',           unit: 'miles',   lowerIsBetter: false },
  // ── Club-wide records ───────────────────────────────────────────────────
  { group: 'Club',
    value: 'club_season_distance_miles',    label: 'Total Club Miles (all teams, season)',  unit: 'miles',   lowerIsBetter: false },
  { group: 'Club',
    value: 'season_duration_minutes',       label: 'Total Club Duration — All Runs (min)',  unit: 'minutes', lowerIsBetter: false },
];

const form = ref({
  logoUrl: '',
  logoPath: '',
  iconId: null,
  primaryColor: '#0f172a',
  secondaryColor: '#1e40af',
  accentColor: '#f97316',
  fontFamily: ''
});

const clubFontPresets = [
  { value: '', label: 'Default (inherit platform)' },
  { value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', label: 'System UI (sans)' },
  { value: 'Georgia, "Times New Roman", Times, serif', label: 'Georgia (serif)' },
  { value: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif', label: 'Trebuchet / Lucida' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif', label: 'Palatino (serif)' },
  { value: '"Courier New", Courier, monospace', label: 'Courier (monospace)' }
];

const uploadedFontFamilies = ref([]);

/** CSS font-family stack for an uploaded family name (matches /fonts/public resolution). */
const familyToCssStack = (familyName) => {
  const n = String(familyName || '').trim();
  if (!n) return '';
  const escaped = n.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}', sans-serif`;
};

const extraFontOption = computed(() => {
  const cur = String(form.value.fontFamily || '').trim();
  if (!cur) return null;
  const presetVals = clubFontPresets.map((p) => p.value);
  const uploadedVals = uploadedFontFamilies.value.map((name) => familyToCssStack(name));
  if (presetVals.includes(cur) || uploadedVals.includes(cur)) return null;
  const short = cur.length > 56 ? `${cur.slice(0, 56)}…` : cur;
  return { value: cur, label: `Saved font (${short})` };
});

const currentAgency = computed(() => agencyStore.currentAgency?.value || agencyStore.currentAgency || null);
const currentAgencyId = computed(() => Number(currentAgency.value?.id || 0) || null);
const recordUnitForMetric = (metricKey) => {
  const opt = recordMetricOptions.find(o => o.value === metricKey);
  return opt?.unit || '';
};

const recordLowerIsBetter = (metricKey) => {
  const opt = recordMetricOptions.find(o => o.value === metricKey);
  return opt?.lowerIsBetter || false;
};

// Race chip time helpers: convert between total seconds and H:MM:SS / M:SS display
const secondsToTimeStr = (totalSeconds) => {
  const s = Math.round(Number(totalSeconds) || 0);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const timeStrToSeconds = (str) => {
  const parts = String(str || '').trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1 && parts[0] > 0) return parts[0];
  return null;
};
const getRaceTimeDisplay = (record) => secondsToTimeStr(record.value);
const setRaceTimeFromInput = (record, val) => {
  const secs = timeStrToSeconds(val);
  record.value = secs != null ? secs : record.value;
};

const normalizedHex = (raw, fallback) => {
  const src = String(raw || '').trim();
  if (!src) return fallback;
  const prefixed = src.startsWith('#') ? src : `#${src}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(prefixed)) return prefixed.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(prefixed)) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`.toUpperCase();
  }
  return fallback;
};

const resolvedLogoUrl = computed(() => {
  if (logoInputMethod.value === 'upload' && form.value.logoPath) return toUploadsUrl(form.value.logoPath);
  return String(form.value.logoUrl || '').trim() || null;
});

const orgTo = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
};

const hydrateIdentity = async () => {
  if (!currentAgencyId.value) return;
  const { data } = await api.get(`/agencies/${currentAgencyId.value}`);
  const palette = data?.color_palette
    ? (typeof data.color_palette === 'string' ? JSON.parse(data.color_palette) : data.color_palette)
    : {};
  form.value = {
    logoUrl: data?.logo_url || '',
    logoPath: data?.logo_path || '',
    iconId: data?.icon_id ?? null,
    primaryColor: palette?.primary || '#0f172a',
    secondaryColor: palette?.secondary || '#1e40af',
    accentColor: palette?.accent || '#f97316',
    fontFamily: palette?.fontFamily != null && palette?.fontFamily !== undefined ? String(palette.fontFamily) : ''
  };
  logoInputMethod.value = form.value.logoPath ? 'upload' : 'url';

  const tenantId = Number(data?.affiliated_agency_id || 0) || null;
  try {
    const params = tenantId ? { agencyId: tenantId } : {};
    const res = await api.get('/fonts/families', { params, skipAuthRedirect: true });
    uploadedFontFamilies.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    uploadedFontFamilies.value = [];
  }
};

const saveIdentity = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingIdentity.value = true;
    error.value = '';
    const colorPalette = {
      primary: normalizedHex(form.value.primaryColor, '#0F172A'),
      secondary: normalizedHex(form.value.secondaryColor, '#1E40AF'),
      accent: normalizedHex(form.value.accentColor, '#F97316')
    };
    if (String(form.value.fontFamily || '').trim()) {
      colorPalette.fontFamily = String(form.value.fontFamily).trim();
    } else {
      colorPalette.fontFamily = null;
    }
    const payload = {
      logoUrl: logoInputMethod.value === 'url' ? (form.value.logoUrl?.trim() || null) : null,
      logoPath: logoInputMethod.value === 'upload' ? (form.value.logoPath || null) : null,
      iconId: form.value.iconId ?? null,
      colorPalette
    };
    await api.put(`/agencies/${currentAgencyId.value}`, payload);
    await hydrateIdentity();
    await agencyStore.fetchUserAgencies();
    try {
      // syncDocumentThemeFromSelectedAgency bails out when the club slug differs from the
      // route slug (e.g. route is /ssc but currentAgency is the affiliation club). Call
      // applyTheme directly so font and colors are applied immediately after saving.
      const ag = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
      const orgType = String(ag?.organization_type || '').toLowerCase();
      const parentTenantId = Number(ag?.affiliated_agency_id || 0) || null;
      const fontBrandingAgencyId =
        orgType === 'affiliation' && parentTenantId ? parentTenantId : (ag?.id ?? currentAgencyId.value);
      brandingStore.applyTheme({
        colorPalette,
        themeSettings: {},
        brandingAgencyId: fontBrandingAgencyId,
        agencyId: currentAgencyId.value
      });
    } catch {
      // non-fatal
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save club identity';
  } finally {
    savingIdentity.value = false;
  }
};

const onUploadLogo = async (event) => {
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP.';
    return;
  }
  try {
    uploadingLogo.value = true;
    error.value = '';
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await api.post('/logos/upload', formData);
    if (data?.success && data?.path) {
      form.value.logoPath = data.path;
      form.value.logoUrl = '';
      logoInputMethod.value = 'upload';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to upload logo';
  } finally {
    uploadingLogo.value = false;
    try {
      if (logoInputRef.value) logoInputRef.value.value = '';
    } catch {
      // ignore
    }
  }
};

const humanizeBillingLoadError = (raw) => {
  const msg = String(raw || '').trim();
  if (!msg) return 'Billing details could not be loaded.';
  if (/mysqld_stmt_execute|ER_WRONG_ARGUMENTS|Incorrect arguments/i.test(msg)) {
    return 'Billing service is temporarily unavailable. Your club remains on the free trial (beta); try Refresh Billing in a moment.';
  }
  return msg;
};

const loadBilling = async () => {
  if (!currentAgencyId.value) return;
  try {
    billingLoading.value = true;
    billingError.value = '';
    const [settingsRes, methodsRes, invoicesRes] = await Promise.all([
      api.get(`/billing/${currentAgencyId.value}/settings`),
      api.get(`/billing/${currentAgencyId.value}/payment-methods`),
      api.get(`/billing/${currentAgencyId.value}/invoices`)
    ]);
    billingSettings.value = settingsRes?.data || {};
    const methodsPayload = methodsRes?.data;
    paymentMethods.value = Array.isArray(methodsPayload?.methods)
      ? methodsPayload.methods
      : (Array.isArray(methodsPayload) ? methodsPayload : []);
    invoices.value = Array.isArray(invoicesRes?.data) ? invoicesRes.data : [];
  } catch (e) {
    billingError.value = humanizeBillingLoadError(
      e?.response?.data?.error?.message || e?.message || 'Failed to load billing'
    );
  } finally {
    billingLoading.value = false;
  }
};

// ── Time Preferences ───────────────────────────────────────
const timePrefsLoading = ref(false);
const timePrefsError   = ref('');
const savingTimePrefs  = ref(false);
const timePrefsForm    = ref({ timezone: '', timeFormat: '12h' });

// ── Team Store Configuration ────────────────────────────────
const storeConfigLoading = ref(false);
const savingStoreConfig  = ref(false);
const storeConfigError   = ref('');
const storeForm = ref({ enabled: false, title: 'Team Store', description: '', buttonText: 'Shop Now', url: '' });
const publicPageConfigLoading = ref(false);
const savingPublicPageConfig = ref(false);
const publicPageConfigError = ref('');
const publicPageAlbumInput = ref('');
const bannerUploadInputRef = ref(null);
const albumUploadInputRef = ref(null);
const bannerImageUploading = ref(false);
const albumImagesUploading = ref(false);
const publicPageForm = ref({
  publicSlug: '',
  bannerTitle: '',
  bannerSubtitle: '',
  bannerImageUrl: '',
  bannerFocalX: 50,
  bannerFocalY: 50,
  showCurrentSeason: true,
  showActiveParticipants: true,
  showFeaturedWorkout: true,
  showPhotoAlbum: true,
  showClubFeed: true,
  publicFeedEnabled: false,
  rosterNameFormat: 'full'
});
const clubBannerSaving = ref(false);

const BUILT_IN_GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' }
];
const genderOptionsSelected = ref(['male', 'female']);
const customGenderInput = ref('');
const showGenderAddTools = ref(false);
const allowCustomPronouns = ref(false);

const toggleBuiltInGender = (value) => {
  const idx = genderOptionsSelected.value.indexOf(value);
  if (idx >= 0) {
    genderOptionsSelected.value.splice(idx, 1);
  } else {
    genderOptionsSelected.value.push(value);
  }
};
const addCustomGender = () => {
  const val = String(customGenderInput.value || '').trim();
  if (!val || genderOptionsSelected.value.includes(val)) { customGenderInput.value = ''; return; }
  genderOptionsSelected.value.push(val);
  customGenderInput.value = '';
};
const enableCustomPronouns = () => {
  allowCustomPronouns.value = true;
};
const removeGenderOption = (value) => {
  genderOptionsSelected.value = genderOptionsSelected.value.filter((v) => v !== value);
};
const isBuiltInGender = (value) => BUILT_IN_GENDER_OPTIONS.some((o) => o.value === value);
const orgSlugForPreview = computed(() => String(route.params?.organizationSlug || '').trim() || 'ssc');
const publicPageUrlPreview = computed(() => {
  const slug = String(publicPageForm.value.publicSlug || '').trim();
  const ref = slug || String(currentAgencyId.value || '');
  if (!ref) return `${window.location.origin}/${orgSlugForPreview.value}/clubs`;
  return `${window.location.origin}/${orgSlugForPreview.value}/clubs/${ref}`;
});

const publicPageAlbumPreviewUrls = computed(() =>
  String(publicPageAlbumInput.value || '')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
);

const uploadPublicPageImage = async (file) => {
  if (!file) return null;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP.');
  }
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await api.post('/logos/upload', formData, {
    skipGlobalLoading: true,
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  if (!data?.success) throw new Error('Upload failed');
  return data?.path ? toUploadsUrl(data.path) : String(data?.url || '').trim();
};

const onBannerImageSelected = async (event) => {
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  await onClubBannerFile(file);
};

const onClubBannerFile = async (file) => {
  if (!file) return;
  try {
    bannerImageUploading.value = true;
    publicPageConfigError.value = '';
    const uploadedUrl = await uploadPublicPageImage(file);
    if (uploadedUrl) {
      publicPageForm.value.bannerImageUrl = uploadedUrl;
      publicPageForm.value.bannerFocalX = 50;
      publicPageForm.value.bannerFocalY = 50;
    }
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || e?.message || 'Failed to upload banner image';
  } finally {
    bannerImageUploading.value = false;
    try {
      if (bannerUploadInputRef.value) bannerUploadInputRef.value.value = '';
    } catch { /* ignore */ }
  }
};

const onClubBannerSaveFocal = async ({ x, y }) => {
  publicPageForm.value.bannerFocalX = x;
  publicPageForm.value.bannerFocalY = y;
  if (!currentAgencyId.value) return;
  clubBannerSaving.value = true;
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/public-page-config`, {
      ...publicPageForm.value,
      bannerFocalX: x,
      bannerFocalY: y
    });
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || 'Failed to save banner position';
  } finally {
    clubBannerSaving.value = false;
  }
};

const onClubBannerRemove = () => {
  publicPageForm.value.bannerImageUrl = '';
  publicPageForm.value.bannerFocalX = 50;
  publicPageForm.value.bannerFocalY = 50;
};

const onAlbumImagesSelected = async (event) => {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  try {
    albumImagesUploading.value = true;
    publicPageConfigError.value = '';
    const uploadedUrls = [];
    for (const file of files) {
      const uploadedUrl = await uploadPublicPageImage(file);
      if (uploadedUrl) uploadedUrls.push(uploadedUrl);
    }
    if (uploadedUrls.length) {
      const next = [...publicPageAlbumPreviewUrls.value, ...uploadedUrls].slice(0, 20);
      publicPageAlbumInput.value = next.join('\n');
    }
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || e?.message || 'Failed to upload album photos';
  } finally {
    albumImagesUploading.value = false;
    try {
      if (albumUploadInputRef.value) albumUploadInputRef.value.value = '';
    } catch {
      // ignore
    }
  }
};

const removeAlbumSlide = (index) => {
  const next = [...publicPageAlbumPreviewUrls.value];
  next.splice(index, 1);
  publicPageAlbumInput.value = next.join('\n');
};

const loadStoreConfig = async () => {
  if (!currentAgencyId.value) return;
  storeConfigLoading.value = true;
  storeConfigError.value   = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/store-config`);
    if (data?.store) storeForm.value = { ...storeForm.value, ...data.store };
  } catch (e) {
    storeConfigError.value = e?.response?.data?.error?.message || 'Failed to load store config';
  } finally {
    storeConfigLoading.value = false;
  }
};

const saveStoreConfig = async () => {
  if (!currentAgencyId.value) return;
  savingStoreConfig.value = true;
  storeConfigError.value  = '';
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/store-config`, storeForm.value);
  } catch (e) {
    storeConfigError.value = e?.response?.data?.error?.message || 'Failed to save store config';
  } finally {
    savingStoreConfig.value = false;
  }
};

const loadPublicPageConfig = async () => {
  if (!currentAgencyId.value) return;
  publicPageConfigLoading.value = true;
  publicPageConfigError.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/public-page-config`);
    const cfg = data?.config || {};
    publicPageForm.value = {
      publicSlug: cfg.publicSlug || '',
      bannerTitle: cfg.bannerTitle || '',
      bannerSubtitle: cfg.bannerSubtitle || '',
      bannerImageUrl: cfg.bannerImageUrl || '',
      bannerFocalX: Number.isFinite(Number(cfg.bannerFocalX)) ? Number(cfg.bannerFocalX) : 50,
      bannerFocalY: Number.isFinite(Number(cfg.bannerFocalY)) ? Number(cfg.bannerFocalY) : 50,
      showCurrentSeason: cfg.showCurrentSeason !== false,
      showActiveParticipants: cfg.showActiveParticipants !== false,
      showFeaturedWorkout: cfg.showFeaturedWorkout !== false,
      showPhotoAlbum: cfg.showPhotoAlbum !== false,
      showClubFeed: cfg.showClubFeed !== false,
      publicFeedEnabled: cfg.publicFeedEnabled === true,
      rosterNameFormat: cfg.rosterNameFormat === 'initial_last' ? 'initial_last' : 'full'
    };
    genderOptionsSelected.value = Array.isArray(cfg.genderOptions) && cfg.genderOptions.length
      ? cfg.genderOptions
      : ['male', 'female'];
    allowCustomPronouns.value = cfg.allowCustomPronouns === true;
    showGenderAddTools.value = false;
    publicPageAlbumInput.value = Array.isArray(cfg.albumSlides)
      ? cfg.albumSlides.map((s) => String(s?.imageUrl || '').trim()).filter(Boolean).join('\n')
      : '';
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || 'Failed to load public page config';
  } finally {
    publicPageConfigLoading.value = false;
  }
};

const savePublicPageConfig = async () => {
  if (!currentAgencyId.value) return;
  savingPublicPageConfig.value = true;
  publicPageConfigError.value = '';
  try {
    const albumSlides = String(publicPageAlbumInput.value || '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((imageUrl) => ({ imageUrl, caption: '' }));
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/public-page-config`, {
      ...publicPageForm.value,
      albumSlides,
      genderOptions: genderOptionsSelected.value.filter(Boolean),
      allowCustomPronouns: allowCustomPronouns.value === true
    });
    await loadPublicPageConfig();
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || 'Failed to save public page config';
  } finally {
    savingPublicPageConfig.value = false;
  }
};

// ── Club Stats Configuration ────────────────────────────────
const statsConfigLoading  = ref(false);
const savingStatsConfig   = ref(false);
const statsConfigError    = ref('');
const statsConfigForm     = ref([]);  // ordered list of stat items (editable)
const availableStatsDefs  = ref([]); // full definition list from API
const statsPickerSelected = ref('');

const availableStatsToAdd = computed(() => {
  const inUse = new Set(statsConfigForm.value.map((s) => s.key));
  return availableStatsDefs.value.filter((d) => !inUse.has(d.key));
});

const formatStatNum = (val, key) => {
  const n = Number(val || 0);
  const decimalKeys = new Set(['total_miles', 'run_miles', 'ruck_miles']);
  return decimalKeys.has(key) ? n.toFixed(1) : Math.round(n).toLocaleString();
};

const loadStatsConfig = async () => {
  if (!currentAgencyId.value) return;
  statsConfigLoading.value = true;
  statsConfigError.value   = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/stats-config`);
    statsConfigForm.value    = Array.isArray(data?.config) ? data.config.map((c) => ({ ...c })) : [];
    availableStatsDefs.value = Array.isArray(data?.availableStats) ? data.availableStats : [];
  } catch (e) {
    statsConfigError.value = e?.response?.data?.error?.message || 'Failed to load stats config';
  } finally {
    statsConfigLoading.value = false;
  }
};

const saveStatsConfig = async () => {
  if (!currentAgencyId.value) return;
  savingStatsConfig.value = true;
  statsConfigError.value  = '';
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/stats-config`, {
      config: statsConfigForm.value.map((s) => ({
        key:       s.key,
        label:     s.label,
        unit:      s.unit,
        icon:      s.icon,
        iconId:    Number.isFinite(Number(s.iconId)) ? Number(s.iconId) : null,
        enabled:   s.enabled,
        seedValue: Number(s.seedValue || 0)
      }))
    });
    await loadStatsConfig(); // reload to get fresh liveValue totals
  } catch (e) {
    statsConfigError.value = e?.response?.data?.error?.message || 'Failed to save stats config';
  } finally {
    savingStatsConfig.value = false;
  }
};

const addStat = () => {
  const key = statsPickerSelected.value;
  if (!key) return;
  const def = availableStatsDefs.value.find((d) => d.key === key);
  if (!def) return;
  statsConfigForm.value.push({
    key:       def.key,
    label:     def.label,
    unit:      def.unit || '',
    icon:      def.icon || '',
    iconId:    null,
    iconUrl:   null,
    enabled:   true,
    seedValue: 0,
    liveValue: 0,
    totalValue: 0
  });
  statsPickerSelected.value = '';
};

const removeStat = (idx) => {
  statsConfigForm.value.splice(idx, 1);
};

const moveStat = (idx, dir) => {
  const arr = statsConfigForm.value;
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
};

const loadTimePrefs = async () => {
  if (!currentAgencyId.value) return;
  timePrefsLoading.value = true;
  timePrefsError.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/time-preferences`);
    timePrefsForm.value = { timezone: data?.timezone || '', timeFormat: data?.timeFormat || '12h' };
  } catch (e) {
    timePrefsError.value = e?.response?.data?.error?.message || 'Failed to load time preferences';
  } finally {
    timePrefsLoading.value = false;
  }
};

const saveTimePrefs = async () => {
  if (!currentAgencyId.value) return;
  savingTimePrefs.value = true;
  timePrefsError.value = '';
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/time-preferences`, {
      timezone:   timePrefsForm.value.timezone || null,
      timeFormat: timePrefsForm.value.timeFormat
    });
  } catch (e) {
    timePrefsError.value = e?.response?.data?.error?.message || 'Failed to save time preferences';
  } finally {
    savingTimePrefs.value = false;
  }
};

const loadClubRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    recordsError.value = '';
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/records`);
    clubRecords.value = Array.isArray(data?.records)
      ? data.records.map((r, idx) => ({
        id: r.id || `record-${Date.now()}-${idx}`,
        label: r.label || '',
        value: r.value ?? null,
        unit: r.unit || '',
        notes: r.notes || '',
        metricKey: r.metricKey || '',
        activityType: r.activityType || '',
        terrain: r.terrain || '',
        gender: r.gender || '',
        raceDistance: r.raceDistance != null ? Number(r.raceDistance) : null,
        holderName: r.holderName || '',
        holderYear: r.holderYear ?? null,
        holderTeam: r.holderTeam || '',
        holderUserId: r.holderUserId != null ? Number(r.holderUserId) : null,
        iconId: r.iconId != null ? Number(r.iconId) : null,
        _open: false
      }))
      : [];
    clubAvailableGenders.value = Array.isArray(data?.availableGenders) ? data.availableGenders : [];
  } catch (e) {
    clubRecords.value = [];
    recordsError.value = e?.response?.data?.error?.message || 'Failed to load club records';
  }
};

const loadClubMembersForRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/members/directory`);
    clubMembersForRecords.value = (Array.isArray(data?.members) ? data.members : []).map((m) => ({
      id: m.id,
      firstName: m.firstName || '',
      lastName: m.lastName || '',
      displayName: m.displayName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || `Member ${m.id}`
    }));
  } catch {
    clubMembersForRecords.value = [];
  }
};

const addRecord = () => {
  clubRecords.value.push({
    id: `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    value: '',
    unit: '',
    notes: '',
    metricKey: '',
    activityType: '',
    terrain: '',
    gender: '',
    raceDistance: null,
    holderName: '',
    holderYear: null,
    holderTeam: '',
    holderUserId: null,
    iconId: null,
    _open: true  // new records open immediately
  });
};

const removeRecord = (idx) => {
  clubRecords.value.splice(idx, 1);
};

const saveRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingRecords.value = true;
    recordsError.value = '';
    const payload = {
      records: clubRecords.value.map((r) => ({
        id: r.id,
        label: String(r.label || '').trim(),
        value: r.value != null ? Number(r.value) : null,
        unit: recordUnitForMetric(r.metricKey),
        notes: String(r.notes || '').trim(),
        metricKey: String(r.metricKey || '').trim() || null,
        activityType: String(r.activityType || '').trim() || null,
        terrain: String(r.terrain || '').trim() || null,
        gender: String(r.gender || '').trim() || null,
        raceDistance: r.raceDistance != null && Number.isFinite(Number(r.raceDistance)) ? Number(r.raceDistance) : null,
        holderName: String(r.holderName || '').trim(),
        holderYear: Number.isFinite(Number(r.holderYear)) ? Math.trunc(Number(r.holderYear)) : null,
        holderTeam: String(r.holderTeam || '').trim(),
        holderUserId: Number.isFinite(Number(r.holderUserId)) && r.holderUserId ? Math.trunc(Number(r.holderUserId)) : null,
        iconId: Number.isFinite(Number(r.iconId)) ? Math.trunc(Number(r.iconId)) : null
      }))
    };
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/records`, payload);
    await Promise.all([loadClubRecords(), loadRecordVerifications()]);
  } catch (e) {
    recordsError.value = e?.response?.data?.error?.message || 'Failed to save club records';
  } finally {
    savingRecords.value = false;
  }
};

const loadRecordVerifications = async () => {
  if (!currentAgencyId.value) return;
  try {
    verificationsLoading.value = true;
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/records/verifications`);
    recordVerifications.value = Array.isArray(data?.verifications)
      ? data.verifications.filter((v) => String(v.status || '').toLowerCase() === 'pending')
      : [];
  } catch {
    recordVerifications.value = [];
  } finally {
    verificationsLoading.value = false;
  }
};

const reviewVerification = async (verificationId, status) => {
  if (!currentAgencyId.value || !verificationId) return;
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/records/verifications/${verificationId}`, { status });
    await Promise.all([loadRecordVerifications(), loadClubRecords()]);
  } catch (e) {
    recordsError.value = e?.response?.data?.error?.message || 'Failed to review verification request';
  }
};

// ── Race Completion Clubs ─────────────────────────────────────────────────────
const raceClubs = ref([]);
const savingRaceClubs = ref(false);
const raceClubsError = ref('');

const newRaceClub = () => ({
  id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: '',
  raceDistanceMiles: null,
  tolerancePct: 5,
  tiers: [{ count: 1, iconId: null, label: '' }],
  manualOverrides: [],
  _membersOpen: false,
  _memberSearch: '',
  _quickAddUserId: null,
  _quickAddCount: null,
  _addNewMode: false,
  _newFirstName: '',
  _newLastName: '',
  _newEmail: '',
  _newCount: 1,
  _newError: '',
  _creatingPlaceholder: false
});

const addRaceClub = () => raceClubs.value.push(newRaceClub());
const removeRaceClub = (ci) => raceClubs.value.splice(ci, 1);
const addTier = (ci) => raceClubs.value[ci].tiers.push({ count: '', iconId: null, label: '' });
const removeTier = (ci, ti) => raceClubs.value[ci].tiers.splice(ti, 1);

const loadRaceClubs = async () => {
  if (!currentAgencyId.value) return;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/race-clubs-config`);
    raceClubs.value = Array.isArray(data?.raceClubs)
      ? data.raceClubs.map((rc) => ({
          id: rc.id,
          label: rc.label || '',
          raceDistanceMiles: rc.raceDistanceMiles || null,
          tolerancePct: rc.tolerancePct || 5,
          tiers: Array.isArray(rc.tiers) ? rc.tiers.map((t) => ({
            count: t.count,
            iconId: t.iconId != null ? Number(t.iconId) : null,
            label: t.label || ''
          })) : [],
          manualOverrides: Array.isArray(rc.manualOverrides) ? rc.manualOverrides.map((o) => ({
            userId: Number(o.userId),
            seedCount: Number(o.seedCount) || 0
          })) : [],
          _membersOpen: false,
          _memberSearch: '',
          _quickAddUserId: null,
          _quickAddCount: null,
          _addNewMode: false,
          _newFirstName: '',
          _newLastName: '',
          _newEmail: '',
          _newCount: 1,
          _newError: '',
          _creatingPlaceholder: false
        }))
      : [];
  } catch { raceClubs.value = []; }
  // Load member counts eagerly so the summary is immediately visible
  await loadRaceClubsMembers();
};

const saveRaceClubs = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingRaceClubs.value = true;
    raceClubsError.value = '';
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/race-clubs-config`, {
      raceClubs: raceClubs.value.map((rc) => ({
        id: rc.id,
        label: String(rc.label || '').trim(),
        raceDistanceMiles: rc.raceDistanceMiles ? Number(rc.raceDistanceMiles) : 0,
        tolerancePct: Number(rc.tolerancePct) || 5,
        tiers: (rc.tiers || []).map((t) => ({
          count: Math.max(1, Math.trunc(Number(t.count) || 1)),
          iconId: t.iconId ? Number(t.iconId) : null,
          label: String(t.label || '').trim()
        })).sort((a, b) => a.count - b.count),
        manualOverrides: (rc.manualOverrides || [])
          .filter((o) => o.userId && o.seedCount > 0)
          .map((o) => ({ userId: Number(o.userId), seedCount: Math.max(0, Math.trunc(Number(o.seedCount) || 0)) }))
      }))
    });
    await loadRaceClubs();
  } catch (e) {
    raceClubsError.value = e?.response?.data?.error?.message || 'Failed to save race clubs';
  } finally {
    savingRaceClubs.value = false;
  }
};

// ── Race Club Member Counts panel ─────────────────────────────────────────────
const raceClubMembersLoading = ref(false);
// allClubMembers: [{userId, name, linked, claimEmail}]
const allClubMembers = ref([]);
// autoCountsByRcId: { [rcId]: { [userId]: count } }
const autoCountsByRcId = ref({});

const loadRaceClubsMembers = async () => {
  if (!currentAgencyId.value) return;
  try {
    raceClubMembersLoading.value = true;
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/race-clubs-members`);
    allClubMembers.value = Array.isArray(data?.members) ? data.members : [];
    autoCountsByRcId.value = data?.autoCountsByRcId || {};
  } catch {
    // Don't wipe existing member data on a transient error — keep whatever was loaded
  } finally {
    raceClubMembersLoading.value = false;
  }
};

const toggleMembersPanel = async (ci) => {
  const club = raceClubs.value[ci];
  club._membersOpen = !club._membersOpen;
  // Reload on open if not yet loaded (eager load in loadRaceClubs handles the normal case)
  if (club._membersOpen && !allClubMembers.value.length) {
    await loadRaceClubsMembers();
  }
};

const filteredClubMembers = (club) => {
  const q = String(club._memberSearch || '').trim().toLowerCase();
  return allClubMembers.value.filter((m) => !q || m.name.toLowerCase().includes(q));
};

const autoCountForMember = (rcId, userId) => {
  const counts = autoCountsByRcId.value[rcId] || {};
  return Number(counts[String(userId)] || 0);
};

const seedCountForMember = (club, userId) => {
  const entry = (club.manualOverrides || []).find((o) => Number(o.userId) === Number(userId));
  return entry ? Number(entry.seedCount) || 0 : 0;
};

const setSeedCount = (club, userId, rawVal) => {
  const val = Math.max(0, Math.trunc(Number(rawVal) || 0));
  if (!club.manualOverrides) club.manualOverrides = [];
  const existing = club.manualOverrides.find((o) => Number(o.userId) === Number(userId));
  if (existing) {
    existing.seedCount = val;
  } else {
    club.manualOverrides.push({ userId: Number(userId), seedCount: val });
  }
};

// Members with any count (auto or manual) for this club — shown in the summary list
const currentMembersForClub = (club) => {
  const autoCounts = autoCountsByRcId.value[club.id] || {};
  const allIds = new Set([
    ...Object.keys(autoCounts).map(Number),
    ...(club.manualOverrides || []).filter(o => o.seedCount > 0).map(o => Number(o.userId))
  ]);
  return [...allIds].map((uid) => {
    const memberInfo = allClubMembers.value.find(m => m.userId === uid) || { userId: uid, name: `Member ${uid}`, linked: false, claimEmail: null };
    const autoCount = Number(autoCounts[String(uid)] || 0);
    const seedCount = seedCountForMember(club, uid);
    return { ...memberInfo, autoCount, seedCount, total: autoCount + seedCount };
  }).filter(m => m.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
};

// Quick-add: set total count for a selected member (auto + seed = total, so seed = total - auto)
const quickAddMember = (club) => {
  const uid = club._quickAddUserId;
  if (!uid) return;
  const total = Math.max(0, Math.trunc(Number(club._quickAddCount) || 0));
  const autoCount = autoCountForMember(club.id, uid);
  const newSeed = Math.max(0, total - autoCount);
  setSeedCount(club, uid, newSeed);
  club._quickAddUserId = null;
  club._quickAddCount = null;
};

// Open quick edit for an existing member — pre-fill the quick-add form
const openQuickEdit = (club, ci, m) => {
  if (!club._membersOpen) toggleMembersPanel(ci);
  club._addNewMode = false;
  club._quickAddUserId = m.userId;
  club._quickAddCount = m.total;
};

// Create a new placeholder member and immediately set their seed count for this club
const createAndAddPlaceholder = async (club, ci) => {
  club._newError = '';
  const firstName = String(club._newFirstName || '').trim();
  const lastName  = String(club._newLastName  || '').trim();
  const email     = String(club._newEmail     || '').trim().toLowerCase() || null;
  const total     = Math.max(1, Math.trunc(Number(club._newCount) || 1));
  if (!firstName) { club._newError = 'First name or initial is required.'; return; }
  if (firstName.length === 1 && !lastName.trim()) { club._newError = 'Last name is required when only an initial is provided.'; return; }
  club._creatingPlaceholder = true;
  try {
    const res = await api.post(`/summit-stats/clubs/${currentAgencyId.value}/race-clubs-placeholder`, {
      firstName, lastName: lastName || '', email
    });
    const member = res.data?.member;
    if (!member?.userId) throw new Error('Unexpected response');

    // Set seed count for this club
    const autoCount = autoCountForMember(club.id, member.userId);
    setSeedCount(club, member.userId, Math.max(0, total - autoCount));

    // Add to local allClubMembers if not already there
    if (!allClubMembers.value.find(m => m.userId === member.userId)) {
      allClubMembers.value = [...allClubMembers.value, member].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Reset form
    club._newFirstName = '';
    club._newLastName  = '';
    club._newEmail     = '';
    club._newCount     = 1;
    club._addNewMode   = false;
  } catch (e) {
    club._newError = e?.response?.data?.error?.message || 'Failed to add member. Please try again.';
  } finally {
    club._creatingPlaceholder = false;
  }
};

const setDefaultPaymentMethod = async (paymentMethodId) => {
  if (!currentAgencyId.value || !paymentMethodId) return;
  try {
    await api.post(`/billing/${currentAgencyId.value}/payment-methods/${paymentMethodId}/default`);
    await loadBilling();
  } catch (e) {
    billingError.value = e?.response?.data?.error?.message || 'Failed to set default payment method';
  }
};

const downloadInvoice = (invoiceId) => {
  if (!invoiceId) return;
  const base = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  window.open(`${base}/api/billing/invoices/${invoiceId}/pdf`, '_blank', 'noopener');
};

const formatCurrency = (cents) => {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};

const clubAnnouncementsLoading = ref(false);
const clubAnnouncementsError = ref('');
const clubAnnouncementsList = ref([]);
const clubAnnouncementSubmitting = ref(false);
const clubSplashUploading = ref(false);
const clubAnnouncementDraft = ref({
  displayType: 'announcement',
  title: '',
  message: '',
  splashImageUrl: '',
  startsAt: '',
  endsAt: ''
});

const toClubLocalDt = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const initClubAnnouncementDraft = () => {
  const now = new Date();
  const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  clubAnnouncementDraft.value = {
    displayType: 'announcement',
    title: '',
    message: '',
    splashImageUrl: '',
    startsAt: toClubLocalDt(now),
    endsAt: toClubLocalDt(in24)
  };
};

initClubAnnouncementDraft();

const canSubmitClubAnnouncement = computed(() => {
  const d = clubAnnouncementDraft.value;
  if (!String(d.message || '').trim()) return false;
  if (!d.startsAt || !d.endsAt) return false;
  const starts = new Date(d.startsAt);
  const ends = new Date(d.endsAt);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) return false;
  return ends.getTime() > starts.getTime();
});

const loadClubAnnouncementsList = async () => {
  if (!currentAgencyId.value) return;
  clubAnnouncementsLoading.value = true;
  clubAnnouncementsError.value = '';
  try {
    const { data } = await api.get(`/agencies/${currentAgencyId.value}/announcements/list`);
    clubAnnouncementsList.value = Array.isArray(data) ? data : [];
  } catch (e) {
    clubAnnouncementsError.value = e?.response?.data?.error?.message || 'Could not load announcements';
    clubAnnouncementsList.value = [];
  } finally {
    clubAnnouncementsLoading.value = false;
  }
};

const onClubAnnouncementSplashFile = async (e) => {
  const file = e.target.files?.[0];
  if (!file || !currentAgencyId.value) return;
  clubSplashUploading.value = true;
  clubAnnouncementsError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post(`/summit-stats/clubs/${currentAgencyId.value}/feed/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipGlobalLoading: true
    });
    if (r.data?.url) clubAnnouncementDraft.value.splashImageUrl = r.data.url;
  } catch (err) {
    clubAnnouncementsError.value = err.response?.data?.error?.message || 'Image upload failed';
  } finally {
    clubSplashUploading.value = false;
    e.target.value = '';
  }
};

const postClubAnnouncement = async () => {
  if (!currentAgencyId.value || clubAnnouncementSubmitting.value || !canSubmitClubAnnouncement.value) return;
  clubAnnouncementSubmitting.value = true;
  clubAnnouncementsError.value = '';
  try {
    const body = {
      title: String(clubAnnouncementDraft.value.title || '').trim() || null,
      message: String(clubAnnouncementDraft.value.message || '').trim(),
      display_type: clubAnnouncementDraft.value.displayType === 'splash' ? 'splash' : 'announcement',
      recipient_user_ids: [],
      audience: 'everyone',
      starts_at: new Date(clubAnnouncementDraft.value.startsAt),
      ends_at: new Date(clubAnnouncementDraft.value.endsAt)
    };
    const splash = String(clubAnnouncementDraft.value.splashImageUrl || '').trim();
    if (splash) body.splash_image_url = splash;
    await api.post(`/agencies/${currentAgencyId.value}/announcements`, body);
    initClubAnnouncementDraft();
    await loadClubAnnouncementsList();
  } catch (e) {
    clubAnnouncementsError.value = e?.response?.data?.error?.message || 'Could not post announcement';
  } finally {
    clubAnnouncementSubmitting.value = false;
  }
};

const formatAnnouncementWindow = (row) => {
  const a = row?.starts_at ? new Date(row.starts_at) : null;
  const b = row?.ends_at ? new Date(row.ends_at) : null;
  if (!a || !b || !Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return '';
  return `${a.toLocaleString()} → ${b.toLocaleString()}`;
};

const truncateAnnouncement = (msg) => {
  const s = String(msg || '').trim().replace(/\s+/g, ' ');
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
};

onMounted(async () => {
  try {
    loading.value = true;
    await agencyStore.fetchUserAgencies();
    if (!isSsc.value) {
      router.replace(orgTo('/admin/settings'));
      return;
    }
    const resolved = resolveClubAgencyForSettings();
    if (resolved) {
      agencyStore.setCurrentAgency(resolved);
    }
    if (!currentAgencyId.value) {
      error.value = 'No club context found for this user.';
      return;
    }
    if (!isAffiliationOrg(currentAgency.value)) {
      error.value =
        'Club settings need a Summit club organization selected. Your account may still be on the platform tenant — pick your club from the organization switcher, then return here.';
      return;
    }
    await Promise.all([
      hydrateIdentity(),
      loadBilling(),
      loadTimePrefs(),
      loadClubRecords(),
      loadClubMembersForRecords(),
      loadRecordVerifications(),
      loadRaceClubs(),
      loadStatsConfig(),
      loadStoreConfig(),
      loadPublicPageConfig(),
      loadRdConfig(),
      loadClubAnnouncementsList()
    ]);
    // Apply the club's palette immediately — syncDocumentThemeFromSelectedAgency bails when
    // the club slug (affiliation) differs from the route slug (tenant, e.g. "ssc").
    try {
      const ag = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
      const orgType = String(ag?.organization_type || '').toLowerCase();
      const parentTenantId = Number(ag?.affiliated_agency_id || 0) || null;
      const fontBrandingAgencyId =
        orgType === 'affiliation' && parentTenantId ? parentTenantId : (ag?.id ?? currentAgencyId.value);
      brandingStore.applyTheme({
        colorPalette: {
          primary: String(form.value.primaryColor || '').trim() || undefined,
          secondary: String(form.value.secondaryColor || '').trim() || undefined,
          accent: String(form.value.accentColor || '').trim() || undefined,
          fontFamily: String(form.value.fontFamily || '').trim() || null
        },
        themeSettings: {},
        brandingAgencyId: fontBrandingAgencyId,
        agencyId: currentAgencyId.value
      });
    } catch {
      // non-fatal
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load club settings';
  } finally {
    loading.value = false;
  }
});

// ── Race Divisions (SSTC-level) ──────────────────────────────────────────────
const allRaceDistances = RACE_DISTANCES;
const rdLoading  = ref(false);
const rdError    = ref('');
const rdSaving   = ref(false);
const rdSaveMsg  = ref('');
const rdEnabled  = ref(RACE_DISTANCES.map((d) => d.key));
const rdIcons    = ref({});
const rdLocked   = ref(false);
const rdCustomDistances = ref([]); // [{ key, label, shortLabel, miles, minMiles, maxMiles, defaultEmoji }]

// Add-new-distance form state
const rdNewLabel = ref('');
const rdNewMin   = ref('');
const rdNewMax   = ref('');
const rdNewEmoji = ref('🏁');

const loadRdConfig = async () => {
  const id = currentAgencyId.value;
  if (!id) return;
  rdLoading.value = true;
  rdError.value = '';
  try {
    const res = await api.get(`/summit-stats/clubs/${id}/race-division-config`);
    const cfg = res.data?.config || {};
    rdEnabled.value          = Array.isArray(cfg.enabledKeys) && cfg.enabledKeys.length ? cfg.enabledKeys : RACE_DISTANCES.map((d) => d.key);
    rdIcons.value            = cfg.emojiOverrides || {};
    rdLocked.value           = !!cfg.locked;
    rdCustomDistances.value  = Array.isArray(cfg.customDistances) ? cfg.customDistances : [];
  } catch (e) {
    rdError.value = e?.response?.data?.error?.message || 'Failed to load.';
  } finally {
    rdLoading.value = false;
  }
};

const toggleRdKey = (key, checked) => {
  const cur = new Set(rdEnabled.value);
  checked ? cur.add(key) : cur.delete(key);
  rdEnabled.value = RACE_DISTANCES.map((d) => d.key).filter((k) => cur.has(k));
};

/** Extract numeric icon ID from 'icon:123' string for IconSelector v-model */
const getRdIconId = (key) => {
  const raw = rdIcons.value[key];
  if (!raw) return null;
  const m = String(raw).match(/^icon:(\d+)$/);
  return m ? Number(m[1]) : null;
};

/** Called by IconSelector emit — store as 'icon:123' or clear if null */
const setRdIcon = (key, iconId) => {
  if (iconId == null || iconId === '' || Number.isNaN(Number(iconId))) {
    const next = { ...rdIcons.value };
    delete next[key];
    rdIcons.value = next;
  } else {
    rdIcons.value = { ...rdIcons.value, [key]: `icon:${Number(iconId)}` };
  }
};

const addCustomDistance = () => {
  const label = rdNewLabel.value.trim();
  const minMi = Number(rdNewMin.value);
  const maxMi = Number(rdNewMax.value);
  if (!label || !minMi || !maxMi || minMi >= maxMi) return;
  const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
  const miles = (minMi + maxMi) / 2;
  const newDist = { key, label, shortLabel: label, miles, minMiles: minMi, maxMiles: maxMi, defaultEmoji: rdNewEmoji.value || '🏁' };
  rdCustomDistances.value = [...rdCustomDistances.value, newDist];
  rdEnabled.value = [...rdEnabled.value, key]; // enable by default
  rdNewLabel.value = '';
  rdNewMin.value = '';
  rdNewMax.value = '';
  rdNewEmoji.value = '🏁';
};

const removeCustomDistance = (idx) => {
  const removed = rdCustomDistances.value[idx];
  rdCustomDistances.value = rdCustomDistances.value.filter((_, i) => i !== idx);
  rdEnabled.value = rdEnabled.value.filter((k) => k !== removed.key);
  const next = { ...rdIcons.value };
  delete next[removed.key];
  rdIcons.value = next;
};

const saveRdConfig = async (lockVal = undefined) => {
  const id = currentAgencyId.value;
  if (!id) return;
  rdSaving.value = true;
  rdSaveMsg.value = '';
  try {
    const body = {
      enabledKeys: rdEnabled.value,
      emojiOverrides: Object.fromEntries(Object.entries(rdIcons.value).filter(([, v]) => v)),
      customDistances: rdCustomDistances.value,
      ...(lockVal !== undefined ? { locked: lockVal } : {})
    };
    const res = await api.put(`/summit-stats/clubs/${id}/race-division-config`, body);
    const cfg = res.data?.config || {};
    rdLocked.value = !!cfg.locked;
    rdSaveMsg.value = lockVal === true ? 'Config locked.' : (lockVal === false ? 'Config unlocked.' : 'Saved!');
    setTimeout(() => { rdSaveMsg.value = ''; }, 3000);
  } catch (e) {
    rdSaveMsg.value = e?.response?.data?.error?.message || 'Save failed.';
  } finally {
    rdSaving.value = false;
  }
};

const lockRdConfig = () => saveRdConfig(true);
const unlockRdConfig = async () => {
  const id = currentAgencyId.value;
  if (!id) return;
  rdSaving.value = true;
  try {
    await api.put(`/summit-stats/clubs/${id}/race-division-config`, {
      enabledKeys: rdEnabled.value,
      emojiOverrides: Object.fromEntries(Object.entries(rdIcons.value).filter(([, v]) => v)),
      customDistances: rdCustomDistances.value,
      locked: false
    });
    rdLocked.value = false;
    rdSaveMsg.value = 'Unlocked!';
    setTimeout(() => { rdSaveMsg.value = ''; }, 2000);
  } catch (e) {
    rdSaveMsg.value = e?.response?.data?.error?.message || 'Unlock failed.';
  } finally {
    rdSaving.value = false;
  }
};

</script>

<style scoped>
.club-settings-header {
  margin-bottom: 20px;
}

.club-settings-header h1 {
  margin: 0;
}

.club-settings-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
}

.cards-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  max-width: 920px;
}

.settings-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 16px;
  box-shadow: var(--shadow);
  position: relative;
  z-index: 0;
  min-width: 0;
}

.card-header h2 {
  margin: 0;
  font-size: 18px;
}

.card-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.field label {
  font-weight: 700;
}

/* ── Toggle-row (12h / 24h picker) ── */
.toggle-row {
  display: flex;
  gap: 8px;
}
.toggle-option {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: #fff;
  transition: background .15s, border-color .15s;
  user-select: none;
}
.toggle-option.active {
  background: var(--primary, #1d4ed8);
  color: #fff;
  border-color: var(--primary, #1d4ed8);
}

.mode-row,
.icon-row,
.actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-row .btn.active {
  border-color: var(--primary);
}

.logo-preview {
  margin-top: 12px;
  width: 88px;
  height: 88px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-alt);
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.colors-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 6px;
}

.color-picker {
  height: 36px;
  padding: 0;
}

.club-font-select {
  width: 100%;
  max-width: 420px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
  font-size: 14px;
}

.billing-beta-notice {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.08);
  color: var(--text-primary, #0f172a);
  font-size: 0.92rem;
  line-height: 1.45;
}
.billing-beta-notice strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text-primary, #0f172a);
}

.billing-summary {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.mini-list {
  margin-top: 14px;
}

.mini-list h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

/* ── Race Completion Clubs ───────────────────── */
.rc-club-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 12px;
}

.rc-club-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rc-tiers-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #475569;
  margin-bottom: -4px;
}

.rc-tiers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.rc-tier-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.rc-tier-count {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
}

.rc-tier-icon {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
}

.rc-tier-label-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 160px;
  min-width: 0;
}

/* ── Race Club Member Counts panel ──────────── */
.rc-members-section {
  border-top: 1px solid #e2e8f0;
  margin-top: 4px;
  padding-top: 8px;
}

.rc-members-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.rc-members-toggle-btn {
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}
.rc-members-toggle-btn:hover { background: #f1f5f9; color: #1d4ed8; border-color: #6366f1; }

/* Current members summary list */
.rc-current-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.rc-current-member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #f1f5f9;
}

.rc-cm-name {
  flex: 1;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rc-cm-breakdown {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.rc-cm-auto {
  font-size: 11px;
  background: #f0fdf4;
  color: #166534;
  border-radius: 999px;
  padding: 1px 6px;
  white-space: nowrap;
}

.rc-cm-seed {
  font-size: 11px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 1px 6px;
  white-space: nowrap;
}

.rc-cm-total {
  font-size: 14px;
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 28px;
  text-align: right;
}

.rc-cm-edit-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  flex-shrink: 0;
}
.rc-cm-edit-btn:hover { color: #6366f1; }

.rc-no-members-hint {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-bottom: 6px;
}

.rc-members-body {
  padding: 8px 0 4px;
}

.rc-members-hint {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
  line-height: 1.6;
}

/* Quick-add form */
.rc-quick-add {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px;
}

.rc-quick-add-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}

.rc-qa-tab {
  background: none;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #0369a1;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.rc-qa-tab:hover { background: #e0f2fe; }
.rc-qa-tab--active {
  background: #0369a1;
  color: #fff;
  border-color: #0369a1;
}

.rc-quick-add-title {
  font-size: 12px;
  font-weight: 700;
  color: #0369a1;
  margin-bottom: 8px;
}

.rc-quick-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.rc-qa-error {
  margin-top: 6px;
  font-size: 12px;
  color: #dc2626;
  font-weight: 600;
}

.rc-linked-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  vertical-align: middle;
  margin-right: 4px;
}
.rc-linked-dot--linked { background: #22c55e; }
.rc-linked-dot--unlinked { background: #f59e0b; }

.rc-member-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.rc-member-header {
  display: grid;
  grid-template-columns: 1fr 56px 80px 56px;
  gap: 8px;
  padding: 6px 10px;
  background: #f1f5f9;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.rc-member-row {
  display: grid;
  grid-template-columns: 1fr 56px 80px 56px;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  border-top: 1px solid #f1f5f9;
  font-size: 13px;
}
.rc-member-row--unlinked { background: #fffbeb; }

.rc-member-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-claim-email {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.rc-member-auto {
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #1d4ed8;
  font-weight: 700;
}

.rc-member-total {
  text-align: center;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.rc-seed-input {
  width: 64px;
  padding: 3px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  font-size: 13px;
  text-align: center;
}
.rc-seed-input:focus {
  outline: none;
  border-color: #6366f1;
}

/* ── Club Records card layout ────────────────── */
.cr-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.cr-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
}

.cr-card--open {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
}

/* Collapsed toggle row */
.cr-card-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.cr-card-toggle:hover { background: #f1f5f9; }

.cr-card-toggle-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.cr-toggle-arrow {
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
  width: 12px;
}

.cr-toggle-icon-ph { font-size: 16px; flex-shrink: 0; }

.cr-toggle-label {
  font-weight: 600;
  font-size: 14px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.cr-toggle-value {
  font-size: 13px;
  font-weight: 700;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  white-space: nowrap;
}

.cr-toggle-unit {
  font-size: 11px;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 2px;
}

.cr-toggle-pills {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

.cr-mini-pill {
  font-size: 10px;
  font-weight: 600;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 999px;
  padding: 1px 6px;
  white-space: nowrap;
}

.cr-mini-pill--gender {
  background: #fce7f3;
  color: #9d174d;
}

/* Expanded body */
.cr-card-body {
  padding: 4px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid #e2e8f0;
}

.cr-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
}

.cr-icon-slot {
  flex: 0 0 auto;
}

.cr-label-input {
  flex: 1 1 0;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 7px 10px;
  background: #fff;
}

.cr-remove-btn {
  flex: 0 0 auto;
  background: none;
  border: 1px solid #fca5a5;
  color: #ef4444;
  border-radius: 6px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
.cr-remove-btn:hover {
  background: #fee2e2;
}

.cr-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.cr-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 160px;
  min-width: 0;
}

.cr-field--sm { flex: 0 1 130px; }
.cr-field--xs { flex: 0 1 90px; }
.cr-field--full { flex: 1 1 100%; }

.cr-field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.cr-optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: #94a3b8;
  font-size: 11px;
}

.cr-input,
.cr-select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 14px;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}

.cr-value-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cr-value-wrap .cr-input {
  flex: 1;
}

.cr-unit-badge {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #e2e8f0;
  border-radius: 4px;
  padding: 3px 7px;
  white-space: nowrap;
}

.cr-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 3px 10px;
  align-self: flex-start;
}

.cr-filter-pill--speed {
  color: #b45309;
  background: #fffbeb;
  border-color: #fde68a;
}

/* Pending verifications */
.cr-verifications {
  margin-top: 20px;
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
}

.cr-verif-heading {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 10px;
}

.cr-verif-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.cr-verif-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cr-verif-label {
  font-weight: 600;
  font-size: 14px;
  color: #1e293b;
}

.cr-verif-values {
  font-size: 13px;
  color: #475569;
}

.cr-verif-by {
  font-size: 12px;
  color: #64748b;
}

.cr-verif-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.pill {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
}

/* ── Team Store ───────────────────────────────────────────── */
.store-config-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.store-input {
  width: 100%;
  max-width: 480px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  background: white;
}
.visually-hidden-file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.image-upload-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.public-image-preview {
  margin-top: 4px;
  width: min(100%, 420px);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #f8fafc;
}
.public-image-preview img {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: cover;
}

/* Gender options configurator */
.gender-options-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.gender-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}
.gender-option-custom {
  gap: 6px;
}
.gender-custom-chip {
  background: #f1f5f9;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}
.gender-remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: #ef4444;
  padding: 0 2px;
  line-height: 1;
}
.gender-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.album-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.album-preview-item {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #f8fafc;
  min-height: 96px;
}
.album-preview-item img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 96px;
  object-fit: cover;
}
.album-preview-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(15, 23, 42, 0.72);
  color: white;
  cursor: pointer;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2, #f1f5f9);
  cursor: pointer;
  font-weight: 600;
  color: var(--text);
}
.store-preview {
  margin-top: 4px;
}
.store-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.store-preview-rail {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 14px 16px;
}
.store-rail-icon {
  font-size: 24px;
  flex-shrink: 0;
}
.store-rail-body {
  flex: 1;
  min-width: 0;
}
.store-rail-title {
  font-weight: 700;
  font-size: 14px;
}
.store-rail-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.store-rail-btn {
  background: var(--primary, #2563eb);
  color: white;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}
.store-rail-btn:hover {
  background: var(--primary-dark, #1d4ed8);
}

/* ── Stats Config ─────────────────────────────────────────── */
.stats-config-card {
  grid-column: 1 / -1; /* full-width on the settings grid */
}
.stats-config-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.stats-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.stats-picker-select {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  background: white;
}
.stats-config-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stat-config-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-secondary, #f8fafc);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  transition: opacity 0.15s;
  overflow: hidden;
}
.stat-config-row.stat-disabled {
  opacity: 0.5;
}
.stat-config-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.stat-toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}
.stat-icon-display {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1.2;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.stat-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.stat-icon-picker {
  flex-shrink: 0;
}
.stat-config-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.stat-label-input {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 600;
  width: 200px;
  max-width: 100%;
}
.stat-key-badge {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-muted, #e8edf2);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: monospace;
  width: fit-content;
}
.stat-config-right {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}
.stat-seed-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-seed-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}
.stat-seed-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-seed-input {
  width: 100px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  text-align: right;
}
.stat-unit-badge {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.stat-value-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-wrap: wrap;
  max-width: 260px;
}
.stat-preview-num   { font-weight: 600; color: var(--text-primary); }
.stat-preview-total { font-weight: 700; color: var(--accent, #2563eb); }
.stat-preview-sep   { color: var(--text-secondary); }
.stat-order-btns {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.order-btn {
  background: var(--bg-muted, #e8edf2);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  line-height: 1.4;
}
.order-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.order-btn.danger { color: #dc2626; }
.order-btn.danger:hover { background: #fee2e2; }

@media (max-width: 720px) {
  .stats-add-row {
    flex-direction: column;
    align-items: stretch;
  }
  .stats-config-list {
    /* Prevent any child from blowing past the screen edge */
    overflow-x: hidden;
    max-width: 100%;
  }
  .stat-config-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    max-width: 100%;
    box-sizing: border-box;
  }
  .stat-config-left {
    width: 100%;
    max-width: 100%;
    flex-wrap: wrap;
    overflow: hidden;
  }
  .stat-config-info {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  .stat-icon-picker {
    /* Prevent Select Icon button from overflowing */
    max-width: calc(100% - 80px);
    overflow: hidden;
  }
  .stat-config-right {
    width: 100%;
    max-width: 100%;
    flex-direction: row;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stat-seed-field {
    flex: 1;
    min-width: 0;
  }
  .stat-label-input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .stat-seed-input {
    width: 80px;
    max-width: 100%;
  }
  .stat-seed-row {
    align-items: center;
  }
  .stat-order-btns {
    flex-direction: row;
    justify-content: flex-end;
    flex-shrink: 0;
  }
  .order-btn {
    min-width: 38px;
    min-height: 36px;
    font-size: 14px;
  }
  .stat-value-preview {
    max-width: 100%;
  }
}

/* Race Divisions */
.rd-distance-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.rd-distance-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  transition: opacity 0.15s;
}
.rd-distance-row:last-child { border-bottom: none; }
.rd-distance-row--off { opacity: 0.45; }
.rd-distance-toggle {
  flex: 1;
  min-width: 0;
}
.rd-toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.rd-distance-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rd-default-emoji { font-size: 1.3rem; line-height: 1; }
.rd-icon-picker { flex-shrink: 0; }
.rd-locked-hint { font-size: 0.78rem; color: #94a3b8; white-space: nowrap; }
.rd-remove-btn {
  background: none;
  border: 1px solid #fca5a5;
  color: #dc2626;
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 1rem;
  cursor: pointer;
  flex-shrink: 0;
}
.rd-remove-btn:hover { background: #fee2e2; }
.rd-section-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.04em;
  margin-top: 16px;
  margin-bottom: 4px;
}
.rd-custom-section, .rd-add-section { margin-top: 12px; }
.rd-add-form {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
}
.rd-add-input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 0.88rem;
  flex: 1;
  min-width: 100px;
}
.rd-add-input--sm { flex: 0 0 80px; min-width: 80px; }
.rd-add-input--emoji { flex: 0 0 60px; min-width: 60px; text-align: center; font-size: 1.1rem; }
</style>
