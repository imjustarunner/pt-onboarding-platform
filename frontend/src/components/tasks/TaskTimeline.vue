<template>
  <aside class="task-timeline" aria-label="Task Timeline">
    <div class="task-timeline__title-row">
      <h2 class="task-timeline__title">Task Timeline</h2>
      <p class="task-timeline__subtitle">Click or drag empty space to add a schedule block · drop tasks on blocks</p>
    </div>
    <header class="task-timeline__head">
      <button type="button" class="nav-btn" @click="shiftDay(-1)" aria-label="Previous day">‹</button>
      <div class="task-timeline__date">
        <strong>{{ dayLabel }}</strong>
        <button v-if="!isToday" type="button" class="today-btn" @click="goToday">Today</button>
      </div>
      <button type="button" class="nav-btn" @click="shiftDay(1)" aria-label="Next day">›</button>
    </header>

    <div
      v-show="!loading"
      ref="axisRef"
      class="task-timeline__axis"
      :class="{ 'task-timeline__axis--dragging': !!dragState }"
      @pointerdown="onAxisPointerDown"
    >
      <div
        v-for="hour in hours"
        :key="hour"
        class="hour-row"
      >
        <span class="hour-label">{{ formatHour(hour) }}</span>
        <div class="hour-track" />
      </div>

      <!-- Other meetings / events (read-only) -->
      <div
        v-for="ev in positionedOtherEvents"
        :key="`o-${ev.id}`"
        class="other-event"
        :style="ev.style"
        :title="ev.title"
      >
        <div class="other-event__title">{{ ev.title }}</div>
      </div>

      <!-- Schedule blocks (drop targets) -->
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
        @pointerdown.stop
        @click.stop="selectBlock(block)"
      >
        <div class="block__title">{{ block.title || block.reason_code || 'Focus Time' }}</div>
        <div class="block__meta">
          {{ block.assignment_count || 0 }} task{{ (block.assignment_count || 0) === 1 ? '' : 's' }}
        </div>
        <ul v-if="(block.assignments || []).length" class="block__tasks">
          <li v-for="a in (block.assignments || []).slice(0, 3)" :key="a.id">{{ a.title }}</li>
        </ul>
        <div v-else class="block__drop-hint">Drag tasks here</div>
        <button
          v-if="block.focus_session_enabled && isBlockCurrent(block) && (block.assignment_count || 0) > 0"
          type="button"
          class="focus-btn"
          @click.stop="$emit('join-focus', block)"
        >
          Join Focus Session
        </button>
      </div>

      <!-- Drag-create preview -->
      <div
        v-if="dragPreview"
        class="block-preview"
        :style="{ top: dragPreview.top + 'px', height: dragPreview.height + 'px' }"
      >
        New schedule block
        <span>{{ dragPreview.label }}</span>
      </div>

      <div v-if="nowTop != null" class="now-line" :style="{ top: nowTop + 'px' }">
        <span>Now</span>
      </div>
    </div>

    <div v-if="loading" class="task-timeline__state">Loading…</div>

    <div v-if="showCreateSheet" class="create-sheet">
      <h3>New schedule block</h3>
      <p class="muted">{{ createLabel }}</p>
      <label class="field">
        <span>Title</span>
        <input v-model="createTitle" class="form-control" type="text" placeholder="Focus Time" />
      </label>
      <label class="check">
        <input v-model="createFocus" type="checkbox" />
        Enable Focus Session
      </label>
      <div v-if="openTasks.length" class="assign-pick">
        <span class="assign-pick__label">Assign open tasks (optional)</span>
        <label v-for="t in openTasks.slice(0, 8)" :key="t.id" class="check">
          <input v-model="createAssignIds" type="checkbox" :value="t.id" />
          {{ t.title }}
        </label>
      </div>
      <div class="create-sheet__actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="creating" @click="confirmCreate">
          {{ creating ? 'Creating…' : 'Create block' }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="showCreateSheet = false">Cancel</button>
      </div>
      <p v-if="createError" class="error">{{ createError }}</p>
    </div>

    <footer class="task-timeline__foot">
      <button type="button" class="btn-add-block" @click="addBlockAtNow">+ Add Time Block</button>
    </footer>
  </aside>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { parseScheduleInstant } from '../../utils/parseScheduleInstant';

const props = defineProps({
  agencyId: { type: Number, default: null },
  /** Open tasks available to assign when booking a block */
  openTasks: { type: Array, default: () => [] }
});

const emit = defineEmits(['select-block', 'join-focus', 'assigned', 'blocks-changed']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const dayYmd = ref(toYmd(new Date()));
const blocks = ref([]);
const otherEvents = ref([]);
const loading = ref(false);
const dropTargetId = ref(null);
const nowTick = ref(Date.now());
const axisRef = ref(null);
const dragState = ref(null);
const dragPreview = ref(null);
const showCreateSheet = ref(false);
const createStartMin = ref(null);
const createEndMin = ref(null);
const createTitle = ref('Focus Time');
const createFocus = ref(true);
const createAssignIds = ref([]);
const creating = ref(false);
const createError = ref('');
let timer = null;

const hours = Array.from({ length: 24 }, (_, i) => i); // midnight–11pm
const PX_PER_HOUR = 48;
const AXIS_START = 0;
const AXIS_END = 24;

const isToday = computed(() => dayYmd.value === toYmd(new Date()));
const dayLabel = computed(() => {
  const d = parseYmd(dayYmd.value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
});

const createLabel = computed(() => {
  if (createStartMin.value == null || createEndMin.value == null) return '';
  return `${minsToLabel(createStartMin.value)} – ${minsToLabel(createEndMin.value)}`;
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

const positionedOtherEvents = computed(() =>
  (otherEvents.value || []).map((ev) => {
    const { startMin, endMin } = eventMinutes(ev);
    const top = ((startMin - AXIS_START * 60) / 60) * PX_PER_HOUR;
    const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 22);
    return {
      ...ev,
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
  return ((mins - AXIS_START * 60) / 60) * PX_PER_HOUR;
});

function scrollToNow() {
  if (!isToday.value || !axisRef.value) return;
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  const top = ((mins - AXIS_START * 60) / 60) * PX_PER_HOUR;
  axisRef.value.scrollTop = Math.max(0, top - axisRef.value.clientHeight / 3);
}

const assignedIds = computed(() => {
  const set = new Set();
  for (const b of blocks.value || []) {
    for (const a of b.assignments || []) {
      if (a.assignable_type === 'task' || a.assignable_type === 'action_item') {
        set.add(`${a.assignable_type}:${a.assignable_id}`);
      }
    }
  }
  return set;
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
function minsToLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}
function blockMinutes(b) {
  if (b.all_day) return { startMin: AXIS_START * 60, endMin: AXIS_START * 60 + 60 };
  const start = b.start_at ? parseScheduleInstant(b.start_at) : parseYmd(dayYmd.value);
  const end = b.end_at ? parseScheduleInstant(b.end_at) : new Date((start?.getTime() || Date.now()) + 60 * 60 * 1000);
  if (!start || !end) return { startMin: AXIS_START * 60, endMin: AXIS_START * 60 + 60 };
  return {
    startMin: start.getHours() * 60 + start.getMinutes(),
    endMin: end.getHours() * 60 + end.getMinutes()
  };
}
function eventMinutes(ev) {
  const start = parseScheduleInstant(ev.startAt || ev.start_at);
  const end = parseScheduleInstant(ev.endAt || ev.end_at);
  if (!start) return { startMin: AXIS_START * 60, endMin: AXIS_START * 60 + 30 };
  const endSafe = end || new Date(start.getTime() + 30 * 60 * 1000);
  return {
    startMin: start.getHours() * 60 + start.getMinutes(),
    endMin: endSafe.getHours() * 60 + endSafe.getMinutes()
  };
}
function isBlockCurrent(b) {
  if (!isToday.value) return false;
  const { startMin, endMin } = blockMinutes(b);
  const d = new Date(nowTick.value);
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= startMin && mins < endMin;
}

function weekStartFor(ymd) {
  const d = parseYmd(ymd);
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  return toYmd(d);
}

async function fetchBlocks() {
  loading.value = true;
  try {
    const uid = authStore.user?.id;
    const [blockRes, summaryRes] = await Promise.all([
      api.get('/schedule-block-assignments/day', {
        params: { day: dayYmd.value },
        skipGlobalLoading: true
      }),
      uid
        ? api.get(`/users/${uid}/schedule-summary`, {
            params: {
              weekStart: weekStartFor(dayYmd.value),
              weekStartsOn: 'monday',
              includeAllAgencies: 'true',
              detailLevel: 'full'
            },
            skipGlobalLoading: true
          }).catch(() => ({ data: null }))
        : Promise.resolve({ data: null })
    ]);
    blocks.value = Array.isArray(blockRes.data) ? blockRes.data : [];
    const holdIds = new Set(blocks.value.map((b) => Number(b.id)));
    const events = Array.isArray(summaryRes?.data?.scheduleEvents) ? summaryRes.data.scheduleEvents : [];
    otherEvents.value = events
      .filter((ev) => {
        const kind = String(ev.kind || '').toUpperCase();
        if (kind === 'SCHEDULE_HOLD' && holdIds.has(Number(ev.id))) return false;
        const start = parseScheduleInstant(ev.startAt || ev.start_at);
        if (!start) return false;
        return toYmd(start) === dayYmd.value;
      })
      .map((ev) => ({
        id: ev.id,
        title: ev.title || ev.summary || ev.kind || 'Busy',
        startAt: ev.startAt || ev.start_at,
        endAt: ev.endAt || ev.end_at,
        kind: ev.kind
      }));
    emit('blocks-changed', { blocks: blocks.value, assignedIds: assignedIds.value });
  } catch {
    blocks.value = [];
    otherEvents.value = [];
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

function resolveAgencyId() {
  const raw = props.agencyId
    ?? agencyStore.currentAgency?.id
    ?? agencyStore.currentAgency?.value?.id
    ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isEmptyAxisTarget(target) {
  if (!target?.closest) return false;
  if (target.closest('.block')) return false;
  if (target.closest('.block-preview')) return false;
  if (target.closest('.now-line')) return false;
  return !!target.closest('.task-timeline__axis');
}

function clearDragListeners() {
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  window.removeEventListener('pointercancel', onWindowPointerUp);
}

function openCreateSheetFromRange(startMin, endMin) {
  let a = startMin;
  let b = endMin;
  if (b < a) [a, b] = [b, a];
  if (b - a < 15) b = a + 60;
  createStartMin.value = a;
  createEndMin.value = Math.min(b, AXIS_END * 60);
  createTitle.value = 'Focus Time';
  createFocus.value = true;
  createAssignIds.value = [];
  createError.value = '';
  showCreateSheet.value = true;
}

function onAxisPointerDown(ev) {
  if (ev.button !== 0) return;
  if (!isEmptyAxisTarget(ev.target)) return;
  if (showCreateSheet.value) return;
  const start = yToMinutes(ev.clientY);
  dragState.value = {
    start,
    end: start + 60,
    startClientY: ev.clientY,
    pointerId: ev.pointerId,
    moved: false
  };
  updatePreview(dragState.value.start, dragState.value.end);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);
  ev.preventDefault();
}

function onWindowPointerMove(ev) {
  if (!dragState.value || ev.pointerId !== dragState.value.pointerId) return;
  const dy = Math.abs(ev.clientY - dragState.value.startClientY);
  if (dy > 4) dragState.value.moved = true;
  const end = yToMinutes(ev.clientY);
  dragState.value = { ...dragState.value, end };
  updatePreview(dragState.value.start, end);
}

function onWindowPointerUp(ev) {
  if (!dragState.value || ev.pointerId !== dragState.value.pointerId) return;
  const { start, end, moved } = dragState.value;
  clearDragListeners();
  dragState.value = null;
  dragPreview.value = null;
  if (moved) {
    openCreateSheetFromRange(start, end);
  } else {
    openCreateSheetFromRange(start, start + 60);
  }
}

function addBlockAtNow() {
  if (isToday.value) {
    const d = new Date();
    const mins = d.getHours() * 60 + d.getMinutes();
    const snapped = Math.round(mins / 15) * 15;
    openCreateSheetFromRange(snapped, snapped + 60);
    nextTick(() => scrollToNow());
  } else {
    openCreateSheetFromRange(9 * 60, 10 * 60);
  }
}

function yToMinutes(clientY) {
  const el = axisRef.value;
  if (!el) return AXIS_START * 60;
  const rect = el.getBoundingClientRect();
  const y = clientY - rect.top + el.scrollTop;
  const raw = AXIS_START * 60 + (y / PX_PER_HOUR) * 60;
  const snapped = Math.round(raw / 15) * 15;
  return Math.min(Math.max(snapped, AXIS_START * 60), AXIS_END * 60);
}

function updatePreview(start, end) {
  let a = start;
  let b = end;
  if (b < a) [a, b] = [b, a];
  if (b - a < 15) b = a + 60;
  const top = ((a - AXIS_START * 60) / 60) * PX_PER_HOUR;
  const height = Math.max(((b - a) / 60) * PX_PER_HOUR, 36);
  dragPreview.value = {
    top,
    height,
    label: `${minsToLabel(a)} – ${minsToLabel(b)}`
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

async function confirmCreate() {
  const uid = authStore.user?.id;
  if (!uid || createStartMin.value == null || createEndMin.value == null) return;
  creating.value = true;
  createError.value = '';
  try {
    const sh = Math.floor(createStartMin.value / 60);
    const sm = createStartMin.value % 60;
    const eh = Math.floor(createEndMin.value / 60);
    const em = createEndMin.value % 60;
    const startAt = `${dayYmd.value}T${pad2(sh)}:${pad2(sm)}:00`;
    const endAt = `${dayYmd.value}T${pad2(eh)}:${pad2(em)}:00`;
    const aid = resolveAgencyId();
    const resp = await api.post(`/users/${uid}/schedule-events`, {
      agencyId: aid || undefined,
      kind: 'SCHEDULE_HOLD',
      title: createTitle.value.trim() || 'Focus Time',
      allDay: false,
      startAt,
      endAt,
      reasonCode: 'FOCUS_TIME',
      focusSessionEnabled: !!createFocus.value,
      isPrivate: false,
      allowLocalOnly: true
    }, { skipGlobalLoading: true });
    const created = resp?.data?.event || resp?.data;
    const eventId = created?.id;
    if (eventId && createAssignIds.value.length) {
      await Promise.all(
        createAssignIds.value.map((id) =>
          api.post(`/schedule-block-assignments/${eventId}`, {
            assignableType: 'task',
            assignableId: id
          }, { skipGlobalLoading: true }).catch(() => null)
        )
      );
    }
    showCreateSheet.value = false;
    await fetchBlocks();
    if (eventId) {
      const block = blocks.value.find((b) => Number(b.id) === Number(eventId));
      if (block) emit('select-block', block);
    }
  } catch (e) {
    createError.value = e?.response?.data?.error?.message || e?.message || 'Failed to create block';
  } finally {
    creating.value = false;
  }
}

watch(dayYmd, () => {
  fetchBlocks();
  nextTick(() => scrollToNow());
});
onMounted(() => {
  fetchBlocks().then(() => nextTick(() => scrollToNow()));
  timer = setInterval(() => { nowTick.value = Date.now(); }, 60000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  clearDragListeners();
});

defineExpose({ refresh: fetchBlocks, dayYmd, startBooking: addBlockAtNow, assignedIds });
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
.booking-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f5f3ff;
  border-bottom: 1px solid #ddd6fe;
  font-size: 11px;
  color: #5b21b6;
}
.linkish {
  border: 0;
  background: transparent;
  color: #5b21b6;
  font-weight: 700;
  cursor: pointer;
  font-size: 11px;
}
.task-timeline__state {
  padding: 16px;
  font-size: 13px;
  color: #64748b;
}
.task-timeline__axis {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 0 0;
  min-height: 240px;
  user-select: none;
  touch-action: pan-y;
  cursor: crosshair;
}
.task-timeline__axis--dragging {
  touch-action: none;
  cursor: grabbing;
}
.task-timeline__axis--dragging .hour-row {
  pointer-events: none;
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
  transform: translateY(-5px);
}
.hour-track {
  border-top: 1px solid #f1f5f9;
}
.other-event {
  position: absolute;
  left: 52px;
  right: 8px;
  background: #f1f5f9;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 4px 6px;
  opacity: 0.72;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.other-event__title {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.block__tasks {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  font-size: 10px;
  color: #475569;
}
.block__tasks li {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.block__drop-hint {
  font-size: 10px;
  color: #94a3b8;
  border-top: 1px dashed #cbd5e1;
  margin-top: 4px;
  padding-top: 2px;
}
.block-preview {
  position: absolute;
  left: 52px;
  right: 8px;
  background: rgba(124, 58, 237, 0.15);
  border: 2px dashed #7c3aed;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #5b21b6;
  z-index: 4;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
.create-sheet {
  border-top: 1px solid #e2e8f0;
  padding: 12px;
  background: #fafafa;
}
.create-sheet h3 {
  margin: 0 0 4px;
  font-size: 14px;
}
.muted { color: #64748b; font-size: 12px; margin: 0 0 10px; }
.field { display: block; margin-bottom: 8px; }
.field > span {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  margin-bottom: 3px;
}
.form-control {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  margin: 6px 0;
  cursor: pointer;
}
.assign-pick {
  max-height: 120px;
  overflow-y: auto;
  margin: 8px 0;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}
.assign-pick__label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 4px;
}
.create-sheet__actions { display: flex; gap: 8px; margin-top: 8px; }
.error { color: #b91c1c; font-size: 12px; margin: 6px 0 0; }
.btn-primary {
  border: 0;
  background: #166534;
  color: #fff;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.btn-ghost {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.task-timeline__foot {
  padding: 10px;
  border-top: 1px solid #e2e8f0;
}
.btn-add-block {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: transparent;
  color: #14532d;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.btn-add-block:hover {
  background: #f0fdf4;
  border-color: #86efac;
}
@media (max-width: 900px) {
  .task-timeline {
    width: 100%;
    flex: 1 1 auto;
    max-height: 420px;
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
