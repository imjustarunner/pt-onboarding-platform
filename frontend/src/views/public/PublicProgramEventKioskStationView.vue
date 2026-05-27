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
      </div>

      <!-- CHECK IN · CLIENT -->
      <div v-if="mainMode === 'checkin' && personMode === 'client'" class="pe-panel">
        <p class="pe-panel-lead muted">{{ pendingClients.length }} not checked in yet</p>
        <ul class="pe-roster">
          <li v-for="c in filteredPendingClients" :key="c.id" class="pe-row">
            <div class="pe-row-main">
              <strong>{{ c.fullName }}</strong>
              <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="checkingInClientId === c.id"
              @click="checkinClient(c)"
            >
              {{ checkingInClientId === c.id ? '…' : 'Check in' }}
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
              :disabled="empPinBusy"
              @input="empPin = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
            />
            <button class="btn btn-primary btn-sm" :disabled="empPinBusy || empPin.length !== 4" @click="checkinByPin">
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
              :disabled="checkingInUserId === s.id"
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
        <p class="pe-panel-lead muted">Tap a checked-in client to release with signature</p>
        <ul class="pe-roster pe-roster--grid">
          <li
            v-for="c in filteredCheckoutClients"
            :key="c.id"
            class="pe-card"
            :class="{ 'pe-card--released': releasedToday(c.id) }"
            @click="!releasedToday(c.id) && openCheckout(c)"
          >
            <strong>{{ c.fullName }}</strong>
            <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
            <span v-if="releasedToday(c.id)" class="pe-tag pe-tag--out">
              Released · {{ formatTime(releasedToday(c.id).signedAt) }}
            </span>
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
              :disabled="checkingOutUserId === s.id"
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
        <p class="pe-panel-lead muted">Checked-in clients · tap for emergency & waiver info</p>
        <ul class="pe-roster pe-roster--grid">
          <li
            v-for="c in filteredResourceClients"
            :key="c.id"
            class="pe-card pe-card--resource"
            @click="openResource(c)"
          >
            <div class="pe-card-initials">{{ initials(c.fullName) }}</div>
            <strong>{{ c.fullName }}</strong>
            <span v-if="c.emergencyContacts?.length" class="pe-tag">
              {{ c.emergencyContacts.length }} emergency contact{{ c.emergencyContacts.length !== 1 ? 's' : '' }}
            </span>
            <span v-else class="pe-tag pe-tag--warn">No emergency contacts</span>
          </li>
          <li v-if="!filteredResourceClients.length" class="pe-empty muted">
            {{ search ? 'No matches.' : 'No clients checked in yet.' }}
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
            <div class="pe-kiosk-modal-title">{{ resourceClient?.fullName }}</div>
            <div v-if="resourceClient?.identifierCode" class="muted small">ID {{ resourceClient.identifierCode }}</div>
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

        <h4 class="pe-kiosk-modal-h4">Guardians</h4>
        <ul v-if="resourceClient?.guardians?.length" class="pe-info-list">
          <li v-for="g in resourceClient.guardians" :key="g.userId">
            <strong>{{ g.name || 'Guardian' }}</strong>
            <div v-if="g.phone" class="muted small">{{ g.phone }}</div>
            <div v-if="g.email" class="muted small">{{ g.email }}</div>
          </li>
        </ul>
        <p v-else class="muted small">None linked.</p>

        <h4 class="pe-kiosk-modal-h4">Authorized pickups</h4>
        <ul v-if="resourceClient?.authorizedPickups?.length" class="pe-info-list">
          <li v-for="(p, i) in resourceClient.authorizedPickups" :key="i">
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
      </div>
    </div>

    <!-- Checkout / release modal (unchanged flow) -->
    <div v-if="checkoutOpen" class="pe-kiosk-modal" @click.self="closeCheckout">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Release {{ activeClient?.fullName }}</div>
            <div class="muted small">Tap pickup row, sign, and optionally snap a photo.</div>
          </div>
          <button class="btn btn-text" @click="closeCheckout">Close</button>
        </header>

        <div v-if="checkoutError" class="error-box pe-kiosk-modal-err">{{ checkoutError }}</div>

        <h4 class="pe-kiosk-modal-h4">Approved pickups</h4>
        <ul v-if="(activeClient?.authorizedPickups || []).length" class="pe-kiosk-pickup-list">
          <li
            v-for="(p, idx) in activeClient.authorizedPickups"
            :key="idx"
            class="pe-kiosk-pickup-row"
            :class="{ 'pe-kiosk-pickup-row--sel': selectedPickupKey === pickupKey(p) }"
            @click="selectPickup(p)"
          >
            <div>
              <strong>{{ p.name }}</strong>
              <span v-if="p.relationship" class="muted small"> ({{ p.relationship }})</span>
            </div>
            <div class="muted small">{{ p.phone || '' }}</div>
          </li>
        </ul>
        <div v-else class="muted small">No authorized pickups on file.</div>

        <h4 class="pe-kiosk-modal-h4">Walk-home authorization</h4>
        <div v-if="activeClient?.walkHome?.allowedToWalkHome">
          <label class="pe-kiosk-walk-row">
            <input type="checkbox" v-model="walkHomeAlone" />
            <span>
              <strong>Authorized to walk home alone.</strong>
              <span v-if="activeClient.walkHome.allowedWindow"> Window: {{ activeClient.walkHome.allowedWindow }}.</span>
            </span>
          </label>
        </div>
        <div v-else class="muted small">Walk-home authorization is NOT on file.</div>

        <h4 class="pe-kiosk-modal-h4">Signature</h4>
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

        <h4 class="pe-kiosk-modal-h4">Release photo (optional)</h4>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import { resolvePortalSlug } from '../../utils/orgScopedPath';

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
const search = ref('');
const clockNow = ref(formatNow());
let clockTimer = null;

const mainMode = ref('checkin');
const personMode = ref('client');

const checkingInClientId = ref(null);
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
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Could not load event';
  } finally {
    loading.value = false;
  }
}

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
  filterList(pendingClients.value, ['fullName', 'initials', 'identifierCode'])
);
const filteredPendingStaff = computed(() =>
  filterList(pendingStaff.value, ['displayName', 'firstName', 'lastName'])
);
const filteredCheckoutClients = computed(() =>
  filterList(activeCheckedInClients.value, ['fullName', 'initials', 'identifierCode'])
);
const filteredActiveStaff = computed(() =>
  filterList(activeCheckedInStaff.value, ['displayName', 'firstName', 'lastName'])
);
const filteredResourceClients = computed(() =>
  filterList(activeCheckedInClients.value, ['fullName', 'initials', 'identifierCode'])
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
function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

async function checkinClient(c) {
  checkingInClientId.value = c.id;
  try {
    await api.post(`${apiBase()}/checkin/client`, { clientId: c.id }, {
      headers: authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    checkins.value.push({
      clientId: c.id,
      userId: null,
      personType: 'client',
      action: 'check_in',
      checkedInAt: new Date().toISOString()
    });
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Check-in failed';
  } finally {
    checkingInClientId.value = null;
  }
}

async function checkinEmployee(s) {
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
const walkHomeAlone = ref(false);
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
  return `${String(p?.name || '').trim()}|${String(p?.phone || '').trim()}`.toLowerCase();
}
function selectPickup(p) {
  selectedPickupKey.value = pickupKey(p);
  walkHomeAlone.value = false;
}
function openCheckout(client) {
  activeClient.value = client;
  selectedPickupKey.value = '';
  walkHomeAlone.value = false;
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
  if (!activeClient.value || !sigDirty) return false;
  return !!selectedPickupKey.value || walkHomeAlone.value;
});

async function submitCheckout() {
  if (!canSubmitCheckout.value || submitting.value) return;
  submitting.value = true;
  checkoutError.value = '';
  try {
    let releasedToName = 'Walk home alone';
    let releasedToRelationship = null;
    let releasedToPhone = null;
    if (!walkHomeAlone.value) {
      const pickup = (activeClient.value.authorizedPickups || []).find((p) => pickupKey(p) === selectedPickupKey.value);
      if (!pickup) { checkoutError.value = 'Select a pickup or walk-home.'; submitting.value = false; return; }
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
      walkHomeAlone: walkHomeAlone.value,
      signerSignatureData: sigData,
      signerSourceMethod: 'fresh_kiosk_signature',
      photoBase64: photoPreview.value || null,
      photoContentType: photoPreview.value ? 'image/jpeg' : null
    }, { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true });
    if (res.data?.ok) {
      releases.value.unshift({
        id: res.data.releaseId,
        clientId: activeClient.value.id,
        releasedToName,
        walkHomeAlone: walkHomeAlone.value,
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

.pe-kiosk-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pe-kiosk-search { flex: 1; }
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
.pe-resource-card { width: min(480px, 100%); }
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
.muted { color: var(--text-secondary, #64748b); }
.small { font-size: 13px; }
</style>
