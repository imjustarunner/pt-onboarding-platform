<template>
  <aside class="task-timeline" aria-label="Task Timeline">
    <div class="task-timeline__title-row">
      <h2 class="task-timeline__title">Task Timeline</h2>
      <p class="task-timeline__subtitle">Drop tasks onto today’s schedule blocks</p>
    </div>
    <header class="task-timeline__head">
      <button type="button" class="nav-btn" @click="shiftDay(-1)" aria-label="Previous day">‹</button>
      <div class="task-timeline__date">
        <strong>{{ dayLabel }}</strong>
        <button v-if="!isToday" type="button" class="today-btn" @click="goToday">Today</button>
      </div>
      <button type="button" class="nav-btn" @click="shiftDay(1)" aria-label="Next day">›</button>
    </header>

    <div v-if="loading" class="task-timeline__state">Loading…</div>
    <div v-else-if="!blocks.length" class="task-timeline__state">
      No schedule blocks today.
      <router-link :to="schedulePath" class="link">Open My Schedule</router-link>
      to add one.
    </div>

    <div v-else class="task-timeline__axis">
      <div
        v-for="hour in hours"
        :key="hour"
        class="hour-row"
      >
        <span class="hour-label">{{ formatHour(hour) }}</span>
        <div class="hour-track" />
      </div>

      <div
        v-for="block in positionedBlocks"
        :key="block.id"
        class="block"
        :class="{
          'block--drop': dropTargetId === block.id,
          'block--focus': block.focus_session_enabled
        }"
        :style="block.style"
        @dragover.prevent="dropTargetId = block.id"
        @dragleave="onDragLeave(block.id)"
        @drop.prevent="onDrop($event, block)"
        @click="selectBlock(block)"
      >
        <div class="block__title">{{ block.title || block.reason_code || 'Schedule block' }}</div>
        <div class="block__meta">
          {{ block.assignment_count || 0 }} task{{ (block.assignment_count || 0) === 1 ? '' : 's' }}
        </div>
        <div class="block__drop-hint">Drag tasks here</div>
        <button
          v-if="block.focus_session_enabled && isBlockCurrent(block)"
          type="button"
          class="focus-btn"
          @click.stop="$emit('join-focus', block)"
        >
          Join Focus Session
        </button>
      </div>

      <div v-if="nowTop != null" class="now-line" :style="{ top: nowTop + 'px' }">
        <span>Now</span>
      </div>
    </div>

    <footer class="task-timeline__foot">
      <router-link :to="schedulePath" class="btn btn-secondary btn-sm">+ Add Time Block</router-link>
    </footer>
  </aside>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['select-block', 'join-focus', 'assigned']);

const route = useRoute();
const dayYmd = ref(toYmd(new Date()));
const blocks = ref([]);
const loading = ref(false);
const dropTargetId = ref(null);
const nowTick = ref(Date.now());
let timer = null;

const hours = Array.from({ length: 15 }, (_, i) => i + 6); // 6am–8pm
const PX_PER_HOUR = 48;
const AXIS_START = 6;

const schedulePath = computed(() => {
  const slug = route.params.organizationSlug;
  return slug ? `/${slug}/my-schedule` : '/my-schedule';
});

const isToday = computed(() => dayYmd.value === toYmd(new Date()));
const dayLabel = computed(() => {
  const d = parseYmd(dayYmd.value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
});

const positionedBlocks = computed(() =>
  (blocks.value || []).map((b) => {
    const { startMin, endMin } = blockMinutes(b);
    const top = ((startMin - AXIS_START * 60) / 60) * PX_PER_HOUR;
    const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 36);
    return {
      ...b,
      style: {
        top: `${Math.max(top, 0)}px`,
        height: `${height}px`
      }
    };
  })
);

const nowTop = computed(() => {
  if (!isToday.value) return null;
  const d = new Date(nowTick.value);
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins < AXIS_START * 60 || mins > 20 * 60) return null;
  return ((mins - AXIS_START * 60) / 60) * PX_PER_HOUR;
});

function toYmd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function shiftDay(delta) {
  const d = parseYmd(dayYmd.value);
  d.setDate(d.getDate() + delta);
  dayYmd.value = toYmd(d);
}
function goToday() {
  dayYmd.value = toYmd(new Date());
}
function formatHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr} ${ampm}`;
}
function blockMinutes(b) {
  if (b.all_day) return { startMin: AXIS_START * 60, endMin: AXIS_START * 60 + 60 };
  const start = b.start_at ? new Date(b.start_at) : parseYmd(dayYmd.value);
  const end = b.end_at ? new Date(b.end_at) : new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startMin: start.getHours() * 60 + start.getMinutes(),
    endMin: end.getHours() * 60 + end.getMinutes()
  };
}
function isBlockCurrent(b) {
  if (!isToday.value) return false;
  const { startMin, endMin } = blockMinutes(b);
  const d = new Date(nowTick.value);
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= startMin && mins < endMin;
}

async function fetchBlocks() {
  loading.value = true;
  try {
    const { data } = await api.get('/schedule-block-assignments/day', {
      params: { day: dayYmd.value },
      skipGlobalLoading: true
    });
    blocks.value = Array.isArray(data) ? data : [];
  } catch {
    blocks.value = [];
  } finally {
    loading.value = false;
  }
}

function selectBlock(block) {
  emit('select-block', block);
}

function onDragLeave(id) {
  if (dropTargetId.value === id) dropTargetId.value = null;
}

async function onDrop(ev, block) {
  dropTargetId.value = null;
  let payload = null;
  try {
    payload = JSON.parse(ev.dataTransfer.getData('application/x-assignable') || 'null');
  } catch {
    payload = null;
  }
  const taskId = ev.dataTransfer.getData('application/x-task-id');
  const assignableType = payload?.assignableType || 'task';
  const assignableId = payload?.assignableId || (taskId ? parseInt(taskId, 10) : null);
  if (!assignableId) return;
  try {
    await api.post(`/schedule-block-assignments/${block.id}`, {
      assignableType,
      assignableId
    }, { skipGlobalLoading: true });
    await fetchBlocks();
    emit('assigned', { block, assignableType, assignableId });
  } catch (e) {
    console.error('Failed to assign to block', e);
  }
}

watch(dayYmd, fetchBlocks);
onMounted(() => {
  fetchBlocks();
  timer = setInterval(() => { nowTick.value = Date.now(); }, 60000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });

defineExpose({ refresh: fetchBlocks, dayYmd });
</script>

<style scoped>
.task-timeline {
  width: 380px;
  flex: 0 0 380px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 160px);
  overflow: hidden;
}
.task-timeline__title-row {
  padding: 12px 12px 8px;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 100%);
}
.task-timeline__title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #14532d;
  letter-spacing: 0.01em;
}
.task-timeline__subtitle {
  margin: 2px 0 0;
  font-size: 11px;
  color: #64748b;
}
.task-timeline__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.task-timeline__date {
  flex: 1;
  text-align: center;
  font-size: 13px;
}
.nav-btn, .today-btn {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}
.task-timeline__state {
  padding: 16px;
  font-size: 13px;
  color: #64748b;
}
.link { color: #166534; font-weight: 600; }
.task-timeline__axis {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 8px 0;
}
.hour-row {
  display: grid;
  grid-template-columns: 48px 1fr;
  height: 48px;
}
.hour-label {
  font-size: 10px;
  color: #94a3b8;
  text-align: right;
  padding-right: 6px;
}
.hour-track {
  border-top: 1px solid #f1f5f9;
}
.block {
  position: absolute;
  left: 52px;
  right: 8px;
  background: #ecfdf5;
  border: 1px solid #86efac;
  border-left: 4px solid #16a34a;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  overflow: hidden;
  z-index: 2;
}
.block--focus { border-left-color: #7c3aed; background: #f5f3ff; }
.block--drop {
  outline: 2px dashed #166534;
  background: #dcfce7;
}
.block__title { font-size: 12px; font-weight: 700; color: #0f172a; }
.block__meta { font-size: 11px; color: #64748b; }
.block__drop-hint {
  font-size: 10px;
  color: #94a3b8;
  border-top: 1px dashed #cbd5e1;
  margin-top: 4px;
  padding-top: 2px;
}
.focus-btn {
  margin-top: 4px;
  width: 100%;
  border: 0;
  background: #166534;
  color: #fff;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px;
  cursor: pointer;
}
.now-line {
  position: absolute;
  left: 48px;
  right: 8px;
  border-top: 2px solid #16a34a;
  z-index: 3;
  pointer-events: none;
}
.now-line span {
  position: absolute;
  left: 0;
  top: -9px;
  background: #16a34a;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}
.task-timeline__foot {
  padding: 10px;
  border-top: 1px solid #e2e8f0;
}
@media (max-width: 900px) {
  .task-timeline {
    width: 100%;
    flex: 1 1 auto;
    max-height: 320px;
  }
}
:global(html.dark) .task-timeline,
:global(.dark) .task-timeline {
  background: #0f172a;
  border-color: #1e293b;
}
:global(html.dark) .block__title,
:global(.dark) .block__title {
  color: #f8fafc;
}
</style>
