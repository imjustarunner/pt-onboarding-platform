<template>
  <div class="avail-wrap">
    <div class="hint">Submit additional availability for office or school. If you are supervised, confirm your 2-week block availability here too.</div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="muted" style="margin-top: 10px;">Loading…</div>

    <div v-else>
      <div class="grid">
        <!-- Building availability request (office slots inside a building) -->
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Building availability request</div>
              <div class="muted">For providers who are open to being assigned a temporary office slot inside a building.</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="refresh" :disabled="saving">Refresh</button>
          </div>

          <div v-if="pending.officeRequests.length" class="notice">
            You already have a pending office availability request. Staff will review it soon.
          </div>

          <div v-else class="form">
            <label class="lbl">Preferred buildings (optional)</label>
            <select class="select" multiple v-model="officeForm.preferredOfficeIds">
              <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
            </select>

            <label class="lbl" style="margin-top: 10px;">Requested day/time windows</label>
            <div class="slots">
              <div v-for="(s, idx) in officeForm.slots" :key="idx" class="slot-row">
                <select class="select" v-model.number="s.weekday">
                  <option v-for="d in weekdays" :key="d.value" :value="d.value">{{ d.label }}</option>
                </select>
                <select class="select" v-model.number="s.startHour">
                  <option v-for="h in hours" :key="`s-${h}`" :value="h">{{ hourLabel(h) }}</option>
                </select>
                <select class="select" v-model.number="s.endHour">
                  <option v-for="h in hoursEnd" :key="`e-${h}`" :value="h">{{ hourLabel(h) }}</option>
                </select>
                <button class="btn btn-secondary btn-sm" @click="removeOfficeSlot(idx)">Remove</button>
              </div>
              <button class="btn btn-secondary btn-sm" @click="addOfficeSlot">Add window</button>
            </div>

            <label class="lbl" style="margin-top: 10px;">Notes (optional)</label>
            <textarea class="textarea" v-model="officeForm.notes" rows="3" placeholder="Any constraints or preferences…" />

            <div class="actions">
              <button class="btn btn-primary" @click="submitOffice" :disabled="saving">Submit building availability</button>
            </div>
          </div>
        </div>

        <!-- School availability request -->
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">School availability request</div>
              <div class="muted">Share day/time availability for staff to assign you to a school.</div>
            </div>
          </div>

          <div v-if="pending.schoolRequests.length" class="notice">
            You already have a pending school availability request. Staff will review it soon.
          </div>

          <div v-else class="form">
            <label class="lbl">Preferred schools/programs (optional)</label>
            <select class="select" multiple v-model="schoolForm.preferredSchoolOrgIds">
              <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
            </select>

            <label class="lbl" style="margin-top: 10px;">Blocks</label>
            <div class="slots">
              <div v-for="(b, idx) in schoolForm.blocks" :key="idx" class="slot-row">
                <select class="select" v-model="b.dayOfWeek">
                  <option v-for="d in dayNames" :key="d" :value="d">{{ d }}</option>
                </select>
                <select class="select" v-model="b.blockType">
                  <option value="AFTER_SCHOOL">After school (14:30–17:00)</option>
                  <option value="WEEKEND">Weekend (11:30–15:30)</option>
                  <option value="CUSTOM">Custom</option>
                </select>
                <template v-if="b.blockType === 'CUSTOM'">
                  <input class="input" v-model="b.startTime" placeholder="HH:MM" />
                  <input class="input" v-model="b.endTime" placeholder="HH:MM" />
                </template>
                <button class="btn btn-secondary btn-sm" @click="removeSchoolBlock(idx)">Remove</button>
              </div>
              <button class="btn btn-secondary btn-sm" @click="addSchoolBlock">Add block</button>
            </div>

            <label class="lbl" style="margin-top: 10px;">Notes (optional)</label>
            <textarea class="textarea" v-model="schoolForm.notes" rows="3" placeholder="Any constraints or preferences…" />

            <div class="actions">
              <button class="btn btn-primary" @click="submitSchool" :disabled="saving">Submit school availability</button>
            </div>
          </div>
        </div>

        <!-- Supervised biweekly confirmation -->
        <div class="card" v-if="pending.supervised?.isSupervised">
          <div class="card-head">
            <div>
              <div class="title">Supervised 2‑week availability confirmation</div>
              <div class="muted">
                Week requirement: {{ pending.supervised.rules.perWeekMinimum.optionA }} or {{ pending.supervised.rules.perWeekMinimum.optionB }}.
              </div>
            </div>
          </div>

          <div v-if="pending.supervised.confirmedAt" class="notice">
            Confirmed for this cycle at {{ new Date(pending.supervised.confirmedAt).toLocaleString() }}.
          </div>

          <div class="form">
            <div class="week-grid">
              <div v-for="wk in pending.supervised.weekStartDates" :key="wk" class="week">
                <div class="week-title">Week starting {{ wk }}</div>
                <div class="checks">
                  <div class="check-group">
                    <div class="lbl-sm">After school (Mon–Fri)</div>
                    <label v-for="d in ['Monday','Tuesday','Wednesday','Thursday','Friday']" :key="`${wk}-${d}-AS`" class="chk">
                      <input type="checkbox" :checked="isSelected(wk, d, 'AFTER_SCHOOL')" @change="toggle(wk, d, 'AFTER_SCHOOL')" />
                      <span>{{ d }}</span>
                    </label>
                  </div>
                  <div class="check-group">
                    <div class="lbl-sm">Weekend (Sat/Sun)</div>
                    <label v-for="d in ['Saturday','Sunday']" :key="`${wk}-${d}-WE`" class="chk">
                      <input type="checkbox" :checked="isSelected(wk, d, 'WEEKEND')" @change="toggle(wk, d, 'WEEKEND')" />
                      <span>{{ d }}</span>
                    </label>
                  </div>
                </div>
                <div class="muted" style="margin-top: 6px;">
                  Selected: {{ weekCount(wk) }} (weekend: {{ weekHasWeekend(wk) ? 'yes' : 'no' }})
                </div>
              </div>
            </div>

            <div v-if="supervisedValidationError" class="error-box" style="margin-top: 10px;">{{ supervisedValidationError }}</div>

            <div class="actions">
              <button class="btn btn-primary" @click="submitSupervised" :disabled="saving">Confirm 2‑week availability</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="pending.officeRequests.length || pending.schoolRequests.length" class="muted" style="margin-top: 10px;">
        You can refresh after staff has processed your request.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');

const pending = reactive({
  officeRequests: [],
  schoolRequests: [],
  supervised: null
});

const offices = ref([]);
const schools = ref([]);

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];

const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7..21
const hoursEnd = Array.from({ length: 16 }, (_, i) => i + 8); // 8..23
const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const officeForm = reactive({
  preferredOfficeIds: [],
  slots: [{ weekday: 1, startHour: 14, endHour: 17 }],
  notes: ''
});

const schoolForm = reactive({
  preferredSchoolOrgIds: [],
  blocks: [{ dayOfWeek: 'Monday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '' }],
  notes: ''
});

const addOfficeSlot = () => {
  officeForm.slots.push({ weekday: 1, startHour: 14, endHour: 17 });
};
const removeOfficeSlot = (idx) => {
  officeForm.slots.splice(idx, 1);
};

const addSchoolBlock = () => {
  schoolForm.blocks.push({ dayOfWeek: 'Monday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '' });
};
const removeSchoolBlock = (idx) => {
  schoolForm.blocks.splice(idx, 1);
};

const selection = ref(new Set()); // key = `${weekStart}|${day}|${type}`
const keyFor = (wk, day, type) => `${wk}|${day}|${type}`;
const isSelected = (wk, day, type) => selection.value.has(keyFor(wk, day, type));
const toggle = (wk, day, type) => {
  const k = keyFor(wk, day, type);
  if (selection.value.has(k)) selection.value.delete(k);
  else selection.value.add(k);
  // force reactivity for Set
  selection.value = new Set(selection.value);
};

const weekBlocks = (wk) => Array.from(selection.value).filter((k) => k.startsWith(`${wk}|`));
const weekCount = (wk) => weekBlocks(wk).length;
const weekHasWeekend = (wk) => weekBlocks(wk).some((k) => k.includes('|Saturday|') || k.includes('|Sunday|'));

const supervisedValidationError = computed(() => {
  if (!pending.supervised?.isSupervised) return '';
  for (const wk of pending.supervised.weekStartDates || []) {
    const c = weekCount(wk);
    const hasWknd = weekHasWeekend(wk);
    const ok = c >= 4 || (c >= 3 && hasWknd);
    if (!ok) return `Week starting ${wk} must have either 3 blocks including a weekend day, or 4 blocks.`;
  }
  return '';
});

const refresh = async () => {
  try {
    loading.value = true;
    error.value = '';

    const [pendingResp, officesResp, schoolsResp] = await Promise.all([
      api.get('/availability/me/pending', { params: { agencyId: props.agencyId } }),
      api.get('/offices'),
      api.get(`/agencies/${props.agencyId}/affiliated-organizations`)
    ]);

    pending.officeRequests = pendingResp.data?.officeRequests || [];
    pending.schoolRequests = pendingResp.data?.schoolRequests || [];
    pending.supervised = pendingResp.data?.supervised || null;

    offices.value = officesResp.data || [];
    schools.value = (schoolsResp.data || []).filter((o) => String(o.organization_type || 'agency').toLowerCase() !== 'agency');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load availability';
  } finally {
    loading.value = false;
  }
};

const submitOffice = async () => {
  try {
    saving.value = true;
    error.value = '';
    await api.post('/availability/office-requests', {
      agencyId: props.agencyId,
      preferredOfficeIds: officeForm.preferredOfficeIds.map((x) => Number(x)),
      notes: officeForm.notes,
      slots: officeForm.slots
    });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit office availability';
  } finally {
    saving.value = false;
  }
};

const submitSchool = async () => {
  try {
    saving.value = true;
    error.value = '';
    await api.post('/availability/school-requests', {
      agencyId: props.agencyId,
      preferredSchoolOrgIds: schoolForm.preferredSchoolOrgIds.map((x) => Number(x)),
      notes: schoolForm.notes,
      blocks: schoolForm.blocks
    });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit school availability';
  } finally {
    saving.value = false;
  }
};

const submitSupervised = async () => {
  try {
    if (supervisedValidationError.value) {
      error.value = supervisedValidationError.value;
      return;
    }
    saving.value = true;
    error.value = '';
    const blocks = Array.from(selection.value).map((k) => {
      const [weekStartDate, dayOfWeek, blockType] = k.split('|');
      return { weekStartDate, dayOfWeek, blockType };
    });
    await api.post('/availability/me/supervised/confirm', { agencyId: props.agencyId, blocks });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to confirm supervised availability';
  } finally {
    saving.value = false;
  }
};

onMounted(refresh);
</script>

<style scoped>
.avail-wrap { width: 100%; }
.hint { color: var(--text-secondary); }
.grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 12px; }
@media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; } .grid .card:nth-child(3) { grid-column: 1 / -1; } }
.card { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: white; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.title { font-weight: 900; }
.muted { color: var(--text-secondary); font-size: 13px; }
.lbl { display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin: 6px 0; }
.lbl-sm { font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px; }
.select, .input, .textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-primary); }
.textarea { resize: vertical; }
.slots { display: flex; flex-direction: column; gap: 8px; }
.slot-row { display: grid; grid-template-columns: 1.1fr 1fr 1fr auto; gap: 8px; align-items: center; }
.actions { display: flex; justify-content: flex-end; margin-top: 10px; }
.btn-sm { padding: 8px 10px; font-size: 13px; }
.notice { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-top: 10px; color: var(--text-secondary); }
.error-box { background: #fee; border: 1px solid #fcc; padding: 10px 12px; border-radius: 8px; margin-top: 10px; }
.week-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 900px) { .week-grid { grid-template-columns: 1fr 1fr; } }
.week { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--bg-alt); }
.week-title { font-weight: 900; }
.checks { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 8px; }
@media (min-width: 900px) { .checks { grid-template-columns: 1fr 1fr; } }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--text-primary); margin: 4px 0; }
</style>

