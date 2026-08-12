<template>
  <div
    class="focus-session"
    :class="{ 'focus-session--mini': minimized }"
    role="dialog"
    aria-label="Focus Session"
  >
    <header class="fs-head">
      <div class="fs-head__brand">
        <span class="fs-head__icon" aria-hidden="true">◎</span>
        <div>
          <h2>Focus Session</h2>
          <p class="fs-head__sub">{{ blockTitle }}</p>
        </div>
      </div>
      <div class="fs-head__actions">
        <button type="button" class="btn-end" @click="endSession">End session</button>
        <button type="button" class="icon-btn" :title="minimized ? 'Expand' : 'Minimize'" @click="minimized = !minimized">
          {{ minimized ? '⛶' : '–' }}
        </button>
        <button type="button" class="icon-btn" title="Close" @click="endSession">×</button>
      </div>
    </header>

    <div v-if="!minimized" class="fs-body">
      <section class="fs-col fs-timeline">
        <header class="fs-col__head">
          <h3>My Timeline</h3>
          <span class="fs-col__badge">Today</span>
        </header>
        <div class="fs-timeline-axis">
          <div
            v-for="hour in timelineHours"
            :key="hour"
            class="fs-hour-row"
          >
            <span class="fs-hour-label">{{ formatHour(hour) }}</span>
            <div class="fs-hour-track" />
          </div>
          <div
            v-for="b in sortedDayBlocks"
            :key="b.id"
            class="fs-block"
            :class="{ 'fs-block--active': Number(b.id) === Number(block?.id) }"
            :style="blockStyle(b)"
            @click="selectBlock(b)"
          >
            <div class="fs-block__title">{{ b.title || b.reason_code || 'Block' }}</div>
            <div class="fs-block__time">{{ formatRange(b) }}</div>
          </div>
          <div v-if="nowTop != null" class="fs-now" :style="{ top: `${nowTop}px` }" />
        </div>
        <p v-if="!sortedDayBlocks.length" class="fs-empty">No blocks on this day yet.</p>
      </section>

      <section class="fs-col fs-center">
        <div class="quote-card" :style="quoteBgStyle">
          <div class="quote-card__overlay" />
          <p class="quote-eyebrow">{{ quote?.title || 'Today\'s focus' }}</p>
          <p class="quote-text">{{ quote?.quote_text || 'Where focus goes, energy flows.' }}</p>
          <p v-if="quote?.attribution" class="quote-attr">— {{ quote.attribution }}</p>
        </div>

        <div class="progress-wrap">
          <div class="progress-ring">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" class="ring-bg" />
              <circle cx="60" cy="60" r="52" class="ring-fg" :style="ringStyle" />
            </svg>
            <div class="progress-ring__label">
              <strong>{{ remainingLabel }}</strong>
              <span>remaining</span>
            </div>
          </div>
          <div class="block-meta">
            <div><span>Block</span><strong>{{ blockTitle }}</strong></div>
            <div><span>Time</span><strong>{{ formatRange(block) }}</strong></div>
            <div><span>Tasks</span><strong>{{ tasks.length }}</strong></div>
          </div>
        </div>

        <label class="intention">
          <span>Focus intention</span>
          <textarea v-model="intention" rows="2" placeholder="What will you focus on during this block?" />
        </label>
      </section>

      <section class="fs-col fs-tasks">
        <header class="fs-col__head">
          <h3>My Tasks</h3>
        </header>
        <div class="fs-tasks__tabs">
          <button type="button" class="pill active">This block · {{ tasks.length }}</button>
        </div>
        <ul class="task-list">
          <li v-for="t in tasks" :key="t.id" class="task-item">
            <input
              type="checkbox"
              :checked="t.status === 'completed'"
              @change="toggleTask(t)"
            />
            <span :class="{ done: t.status === 'completed' }">{{ t.title }}</span>
          </li>
          <li v-if="tasksError" class="fs-empty fs-empty--error">
            Couldn't load tasks — open the block panel to verify assignments.
            <button type="button" class="fs-retry-btn" @click="loadTasks">Retry</button>
          </li>
          <li v-else-if="!tasks.length" class="fs-empty">Drag tasks onto this block in the timeline, or assign from the block panel.</li>
        </ul>
      </section>
    </div>

    <footer v-if="focusMusic" class="fs-music">
      <button type="button" class="fs-music__main" @click="focusMusic.openModal?.()">
        <FocusMusicTrackArt :track="currentTrack" small />
        <div class="fs-music__meta">
          <strong>{{ currentTrack?.title || 'Focus Music' }}</strong>
          <span>{{ musicSubtitle }}</span>
        </div>
      </button>
      <div class="fs-music__controls">
        <button type="button" title="Play / pause" @click.stop="toggleMusic">
          {{ musicPlaying ? '⏸' : '▶' }}
        </button>
        <button type="button" title="Next track" @click.stop="focusMusic.playNext?.()">⏭</button>
        <button type="button" class="end-btn" title="End music" @click.stop="endMusic">■</button>
        <button type="button" title="Open library" @click.stop="focusMusic.openModal?.()">⋯</button>
      </div>
    </footer>
    <footer v-else class="fs-music fs-music--fallback">
      <span>Focus Music</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="toggleMusic">
        {{ musicPlaying ? 'Pause' : 'Play' }}
      </button>
    </footer>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import { parseScheduleInstant } from '../../utils/parseScheduleInstant';
import FocusMusicTrackArt from '../focusMusic/FocusMusicTrackArt.vue';
import { trackSubtitle } from '../../utils/focusMusicTrackDisplay.js';

const props = defineProps({
  block: { type: Object, required: true },
  dayBlocks: { type: Array, default: () => [] },
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['close', 'task-changed']);

const focusMusic = inject('focusMusic', null);
const minimized = ref(false);
const quote = ref(null);
const intention = ref('');
const tasks = ref([]);
const tasksError = ref(false);
const nowTick = ref(Date.now());
let quoteTimer = null;
let tickTimer = null;

const PX_PER_HOUR = 40;
const TIMELINE_START = 6;
const TIMELINE_END = 22;

const blockTitle = computed(() => props.block?.title || props.block?.reason_code || 'Focus block');
const musicPlaying = computed(() => !!focusMusic?.playing?.value);
const currentTrack = computed(() => focusMusic?.currentTrack?.value ?? null);
const musicSubtitle = computed(() => {
  if (!currentTrack.value) return 'Tap play to start focus music';
  return focusMusic?.playbackPlaylistName?.value || trackSubtitle(currentTrack.value);
});

const sortedDayBlocks = computed(() => {
  const list = [...(props.dayBlocks || [])];
  const bid = Number(props.block?.id);
  if (bid && !list.some((b) => Number(b.id) === bid)) list.push(props.block);
  return list.sort((a, b) => blockStartMs(a) - blockStartMs(b));
});

const timelineHours = computed(() => {
  const out = [];
  for (let h = TIMELINE_START; h <= TIMELINE_END; h += 1) out.push(h);
  return out;
});

const quoteImageUrl = computed(() => {
  const url = quote.value?.imageUrl;
  if (!url) return null;
  if (String(url).startsWith('http')) return url;
  const base = String(api.defaults?.baseURL || '/api').replace(/\/$/, '');
  const origin = base.replace(/\/api$/, '');
  return String(url).startsWith('/api') ? `${origin}${url}` : `${base}/${String(url).replace(/^\//, '')}`;
});

const quoteBgStyle = computed(() => {
  if (quoteImageUrl.value) {
    return {
      backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.35), rgba(6,78,59,.55)), url(${quoteImageUrl.value})`
    };
  }
  return { background: 'linear-gradient(135deg, #14532d 0%, #0f172a 55%, #1e293b 100%)' };
});

const remainingLabel = computed(() => {
  const end = blockEnd(props.block);
  if (!end) return '—';
  const ms = end.getTime() - nowTick.value;
  if (ms <= 0) return '0m';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
});

const ringStyle = computed(() => {
  const start = blockStart(props.block);
  const end = blockEnd(props.block);
  if (!start || !end || end <= start) return { strokeDashoffset: 327 };
  const pct = Math.min(1, Math.max(0, (nowTick.value - start.getTime()) / (end.getTime() - start.getTime())));
  const circ = 2 * Math.PI * 52;
  return {
    strokeDasharray: String(circ),
    strokeDashoffset: String(circ * (1 - pct))
  };
});

const nowTop = computed(() => {
  const d = new Date(nowTick.value);
  const mins = d.getHours() * 60 + d.getMinutes();
  const startMins = TIMELINE_START * 60;
  const endMins = TIMELINE_END * 60;
  if (mins < startMins || mins > endMins) return null;
  return ((mins - startMins) / 60) * PX_PER_HOUR;
});

function blockStartMs(b) {
  const d = blockStart(b);
  return d ? d.getTime() : 0;
}

function blockStart(b) {
  if (!b) return null;
  return parseScheduleInstant(b.start_at || b.startAt || b.start_date);
}

function blockEnd(b) {
  if (!b) return null;
  return parseScheduleInstant(b.end_at || b.endAt || b.end_date);
}

function blockMinutes(b) {
  const start = blockStart(b);
  const end = blockEnd(b);
  if (!start || !end) return { startMin: TIMELINE_START * 60, endMin: TIMELINE_START * 60 + 60 };
  return {
    startMin: start.getHours() * 60 + start.getMinutes(),
    endMin: end.getHours() * 60 + end.getMinutes()
  };
}

function blockStyle(b) {
  const { startMin, endMin } = blockMinutes(b);
  const axisStart = TIMELINE_START * 60;
  const top = ((startMin - axisStart) / 60) * PX_PER_HOUR;
  const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 28);
  return {
    top: `${Math.max(top, 0)}px`,
    height: `${height}px`
  };
}

function formatHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr} ${ampm}`;
}

function formatRange(b) {
  if (!b) return '';
  const s = blockStart(b);
  const e = blockEnd(b);
  if (!s) return '';
  const fmt = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return e ? `${fmt(s)} – ${fmt(e)}` : fmt(s);
}

function selectBlock(b) {
  if (Number(b.id) === Number(props.block?.id)) return;
  // Parent owns block switching — emit close for now; could extend later
}

async function loadQuote() {
  try {
    const { data } = await api.get('/focus-quotes/random', {
      params: { agencyId: props.agencyId || undefined },
      skipGlobalLoading: true
    });
    quote.value = data;
  } catch {
    quote.value = null;
  }
}

async function loadTasks() {
  if (!props.block?.id) return;
  tasksError.value = false;
  try {
    const { data } = await api.get(`/schedule-block-assignments/${props.block.id}`, {
      skipGlobalLoading: true
    });
    tasks.value = (data?.assignments || [])
      .filter((a) => a.assignable_type === 'task' || a.assignable_type === 'action_item')
      .map((a) => ({
        id: a.assignable_id,
        title: a.title,
        status: a.status,
        _assignmentId: a.id,
        _type: a.assignable_type
      }));
  } catch (e) {
    console.error('[FocusSession] loadTasks failed:', e);
    tasks.value = [];
    tasksError.value = true;
  }
}

async function toggleTask(t) {
  try {
    if (t._type === 'action_item') {
      if (t.status === 'completed') await api.post(`/task-action-items/${t.id}/reopen`, {}, { skipGlobalLoading: true });
      else await api.post(`/task-action-items/${t.id}/complete`, {}, { skipGlobalLoading: true });
    } else if (t.status === 'completed') {
      await api.put(`/tasks/${t.id}/incomplete`, {}, { skipGlobalLoading: true });
    } else {
      await api.put(`/tasks/${t.id}/complete`, {}, { skipGlobalLoading: true });
    }
    await loadTasks();
    emit('task-changed');
  } catch (e) {
    console.error(e);
  }
}

function toggleMusic() {
  if (!focusMusic) return;
  if (focusMusic.playing?.value) focusMusic.pause?.();
  else focusMusic.startLooping?.();
}

function endMusic() {
  try {
    focusMusic?.endSession?.();
  } catch {
    focusMusic?.pause?.();
  }
}

function endSession() {
  endMusic();
  emit('close');
}

onMounted(async () => {
  try {
    intention.value = sessionStorage.getItem('focusSessionIntention') || '';
  } catch { /* ignore */ }
  try {
    if (focusMusic && !focusMusic.playing?.value) {
      await focusMusic.startLooping?.();
    }
  } catch (e) {
    console.warn('[FocusSession] focus music start failed:', e);
  }
  await Promise.all([loadQuote(), loadTasks()]);
  quoteTimer = setInterval(loadQuote, 20 * 60 * 1000);
  tickTimer = setInterval(() => { nowTick.value = Date.now(); }, 1000);
});

defineExpose({ reloadTasks: loadTasks });

watch(intention, (v) => {
  try { sessionStorage.setItem('focusSessionIntention', v); } catch { /* ignore */ }
});

watch(() => props.block?.id, () => {
  loadTasks();
});

onUnmounted(() => {
  if (quoteTimer) clearInterval(quoteTimer);
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<style scoped>
.focus-session {
  position: fixed;
  inset: 16px;
  z-index: 12000;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fafc 28%, #f1f5f9 100%);
  border: 1px solid #cbd5e1;
  border-radius: 20px;
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.focus-session--mini {
  inset: auto 16px 16px auto;
  width: min(440px, 92vw);
  height: min(72vh, 680px);
}
.fs-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(10px);
}
.fs-head__brand { display: flex; align-items: center; gap: 12px; }
.fs-head__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #fff;
  font-size: 18px;
}
.fs-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #14532d; letter-spacing: -0.02em; }
.fs-head__sub { margin: 2px 0 0; color: #64748b; font-size: 13px; }
.fs-head__actions { display: flex; gap: 8px; align-items: center; }
.btn-end {
  border: 0;
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
}
.icon-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  width: 34px;
  height: 34px;
  cursor: pointer;
  color: #475569;
}
.fs-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(280px, 1fr) minmax(240px, 300px);
  gap: 14px;
  padding: 14px;
  overflow: auto;
  min-height: 0;
}
.focus-session--mini .fs-body { grid-template-columns: 1fr; }
.focus-session--mini .fs-timeline,
.focus-session--mini .quote-card { display: none; }
.fs-col {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
  min-height: 0;
  overflow: auto;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.fs-col__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.fs-col__head h3 { margin: 0; font-size: 14px; font-weight: 800; color: #0f172a; }
.fs-col__badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #166534;
  background: #dcfce7;
  padding: 3px 8px;
  border-radius: 999px;
}
.fs-timeline-axis {
  position: relative;
  height: calc((22 - 6 + 1) * 40px);
  min-height: 280px;
}
.fs-hour-row {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 8px;
  height: 40px;
  align-items: start;
}
.fs-hour-label { font-size: 10px; color: #94a3b8; font-weight: 600; padding-top: 2px; }
.fs-hour-track { border-top: 1px solid #f1f5f9; }
.fs-block {
  position: absolute;
  left: 52px;
  right: 4px;
  border-radius: 10px;
  padding: 6px 8px;
  background: #e2e8f0;
  color: #334155;
  border: 1px solid #cbd5e1;
  overflow: hidden;
  cursor: default;
  z-index: 2;
}
.fs-block--active {
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #fff;
  border-color: #15803d;
  box-shadow: 0 8px 20px rgba(22, 163, 74, 0.35);
  z-index: 3;
}
.fs-block__title { font-size: 12px; font-weight: 800; line-height: 1.2; }
.fs-block__time { font-size: 10px; opacity: 0.85; margin-top: 2px; }
.fs-now {
  position: absolute;
  left: 48px;
  right: 0;
  height: 2px;
  background: #ef4444;
  z-index: 4;
}
.fs-now::before {
  content: '';
  position: absolute;
  left: 0;
  top: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}
.fs-empty { font-size: 12px; color: #94a3b8; margin: 8px 0 0; }
.fs-empty--error { color: #ef4444; }
.fs-retry-btn {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #3b82f6;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.quote-card {
  position: relative;
  border-radius: 16px;
  min-height: 200px;
  padding: 22px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  margin-bottom: 14px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}
.quote-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 10%, rgba(15, 23, 42, 0.55) 100%);
  pointer-events: none;
}
.quote-eyebrow,
.quote-text,
.quote-attr { position: relative; z-index: 1; }
.quote-eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.9;
}
.quote-text {
  margin: 0;
  font-size: 1.35rem;
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.35;
  font-weight: 500;
}
.quote-attr { margin: 10px 0 0; opacity: 0.9; font-size: 13px; }
.progress-wrap {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 14px;
}
.progress-ring {
  position: relative;
  width: 132px;
  height: 132px;
  flex-shrink: 0;
}
.progress-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: #e2e8f0; stroke-width: 8; }
.ring-fg { fill: none; stroke: #16a34a; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.5s; }
.progress-ring__label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #64748b;
}
.progress-ring__label strong { font-size: 20px; color: #0f172a; }
.block-meta {
  display: grid;
  gap: 8px;
  flex: 1;
}
.block-meta div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
}
.block-meta span { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.04em; }
.block-meta strong { font-size: 13px; color: #0f172a; }
.intention { display: block; }
.intention > span {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 6px;
  letter-spacing: 0.04em;
}
.intention textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  resize: vertical;
  min-height: 64px;
  background: #fff;
}
.task-list { list-style: none; margin: 0; padding: 0; }
.task-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  line-height: 1.35;
}
.task-item input { margin-top: 3px; accent-color: #16a34a; }
.task-item .done { text-decoration: line-through; color: #94a3b8; }
.pill {
  border: 1px solid #bbf7d0;
  background: #ecfdf5;
  color: #166534;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 700;
}
.fs-tasks__tabs { margin-bottom: 10px; }
.fs-music {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 8px;
  background: #111827;
  color: #f9fafb;
  border-top: 1px solid #374151;
}
.fs-music__main {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  min-width: 0;
  flex: 1;
  padding: 0;
  text-align: left;
}
.fs-music__meta { min-width: 0; }
.fs-music__meta strong,
.fs-music__meta span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(280px, 40vw);
}
.fs-music__meta span { color: #9ca3af; font-size: 12px; font-weight: 400; }
.fs-music__controls { display: flex; gap: 6px; flex-shrink: 0; }
.fs-music__controls button {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: none;
  background: #1f2937;
  color: #f3f4f6;
  cursor: pointer;
  font-size: 13px;
}
.fs-music__controls .end-btn { color: #fca5a5; }
.fs-music--fallback { justify-content: space-between; }
@media (max-width: 1100px) {
  .fs-body { grid-template-columns: 1fr; }
  .progress-wrap { flex-direction: column; align-items: flex-start; }
}
</style>
