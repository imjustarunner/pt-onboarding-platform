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
      <div class="pe-kiosk-clock">
        <div class="pe-kiosk-clock-time">{{ clockTime }}</div>
        <div class="pe-kiosk-clock-date">{{ clockDate }}</div>
      </div>
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
        <span class="pe-preview-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><circle cx="12" cy="16" r=".75" fill="currentColor" stroke="none"/></svg>
        </span>
        <div class="pe-preview-copy">
          <strong>Preview mode.</strong>
          Today is not a scheduled event day — you can browse the roster and resource info, but check-in and check-out are
          disabled.
          <template v-if="nextEventDateLabel"> Next session: {{ nextEventDateLabel }}.</template>
        </div>
      </div>

      <!-- Person type toggle (check in / check out only) -->
      <div v-if="mainMode !== 'resource'" class="pe-person-tabs">
        <button
          type="button"
          class="pe-person-tab"
          :class="{ active: personMode === 'client' }"
          @click="personMode = 'client'"
        >
          <svg class="pe-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Client {{ mainMode === 'checkin' ? 'Check-In' : 'Check-Out' }}
        </button>
        <button
          type="button"
          class="pe-person-tab"
          :class="{ active: personMode === 'employee' }"
          @click="personMode = 'employee'"
        >
          <svg class="pe-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
          </svg>
          Employee {{ mainMode === 'checkin' ? 'Check-In' : 'Check-Out' }}
        </button>
      </div>

      <div class="pe-kiosk-toolbar">
        <label class="pe-search-wrap">
          <svg class="pe-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            v-model="search"
            class="input pe-kiosk-search"
            :placeholder="searchPlaceholder"
            autocomplete="off"
          />
        </label>
        <button type="button" class="pe-icon-btn" aria-label="Refresh roster" @click="loadContext">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>
          </svg>
          <span>Refresh</span>
        </button>
        <button
          v-if="registrationAvailable"
          type="button"
          class="btn btn-primary pe-walkin-btn"
          @click="openRegistrationQr()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>
          </svg>
          Walk-In Registration
        </button>
      </div>

      <div
        v-if="registrationAvailable && mainMode === 'checkin' && personMode === 'client'"
        class="pe-walkin-banner"
      >
        <span class="pe-walkin-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h.01"/><path d="M18 14h.01"/><path d="M14 18h.01"/><path d="M18 18h.01"/>
          </svg>
        </span>
        <div class="pe-walkin-copy">
          <strong>Walk-in today?</strong>
          <span class="muted small"> Show parents the registration QR so they can enroll on their phone while on site.</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm pe-walkin-qr-btn" @click="openRegistrationQr()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h.01"/><path d="M18 14h.01"/><path d="M14 18h.01"/><path d="M18 18h.01"/>
          </svg>
          Show QR
        </button>
      </div>

      <!-- CHECK IN · CLIENT -->
      <div v-if="mainMode === 'checkin' && personMode === 'client'" class="pe-panel">
        <div class="pe-roster-head">
          <svg class="pe-roster-head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <span>
            {{ pendingClients.length }} waiting to check in
            <template v-if="absentClients.length"> · {{ absentClients.length }} absent</template>
          </span>
        </div>
        <ul class="pe-roster">
          <li v-for="c in filteredPendingClients" :key="c.id" class="pe-row">
            <div class="pe-row-top">
              <div class="pe-row-avatar" aria-hidden="true">
                <span v-if="initials(c.fullName || c.kioskDisplayName)">{{ initials(c.fullName || c.kioskDisplayName) }}</span>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div class="pe-row-main">
                <div class="pe-row-name">
                  <strong>{{ clientDisplayName(c) }}</strong>
                  <span v-if="c.identifierCode" class="pe-row-id"> · {{ c.identifierCode }}</span>
                </div>
                <span v-if="c.confirmationStatus === 'no'" class="pe-tag pe-tag--warn">Not attending</span>
              </div>
              <div class="pe-row-actions">
                <button
                  v-if="canMarkAbsent(c)"
                  type="button"
                  class="btn btn-secondary btn-sm pe-btn-ghost"
                  :disabled="!kioskActive || absentSubmitting"
                  @click="openAbsentModal(c)"
                >
                  Mark absent
                </button>
                <button
                  type="button"
                  class="btn pe-btn-checkin"
                  :disabled="!kioskActive || (checkinOpen && checkinClient?.id === c.id)"
                  @click="openCheckin(c)"
                >
                  {{ checkinOpen && checkinClient?.id === c.id ? '…' : 'Check in' }}
                </button>
              </div>
            </div>
            <EventKioskLateContactFlow
              v-if="showLateContactForClient(c)"
              :client="c"
              :staff="staff"
              :log="lateContactForClient(c.id)"
              :disabled="!kioskActive"
              :save-url="`${apiBase()}/checkin/late-contact`"
              :auth-headers="authHeaders()"
              @updated="onLateContactUpdated"
            />
          </li>
          <li v-if="!filteredPendingClients.length" class="pe-empty muted">
            {{ search ? 'No matches.' : absentClients.length ? 'Everyone pending is checked in or marked absent.' : 'All clients are checked in.' }}
          </li>
        </ul>
        <div v-if="filteredAbsentClients.length" class="pe-absent-block">
          <h3 class="pe-absent-title">Absent today</h3>
          <ul class="pe-info-list">
            <li v-for="c in filteredAbsentClients" :key="`abs-${c.id}`">
              <strong>{{ clientDisplayName(c) }}</strong>
              <div v-if="absenceReasonForClient(c.id)" class="muted small">{{ absenceReasonForClient(c.id) }}</div>
            </li>
          </ul>
        </div>
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
            <div class="pe-row-top">
              <div class="pe-row-avatar" aria-hidden="true">{{ initials(s.displayName) }}</div>
              <div class="pe-row-main">
                <div class="pe-row-name"><strong>{{ s.displayName }}</strong></div>
              </div>
              <button
                type="button"
                class="btn pe-btn-checkin"
                :disabled="!kioskActive || checkingInUserId === s.id"
                @click="checkinEmployee(s)"
              >
                {{ checkingInUserId === s.id ? '…' : 'Check in' }}
              </button>
            </div>
          </li>
          <li v-if="!filteredPendingStaff.length" class="pe-empty muted">
            {{ search ? 'No matches.' : 'All employees are checked in.' }}
          </li>
        </ul>
      </div>

      <!-- CHECK OUT · CLIENT (release flow) -->
      <div v-else-if="mainMode === 'checkout' && personMode === 'client'" class="pe-panel">
        <p class="pe-panel-lead muted">
          {{ kioskActive ? 'Tap a checked-in client to check out, or view checkout details' : 'Checkout is available on event days only' }}
        </p>

        <template v-if="filteredCheckoutPending.length">
          <h3 class="pe-roster-section-title">Waiting to check out</h3>
          <ul class="pe-roster pe-roster--grid">
            <li
              v-for="c in filteredCheckoutPending"
              :key="`pending-${c.id}`"
              class="pe-card"
              :class="{ 'pe-card--disabled': !kioskActive }"
              @click="kioskActive && openCheckout(c)"
            >
              <strong>{{ clientDisplayName(c) }}</strong>
              <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
              <span v-if="checkinRecordForClient(c.id)?.checkedInAt" class="muted small">
                Checked in {{ formatTime(checkinRecordForClient(c.id).checkedInAt) }}
              </span>
              <span v-if="c.checkoutBlocked" class="pe-tag pe-tag--warn">Release info missing</span>
              <span v-else class="pe-tag pe-tag--action">Check out</span>
            </li>
          </ul>
        </template>

        <template v-if="filteredCheckoutDone.length">
          <h3 class="pe-roster-section-title">Checked out</h3>
          <ul class="pe-roster pe-roster--grid">
            <li
              v-for="c in filteredCheckoutDone"
              :key="`done-${c.id}`"
              class="pe-card pe-card--released"
              :class="{ 'pe-card--disabled': !kioskActive }"
              @click="openCheckoutDetail(c)"
            >
              <strong>{{ clientDisplayName(c) }}</strong>
              <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
              <span class="pe-tag pe-tag--out">
                Checked out {{ formatTime(releasedToday(c.id).signedAt) }}
              </span>
              <span class="muted small">
                To {{ releaseRecipientLabel(releasedToday(c.id)) }}
              </span>
              <span class="pe-tag pe-tag--view">View details</span>
            </li>
          </ul>
        </template>

        <p v-if="!filteredCheckoutPending.length && !filteredCheckoutDone.length" class="pe-empty muted">
          {{ search ? 'No matches.' : 'No clients checked in today.' }}
        </p>
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
          All participants · tap for emergency & waiver info
        </p>

        <template v-if="filteredResourceCheckedIn.length">
          <h3 class="pe-roster-section-title">Checked in</h3>
          <ul class="pe-roster pe-roster--grid">
            <li
              v-for="c in filteredResourceCheckedIn"
              :key="`in-${c.id}`"
              class="pe-card pe-card--resource"
              @click="openResource(c)"
            >
              <div class="pe-card-initials">{{ initials(c.fullName || c.kioskDisplayName) }}</div>
              <strong>{{ clientDisplayName(c) }}</strong>
              <span v-if="checkinRecordForClient(c.id)?.checkedInAt" class="pe-tag pe-tag--in">
                In since {{ formatTime(checkinRecordForClient(c.id).checkedInAt) }}
              </span>
              <span v-if="c.emergencyContacts?.length" class="pe-tag">
                {{ c.emergencyContacts.length }} emergency contact{{ c.emergencyContacts.length !== 1 ? 's' : '' }}
              </span>
              <span v-else class="pe-tag pe-tag--warn">No emergency contacts</span>
              <span v-if="allergySummary(c.allergies)" class="pe-tag pe-tag--warn">
                Allergies: {{ allergySummary(c.allergies) }}
              </span>
              <span v-if="c.allergies?.noSnacks" class="pe-tag pe-tag--warn">No snacks</span>
              <span v-else-if="approvedSnacksSummary(c.allergies)" class="pe-tag">
                Snacks: {{ approvedSnacksSummary(c.allergies) }}
              </span>
              <span v-else-if="clientHasAllergyInfo(c) && c.allergies?.applyNone" class="pe-tag">No medical info</span>
              <span v-if="c.authorizedPickups?.length" class="pe-tag">
                {{ c.authorizedPickups.length }} pickup{{ c.authorizedPickups.length !== 1 ? 's' : '' }}
              </span>
            </li>
          </ul>
        </template>

        <template v-if="filteredResourceNotCheckedIn.length">
          <h3 class="pe-roster-section-title">Not checked in yet</h3>
          <ul class="pe-roster pe-roster--grid">
            <li
              v-for="c in filteredResourceNotCheckedIn"
              :key="`out-${c.id}`"
              class="pe-card pe-card--resource pe-card--muted"
              @click="openResource(c)"
            >
              <div class="pe-card-initials">{{ initials(c.fullName || c.kioskDisplayName) }}</div>
              <strong>{{ clientDisplayName(c) }}</strong>
              <span v-if="personAbsentToday('client', c.id)" class="pe-tag pe-tag--warn">Absent today</span>
              <span v-else class="pe-tag">Not checked in</span>
              <span v-if="c.emergencyContacts?.length" class="pe-tag">
                {{ c.emergencyContacts.length }} emergency contact{{ c.emergencyContacts.length !== 1 ? 's' : '' }}
              </span>
              <span v-else class="pe-tag pe-tag--warn">No emergency contacts</span>
              <span v-if="allergySummary(c.allergies)" class="pe-tag pe-tag--warn">
                Allergies: {{ allergySummary(c.allergies) }}
              </span>
            </li>
          </ul>
        </template>

        <p v-if="!filteredResourceCheckedIn.length && !filteredResourceNotCheckedIn.length" class="pe-empty muted">
          {{ search ? 'No matches.' : 'No confirmed participants yet.' }}
        </p>
      </div>
    </section>

    <!-- Bottom nav -->
    <nav v-if="!loading && !loadError" class="pe-bottom-nav" aria-label="Kiosk mode">
      <button type="button" class="pe-nav-btn" :class="{ active: mainMode === 'checkin' }" @click="mainMode = 'checkin'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/>
        </svg>
        Check In
      </button>
      <button type="button" class="pe-nav-btn" :class="{ active: mainMode === 'checkout' }" @click="mainMode = 'checkout'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/>
        </svg>
        Check Out
      </button>
      <button type="button" class="pe-nav-btn" :class="{ active: mainMode === 'resource' }" @click="mainMode = 'resource'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        Resources
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
          <p v-if="resourceClient.allergies.notes" class="small">
            <strong>Medical notes:</strong> {{ resourceClient.allergies.notes }}
          </p>
        </div>
        <p v-else class="muted small">None on file.</p>

        <h4 class="pe-kiosk-modal-h4">Approved snacks</h4>
        <div v-if="resourceClient?.allergies" class="pe-allergy-block">
          <p v-if="resourceClient.allergies.noSnacks" class="small pe-allergy-warn">
            <strong>Do not give snacks</strong> to this child.
          </p>
          <p v-else-if="approvedSnacksSummary(resourceClient.allergies)" class="small">
            {{ approvedSnacksSummary(resourceClient.allergies) }}
          </p>
          <p v-else class="muted small">No approved snack preferences on file.</p>
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

    <EventKioskCheckinWizard
      :open="checkinOpen"
      :client="checkinClient"
      :sheet-url="checkinSheetUrl"
      :waiver-url="`${apiBase()}/checkin/client/waiver-section`"
      :checkin-url="`${apiBase()}/checkin/client`"
      :auth-headers="authHeaders"
      :display-name="clientDisplayName"
      @close="closeCheckin"
      @checked-in="onCheckinComplete"
      @sheet-updated="applyCheckinSheetToClient"
    />

    <!-- Mark absent modal -->
    <div v-if="absentOpen" class="pe-kiosk-modal" @click.self="closeAbsentModal">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Mark {{ clientDisplayName(absentClient) }} absent today</div>
            <div class="muted small">Family confirmed they are not attending this session.</div>
          </div>
          <button class="btn btn-text" @click="closeAbsentModal">Close</button>
        </header>

        <div v-if="absentError" class="error-box pe-kiosk-modal-err">{{ absentError }}</div>

        <label class="pe-checkin-lbl">Reason</label>
        <select v-model="absentReasonCode" class="input">
          <option v-for="r in absenceReasonOptions" :key="r.code" :value="r.code">{{ r.label }}</option>
        </select>

        <label v-if="absentReasonCode === 'other'" class="pe-checkin-lbl">Details</label>
        <textarea
          v-if="absentReasonCode === 'other'"
          v-model="absentReasonNotes"
          class="input pe-absent-notes"
          rows="3"
          maxlength="400"
          placeholder="Briefly describe why they are absent today"
        />

        <label v-else class="pe-checkin-lbl pe-checkin-lbl--optional">Additional notes (optional)</label>
        <textarea
          v-if="absentReasonCode !== 'other'"
          v-model="absentReasonNotes"
          class="input pe-absent-notes"
          rows="2"
          maxlength="400"
          placeholder="Optional context for staff"
        />

        <div class="pe-checkin-actions">
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

    <!-- Checkout detail (already checked out) -->
    <div v-if="checkoutDetailOpen" class="pe-kiosk-modal" @click.self="closeCheckoutDetail">
      <div class="pe-kiosk-modal-card pe-checkout-detail-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">{{ clientDisplayName(checkoutDetailClient) }}</div>
            <div class="muted small">Checkout record for today</div>
          </div>
          <button class="btn btn-text" type="button" @click="closeCheckoutDetail">Close</button>
        </header>

        <dl v-if="checkoutDetailClient && releasedToday(checkoutDetailClient.id)" class="pe-checkout-detail">
          <div class="pe-checkout-detail-row">
            <dt>Checked in</dt>
            <dd>{{ formatDateTime(checkinRecordForClient(checkoutDetailClient.id)?.checkedInAt) }}</dd>
          </div>
          <div v-if="checkinRecordForClient(checkoutDetailClient.id)?.checkedInByName" class="pe-checkout-detail-row">
            <dt>Checked in by</dt>
            <dd>
              {{ checkinRecordForClient(checkoutDetailClient.id).checkedInByName }}
              <span
                v-if="checkinRecordForClient(checkoutDetailClient.id).checkedInByRelationship"
                class="muted"
              >
                ({{ checkinRecordForClient(checkoutDetailClient.id).checkedInByRelationship }})
              </span>
            </dd>
          </div>
          <div class="pe-checkout-detail-row">
            <dt>Checked out</dt>
            <dd>{{ formatDateTime(releasedToday(checkoutDetailClient.id).signedAt) }}</dd>
          </div>
          <div class="pe-checkout-detail-row">
            <dt>Time on site</dt>
            <dd>{{ checkoutDuration(checkoutDetailClient.id) }}</dd>
          </div>
          <div class="pe-checkout-detail-row">
            <dt>Released to</dt>
            <dd>{{ releaseRecipientLabel(releasedToday(checkoutDetailClient.id)) }}</dd>
          </div>
          <div v-if="releasedToday(checkoutDetailClient.id).walkHomeAlone" class="pe-checkout-detail-row">
            <dt>Release type</dt>
            <dd>Walk home alone</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- Checkout / release modal -->
    <div v-if="checkoutOpen" class="pe-kiosk-modal" @click.self="closeCheckout">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Release {{ clientDisplayName(activeClient) }}</div>
            <div class="muted small">Tap an approved pickup or walk-home option, then sign and take a release photo.</div>
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
          <div v-if="checkoutBlockReason === checkoutSelectReason" class="pe-checkout-select-hint">
            {{ checkoutSelectReason }}
          </div>

          <h4 class="pe-kiosk-modal-h4">Who is picking up?</h4>

          <p v-if="guardianPickupOptions(activeClient).length" class="pe-kiosk-modal-sub muted small">Guardians</p>
          <ul v-if="guardianPickupOptions(activeClient).length" class="pe-kiosk-pickup-list">
            <li
              v-for="(p, idx) in guardianPickupOptions(activeClient)"
              :key="`cg-${idx}`"
              class="pe-kiosk-pickup-row"
              :class="{
                'pe-kiosk-pickup-row--sel': releaseMode === 'pickup' && selectedPickupKey === pickupKey(p),
                'pe-kiosk-pickup-row--hint': !releaseMode
              }"
              @click="selectPickup(p)"
            >
              <div>
                <strong>{{ p.name }}</strong>
                <span class="muted small"> (Guardian)</span>
                <span v-if="!releaseMode" class="pe-kiosk-pickup-tap muted small"> · Tap to select</span>
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
              :class="{
                'pe-kiosk-pickup-row--sel': releaseMode === 'pickup' && selectedPickupKey === pickupKey(p),
                'pe-kiosk-pickup-row--hint': !releaseMode
              }"
              @click="selectPickup(p)"
            >
              <div>
                <strong>{{ p.name }}</strong>
                <span v-if="p.relationship" class="muted small"> ({{ p.relationship }})</span>
                <span v-if="!releaseMode" class="pe-kiosk-pickup-tap muted small"> · Tap to select</span>
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
              :class="{
                'pe-kiosk-pickup-row--sel': releaseMode === 'walk_home_staff',
                'pe-kiosk-pickup-row--hint': !releaseMode
              }"
              @click="selectWalkHomeStaff"
            >
              <div>
                <strong>Walk home alone</strong>
                <span class="muted small"> — staff attestation (employee signs below)</span>
                <span v-if="!releaseMode" class="pe-kiosk-pickup-tap muted small"> · Tap to select</span>
              </div>
              <div v-if="activeClient.walkHome.allowedWindow" class="muted small">
                Window: {{ activeClient.walkHome.allowedWindow }}
              </div>
            </button>
            <button
              v-if="activeClient?.canSelfWalkHome"
              type="button"
              class="pe-kiosk-pickup-row pe-kiosk-walk-option"
              :class="{
                'pe-kiosk-pickup-row--sel': releaseMode === 'walk_home_self',
                'pe-kiosk-pickup-row--hint': !releaseMode
              }"
              @click="selectWalkHomeSelf"
            >
              <div>
                <strong>Walk home alone</strong>
                <span class="muted small"> — client self-release (age {{ activeClient.ageYears }}+, client signs below)</span>
                <span v-if="!releaseMode" class="pe-kiosk-pickup-tap muted small"> · Tap to select</span>
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
          <p v-if="checkoutBlockReason && checkoutBlockReason !== checkoutSelectReason" class="pe-checkout-footer-hint">
            {{ checkoutBlockReason }}
          </p>
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
import EventKioskLateContactFlow from '../../components/eventKiosk/EventKioskLateContactFlow.vue';
import EventKioskCheckinWizard from '../../components/eventKiosk/EventKioskCheckinWizard.vue';

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
const absenceReasonOptions = ref([]);
const lateContacts = ref([]);
const kioskDay = ref({});
const search = ref('');
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
    absenceReasonOptions.value = Array.isArray(res.data?.absenceReasons) ? res.data.absenceReasons : defaultAbsenceReasons();
    lateContacts.value = Array.isArray(res.data?.lateContacts) ? res.data.lateContacts : [];
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
function personAbsentToday(personType, id) {
  return checkins.value.some(
    (c) => c.personType === personType && c.action === 'absent'
      && ((personType === 'client' && Number(c.clientId) === Number(id))
        || (personType === 'employee' && Number(c.userId) === Number(id)))
  );
}
function absenceReasonForClient(clientId) {
  const row = checkins.value.find(
    (c) => c.personType === 'client' && c.action === 'absent' && Number(c.clientId) === Number(clientId)
  );
  return row?.absenceReason || '';
}
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
  return client?.confirmationStatus === 'no' && !personAbsentToday('client', client.id);
}
function lateContactForClient(clientId) {
  return lateContacts.value.find((row) => Number(row.clientId) === Number(clientId)) || null;
}
function showLateContactForClient(client) {
  if (personCheckedIn('client', client.id) || personAbsentToday('client', client.id)) return false;
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
function personCheckedOut(personType, id) {
  return checkins.value.some(
    (c) => c.personType === personType && c.action === 'check_out'
      && ((personType === 'client' && Number(c.clientId) === Number(id))
        || (personType === 'employee' && Number(c.userId) === Number(id)))
  );
}

const pendingClients = computed(() =>
  clients.value.filter((c) => !personCheckedIn('client', c.id) && !personAbsentToday('client', c.id))
);
const absentClients = computed(() =>
  clients.value.filter((c) => personAbsentToday('client', c.id))
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
const filteredAbsentClients = computed(() =>
  filterList(absentClients.value, ['fullName', 'kioskDisplayName', 'initials', 'identifierCode'])
);
const filteredPendingStaff = computed(() =>
  filterList(pendingStaff.value, ['displayName', 'firstName', 'lastName'])
);
const filteredCheckoutClients = computed(() =>
  filterList(
    clients.value.filter((c) => personCheckedIn('client', c.id)),
    ['fullName', 'kioskDisplayName', 'initials', 'identifierCode']
  )
);
const filteredCheckoutPending = computed(() =>
  filteredCheckoutClients.value.filter((c) => !releasedToday(c.id))
);
const filteredCheckoutDone = computed(() =>
  filteredCheckoutClients.value.filter((c) => releasedToday(c.id))
);
const filteredActiveStaff = computed(() =>
  filterList(activeCheckedInStaff.value, ['displayName', 'firstName', 'lastName'])
);
const resourceCheckedInClients = computed(() =>
  clients.value.filter((c) => personCheckedIn('client', c.id) && !releasedToday(c.id))
);
const resourceNotCheckedInClients = computed(() =>
  clients.value.filter((c) => !personCheckedIn('client', c.id))
);
const filteredResourceCheckedIn = computed(() =>
  filterList(resourceCheckedInClients.value, ['fullName', 'kioskDisplayName', 'initials', 'identifierCode'])
);
const filteredResourceNotCheckedIn = computed(() =>
  filterList(resourceNotCheckedInClients.value, ['fullName', 'kioskDisplayName', 'initials', 'identifierCode'])
);

const searchPlaceholder = computed(() => {
  if (mainMode.value === 'resource') return 'Search participants…';
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
function checkinRecordForClient(clientId) {
  return checkins.value.find(
    (c) => c.personType === 'client' && c.action === 'check_in' && Number(c.clientId) === Number(clientId)
  ) || null;
}
function formatNow() {
  try { return new Date().toLocaleTimeString(); } catch { return ''; }
}
function formatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}
function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}
function checkoutDuration(clientId) {
  const checkin = checkinRecordForClient(clientId);
  const release = releasedToday(clientId);
  if (!checkin?.checkedInAt || !release?.signedAt) return '—';
  return formatDuration(new Date(release.signedAt) - new Date(checkin.checkedInAt));
}
function releaseRecipientLabel(release) {
  if (!release) return '—';
  let label = release.releasedToName || '—';
  if (release.releasedToRelationship) label += ` (${release.releasedToRelationship})`;
  return label;
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

const checkinOpen = ref(false);
const checkinClient = ref(null);

const checkinSheetUrl = computed(() => {
  const cid = checkinClient.value?.id;
  if (!cid) return '';
  return `${apiBase()}/checkin/client/${cid}/sheet`;
});

async function openCheckin(c) {
  if (!kioskActive.value) return;
  checkinClient.value = c;
  checkinOpen.value = true;
}

function closeCheckin() {
  checkinOpen.value = false;
  checkinClient.value = null;
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
    allergies: sheet.allergies || clients.value[idx].allergies,
    guardians: sheet.guardians || clients.value[idx].guardians
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
    const res = await api.post(`${apiBase()}/checkin/client/absent`, {
      clientId: absentClient.value.id,
      reasonCode: absentReasonCode.value,
      reasonNotes: absentReasonNotes.value.trim() || undefined
    }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
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
const checkoutDetailOpen = ref(false);
const checkoutDetailClient = ref(null);
const activeClient = ref(null);
const selectedPickupKey = ref('');
const releaseMode = ref('');
const checkoutError = ref('');
const submitting = ref(false);
const sigCanvas = ref(null);
let sigCtx = null;
let drawing = false;
let lastPoint = null;
const sigDirty = ref(false);
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
  sigDirty.value = false;
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

    const pickups = [
      ...guardianPickupOptions(client),
      ...otherPickupOptions(client)
    ];
    const hasWalk = client?.walkHome?.allowedToWalkHome === true;
    if (pickups.length === 1 && !hasWalk) {
      selectPickup(pickups[0]);
    } else if (!pickups.length && hasWalk) {
      selectWalkHomeStaff();
    }
  });
}
function closeCheckout() {
  stopCamera();
  checkoutOpen.value = false;
  activeClient.value = null;
}
function openCheckoutDetail(client) {
  checkoutDetailClient.value = client;
  checkoutDetailOpen.value = true;
}
function closeCheckoutDetail() {
  checkoutDetailOpen.value = false;
  checkoutDetailClient.value = null;
}
function clearSig() {
  if (!sigCanvas.value || !sigCtx) return;
  sigCtx.fillStyle = '#fff';
  sigCtx.fillRect(0, 0, sigCanvas.value.width, sigCanvas.value.height);
  sigDirty.value = false;
}
function sigStart(e) {
  if (!sigCtx || !sigCanvas.value) return;
  e.preventDefault();
  try {
    sigCanvas.value.setPointerCapture(e.pointerId);
  } catch {
    /* optional */
  }
  drawing = true;
  const rect = sigCanvas.value.getBoundingClientRect();
  lastPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  sigCtx.beginPath();
  sigCtx.arc(lastPoint.x, lastPoint.y, 1.2, 0, Math.PI * 2);
  sigCtx.fill();
  sigDirty.value = true;
}
function sigMove(e) {
  if (!drawing || !sigCtx || !sigCanvas.value) return;
  e.preventDefault();
  const rect = sigCanvas.value.getBoundingClientRect();
  const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  sigCtx.beginPath();
  sigCtx.moveTo(lastPoint.x, lastPoint.y);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  lastPoint = p;
  sigDirty.value = true;
}
function sigEnd(e) {
  drawing = false;
  lastPoint = null;
  try {
    sigCanvas.value?.releasePointerCapture?.(e?.pointerId);
  } catch {
    /* optional */
  }
}

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

const checkoutSelectReason = computed(() => {
  const client = activeClient.value;
  if (!client || client.checkoutBlocked) return '';
  const pickupCount = guardianPickupOptions(client).length + otherPickupOptions(client).length;
  const hasWalk = client?.walkHome?.allowedToWalkHome === true;
  if (pickupCount && hasWalk) {
    return 'Select who is picking up, or tap walk-home authorization below.';
  }
  if (pickupCount) return 'Tap the person who is picking up to select them.';
  if (hasWalk) return 'Tap walk-home authorization below to select release type.';
  return 'Select a release option to continue.';
});

const checkoutBlockReason = computed(() => {
  const client = activeClient.value;
  if (!client || client.checkoutBlocked) return '';
  if (!releaseMode.value) return checkoutSelectReason.value;
  if (!sigDirty.value) return 'Draw a signature above to continue.';
  if (!photoPreview.value) return 'Take a release photo above to continue.';
  if (releaseMode.value === 'pickup' && !selectedPickupKey.value) {
    return 'Tap the person who is picking up to select them.';
  }
  return '';
});

const canSubmitCheckout = computed(() => !checkoutBlockReason.value);

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
        releasedToRelationship,
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
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
});
onBeforeUnmount(() => {
  stopCamera();
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<style scoped>
.pe-kiosk {
  --pe-primary: var(--primary, #1b5e4b);
  --pe-primary-dark: #164a3c;
  --pe-surface: #ffffff;
  --pe-bg: #eef2f0;
  --pe-border: #d8e0dc;
  --pe-muted: #64748b;
  min-height: 100vh;
  background: var(--pe-bg);
  display: flex;
  flex-direction: column;
  padding-bottom: 92px;
  color: #1e293b;
}
.pe-kiosk-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--pe-surface);
  border-bottom: 1px solid var(--pe-border);
}
.pe-kiosk-brand { display: flex; align-items: center; gap: 14px; }
.pe-kiosk-logo { width: 48px; height: 48px; object-fit: contain; border-radius: 10px; }
.pe-kiosk-org { font-weight: 800; font-size: 1.15rem; color: var(--pe-primary); line-height: 1.2; }
.pe-kiosk-evt { font-size: 13px; color: var(--pe-muted); margin-top: 2px; }
.pe-kiosk-clock { text-align: right; line-height: 1.25; }
.pe-kiosk-clock-time { font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #334155; }
.pe-kiosk-clock-date { font-size: 12px; color: var(--pe-muted); margin-top: 2px; }
.pe-kiosk-load { padding: 40px; text-align: center; flex: 1; }
.pe-kiosk-body { flex: 1; padding: 16px 18px 12px; max-width: 920px; width: 100%; margin: 0 auto; }

.pe-preview-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
  line-height: 1.5;
}
.pe-preview-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fef3c7;
  color: #b45309;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pe-preview-icon svg { width: 16px; height: 16px; }
.pe-preview-copy strong { font-weight: 800; }

.pe-person-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.pe-person-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--pe-border);
  background: var(--pe-surface);
  border-radius: 14px;
  padding: 14px 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  color: var(--pe-muted);
}
.pe-tab-icon { width: 18px; height: 18px; flex-shrink: 0; }
.pe-person-tab.active {
  border-color: var(--pe-primary);
  background: var(--pe-primary);
  color: #fff;
  box-shadow: 0 4px 14px rgba(27, 94, 75, 0.22);
}

.pe-kiosk-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pe-search-wrap {
  flex: 1;
  min-width: 200px;
  position: relative;
  display: flex;
  align-items: center;
}
.pe-search-icon {
  position: absolute;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #94a3b8;
  pointer-events: none;
}
.pe-kiosk-search {
  width: 100%;
  padding-left: 42px;
  border-radius: 12px;
  border: 1px solid var(--pe-border);
  background: var(--pe-surface);
  min-height: 44px;
}
.pe-icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--pe-border);
  background: var(--pe-surface);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  min-height: 44px;
}
.pe-icon-btn svg { width: 16px; height: 16px; }
.pe-walkin-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  border-radius: 12px;
  min-height: 44px;
  padding: 10px 16px;
  background: var(--pe-primary);
  border-color: var(--pe-primary);
}
.pe-walkin-btn svg { width: 16px; height: 16px; }

.pe-walkin-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 14px;
  border: 1px solid var(--pe-border);
  background: #f4f7f5;
}
.pe-walkin-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--pe-surface);
  border: 1px solid var(--pe-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pe-primary);
}
.pe-walkin-icon svg { width: 20px; height: 20px; }
.pe-walkin-copy { flex: 1; min-width: 0; line-height: 1.45; }
.pe-walkin-qr-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--pe-primary);
  border-color: var(--pe-primary);
  flex-shrink: 0;
}
.pe-walkin-qr-btn svg { width: 14px; height: 14px; }

.pe-registration-qr-card { width: min(420px, 100%); text-align: center; }
.pe-reg-link-tabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 12px; }
.pe-reg-link-tab--active { border-color: var(--pe-primary); background: #f0fdfa; }
.pe-reg-qr-wrap { display: flex; justify-content: center; margin: 8px 0 12px; }
.pe-reg-qr-img { width: 280px; height: 280px; border-radius: 12px; border: 1px solid var(--pe-border); }
.pe-reg-form-title { margin: 0 0 8px; }
.pe-reg-url-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.pe-reg-url-input { flex: 1; font-size: 12px; }
.pe-reg-hint { text-align: left; margin: 0; }
.pe-panel-lead { margin: 0 0 12px; font-size: 13px; color: var(--pe-muted); }
.pe-roster-section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pe-roster-section-title:not(:first-child) { margin-top: 20px; }

.pe-roster-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}
.pe-roster-head-icon { width: 18px; height: 18px; color: var(--pe-primary); }

.pe-roster { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.pe-roster--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.pe-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--pe-surface);
  border: 1px solid var(--pe-border);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.pe-row-top {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.pe-row-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pe-primary) 12%, white);
  color: var(--pe-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.pe-row-avatar svg { width: 22px; height: 22px; }
.pe-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.pe-row-name { line-height: 1.3; }
.pe-row-name strong { font-size: 0.98rem; color: #0f172a; }
.pe-row-id { color: var(--pe-muted); font-weight: 500; font-size: 0.92rem; }
.pe-row-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.pe-btn-checkin {
  background: var(--pe-surface);
  border: 1.5px solid var(--pe-primary);
  color: var(--pe-primary);
  font-weight: 700;
  font-size: 13px;
  border-radius: 10px;
  padding: 8px 16px;
  min-width: 92px;
}
.pe-btn-checkin:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pe-primary) 8%, white);
}
.pe-btn-checkin:disabled { opacity: 0.55; }
.pe-btn-ghost {
  border-radius: 10px;
  font-size: 12px;
}
.pe-roster .ek-late { margin-top: 0; border-color: var(--pe-border); background: #f8faf9; }
.pe-absent-block { margin-top: 18px; padding-top: 14px; border-top: 1px dashed var(--pe-border); }
.pe-absent-title { margin: 0 0 8px; font-size: 14px; }
.pe-absent-notes { margin-top: 6px; resize: vertical; }
.pe-checkin-lbl--optional { margin-top: 12px; }
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
.pe-card--released { opacity: 0.92; border-color: #fde68a; background: #fffbeb; }
.pe-card--released:hover { border-color: #f59e0b; }
.pe-card--muted { opacity: 0.88; }
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
.pe-tag--in { background: #dcfce7; color: #166534; }
.pe-tag--action { background: #dbeafe; color: #1d4ed8; }
.pe-tag--view { background: #f1f5f9; color: #475569; }
.pe-tag--warn { background: #fee2e2; color: #991b1b; }
.pe-empty { padding: 32px; text-align: center; }

.pe-checkout-detail { margin: 0; display: flex; flex-direction: column; gap: 14px; }
.pe-checkout-detail-row { display: grid; grid-template-columns: 120px 1fr; gap: 8px 16px; align-items: baseline; }
.pe-checkout-detail-row dt { margin: 0; font-size: 12px; font-weight: 700; color: var(--pe-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.pe-checkout-detail-row dd { margin: 0; font-size: 15px; color: #0f172a; }
.pe-checkout-detail-card { max-width: 480px; }

.pe-pin-box {
  background: var(--pe-surface);
  border: 1px solid var(--pe-border);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 14px;
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
  gap: 10px;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--pe-surface);
  border-top: 1px solid var(--pe-border);
  box-shadow: 0 -6px 24px rgba(15, 23, 42, 0.06);
  z-index: 50;
}
.pe-nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--pe-border);
  background: var(--pe-surface);
  border-radius: 14px;
  padding: 12px 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--pe-muted);
  min-height: 64px;
}
.pe-nav-btn svg { width: 20px; height: 20px; }
.pe-nav-btn.active {
  background: var(--pe-primary);
  border-color: var(--pe-primary);
  color: #fff;
  box-shadow: 0 4px 14px rgba(27, 94, 75, 0.25);
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
.pe-kiosk-pickup-row--hint { border-style: dashed; cursor: pointer; }
.pe-kiosk-pickup-tap { font-style: italic; }
.pe-checkout-select-hint {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
}
.pe-checkout-footer-hint {
  flex: 1 1 100%;
  margin: 0 0 4px;
  font-size: 13px;
  color: #b45309;
}
.pe-kiosk-modal-footer { flex-wrap: wrap; }
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
.pe-checkin-emergency-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.pe-checkin-confirm-block {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
}
.pe-checkin-review-lead { margin: 0 0 8px; }
.pe-checkin-pickup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.pe-checkin-waiver-checks { display: grid; gap: 8px; margin: 12px 0; }
.pe-checkin-check-row { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.muted { color: var(--text-secondary, #64748b); }
.small { font-size: 13px; }
</style>
