<template>
  <div
    v-if="active"
    class="sms-host"
    :class="[`pos-${active.position || 'right'}`, `state-${state}`]"
    :style="hostStyles"
    @mouseenter="onHostHover(true)"
    @mouseleave="onHostHover(false)"
  >
    <!-- Collapsed tab -->
    <button
      v-if="state === 'tab'"
      type="button"
      class="sms-tab"
      :style="tabStyles"
      :title="active.title"
      @click="setState('expanded')"
    >
      <img v-if="logoUrl" :src="logoUrl" alt="" class="sms-tab-logo" />
      <span v-else class="sms-tab-emoji" aria-hidden="true">📣</span>
      <span class="sms-tab-text">
        <strong>{{ shortTitle }}</strong>
        <small v-if="dateLine">{{ dateLine }}</small>
      </span>
    </button>

    <!-- Peek + expanded -->
    <transition name="sms-slide" mode="out-in">
      <div
        v-if="state !== 'tab'"
        :key="state"
        class="sms-card"
        :class="`sms-card--${state}`"
        :style="cardStyles"
      >
        <header class="sms-head">
          <div class="sms-eyebrow" :style="{ color: accent }">{{ kindLabel }}</div>
          <h3 class="sms-title">{{ active.title }}</h3>
          <div v-if="active.subtitle" class="sms-sub">{{ active.subtitle }}</div>
          <div v-if="dateLine" class="sms-dates">{{ dateLine }}</div>
        </header>

        <div v-if="state === 'expanded'" class="sms-body-wrap">
          <p v-if="active.body" class="sms-body">{{ active.body }}</p>

          <div class="sms-share-row">
            <div v-if="active.showQr && shareUrl" class="sms-qr">
              <canvas ref="qrCanvas" width="128" height="128"></canvas>
              <button type="button" class="sms-link-btn" @click="copyLink">{{ copied ? 'Copied!' : 'Copy link' }}</button>
            </div>
            <div class="sms-actions">
              <a
                v-if="shareUrl"
                :href="shareUrl"
                class="sms-cta"
                :style="{ background: accent }"
                target="_blank"
                rel="noopener"
                @click="ack('clicked')"
              >{{ active.ctaLabel || 'Open page' }}</a>
              <a
                v-if="active.showFlier && active.flierUrl"
                :href="active.flierUrl"
                target="_blank"
                rel="noopener"
                class="sms-flier"
                @click="ack('downloaded')"
              >⤓ Download flier ({{ active.flierFilename || 'PDF' }})</a>
            </div>
          </div>
        </div>

        <footer class="sms-foot">
          <button v-if="queueLength > 1" type="button" class="sms-pip" @click="next" :title="`Next campaign (${index + 1} of ${queueLength})`">
            {{ index + 1 }} / {{ queueLength }} ›
          </button>
          <span v-else></span>
          <div class="sms-foot-right">
            <button type="button" class="sms-link-btn" @click="setState('tab')" title="Minimize to tab">— Tab</button>
            <button type="button" class="sms-link-btn" @click="dismiss" title="Hide for a while">×</button>
          </div>
        </footer>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  // 'portal' = scoped to a specific school portal (requires schoolId)
  // 'dashboard' = the regular staff/provider dashboard mount
  mode: { type: String, default: 'portal' },
  schoolId: { type: [Number, String], default: null }
});

const queue = ref([]);
const index = ref(0);
const state = ref('peek'); // peek | expanded | tab
const copied = ref(false);
const qrCanvas = ref(null);
let collapseTimer = null;

const active = computed(() => queue.value[index.value] || null);
const queueLength = computed(() => queue.value.length);
const accent = computed(() => active.value?.accentColor || '#4f46e5');
const logoUrl = computed(() => active.value?.logoPath ? toUploadsUrl(active.value.logoPath) : null);
const shareUrl = computed(() => {
  const dest = active.value?.destination?.resolved;
  if (!dest?.url) return null;
  if (/^https?:/.test(dest.url)) return dest.url;
  if (typeof window !== 'undefined') return new URL(dest.url, window.location.origin).toString();
  return dest.url;
});
const kindLabel = computed(() => {
  const k = active.value?.destination?.kind;
  return ({
    marketing_page: 'Marketing page',
    event: 'Event',
    agency_events: 'Upcoming events',
    program_events: 'Program events',
    program_enrollment: 'Enroll now',
    agency_enrollment: 'Enroll now'
  })[k] || 'Featured';
});
const dateLine = computed(() => {
  const d = active.value?.destination?.resolved;
  if (!d?.startsAt) return active.value?.endsAt ? `Ends ${formatDate(active.value.endsAt)}` : '';
  if (d.endsAt) return `${formatDate(d.startsAt)} – ${formatDate(d.endsAt)}`;
  return `Starts ${formatDate(d.startsAt)}`;
});
const shortTitle = computed(() => {
  const t = active.value?.title || '';
  return t.length > 28 ? t.slice(0, 25) + '…' : t;
});

const hostStyles = computed(() => ({
  '--sms-accent': accent.value
}));
const tabStyles = computed(() => ({
  borderColor: accent.value
}));
const cardStyles = computed(() => ({
  borderColor: accent.value
}));

function formatDate(s) {
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

function setState(s) {
  state.value = s;
  if (s === 'expanded') startCollapseTimer();
  else clearCollapseTimer();
  if (s === 'expanded') nextTick(renderQr);
}
function onHostHover(entered) {
  if (state.value === 'tab') return;
  if (entered) {
    clearCollapseTimer();
    if (state.value === 'peek') setState('expanded');
  } else {
    startCollapseTimer();
  }
}
function startCollapseTimer() {
  clearCollapseTimer();
  collapseTimer = setTimeout(() => { state.value = 'tab'; }, 6500);
}
function clearCollapseTimer() {
  if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
}

const fetchPath = computed(() => (
  props.mode === 'dashboard'
    ? '/marketing-splashes/dashboard-active'
    : '/school-portal/marketing-splashes/active'
));
const dismissPath = (id) => (
  props.mode === 'dashboard'
    ? `/marketing-splashes/${id}/dismiss`
    : `/school-portal/marketing-splashes/${id}/dismiss`
);

async function load() {
  if (props.mode === 'portal' && !props.schoolId) return;
  try {
    const { data } = await api.get(fetchPath.value, {
      params: props.mode === 'portal' ? { schoolId: props.schoolId } : {}
    });
    queue.value = data.splashes || [];
    index.value = 0;
    if (queue.value.length) {
      const init = queue.value[0]?.initialState || 'peek';
      setState(init);
    }
  } catch (_) {
    queue.value = [];
  }
}

async function dismiss() {
  if (!active.value) return;
  try {
    await api.post(dismissPath(active.value.id), { ackKind: 'snoozed' });
  } catch (_) { /* ignore */ }
  removeCurrent();
}

function removeCurrent() {
  queue.value.splice(index.value, 1);
  if (index.value >= queue.value.length) index.value = Math.max(0, queue.value.length - 1);
  if (!queue.value.length) {
    clearCollapseTimer();
  } else {
    setState('peek');
  }
}

async function ack(kind) {
  if (!active.value) return;
  try { await api.post(dismissPath(active.value.id), { ackKind: kind }); }
  catch (_) { /* ignore */ }
}

function next() {
  if (!queue.value.length) return;
  index.value = (index.value + 1) % queue.value.length;
  state.value = 'peek';
  nextTick(() => setState('expanded'));
}

async function copyLink() {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch (_) { /* ignore */ }
}

async function renderQr() {
  if (!shareUrl.value || !qrCanvas.value) return;
  try {
    const QRCode = (await import('qrcode')).default;
    await QRCode.toCanvas(qrCanvas.value, shareUrl.value, {
      width: 128,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    });
  } catch (_) { /* qrcode optional */ }
}

watch(() => props.schoolId, () => { load(); });
watch(() => state.value, (s) => { if (s === 'expanded') nextTick(renderQr); });
watch(() => active.value?.id, () => { if (state.value === 'expanded') nextTick(renderQr); });

onMounted(() => { load(); });
onBeforeUnmount(() => { clearCollapseTimer(); });
</script>

<style scoped>
.sms-host {
  position: fixed;
  z-index: 950;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  --sms-accent: #4f46e5;
}
.sms-host.pos-right {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  align-items: flex-end;
}
.sms-host.pos-bottom-right {
  bottom: 24px;
  right: 24px;
  align-items: flex-end;
}
.sms-host.pos-bottom {
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  align-items: center;
}

.sms-card {
  background: white;
  border-left: 4px solid var(--sms-accent);
  border-radius: 12px 0 0 12px;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.18);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
  overflow: hidden;
  max-width: 360px;
}
.pos-bottom-right .sms-card,
.pos-bottom .sms-card { border-radius: 12px; border-left-width: 4px; }

.sms-card--peek {
  width: 240px;
  padding: 10px 14px;
}
.sms-card--peek .sms-body-wrap,
.sms-card--peek .sms-foot { display: none; }

.sms-card--expanded {
  width: 360px;
}

.sms-eyebrow { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
.sms-title { font-size: 16px; font-weight: 800; margin: 2px 0 0; color: #0f172a; line-height: 1.2; }
.sms-sub { font-size: 12px; color: #475569; margin-top: 2px; }
.sms-dates { font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600; }

.sms-body { font-size: 13px; line-height: 1.45; color: #334155; margin: 4px 0 0; white-space: pre-wrap; }

.sms-share-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-top: 8px;
}
.sms-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.sms-qr canvas {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
}
.sms-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 120px;
}
.sms-cta {
  display: inline-block;
  padding: 8px 12px;
  border-radius: 8px;
  color: white;
  font-weight: 700;
  font-size: 13px;
  text-align: center;
  text-decoration: none;
}
.sms-cta:hover { filter: brightness(1.05); }
.sms-flier {
  display: inline-block;
  font-size: 12px;
  color: var(--sms-accent);
  text-decoration: none;
  border: 1px dashed #cbd5e1;
  padding: 6px 8px;
  border-radius: 8px;
  text-align: center;
}
.sms-flier:hover { background: #f8fafc; }

.sms-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #64748b;
  border-top: 1px solid #f1f5f9;
  padding-top: 6px;
  margin-top: 4px;
}
.sms-pip {
  background: none;
  border: 0;
  padding: 0;
  color: var(--sms-accent);
  font-weight: 700;
  cursor: pointer;
  font-size: 11px;
}
.sms-foot-right { display: flex; gap: 8px; }
.sms-link-btn {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-size: 11px;
  color: #64748b;
}
.sms-link-btn:hover { color: #0f172a; }

.sms-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-left-width: 4px;
  border-radius: 12px 0 0 12px;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
  cursor: pointer;
  max-width: 220px;
  font-family: inherit;
}
.pos-bottom-right .sms-tab,
.pos-bottom .sms-tab { border-radius: 12px; border-left-width: 4px; }
.sms-tab:hover { background: #f8fafc; }
.sms-tab-logo {
  width: 28px; height: 28px; border-radius: 6px; object-fit: cover; background: #f1f5f9;
}
.sms-tab-emoji { font-size: 18px; }
.sms-tab-text { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.sms-tab-text strong { font-size: 12px; color: #0f172a; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sms-tab-text small { font-size: 10px; color: #64748b; line-height: 1.1; }

.sms-slide-enter-active,
.sms-slide-leave-active { transition: transform 0.22s ease, opacity 0.22s ease; }
.sms-slide-enter-from { opacity: 0; transform: translateX(40px); }
.sms-slide-leave-to { opacity: 0; transform: translateX(40px); }

@media (max-width: 600px) {
  .sms-card--expanded, .sms-card--peek {
    width: min(92vw, 360px);
  }
}
</style>
