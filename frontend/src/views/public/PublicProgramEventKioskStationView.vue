<template>
  <div class="pe-kiosk">
    <header class="pe-kiosk-hdr">
      <div class="pe-kiosk-brand">
        <img v-if="branding.agencyLogo" :src="branding.agencyLogo" alt="Agency" class="pe-kiosk-logo" />
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

    <section v-else-if="loadError" class="pe-kiosk-err">
      <div class="error-box">{{ loadError }}</div>
      <button class="btn btn-secondary" @click="loadContext">Retry</button>
    </section>

    <section v-else class="pe-kiosk-body">
      <div class="pe-kiosk-toolbar">
        <input
          v-model="search"
          class="input pe-kiosk-search"
          placeholder="Search by name or ID…"
          autocomplete="off"
        />
        <button class="btn btn-secondary btn-sm" @click="loadContext">Refresh</button>
      </div>

      <ul class="pe-kiosk-roster">
        <li
          v-for="c in filteredClients"
          :key="c.id"
          class="pe-kiosk-row"
          :class="{ 'pe-kiosk-row--released': releasedToday(c.id) }"
          @click="openCheckout(c)"
        >
          <div class="pe-kiosk-row-name">
            <strong>{{ c.fullName }}</strong>
            <span v-if="c.identifierCode" class="muted small"> · {{ c.identifierCode }}</span>
          </div>
          <div class="pe-kiosk-row-meta">
            <span v-if="releasedToday(c.id)" class="pe-kiosk-row-tag pe-kiosk-row-tag--out">
              Released to {{ releasedToday(c.id).releasedToName }}
              ({{ formatTime(releasedToday(c.id).signedAt) }})
            </span>
            <span v-else class="pe-kiosk-row-tag">Tap to release</span>
          </div>
        </li>
        <li v-if="!filteredClients.length" class="pe-kiosk-empty muted">
          {{ search ? 'No clients match that search.' : 'No clients enrolled in this event yet.' }}
        </li>
      </ul>
    </section>

    <!-- Checkout modal -->
    <div v-if="checkoutOpen" class="pe-kiosk-modal" @click.self="closeCheckout">
      <div class="pe-kiosk-modal-card">
        <header class="pe-kiosk-modal-hdr">
          <div>
            <div class="pe-kiosk-modal-title">Release {{ activeClient?.fullName }}</div>
            <div class="muted small">Tap the row of the person picking up, sign for release, and (optionally) snap a photo.</div>
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
        <div v-else class="muted small">No authorized pickups on file. Confirm with admin before releasing.</div>

        <h4 class="pe-kiosk-modal-h4">Walk-home authorization</h4>
        <div v-if="activeClient?.walkHome?.allowedToWalkHome">
          <label class="pe-kiosk-walk-row">
            <input type="checkbox" v-model="walkHomeAlone" />
            <span>
              <strong>Authorized to walk home alone.</strong>
              <span v-if="activeClient.walkHome.allowedWindow"> Window: {{ activeClient.walkHome.allowedWindow }}.</span>
              <span v-if="activeClient.walkHome.conditions"> Conditions: {{ activeClient.walkHome.conditions }}.</span>
            </span>
          </label>
        </div>
        <div v-else class="muted small">Walk-home authorization is NOT on file for this client.</div>

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
            <span class="muted small">Sign with finger or stylus to record release.</span>
          </div>
        </div>

        <h4 class="pe-kiosk-modal-h4">Release photo (optional)</h4>
        <div class="pe-kiosk-photo-wrap">
          <video v-if="photoStreamActive" ref="photoVideo" class="pe-kiosk-photo-video" autoplay playsinline muted />
          <img v-else-if="photoPreview" :src="photoPreview" class="pe-kiosk-photo-preview" alt="Release photo" />
          <div class="pe-kiosk-photo-actions">
            <button v-if="!photoStreamActive && !photoPreview" class="btn btn-secondary btn-sm" type="button" @click="startCamera">
              Start camera
            </button>
            <button v-if="photoStreamActive" class="btn btn-primary btn-sm" type="button" @click="snapPhoto">
              Snap photo
            </button>
            <button v-if="photoPreview" class="btn btn-secondary btn-sm" type="button" @click="clearPhoto">
              Retake
            </button>
          </div>
        </div>

        <footer class="pe-kiosk-modal-footer">
          <button class="btn btn-secondary" type="button" @click="closeCheckout">Cancel</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitting || !canSubmitCheckout"
            @click="submitCheckout"
          >
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
const slug = computed(() =>
  resolvePortalSlug(route.params, brandingStore.portalHostPortalUrl)
);
const eventId = computed(() => String(route.params.eventId || '').trim());

const loading = ref(true);
const loadError = ref('');
const event = ref({});
const branding = ref({});
const clients = ref([]);
const releases = ref([]);
const search = ref('');
const clockNow = ref(formatNow());
let clockTimer = null;

function storageKey() { return `skillBuildersEventKiosk:${slug.value}`; }
function readToken() {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
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
    const res = await api.get(
      `/public/program-event/agency/${encodeURIComponent(slug.value)}/kiosk/events/${encodeURIComponent(eventId.value)}/context`,
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    event.value = res.data?.event || {};
    branding.value = res.data?.branding || {};
    clients.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
    releases.value = Array.isArray(res.data?.releases) ? res.data.releases : [];
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Could not load event';
  } finally {
    loading.value = false;
  }
}

const filteredClients = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return clients.value;
  return clients.value.filter((c) =>
    String(c.fullName || '').toLowerCase().includes(q)
    || String(c.initials || '').toLowerCase().includes(q)
    || String(c.identifierCode || '').toLowerCase().includes(q)
  );
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

// ─── Checkout modal ────────────────────────────────────────────────────────
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
    checkoutError.value = 'Camera unavailable: ' + (e.message || 'permission denied');
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
  if (!activeClient.value) return false;
  if (!sigDirty) return false;
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
      if (!pickup) { checkoutError.value = 'Tap an approved pickup or check the walk-home box.'; submitting.value = false; return; }
      releasedToName = pickup.name;
      releasedToRelationship = pickup.relationship;
      releasedToPhone = pickup.phone;
    }
    const sigData = sigCanvas.value ? sigCanvas.value.toDataURL('image/png') : '';
    const res = await api.post(
      `/public/program-event/agency/${encodeURIComponent(slug.value)}/kiosk/events/${encodeURIComponent(eventId.value)}/checkout`,
      {
        clientId: activeClient.value.id,
        releasedToName,
        releasedToRelationship,
        releasedToPhone,
        walkHomeAlone: walkHomeAlone.value,
        signerSignatureData: sigData,
        signerSourceMethod: 'fresh_kiosk_signature',
        photoBase64: photoPreview.value || null,
        photoContentType: photoPreview.value ? 'image/jpeg' : null
      },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    if (res.data?.ok) {
      releases.value.unshift({
        id: res.data.releaseId,
        clientId: activeClient.value.id,
        releasedToName,
        releasedToRelationship,
        walkHomeAlone: walkHomeAlone.value,
        signedAt: res.data.signedAt
      });
      closeCheckout();
    } else {
      checkoutError.value = 'Unexpected server response.';
    }
  } catch (e) {
    checkoutError.value = e.response?.data?.error?.message || e.message || 'Could not record release';
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
  background: var(--bg, #f8fafc);
  display: flex;
  flex-direction: column;
}
.pe-kiosk-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #fff;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.pe-kiosk-brand { display: flex; align-items: center; gap: 12px; }
.pe-kiosk-logo { width: 40px; height: 40px; object-fit: contain; }
.pe-kiosk-org { font-weight: 700; }
.pe-kiosk-evt { font-size: 13px; color: var(--text-secondary, #64748b); }
.pe-kiosk-clock { font-size: 14px; color: var(--text-secondary, #64748b); font-variant-numeric: tabular-nums; }
.pe-kiosk-load, .pe-kiosk-err { padding: 32px; text-align: center; }
.pe-kiosk-body { padding: 16px; flex: 1; }
.pe-kiosk-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pe-kiosk-search { flex: 1; }
.pe-kiosk-roster { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.pe-kiosk-row {
  background: #fff; border: 1px solid var(--border, #e2e8f0); border-radius: 12px;
  padding: 14px 16px; cursor: pointer; transition: all .15s;
}
.pe-kiosk-row:hover { border-color: var(--primary, #0f766e); transform: translateY(-1px); }
.pe-kiosk-row--released { opacity: .55; background: #f1f5f9; }
.pe-kiosk-row-name { margin-bottom: 6px; }
.pe-kiosk-row-tag {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  background: #e0f2fe; color: #075985; font-size: 12px;
}
.pe-kiosk-row-tag--out { background: #fef3c7; color: #92400e; }
.pe-kiosk-empty { padding: 40px; text-align: center; }

.pe-kiosk-modal {
  position: fixed; inset: 0; background: rgba(15, 23, 42, .55);
  display: flex; align-items: center; justify-content: center; padding: 12px; z-index: 100;
}
.pe-kiosk-modal-card {
  background: #fff; border-radius: 16px; width: min(620px, 100%);
  max-height: 92vh; overflow-y: auto; padding: 20px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, .25);
}
.pe-kiosk-modal-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.pe-kiosk-modal-title { font-size: 1.1rem; font-weight: 700; }
.pe-kiosk-modal-h4 { margin: 16px 0 8px; font-size: .9rem; font-weight: 700; color: var(--text-secondary, #475569); }
.pe-kiosk-modal-err { margin-bottom: 8px; }
.pe-kiosk-pickup-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.pe-kiosk-pickup-row {
  border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 10px 12px; cursor: pointer;
}
.pe-kiosk-pickup-row--sel { border-color: var(--primary, #0f766e); background: #f0fdfa; }
.pe-kiosk-walk-row { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid var(--border); border-radius: 8px; }
.pe-kiosk-sig-wrap { display: flex; flex-direction: column; gap: 6px; }
.pe-kiosk-sig-canvas { width: 100%; height: 160px; border: 1px solid var(--border); border-radius: 8px; background: #fff; touch-action: none; }
.pe-kiosk-sig-actions { display: flex; gap: 8px; align-items: center; }
.pe-kiosk-photo-wrap { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.pe-kiosk-photo-video, .pe-kiosk-photo-preview { width: 100%; max-width: 320px; border-radius: 8px; border: 1px solid var(--border); background: #000; }
.pe-kiosk-photo-actions { display: flex; gap: 8px; }
.pe-kiosk-modal-footer { margin-top: 18px; display: flex; justify-content: flex-end; gap: 8px; }
</style>
