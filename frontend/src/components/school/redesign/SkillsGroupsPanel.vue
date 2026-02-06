<template>
  <div class="skills-groups">
    <div class="header">
      <div>
        <h2 style="margin:0;">Skills Groups</h2>
        <div class="muted">Time-limited groups (6–12 weeks) with scheduled meetings.</div>
      </div>
      <div class="actions">
        <button v-if="canManage" class="btn btn-primary btn-sm" type="button" @click="startCreate">
          Add skills group
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="reload" :disabled="loading">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="grid">
      <div v-if="focusUnassigned" class="card unassigned-card">
        <div class="unassigned-head">
          <h3 style="margin:0;">Skills clients without group</h3>
          <span class="pill">{{ unassignedClients.length }}</span>
        </div>
        <div v-if="unassignedLoading" class="muted" style="padding: 10px;">Loading…</div>
        <div v-else-if="unassignedClients.length === 0" class="muted" style="padding: 10px;">All skills clients are assigned.</div>
        <div v-else class="unassigned-list">
          <div v-for="c in unassignedClients" :key="c.id" class="unassigned-row">
            {{ clientLabel(c) }}
          </div>
        </div>
      </div>
      <div class="list card">
        <div v-if="groups.length === 0" class="muted" style="padding: 10px;">No skills groups yet.</div>
        <button
          v-for="g in groups"
          :key="g.id"
          type="button"
          class="list-item"
          :class="{ active: selectedGroupId === g.id }"
          @click="select(g)"
        >
          <div class="title">{{ g.name }}</div>
          <div class="meta">
            {{ formatDate(g.start_date) }} → {{ formatDate(g.end_date) }}
            <span v-if="(g.meetings||[]).length"> · {{ meetingSummary(g) }}</span>
          </div>
          <div class="meta">
            Providers: {{ (g.providers || []).length }} · Clients: {{ (g.clients || []).length }}
          </div>
        </button>
      </div>

      <div class="detail card" v-if="selected">
        <div class="detail-header">
          <h3 style="margin:0;">{{ selected.name }}</h3>
          <div class="detail-actions" v-if="canManage">
            <button class="btn btn-secondary btn-sm" type="button" @click="startEdit(selected)">Edit</button>
            <button class="btn btn-danger btn-sm" type="button" @click="removeGroup(selected)">Delete</button>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <label>Date range</label>
            <div class="v">{{ formatDate(selected.start_date) }} → {{ formatDate(selected.end_date) }}</div>
          </div>
          <div class="info-item">
            <label>Meetings</label>
            <div class="v">
              <div v-if="(selected.meetings||[]).length === 0">—</div>
              <div v-else>
                <div v-for="(m, idx) in selected.meetings" :key="idx">
                  {{ m.weekday }} {{ timeLabel(m.start_time) }}–{{ timeLabel(m.end_time) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="split">
          <div>
            <h4>Assigned providers</h4>
            <div class="muted" v-if="(selected.providers||[]).length === 0">None.</div>
            <ul v-else class="simple">
              <li v-for="p in selected.providers" :key="p.provider_user_id">
                {{ p.last_name }}, {{ p.first_name }}
              </li>
            </ul>
          </div>
          <div>
            <h4>Assigned clients</h4>
            <div class="muted" v-if="(selected.clients||[]).length === 0">None.</div>
            <ul v-else class="simple">
              <li v-for="c in selected.clients" :key="c.client_id">
                <span :title="clientHoverTitle(c)">{{ clientLabel(c) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else class="detail card muted" style="display:flex; align-items:center; justify-content:center; padding: 20px;">
        Select a skills group.
      </div>
    </div>

    <!-- Create/Edit modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 style="margin:0;">{{ editingGroupId ? 'Edit skills group' : 'Add skills group' }}</h3>
          <button class="btn-close" @click="closeModal">×</button>
        </div>

        <div v-if="modalError" class="error" style="margin: 10px 0;">{{ modalError }}</div>

        <div class="form-group">
          <label>Name *</label>
          <input v-model="form.name" type="text" />
        </div>
        <div class="filters-row">
          <div class="filters-group" style="flex:1;">
            <label class="filters-label">Start date</label>
            <input v-model="form.start_date" type="date" class="filters-input" />
          </div>
          <div class="filters-group" style="flex:1;">
            <label class="filters-label">End date</label>
            <input v-model="form.end_date" type="date" class="filters-input" />
          </div>
        </div>

        <div class="form-section-divider" style="margin-top: 14px; margin-bottom: 8px;">
          <h4 style="margin:0;">Meetings</h4>
          <div class="muted">Optional. You can add meeting day/time later.</div>
        </div>
        <div v-for="(m, idx) in form.meetings" :key="idx" class="filters-row" style="flex-wrap: wrap;">
          <div class="filters-group" style="min-width: 200px; flex: 1;">
            <label class="filters-label">Weekday</label>
            <select v-model="m.weekday" class="filters-select">
              <option value="">Select…</option>
              <option v-for="d in weekdays" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="filters-group" style="min-width: 160px;">
            <label class="filters-label">Start</label>
            <input v-model="m.start_time" type="time" class="filters-input" />
          </div>
          <div class="filters-group" style="min-width: 160px;">
            <label class="filters-label">End</label>
            <input v-model="m.end_time" type="time" class="filters-input" />
          </div>
          <div class="actions" style="align-self:end;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removeMeeting(idx)">
              Remove
            </button>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="addMeeting" style="margin-top: 8px;">
          Add meeting
        </button>

        <div class="form-section-divider" style="margin-top: 14px; margin-bottom: 8px;">
          <h4 style="margin:0;">Assign providers</h4>
        </div>
        <div class="filters-row" style="flex-wrap: wrap;">
          <div class="filters-group" style="min-width: 280px; flex: 1;">
            <label class="filters-label">Provider</label>
            <select v-model="providerPick" class="filters-select">
              <option value="">Select…</option>
              <option v-for="p in eligibleProviders" :key="p.id" :value="String(p.id)">{{ p.last_name }}, {{ p.first_name }}</option>
            </select>
          </div>
          <div class="actions" style="align-self:end;">
            <button class="btn btn-primary btn-sm" type="button" @click="addProviderToGroup" :disabled="!providerPick || saving">
              Add provider
            </button>
          </div>
        </div>
        <div class="chips" v-if="(form.providers||[]).length">
          <span v-for="p in form.providers" :key="p.provider_user_id" class="chip">
            {{ p.last_name }}, {{ p.first_name }}
            <button type="button" class="chip-x" @click="removeProviderFromGroup(p)">×</button>
          </span>
        </div>

        <div class="form-section-divider" style="margin-top: 14px; margin-bottom: 8px;">
          <h4 style="margin:0;">Assign skills clients</h4>
          <div class="muted">Only clients with Skills Client = Yes are shown.</div>
        </div>
        <div class="filters-row" style="flex-wrap: wrap;">
          <div class="filters-group" style="min-width: 280px; flex: 1;">
            <label class="filters-label">Client</label>
            <select v-model="clientPick" class="filters-select">
              <option value="">Select…</option>
              <option v-for="c in eligibleClients" :key="c.id" :value="String(c.id)">
                {{ clientLabel(c) }}
              </option>
            </select>
          </div>
          <div class="actions" style="align-self:end;">
            <button class="btn btn-primary btn-sm" type="button" @click="addClientToGroup" :disabled="!clientPick || saving">
              Add client
            </button>
          </div>
        </div>
        <div class="chips" v-if="(form.clients||[]).length">
          <span v-for="c in form.clients" :key="c.client_id" class="chip">
            <span :title="clientHoverTitle(c)">{{ clientLabel(c) }}</span>
            <button type="button" class="chip-x" @click="removeClientFromGroup(c)">×</button>
          </span>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" @click="closeModal" :disabled="saving">Cancel</button>
          <button class="btn btn-primary" type="button" @click="saveGroup" :disabled="saving || !isValid">
            {{ saving ? 'Saving…' : (editingGroupId ? 'Save changes' : 'Create group') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  organizationId: { type: Number, required: true },
  clientLabelMode: { type: String, default: 'codes' }, // 'codes' | 'initials'
  focusUnassigned: { type: Boolean, default: false }
});

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManage = computed(() => ['super_admin', 'admin', 'staff', 'support'].includes(roleNorm.value));

const groups = ref([]);
const loading = ref(false);
const error = ref('');
const selectedGroupId = ref(null);

const modalOpen = ref(false);
const modalError = ref('');
const saving = ref(false);
const editingGroupId = ref(null);

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const eligibleProviders = ref([]);
const eligibleClients = ref([]);
const providerPick = ref('');
const clientPick = ref('');
const unassignedClients = ref([]);
const unassignedLoading = ref(false);

const clientLabel = (c) => {
  // Skills Groups creation/assignment is a back-office workflow; show initials by default (no need for anonymized codes here).
  // IMPORTANT: preserve entered casing for initials (some clients use mixed-case identifiers like AbcDef).
  const initials = String(c?.initials || '').replace(/\s+/g, '');
  const code = String(c?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  return initials || code || `ID ${c?.id || c?.client_id || ''}`.trim();
};

const clientHoverTitle = (c) => {
  return '';
};

const form = ref({
  name: '',
  start_date: '',
  end_date: '',
  meetings: [],
  providers: [],
  clients: []
});

const selected = computed(() => {
  return (groups.value || []).find((g) => Number(g.id) === Number(selectedGroupId.value)) || null;
});

const isValid = computed(() => {
  if (!String(form.value.name || '').trim()) return false;

  const sd = String(form.value.start_date || '').trim();
  const ed = String(form.value.end_date || '').trim();
  // In the School Portal we allow groups without dates, but if either side is set, require both.
  if ((!!sd && !ed) || (!sd && !!ed)) return false;

  // Meetings are optional, but if a row has *any* value, it must be complete.
  const ms = Array.isArray(form.value.meetings) ? form.value.meetings : [];
  for (const m of ms) {
    const wd = String(m.weekday || '').trim();
    const st = String(m.start_time || '').trim();
    const et = String(m.end_time || '').trim();
    const any = !!wd || !!st || !!et;
    const all = !!wd && !!st && !!et;
    if (any && !all) return false;
  }
  return true;
});

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const timeLabel = (t) => {
  const raw = String(t || '').slice(0, 5);
  if (!raw) return '—';
  const [hh, mm] = raw.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
};

const meetingSummary = (g) => {
  const ms = g?.meetings || [];
  if (!ms.length) return '';
  return ms.map((m) => `${m.weekday.slice(0, 3)} ${timeLabel(m.start_time)}–${timeLabel(m.end_time)}`).join(', ');
};

const reload = async () => {
  if (!props.organizationId) return;
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get(`/school-portal/${props.organizationId}/skills-groups`);
    groups.value = r.data || [];
    if (!selectedGroupId.value && (groups.value || []).length) {
      selectedGroupId.value = groups.value[0].id;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load skills groups';
    groups.value = [];
  } finally {
    loading.value = false;
  }
};

const select = (g) => {
  selectedGroupId.value = g?.id || null;
};

const loadEligible = async () => {
  if (!canManage.value) return;
  try {
    const [p, c] = await Promise.all([
      api.get(`/school-portal/${props.organizationId}/skills-eligible-providers`),
      api.get(`/school-portal/${props.organizationId}/skills-eligible-clients`)
    ]);
    eligibleProviders.value = p.data || [];
    eligibleClients.value = c.data || [];
  } catch {
    eligibleProviders.value = [];
    eligibleClients.value = [];
  }
};

const loadUnassigned = async () => {
  if (!canManage.value || !props.focusUnassigned) return;
  try {
    unassignedLoading.value = true;
    const r = await api.get(`/school-portal/${props.organizationId}/skills-eligible-clients`, {
      params: { unassigned: 1 }
    });
    unassignedClients.value = r.data || [];
  } catch {
    unassignedClients.value = [];
  } finally {
    unassignedLoading.value = false;
  }
};

const startCreate = async () => {
  editingGroupId.value = null;
  modalError.value = '';
  providerPick.value = '';
  clientPick.value = '';
  form.value = {
    name: '',
    start_date: '',
    end_date: '',
    meetings: [],
    providers: [],
    clients: []
  };
  await loadEligible();
  modalOpen.value = true;
};

const startEdit = async (g) => {
  editingGroupId.value = g.id;
  modalError.value = '';
  providerPick.value = '';
  clientPick.value = '';
  form.value = {
    name: g.name || '',
    start_date: String(g.start_date || '').slice(0, 10),
    end_date: String(g.end_date || '').slice(0, 10),
    meetings: (g.meetings || []).map((m) => ({ weekday: m.weekday, start_time: timeLabel(m.start_time), end_time: timeLabel(m.end_time) })),
    providers: (g.providers || []).map((p) => ({ ...p })),
    clients: (g.clients || []).map((c) => ({ ...c }))
  };
  await loadEligible();
  modalOpen.value = true;
};

const closeModal = () => {
  modalOpen.value = false;
};

const addMeeting = () => {
  form.value.meetings.push({ weekday: '', start_time: '', end_time: '' });
};

const removeMeeting = (idx) => {
  form.value.meetings.splice(idx, 1);
};

const addProviderToGroup = () => {
  const id = providerPick.value ? Number(providerPick.value) : null;
  if (!id) return;
  const p = (eligibleProviders.value || []).find((x) => Number(x.id) === id);
  if (!p) return;
  const exists = (form.value.providers || []).some((x) => Number(x.provider_user_id) === id);
  if (exists) return;
  form.value.providers.push({ provider_user_id: id, first_name: p.first_name, last_name: p.last_name, email: p.email });
  providerPick.value = '';
};

const removeProviderFromGroup = (p) => {
  form.value.providers = (form.value.providers || []).filter((x) => Number(x.provider_user_id) !== Number(p.provider_user_id));
};

const addClientToGroup = () => {
  const id = clientPick.value ? Number(clientPick.value) : null;
  if (!id) return;
  const c = (eligibleClients.value || []).find((x) => Number(x.id) === id);
  if (!c) return;
  const exists = (form.value.clients || []).some((x) => Number(x.client_id) === id);
  if (exists) return;
  form.value.clients.push({ client_id: id, identifier_code: c.identifier_code || null, initials: c.initials || null });
  clientPick.value = '';
};

const removeClientFromGroup = (c) => {
  form.value.clients = (form.value.clients || []).filter((x) => Number(x.client_id) !== Number(c.client_id));
};

const saveGroup = async () => {
  try {
    saving.value = true;
    modalError.value = '';
    const cleanedMeetings = (form.value.meetings || [])
      .map((m) => ({
        weekday: String(m.weekday || '').trim(),
        start_time: String(m.start_time || '').trim(),
        end_time: String(m.end_time || '').trim()
      }))
      .filter((m) => m.weekday && m.start_time && m.end_time);

    const payload = {
      name: String(form.value.name || '').trim(),
      start_date: String(form.value.start_date || '').trim() || null,
      end_date: String(form.value.end_date || '').trim() || null,
      meetings: cleanedMeetings
    };
    let resp;
    if (editingGroupId.value) {
      resp = await api.put(`/school-portal/${props.organizationId}/skills-groups/${editingGroupId.value}`, payload);
    } else {
      resp = await api.post(`/school-portal/${props.organizationId}/skills-groups`, payload);
    }

    const saved = resp.data;
    const gid = saved?.id || editingGroupId.value;
    // Apply provider/client assignments (delta style)
    if (gid) {
      const existing = (groups.value || []).find((g) => Number(g.id) === Number(gid)) || null;
      const existingProviderIds = new Set((existing?.providers || []).map((p) => Number(p.provider_user_id)));
      const nextProviderIds = new Set((form.value.providers || []).map((p) => Number(p.provider_user_id)));
      for (const pid of nextProviderIds) {
        if (!existingProviderIds.has(pid)) {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/school-portal/${props.organizationId}/skills-groups/${gid}/providers`, { provider_user_id: pid, action: 'add' });
        }
      }
      for (const pid of existingProviderIds) {
        if (!nextProviderIds.has(pid)) {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/school-portal/${props.organizationId}/skills-groups/${gid}/providers`, { provider_user_id: pid, action: 'remove' });
        }
      }

      const existingClientIds = new Set((existing?.clients || []).map((c) => Number(c.client_id)));
      const nextClientIds = new Set((form.value.clients || []).map((c) => Number(c.client_id)));
      for (const cid of nextClientIds) {
        if (!existingClientIds.has(cid)) {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/school-portal/${props.organizationId}/skills-groups/${gid}/clients`, { client_id: cid, action: 'add' });
        }
      }
      for (const cid of existingClientIds) {
        if (!nextClientIds.has(cid)) {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/school-portal/${props.organizationId}/skills-groups/${gid}/clients`, { client_id: cid, action: 'remove' });
        }
      }
    }

    await reload();
    if (gid) selectedGroupId.value = gid;
    modalOpen.value = false;
  } catch (e) {
    modalError.value = e.response?.data?.error?.message || 'Failed to save skills group';
  } finally {
    saving.value = false;
  }
};

const removeGroup = async (g) => {
  if (!g?.id) return;
  if (!window.confirm('Delete this skills group?')) return;
  try {
    await api.delete(`/school-portal/${props.organizationId}/skills-groups/${g.id}`);
    await reload();
    if (Number(selectedGroupId.value) === Number(g.id)) selectedGroupId.value = (groups.value?.[0]?.id || null);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete');
  }
};

onMounted(async () => {
  await reload();
  await loadUnassigned();
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 1100px) {
  .grid {
    grid-template-columns: 360px 1fr;
  }
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
.unassigned-card {
  padding: 10px;
}
.unassigned-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 6px 10px 6px;
}
.unassigned-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
  padding: 0 6px 6px 6px;
}
.unassigned-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--bg-alt);
  font-size: 13px;
}
.list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-item {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}
.list-item.active {
  border-color: var(--primary);
  background: rgba(59, 130, 246, 0.08);
}
.title {
  font-weight: 700;
}
.meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.detail {
  padding: 14px;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 10px;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.info-item label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 4px;
}
.split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 900px) {
  .split {
    grid-template-columns: 1fr 1fr;
  }
}
.simple {
  margin: 0;
  padding-left: 18px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1400;
}
.modal-content {
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
  width: 900px;
  max-width: 94vw;
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  width: 32px;
  height: 32px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.form-group > label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}
.form-group input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.filters-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.filters-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filters-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.filters-input,
.filters-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.form-section-divider {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
.chips {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-alt);
  font-size: 12px;
}
.chip-x {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.loading {
  padding: 14px;
  color: var(--text-secondary);
}
.error {
  padding: 12px;
  color: #c33;
  background: #fee;
  border-radius: 10px;
}
</style>

