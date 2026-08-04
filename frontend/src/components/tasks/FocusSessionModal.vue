<template>
  <div
    class="focus-session"
    :class="{ 'focus-session--mini': minimized }"
    role="dialog"
    aria-label="Focus Session"
  >
    <header class="fs-head">
      <div>
        <h2>Focus Session</h2>
        <p class="muted">{{ blockTitle }}</p>
      </div>
      <div class="fs-head__actions">
        <button type="button" class="btn btn-danger btn-sm" @click="endSession">End Focus Session</button>
        <button type="button" class="icon-btn" :title="minimized ? 'Expand' : 'Minimize'" @click="minimized = !minimized">
          {{ minimized ? '⛶' : '–' }}
        </button>
        <button type="button" class="icon-btn" title="Close" @click="endSession">×</button>
      </div>
    </header>

    <div v-if="!minimized" class="fs-body">
      <section class="fs-col fs-timeline">
        <h3>My Timeline</h3>
        <div class="day-tabs">
          <span class="day-tab active">Day</span>
        </div>
        <ul class="day-list">
          <li
            v-for="b in dayBlocks"
            :key="b.id"
            class="day-item"
            :class="{
              active: Number(b.id) === Number(block?.id),
              faded: Number(b.id) !== Number(block?.id)
            }"
          >
            <div class="day-item__time">{{ formatRange(b) }}</div>
            <div class="day-item__title">{{ b.title }}</div>
            <div v-if="Number(b.id) === Number(block?.id)" class="day-item__remain">
              {{ remainingLabel }} · {{ tasks.length }} Tasks
            </div>
          </li>
        </ul>
      </section>

      <section class="fs-col fs-center">
        <div class="quote-card" :style="quoteBgStyle">
          <p class="quote-text">“{{ quote?.quote_text || 'Discipline is choosing between what you want now and what you want most.' }}”</p>
          <p v-if="quote?.attribution" class="quote-attr">— {{ quote.attribution }}</p>
        </div>
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
        <div class="block-overview">
          <div><strong>Block:</strong> {{ blockTitle }}</div>
          <div><strong>Time:</strong> {{ formatRange(block) }}</div>
        </div>
        <label class="intention">
          Focus intention
          <textarea v-model="intention" rows="2" placeholder="What will you focus on?" />
        </label>
      </section>

      <section class="fs-col fs-tasks">
        <header class="fs-tasks__head">
          <h3>My Tasks</h3>
        </header>
        <div class="fs-tasks__tabs">
          <button type="button" class="pill active">This Block ({{ tasks.length }})</button>
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
          <li v-if="!tasks.length" class="muted">No tasks in this block yet. Drag some from the Tasks hub.</li>
        </ul>
      </section>
    </div>

    <footer class="fs-music">
      <span class="fs-music__label">Focus Music</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="toggleMusic">
        {{ musicPlaying ? 'Pause' : 'Play' }}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" @click="endMusic">End music</button>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  block: { type: Object, required: true },
  dayBlocks: { type: Array, default: () => [] },
  agencyId: { type: Number, default: null },
  focusMusicApi: { type: Object, default: null }
});

const emit = defineEmits(['close', 'task-changed']);

const minimized = ref(false);
const quote = ref(null);
const intention = ref('');
const tasks = ref([]);
const nowTick = ref(Date.now());
let quoteTimer = null;
let tickTimer = null;

const blockTitle = computed(() => props.block?.title || props.block?.reason_code || 'Focus block');
const musicPlaying = computed(() => !!props.focusMusicApi?.isPlaying?.value);

const quoteBgStyle = computed(() => {
  if (!quote.value?.imageUrl) {
    return { background: 'linear-gradient(135deg, #166534, #0f172a)' };
  }
  return {
    backgroundImage: `linear-gradient(rgba(15,23,42,.45), rgba(15,23,42,.55)), url(${quote.value.imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };
});

const remainingLabel = computed(() => {
  const end = props.block?.end_at ? new Date(props.block.end_at) : null;
  if (!end) return '—';
  const ms = end.getTime() - nowTick.value;
  if (ms <= 0) return '0m';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
});

const ringStyle = computed(() => {
  const start = props.block?.start_at ? new Date(props.block.start_at).getTime() : null;
  const end = props.block?.end_at ? new Date(props.block.end_at).getTime() : null;
  if (!start || !end || end <= start) return { strokeDashoffset: 327 };
  const pct = Math.min(1, Math.max(0, (nowTick.value - start) / (end - start)));
  const circ = 2 * Math.PI * 52;
  return {
    strokeDasharray: String(circ),
    strokeDashoffset: String(circ * (1 - pct))
  };
});

function formatRange(b) {
  if (!b?.start_at) return '';
  const s = new Date(b.start_at);
  const e = b.end_at ? new Date(b.end_at) : null;
  const fmt = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return e ? `${fmt(s)} – ${fmt(e)}` : fmt(s);
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
  } catch {
    tasks.value = [];
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
  if (!props.focusMusicApi) return;
  if (props.focusMusicApi.isPlaying?.value) props.focusMusicApi.pause?.();
  else props.focusMusicApi.startLooping?.();
}

function endMusic() {
  props.focusMusicApi?.endSession?.() || props.focusMusicApi?.pause?.();
}

function endSession() {
  endMusic();
  emit('close');
}

onMounted(async () => {
  // Stop any ambient music before session starts (no dual audio)
  props.focusMusicApi?.endSession?.() || props.focusMusicApi?.pause?.();
  await loadQuote();
  await loadTasks();
  quoteTimer = setInterval(loadQuote, 20 * 60 * 1000);
  tickTimer = setInterval(() => { nowTick.value = Date.now(); }, 30000);
  try {
    sessionStorage.setItem('focusSessionIntention', intention.value);
  } catch { /* ignore */ }
});

watch(intention, (v) => {
  try { sessionStorage.setItem('focusSessionIntention', v); } catch { /* ignore */ }
});

onUnmounted(() => {
  if (quoteTimer) clearInterval(quoteTimer);
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<style scoped>
.focus-session {
  position: fixed;
  inset: 24px;
  z-index: 12000;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.focus-session--mini {
  inset: auto 16px 16px auto;
  width: min(420px, 33vw);
  height: min(70vh, 640px);
  inset: auto 16px 16px auto;
}
.fs-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.fs-head h2 { margin: 0; font-size: 1.1rem; }
.muted { color: #64748b; margin: 2px 0 0; font-size: 13px; }
.fs-head__actions { display: flex; gap: 6px; align-items: center; }
.icon-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
}
.btn-danger { background: #dc2626; color: #fff; border: 0; }
.fs-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr 280px;
  gap: 12px;
  padding: 12px;
  overflow: auto;
  min-height: 0;
}
.focus-session--mini .fs-body {
  grid-template-columns: 1fr;
}
.focus-session--mini .fs-timeline,
.focus-session--mini .fs-center .quote-card {
  display: none;
}
.fs-col {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  min-height: 0;
  overflow: auto;
}
.fs-col h3 { margin: 0 0 8px; font-size: 14px; }
.day-item {
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 6px;
  background: #f1f5f9;
}
.day-item.faded { opacity: 0.45; pointer-events: none; }
.day-item.active {
  opacity: 1;
  border: 2px solid #16a34a;
  background: #ecfdf5;
}
.day-item__time { font-size: 11px; color: #64748b; }
.day-item__title { font-weight: 700; font-size: 13px; }
.day-item__remain { font-size: 11px; color: #166534; margin-top: 2px; }
.quote-card {
  border-radius: 12px;
  min-height: 180px;
  padding: 20px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.quote-text { font-size: 1.05rem; font-family: Georgia, 'Times New Roman', serif; margin: 0; }
.quote-attr { margin: 8px 0 0; opacity: 0.85; font-size: 13px; }
.progress-ring {
  position: relative;
  width: 140px;
  height: 140px;
  margin: 8px auto;
}
.progress-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: #e2e8f0; stroke-width: 8; }
.ring-fg { fill: none; stroke: #16a34a; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.4s; }
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
.progress-ring__label strong { font-size: 18px; color: #0f172a; }
.block-overview { font-size: 13px; margin: 8px 0; color: #334155; }
.intention { display: block; font-size: 12px; color: #64748b; }
.intention textarea {
  width: 100%;
  margin-top: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  font: inherit;
}
.task-list { list-style: none; margin: 0; padding: 0; }
.task-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
.task-item .done { text-decoration: line-through; color: #94a3b8; }
.pill {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
}
.pill.active { background: #dcfce7; border-color: #86efac; color: #166534; font-weight: 700; }
.fs-music {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #0f172a;
  color: #f8fafc;
}
.fs-music__label { font-weight: 700; font-size: 13px; margin-right: auto; }
@media (max-width: 1000px) {
  .fs-body { grid-template-columns: 1fr; }
}
</style>
