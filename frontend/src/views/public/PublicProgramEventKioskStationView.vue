<template>
  <div class="pe-kiosk" :style="brandStyle">
    <header class="pe-kiosk-hdr">
      <div class="pe-kiosk-brand">
        <img v-if="branding.agencyLogo || branding.orgLogo" :src="branding.orgLogo || branding.agencyLogo" alt="" class="pe-kiosk-logo" />
        <div>
          <div class="pe-kiosk-org">{{ branding.orgName || branding.agencyName }}</div>
          <div class="pe-kiosk-evt">{{ event.title || 'Program event' }}</div>
        </div>
      </div>
      <div class="pe-kiosk-clock">{{ clockNow }}</div>
    </header>

    <section v-if="loading" class="pe-kiosk-load">
      <div class="muted">Loading event…</div>
    </section>

    <section v-else-if="loadError" class="pe-kiosk-load">
      <div class="error-box">{{ loadError }}</div>
      <button class="btn btn-secondary" @click="loadContext">Retry</button>
    </section>

    <section v-else class="pe-kiosk-body">
      <div v-if="!kioskActive" class="pe-preview-banner" role="status">
        <strong>Preview mode</strong>
        <span>
          Today is not a scheduled event day — you can browse the roster and resource info, but check-in and check-out are
          disabled.
          <template v-if="nextEventDateLabel"> Next session: {{ nextEventDateLabel }}.</template>
        </span>
      </div>

      <!-- Person type toggle (check in / check out only) -->
      <div v-if="mainMode !== 'resource'" class="pe-person-tabs">
        <button
          type="button"
          class="pe-person-tab"
          :class="{ active: personMode === 'client' }"
          @click="personMode = 'client'"
        >
          Client {{ mainMode === 'checkin' ? 'check-in' : 'check-out' }}
        </button>
        <button
          type="button"
          class="pe-person-tab"
          :class="{ active: personMode === 'employee' }"
          @click="personMode = 'employee'"
        >
          Employee {{ mainMode === 'checkin' ? 'check-in' : 'check-out' }}
        </button>
      </div>

      <div class="pe-kiosk-toolbar">
        <input
          v-model="search"
          class="input pe-kiosk-search"
          :placeholder="searchPlaceholder"
          autocomplete="off"
        />
        <button class="btn btn-secondary btn-sm" @click="loadContext">Refresh</button>
        <button
          v-if="registrationAvailable"
          type="button"
          class="btn btn-primary btn-sm pe-walkin-btn"
          @click="openRegistrationQr()"
        >
          Walk-in registration
        </button>
      </div>

      <div
        v-if="registrationAvailable && mainMode === 'checkin' && personMode === 'client'"
        class="pe-walkin-banner"
      >
        <div>
          <strong>Walk-in today?</strong>
          <span class="muted small"> Show parents the registration QR so they can enroll on their phone while on site.</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="openRegistrationQr()">Show QR</button>
      </div>

      <!-- CHECK IN · CLIENT -->
      <div v-if="mainMode === 'checkin' && personMode === 'client'" class="pe-panel">
        <p class="pe-panel-lead muted">{{ pendingClients.length }} not checked in yet</p>
        <ul class="pe-roster">
          <li v-for="c in filteredPendingClients" :key="c.id" class="pe-row">
            <div class="pe-row-main">
              <strong>{{ clientDisplayName(c) }}</strong>
              <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!kioskActive || (checkinOpen && checkinClient?.id === c.id) || checkinSubmitting"
              @click="openCheckin(c)"
            >
              {{ (checkinOpen && checkinClient?.id === c.id) || checkinSubmitting ? '…' : 'Check in' }}
            </button>
          </li>
          <li v-if="!filteredPendingClients.length" class="pe-empty muted">
            {{ search ? 'No matches.' : 'All clients are checked in.' }}
          </li>
        </ul>
      </div>

      <!-- CHECK IN · EMPLOYEE -->
      <div v-else-if="mainMode === 'checkin' && personMode === 'employee'" class="pe-panel">
        <p class="pe-panel-lead muted">{{ pendingStaff.length }} not checked in yet</p>
        <div class="pe-pin-box">
          <label class="pe-pin-lbl">Or enter 4-digit personal PIN</label>
          <div class="pe-pin-row">
            <input
              v-model="empPin"
              class="input pe-pin-input"
              type="password"
              inputmode="numeric"
              maxlength="4"
              placeholder="••••"
              :disabled="!kioskActive || empPinBusy"
              @input="empPin = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
            />
            <button class="btn btn-primary btn-sm" :disabled="!kioskActive || empPinBusy || empPin.length !== 4" @click="checkinByPin">
              {{ empPinBusy ? '…' : 'Go' }}
            </button>
          </div>
          <p v-if="empPinError" class="pe-inline-err">{{ empPinError }}</p>
        </div>
        <ul class="pe-roster">
          <li v-for="s in filteredPendingStaff" :key="s.id" class="pe-row">
            <div class="pe-row-main"><strong>{{ s.displayName }}</strong></div>
            <button
              class="btn btn-secondary btn-sm"
              :disabled="!kioskActive || checkingInUserId === s.id"
              @click="checkinEmployee(s)"
            >
              {{ checkingInUserId === s.id ? '…' : 'Check in' }}
            </button>
          </li>
          <li v-if="!filteredPendingStaff.length" class="pe-empty muted">
            {{ search ? 'No matches.' : 'All employees are checked in.' }}
          </li>
        </ul>
      </div>

      <!-- CHECK OUT · CLIENT (release flow) -->
      <div v-else-if="mainMode === 'checkout' && personMode === 'client'" class="pe-panel">
        <p class="pe-panel-lead muted">
          {{ kioskActive ? 'Tap a checked-in client to release with signature' : 'Release is available on event days only' }}
        </p>
        <ul class="pe-roster pe-roster--grid">
          <li
            v-for="c in filteredCheckoutClients"
            :key="c.id"
            class="pe-card"
            :class="{ 'pe-card--released': releasedToday(c.id), 'pe-card--disabled': !kioskActive }"
            @click="kioskActive && !releasedToday(c.id) && openCheckout(c)"
          >
            <strong>{{ clientDisplayName(c) }}</strong>
            <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
            <span v-if="releasedToday(c.id)" class="pe-tag pe-tag--out">
              Released · {{ formatTime(releasedToday(c.id).signedAt) }}
            </span>
            <span v-else-if="c.checkoutBlocked" class="pe-tag pe-tag--warn">Release info missing</span>
            <span v-else class="pe-tag">Tap to release</span>
          </li>
          <li v-if="!filteredCheckoutClients.length" class="pe-empty muted">
            {{ search ? 'No matches.' : 'No checked-in clients waiting for release.' }}
          </li>
        </ul>
      </div>

      <!-- CHECK OUT · EMPLOYEE -->
      <div v-else-if="mainMode === 'checkout' && personMode === 'employee'" class="pe-panel">
        <p class="pe-panel-lead muted">{{ activeCheckedInStaff.length }} checked in</p>
        <ul class="pe-roster">
          <li v-for="s in filteredActiveStaff" :key="s.id" class="pe-row">
            <div class="pe-row-main"><strong>{{ s.displayName }}</strong></div>
            <button
              class="btn btn-secondary btn-sm"
              :disabled="!kioskActive || checkingOutUserId === s.id"
              @click="checkoutEmployee(s)"
            >
              {{ checkingOutUserId === s.id ? '…' : 'Check out' }}
            </button>
          </li>
          <li v-if="!filteredActiveStaff.length" class="pe-empty muted">
            {{ search ? 'No matches.' : 'No employees checked in.' }}
          </li>
        </ul>
      </div>

      <!-- RESOURCE -->
      <div v-else class="pe-panel">
        <p class="pe-panel-lead muted">
          {{ kioskActive ? 'Checked-in participants · tap for emergency & waiver info' : 'Confirmed participants · tap to preview emergency & waiver info' }}
        </p>
        <ul class="pe-roster pe-roster--grid">
          <li
            v-for="c in filteredResourceClients"
            :key="c.id"
            class="pe-card pe-card--resource"
            @click="openResource(c)"
          >
            <div class="pe-card-initials">{{ initials(c.fullName || c.kioskDisplayName) }}</div>
            <strong>{{ clientDisplayName(c) }}</strong>
            <span v-if="c.emergencyContacts?.length" class="pe-tag">
              {{ c.emergencyContacts.length }} emergency contact{{ c.emergencyContacts.length !== 1 ? 's' : '' }}
            </span>
            <span v-else class="pe-tag pe-tag--warn">No emergency contacts</span>
            <span v-if="clientHasAllergyInfo(c)" class="pe-tag pe-tag--warn">Allergies / medical</span>
            <span v-if="c.authorizedPickups?.length" class="pe-tag">
              {{ c.authorizedPickups.length }} pickup{{ c.authorizedPickups.length !== 1 ? 's' : '' }}
            </span>
          </li>
          <li v-if="!filteredResourceClients.length" class="pe-empty muted">
            {{ search ? 'No matches.' : (kioskActive ? 'No participants checked in yet.' : 'No confirmed participants yet.') }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Bottom nav -->
    <nav v-if="!loading && !loadError" class="pe-bottom-nav" aria-label="Kiosk mode">
      <button type="button" class="pe-nav-btn" :class="{ active: mainMode === 'checkin' }" @click="mainMode = 'checkin'">
        Check in
      </button>
      <button type="button" class="pe-nav-btn" :class="{ active: mainMode === 'checkout' }" @click="mainMode = 'checkout'">
        Check out
      </button>
      <button type="button" class="pe-nav-btn" :class="{ active: mainMode === 'resource' }" @click="mainMode = 'resource'">
        Resource
      </button>
    </nav>

    <!-- Resource detail modal -->
    <div v-if="resourceOpen" class="pe-kiosk-modal" @click.self="closeResource">
      <div class="pe-kiosk-modal-card pe-resource-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">{{ clientDisplayName(resourceClient) }}</div>
            <div v-if="resourceClient?.identifierCode" class="muted small">ID {{ resourceClient.identifierCode }}</div>
            <div v-if="resourceClient?.waiverUpdatedAt" class="muted small">
              Waiver updated {{ formatWaiverDate(resourceClient.waiverUpdatedAt) }}
            </div>
          </div>
          <button class="btn btn-text" @click="closeResource">Close</button>
        </header>

        <h4 class="pe-kiosk-modal-h4">Emergency contacts</h4>
        <ul v-if="resourceClient?.emergencyContacts?.length" class="pe-info-list">
          <li v-for="(e, i) in resourceClient.emergencyContacts" :key="i">
            <strong>{{ e.name }}</strong>
            <span v-if="e.relationship" class="muted small"> · {{ e.relationship }}</span>
            <div v-if="e.phone" class="muted small">{{ e.phone }}</div>
          </li>
        </ul>
        <p v-else class="muted small">None on file.</p>

        <h4 class="pe-kiosk-modal-h4">Guardians (approved pickup)</h4>
        <ul v-if="guardianPickupOptions(resourceClient).length" class="pe-info-list">
          <li v-for="(p, i) in guardianPickupOptions(resourceClient)" :key="`rg-${i}`">
            <strong>{{ p.name }}</strong>
            <span class="muted small"> · Guardian</span>
            <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
          </li>
        </ul>
        <p v-else class="muted small">None linked.</p>

        <h4 class="pe-kiosk-modal-h4">Other authorized pickups</h4>
        <ul v-if="otherPickupOptions(resourceClient).length" class="pe-info-list">
          <li v-for="(p, i) in otherPickupOptions(resourceClient)" :key="`rp-${i}`">
            <strong>{{ p.name }}</strong>
            <span v-if="p.relationship" class="muted small"> · {{ p.relationship }}</span>
            <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
          </li>
        </ul>
        <p v-else class="muted small">None on file.</p>

        <h4 class="pe-kiosk-modal-h4">Walk-home</h4>
        <p v-if="resourceClient?.walkHome?.allowedToWalkHome" class="small">
          Authorized to walk home alone.
          <span v-if="resourceClient.walkHome.allowedWindow"> Window: {{ resourceClient.walkHome.allowedWindow }}.</span>
          <span v-if="resourceClient.walkHome.conditions"> {{ resourceClient.walkHome.conditions }}</span>
        </p>
        <p v-else class="muted small">Not authorized.</p>

        <h4 class="pe-kiosk-modal-h4">Allergies &amp; medical</h4>
        <div v-if="resourceClient?.allergies" class="pe-allergy-block">
          <p v-if="allergySummary(resourceClient.allergies)" class="small pe-allergy-warn">
            <strong>Allergies / restrictions:</strong> {{ allergySummary(resourceClient.allergies) }}
          </p>
          <p v-else-if="resourceClient.allergies.applyNone" class="muted small">No medical info reported.</p>
          <p v-if="resourceClient.allergies.noSnacks" class="small pe-allergy-warn">
            <strong>Snacks:</strong> Do not give snacks to this child.
          </p>
          <p v-else-if="approvedSnacksSummary(resourceClient.allergies)" class="small">
            <strong>Approved snacks:</strong> {{ approvedSnacksSummary(resourceClient.allergies) }}
          </p>
          <p v-if="resourceClient.allergies.notes" class="small">
            <strong>Medical notes:</strong> {{ resourceClient.allergies.notes }}
          </p>
        </div>
        <p v-else class="muted small">None on file.</p>

        <h4 v-if="resourceClient?.meals" class="pe-kiosk-modal-h4">Meal preferences</h4>
        <div v-if="resourceClient?.meals" class="pe-meal-block">
          <p v-if="resourceClient.meals.allowedMeals" class="small">
            <strong>Allowed:</strong> {{ resourceClient.meals.allowedMeals }}
          </p>
          <p v-if="resourceClient.meals.restrictedMeals" class="small pe-allergy-warn">
            <strong>Restricted:</strong> {{ resourceClient.meals.restrictedMeals }}
          </p>
          <p v-if="resourceClient.meals.mealChoice" class="small">
            <strong>Choice:</strong> {{ resourceClient.meals.mealChoice }}
          </p>
          <p v-if="resourceClient.meals.mealNotes || resourceClient.meals.notes" class="small">
            <strong>Notes:</strong> {{ resourceClient.meals.mealNotes || resourceClient.meals.notes }}
          </p>
        </div>
      </div>
    </div>

    <!-- Check-in modal: approved pickups + waiver signing -->
    <div v-if="checkinOpen" class="pe-kiosk-modal" @click.self="closeCheckin">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Check in {{ clientDisplayName(checkinClient) }}</div>
            <div class="muted small">Review who is approved for pickup. Add and sign pickup authorization if needed.</div>
          </div>
          <button class="btn btn-text" @click="closeCheckin">Close</button>
        </header>

        <div v-if="checkinError" class="error-box pe-kiosk-modal-err">{{ checkinError }}</div>
        <div v-if="checkinSheetLoading" class="muted small">Loading pickup info…</div>

        <template v-else-if="checkinSheet">
          <div v-if="checkinSheet.guardians?.length > 1" class="pe-checkin-guardian-pick">
            <label class="pe-checkin-lbl">Signing as guardian</label>
            <select
              v-model="checkinGuardianUserId"
              class="input"
              @change="loadCheckinSheet"
            >
              <option v-for="g in checkinSheet.guardians" :key="g.userId" :value="g.userId">
                {{ g.name || `Guardian #${g.userId}` }}
              </option>
            </select>
          </div>
          <p v-else-if="checkinSheet.guardians?.length === 1" class="muted small">
            Signing as <strong>{{ checkinSheet.guardians[0].name || 'guardian' }}</strong>
          </p>
          <p v-else-if="checkinSheet.waiversEnabled && checkinSheet.gate?.pickupRequired" class="pe-checkout-issue-banner">
            No guardian linked on file — ask staff before signing pickup authorization.
          </p>

          <h4 class="pe-kiosk-modal-h4">Approved for pickup</h4>
          <p v-if="sheetGuardianPickups.length" class="pe-kiosk-modal-sub muted small">Guardians</p>
          <ul v-if="sheetGuardianPickups.length" class="pe-info-list">
            <li v-for="(p, i) in sheetGuardianPickups" :key="`sg-${i}`">
              <strong>{{ p.name }}</strong>
              <span class="muted small"> · Guardian</span>
              <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
            </li>
          </ul>
          <p v-if="sheetOtherPickups.length" class="pe-kiosk-modal-sub muted small">Other authorized pickups</p>
          <ul v-if="sheetOtherPickups.length" class="pe-info-list">
            <li v-for="(p, i) in sheetOtherPickups" :key="`so-${i}`">
              <strong>{{ p.name }}</strong>
              <span v-if="p.relationship" class="muted small"> · {{ p.relationship }}</span>
              <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
            </li>
          </ul>
          <p v-if="!sheetGuardianPickups.length && !sheetOtherPickups.length" class="muted small">
            No pickup contacts on file yet.
          </p>

          <h4 class="pe-kiosk-modal-h4">Emergency contacts</h4>
          <ul v-if="checkinSheet.emergencyContacts?.length" class="pe-info-list">
            <li v-for="(e, i) in checkinSheet.emergencyContacts" :key="`ec-${i}`">
              <strong>{{ e.name }}</strong>
              <span v-if="e.relationship" class="muted small"> · {{ e.relationship }}</span>
              <div v-if="e.phone" class="muted small">{{ e.phone }}</div>
            </li>
          </ul>
          <p v-else class="muted small">None on file.</p>

          <div
            v-if="checkinSheet.waiversEnabled && checkinSheet.gate?.pickupRequired && !checkinSheet.gate?.pickupSatisfied"
            class="pe-checkin-waiver-banner"
          >
            <strong>Pickup authorization required</strong>
            <p class="small">
              Sign the pickup waiver to list who may pick up {{ clientDisplayName(checkinClient) }} today.
            </p>
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
          <div v-else-if="checkinSheet.waiversEnabled && checkinSheet.gate?.pickupSatisfied" class="pe-checkin-ok-banner">
            Pickup authorization on file — ready to check in.
          </div>
          <div
            v-if="checkinSheet.waiversEnabled && checkinGuardianUserId && checkinSheet.gate?.esignActive && !(checkinSheet.gate?.pickupRequired && !checkinSheet.gate?.pickupSatisfied)"
            class="pe-checkin-update-row"
          >
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="openCheckinWaiverEdit('pickup_authorization')"
            >
              Update pickup list
            </button>
          </div>

          <div class="pe-checkin-actions">
            <button type="button" class="btn btn-secondary" @click="closeCheckin">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!canCompleteCheckin || checkinSubmitting"
              @click="confirmCheckin"
            >
              {{ checkinSubmitting ? 'Checking in…' : 'Complete check-in' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Waiver section editor (pickup / e-sign at check-in) -->
    <div v-if="checkinWaiverEditOpen" class="pe-kiosk-modal pe-kiosk-modal--stack" @click.self="closeCheckinWaiverEdit">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div class="pe-kiosk-modal-title">{{ checkinWaiverTitle }}</div>
          <button class="btn btn-text" @click="closeCheckinWaiverEdit">Close</button>
        </header>
        <component
          :is="checkinWaiverFieldComponent"
          v-if="checkinWaiverFieldComponent"
          v-model="checkinWaiverDraft"
        />
        <div class="pe-checkin-waiver-checks">
          <label class="pe-checkin-check-row">
            <input v-model="checkinWaiverConsent" type="checkbox" />
            <span>I have read this section and consent to sign.</span>
          </label>
          <label class="pe-checkin-check-row">
            <input v-model="checkinWaiverIntent" type="checkbox" />
            <span>I intend my electronic signature to have the same effect as a handwritten signature.</span>
          </label>
        </div>
        <SignaturePad compact @signed="(d) => (checkinWaiverSig = d)" />
        <div v-if="checkinWaiverError" class="error-box pe-kiosk-modal-err">{{ checkinWaiverError }}</div>
        <div class="pe-checkin-actions">
          <button type="button" class="btn btn-secondary" @click="closeCheckinWaiverEdit">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="checkinWaiverSaving"
            @click="saveCheckinWaiverEdit"
          >
            {{ checkinWaiverSaving ? 'Saving…' : 'Save & continue' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Checkout / release modal (unchanged flow) -->
    <div v-if="checkoutOpen" class="pe-kiosk-modal" @click.self="closeCheckout">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Release {{ clientDisplayName(activeClient) }}</div>
            <div class="muted small">Select pickup or walk-home, sign, and take a release photo.</div>
          </div>
          <button class="btn btn-text" @click="closeCheckout">Close</button>
        </header>

        <div v-if="checkoutError" class="error-box pe-kiosk-modal-err">{{ checkoutError }}</div>

        <div v-if="activeClient?.checkoutBlocked" class="pe-checkout-issue-banner">
          <strong>Release blocked:</strong>
          No authorized pickups or walk-home authorization on file. Update the guardian waiver before this client can be released.
        </div>

        <div v-if="clientHasAllergyInfo(activeClient)" class="pe-checkout-allergy-banner">
          <strong>Allergies / medical:</strong>
          {{ allergySummary(activeClient.allergies) || approvedSnacksSummary(activeClient.allergies) || activeClient.allergies.notes || 'See resource tab for details' }}
        </div>

        <template v-if="!activeClient?.checkoutBlocked">
          <h4 class="pe-kiosk-modal-h4">Who is picking up?</h4>

          <p v-if="guardianPickupOptions(activeClient).length" class="pe-kiosk-modal-sub muted small">Guardians</p>
          <ul v-if="guardianPickupOptions(activeClient).length" class="pe-kiosk-pickup-list">
            <li
              v-for="(p, idx) in guardianPickupOptions(activeClient)"
              :key="`cg-${idx}`"
              class="pe-kiosk-pickup-row"
              :class="{ 'pe-kiosk-pickup-row--sel': releaseMode === 'pickup' && selectedPickupKey === pickupKey(p) }"
              @click="selectPickup(p)"
            >
              <div>
                <strong>{{ p.name }}</strong>
                <span class="muted small"> (Guardian)</span>
              </div>
              <div class="muted small">{{ p.phone || '' }}</div>
            </li>
          </ul>

          <p v-if="otherPickupOptions(activeClient).length" class="pe-kiosk-modal-sub muted small">Approved pickups</p>
          <ul v-if="otherPickupOptions(activeClient).length" class="pe-kiosk-pickup-list">
            <li
              v-for="(p, idx) in otherPickupOptions(activeClient)"
              :key="`cp-${idx}`"
              class="pe-kiosk-pickup-row"
              :class="{ 'pe-kiosk-pickup-row--sel': releaseMode === 'pickup' && selectedPickupKey === pickupKey(p) }"
              @click="selectPickup(p)"
            >
              <div>
                <strong>{{ p.name }}</strong>
                <span v-if="p.relationship" class="muted small"> ({{ p.relationship }})</span>
              </div>
              <div class="muted small">{{ p.phone || '' }}</div>
            </li>
          </ul>
          <div v-if="!guardianPickupOptions(activeClient).length && !otherPickupOptions(activeClient).length" class="muted small">
            No pickup contacts on file — use walk-home authorization below if on file.
          </div>

          <h4 class="pe-kiosk-modal-h4">Walk-home authorization</h4>
          <div v-if="activeClient?.walkHome?.allowedToWalkHome" class="pe-kiosk-walk-options">
            <button
              type="button"
              class="pe-kiosk-pickup-row pe-kiosk-walk-option"
              :class="{ 'pe-kiosk-pickup-row--sel': releaseMode === 'walk_home_staff' }"
              @click="selectWalkHomeStaff"
            >
              <div>
                <strong>Walk home alone</strong>
                <span class="muted small"> — staff attestation (employee signs below)</span>
              </div>
              <div v-if="activeClient.walkHome.allowedWindow" class="muted small">
                Window: {{ activeClient.walkHome.allowedWindow }}
              </div>
            </button>
            <button
              v-if="activeClient?.canSelfWalkHome"
              type="button"
              class="pe-kiosk-pickup-row pe-kiosk-walk-option"
              :class="{ 'pe-kiosk-pickup-row--sel': releaseMode === 'walk_home_self' }"
              @click="selectWalkHomeSelf"
            >
              <div>
                <strong>Walk home alone</strong>
                <span class="muted small"> — client self-release (age {{ activeClient.ageYears }}+, client signs below)</span>
              </div>
            </button>
          </div>
          <div v-else class="muted small pe-checkout-warn">Walk-home authorization is NOT on file.</div>
        </template>

        <h4 class="pe-kiosk-modal-h4">{{ releaseMode === 'walk_home_self' ? 'Client signature' : 'Signature' }}</h4>
        <div class="pe-kiosk-sig-wrap">
          <canvas
            ref="sigCanvas"
            class="pe-kiosk-sig-canvas"
            @pointerdown="sigStart"
            @pointermove="sigMove"
            @pointerup="sigEnd"
            @pointerleave="sigEnd"
          />
          <div class="pe-kiosk-sig-actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="clearSig">Clear</button>
          </div>
        </div>

        <h4 class="pe-kiosk-modal-h4">Release photo <span class="pe-required">(required)</span></h4>
        <div class="pe-kiosk-photo-wrap">
          <video v-if="photoStreamActive" ref="photoVideo" class="pe-kiosk-photo-video" autoplay playsinline muted />
          <img v-else-if="photoPreview" :src="photoPreview" class="pe-kiosk-photo-preview" alt="Release photo" />
          <div class="pe-kiosk-photo-actions">
            <button v-if="!photoStreamActive && !photoPreview" class="btn btn-secondary btn-sm" type="button" @click="startCamera">Camera</button>
            <button v-if="photoStreamActive" class="btn btn-primary btn-sm" type="button" @click="snapPhoto">Snap</button>
            <button v-if="photoPreview" class="btn btn-secondary btn-sm" type="button" @click="clearPhoto">Retake</button>
          </div>
        </div>

        <footer class="pe-kiosk-modal-footer">
          <button class="btn btn-secondary" type="button" @click="closeCheckout">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="submitting || !canSubmitCheckout" @click="submitCheckout">
            {{ submitting ? 'Recording…' : 'Record release' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Walk-in registration QR -->
    <div v-if="registrationQrOpen" class="pe-kiosk-modal" @click.self="closeRegistrationQr">
      <div class="pe-kiosk-modal-card pe-registration-qr-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Register for {{ event.title || 'this program' }}</div>
            <div class="muted small">Scan with a phone camera to open the enrollment form for this event.</div>
          </div>
          <button class="btn btn-text" type="button" @click="closeRegistrationQr">Close</button>
        </header>

        <div v-if="registrationLinks.length > 1" class="pe-reg-link-tabs">
          <button
            v-for="link in registrationLinks"
            :key="link.id || link.url"
            type="button"
            class="btn btn-secondary btn-sm"
            :class="{ 'pe-reg-link-tab--active': selectedRegistrationLink?.url === link.url }"
            @click="selectRegistrationLink(link)"
          >
            {{ link.title || 'Registration' }}
          </button>
        </div>

        <div class="pe-reg-qr-wrap">
          <img v-if="registrationQrDataUrl" :src="registrationQrDataUrl" alt="Registration QR code" class="pe-reg-qr-img" />
          <div v-else class="muted small">Generating QR…</div>
        </div>

        <p class="pe-reg-form-title"><strong>{{ selectedRegistrationLink?.title || 'Registration form' }}</strong></p>
        <div class="pe-reg-url-row">
          <input class="input pe-reg-url-input" :value="selectedRegistrationUrl" readonly />
          <button type="button" class="btn btn-secondary btn-sm" @click="copyRegistrationUrl">Copy link</button>
        </div>
        <p class="muted small pe-reg-hint">
          After the parent finishes registration, refresh the roster — the child can check in once they appear on the participant list.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import { resolvePortalSlug } from '../../utils/orgScopedPath';
import { buildFormUrl } from '../../utils/publicIntakeUrl';
import SignaturePad from '../../components/SignaturePad.vue';
import GwvFieldsEsign from '../guardian/waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from '../guardian/waivers/GwvFieldsPickup.vue';

const route = useRoute();
const brandingStore = useBrandingStore();
const slug = computed(() => resolvePortalSlug(route.params, brandingStore.portalHostPortalUrl));
const eventId = computed(() => String(route.params.eventId || '').trim());

const loading = ref(true);
const loadError = ref('');
const event = ref({});
const branding = ref({});
const clients = ref([]);
const staff = ref([]);
const checkins = ref([]);
const releases = ref([]);
const registration = ref({ available: false, primary: null, links: [], externalUrl: null });
const kioskDay = ref({});
const search = ref('');
const clockNow = ref(formatNow());
let clockTimer = null;

const mainMode = ref('checkin');
const personMode = ref('client');

const checkingInClientId = ref(null); // legacy; check-in uses modal flow
const checkingInUserId = ref(null);
const checkingOutUserId = ref(null);
const empPin = ref('');
const empPinBusy = ref(false);
const empPinError = ref('');

function apiBase() {
  return `/public/program-event/agency/${encodeURIComponent(slug.value)}/kiosk/events/${encodeURIComponent(eventId.value)}`;
}

function storageKey() { return `skillBuildersEventKiosk:${slug.value}`; }
function readToken() {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch { return null; }
}
function authHeaders() {
  const t = readToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function loadContext() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`${apiBase()}/context`, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    event.value = res.data?.event || {};
    branding.value = res.data?.branding || {};
    clients.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
    staff.value = Array.isArray(res.data?.staff) ? res.data.staff : [];
    checkins.value = Array.isArray(res.data?.checkins) ? res.data.checkins : [];
    releases.value = Array.isArray(res.data?.releases) ? res.data.releases : [];
    registration.value = res.data?.registration || { available: false, primary: null, links: [], externalUrl: null };
    kioskDay.value = res.data?.kioskDay || {};
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Could not load event';
  } finally {
    loading.value = false;
  }
}

const kioskActive = computed(() => kioskDay.value?.kioskActive === true);

function formatYmdLabel(ymd) {
  if (!ymd) return '';
  try {
    const [y, mo, d] = String(ymd).split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return String(ymd);
  }
}

const nextEventDateLabel = computed(() => formatYmdLabel(kioskDay.value?.nextEventDate));

function personCheckedIn(personType, id) {
  return checkins.value.some(
    (c) => c.personType === personType && c.action === 'check_in'
      && ((personType === 'client' && Number(c.clientId) === Number(id))
        || (personType === 'employee' && Number(c.userId) === Number(id)))
  );
}
function personCheckedOut(personType, id) {
  return checkins.value.some(
    (c) => c.personType === personType && c.action === 'check_out'
      && ((personType === 'client' && Number(c.clientId) === Number(id))
        || (personType === 'employee' && Number(c.userId) === Number(id)))
  );
}

const pendingClients = computed(() =>
  clients.value.filter((c) => !personCheckedIn('client', c.id))
);
const activeCheckedInClients = computed(() =>
  clients.value.filter((c) => personCheckedIn('client', c.id) && !releasedToday(c.id))
);
const pendingStaff = computed(() =>
  staff.value.filter((s) => !personCheckedIn('employee', s.id))
);
const activeCheckedInStaff = computed(() =>
  staff.value.filter((s) => personCheckedIn('employee', s.id) && !personCheckedOut('employee', s.id))
);

function filterList(list, fields) {
  const q = search.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((item) =>
    fields.some((f) => String(item[f] || '').toLowerCase().includes(q))
  );
}

const filteredPendingClients = computed(() =>
  filterList(pendingClients.value, ['fullName', 'kioskDisplayName', 'initials', 'identifierCode'])
);
const filteredPendingStaff = computed(() =>
  filterList(pendingStaff.value, ['displayName', 'firstName', 'lastName'])
);
const filteredCheckoutClients = computed(() =>
  filterList(activeCheckedInClients.value, ['fullName', 'kioskDisplayName', 'initials', 'identifierCode'])
);
const filteredActiveStaff = computed(() =>
  filterList(activeCheckedInStaff.value, ['displayName', 'firstName', 'lastName'])
);
const filteredResourceClients = computed(() =>
  filterList(kioskActive.value ? activeCheckedInClients.value : clients.value, ['fullName', 'kioskDisplayName', 'initials', 'identifierCode'])
);

const searchPlaceholder = computed(() => {
  if (mainMode.value === 'resource') return 'Search checked-in clients…';
  if (personMode.value === 'employee') return 'Search employees…';
  return 'Search clients…';
});

const brandStyle = computed(() => {
  const colors = branding.value.orgColors || branding.value.agencyColors;
  if (!colors) return {};
  const style = {};
  if (colors.primary) style['--primary'] = colors.primary;
  if (colors.secondary) style['--secondary'] = colors.secondary;
  return style;
});

function releasedToday(clientId) {
  return releases.value.find((r) => Number(r.clientId) === Number(clientId)) || null;
}
function formatNow() {
  try { return new Date().toLocaleTimeString(); } catch { return ''; }
}
function formatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
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
  if (!url) {
    registrationQrDataUrl.value = '';
    return;
  }
  try {
    registrationQrDataUrl.value = await QRCode.toDataURL(url, { width: 280, margin: 1 });
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
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    /* ignore */
  }
}

function clientDisplayName(client) {
  if (!client) return '';
  return client.kioskDisplayName || formatKioskDisplayName(client.fullName);
}

function formatKioskDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Client';
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || '';
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}

function guardianPickupOptions(client) {
  return (client?.authorizedPickups || []).filter((p) => p.source === 'guardian');
}

function otherPickupOptions(client) {
  return (client?.authorizedPickups || []).filter((p) => p.source !== 'guardian');
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function formatWaiverDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(iso);
  }
}

function allergySummary(allergies) {
  if (!allergies || typeof allergies !== 'object') return '';
  const text = String(allergies.allergies || '').trim();
  if (text && text.toLowerCase() !== 'none') return text;
  return '';
}

function approvedSnacksSummary(allergies) {
  if (!allergies || typeof allergies !== 'object') return '';
  const list = Array.isArray(allergies.approvedSnacksList) && allergies.approvedSnacksList.length
    ? allergies.approvedSnacksList.join(', ')
    : '';
  const freeText = String(allergies.approvedSnacks || '').trim();
  return [list, freeText].filter(Boolean).join('; ');
}

function clientHasAllergyInfo(client) {
  const a = client?.allergies;
  if (!a || typeof a !== 'object') return false;
  return !!(
    allergySummary(a)
    || a.noSnacks
    || approvedSnacksSummary(a)
    || String(a.notes || '').trim()
  );
}

async function openCheckin(c) {
  if (!kioskActive.value) return;
  checkinClient.value = c;
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

const checkinOpen = ref(false);
const checkinClient = ref(null);
const checkinSheet = ref(null);
const checkinSheetLoading = ref(false);
const checkinGuardianUserId = ref(null);
const checkinError = ref('');
const checkinSubmitting = ref(false);

const CHECKIN_WAIVER_FIELDS = {
  esignature_consent: GwvFieldsEsign,
  pickup_authorization: GwvFieldsPickup
};
const CHECKIN_WAIVER_TITLES = {
  esignature_consent: 'E-signature consent',
  pickup_authorization: 'Authorized pickups'
};

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

const sheetGuardianPickups = computed(() =>
  (checkinSheet.value?.authorizedPickups || []).filter((p) => p.source === 'guardian')
);
const sheetOtherPickups = computed(() =>
  (checkinSheet.value?.authorizedPickups || []).filter((p) => p.source !== 'guardian')
);

const canCompleteCheckin = computed(() => {
  if (!checkinSheet.value || checkinSheetLoading.value) return false;
  if (checkinSheet.value.waiversEnabled && checkinSheet.value.gate?.pickupRequired && !checkinSheet.value.gate?.pickupSatisfied) {
    return false;
  }
  if (checkinSheet.value.waiversEnabled && checkinSheet.value.gate?.pickupRequired && !checkinGuardianUserId.value) {
    return false;
  }
  return true;
});

function defaultCheckinWaiverPayload(key) {
  if (key === 'esignature_consent') {
    return { consented: false, understoodElectronicRecords: false };
  }
  if (key === 'pickup_authorization') {
    const existing = checkinSheet.value?.pickupSection;
    if (existing && typeof existing === 'object') {
      return JSON.parse(JSON.stringify(existing));
    }
    return { authorizedPickups: [{ name: '', relationship: '', phone: '' }] };
  }
  return {};
}

async function loadCheckinSheet() {
  if (!checkinClient.value?.id) return;
  checkinSheetLoading.value = true;
  checkinError.value = '';
  try {
    const params = {};
    if (checkinGuardianUserId.value) params.guardianUserId = checkinGuardianUserId.value;
    const res = await api.get(`${apiBase()}/checkin/client/${checkinClient.value.id}/sheet`, {
      params,
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    checkinSheet.value = res.data;
    if (!checkinGuardianUserId.value && res.data?.guardianUserId) {
      checkinGuardianUserId.value = res.data.guardianUserId;
    } else if (!checkinGuardianUserId.value && res.data?.guardians?.length) {
      checkinGuardianUserId.value = res.data.guardians[0].userId;
    }
    applyCheckinSheetToClient(res.data);
  } catch (e) {
    checkinError.value = e.response?.data?.error?.message || 'Could not load pickup info';
  } finally {
    checkinSheetLoading.value = false;
  }
}

function applyCheckinSheetToClient(sheet) {
  if (!sheet?.clientId) return;
  const idx = clients.value.findIndex((c) => Number(c.id) === Number(sheet.clientId));
  if (idx === -1) return;
  clients.value[idx] = {
    ...clients.value[idx],
    authorizedPickups: sheet.authorizedPickups || clients.value[idx].authorizedPickups,
    emergencyContacts: sheet.emergencyContacts || clients.value[idx].emergencyContacts,
    walkHome: sheet.walkHome || clients.value[idx].walkHome,
    guardians: sheet.guardians || clients.value[idx].guardians
  };
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
  if (key === 'pickup_authorization') {
    const p = checkinWaiverDraft.value || {};
    if (!p.declinePickupAuthorization) {
      const rows = Array.isArray(p.authorizedPickups) ? p.authorizedPickups : [];
      const hasPerson = rows.some((r) => String(r?.name || '').trim());
      if (!hasPerson) {
        checkinWaiverError.value = 'Add at least one pickup person or check the opt-out box.';
        return;
      }
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
    const res = await api.post(`${apiBase()}/checkin/client/waiver-section`, {
      clientId: cid,
      guardianUserId: gid,
      sectionKey: key,
      payload: checkinWaiverDraft.value,
      signatureData: sig,
      consentAcknowledged: true,
      intentToSign: true,
      action
    }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    checkinSheet.value = res.data?.sheet || checkinSheet.value;
    if (res.data?.sheet) applyCheckinSheetToClient(res.data.sheet);
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
    await api.post(`${apiBase()}/checkin/client`, { clientId: checkinClient.value.id }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
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

async function checkinClient(c) {
  await openCheckin(c);
}

async function checkinEmployee(s) {
  if (!kioskActive.value) return;
  checkingInUserId.value = s.id;
  try {
    await api.post(`${apiBase()}/checkin/employee`, { userId: s.id }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    checkins.value.push({
      clientId: null,
      userId: s.id,
      personType: 'employee',
      action: 'check_in',
      checkedInAt: new Date().toISOString()
    });
  } catch (e) {
    empPinError.value = e.response?.data?.error?.message || 'Check-in failed';
  } finally {
    checkingInUserId.value = null;
  }
}

async function checkinByPin() {
  if (!kioskActive.value) return;
  empPinError.value = '';
  empPinBusy.value = true;
  try {
    const res = await api.post(`${apiBase()}/checkin/employee-pin`, { pin: empPin.value }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    checkins.value.push({
      clientId: null,
      userId: res.data?.userId,
      personType: 'employee',
      action: 'check_in',
      checkedInAt: res.data?.checkedInAt || new Date().toISOString()
    });
    empPin.value = '';
  } catch (e) {
    empPinError.value = e.response?.data?.error?.message || 'PIN not recognized';
  } finally {
    empPinBusy.value = false;
  }
}

async function checkoutEmployee(s) {
  if (!kioskActive.value) return;
  checkingOutUserId.value = s.id;
  try {
    await api.post(`${apiBase()}/checkout/employee`, { userId: s.id }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    checkins.value.push({
      clientId: null,
      userId: s.id,
      personType: 'employee',
      action: 'check_out',
      checkedOutAt: new Date().toISOString()
    });
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Check-out failed';
  } finally {
    checkingOutUserId.value = null;
  }
}

// Resource modal
const resourceOpen = ref(false);
const resourceClient = ref(null);
function openResource(c) {
  resourceClient.value = c;
  resourceOpen.value = true;
}
function closeResource() {
  resourceOpen.value = false;
  resourceClient.value = null;
}

// Checkout modal (release)
const checkoutOpen = ref(false);
const activeClient = ref(null);
const selectedPickupKey = ref('');
const releaseMode = ref('');
const checkoutError = ref('');
const submitting = ref(false);
const sigCanvas = ref(null);
let sigCtx = null;
let drawing = false;
let lastPoint = null;
let sigDirty = false;
const photoVideo = ref(null);
const photoStream = ref(null);
const photoStreamActive = computed(() => !!photoStream.value);
const photoPreview = ref('');

function pickupKey(p) {
  return `${String(p?.source || 'pickup')}|${String(p?.name || '').trim()}|${String(p?.phone || '').trim()}`.toLowerCase();
}
function selectPickup(p) {
  selectedPickupKey.value = pickupKey(p);
  releaseMode.value = 'pickup';
}
function selectWalkHomeStaff() {
  selectedPickupKey.value = '';
  releaseMode.value = 'walk_home_staff';
}
function selectWalkHomeSelf() {
  selectedPickupKey.value = '';
  releaseMode.value = 'walk_home_self';
}
function openCheckout(client) {
  if (!kioskActive.value) return;
  activeClient.value = client;
  selectedPickupKey.value = '';
  releaseMode.value = '';
  checkoutError.value = '';
  sigDirty = false;
  photoPreview.value = '';
  checkoutOpen.value = true;
  nextTick(() => {
    if (sigCanvas.value) {
      const c = sigCanvas.value;
      c.width = c.clientWidth * window.devicePixelRatio;
      c.height = c.clientHeight * window.devicePixelRatio;
      sigCtx = c.getContext('2d');
      sigCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
      sigCtx.lineWidth = 2;
      sigCtx.lineCap = 'round';
      sigCtx.strokeStyle = '#0f172a';
      sigCtx.fillStyle = '#fff';
      sigCtx.fillRect(0, 0, c.width, c.height);
    }
    if (!photoPreview.value) startCamera();
  });
}
function closeCheckout() {
  stopCamera();
  checkoutOpen.value = false;
  activeClient.value = null;
}
function clearSig() {
  if (!sigCanvas.value || !sigCtx) return;
  sigCtx.fillStyle = '#fff';
  sigCtx.fillRect(0, 0, sigCanvas.value.width, sigCanvas.value.height);
  sigDirty = false;
}
function sigStart(e) {
  if (!sigCtx) return;
  drawing = true;
  const rect = sigCanvas.value.getBoundingClientRect();
  lastPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function sigMove(e) {
  if (!drawing || !sigCtx) return;
  const rect = sigCanvas.value.getBoundingClientRect();
  const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  sigCtx.beginPath();
  sigCtx.moveTo(lastPoint.x, lastPoint.y);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  lastPoint = p;
  sigDirty = true;
}
function sigEnd() { drawing = false; lastPoint = null; }

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    photoStream.value = stream;
    await nextTick();
    if (photoVideo.value) photoVideo.value.srcObject = stream;
  } catch (e) {
    checkoutError.value = 'Camera unavailable';
  }
}
function stopCamera() {
  if (photoStream.value) {
    photoStream.value.getTracks().forEach((t) => t.stop());
    photoStream.value = null;
  }
}
function snapPhoto() {
  if (!photoVideo.value) return;
  const v = photoVideo.value;
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext('2d').drawImage(v, 0, 0);
  photoPreview.value = canvas.toDataURL('image/jpeg', 0.85);
  stopCamera();
}
function clearPhoto() { photoPreview.value = ''; }

const canSubmitCheckout = computed(() => {
  if (!activeClient.value || activeClient.value.checkoutBlocked || !sigDirty || !photoPreview.value) return false;
  if (releaseMode.value === 'pickup') return !!selectedPickupKey.value;
  return releaseMode.value === 'walk_home_staff' || releaseMode.value === 'walk_home_self';
});

async function submitCheckout() {
  if (!canSubmitCheckout.value || submitting.value) return;
  submitting.value = true;
  checkoutError.value = '';
  try {
    const walkHomeAlone = releaseMode.value === 'walk_home_staff' || releaseMode.value === 'walk_home_self';
    const walkHomeSelfRelease = releaseMode.value === 'walk_home_self';
    let releasedToName = walkHomeSelfRelease ? 'Walk home alone (client self-release)' : 'Walk home alone';
    let releasedToRelationship = null;
    let releasedToPhone = null;
    if (releaseMode.value === 'pickup') {
      const pickup = (activeClient.value.authorizedPickups || []).find((p) => pickupKey(p) === selectedPickupKey.value);
      if (!pickup) { checkoutError.value = 'Select who is picking up.'; submitting.value = false; return; }
      releasedToName = pickup.name;
      releasedToRelationship = pickup.relationship;
      releasedToPhone = pickup.phone;
    }
    const sigData = sigCanvas.value ? sigCanvas.value.toDataURL('image/png') : '';
    const res = await api.post(`${apiBase()}/checkout`, {
      clientId: activeClient.value.id,
      releasedToName,
      releasedToRelationship,
      releasedToPhone,
      walkHomeAlone,
      walkHomeSelfRelease,
      signerSignatureData: sigData,
      signerSourceMethod: walkHomeSelfRelease ? 'walk_home_self' : 'fresh_kiosk_signature',
      photoBase64: photoPreview.value || null,
      photoContentType: photoPreview.value ? 'image/jpeg' : null
    }, { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true });
    if (res.data?.ok) {
      releases.value.unshift({
        id: res.data.releaseId,
        clientId: activeClient.value.id,
        releasedToName,
        walkHomeAlone,
        signedAt: res.data.signedAt
      });
      closeCheckout();
    }
  } catch (e) {
    checkoutError.value = e.response?.data?.error?.message || 'Could not record release';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadContext();
  clockTimer = setInterval(() => { clockNow.value = formatNow(); }, 1000);
});
onBeforeUnmount(() => {
  stopCamera();
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<style scoped>
.pe-kiosk {
  min-height: 100vh;
  background: var(--bg, #f1f5f9);
  display: flex;
  flex-direction: column;
  padding-bottom: 72px;
}
.pe-kiosk-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #fff;
  border-bottom: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.pe-kiosk-brand { display: flex; align-items: center; gap: 12px; }
.pe-kiosk-logo { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; }
.pe-kiosk-org { font-weight: 800; font-size: 1.05rem; color: var(--primary, #0f766e); }
.pe-kiosk-evt { font-size: 13px; color: var(--text-secondary, #64748b); }
.pe-kiosk-clock { font-size: 14px; font-variant-numeric: tabular-nums; color: var(--text-secondary, #64748b); }
.pe-kiosk-load { padding: 40px; text-align: center; flex: 1; }
.pe-kiosk-body { flex: 1; padding: 16px 16px 8px; max-width: 960px; width: 100%; margin: 0 auto; }

.pe-preview-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
  line-height: 1.45;
}
.pe-preview-banner strong { font-size: 14px; }

.pe-person-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}
.pe-person-tab {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 10px;
  padding: 12px 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  text-transform: capitalize;
}
.pe-person-tab.active {
  border-color: var(--primary, #0f766e);
  background: color-mix(in srgb, var(--primary, #0f766e) 10%, white);
  color: var(--primary, #0f766e);
}

.pe-kiosk-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.pe-kiosk-search { flex: 1; min-width: 160px; }
.pe-walkin-btn { white-space: nowrap; }
.pe-walkin-banner {
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
.pe-registration-qr-card { width: min(420px, 100%); text-align: center; }
.pe-reg-link-tabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 12px; }
.pe-reg-link-tab--active { border-color: var(--primary, #0f766e); background: #f0fdfa; }
.pe-reg-qr-wrap { display: flex; justify-content: center; margin: 8px 0 12px; }
.pe-reg-qr-img { width: 280px; height: 280px; border-radius: 12px; border: 1px solid var(--border, #e2e8f0); }
.pe-reg-form-title { margin: 0 0 8px; }
.pe-reg-url-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.pe-reg-url-input { flex: 1; font-size: 12px; }
.pe-reg-hint { text-align: left; margin: 0; }
.pe-panel-lead { margin: 0 0 10px; font-size: 13px; }

.pe-roster { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pe-roster--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.pe-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
}
.pe-row-main { flex: 1; min-width: 0; }
.pe-card {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s, transform 0.15s;
}
.pe-card:hover { border-color: var(--primary, #0f766e); transform: translateY(-1px); }
.pe-card--released { opacity: 0.55; cursor: default; transform: none; }
.pe-card--disabled { cursor: default; opacity: 0.85; }
.pe-card--disabled:hover { transform: none; border-color: var(--border, #e2e8f0); }
.pe-card--resource { align-items: center; text-align: center; padding: 18px 12px; }
.pe-card-initials {
  width: 48px; height: 48px; border-radius: 50%;
  background: color-mix(in srgb, var(--primary, #0f766e) 15%, white);
  color: var(--primary, #0f766e);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1rem;
}
.pe-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #075985;
  font-size: 11px;
  font-weight: 600;
}
.pe-tag--out { background: #fef3c7; color: #92400e; }
.pe-tag--warn { background: #fee2e2; color: #991b1b; }
.pe-empty { padding: 32px; text-align: center; }

.pe-pin-box {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.pe-pin-lbl { font-size: 12px; font-weight: 600; color: var(--text-secondary, #64748b); }
.pe-pin-row { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
.pe-pin-input {
  width: 100px;
  letter-spacing: 0.15em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.pe-inline-err { color: #dc2626; font-size: 12px; margin: 6px 0 0; }

.pe-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  border-top: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 -4px 20px rgba(15, 23, 42, 0.08);
  z-index: 50;
}
.pe-nav-btn {
  border: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-secondary, #475569);
}
.pe-nav-btn.active {
  background: var(--primary, #0f766e);
  border-color: var(--primary, #0f766e);
  color: #fff;
}

.pe-kiosk-modal {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 12px; z-index: 200;
}
.pe-kiosk-modal-card {
  background: #fff; border-radius: 16px; width: min(620px, 100%);
  max-height: 92vh; overflow-y: auto; padding: 20px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
}
.pe-resource-card { width: min(480px, 100%); max-height: min(88vh, 720px); overflow-y: auto; }
.pe-allergy-warn { color: #b45309; }
.pe-allergy-block, .pe-meal-block { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.pe-checkout-allergy-banner {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  margin-bottom: 12px;
  color: #92400e;
}
.pe-checkout-issue-banner {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  margin-bottom: 12px;
  color: #991b1b;
}
.pe-checkout-warn { color: #b45309; }
.pe-kiosk-modal-sub { margin: 8px 0 4px; }
.pe-kiosk-walk-options { display: grid; gap: 6px; }
.pe-kiosk-walk-option {
  width: 100%;
  text-align: left;
  background: #fff;
}
.pe-required { color: #b45309; font-weight: 600; text-transform: none; letter-spacing: 0; }
.pe-kiosk-modal-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.pe-kiosk-modal-title { font-size: 1.1rem; font-weight: 700; }
.pe-kiosk-modal-h4 { margin: 14px 0 8px; font-size: 0.85rem; font-weight: 700; color: var(--text-secondary, #475569); text-transform: uppercase; letter-spacing: 0.04em; }
.pe-info-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.pe-info-list li { padding: 10px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border, #e2e8f0); }
.pe-kiosk-modal-err { margin-bottom: 8px; }
.pe-kiosk-pickup-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.pe-kiosk-pickup-row { border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 10px 12px; cursor: pointer; }
.pe-kiosk-pickup-row--sel { border-color: var(--primary, #0f766e); background: #f0fdfa; }
.pe-kiosk-walk-row { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid var(--border); border-radius: 8px; }
.pe-kiosk-sig-wrap { display: flex; flex-direction: column; gap: 6px; }
.pe-kiosk-sig-canvas { width: 100%; height: 140px; border: 1px solid var(--border); border-radius: 8px; touch-action: none; }
.pe-kiosk-photo-video, .pe-kiosk-photo-preview { width: 100%; max-width: 280px; border-radius: 8px; }
.pe-kiosk-modal-footer { margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px; }
.pe-kiosk-modal--stack { z-index: 60; }
.pe-checkin-guardian-pick { margin-bottom: 12px; }
.pe-checkin-lbl { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.pe-checkin-waiver-banner {
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}
.pe-checkin-ok-banner {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  font-size: 13px;
}
.pe-checkin-actions { margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.pe-checkin-update-row { margin-top: 10px; }
.pe-checkin-waiver-checks { display: grid; gap: 8px; margin: 12px 0; }
.pe-checkin-check-row { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.muted { color: var(--text-secondary, #64748b); }
.small { font-size: 13px; }
</style>
