<template>
  <div class="page">
    <div class="page-header">
      <h1>Availability Intake</h1>
      <p class="page-description">Review provider availability submissions and search by office/school/skills.</p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'office' }" @click="tab = 'office'">Office Requests</button>
        <button class="tab" :class="{ active: tab === 'school' }" @click="tab = 'school'">School Requests</button>
        <button class="tab" :class="{ active: tab === 'appointments' }" @click="tab = 'appointments'">Appointments</button>
        <button class="tab" :class="{ active: tab === 'search' }" @click="tab = 'search'">Search</button>
        <button class="tab" :class="{ active: tab === 'skills' }" @click="tab = 'skills'">Skills</button>
        <button class="btn btn-secondary btn-sm" style="margin-left:auto;" @click="reload" :disabled="loading">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else>
        <!-- Office requests -->
        <div v-if="tab === 'office'">
          <div v-if="officeRequests.length === 0" class="muted">No pending office availability requests.</div>
          <div v-else class="list">
            <div v-for="r in officeRequests" :key="r.id" class="row">
              <div class="main">
                <div class="title">{{ r.providerName }}</div>
                <div class="meta">
                  Preferred offices:
                  <span v-if="!(Array.isArray(r.preferredOfficeIds) && r.preferredOfficeIds.length)">Any</span>
                  <span v-else>{{ (Array.isArray(r.preferredOfficeIds) ? r.preferredOfficeIds : []).map((id) => officeName(id)).join(', ') }}</span>
                </div>
                <div class="meta" v-if="r.notes">Notes: {{ r.notes }}</div>
                <div class="meta">
                  Windows:
                  <span v-for="(s, idx) in r.slots" :key="idx" class="pill">
                    {{ weekdayLabel(s.weekday) }} {{ hourLabel(s.startHour) }}–{{ hourLabel(s.endHour) }}
                  </span>
                </div>
              </div>

              <div class="assign">
                <div class="lbl">Requested (approve as-is)</div>
                <div class="assign-readonly">
                  <div class="assign-row"><span class="assign-label">Office:</span> {{ officeAssignDisplay(r).office }}</div>
                  <div class="assign-row"><span class="assign-label">Room:</span> {{ officeAssignDisplay(r).room }}</div>
                  <div class="assign-row"><span class="assign-label">Time:</span> {{ officeAssignDisplay(r).time }}</div>
                </div>
                <div v-if="officeAssignIncomplete(r)" class="assign-hint muted">Provider must specify office, room, and time when requesting. Deny and ask for resubmission.</div>
                <div class="row-inline" style="gap: 8px; margin-top: 6px;">
                  <button class="btn btn-primary btn-sm" @click="assignOffice(r)" :disabled="saving || officeAssignIncomplete(r)">Approve</button>
                  <button class="btn btn-secondary btn-sm" @click="denyOffice(r)" :disabled="saving">Deny</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- School requests -->
        <div v-else-if="tab === 'school'">
          <div v-if="schoolRequests.length === 0" class="muted">No pending school availability requests.</div>
          <div v-else class="list">
            <div v-for="r in schoolRequests" :key="r.id" class="row">
              <div class="main">
                <div class="title">{{ r.providerName }}</div>
                <div class="meta" v-if="r.notes">Notes: {{ r.notes }}</div>
                <div class="meta">
                  Daytime blocks:
                  <span v-for="(b, idx) in r.blocks" :key="idx" class="pill">
                    {{ b.dayOfWeek }} {{ b.startTime }}–{{ b.endTime }}
                  </span>
                </div>
              </div>

              <div class="assign">
                <div class="lbl">Assign to school</div>
                <select class="select" v-model="schoolAssign[r.id].schoolOrgId">
                  <option value="">School…</option>
                  <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
                </select>
                <select class="select" v-model="schoolAssign[r.id].blockKey">
                  <option value="">Use block…</option>
                  <option v-for="opt in r.blocks" :key="blockKey(opt)" :value="blockKey(opt)">
                    {{ opt.dayOfWeek }} {{ opt.startTime }}–{{ opt.endTime }}
                  </option>
                </select>
                <input class="input" type="number" min="0" v-model.number="schoolAssign[r.id].slotsTotal" />
                <button class="btn btn-primary btn-sm" @click="assignSchool(r)" :disabled="saving">Assign</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Public appointment requests -->
        <div v-else-if="tab === 'appointments'">
          <div class="card-inner" style="margin-bottom: 10px;">
            <div class="title">Public Find Provider Link</div>
            <div class="muted" style="margin-top: 4px;">
              Share this external URL with clients for agency-level provider intake/current-client booking.
            </div>
            <div v-if="publicLinkInfo.providerFinderUrl" class="row-inline" style="margin-top: 10px;">
              <input class="input" :value="publicLinkInfo.providerFinderUrl" readonly @click="$event.target.select()" />
              <button class="btn btn-secondary btn-sm" type="button" @click="copyPublicFinderLink">Copy</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="rotatePublicFinderKey" :disabled="saving">
                Rotate key
              </button>
            </div>
            <div class="meta" style="margin-top: 8px;">
              Public availability enabled:
              <strong>{{ publicLinkInfo.publicAvailabilityEnabled ? 'Yes' : 'No' }}</strong>
            </div>
            <div class="muted" style="margin-top: 6px;">
              Managed in Agency Settings -> Features -> "Enable Public Provider Finder (agency-paid)".
            </div>
          </div>

          <div v-if="publicRequests.length === 0" class="muted">No pending appointment requests.</div>
          <div v-else class="list">
            <div v-for="r in publicRequests" :key="r.id" class="row">
              <div class="main">
                <div class="title">{{ r.providerName }} <span class="pill">{{ r.modality }}</span></div>
                <div class="meta" v-if="r.bookingMode || r.programType">
                  Mode: {{ r.bookingMode || '—' }} • Program: {{ r.programType || '—' }}
                </div>
                <div class="meta">Requested: {{ fmtDateTime(r.requestedStartAt) }} – {{ fmtDateTime(r.requestedEndAt) }}</div>
                <div class="meta">Client: {{ r.clientName }} ({{ r.clientEmail }})</div>
                <div class="meta" v-if="r.clientInitials">Initials: {{ r.clientInitials }}</div>
                <div class="meta" v-if="r.clientPhone">Phone: {{ r.clientPhone }}</div>
                <div class="meta" v-if="r.matchedClientId || r.createdClientId">
                  Client link:
                  <span v-if="r.matchedClientId">matched #{{ r.matchedClientId }}</span>
                  <span v-if="r.createdClientId" style="margin-left: 8px;">created #{{ r.createdClientId }}</span>
                </div>
                <div class="meta" v-if="r.notes">Notes: {{ r.notes }}</div>
                <div class="meta">Submitted: {{ fmtDateTime(r.createdAt) }}</div>
              </div>
              <div class="assign">
                <div class="lbl">Decision</div>
                <div class="row-inline">
                  <button class="btn btn-primary btn-sm" @click="setPublicStatus(r, 'APPROVED')" :disabled="saving">Approve</button>
                  <button class="btn btn-secondary btn-sm" @click="setPublicStatus(r, 'DECLINED')" :disabled="saving">Decline</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Search -->
        <div v-else-if="tab === 'search'">
          <div class="search">
            <div class="field">
              <label>Office</label>
              <select class="select" v-model="search.officeId">
                <option value="">Any</option>
                <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>School</label>
              <select class="select" v-model="search.schoolOrgId">
                <option value="">Any</option>
                <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>Week start</label>
              <input class="input" type="date" v-model="search.weekStart" />
            </div>
            <div class="field">
              <label>Skills (any)</label>
              <select class="select" multiple v-model="search.skillIds">
                <option v-for="sk in activeSkills" :key="sk.id" :value="String(sk.id)">{{ sk.skill_label }}</option>
              </select>
            </div>
            <div class="field actions">
              <button class="btn btn-primary" @click="runSearch" :disabled="saving">Search</button>
            </div>
          </div>

          <div v-if="searchResult" class="search-results">
            <h3>Results</h3>
            <div class="muted">
              Office Requests: {{ searchResult.officeRequests.length }} •
              School Requests: {{ searchResult.schoolRequests.length }} •
              Skill Builder: {{ searchResult.skillBuilderAvailability.length }}
            </div>

            <div class="subhead">Office requests</div>
            <div v-if="searchResult.officeRequests.length === 0" class="muted">None</div>
            <ul v-else class="simple-list">
              <li v-for="x in searchResult.officeRequests" :key="x.id">{{ x.providerName }} — {{ x.notes || 'No notes' }}</li>
            </ul>

            <div class="subhead">School requests</div>
            <div v-if="searchResult.schoolRequests.length === 0" class="muted">None</div>
            <ul v-else class="simple-list">
              <li v-for="x in searchResult.schoolRequests" :key="x.id">{{ x.providerName }} — {{ x.notes || 'No notes' }}</li>
            </ul>

            <div class="subhead">Skill Builder availability confirmations ({{ searchResult.filters.weekStart }})</div>
            <div v-if="searchResult.skillBuilderAvailability.length === 0" class="muted">None</div>
            <div v-else class="list">
              <div v-for="p in searchResult.skillBuilderAvailability" :key="p.providerId" class="row">
                <div class="main">
                  <div class="title">{{ p.providerName }}</div>
                  <div class="meta">Confirmed: {{ new Date(p.confirmedAt).toLocaleString() }}</div>
                  <div class="meta">
                    <span v-for="(b, idx) in p.blocks" :key="idx" class="pill">
                      {{ b.dayOfWeek }} {{ b.startTime }}–{{ b.endTime }} ({{ b.blockType }}) <span v-if="b.departFrom">• {{ b.departFrom }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="subhead" v-if="searchResult.inOfficeAvailability && searchResult.inOfficeAvailability.length">
              Provider in-office availability (grid)
            </div>
            <ul v-if="searchResult.inOfficeAvailability && searchResult.inOfficeAvailability.length" class="simple-list">
              <li v-for="(x, idx) in searchResult.inOfficeAvailability" :key="idx">
                {{ x.last_name }}, {{ x.first_name }} — {{ weekdayLabel(x.weekday) }} {{ hourLabel(x.hour) }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Skills -->
        <div v-else-if="tab === 'skills'">
          <div class="skills-grid">
            <div class="card-inner">
              <div class="title">Skill tags</div>
              <div class="muted">Per-agency picklist used for staffing searches.</div>
              <div class="row-inline" style="margin-top: 10px;">
                <input class="input" v-model="newSkillLabel" placeholder="New skill label…" />
                <button class="btn btn-primary btn-sm" @click="addSkill" :disabled="saving">Add</button>
              </div>
              <div class="simple-list" style="margin-top: 10px;">
                <div v-for="sk in skills" :key="sk.id" class="skill-row">
                  <div>
                    <strong>{{ sk.skill_label }}</strong>
                    <span class="muted"> ({{ sk.skill_key }})</span>
                    <span v-if="!sk.is_active" class="muted"> — inactive</span>
                  </div>
                  <button v-if="sk.is_active" class="btn btn-secondary btn-sm" @click="deactivateSkill(sk)" :disabled="saving">Deactivate</button>
                </div>
              </div>
            </div>

            <div class="card-inner">
              <div class="title">Assign skills to provider</div>
              <div class="muted">Used by the availability search filter.</div>
              <div class="form" style="margin-top: 10px;">
                <label class="lbl">Provider</label>
                <select class="select" v-model="skillAssign.providerId">
                  <option value="">Select…</option>
                  <option v-for="p in providers" :key="p.id" :value="String(p.id)">{{ p.last_name }}, {{ p.first_name }}</option>
                </select>
                <label class="lbl" style="margin-top: 10px;">Skills</label>
                <select class="select" multiple v-model="skillAssign.skillIds">
                  <option v-for="sk in activeSkills" :key="sk.id" :value="String(sk.id)">{{ sk.skill_label }}</option>
                </select>
                <div class="actions">
                  <button class="btn btn-primary" @click="saveProviderSkills" :disabled="saving || !skillAssign.providerId">Save</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const tab = ref('office'); // office | school | search | skills
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const offices = ref([]);
const schools = ref([]);
const officeRequests = ref([]);
const schoolRequests = ref([]);
const publicRequests = ref([]);
const publicLinkInfo = reactive({
  providerFinderUrl: '',
  publicAvailabilityEnabled: false
});
const skills = ref([]);
const providers = ref([]);

const roomsByOffice = reactive({}); // officeId -> rooms[]
const officeAssign = reactive({}); // requestId -> { officeId, roomId, slotKey }
const schoolAssign = reactive({}); // requestId -> { schoolOrgId, blockKey, slotsTotal }

const newSkillLabel = ref('');
const skillAssign = reactive({ providerId: '', skillIds: [] });

const activeSkills = computed(() => (skills.value || []).filter((s) => s.is_active));

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];
const weekdayLabel = (n) => weekdays.find((d) => d.value === Number(n))?.label || String(n);
const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const fmtDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
};

const officeName = (id) => offices.value.find((o) => Number(o.id) === Number(id))?.name || `#${id}`;
const schoolName = (id) => schools.value.find((s) => Number(s.id) === Number(id))?.name || `#${id}`;

const roomName = (officeId, roomId) => {
  const rooms = roomsByOffice[officeId] || [];
  const rm = rooms.find((x) => Number(x.id) === Number(roomId));
  const num = rm?.roomNumber ?? rm?.room_number ?? '';
  return rm ? `${num ? `#${num} ` : ''}${rm.label || rm.name || ''}`.trim() || `#${roomId}` : `#${roomId}`;
};

const expandOfficeSlots = (r) => {
  const out = [];
  const slots = Array.isArray(r?.slots) ? r.slots : [];
  for (const s of slots) {
    const start = Number(s.startHour);
    const end = Number(s.endHour);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const key = `${s.weekday}:${start}:${end}`;
    out.push({
      key,
      weekday: Number(s.weekday),
      startHour: start,
      endHour: end,
      label: `${weekdayLabel(s.weekday)} ${hourLabel(start)}–${hourLabel(end)}`
    });
  }
  return out;
};

const officeAssignDisplay = (r) => {
  const form = officeAssign[r.id] || {};
  const officeId = form.officeId;
  const roomId = form.roomId;
  const slotKey = form.slotKey || '';
  const opt = expandOfficeSlots(r).find((o) => o.key === slotKey);
  return {
    office: officeId ? officeName(officeId) : 'Not specified',
    room: roomId ? roomName(officeId, roomId) : 'Not specified',
    time: opt ? opt.label : (slotKey ? slotKey : 'Not specified')
  };
};

const officeAssignIncomplete = (r) => {
  const form = officeAssign[r.id] || {};
  return !form.officeId || !form.roomId || !form.slotKey;
};

const blockKey = (b) => `${b.dayOfWeek}|${b.startTime}|${b.endTime}`;

const defaultWeekStart = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};

const search = reactive({
  officeId: '',
  schoolOrgId: '',
  weekStart: defaultWeekStart(),
  skillIds: []
});
const searchResult = ref(null);

const loadRoomsForOffice = async (requestId) => {
  const officeId = officeAssign[requestId]?.officeId;
  if (!officeId) return;
  if (roomsByOffice[officeId]) return;
  try {
    const resp = await api.get(`/offices/${officeId}/rooms`);
    roomsByOffice[officeId] = resp.data || [];
  } catch {
    roomsByOffice[officeId] = [];
  }
};

const reload = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    searchResult.value = null;

    const [officesResp, schoolsResp, officeReqResp, schoolReqResp, publicReqResp, skillsResp, providersResp, publicLinkResp] = await Promise.all([
      api.get('/offices'),
      api.get(`/agencies/${agencyId.value}/affiliated-organizations`),
      api.get('/availability/admin/office-requests', { params: { agencyId: agencyId.value, status: 'PENDING' } }),
      api.get('/availability/admin/school-requests', { params: { agencyId: agencyId.value, status: 'PENDING' } }),
      api.get('/availability/admin/public-appointment-requests', { params: { agencyId: agencyId.value } }).catch(() => ({ data: { requests: [] } })),
      api.get('/availability/admin/skills', { params: { agencyId: agencyId.value } }),
      api.get('/availability/admin/providers', { params: { agencyId: agencyId.value } }),
      api.get('/availability/admin/public-provider-link', { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} }))
    ]);

    offices.value = officesResp.data || [];
    schools.value = (schoolsResp.data || []).filter((o) => String(o.organization_type || 'agency').toLowerCase() !== 'agency');
    officeRequests.value = officeReqResp.data || [];
    schoolRequests.value = schoolReqResp.data || [];
    publicRequests.value = publicReqResp.data?.requests || [];
    publicLinkInfo.providerFinderUrl = String(publicLinkResp.data?.providerFinderUrl || '');
    publicLinkInfo.publicAvailabilityEnabled = !!publicLinkResp.data?.publicAvailabilityEnabled;
    skills.value = skillsResp.data || [];
    providers.value = providersResp.data || [];

    // Init assignment form state, pre-fill from request when provider selected building/room/time
    const officeIdsAvailable = (offices.value || []).map((o) => String(o.id));
    for (const r of officeRequests.value) {
      const prefOffices = Array.isArray(r.preferredOfficeIds) ? r.preferredOfficeIds : [];
      const slots = r.slots || [];
      const firstSlot = slots[0];
      let officeId = firstSlot?.officeLocationId
        ? String(firstSlot.officeLocationId)
        : (prefOffices.length > 0 ? String(prefOffices[0]) : '');
      // Ensure chosen office exists in available list; fallback to first preferred that is
      if (officeId && !officeIdsAvailable.includes(officeId)) {
        officeId = (prefOffices || []).map((id) => String(id)).find((id) => officeIdsAvailable.includes(id)) || '';
      }
      let roomId = firstSlot?.roomId ? String(firstSlot.roomId) : '';
      const slotKey = firstSlot != null && Number.isFinite(firstSlot.weekday) && Number.isFinite(firstSlot.startHour) && Number.isFinite(firstSlot.endHour) && firstSlot.endHour > firstSlot.startHour
        ? `${firstSlot.weekday}:${firstSlot.startHour}:${firstSlot.endHour}`
        : '';
      // Do NOT default office or room when provider chose "Any" – approval is read-only; provider must specify
      officeAssign[r.id] = { officeId, roomId, slotKey };
      if (officeId) {
        await loadRoomsForOffice(r.id);
        // Do not default roomId to first room when provider chose "Any" – require approver selection
      }
    }
    for (const r of schoolRequests.value) {
      if (!schoolAssign[r.id]) schoolAssign[r.id] = { schoolOrgId: '', blockKey: '', slotsTotal: 1 };
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load availability intake';
  } finally {
    loading.value = false;
  }
};

const copyPublicFinderLink = async () => {
  const url = String(publicLinkInfo.providerFinderUrl || '').trim();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }
};

const rotatePublicFinderKey = async () => {
  if (!agencyId.value) return;
  try {
    saving.value = true;
    error.value = '';
    const resp = await api.post('/availability/admin/public-provider-link/rotate-key', { agencyId: agencyId.value });
    publicLinkInfo.providerFinderUrl = String(resp.data?.providerFinderUrl || '');
    publicLinkInfo.publicAvailabilityEnabled = !!resp.data?.publicAvailabilityEnabled;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to rotate public provider finder key';
  } finally {
    saving.value = false;
  }
};

const setPublicStatus = async (r, status) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/availability/admin/public-appointment-requests/${r.id}/status`, {
      agencyId: agencyId.value,
      status
    });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update appointment request';
  } finally {
    saving.value = false;
  }
};

const assignOffice = async (r) => {
  const form = officeAssign[r.id];
  if (!form?.officeId || !form?.roomId || !form?.slotKey) {
    error.value = 'Office, room, and day/time are required.';
    return;
  }
  const requestedFrequency = String(r?.requestedFrequency || 'ONCE').toUpperCase();
  const requestedOccurrenceCount = Math.max(1, Number(r?.requestedOccurrenceCount || 1));
  let assignedFrequency = 'WEEKLY';
  let weeks = 6;
  if (requestedFrequency === 'ONCE') {
    assignedFrequency = 'WEEKLY';
    weeks = 1;
  } else if (requestedFrequency === 'WEEKLY') {
    assignedFrequency = 'WEEKLY';
    weeks = Math.min(6, requestedOccurrenceCount);
  } else if (requestedFrequency === 'BIWEEKLY') {
    assignedFrequency = 'BIWEEKLY';
    weeks = Math.max(1, requestedOccurrenceCount) * 2;
  } else if (requestedFrequency === 'MONTHLY') {
    assignedFrequency = 'WEEKLY';
    weeks = Math.max(1, requestedOccurrenceCount) * 4;
  }
  const parts = String(form.slotKey).split(':').map((x) => Number(x));
  const weekday = parts[0];
  const hour = parts[1];
  const endHour = parts.length >= 3 && Number.isFinite(parts[2]) && parts[2] > hour ? parts[2] : hour + 1;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/availability/admin/office-requests/${r.id}/assign-temporary`, {
      agencyId: agencyId.value,
      officeId: Number(form.officeId),
      roomId: Number(form.roomId),
      weekday,
      hour,
      endHour,
      weeks,
      assignedFrequency,
      requestedFrequency,
      requestedOccurrenceCount
    });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign office temporary slot';
  } finally {
    saving.value = false;
  }
};

const denyOffice = async (r) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/availability/admin/office-requests/${r.id}/deny`, {
      agencyId: agencyId.value
    });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deny request';
  } finally {
    saving.value = false;
  }
};

const assignSchool = async (r) => {
  const form = schoolAssign[r.id];
  if (!form?.schoolOrgId || !form?.blockKey) {
    error.value = 'School and block are required.';
    return;
  }
  const [dayOfWeek, startTime, endTime] = String(form.blockKey).split('|');
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/availability/admin/school-requests/${r.id}/assign`, {
      agencyId: agencyId.value,
      schoolOrganizationId: Number(form.schoolOrgId),
      dayOfWeek,
      startTime,
      endTime,
      slotsTotal: Number(form.slotsTotal || 1)
    });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign school availability';
  } finally {
    saving.value = false;
  }
};

const runSearch = async () => {
  try {
    saving.value = true;
    error.value = '';
    const resp = await api.get('/availability/admin/search', {
      params: {
        agencyId: agencyId.value,
        officeId: search.officeId || undefined,
        schoolOrgId: search.schoolOrgId || undefined,
        weekStart: search.weekStart || undefined,
        skillIds: (search.skillIds || []).join(',')
      }
    });
    searchResult.value = resp.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Search failed';
  } finally {
    saving.value = false;
  }
};

const addSkill = async () => {
  const label = String(newSkillLabel.value || '').trim();
  if (!label) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post('/availability/admin/skills', { agencyId: agencyId.value, skillLabel: label });
    newSkillLabel.value = '';
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add skill';
  } finally {
    saving.value = false;
  }
};

const deactivateSkill = async (sk) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/availability/admin/skills/${sk.id}/deactivate`, { agencyId: agencyId.value });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deactivate skill';
  } finally {
    saving.value = false;
  }
};

const saveProviderSkills = async () => {
  if (!skillAssign.providerId) return;
  try {
    saving.value = true;
    error.value = '';
    await api.put(`/availability/admin/providers/${skillAssign.providerId}/skills`, {
      agencyId: agencyId.value,
      skillIds: (skillAssign.skillIds || []).map((x) => Number(x))
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save provider skills';
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  await reload();
});

watch(agencyId, async () => {
  await reload();
});
</script>

<style scoped>
.page { width: 100%; }
.page-header h1 { margin: 0; }
.page-description { margin: 8px 0 0; color: var(--text-secondary); }
.panel { margin-top: 16px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.tabs { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.tab { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); font-weight: 800; }
.tab.active { border-color: var(--accent); background: white; }
.btn-sm { padding: 8px 10px; font-size: 13px; }
.loading { color: var(--text-secondary); }
.error { color: #b00020; }
.muted { color: var(--text-secondary); }
.list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.row { border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 1fr; gap: 12px; background: white; }
@media (min-width: 1100px) { .row { grid-template-columns: 1.6fr 1fr; } }
.title { font-weight: 900; }
.meta { color: var(--text-secondary); font-size: 12px; margin-top: 6px; }
.pill { display: inline-block; margin: 4px 6px 0 0; padding: 4px 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-alt); }
.assign { display: flex; flex-direction: column; gap: 8px; }
.assign-readonly { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt); }
.assign-row { font-size: 14px; margin-bottom: 4px; }
.assign-row:last-child { margin-bottom: 0; }
.assign-label { font-weight: 600; color: var(--text-secondary); margin-right: 6px; }
.assign-hint { font-size: 12px; margin-top: 4px; }
.lbl { font-size: 12px; font-weight: 900; color: var(--text-secondary); }
.select, .input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-primary); }
.search { display: grid; grid-template-columns: repeat(4, minmax(200px, 1fr)) auto; gap: 10px; align-items: end; }
@media (max-width: 1100px) { .search { grid-template-columns: 1fr; } }
.field label { display: block; font-size: 12px; font-weight: 900; color: var(--text-secondary); margin-bottom: 6px; }
.actions { display: flex; justify-content: flex-end; }
.search-results { margin-top: 14px; }
.subhead { font-weight: 900; margin-top: 12px; }
.simple-list { margin: 8px 0 0; padding-left: 18px; color: var(--text-secondary); }
.skills-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 1100px) { .skills-grid { grid-template-columns: 1fr 1fr; } }
.card-inner { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: white; }
.row-inline { display: flex; gap: 8px; align-items: center; }
.skill-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.skill-row:last-child { border-bottom: none; }
</style>

