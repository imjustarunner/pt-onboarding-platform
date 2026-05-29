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
        <div class="edk-header-inner">
          <img v-if="branding.orgLogo || branding.agencyLogo" :src="branding.orgLogo || branding.agencyLogo" class="edk-header-logo" alt="Logo" />
          <div class="edk-header-text">
            <div class="edk-header-org">{{ branding.orgName || branding.agencyName }}</div>
            <div class="edk-header-event">{{ eventContext.title }}</div>
          </div>
          <div class="edk-header-date">{{ todayFormatted }}</div>
        </div>
        <!-- Phase badge -->
        <div class="edk-phase-badge" :class="phaseBadgeClass">
          <span v-if="phase === 'checkin'">Check-In</span>
          <span v-else-if="phase === 'active'">Session Active</span>
          <span v-else-if="phase === 'checkout'">Check-Out</span>
          <span v-else-if="phase === 'done'">Complete</span>
        </div>
      </header>

      <!-- ── CHECK-IN PHASE ──────────────────────────────────────────────── -->
      <div v-if="phase === 'checkin'" class="edk-body">
        <div v-if="registrationAvailable" class="edk-walkin-banner">
          <div>
            <strong>Walk-in today?</strong>
            <span class="muted small"> Show parents the registration QR to enroll on site.</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="openRegistrationQr()">Show QR</button>
        </div>
        <div class="edk-columns">
          <!-- Client check-in -->
          <div class="edk-panel">
            <h2 class="edk-panel-title">Client Check-In</h2>
            <p class="edk-panel-sub muted">{{ pendingClients.length }} remaining</p>
            <div v-if="!pendingClients.length" class="edk-empty">All clients checked in!</div>
            <ul v-else class="edk-person-list">
              <li v-for="c in pendingClients" :key="c.id" class="edk-person-row">
                <span class="edk-person-name">{{ clientDisplayName(c) }}</span>
                <button
                  class="btn btn-primary edk-check-btn"
                  :disabled="(checkinOpen && checkinClient?.id === c.id) || checkinSubmitting"
                  @click="openCheckin(c)"
                >
                  {{ (checkinOpen && checkinClient?.id === c.id) || checkinSubmitting ? '…' : 'Check In' }}
                </button>
              </li>
            </ul>
          </div>

          <!-- Employee check-in -->
          <div class="edk-panel">
            <h2 class="edk-panel-title">Employee Check-In</h2>
            <p class="edk-panel-sub muted">{{ pendingStaff.length }} remaining</p>
            <div v-if="!pendingStaff.length" class="edk-empty">All employees checked in!</div>
            <ul v-else class="edk-person-list">
              <li v-for="s in pendingStaff" :key="s.id" class="edk-person-row">
                <span class="edk-person-name">{{ s.displayName }}</span>
                <button class="btn btn-secondary edk-check-btn" @click="promptEmployeeCheckin(s)">
                  Tap to check in
                </button>
              </li>
            </ul>
            <!-- Employee PIN check-in -->
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
        <div class="edk-columns">
          <!-- Client check-out -->
          <div class="edk-panel">
            <h2 class="edk-panel-title">Client Check-Out</h2>
            <p class="edk-panel-sub muted">{{ checkedInClients.length }} remaining</p>
            <div v-if="!checkedInClients.length" class="edk-empty">All clients checked out!</div>
            <ul v-else class="edk-person-list">
              <li v-for="c in checkedInClients" :key="c.id" class="edk-person-row">
                <span class="edk-person-name">{{ clientDisplayName(c) }}</span>
                <button
                  class="btn btn-primary edk-check-btn"
                  :disabled="checkingOutClientId === c.id"
                  @click="checkoutClient(c)"
                >
                  {{ checkingOutClientId === c.id ? '…' : 'Check Out' }}
                </button>
              </li>
            </ul>
          </div>

          <!-- Employee check-out -->
          <div class="edk-panel">
            <h2 class="edk-panel-title">Employee Check-Out</h2>
            <p class="edk-panel-sub muted">{{ checkedInStaff.length }} remaining</p>
            <div v-if="!checkedInStaff.length" class="edk-empty">All employees checked out!</div>
            <ul v-else class="edk-person-list">
              <li v-for="s in checkedInStaff" :key="s.id" class="edk-person-row">
                <span class="edk-person-name">{{ s.displayName }}</span>
                <button
                  class="btn btn-secondary edk-check-btn"
                  :disabled="checkingOutUserId === s.id"
                  @click="checkoutEmployee(s)"
                >
                  {{ checkingOutUserId === s.id ? '…' : 'Check Out' }}
                </button>
              </li>
            </ul>
          </div>
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

    <!-- ── CHECK-IN PICKUP / WAIVER MODAL ─────────────────────────────────── -->
    <div v-if="checkinOpen" class="edk-modal-overlay" @click.self="closeCheckin">
      <div class="edk-modal edk-waiver-modal">
        <div class="edk-waiver-header">
          <div>
            <h3 class="edk-modal-title">Check in {{ clientDisplayName(checkinClient) }}</h3>
            <p class="muted small">Review approved pickups. Add and sign pickup authorization if needed.</p>
          </div>
        </div>
        <div v-if="checkinError" class="error-box">{{ checkinError }}</div>
        <div v-if="checkinSheetLoading" class="muted small">Loading pickup info…</div>
        <template v-else-if="checkinSheet">
          <div v-if="checkinSheet.guardians?.length > 1" class="edk-checkin-guardian">
            <label class="edk-emp-pin-lbl">Signing as guardian</label>
            <select v-model="checkinGuardianUserId" class="input" @change="loadCheckinSheet">
              <option v-for="g in checkinSheet.guardians" :key="g.userId" :value="g.userId">
                {{ g.name || `Guardian #${g.userId}` }}
              </option>
            </select>
          </div>
          <p v-else-if="checkinSheet.guardians?.length === 1" class="muted small">
            Signing as <strong>{{ checkinSheet.guardians[0].name || 'guardian' }}</strong>
          </p>

          <section class="edk-waiver-section">
            <h4 class="edk-waiver-section-title">Authorized Pickups</h4>
            <div v-if="!sheetGuardianPickups.length && !sheetOtherPickups.length" class="edk-waiver-none">None on file yet</div>
            <ul v-else class="edk-waiver-contact-list">
              <li v-for="(p, i) in sheetGuardianPickups" :key="`sg-${i}`" class="edk-waiver-contact">
                <strong>{{ p.name }}</strong>
                <span class="muted"> · Guardian</span>
                <span v-if="p.phone" class="edk-phone"> {{ p.phone }}</span>
              </li>
              <li v-for="(p, i) in sheetOtherPickups" :key="`so-${i}`" class="edk-waiver-contact">
                <strong>{{ p.name }}</strong>
                <span v-if="p.relationship" class="muted"> · {{ p.relationship }}</span>
                <span v-if="p.phone" class="edk-phone"> {{ p.phone }}</span>
              </li>
            </ul>
          </section>

          <section class="edk-waiver-section">
            <h4 class="edk-waiver-section-title">Emergency Contacts</h4>
            <div v-if="!checkinSheet.emergencyContacts?.length" class="edk-waiver-none">None on file</div>
            <ul v-else class="edk-waiver-contact-list">
              <li v-for="(ec, i) in checkinSheet.emergencyContacts" :key="`ec-${i}`" class="edk-waiver-contact">
                <strong>{{ ec.name || '—' }}</strong>
                <span v-if="ec.relationship" class="muted"> · {{ ec.relationship }}</span>
                <span v-if="ec.phone" class="edk-phone"> {{ ec.phone }}</span>
              </li>
            </ul>
          </section>

          <div
            v-if="checkinSheet.waiversEnabled && checkinSheet.gate?.pickupRequired && !checkinSheet.gate?.pickupSatisfied"
            class="edk-checkin-waiver-banner"
          >
            <strong>Pickup authorization required</strong>
            <button
              v-if="checkinSheet.gate?.needsEsignBeforePickup"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="!checkinGuardianUserId"
              @click="openCheckinWaiverEdit('esignature_consent')"
            >
              Sign e-signature consent first
            </button>
            <button
              v-else
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!checkinGuardianUserId"
              @click="openCheckinWaiverEdit('pickup_authorization')"
            >
              Add pickup person &amp; sign
            </button>
          </div>
          <div
            v-if="checkinSheet.waiversEnabled && checkinGuardianUserId && checkinSheet.gate?.esignActive && !(checkinSheet.gate?.pickupRequired && !checkinSheet.gate?.pickupSatisfied)"
            class="edk-checkin-update-row"
          >
            <button type="button" class="btn btn-secondary btn-sm" @click="openCheckinWaiverEdit('pickup_authorization')">
              Update pickup list
            </button>
          </div>

          <div class="edk-modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeCheckin">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!canCompleteCheckin || checkinSubmitting"
              @click="confirmCheckin"
            >
              {{ checkinSubmitting ? '…' : 'Complete check-in' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <div v-if="checkinWaiverEditOpen" class="edk-modal-overlay" @click.self="closeCheckinWaiverEdit">
      <div class="edk-modal edk-waiver-modal">
        <h3 class="edk-modal-title">{{ checkinWaiverTitle }}</h3>
        <component :is="checkinWaiverFieldComponent" v-if="checkinWaiverFieldComponent" v-model="checkinWaiverDraft" />
        <div class="edk-checkin-waiver-checks">
          <label class="edk-checkin-check-row">
            <input v-model="checkinWaiverConsent" type="checkbox" />
            <span>I have read this section and consent to sign.</span>
          </label>
          <label class="edk-checkin-check-row">
            <input v-model="checkinWaiverIntent" type="checkbox" />
            <span>I intend my electronic signature to have the same effect as a handwritten signature.</span>
          </label>
        </div>
        <SignaturePad compact @signed="(d) => (checkinWaiverSig = d)" />
        <div v-if="checkinWaiverError" class="error-box">{{ checkinWaiverError }}</div>
        <div class="edk-modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeCheckinWaiverEdit">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="checkinWaiverSaving" @click="saveCheckinWaiverEdit">
            {{ checkinWaiverSaving ? 'Saving…' : 'Save & continue' }}
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
    <div v-if="empConfirmModal" class="edk-modal-overlay" @click.self="empConfirmModal = false">
      <div class="edk-modal">
        <h3 class="edk-modal-title">Confirm Check-In</h3>
        <p>Check in <strong>{{ empConfirmPerson?.displayName }}</strong>?</p>
        <div class="edk-modal-actions">
          <button class="btn btn-secondary" @click="empConfirmModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="empConfirmBusy" @click="confirmEmployeeCheckin">
            {{ empConfirmBusy ? '…' : 'Check In' }}
          </button>
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
import SignaturePad from '../../components/SignaturePad.vue';
import GwvFieldsEsign from '../guardian/waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from '../guardian/waivers/GwvFieldsPickup.vue';

const route = useRoute();
const slug = computed(() => String(route.params.organizationSlug || '').trim().toLowerCase());

// ── State ──────────────────────────────────────────────────────────────────
const phase = ref('unlock'); // unlock | loading | load-error | checkin | active | checkout | done
const token = ref('');
const eventId = ref(null);

const branding = ref({ agencyName: '', agencyLogo: null, agencyColors: null, orgName: null, orgLogo: null, orgColors: null });
const eventContext = ref({ id: null, title: '', snacksAvailable: true, snackOptions: [], mealsAvailable: false, mealOptions: [] });
const allClients = ref([]);
const allStaff = ref([]);
const checkins = ref([]); // from server
const registration = ref({ available: false, primary: null, links: [], externalUrl: null });

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

const pendingClients = computed(() =>
  allClients.value.filter((c) => !checkedInClientIds.value.has(c.id))
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
const checkinSheet = ref(null);
const checkinSheetLoading = ref(false);
const checkinGuardianUserId = ref(null);
const checkinError = ref('');
const checkinSubmitting = ref(false);

const CHECKIN_WAIVER_FIELDS = { esignature_consent: GwvFieldsEsign, pickup_authorization: GwvFieldsPickup };
const CHECKIN_WAIVER_TITLES = { esignature_consent: 'E-signature consent', pickup_authorization: 'Authorized pickups' };
const checkinWaiverEditOpen = ref(false);
const checkinWaiverEditKey = ref('');
const checkinWaiverDraft = ref({});
const checkinWaiverConsent = ref(false);
const checkinWaiverIntent = ref(false);
const checkinWaiverSig = ref('');
const checkinWaiverSaving = ref(false);
const checkinWaiverError = ref('');

const checkinWaiverFieldComponent = computed(() => CHECKIN_WAIVER_FIELDS[checkinWaiverEditKey.value] || null);
const checkinWaiverTitle = computed(() => CHECKIN_WAIVER_TITLES[checkinWaiverEditKey.value] || 'Waiver section');
const sheetGuardianPickups = computed(() => (checkinSheet.value?.authorizedPickups || []).filter((p) => p.source === 'guardian'));
const sheetOtherPickups = computed(() => (checkinSheet.value?.authorizedPickups || []).filter((p) => p.source !== 'guardian'));
const canCompleteCheckin = computed(() => {
  if (!checkinSheet.value || checkinSheetLoading.value) return false;
  if (checkinSheet.value.waiversEnabled && checkinSheet.value.gate?.pickupRequired && !checkinSheet.value.gate?.pickupSatisfied) return false;
  if (checkinSheet.value.waiversEnabled && checkinSheet.value.gate?.pickupRequired && !checkinGuardianUserId.value) return false;
  return true;
});

function defaultCheckinWaiverPayload(key) {
  if (key === 'esignature_consent') return { consented: false, understoodElectronicRecords: false };
  if (key === 'pickup_authorization') {
    const existing = checkinSheet.value?.pickupSection;
    if (existing && typeof existing === 'object') return JSON.parse(JSON.stringify(existing));
    return { authorizedPickups: [{ name: '', relationship: '', phone: '' }] };
  }
  return {};
}

async function openCheckin(client) {
  checkinClient.value = client;
  checkinError.value = '';
  checkinSheet.value = null;
  checkinGuardianUserId.value = null;
  checkinOpen.value = true;
  await loadCheckinSheet();
}

function closeCheckin() {
  checkinOpen.value = false;
  checkinClient.value = null;
  checkinSheet.value = null;
  checkinError.value = '';
  checkinGuardianUserId.value = null;
  closeCheckinWaiverEdit();
}

async function loadCheckinSheet() {
  if (!checkinClient.value?.id || !eventId.value) return;
  checkinSheetLoading.value = true;
  checkinError.value = '';
  try {
    const params = {};
    if (checkinGuardianUserId.value) params.guardianUserId = checkinGuardianUserId.value;
    const res = await api.get(
      `${baseUrl(eventId.value)}/event-day/client/${checkinClient.value.id}/checkin-sheet`,
      { params, headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    checkinSheet.value = res.data;
    if (!checkinGuardianUserId.value && res.data?.guardianUserId) checkinGuardianUserId.value = res.data.guardianUserId;
    else if (!checkinGuardianUserId.value && res.data?.guardians?.length) checkinGuardianUserId.value = res.data.guardians[0].userId;
  } catch (e) {
    checkinError.value = e.response?.data?.error?.message || 'Could not load pickup info';
  } finally {
    checkinSheetLoading.value = false;
  }
}

function openCheckinWaiverEdit(key) {
  checkinWaiverEditKey.value = key;
  checkinWaiverDraft.value = defaultCheckinWaiverPayload(key);
  checkinWaiverConsent.value = false;
  checkinWaiverIntent.value = false;
  checkinWaiverSig.value = '';
  checkinWaiverError.value = '';
  checkinWaiverEditOpen.value = true;
}

function closeCheckinWaiverEdit() {
  checkinWaiverEditOpen.value = false;
  checkinWaiverEditKey.value = '';
  checkinWaiverError.value = '';
}

async function saveCheckinWaiverEdit() {
  const key = checkinWaiverEditKey.value;
  if (!key || !checkinWaiverConsent.value || !checkinWaiverIntent.value) {
    checkinWaiverError.value = 'Check both boxes and sign to save.';
    return;
  }
  const sig = String(checkinWaiverSig.value || '').trim();
  if (sig.length < 80) {
    checkinWaiverError.value = 'Signature is required.';
    return;
  }
  if (key === 'esignature_consent') {
    const p = checkinWaiverDraft.value || {};
    if (!p.consented || !p.understoodElectronicRecords) {
      checkinWaiverError.value = 'Complete e-sign consent checkboxes in the form.';
      return;
    }
  }
  const gid = checkinGuardianUserId.value;
  const cid = checkinClient.value?.id;
  if (!gid || !cid) {
    checkinWaiverError.value = 'Select a guardian to sign.';
    return;
  }
  const status = checkinSheet.value?.sectionStatus?.[key];
  const action = status === 'active' ? 'update' : 'create';
  checkinWaiverSaving.value = true;
  checkinWaiverError.value = '';
  try {
    const res = await api.post(
      `${baseUrl(eventId.value)}/event-day/client/waiver-section`,
      {
        clientId: cid,
        guardianUserId: gid,
        sectionKey: key,
        payload: checkinWaiverDraft.value,
        signatureData: sig,
        consentAcknowledged: true,
        intentToSign: true,
        action
      },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    checkinSheet.value = res.data?.sheet || checkinSheet.value;
    closeCheckinWaiverEdit();
  } catch (e) {
    checkinWaiverError.value = e.response?.data?.error?.message || 'Save failed';
  } finally {
    checkinWaiverSaving.value = false;
  }
}

async function confirmCheckin() {
  if (!checkinClient.value || !canCompleteCheckin.value) return;
  checkinSubmitting.value = true;
  checkinError.value = '';
  try {
    await api.post(
      `${baseUrl(eventId.value)}/event-day/client-checkin`,
      { clientId: checkinClient.value.id },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    checkins.value.push({
      clientId: checkinClient.value.id,
      userId: null,
      personType: 'client',
      action: 'check_in',
      checkedInAt: new Date().toISOString()
    });
    closeCheckin();
  } catch (e) {
    checkinError.value = e.response?.data?.error?.message || 'Check-in failed';
  } finally {
    checkinSubmitting.value = false;
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
  const s = readSession();
  if (s?.token && s?.eventId) {
    token.value = s.token;
    eventId.value = Number(s.eventId);
    await loadEventDayContext();
  }
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

watch(slug, () => { resetToUnlock(); });
</script>

<style scoped>
.edk-root {
  min-height: 100dvh;
  background: var(--bg, #f8fafc);
  color: var(--text, #1e293b);
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
.edk-title { font-size: 1.5rem; font-weight: 800; margin: 0 0 8px; color: var(--primary, #0f766e); }
.edk-lead { margin: 0 0 24px; font-size: 0.95rem; }
.edk-lbl { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.88rem; text-align: left; }

/* ── PIN input ── */
.edk-pin-form { display: flex; flex-direction: column; gap: 12px; }
.edk-pin-input { font-size: 1.4rem; letter-spacing: 0.3em; text-align: center; height: 54px; border-radius: 12px; }
.edk-pin-btn { height: 48px; font-size: 1rem; border-radius: 12px; }

/* ── Header ── */
.edk-header {
  background: var(--primary, #0f766e);
  color: #fff;
  padding: 12px 20px;
  position: relative;
}
.edk-header-inner { display: flex; align-items: center; gap: 12px; }
.edk-header-logo { height: 40px; width: auto; object-fit: contain; border-radius: 6px; background: #fff; padding: 2px 4px; }
.edk-header-text { flex: 1; }
.edk-header-org { font-size: 0.78rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.06em; }
.edk-header-event { font-size: 1.1rem; font-weight: 700; }
.edk-header-date { font-size: 0.82rem; opacity: 0.8; white-space: nowrap; }

/* Phase badge */
.edk-phase-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(255,255,255,0.18);
}
.edk-badge-checkin { background: rgba(255,255,255,0.22); }
.edk-badge-active { background: rgba(16,185,129,0.35); }
.edk-badge-checkout { background: rgba(245,158,11,0.35); }
.edk-badge-done { background: rgba(99,102,241,0.35); }

/* ── Body ── */
.edk-body { flex: 1; padding: 24px 20px; max-width: 1200px; margin: 0 auto; width: 100%; }

/* ── Two-column layout ── */
.edk-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 680px) { .edk-columns { grid-template-columns: 1fr; } }

/* ── Panel ── */
.edk-panel {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.edk-panel-title { font-size: 1.1rem; font-weight: 700; margin: 0; }
.edk-panel-sub { margin: -8px 0 0; font-size: 0.82rem; }

/* ── Person list ── */
.edk-person-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.edk-person-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg, #f8fafc);
  gap: 10px;
}
.edk-person-name { font-weight: 600; font-size: 0.95rem; flex: 1; }
.edk-check-btn { min-width: 90px; padding: 6px 14px; font-size: 0.85rem; }
.edk-empty { color: var(--muted, #64748b); font-size: 0.9rem; padding: 12px 0; text-align: center; }

/* ── Employee PIN box ── */
.edk-emp-pin-box { border-top: 1px dashed var(--border, #e2e8f0); padding-top: 14px; margin-top: 4px; }
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
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
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
.edk-checkin-check-row { display: flex; gap: 8px; align-items: flex-start; font-size: 0.88rem; }
.edk-checkin-update-row { margin-top: 10px; }
</style>
