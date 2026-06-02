<template>
  <div class="edk-root" :style="brandStyle">
    <!-- ── UNLOCK SCREEN ─────────────────────────────────────────────────── -->
    <div v-if="phase === 'unlock'" class="edk-center">
      <div class="edk-card edk-unlock-card">
        <div v-if="branding.orgLogo || branding.agencyLogo" class="edk-logo-wrap">
          <img :src="branding.orgLogo || branding.agencyLogo" alt="Logo" class="edk-logo" />
        </div>
        <h1 class="edk-title">{{ branding.orgName || branding.agencyName || 'Event Check-In' }}</h1>
        <p class="edk-lead muted">Enter the 6-digit event station PIN to get started.</p>
        <div v-if="unlockError" class="error-box">{{ unlockError }}</div>
        <form class="edk-pin-form" @submit.prevent="unlock">
          <label class="edk-lbl" for="edk-pin">Station PIN</label>
          <input
            id="edk-pin"
            v-model="unlockPin"
            class="input edk-pin-input"
            type="password"
            inputmode="numeric"
            maxlength="6"
            placeholder="••••••"
            :disabled="unlockBusy"
            autofocus
          />
          <button type="submit" class="btn btn-primary edk-pin-btn" :disabled="unlockBusy || unlockPin.length !== 6">
            {{ unlockBusy ? 'Verifying…' : 'Continue' }}
          </button>
        </form>
      </div>
    </div>

    <!-- ── LOADING ───────────────────────────────────────────────────────── -->
    <div v-else-if="phase === 'loading'" class="edk-center">
      <p class="muted">Loading event details…</p>
    </div>

    <!-- ── LOAD ERROR ────────────────────────────────────────────────────── -->
    <div v-else-if="phase === 'load-error'" class="edk-center">
      <div class="edk-card">
        <p class="error-box">{{ loadError }}</p>
        <button class="btn btn-secondary" @click="resetToUnlock">Try again</button>
      </div>
    </div>

    <!-- ── MAIN KIOSK UI ─────────────────────────────────────────────────── -->
    <template v-else>
      <!-- Branded header -->
      <header class="edk-header">
        <div class="edk-header-brand">
          <img v-if="branding.orgLogo || branding.agencyLogo" :src="branding.orgLogo || branding.agencyLogo" class="edk-header-logo" alt="Logo" />
          <div>
            <div class="edk-header-org">{{ branding.orgName || branding.agencyName }}</div>
            <div class="edk-header-event">{{ eventContext.title }}</div>
          </div>
        </div>
        <div class="edk-header-right">
          <div class="edk-header-clock">
            <div class="edk-header-clock-time">{{ clockTime }}</div>
            <div class="edk-header-clock-date">{{ clockDate }}</div>
          </div>
          <div class="edk-phase-badge" :class="phaseBadgeClass">
            <span v-if="phase === 'checkin'">Check-In</span>
            <span v-else-if="phase === 'active'">Session Active</span>
            <span v-else-if="phase === 'checkout'">Check-Out</span>
            <span v-else-if="phase === 'done'">Complete</span>
          </div>
        </div>
      </header>

      <!-- ── CHECK-IN PHASE ──────────────────────────────────────────────── -->
      <div v-if="phase === 'checkin'" class="edk-body">
        <div v-if="registrationAvailable" class="edk-walkin-banner">
          <span class="edk-walkin-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h.01"/><path d="M18 14h.01"/><path d="M14 18h.01"/><path d="M18 18h.01"/>
            </svg>
          </span>
          <div class="edk-walkin-copy">
            <strong>Walk-in today?</strong>
            <span class="muted small"> Show parents the registration QR to enroll on site.</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm edk-walkin-qr-btn" @click="openRegistrationQr()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h.01"/><path d="M18 14h.01"/><path d="M14 18h.01"/><path d="M18 18h.01"/>
            </svg>
            Show QR
          </button>
        </div>

        <div class="edk-person-tabs">
          <button type="button" class="edk-person-tab" :class="{ active: personMode === 'client' }" @click="personMode = 'client'">
            <svg class="edk-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Client Check-In
          </button>
          <button type="button" class="edk-person-tab" :class="{ active: personMode === 'employee' }" @click="personMode = 'employee'">
            <svg class="edk-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            Employee Check-In
          </button>
        </div>

        <div v-if="personMode === 'client'" class="edk-panel">
          <div class="edk-roster-head">
            <svg class="edk-roster-head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <span>
              {{ pendingClients.length }} waiting to check in
              <template v-if="absentClients.length"> · {{ absentClients.length }} absent</template>
            </span>
          </div>
          <div v-if="!pendingClients.length" class="edk-empty">
            {{ absentClients.length ? 'Everyone pending is checked in or marked absent.' : 'All clients checked in!' }}
          </div>
          <ul v-else class="edk-person-list">
            <li v-for="c in pendingClients" :key="c.id" class="edk-person-row edk-person-row--stack">
              <div class="edk-person-row-top">
                <div class="edk-row-avatar" aria-hidden="true">{{ initials(c.fullName) || '?' }}</div>
                <div class="edk-person-main">
                  <div class="edk-person-name-line">
                    <span class="edk-person-name">{{ clientDisplayName(c) }}</span>
                    <span v-if="c.identifierCode" class="edk-person-id"> · {{ c.identifierCode }}</span>
                  </div>
                  <span v-if="c.confirmationStatus === 'no'" class="edk-absent-tag">Not attending</span>
                </div>
                <div class="edk-person-actions">
                  <button
                    v-if="canMarkAbsent(c)"
                    type="button"
                    class="btn btn-secondary btn-sm edk-btn-ghost"
                    :disabled="absentSubmitting"
                    @click="openAbsentModal(c)"
                  >
                    Mark absent
                  </button>
                  <button
                    type="button"
                    class="btn edk-btn-checkin"
                    :disabled="checkinOpen && checkinClient?.id === c.id"
                    @click="openCheckin(c)"
                  >
                    {{ checkinOpen && checkinClient?.id === c.id ? '…' : 'Check in' }}
                  </button>
                </div>
              </div>
              <EventKioskLateContactFlow
                v-if="showLateContactForClient(c)"
                :client="normalizeLateContactClient(c)"
                :staff="allStaff"
                :log="lateContactForClient(c.id)"
                :save-url="`${baseUrl(eventId)}/event-day/client-late-contact`"
                :auth-headers="authHeaders()"
                @updated="onLateContactUpdated"
              />
            </li>
          </ul>
          <div v-if="absentClients.length" class="edk-absent-block">
            <h3 class="edk-absent-title">Absent today</h3>
            <ul class="edk-absent-list">
              <li v-for="c in absentClients" :key="`abs-${c.id}`">
                <strong>{{ clientDisplayName(c) }}</strong>
                <span v-if="absenceReasonForClient(c.id)" class="muted small"> · {{ absenceReasonForClient(c.id) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-else class="edk-panel">
          <div class="edk-roster-head">
            <svg class="edk-roster-head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            <span>{{ pendingStaff.length }} waiting to check in</span>
          </div>
          <div v-if="!pendingStaff.length" class="edk-empty">All employees checked in!</div>
          <ul v-else class="edk-person-list">
            <li v-for="s in pendingStaff" :key="s.id" class="edk-person-row">
              <div class="edk-person-row-top">
                <div class="edk-row-avatar" aria-hidden="true">{{ initials(s.displayName) }}</div>
                <div class="edk-person-main">
                  <span class="edk-person-name">{{ s.displayName }}</span>
                </div>
                <button type="button" class="btn edk-btn-checkin" @click="promptEmployeeCheckin(s)">
                  Tap to check in
                </button>
              </div>
            </li>
          </ul>
          <div class="edk-emp-pin-box">
            <p class="edk-emp-pin-lbl">Or enter 4-digit personal PIN:</p>
            <div class="edk-pin-row">
              <input
                v-model="empPin"
                class="input edk-pin-sm"
                type="password"
                inputmode="numeric"
                maxlength="4"
                placeholder="PIN"
                :disabled="empPinBusy"
              />
              <button class="btn btn-primary" :disabled="empPinBusy || empPin.length !== 4" @click="checkinByPin">
                {{ empPinBusy ? '…' : 'Go' }}
              </button>
            </div>
            <p v-if="empPinError" class="edk-err-sm">{{ empPinError }}</p>
          </div>
        </div>

        <!-- Check-In Complete -->
        <div class="edk-footer-action">
          <button class="btn btn-outline edk-phase-btn" @click="startGatePin('to-active')">
            Check-In Complete →
          </button>
        </div>
      </div>

      <!-- ── ACTIVE PHASE ────────────────────────────────────────────────── -->
      <div v-if="phase === 'active'" class="edk-body">
        <div class="edk-active-intro">
          <h2 class="edk-section-title">Checked-In Clients</h2>
          <p class="muted small">Tap a client to view their guardian waiver details.</p>
        </div>

        <div v-if="!checkedInClients.length" class="edk-empty edk-empty-center">No clients checked in yet.</div>

        <div v-else class="edk-client-grid">
          <button
            v-for="c in checkedInClients"
            :key="c.id"
            class="edk-client-tile"
            @click="viewClientWaiver(c)"
          >
            <div class="edk-client-initials">{{ initials(c.fullName) }}</div>
            <div class="edk-client-name">{{ clientDisplayName(c) }}</div>
            <div v-if="c.waiver?.emergencyContacts?.length" class="edk-client-badge">
              {{ c.waiver.emergencyContacts.length }} emergency contact{{ c.waiver.emergencyContacts.length !== 1 ? 's' : '' }}
            </div>
            <div v-else class="edk-client-badge edk-badge-warn">No emergency contacts</div>
            <div v-if="c.waiver?.allergies?.noSnacks" class="edk-client-badge edk-badge-warn">No snacks</div>
            <div v-else-if="waiverApprovedSnacksSummary(c.waiver?.allergies)" class="edk-client-badge">
              Snacks: {{ waiverApprovedSnacksSummary(c.waiver.allergies) }}
            </div>
          </button>
        </div>

        <div class="edk-footer-action">
          <button class="btn btn-outline edk-phase-btn" @click="startGatePin('to-checkout')">
            Begin Check-Out Process →
          </button>
        </div>
      </div>

      <!-- ── CHECK-OUT PHASE ─────────────────────────────────────────────── -->
      <div v-if="phase === 'checkout'" class="edk-body">
        <div class="edk-person-tabs">
          <button type="button" class="edk-person-tab" :class="{ active: personMode === 'client' }" @click="personMode = 'client'">
            <svg class="edk-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            Client Check-Out
          </button>
          <button type="button" class="edk-person-tab" :class="{ active: personMode === 'employee' }" @click="personMode = 'employee'">
            <svg class="edk-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            Employee Check-Out
          </button>
        </div>

        <div v-if="personMode === 'client'" class="edk-panel">
          <div class="edk-roster-head">
            <span>{{ checkedInClients.length }} waiting to check out</span>
          </div>
          <div v-if="!checkedInClients.length" class="edk-empty">All clients checked out!</div>
          <ul v-else class="edk-person-list">
            <li v-for="c in checkedInClients" :key="c.id" class="edk-person-row">
              <div class="edk-person-row-top">
                <div class="edk-row-avatar" aria-hidden="true">{{ initials(c.fullName) }}</div>
                <div class="edk-person-main">
                  <span class="edk-person-name">{{ clientDisplayName(c) }}</span>
                </div>
                <button
                  type="button"
                  class="btn edk-btn-checkin"
                  :disabled="checkingOutClientId === c.id"
                  @click="checkoutClient(c)"
                >
                  {{ checkingOutClientId === c.id ? '…' : 'Check out' }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <div v-else class="edk-panel">
          <div class="edk-roster-head">
            <span>{{ checkedInStaff.length }} waiting to check out</span>
          </div>
          <div v-if="!checkedInStaff.length" class="edk-empty">All employees checked out!</div>
          <ul v-else class="edk-person-list">
            <li v-for="s in checkedInStaff" :key="s.id" class="edk-person-row">
              <div class="edk-person-row-top">
                <div class="edk-row-avatar" aria-hidden="true">{{ initials(s.displayName) }}</div>
                <div class="edk-person-main">
                  <span class="edk-person-name">{{ s.displayName }}</span>
                </div>
                <button
                  type="button"
                  class="btn edk-btn-checkin"
                  :disabled="checkingOutUserId === s.id"
                  @click="checkoutEmployee(s)"
                >
                  {{ checkingOutUserId === s.id ? '…' : 'Check out' }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <div class="edk-footer-action">
          <button class="btn btn-outline edk-phase-btn" @click="startGatePin('to-done')">
            Check-Out Complete →
          </button>
        </div>
      </div>

      <!-- ── DONE PHASE ──────────────────────────────────────────────────── -->
      <div v-if="phase === 'done'" class="edk-body edk-done-body">
        <div class="edk-done-card">
          <div class="edk-done-icon">✓</div>
          <h2>Event Day Complete</h2>
          <p class="muted">All check-in and check-out records have been saved for <strong>{{ eventContext.title }}</strong>.</p>
          <p class="muted small">This kiosk session will reset in {{ countdownSec }}s or you can do it now.</p>
          <button class="btn btn-primary" @click="resetToUnlock">Reset Kiosk</button>
        </div>
      </div>
    </template>

    <!-- ── GATE PIN MODAL ────────────────────────────────────────────────── -->
    <div v-if="gatePinModal" class="edk-modal-overlay" @click.self="cancelGatePin">
      <div class="edk-modal">
        <h3 class="edk-modal-title">
          {{ gatePinIntent === 'to-active' ? 'Confirm Check-In Complete' : gatePinIntent === 'to-checkout' ? 'Begin Check-Out' : 'Confirm Check-Out Complete' }}
        </h3>
        <p class="muted small">Re-enter the 6-digit event PIN to confirm this transition.</p>
        <div v-if="gatePinError" class="error-box">{{ gatePinError }}</div>
        <div class="edk-pin-row edk-modal-pin">
          <input
            v-model="gatePinValue"
            class="input edk-pin-input"
            type="password"
            inputmode="numeric"
            maxlength="6"
            placeholder="••••••"
            :disabled="gatePinBusy"
            autofocus
          />
          <button class="btn btn-primary" :disabled="gatePinBusy || gatePinValue.length !== 6" @click="confirmGatePin">
            {{ gatePinBusy ? '…' : 'Confirm' }}
          </button>
        </div>
        <button class="btn btn-link edk-modal-cancel" @click="cancelGatePin">Cancel</button>
      </div>
    </div>

    <EventKioskCheckinWizard
      :open="checkinOpen"
      :client="checkinClient"
      :sheet-url="checkinSheetUrl"
      :waiver-url="checkinWaiverUrl"
      :checkin-url="checkinPostUrl"
      :auth-headers="authHeaders"
      :snack-options="eventContext.snackOptions || []"
      :display-name="clientDisplayName"
      @close="closeCheckin"
      @checked-in="onCheckinComplete"
      @sheet-updated="applyCheckinSheetToClient"
    />

    <div v-if="absentOpen" class="edk-modal-overlay" @click.self="closeAbsentModal">
      <div class="edk-modal edk-waiver-modal">
        <header class="edk-waiver-hdr">
          <div>
            <h3 class="edk-modal-title">Mark {{ clientDisplayName(absentClient) }} absent today</h3>
            <p class="muted small">Family confirmed they are not attending this session.</p>
          </div>
          <button class="btn btn-text" @click="closeAbsentModal">Close</button>
        </header>

        <div v-if="absentError" class="error-box">{{ absentError }}</div>

        <label class="edk-field-lbl">Reason</label>
        <select v-model="absentReasonCode" class="input">
          <option v-for="r in absenceReasonOptions" :key="r.code" :value="r.code">{{ r.label }}</option>
        </select>

        <label v-if="absentReasonCode === 'other'" class="edk-field-lbl">Details</label>
        <textarea
          v-if="absentReasonCode === 'other'"
          v-model="absentReasonNotes"
          class="input"
          rows="3"
          maxlength="400"
          placeholder="Briefly describe why they are absent today"
        />

        <label v-else class="edk-field-lbl">Additional notes (optional)</label>
        <textarea
          v-if="absentReasonCode !== 'other'"
          v-model="absentReasonNotes"
          class="input"
          rows="2"
          maxlength="400"
          placeholder="Optional context for staff"
        />

        <div class="edk-modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeAbsentModal">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canSubmitAbsent || absentSubmitting"
            @click="confirmAbsent"
          >
            {{ absentSubmitting ? 'Saving…' : 'Mark absent today' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── WAIVER DETAIL MODAL ───────────────────────────────────────────── -->
    <div v-if="waiverModal" class="edk-modal-overlay" @click.self="closeWaiverModal">
      <div class="edk-modal edk-waiver-modal">
        <div class="edk-waiver-header">
          <div class="edk-waiver-initials">{{ initials(selectedClient?.fullName) }}</div>
          <div>
            <h3 class="edk-modal-title">{{ clientDisplayName(selectedClient) }}</h3>
            <p class="muted small" v-if="selectedClient?.guardianName">Guardian: {{ selectedClient.guardianName }}{{ selectedClient.guardianEmail ? ` · ${selectedClient.guardianEmail}` : '' }}</p>
            <p class="muted small" v-if="selectedClient?.waiverUpdatedAt">Waiver updated: {{ fmtDate(selectedClient.waiverUpdatedAt) }}</p>
          </div>
        </div>

        <!-- Emergency Contacts -->
        <section class="edk-waiver-section">
          <h4 class="edk-waiver-section-title">Emergency Contacts</h4>
          <div v-if="!selectedClient?.waiver?.emergencyContacts?.length" class="edk-waiver-none">None on file</div>
          <ul v-else class="edk-waiver-contact-list">
            <li v-for="(ec, i) in selectedClient.waiver.emergencyContacts" :key="i" class="edk-waiver-contact">
              <strong>{{ ec.name || '—' }}</strong>
              <span v-if="ec.relationship" class="muted"> · {{ ec.relationship }}</span>
              <span v-if="ec.phone" class="edk-phone"> {{ ec.phone }}</span>
              <span v-if="ec.canPickup" class="edk-badge-tag">Authorized pickup</span>
            </li>
          </ul>
        </section>

        <!-- Authorized Pickups -->
        <section class="edk-waiver-section">
          <h4 class="edk-waiver-section-title">Authorized Pickups</h4>
          <div v-if="!selectedClient?.waiver?.pickupAuth?.length" class="edk-waiver-none">None on file</div>
          <ul v-else class="edk-waiver-contact-list">
            <li v-for="(p, i) in selectedClient.waiver.pickupAuth" :key="i" class="edk-waiver-contact">
              <strong>{{ p.name || '—' }}</strong>
              <span v-if="p.relationship" class="muted"> · {{ p.relationship }}</span>
              <span v-if="p.phone" class="edk-phone"> {{ p.phone }}</span>
            </li>
          </ul>
        </section>

        <!-- Walk-home -->
        <section class="edk-waiver-section">
          <h4 class="edk-waiver-section-title">Walk-home authorization</h4>
          <div v-if="selectedClient?.waiver?.walkHome?.allowedToWalkHome" class="edk-waiver-ok">
            Authorized to walk home alone.
            <span v-if="selectedClient.waiver.walkHome.allowedWindow"> Window: {{ selectedClient.waiver.walkHome.allowedWindow }}.</span>
          </div>
          <div v-else class="edk-waiver-none">Not authorized</div>
        </section>

        <!-- Allergies & Medical -->
        <section class="edk-waiver-section">
          <h4 class="edk-waiver-section-title">Allergies &amp; Medical</h4>
          <div v-if="!selectedClient?.waiver?.allergies" class="edk-waiver-none">No waiver data</div>
          <template v-else>
            <div v-if="waiverAllergyText(selectedClient.waiver.allergies)" class="edk-waiver-flag edk-flag-warn">
              <strong>Allergies / medical:</strong> {{ waiverAllergyText(selectedClient.waiver.allergies) }}
            </div>
            <div v-else-if="selectedClient.waiver.allergies.applyNone" class="edk-waiver-ok">No medical info reported</div>
            <div v-else class="edk-waiver-ok">No known allergies listed</div>
            <div v-if="selectedClient.waiver.allergies.notes" class="edk-waiver-note">
              <strong>Medical notes:</strong> {{ selectedClient.waiver.allergies.notes }}
            </div>
          </template>
        </section>

        <!-- Approved snacks -->
        <section class="edk-waiver-section">
          <h4 class="edk-waiver-section-title">Approved snacks</h4>
          <div v-if="!selectedClient?.waiver?.allergies" class="edk-waiver-none">No waiver data</div>
          <template v-else>
            <div v-if="selectedClient.waiver.allergies.noSnacks" class="edk-waiver-flag edk-flag-warn">
              <strong>Do not give snacks</strong> to this child
            </div>
            <div v-else-if="waiverApprovedSnacksSummary(selectedClient.waiver.allergies)" class="edk-waiver-note">
              {{ waiverApprovedSnacksSummary(selectedClient.waiver.allergies) }}
            </div>
            <div v-else class="edk-waiver-none">No approved snack preferences on file</div>
          </template>
        </section>

        <!-- Meals -->
        <section v-if="eventContext.mealsAvailable && selectedClient?.waiver?.meals" class="edk-waiver-section">
          <h4 class="edk-waiver-section-title">Meal Preferences</h4>
          <div v-if="selectedClient.waiver.meals.allowedMeals" class="edk-waiver-note">
            <strong>Allowed:</strong> {{ selectedClient.waiver.meals.allowedMeals }}
          </div>
          <div v-if="selectedClient.waiver.meals.restrictedMeals" class="edk-waiver-note">
            <strong>Restricted:</strong> {{ selectedClient.waiver.meals.restrictedMeals }}
          </div>
          <div v-else-if="selectedClient.waiver.meals.mealChoice" class="edk-waiver-note">{{ selectedClient.waiver.meals.mealChoice }}</div>
          <div v-else-if="selectedClient.waiver.meals.mealNotes || selectedClient.waiver.meals.notes" class="edk-waiver-note">
            {{ selectedClient.waiver.meals.mealNotes || selectedClient.waiver.meals.notes }}
          </div>
          <div v-else class="edk-waiver-none">No preference noted</div>
        </section>

        <button class="btn btn-primary edk-waiver-close" @click="closeWaiverModal">Close</button>
      </div>
    </div>

    <!-- ── EMPLOYEE CHECKIN CONFIRM MODAL ─────────────────────────────────── -->
    <div v-if="empConfirmModal" class="edk-modal-overlay edk-modal-overlay--fullscreen">
      <div class="edk-modal edk-modal--fullscreen edk-modal--confirm">
        <h3 class="edk-modal-title">Confirm check-in</h3>
        <p class="edk-emp-confirm-name">{{ empConfirmPerson?.displayName }}</p>
        <p class="muted small">Tap below to check in this employee for today.</p>
        <div class="edk-modal-actions edk-modal-actions--stack">
          <button class="btn btn-primary btn-lg" :disabled="empConfirmBusy" @click="confirmEmployeeCheckin">
            {{ empConfirmBusy ? 'Checking in…' : 'Check in' }}
          </button>
          <button class="btn btn-secondary" @click="empConfirmModal = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="registrationQrOpen" class="edk-modal-overlay" @click.self="closeRegistrationQr">
      <div class="edk-modal edk-reg-qr-modal">
        <h3 class="edk-modal-title">Register for {{ eventContext.title || 'this program' }}</h3>
        <p class="muted small">Scan to open the enrollment form for this event.</p>
        <div v-if="registrationLinks.length > 1" class="edk-reg-link-tabs">
          <button
            v-for="link in registrationLinks"
            :key="link.id || link.url"
            type="button"
            class="btn btn-secondary btn-sm"
            :class="{ 'edk-reg-link-tab--active': selectedRegistrationLink?.url === link.url }"
            @click="selectRegistrationLink(link)"
          >
            {{ link.title || 'Registration' }}
          </button>
        </div>
        <div class="edk-reg-qr-wrap">
          <img v-if="registrationQrDataUrl" :src="registrationQrDataUrl" alt="Registration QR code" class="edk-reg-qr-img" />
          <div v-else class="muted small">Generating QR…</div>
        </div>
        <div class="edk-reg-url-row">
          <input class="input" :value="selectedRegistrationUrl" readonly />
          <button type="button" class="btn btn-secondary btn-sm" @click="copyRegistrationUrl">Copy</button>
        </div>
        <button class="btn btn-primary edk-waiver-close" @click="closeRegistrationQr">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import api from '../../services/api';
import { buildFormUrl } from '../../utils/publicIntakeUrl';
import EventKioskLateContactFlow from '../../components/eventKiosk/EventKioskLateContactFlow.vue';
import EventKioskCheckinWizard from '../../components/eventKiosk/EventKioskCheckinWizard.vue';

const route = useRoute();
const slug = computed(() => String(route.params.organizationSlug || '').trim().toLowerCase());

// ── State ──────────────────────────────────────────────────────────────────
const phase = ref('unlock'); // unlock | loading | load-error | checkin | active | checkout | done
const personMode = ref('client'); // client | employee
const token = ref('');
const eventId = ref(null);

const branding = ref({ agencyName: '', agencyLogo: null, agencyColors: null, orgName: null, orgLogo: null, orgColors: null });
const eventContext = ref({ id: null, title: '', snacksAvailable: true, snackOptions: [], mealsAvailable: false, mealOptions: [] });
const allClients = ref([]);
const allStaff = ref([]);
const checkins = ref([]); // from server
const registration = ref({ available: false, primary: null, links: [], externalUrl: null });
const absenceReasonOptions = ref([]);
const lateContacts = ref([]);

const loadError = ref('');

// Unlock
const unlockPin = ref('');
const unlockBusy = ref(false);
const unlockError = ref('');

// Employee PIN check-in
const empPin = ref('');
const empPinBusy = ref(false);
const empPinError = ref('');

// Gate PIN modal
const gatePinModal = ref(false);
const gatePinIntent = ref(''); // 'to-active' | 'to-checkout' | 'to-done'
const gatePinValue = ref('');
const gatePinBusy = ref(false);
const gatePinError = ref('');

// Waiver modal
const waiverModal = ref(false);
const selectedClient = ref(null);

// Employee confirm modal (tap-to-check-in)
const empConfirmModal = ref(false);
const empConfirmPerson = ref(null);
const empConfirmBusy = ref(false);

// In-progress action guards
const checkingInClientId = ref(null);
const checkingOutClientId = ref(null);
const checkingOutUserId = ref(null);

// Done countdown
const countdownSec = ref(60);
let countdownTimer = null;

// ── Storage ────────────────────────────────────────────────────────────────
function storageKey() {
  return `eventDayKiosk:${slug.value}`;
}
function saveSession(tok, eid) {
  sessionStorage.setItem(storageKey(), JSON.stringify({ token: tok, eventId: eid, savedAt: Date.now() }));
}
function readSession() {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.token || !o?.eventId) return null;
    // Expire after 14 hours
    if (Date.now() - (o.savedAt || 0) > 14 * 60 * 60 * 1000) return null;
    return o;
  } catch { return null; }
}
function clearSession() {
  sessionStorage.removeItem(storageKey());
}

function authHeaders() {
  return { Authorization: `Bearer ${token.value}` };
}

// ── Computed ───────────────────────────────────────────────────────────────
const checkedInClientIds = computed(() => {
  return new Set(
    checkins.value.filter((c) => c.personType === 'client' && c.action === 'check_in').map((c) => c.clientId)
  );
});
const checkedOutClientIds = computed(() => {
  return new Set(
    checkins.value.filter((c) => c.personType === 'client' && c.action === 'check_out').map((c) => c.clientId)
  );
});
const checkedInUserIds = computed(() => {
  return new Set(
    checkins.value.filter((c) => c.personType === 'employee' && c.action === 'check_in').map((c) => c.userId)
  );
});
const checkedOutUserIds = computed(() => {
  return new Set(
    checkins.value.filter((c) => c.personType === 'employee' && c.action === 'check_out').map((c) => c.userId)
  );
});
const absentClientIds = computed(() => {
  return new Set(
    checkins.value.filter((c) => c.personType === 'client' && c.action === 'absent').map((c) => c.clientId)
  );
});

function defaultAbsenceReasons() {
  return [
    { code: 'family_confirmed', label: 'Family confirmed not attending' },
    { code: 'sick', label: 'Sick / not feeling well' },
    { code: 'schedule_conflict', label: 'Schedule conflict' },
    { code: 'travel', label: 'Travel / vacation' },
    { code: 'other', label: 'Other' }
  ];
}
function canMarkAbsent(client) {
  return client?.confirmationStatus === 'no' && !absentClientIds.value.has(client.id);
}
function normalizeLateContactClient(client) {
  return {
    ...client,
    emergencyContacts: client.emergencyContacts || client.waiver?.emergencyContacts || [],
    guardians: client.guardians || []
  };
}
function lateContactForClient(clientId) {
  return lateContacts.value.find((row) => Number(row.clientId) === Number(clientId)) || null;
}
function showLateContactForClient(client) {
  if (checkedInClientIds.value.has(client.id) || absentClientIds.value.has(client.id)) return false;
  const log = lateContactForClient(client.id);
  if (log?.attendanceOutcome === 'not_attending' && log?.resolvedAt) return false;
  return true;
}
function onLateContactUpdated(log, absent) {
  if (!log?.clientId) return;
  const cid = Number(log.clientId);
  const idx = lateContacts.value.findIndex((row) => Number(row.clientId) === cid);
  if (idx >= 0) lateContacts.value[idx] = log;
  else lateContacts.value.push(log);
  if (absent?.ok) {
    checkins.value.push({
      clientId: cid,
      userId: null,
      personType: 'client',
      action: 'absent',
      checkedInAt: absent.recordedAt || new Date().toISOString(),
      absenceReason: absent.absenceReason || log.absenceReason || ''
    });
  }
}
function absenceReasonForClient(clientId) {
  const row = checkins.value.find(
    (c) => c.personType === 'client' && c.action === 'absent' && Number(c.clientId) === Number(clientId)
  );
  return row?.absenceReason || '';
}

const pendingClients = computed(() =>
  allClients.value.filter((c) => !checkedInClientIds.value.has(c.id) && !absentClientIds.value.has(c.id))
);
const absentClients = computed(() =>
  allClients.value.filter((c) => absentClientIds.value.has(c.id))
);
const checkedInClients = computed(() =>
  allClients.value.filter(
    (c) => checkedInClientIds.value.has(c.id) && !checkedOutClientIds.value.has(c.id)
  )
);

const pendingStaff = computed(() =>
  allStaff.value.filter((s) => !checkedInUserIds.value.has(s.id))
);
const checkedInStaff = computed(() =>
  allStaff.value.filter(
    (s) => checkedInUserIds.value.has(s.id) && !checkedOutUserIds.value.has(s.id)
  )
);

const phaseBadgeClass = computed(() => ({
  'edk-badge-checkin': phase.value === 'checkin',
  'edk-badge-active': phase.value === 'active',
  'edk-badge-checkout': phase.value === 'checkout',
  'edk-badge-done': phase.value === 'done'
}));

const brandStyle = computed(() => {
  const colors = branding.value.orgColors || branding.value.agencyColors;
  if (!colors) return {};
  const style = {};
  if (colors.primary) style['--primary'] = colors.primary;
  if (colors.secondary) style['--secondary'] = colors.secondary;
  return style;
});

const todayFormatted = computed(() => {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
});

const clockTime = ref('');
const clockDate = ref('');
let clockTimer = null;

function tickClock() {
  try {
    const now = new Date();
    clockTime.value = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    clockDate.value = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    clockTime.value = '';
    clockDate.value = '';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function clientDisplayName(client) {
  if (!client) return '';
  if (client.kioskDisplayName) return client.kioskDisplayName;
  const parts = String(client.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Client';
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || '';
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}

const registrationAvailable = computed(() => registration.value?.available === true);
const registrationLinks = computed(() => {
  const links = Array.isArray(registration.value?.links) ? registration.value.links : [];
  if (links.length) return links;
  const primary = registration.value?.primary;
  return primary?.url ? [primary] : [];
});
const registrationQrOpen = ref(false);
const selectedRegistrationLink = ref(null);
const registrationQrDataUrl = ref('');

function resolveRegistrationUrl(link) {
  if (!link) return '';
  const fromApi = String(link.url || '').trim();
  if (fromApi) {
    if (/^https?:\/\//i.test(fromApi)) return fromApi;
    const base = String(window.location.origin || '').replace(/\/+$/, '');
    return `${base}${fromApi.startsWith('/') ? fromApi : `/${fromApi}`}`;
  }
  const pk = String(link.publicKey || '').trim();
  if (!pk) return '';
  return buildFormUrl(pk, link.formType);
}

const selectedRegistrationUrl = computed(() => resolveRegistrationUrl(selectedRegistrationLink.value));

async function renderRegistrationQr() {
  const url = selectedRegistrationUrl.value;
  if (!url) { registrationQrDataUrl.value = ''; return; }
  try {
    registrationQrDataUrl.value = await QRCode.toDataURL(url, { width: 260, margin: 1 });
  } catch {
    registrationQrDataUrl.value = '';
  }
}

async function selectRegistrationLink(link) {
  selectedRegistrationLink.value = link;
  await renderRegistrationQr();
}

async function openRegistrationQr(link = null) {
  const links = registrationLinks.value;
  if (!links.length) return;
  selectedRegistrationLink.value = link || registration.value?.primary || links[0];
  registrationQrOpen.value = true;
  await nextTick();
  await renderRegistrationQr();
}

function closeRegistrationQr() {
  registrationQrOpen.value = false;
  selectedRegistrationLink.value = null;
  registrationQrDataUrl.value = '';
}

async function copyRegistrationUrl() {
  const url = selectedRegistrationUrl.value;
  if (!url) return;
  try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function fmtDate(dt) {
  if (!dt) return '';
  try { return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return dt; }
}

function waiverAllergyText(allergies) {
  if (!allergies || typeof allergies !== 'object') return '';
  const text = String(allergies.allergies || '').trim();
  if (text && text.toLowerCase() !== 'none') return text;
  return '';
}

function waiverApprovedSnacksSummary(allergies) {
  if (!allergies || typeof allergies !== 'object') return '';
  const list = Array.isArray(allergies.approvedSnacksList) && allergies.approvedSnacksList.length
    ? allergies.approvedSnacksList.join(', ')
    : '';
  const freeText = String(allergies.approvedSnacks || '').trim();
  return [list, freeText].filter(Boolean).join('; ');
}

function baseUrl(eId) {
  return `/public/skill-builders/agency/${encodeURIComponent(slug.value)}/kiosk/events/${eId}`;
}

// ── Unlock ─────────────────────────────────────────────────────────────────
async function unlock() {
  unlockError.value = '';
  const pin = unlockPin.value.replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) { unlockError.value = 'Enter all 6 digits.'; return; }
  unlockBusy.value = true;
  try {
    const res = await api.post(
      `/public/skill-builders/agency/${encodeURIComponent(slug.value)}/kiosk/unlock`,
      { pin },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const tok = res.data?.token;
    const eid = Number(res.data?.eventId);
    if (!tok || !eid) { unlockError.value = 'Unexpected response.'; return; }
    token.value = tok;
    eventId.value = eid;
    saveSession(tok, eid);
    unlockPin.value = '';
    await loadEventDayContext();
  } catch (e) {
    unlockError.value = e.response?.data?.error?.message || e.message || 'Could not unlock';
  } finally {
    unlockBusy.value = false;
  }
}

// ── Load event-day data ────────────────────────────────────────────────────
async function loadEventDayContext() {
  phase.value = 'loading';
  loadError.value = '';
  try {
    const res = await api.get(
      `${baseUrl(eventId.value)}/event-day`,
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const data = res.data;
    branding.value = data.branding || {};
    eventContext.value = data.event || {};
    allClients.value = data.clients || [];
    allStaff.value = data.staff || [];
    checkins.value = data.checkins || [];
    registration.value = data.registration || { available: false, primary: null, links: [], externalUrl: null };
    absenceReasonOptions.value = Array.isArray(data.absenceReasons) ? data.absenceReasons : defaultAbsenceReasons();
    lateContacts.value = Array.isArray(data.lateContacts) ? data.lateContacts : [];
    phase.value = 'checkin';
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Could not load event details.';
    phase.value = 'load-error';
  }
}

// ── Reset ──────────────────────────────────────────────────────────────────
function resetToUnlock() {
  clearSession();
  token.value = '';
  eventId.value = null;
  phase.value = 'unlock';
  unlockPin.value = '';
  unlockError.value = '';
  allClients.value = [];
  allStaff.value = [];
  checkins.value = [];
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

// ── Client check-in / check-out ────────────────────────────────────────────
const checkinOpen = ref(false);
const checkinClient = ref(null);

const checkinSheetUrl = computed(() => {
  const cid = checkinClient.value?.id;
  const eid = eventId.value;
  if (!cid || !eid) return '';
  return `${baseUrl(eid)}/event-day/client/${cid}/checkin-sheet`;
});

const checkinWaiverUrl = computed(() => {
  const eid = eventId.value;
  if (!eid) return '';
  return `${baseUrl(eid)}/event-day/client/waiver-section`;
});

const checkinPostUrl = computed(() => {
  const eid = eventId.value;
  if (!eid) return '';
  return `${baseUrl(eid)}/event-day/client-checkin`;
});

function openCheckin(client) {
  checkinClient.value = client;
  checkinOpen.value = true;
}

function closeCheckin() {
  checkinOpen.value = false;
  checkinClient.value = null;
}

function applyCheckinSheetToClient(sheet) {
  if (!sheet?.clientId) return;
  const idx = allClients.value.findIndex((c) => Number(c.id) === Number(sheet.clientId));
  if (idx === -1) return;
  const prev = allClients.value[idx];
  allClients.value[idx] = {
    ...prev,
    guardians: sheet.guardians || prev.guardians,
    waiver: {
      ...(prev.waiver || {}),
      emergencyContacts: sheet.emergencyContacts || prev.waiver?.emergencyContacts || [],
      pickupAuth: sheet.authorizedPickups || prev.waiver?.pickupAuth || [],
      walkHome: sheet.walkHome || prev.waiver?.walkHome || null,
      allergies: sheet.allergies || prev.waiver?.allergies || null
    }
  };
}

function onCheckinComplete({ clientId, checkedInByName = null, checkedInByRelationship = null }) {
  checkins.value.push({
    clientId,
    userId: null,
    personType: 'client',
    action: 'check_in',
    checkedInAt: new Date().toISOString(),
    checkedInByName,
    checkedInByRelationship
  });
  closeCheckin();
}

const absentOpen = ref(false);
const absentClient = ref(null);
const absentReasonCode = ref('family_confirmed');
const absentReasonNotes = ref('');
const absentSubmitting = ref(false);
const absentError = ref('');
const canSubmitAbsent = computed(() => {
  if (!absentReasonCode.value) return false;
  if (absentReasonCode.value === 'other') return absentReasonNotes.value.trim().length >= 2;
  return true;
});

function openAbsentModal(client) {
  if (!canMarkAbsent(client)) return;
  absentClient.value = client;
  absentReasonCode.value = 'family_confirmed';
  absentReasonNotes.value = '';
  absentError.value = '';
  absentOpen.value = true;
}

function closeAbsentModal() {
  absentOpen.value = false;
  absentClient.value = null;
  absentError.value = '';
}

async function confirmAbsent() {
  if (!absentClient.value || !canSubmitAbsent.value) return;
  absentSubmitting.value = true;
  absentError.value = '';
  try {
    const res = await api.post(
      `${baseUrl(eventId.value)}/event-day/client-absent`,
      {
        clientId: absentClient.value.id,
        reasonCode: absentReasonCode.value,
        reasonNotes: absentReasonNotes.value.trim() || undefined
      },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    checkins.value.push({
      clientId: absentClient.value.id,
      userId: null,
      personType: 'client',
      action: 'absent',
      checkedInAt: res.data?.recordedAt || new Date().toISOString(),
      absenceReason: res.data?.absenceReason || ''
    });
    closeAbsentModal();
  } catch (e) {
    absentError.value = e.response?.data?.error?.message || 'Could not mark absent';
  } finally {
    absentSubmitting.value = false;
  }
}

async function checkoutClient(client) {
  if (checkingOutClientId.value) return;
  checkingOutClientId.value = client.id;
  try {
    await api.post(
      `${baseUrl(eventId.value)}/event-day/client-checkout`,
      { clientId: client.id },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    // Move to check_out
    const idx = checkins.value.findLastIndex((c) => c.clientId === client.id && c.personType === 'client');
    if (idx !== -1) checkins.value[idx].action = 'check_out';
    else checkins.value.push({ clientId: client.id, userId: null, personType: 'client', action: 'check_out', checkedOutAt: new Date().toISOString() });
  } catch { } finally {
    checkingOutClientId.value = null;
  }
}

// ── Employee check-in ──────────────────────────────────────────────────────
async function checkinByPin() {
  empPinError.value = '';
  const pin = empPin.value.replace(/\D/g, '').slice(0, 4);
  if (pin.length !== 4) { empPinError.value = 'Enter 4 digits.'; return; }
  empPinBusy.value = true;
  try {
    const res = await api.post(
      `${baseUrl(eventId.value)}/event-day/employee-identify-checkin`,
      { pin },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const userId = Number(res.data?.userId);
    if (userId) {
      checkins.value.push({ clientId: null, userId, personType: 'employee', action: 'check_in', checkedInAt: res.data.checkedInAt });
    }
    empPin.value = '';
  } catch (e) {
    empPinError.value = e.response?.data?.error?.message || 'PIN not recognized';
  } finally {
    empPinBusy.value = false;
  }
}

function promptEmployeeCheckin(staffMember) {
  empConfirmPerson.value = staffMember;
  empConfirmModal.value = true;
}

async function confirmEmployeeCheckin() {
  if (!empConfirmPerson.value) return;
  empConfirmBusy.value = true;
  try {
    await api.post(
      `${baseUrl(eventId.value)}/event-day/employee-checkin`,
      { userId: empConfirmPerson.value.id },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    checkins.value.push({ clientId: null, userId: empConfirmPerson.value.id, personType: 'employee', action: 'check_in', checkedInAt: new Date().toISOString() });
    empConfirmModal.value = false;
    empConfirmPerson.value = null;
  } catch { empConfirmModal.value = false; } finally {
    empConfirmBusy.value = false;
  }
}

// ── Employee check-out ─────────────────────────────────────────────────────
async function checkoutEmployee(staffMember) {
  if (checkingOutUserId.value) return;
  checkingOutUserId.value = staffMember.id;
  try {
    await api.post(
      `${baseUrl(eventId.value)}/event-day/employee-checkout`,
      { userId: staffMember.id },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const idx = checkins.value.findLastIndex((c) => c.userId === staffMember.id && c.personType === 'employee');
    if (idx !== -1) checkins.value[idx].action = 'check_out';
    else checkins.value.push({ clientId: null, userId: staffMember.id, personType: 'employee', action: 'check_out', checkedOutAt: new Date().toISOString() });
  } catch { } finally {
    checkingOutUserId.value = null;
  }
}

// ── Gate PIN modal (phase transitions) ────────────────────────────────────
function startGatePin(intent) {
  gatePinIntent.value = intent;
  gatePinValue.value = '';
  gatePinError.value = '';
  gatePinModal.value = true;
}

function cancelGatePin() {
  gatePinModal.value = false;
  gatePinValue.value = '';
  gatePinError.value = '';
}

async function confirmGatePin() {
  gatePinError.value = '';
  const pin = gatePinValue.value.replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) { gatePinError.value = 'Enter all 6 digits.'; return; }
  gatePinBusy.value = true;
  try {
    await api.post(
      `${baseUrl(eventId.value)}/event-day/gate-pin`,
      { pin },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    gatePinModal.value = false;
    gatePinValue.value = '';
    // Advance phase
    if (gatePinIntent.value === 'to-active') phase.value = 'active';
    else if (gatePinIntent.value === 'to-checkout') phase.value = 'checkout';
    else if (gatePinIntent.value === 'to-done') {
      phase.value = 'done';
      startCountdown();
    }
  } catch (e) {
    gatePinError.value = e.response?.data?.error?.message || 'Incorrect PIN';
  } finally {
    gatePinBusy.value = false;
  }
}

// ── Waiver modal ───────────────────────────────────────────────────────────
function viewClientWaiver(client) {
  selectedClient.value = client;
  waiverModal.value = true;
}

function closeWaiverModal() {
  waiverModal.value = false;
  selectedClient.value = null;
}

// ── Done countdown ─────────────────────────────────────────────────────────
function startCountdown() {
  countdownSec.value = 60;
  countdownTimer = setInterval(() => {
    countdownSec.value -= 1;
    if (countdownSec.value <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      resetToUnlock();
    }
  }, 1000);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
  const s = readSession();
  if (s?.token && s?.eventId) {
    token.value = s.token;
    eventId.value = Number(s.eventId);
    await loadEventDayContext();
  }
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
  if (clockTimer) clearInterval(clockTimer);
});

watch(slug, () => { resetToUnlock(); });
</script>

<style scoped>
.edk-root {
  --edk-primary: var(--primary, #1b5e4b);
  --edk-surface: #ffffff;
  --edk-bg: #eef2f0;
  --edk-border: #d8e0dc;
  --edk-muted: #64748b;
  min-height: 100dvh;
  background: var(--edk-bg);
  color: #1e293b;
  font-family: inherit;
  display: flex;
  flex-direction: column;
}

/* ── Center wrapper (unlock / loading / error screens) ── */
.edk-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

/* ── Cards ── */
.edk-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 20px;
  padding: 32px 28px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.09);
  width: min(460px, 100%);
}
.edk-unlock-card {
  text-align: center;
}

/* ── Logo ── */
.edk-logo-wrap { margin-bottom: 16px; }
.edk-logo { max-height: 64px; max-width: 200px; object-fit: contain; }

/* ── Text ── */
.edk-title { font-size: 1.5rem; font-weight: 800; margin: 0 0 8px; color: var(--edk-primary); }
.edk-lead { margin: 0 0 24px; font-size: 0.95rem; }
.edk-lbl { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.88rem; text-align: left; }

/* ── PIN input ── */
.edk-pin-form { display: flex; flex-direction: column; gap: 12px; }
.edk-pin-input { font-size: 1.4rem; letter-spacing: 0.3em; text-align: center; height: 54px; border-radius: 12px; }
.edk-pin-btn { height: 48px; font-size: 1rem; border-radius: 12px; }

/* ── Header ── */
.edk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--edk-surface);
  color: #1e293b;
  padding: 16px 20px;
  border-bottom: 1px solid var(--edk-border);
}
.edk-header-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.edk-header-logo { height: 48px; width: auto; max-width: 120px; object-fit: contain; border-radius: 10px; }
.edk-header-org { font-size: 1.15rem; font-weight: 800; color: var(--edk-primary); line-height: 1.2; }
.edk-header-event { font-size: 13px; color: var(--edk-muted); margin-top: 2px; }
.edk-header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.edk-header-clock { text-align: right; line-height: 1.25; }
.edk-header-clock-time { font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #334155; }
.edk-header-clock-date { font-size: 12px; color: var(--edk-muted); margin-top: 2px; }

/* Phase badge */
.edk-phase-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid var(--edk-border);
}
.edk-badge-checkin { background: color-mix(in srgb, var(--edk-primary) 10%, white); color: var(--edk-primary); border-color: color-mix(in srgb, var(--edk-primary) 25%, white); }
.edk-badge-active { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.edk-badge-checkout { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.edk-badge-done { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }

/* ── Body ── */
.edk-body { flex: 1; padding: 16px 18px 24px; max-width: 920px; margin: 0 auto; width: 100%; }

.edk-walkin-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 14px;
  border: 1px solid var(--edk-border);
  background: #f4f7f5;
}
.edk-walkin-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--edk-surface);
  border: 1px solid var(--edk-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--edk-primary);
}
.edk-walkin-icon svg { width: 20px; height: 20px; }
.edk-walkin-copy { flex: 1; min-width: 0; line-height: 1.45; }
.edk-walkin-qr-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--edk-primary);
  border-color: var(--edk-primary);
  flex-shrink: 0;
}
.edk-walkin-qr-btn svg { width: 14px; height: 14px; }

.edk-person-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.edk-person-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--edk-border);
  background: var(--edk-surface);
  border-radius: 14px;
  padding: 14px 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  color: var(--edk-muted);
}
.edk-tab-icon { width: 18px; height: 18px; flex-shrink: 0; }
.edk-person-tab.active {
  border-color: var(--edk-primary);
  background: var(--edk-primary);
  color: #fff;
  box-shadow: 0 4px 14px rgba(27, 94, 75, 0.22);
}

.edk-roster-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}
.edk-roster-head-icon { width: 18px; height: 18px; color: var(--edk-primary); }

/* ── Two-column layout (legacy) ── */
.edk-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 680px) { .edk-columns { grid-template-columns: 1fr; } }

/* ── Panel ── */
.edk-panel {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.edk-panel-title { font-size: 1.1rem; font-weight: 700; margin: 0; }
.edk-panel-sub { margin: -8px 0 0; font-size: 0.82rem; }

/* ── Person list ── */
.edk-person-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.edk-person-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 12px 14px;
  border: 1px solid var(--edk-border);
  border-radius: 14px;
  background: var(--edk-surface);
  gap: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.edk-person-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.edk-row-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--edk-primary) 12%, white);
  color: var(--edk-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.edk-person-row--stack .ek-late { margin-top: 0; border-color: var(--edk-border); background: #f8faf9; }
.edk-person-main { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.edk-person-name-line { line-height: 1.3; }
.edk-person-name { font-weight: 700; font-size: 0.98rem; color: #0f172a; }
.edk-person-id { color: var(--edk-muted); font-weight: 500; font-size: 0.92rem; }
.edk-person-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.edk-btn-checkin {
  background: var(--edk-surface);
  border: 1.5px solid var(--edk-primary);
  color: var(--edk-primary);
  font-weight: 700;
  font-size: 13px;
  border-radius: 10px;
  padding: 8px 16px;
  min-width: 92px;
}
.edk-btn-checkin:hover:not(:disabled) {
  background: color-mix(in srgb, var(--edk-primary) 8%, white);
}
.edk-btn-checkin:disabled { opacity: 0.55; }
.edk-btn-ghost { border-radius: 10px; font-size: 12px; }
.edk-absent-tag {
  display: inline-block;
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
}
.edk-absent-block { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--edk-border); }
.edk-absent-title { margin: 0 0 8px; font-size: 0.95rem; }
.edk-absent-list { margin: 0; padding-left: 18px; }
.edk-field-lbl { display: block; margin: 12px 0 6px; font-size: 0.85rem; font-weight: 700; }
.edk-check-btn { min-width: 90px; padding: 6px 14px; font-size: 0.85rem; }
.edk-empty { color: var(--edk-muted); font-size: 0.9rem; padding: 12px 0; text-align: center; }

/* ── Employee PIN box ── */
.edk-emp-pin-box {
  border: 1px solid var(--edk-border);
  border-radius: 14px;
  background: var(--edk-surface);
  padding: 14px 16px;
  margin-top: 8px;
}
.edk-emp-pin-lbl { font-size: 0.83rem; font-weight: 600; margin: 0 0 8px; color: var(--muted, #64748b); }
.edk-pin-row { display: flex; gap: 8px; }
.edk-pin-sm { width: 90px; text-align: center; letter-spacing: 0.2em; }
.edk-err-sm { font-size: 0.8rem; color: var(--danger, #ef4444); margin: 4px 0 0; }

/* ── Footer action ── */
.edk-footer-action { margin-top: 28px; text-align: right; }
.edk-phase-btn { font-size: 0.95rem; padding: 10px 28px; }

/* ── Active phase: client grid ── */
.edk-active-intro { margin-bottom: 16px; }
.edk-section-title { font-size: 1.1rem; font-weight: 700; margin: 0 0 4px; }
.edk-client-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}
.edk-client-tile {
  background: var(--edk-surface);
  border: 1px solid var(--edk-border);
  border-radius: 14px;
  padding: 18px 14px;
  cursor: pointer;
  text-align: center;
  transition: box-shadow 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.edk-client-tile:hover { box-shadow: 0 6px 20px rgba(15,23,42,0.12); border-color: var(--primary, #0f766e); }
.edk-client-initials {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--primary, #0f766e);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; font-weight: 800;
}
.edk-client-name { font-weight: 600; font-size: 0.9rem; line-height: 1.3; }
.edk-client-badge {
  font-size: 0.72rem;
  background: #dcfce7;
  color: #166534;
  border-radius: 10px;
  padding: 2px 8px;
  font-weight: 600;
}
.edk-badge-warn { background: #fff3cd; color: #92400e; }
.edk-empty-center { padding: 48px; text-align: center; font-size: 1rem; }

/* ── Done ── */
.edk-done-body { display: flex; align-items: center; justify-content: center; }
.edk-done-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 20px;
  padding: 48px 40px;
  text-align: center;
  max-width: 480px;
  box-shadow: 0 12px 40px rgba(15,23,42,0.09);
}
.edk-done-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: #d1fae5; color: #059669;
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; font-weight: 900;
  margin: 0 auto 20px;
}

/* ── Modal overlay ── */
.edk-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(15,23,42,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
  padding: 20px;
}
.edk-modal-overlay--fullscreen {
  background: #fff;
  padding:
    max(16px, env(safe-area-inset-top, 0px))
    max(24px, env(safe-area-inset-right, 0px))
    max(16px, env(safe-area-inset-bottom, 0px))
    max(24px, env(safe-area-inset-left, 0px));
  justify-content: center;
  align-items: stretch;
}
.edk-modal {
  background: var(--surface, #fff);
  border-radius: 20px;
  padding: 28px 24px;
  width: min(480px, 100%);
  box-shadow: 0 20px 60px rgba(15,23,42,0.18);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 90dvh;
  overflow-y: auto;
}
.edk-modal--fullscreen {
  width: min(600px, 100%);
  max-width: 600px;
  height: 100%;
  max-height: none;
  margin: 0 auto;
  border-radius: 0;
  box-shadow: none;
  padding: 16px 8px 24px;
}
.edk-modal--confirm {
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 20px;
}
.edk-emp-confirm-name {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
}
.edk-modal-actions--stack {
  flex-direction: column;
  width: 100%;
  max-width: 360px;
  margin-top: auto;
}
.edk-modal-actions--stack .btn {
  width: 100%;
  padding: 14px;
  font-size: 1rem;
}
.edk-modal-title { margin: 0; font-size: 1.1rem; font-weight: 800; }
.edk-modal-pin { align-items: center; }
.edk-modal-cancel { font-size: 0.85rem; color: var(--muted, #64748b); text-align: center; }
.edk-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* ── Waiver modal ── */
.edk-waiver-modal { max-width: 600px; }
.edk-waiver-header { display: flex; align-items: center; gap: 14px; }
.edk-waiver-initials {
  width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0;
  background: var(--primary, #0f766e);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; font-weight: 800;
}
.edk-waiver-section { border-top: 1px solid var(--border, #e2e8f0); padding-top: 14px; }
.edk-waiver-section-title { font-size: 0.88rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted, #64748b); margin: 0 0 10px; }
.edk-waiver-contact-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.edk-waiver-contact { font-size: 0.9rem; line-height: 1.5; }
.edk-phone { font-size: 0.85rem; color: var(--primary, #0f766e); }
.edk-badge-tag { display: inline-block; background: #dbeafe; color: #1d4ed8; border-radius: 10px; padding: 1px 8px; font-size: 0.72rem; font-weight: 600; margin-left: 4px; }
.edk-waiver-none { font-size: 0.88rem; color: var(--muted, #64748b); font-style: italic; }
.edk-waiver-flag { padding: 8px 12px; border-radius: 8px; font-size: 0.88rem; }
.edk-flag-warn { background: #fff3cd; color: #92400e; border-left: 3px solid #f59e0b; }
.edk-waiver-ok { font-size: 0.88rem; color: #166534; }
.edk-waiver-note { font-size: 0.88rem; color: var(--text, #1e293b); padding: 4px 0; }
.edk-waiver-close { margin-top: 8px; }

/* ── Misc ── */
.muted { color: var(--muted, #64748b); }
.small { font-size: 0.83rem; }
.error-box {
  background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 0.88rem;
}
.edk-walkin-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 12px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
}
.edk-reg-qr-modal { text-align: center; max-width: 420px; }
.edk-reg-link-tabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 10px 0; }
.edk-reg-link-tab--active { border-color: var(--primary, #0f766e); background: #f0fdfa; }
.edk-reg-qr-wrap { display: flex; justify-content: center; margin: 10px 0; }
.edk-reg-qr-img { width: 260px; height: 260px; border-radius: 12px; border: 1px solid var(--border, #e2e8f0); }
.edk-reg-url-row { display: flex; gap: 8px; margin-bottom: 12px; }
.edk-checkin-guardian { margin-bottom: 12px; }
.edk-checkin-waiver-banner {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  display: grid;
  gap: 8px;
}
.edk-checkin-waiver-checks { display: grid; gap: 8px; margin: 12px 0; }
.edk-checkin-emergency-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.edk-checkin-confirm-block {
  margin: 10px 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
}
.edk-checkin-review-lead { margin: 0 0 8px; }
.edk-checkin-pickup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 14px;
}
.edk-checkin-update-row { margin-top: 10px; }
.edk-checkin-check-row { display: flex; gap: 8px; align-items: flex-start; font-size: 0.88rem; }
</style>
