<template>
  <div class="avail-wrap">
    <div class="hint">
      Submit additional availability for office or school. Skill Builders availability is confirmed biweekly (current + next week) so you can keep a consistent set of time/day blocks.
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="muted" style="margin-top: 10px;">Loading…</div>

    <div v-else>
      <div class="grid">
        <!-- Additional office availability request (office slots inside a building) -->
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Additional office availability request</div>
              <div class="muted">For providers who are open to being assigned a temporary office slot inside a building.</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="refresh" :disabled="saving">Refresh</button>
          </div>

          <div v-if="pending.officeRequests.length" class="notice">
            <div class="notice-head">You have a pending office availability request. Staff will review it soon.</div>
            <div class="notice-summary">
              <div class="summary-row">
                <span class="lbl-sm">Preferred buildings:</span>
                {{ (firstOfficeRequest.preferredOfficeIds?.length ? officeNamesFor(firstOfficeRequest.preferredOfficeIds).join(', ') : 'Any') }}
              </div>
              <div class="summary-row">
                <span class="lbl-sm">Windows:</span>
                <span v-for="(s, idx) in (firstOfficeRequest.slots || [])" :key="idx" class="pill">{{ weekdayLabel(s.weekday) }} {{ hourLabel(s.startHour) }}–{{ hourLabel(s.endHour) }}</span>
              </div>
              <div v-if="firstOfficeRequest.notes" class="summary-row">
                <span class="lbl-sm">Notes:</span> {{ firstOfficeRequest.notes }}
              </div>
              <div class="summary-row muted" style="margin-top: 6px;">Submitted {{ formatDate(firstOfficeRequest.createdAt) }}</div>
            </div>
            <div class="notice-actions">
              <span class="hint-sm">Need to change or add something? Withdraw and submit a new request.</span>
              <button class="btn btn-secondary btn-sm" type="button" @click="withdrawRequests" :disabled="saving">
                {{ saving ? '…' : 'Withdraw request' }}
              </button>
            </div>
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
              <button class="btn btn-primary" @click="submitOffice" :disabled="saving">Submit office availability</button>
            </div>
          </div>
        </div>

        <!-- School daytime availability request -->
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">School daytime availability</div>
              <div class="muted">Share weekday daytime availability so staff can assign you to a school day (you will not select the school).</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="refresh" :disabled="saving">Refresh</button>
          </div>

          <div v-if="pending.schoolRequests.length" class="notice">
            <div class="notice-head">You have a pending school availability request. Staff will review it soon.</div>
            <div class="notice-summary">
              <div class="summary-row">
                <span class="lbl-sm">Daytime blocks:</span>
                <span v-for="(b, idx) in (firstSchoolRequest.blocks || [])" :key="idx" class="pill">{{ b.dayOfWeek }} {{ b.startTime }}–{{ b.endTime }}</span>
              </div>
              <div v-if="firstSchoolRequest.notes" class="summary-row">
                <span class="lbl-sm">Notes:</span> {{ firstSchoolRequest.notes }}
              </div>
              <div class="summary-row muted" style="margin-top: 6px;">Submitted {{ formatDate(firstSchoolRequest.createdAt) }}</div>
            </div>
            <div class="notice-actions">
              <span class="hint-sm">Need to change or add something? Withdraw and submit a new request.</span>
              <button class="btn btn-secondary btn-sm" type="button" @click="withdrawRequests" :disabled="saving">
                {{ saving ? '…' : 'Withdraw request' }}
              </button>
            </div>
          </div>

          <div v-else class="form">
            <label class="lbl">Weekday daytime blocks (06:00–18:00)</label>
            <div class="slots">
              <div v-for="(b, idx) in schoolForm.blocks" :key="idx" class="slot-row">
                <select class="select" v-model="b.dayOfWeek">
                  <option v-for="d in weekdayNames" :key="d" :value="d">{{ d }}</option>
                </select>
                <input class="input" v-model="b.startTime" placeholder="HH:MM" />
                <input class="input" v-model="b.endTime" placeholder="HH:MM" />
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

        <!-- Skill Builders weekly availability (eligible providers) -->
        <div class="card" v-if="pending.skillBuilder?.eligible">
          <div class="card-head">
            <div>
              <div class="title">Skill Builders availability (required)</div>
              <div class="muted">
                You must maintain at least <strong>6 hours/week of direct time</strong>, and confirm it <strong>every 2 weeks</strong> (current + next week).
              </div>
            </div>
          </div>

          <div class="notice" v-if="pending.cycle?.weekStartDates?.length">
            <div class="muted" style="margin-bottom: 6px;">
              Next two weeks:
              <strong>{{ pending.cycle.weekStartDates[0] }}</strong> and <strong>{{ pending.cycle.weekStartDates[1] }}</strong>
            </div>
            <div class="muted">
              Confirmation status:
              <span v-for="c in (pending.skillBuilder.confirmations || [])" :key="c.weekStartDate" class="pill-inline">
                {{ c.weekStartDate }} —
                <strong>{{ c.confirmedAt ? 'confirmed' : 'needs confirm' }}</strong>
              </span>
            </div>
          </div>

          <div class="form">
            <div class="muted" style="margin-bottom: 10px;">
              Current saved total: <strong>{{ pending.skillBuilder.totalHoursPerWeek }}</strong> hrs/week.
            </div>

            <label class="lbl">Availability blocks</label>
            <div class="slots">
              <div v-for="(b, idx) in skillBuilderForm.blocks" :key="idx" class="slot-row">
                <select class="select" v-model="b.dayOfWeek">
                  <option v-for="d in dayNames" :key="d" :value="d">{{ d }}</option>
                </select>
                <select class="select" v-model="b.blockType">
                  <option value="AFTER_SCHOOL">After school (usually 3:00–4:30, subject to change)</option>
                  <option value="WEEKEND">Weekend (12:00–3:00)</option>
                  <option value="CUSTOM">Custom</option>
                </select>
                <template v-if="b.blockType === 'CUSTOM'">
                  <input class="input" v-model="b.startTime" placeholder="HH:MM" />
                  <input class="input" v-model="b.endTime" placeholder="HH:MM" />
                </template>
                <input class="input" v-model="b.departFrom" placeholder="Departing from (required)" />
                <input class="input" v-model="b.departTime" type="time" placeholder="Depart time (optional)" />
                <label class="chk" style="display:flex; align-items:center; gap:6px; margin: 0 6px;">
                  <input type="checkbox" v-model="b.isBooked" />
                  <span class="muted" style="white-space:nowrap;">Already booked</span>
                </label>
                <button class="btn btn-secondary btn-sm" @click="removeSkillBuilderBlock(idx)">Remove</button>
              </div>
              <button class="btn btn-secondary btn-sm" @click="addSkillBuilderBlock">Add block</button>
            </div>

            <div v-if="skillBuilderValidationError" class="error-box" style="margin-top: 10px;">{{ skillBuilderValidationError }}</div>

            <div class="actions" style="gap: 8px;">
              <button class="btn btn-secondary" @click="confirmSkillBuilder" :disabled="saving || !!skillBuilderValidationError">
                Confirm next 2 weeks
              </button>
              <button class="btn btn-primary" @click="submitSkillBuilder" :disabled="saving || !!skillBuilderValidationError">
                Save / Submit availability
              </button>
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
  skillBuilder: null,
  cycle: null
});

const offices = ref([]);

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
const weekdayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7..21
const hoursEnd = Array.from({ length: 16 }, (_, i) => i + 8); // 8..23
const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};
const weekdayLabel = (wd) => (weekdays.find((d) => d.value === wd)?.label ?? `Day ${wd}`);
const formatDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const firstOfficeRequest = computed(() => (pending.officeRequests || [])[0] || null);
const firstSchoolRequest = computed(() => (pending.schoolRequests || [])[0] || null);
const officeNamesFor = (ids) => {
  if (!Array.isArray(ids) || !ids.length) return [];
  const list = offices.value || [];
  return ids.map((id) => list.find((o) => Number(o.id) === Number(id))?.name ?? `#${id}`).filter(Boolean);
};

const officeForm = reactive({
  preferredOfficeIds: [],
  slots: [{ weekday: 1, startHour: 14, endHour: 17 }],
  notes: ''
});

const schoolForm = reactive({
  blocks: [{ dayOfWeek: 'Monday', startTime: '08:00', endTime: '15:00' }],
  notes: ''
});

const addOfficeSlot = () => {
  officeForm.slots.push({ weekday: 1, startHour: 14, endHour: 17 });
};
const removeOfficeSlot = (idx) => {
  officeForm.slots.splice(idx, 1);
};

const addSchoolBlock = () => {
  schoolForm.blocks.push({ dayOfWeek: 'Monday', startTime: '08:00', endTime: '15:00' });
};
const removeSchoolBlock = (idx) => {
  schoolForm.blocks.splice(idx, 1);
};

const skillBuilderForm = reactive({
  blocks: [
    { dayOfWeek: 'Monday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false },
    { dayOfWeek: 'Wednesday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false },
    { dayOfWeek: 'Friday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false }
  ]
});

const addSkillBuilderBlock = () => {
  skillBuilderForm.blocks.push({ dayOfWeek: 'Monday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false });
};
const removeSkillBuilderBlock = (idx) => {
  skillBuilderForm.blocks.splice(idx, 1);
};

const minutesForSkillBlock = (b) => {
  const t = String(b?.blockType || '').toUpperCase();
  if (t === 'AFTER_SCHOOL') return 90;
  if (t === 'WEEKEND') return 180;
  const st = String(b?.startTime || '').trim();
  const et = String(b?.endTime || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(st) || !/^\d{1,2}:\d{2}$/.test(et)) return 0;
  const [sh, sm] = st.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = et.split(':').map((x) => parseInt(x, 10));
  if (!(sh >= 0 && sh <= 23 && sm >= 0 && sm <= 59)) return 0;
  if (!(eh >= 0 && eh <= 23 && em >= 0 && em <= 59)) return 0;
  const a = sh * 60 + sm;
  const c = eh * 60 + em;
  return c > a ? (c - a) : 0;
};

const skillBuilderValidationError = computed(() => {
  if (!pending.skillBuilder?.eligible) return '';
  const missingDepartFrom = (skillBuilderForm.blocks || []).some((b) => !String(b?.departFrom || '').trim());
  if (missingDepartFrom) return 'Skill Builders requires a “Departing from” value for every block.';
  const mins = (skillBuilderForm.blocks || []).reduce((sum, b) => sum + minutesForSkillBlock(b), 0);
  if (mins < 360) return 'Skill Builders requires at least 6 hours/week of direct time. Add more blocks.';
  return '';
});

const withdrawRequests = async () => {
  const hasOffice = (pending.officeRequests || []).length > 0;
  const hasSchool = (pending.schoolRequests || []).length > 0;
  const msg = hasOffice && hasSchool
    ? 'This will withdraw all your pending office and school availability requests. You can submit new ones after.'
    : hasOffice
      ? 'This will withdraw your pending office availability request. You can submit a new one after.'
      : 'This will withdraw your pending school availability request. You can submit a new one after.';
  if (!window.confirm(msg)) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post('/availability/me/requests/unrequest-all', { agencyId: props.agencyId });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to withdraw request';
  } finally {
    saving.value = false;
  }
};

const refresh = async () => {
  try {
    loading.value = true;
    error.value = '';

    const [pendingResp, officesResp] = await Promise.all([
      api.get('/availability/me/pending', { params: { agencyId: props.agencyId } }),
      api.get('/offices')
    ]);

    pending.officeRequests = pendingResp.data?.officeRequests || [];
    pending.schoolRequests = pendingResp.data?.schoolRequests || [];
    pending.skillBuilder = pendingResp.data?.skillBuilder || null;
    pending.cycle = pendingResp.data?.cycle || null;

    offices.value = officesResp.data || [];
    // Seed skill builder form from saved blocks (if any)
    if (pending.skillBuilder?.eligible) {
      const saved = Array.isArray(pending.skillBuilder.blocks) ? pending.skillBuilder.blocks : [];
      if (saved.length) {
        skillBuilderForm.blocks = saved.map((b) => ({
          dayOfWeek: b.dayOfWeek,
          blockType: b.blockType,
          startTime: b.startTime || '',
          endTime: b.endTime || '',
          departFrom: b.departFrom || '',
          departTime: b.departTime || '',
          isBooked: !!b.isBooked
        }));
      }
    }
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
      notes: schoolForm.notes,
      blocks: schoolForm.blocks.map((b) => ({ dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime }))
    });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit school availability';
  } finally {
    saving.value = false;
  }
};

const submitSkillBuilder = async () => {
  try {
    if (skillBuilderValidationError.value) {
      error.value = skillBuilderValidationError.value;
      return;
    }
    saving.value = true;
    error.value = '';
    await api.post('/availability/me/skill-builder/submit', {
      agencyId: props.agencyId,
      blocks: skillBuilderForm.blocks
    });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit Skill Builder availability';
  } finally {
    saving.value = false;
  }
};

const confirmSkillBuilder = async () => {
  try {
    if (skillBuilderValidationError.value) {
      error.value = skillBuilderValidationError.value;
      return;
    }
    saving.value = true;
    error.value = '';
    const weekStartDates = pending.cycle?.weekStartDates || null;
    await api.post('/availability/me/skill-builder/confirm', { agencyId: props.agencyId, weekStartDates });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to confirm Skill Builder availability';
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
.notice-head { font-weight: 600; margin-bottom: 8px; }
.notice-summary { display: flex; flex-direction: column; gap: 4px; }
.summary-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.summary-row .pill { display: inline-block; padding: 2px 8px; background: var(--bg); border-radius: 6px; font-size: 12px; margin-right: 4px; }
.notice-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
.hint-sm { font-size: 12px; color: var(--text-secondary); }
.pill-inline { display: inline-block; margin-left: 8px; }
.error-box { background: #fee; border: 1px solid #fcc; padding: 10px 12px; border-radius: 8px; margin-top: 10px; }
</style>

