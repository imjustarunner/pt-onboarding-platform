<template>
  <div class="sched-wrap">
    <div class="sched-toolbar">
      <div class="sched-toolbar-top">
        <h3 class="sched-week-title">{{ weekTitle }}</h3>
        <div class="sched-week-meta">
          <div class="sched-today-label">Today {{ todayMmdd }}</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="goToToday">Today</button>
        </div>
      </div>
      <div class="sched-toolbar-main">
        <div class="sched-toolbar-left">
          <button class="btn btn-secondary btn-sm" type="button" @click="shiftWeek(-7)">Prev</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="shiftWeek(7)">Next</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="load">Refresh</button>
        </div>
        <div class="sched-toolbar-right">
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleBusy }"
            role="switch"
            :aria-checked="String(!!showGoogleBusy)"
            @click="showGoogleBusy = !showGoogleBusy"
          >
            Google busy
          </button>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleEvents }"
            role="switch"
            :aria-checked="String(!!showGoogleEvents)"
            @click="showGoogleEvents = !showGoogleEvents"
            title="Shows event titles (sensitive)"
          >
            Google titles
          </button>
        </div>
      </div>
      <div v-if="overlayErrorText" class="hint" style="margin-top: 8px;">
        {{ overlayErrorText }}
      </div>
    </div>

    <div v-if="!effectiveAgencyIds.length" class="hint" style="margin-top: 10px;">Select an organization first.</div>
    <div v-else-if="loading" class="hint" style="margin-top: 10px;">Loading…</div>
    <div v-else-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>

    <div v-else class="sched-grid" :style="gridStyle">
      <div class="sched-head-cell"></div>
      <div v-for="d in ALL_DAYS" :key="d" class="sched-head-cell" :class="{ 'sched-head-today': isTodayDay(d) }">
        <div class="sched-head-day">
          <div class="sched-head-dow">{{ d }}</div>
          <div class="sched-head-date">{{ dayDateLabel(d) }}</div>
        </div>
      </div>

      <template v-for="h in hours" :key="`h-${h}`">
        <div class="sched-hour">{{ hourLabel(h) }}</div>
        <div v-for="d in ALL_DAYS" :key="`c-${d}-${h}`" class="sched-cell" :class="{ 'sched-cell-today': isTodayDay(d) }">
          <div class="cell-blocks">
            <div
              v-for="b in cellBlocks(d, h)"
              :key="b.key"
              class="cell-block"
              :class="`cell-block-${b.kind}`"
              :style="blockStyle(b)"
              :title="b.title"
              @click="onBlockClick($event, b)"
            >
              <span class="cell-block-text">{{ b.shortLabel }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userIds: { type: Array, required: true },
  agencyIds: { type: Array, default: null },
  weekStartYmd: { type: String, default: null },
  userLabelById: { type: Object, default: null }
});
const emit = defineEmits(['update:weekStartYmd']);

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

const pad2 = (n) => String(n).padStart(2, '0');
const localYmd = (d) => {
  const yy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}-${mm}-${dd}`;
};
const todayYmd = () => localYmd(new Date());
const todayMmdd = computed(() => {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
});
const startOfWeekMondayYmd = (ymd) => {
  const s = String(ymd || '').slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const offset = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - offset);
  return localYmd(d);
};
const addDaysYmd = (ymd, n) => {
  const s = String(ymd || '').slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(n || 0));
  return localYmd(d);
};

const effectiveWeekStart = computed(() => startOfWeekMondayYmd(props.weekStartYmd || todayYmd()) || startOfWeekMondayYmd(todayYmd()));
const shiftWeek = (deltaDays) => {
  const next = addDaysYmd(effectiveWeekStart.value, deltaDays);
  emit('update:weekStartYmd', next);
};
const goToToday = () => emit('update:weekStartYmd', startOfWeekMondayYmd(todayYmd()));

const isTodayDay = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName || ''));
  if (idx < 0) return false;
  const ymd = addDaysYmd(effectiveWeekStart.value, idx);
  return ymd === todayYmd();
};

const effectiveAgencyIds = computed(() => {
  const ids = Array.isArray(props.agencyIds) ? props.agencyIds : [];
  const out = [];
  const seen = new Set();
  for (const x of ids) {
    const n = Number(x || 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
});

const showGoogleBusy = ref(true);
const showGoogleEvents = ref(false);

const loading = ref(false);
const error = ref('');
const summariesByUserId = ref({}); // uid -> schedule-summary
const loadGeneration = ref(0);

const stableColorForId = (id) => {
  const n = Number(id || 0);
  if (!n) return 'rgba(0,0,0,0.25)';
  const hue = (n * 47) % 360;
  return `hsl(${hue} 70% 45%)`;
};

const blockStyle = (b) => {
  const uid = Number(b?.userId || 0);
  return uid ? { '--user-color': stableColorForId(uid) } : {};
};

const initialsForUser = (uid) => {
  const label = String(props.userLabelById?.[uid] || '').trim();
  const parts = label.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  const init = (first + last).toUpperCase();
  return init || String(uid);
};

const load = async () => {
  const generation = loadGeneration.value + 1;
  loadGeneration.value = generation;
  const agencyIds = effectiveAgencyIds.value;
  const ids = (props.userIds || []).map((x) => Number(x)).filter(Boolean);
  if (!agencyIds.length || !ids.length) {
    if (generation !== loadGeneration.value) return;
    summariesByUserId.value = {};
    return;
  }
  const keep = {};
  for (const uid of ids) {
    if (summariesByUserId.value?.[uid]) keep[uid] = summariesByUserId.value[uid];
  }
  summariesByUserId.value = keep;
  try {
    loading.value = true;
    error.value = '';
    const ws = effectiveWeekStart.value;
    const results = await Promise.all(
      ids.map(async (uid) => {
        try {
          const perAgency = await Promise.all(
            agencyIds.map((agencyId) =>
              api
                .get(`/users/${uid}/schedule-summary`, {
                  params: {
                    agencyId,
                    weekStart: ws,
                    includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false',
                    includeGoogleEvents: showGoogleEvents.value ? 'true' : 'false'
                  }
                })
                .then((r) => ({ ok: true, agencyId, data: r.data }))
                .catch((e) => ({
                  ok: false,
                  agencyId,
                  error: e?.response?.data?.error?.message || e?.message || 'Failed to load schedule'
                }))
            )
          );

          const okOnes = perAgency.filter((r) => r.ok && r.data);
          const first = okOnes[0]?.data || null;
          if (!first) {
            const msg =
              perAgency
                .filter((r) => !r.ok)
                .slice(0, 1)
                .map((r) => r.error)[0] || 'Failed to load schedule';
            return { ok: false, uid, error: msg };
          }

          const tag = (row, agencyId) => ({ ...row, _agencyId: agencyId });
          const merged = {
            ...first,
            agencyId: first.agencyId || agencyIds[0],
            agencyIds: [...agencyIds],
            schoolAssignments: [],
            officeEvents: [],
            supervisionSessions: []
          };
          for (const r of okOnes) {
            const aId = r.agencyId;
            merged.schoolAssignments.push(...(r.data?.schoolAssignments || []).map((x) => tag(x, aId)));
            merged.officeEvents.push(...(r.data?.officeEvents || []).map((x) => tag(x, aId)));
            merged.supervisionSessions.push(...(r.data?.supervisionSessions || []).map((x) => tag(x, aId)));
          }

          // Overlays are per-user (not agency-scoped), so prefer from the first successful result.
          merged.googleBusy = first.googleBusy || [];
          merged.googleBusyError = first.googleBusyError || null;
          merged.googleEvents = first.googleEvents || [];
          merged.googleEventsError = first.googleEventsError || null;
          merged.externalCalendars = first.externalCalendars || [];
          merged.externalCalendarsAvailable = first.externalCalendarsAvailable || [];

          return { ok: true, uid, data: merged };
        } catch (e) {
          return { ok: false, uid, error: e?.response?.data?.error?.message || e?.message || 'Failed to load schedule' };
        }
      })
    );
    const next = {};
    for (const r of results) {
      if (r.ok && r.data) next[r.uid] = r.data;
    }
    if (generation !== loadGeneration.value) return;
    summariesByUserId.value = next;
    const errs = results.filter((r) => !r.ok).slice(0, 2).map((r) => `${props.userLabelById?.[r.uid] || `User ${r.uid}`}: ${r.error}`);
    error.value = errs.length ? errs.join(' • ') : '';
  } finally {
    if (generation !== loadGeneration.value) return;
    loading.value = false;
  }
};

watch([() => props.userIds, effectiveWeekStart, showGoogleBusy, showGoogleEvents, effectiveAgencyIds], () => void load(), { deep: true, immediate: true });

const gridStyle = computed(() => ({
  gridTemplateColumns: `64px repeat(${ALL_DAYS.length}, minmax(0, 1fr))`
}));

const weekTitle = computed(() => {
  const ws = effectiveWeekStart.value;
  const we = addDaysYmd(ws, 6);
  return `Week of ${ws} – ${we}`;
});

const dayDateLabel = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName));
  const ymd = addDaysYmd(effectiveWeekStart.value, idx);
  try {
    const d = new Date(`${ymd}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return ymd;
  }
};

const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const parseMaybeDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

const overlapsHour = (startHHMM, endHHMM, hour) => {
  const start = String(startHHMM || '').slice(0, 5);
  const end = String(endHHMM || '').slice(0, 5);
  const sh = Number(start.slice(0, 2));
  const sm = Number(start.slice(3, 5));
  const eh = Number(end.slice(0, 2));
  const em = Number(end.slice(3, 5));
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return false;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const cellStart = Number(hour) * 60;
  const cellEnd = (Number(hour) + 1) * 60;
  return endMin > cellStart && startMin < cellEnd;
};

const hasBusyIntervals = (busyList, dayName, hour, ws) => {
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return false;
  const cellDate = addDaysYmd(ws, dayIdx);
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
  const cellEnd = new Date(`${cellDate}T${pad2(Number(hour) + 1)}:00:00`);
  for (const b of busyList || []) {
    const start = new Date(b.startAt);
    const end = new Date(b.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end > cellStart && start < cellEnd) return true;
  }
  return false;
};

const eventBlocksForUserCell = (uid, dayName, hour) => {
  const s = summariesByUserId.value?.[uid];
  if (!s) return [];
  const ws = s.weekStart || effectiveWeekStart.value;
  const init = initialsForUser(uid);
  const blocks = [];

  // school
  const schoolHits = (s.schoolAssignments || []).filter((a) => String(a.dayOfWeek) === dayName && overlapsHour(a.startTime, a.endTime, hour));
  if (schoolHits.length) {
    const names = schoolHits.map((x) => String(x.schoolName || '').trim()).filter(Boolean);
    const short = names.length === 1 ? names[0] : names.length ? `${names[0]}+${names.length - 1}` : 'School';
    blocks.push({
      kind: 'school',
      key: `u${uid}-school-${dayName}-${hour}`,
      userId: uid,
      shortLabel: `${init} ${short}`,
      title: `${props.userLabelById?.[uid] || `User ${uid}`} — School — ${short}`
    });
  }

  // office (state)
  const cellDate = addDaysYmd(ws, ALL_DAYS.indexOf(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
  const cellEnd = new Date(`${cellDate}T${pad2(Number(hour) + 1)}:00:00`);
  const officeHits = (s.officeEvents || []).filter((e) => {
    const st = parseMaybeDate(e.startAt);
    const en = parseMaybeDate(e.endAt);
    return st && en && en > cellStart && st < cellEnd;
  });
  const stateRank = (st) => (st === 'ASSIGNED_BOOKED' ? 3 : st === 'ASSIGNED_TEMPORARY' ? 2 : st === 'ASSIGNED_AVAILABLE' ? 1 : 0);
  if (officeHits.length) {
    const top = officeHits.sort((a, b) => stateRank(String(b.slotState || '').toUpperCase()) - stateRank(String(a.slotState || '').toUpperCase()))[0];
    const st = String(top?.slotState || '').toUpperCase();
    const kind = st === 'ASSIGNED_BOOKED' ? 'ob' : st === 'ASSIGNED_TEMPORARY' ? 'ot' : st === 'ASSIGNED_AVAILABLE' ? 'oa' : 'oa';
    const roomNumber = String(top?.roomNumber || '').trim();
    const roomLabel = String(top?.roomLabel || '').trim();
    const roomShort = roomNumber ? `#${roomNumber}` : (roomLabel || (st === 'ASSIGNED_BOOKED' ? 'Booked' : st === 'ASSIGNED_TEMPORARY' ? 'Temp' : 'Office'));
    const fullRoom = roomNumber ? `#${roomNumber}${roomLabel ? ` (${roomLabel})` : ''}` : (roomLabel || 'Office');
    blocks.push({
      kind,
      key: `u${uid}-office-${dayName}-${hour}`,
      userId: uid,
      shortLabel: `${init} ${roomShort}`,
      title: `${props.userLabelById?.[uid] || `User ${uid}`} — Office — ${fullRoom}`
    });
    if (top?.inPersonIntakeEnabled) {
      blocks.push({
        kind: 'intake-ip',
        key: `u${uid}-intake-ip-${dayName}-${hour}`,
        userId: uid,
        shortLabel: `${init} IP`,
        title: `${props.userLabelById?.[uid] || `User ${uid}`} — In-person intake enabled`
      });
    }
    if (top?.virtualIntakeEnabled) {
      blocks.push({
        kind: 'intake-vi',
        key: `u${uid}-intake-vi-${dayName}-${hour}`,
        userId: uid,
        shortLabel: `${init} VI`,
        title: `${props.userLabelById?.[uid] || `User ${uid}`} — Virtual intake enabled`
      });
    }
  }

  // supervision
  const supvHits = (s.supervisionSessions || []).filter((e) => {
    const st = parseMaybeDate(e.startAt);
    const en = parseMaybeDate(e.endAt);
    return st && en && en > cellStart && st < cellEnd;
  });
  if (supvHits.length) {
    const who = String(supvHits[0]?.counterpartyName || '').trim() || 'Supv';
    blocks.push({
      kind: 'supv',
      key: `u${uid}-supv-${dayName}-${hour}`,
      userId: uid,
      shortLabel: `${init} ${who}`,
      title: `${props.userLabelById?.[uid] || `User ${uid}`} — Supervision — ${who}`
    });
  }

  // google busy
  if (showGoogleBusy.value && hasBusyIntervals(s.googleBusy || [], dayName, hour, ws)) {
    blocks.push({
      kind: 'gbusy',
      key: `u${uid}-gbusy-${dayName}-${hour}`,
      userId: uid,
      shortLabel: `${init} G`,
      title: `${props.userLabelById?.[uid] || `User ${uid}`} — Google busy`
    });
  }

  // google event titles
  if (showGoogleEvents.value) {
    const evs = Array.isArray(s.googleEvents) ? s.googleEvents : [];
    for (const ev of evs) {
      const st = parseMaybeDate(ev.startAt);
      const en = parseMaybeDate(ev.endAt);
      if (!st || !en) continue;
      const idx = ALL_DAYS.indexOf(dayName);
      const dayDate = addDaysYmd(ws, idx);
      const cs = new Date(`${dayDate}T${pad2(hour)}:00:00`);
      const ce = new Date(`${dayDate}T${pad2(Number(hour) + 1)}:00:00`);
      if (!(en > cs && st < ce)) continue;
      const summary = String(ev.summary || '').trim() || 'Event';
      blocks.push({
        kind: 'gevt',
        key: `u${uid}-gevt-${ev.id || summary}-${dayName}-${hour}`,
        userId: uid,
        shortLabel: `${init} ${summary}`,
        title: `${props.userLabelById?.[uid] || `User ${uid}`} — ${summary}`,
        link: ev.htmlLink || null
      });
    }
  }

  return blocks;
};

const cellBlocks = (dayName, hour) => {
  const out = [];
  const ids = (props.userIds || []).map((x) => Number(x)).filter(Boolean);
  for (const uid of ids) out.push(...eventBlocksForUserCell(uid, dayName, hour));
  // Cap visible blocks
  if (out.length > 3) {
    const shown = out.slice(0, 3);
    shown.push({ kind: 'more', key: `more-${dayName}-${hour}`, shortLabel: `+${out.length - 3}`, title: `${out.length - 3} more…` });
    return shown;
  }
  return out;
};

const overlayErrorText = computed(() => {
  const ids = (props.userIds || []).map((x) => Number(x)).filter(Boolean);
  const msgs = [];
  for (const uid of ids) {
    const s = summariesByUserId.value?.[uid];
    const parts = [];
    if (showGoogleBusy.value) {
      const e1 = String(s?.googleBusyError || '').trim();
      if (e1) parts.push(`busy: ${e1}`);
    }
    if (showGoogleEvents.value) {
      const e2 = String(s?.googleEventsError || '').trim();
      if (e2) parts.push(`events: ${e2}`);
    }
    if (parts.length) msgs.push(`${props.userLabelById?.[uid] || `User ${uid}`}: ${parts.join(', ')}`);
    if (msgs.length >= 2) break;
  }
  return msgs.length ? `Calendar overlay error: ${msgs.join(' • ')}` : '';
});

const onBlockClick = (e, b) => {
  if (b?.kind !== 'gevt') return;
  const link = String(b?.link || '').trim();
  if (!link) return;
  e?.preventDefault?.();
  e?.stopPropagation?.();
  window.open(link, '_blank', 'noreferrer');
};
</script>

<style scoped>
.sched-wrap { width: 100%; }
.sched-toolbar { margin-top: 10px; }
.sched-toolbar-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
.sched-week-title { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }
.sched-week-meta { display: inline-flex; align-items: center; gap: 10px; }
.sched-today-label { font-size: 12px; font-weight: 900; color: var(--text-secondary); white-space: nowrap; }
.sched-toolbar-main { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.sched-toolbar-left, .sched-toolbar-right { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sched-toggle { display: inline-flex; gap: 8px; align-items: center; font-size: 12px; color: var(--text-secondary); font-weight: 800; }

.sched-pill {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 900;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  white-space: nowrap;
  cursor: pointer;
}
.sched-pill.on {
  background: rgba(59, 130, 246, 0.10);
  border-color: rgba(59, 130, 246, 0.35);
  color: rgba(37, 99, 235, 0.95);
}
.sched-head-today { background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.06)); }
.sched-cell-today { background: rgba(59, 130, 246, 0.05); }

.sched-grid {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}
.sched-head-cell {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 8px;
}
.sched-head-day { display: flex; flex-direction: column; gap: 2px; }
.sched-head-dow { font-weight: 900; font-size: 12px; }
.sched-head-date { font-weight: 800; font-size: 11px; color: var(--text-secondary); }

.sched-hour {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
  font-size: 12px;
  font-weight: 900;
  color: var(--text-secondary);
}
.sched-cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  padding: 4px;
  min-height: 34px;
}
.cell-blocks { display: flex; gap: 6px; flex-wrap: wrap; }
.cell-block {
  cursor: default;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-left: 5px solid var(--user-color, rgba(15, 23, 42, 0.18));
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 900;
  max-width: 100%;
}
.cell-block-text { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cell-block-school { background: rgba(45, 156, 219, 0.18); border-color: rgba(45, 156, 219, 0.50); }
.cell-block-supv { background: rgba(155, 81, 224, 0.16); border-color: rgba(155, 81, 224, 0.45); }
.cell-block-oa { background: rgba(39, 174, 96, 0.18); border-color: rgba(39, 174, 96, 0.45); }
.cell-block-ot { background: rgba(242, 153, 74, 0.18); border-color: rgba(242, 153, 74, 0.50); }
.cell-block-ob { background: rgba(235, 87, 87, 0.18); border-color: rgba(235, 87, 87, 0.50); }
.cell-block-intake-ip { background: rgba(34, 197, 94, 0.20); border-color: rgba(21, 128, 61, 0.45); color: rgba(21, 128, 61, 0.95); }
.cell-block-intake-vi { background: rgba(59, 130, 246, 0.20); border-color: rgba(29, 78, 216, 0.45); color: rgba(29, 78, 216, 0.95); }
.cell-block-gbusy { background: rgba(17, 24, 39, 0.10); border-color: rgba(17, 24, 39, 0.35); color: rgba(17, 24, 39, 0.95); }
.cell-block-gevt { cursor: pointer; background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.35); }
.cell-block-more { background: rgba(148, 163, 184, 0.14); border-color: rgba(148, 163, 184, 0.40); color: rgba(51, 65, 85, 0.92); }

.hint { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; color: var(--text-secondary); font-weight: 800; }
.error { background: #fee; border: 1px solid #fcc; border-radius: 12px; padding: 10px 12px; font-weight: 800; }
</style>

