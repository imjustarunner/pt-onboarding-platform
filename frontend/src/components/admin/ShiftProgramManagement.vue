<template>
  <div class="shift-program-management page">
    <div class="page-header">
      <h1>Shift-Based Programs</h1>
      <p class="page-description">
        Configure programs with clock-in/out, shift scheduling, on-call, and sites. Add sites, set default direct hours, on-call pay, and assign staff.
      </p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="form-row">
        <div class="field">
          <label>Program</label>
          <select v-model="selectedProgramId" class="select" @change="loadProgram">
            <option value="">Select a program…</option>
            <option v-for="p in programs" :key="p.id" :value="String(p.id)">
              {{ p.name }}
            </option>
          </select>
        </div>
        <button class="btn btn-secondary" :disabled="loading" @click="loadProgram">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <template v-else-if="selectedProgram">
        <div class="tabs">
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'sites' }"
            @click="activeTab = 'sites'"
          >
            Sites
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'settings' }"
            @click="activeTab = 'settings'"
          >
            Settings
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'slots' }"
            @click="activeTab = 'slots'; loadSlots()"
          >
            Shift Slots
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'staff' }"
            @click="activeTab = 'staff'"
          >
            Staff
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'signups' }"
            @click="activeTab = 'signups'; loadSignups()"
          >
            Assign Shifts
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'checklist' }"
            @click="activeTab = 'checklist'; loadChecklistItems()"
          >
            Checklist
          </button>
        </div>

        <div v-show="activeTab === 'sites'" class="tab-content">
          <h2>Sites</h2>
          <p class="muted">Sites are physical locations where staff clock in/out. Link to an office location for kiosk access.</p>
          <div class="form-row">
            <div class="field">
              <label>Name</label>
              <input v-model="siteForm.name" type="text" placeholder="Site name" class="input" />
            </div>
            <div class="field">
              <label>Address</label>
              <input v-model="siteForm.address" type="text" placeholder="Optional" class="input" />
            </div>
            <div class="field">
              <label>Office Location (Kiosk)</label>
              <select v-model="siteForm.officeLocationId" class="select">
                <option value="">None</option>
                <option v-for="ol in officeLocations" :key="ol.id" :value="String(ol.id)">
                  {{ ol.name }}
                </option>
              </select>
            </div>
            <div class="field actions">
              <button class="btn btn-primary" :disabled="saving || !siteForm.name?.trim()" @click="addSite">
                Add Site
              </button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Office Location</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in selectedProgram.sites" :key="s.id">
                  <td>{{ s.name }}</td>
                  <td>{{ s.address || '—' }}</td>
                  <td>{{ s.office_location_name || '—' }}</td>
                  <td>{{ s.is_active ? 'Yes' : 'No' }}</td>
                  <td>
                    <button type="button" class="btn btn-sm btn-secondary" @click="editSite(s)">Edit</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-show="activeTab === 'slots'" class="tab-content">
          <h2>Shift Slots</h2>
          <p class="muted">Define which days/hours are available for staff to sign up (scheduled or on-call).</p>
          <div v-for="site in selectedProgram.sites" :key="site.id" class="slot-site-block">
            <h3>{{ site.name }}</h3>
            <div class="form-row">
              <div class="field">
                <label>Day</label>
                <select v-model="slotForm[site.id].weekday" class="select">
                  <option v-for="(d, i) in weekdays" :key="i" :value="i">{{ d }}</option>
                </select>
              </div>
              <div class="field">
                <label>Start</label>
                <input v-model="slotForm[site.id].startTime" type="time" class="input" />
              </div>
              <div class="field">
                <label>End</label>
                <input v-model="slotForm[site.id].endTime" type="time" class="input" />
              </div>
              <div class="field">
                <label>Type</label>
                <select v-model="slotForm[site.id].slotType" class="select">
                  <option value="scheduled">Scheduled</option>
                  <option value="on_call">On-Call</option>
                </select>
              </div>
              <div class="field actions">
                <button class="btn btn-primary" :disabled="saving" @click="addSlot(site.id)">Add Slot</button>
              </div>
            </div>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="slot in (shiftSlotsBySite[site.id] || [])" :key="slot.id">
                    <td>{{ weekdays[slot.weekday] }}</td>
                    <td>{{ formatTime(slot.start_time) }} – {{ formatTime(slot.end_time) }}</td>
                    <td>{{ slot.slot_type }}</td>
                    <td>
                      <button type="button" class="btn btn-sm btn-secondary" @click="removeSlot(site.id, slot.id)">Remove</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'settings'" class="tab-content">
          <h2>Program Settings</h2>
          <div class="form-grid">
            <div class="field">
              <label>Default Direct Hours</label>
              <input
                v-model.number="settingsForm.defaultDirectHours"
                type="number"
                min="0"
                step="0.5"
                class="input"
              />
              <small>Hours counted as direct from total (e.g. 3 = first 3h direct, rest indirect)</small>
            </div>
            <div class="field">
              <label>On-Call Pay Amount ($)</label>
              <input
                v-model.number="settingsForm.onCallPayAmount"
                type="number"
                min="0"
                step="0.01"
                class="input"
                placeholder="Optional"
              />
            </div>
            <div class="field">
              <label>Bonus: Perfect Attendance ($)</label>
              <input
                v-model.number="settingsForm.bonusPerfectAttendance"
                type="number"
                min="0"
                step="0.01"
                class="input"
                placeholder="Optional"
              />
            </div>
            <div class="field">
              <label>Bonus: Shift Coverage ($)</label>
              <input
                v-model.number="settingsForm.bonusShiftCoverage"
                type="number"
                min="0"
                step="0.01"
                class="input"
                placeholder="Optional"
              />
            </div>
            <div class="field">
              <label class="toggle-row">
                <input type="checkbox" v-model="settingsForm.shiftSchedulingEnabled" />
                <span>Shift scheduling enabled</span>
              </label>
            </div>
          </div>
          <button class="btn btn-primary" :disabled="saving" @click="saveSettings">Save Settings</button>
        </div>

        <div v-show="activeTab === 'signups'" class="tab-content">
          <h2>Assign Staff to Shifts</h2>
          <p class="muted">Assign providers to shifts. Signups appear on the kiosk and in staff's My Shifts.</p>
          <div class="form-row">
            <div class="field">
              <label>Site</label>
              <select v-model="assignForm.siteId" class="select" @change="loadSignups">
                <option value="">Select site…</option>
                <option v-for="s in selectedProgram.sites" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>Date</label>
              <input v-model="assignForm.slotDate" type="date" class="input" @change="loadSignups" />
            </div>
          </div>
          <div v-if="assignForm.siteId && assignForm.slotDate" class="form-row" style="margin-top: 12px;">
            <div class="field">
              <label>Assign Staff</label>
              <select v-model="assignForm.userId" class="select">
                <option value="">Select staff…</option>
                <option v-for="u in selectedProgram.staff" :key="u.user_id" :value="String(u.user_id)">
                  {{ u.first_name }} {{ u.last_name }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Type</label>
              <select v-model="assignForm.signupType" class="select">
                <option value="scheduled">Scheduled</option>
                <option value="on_call">On-Call</option>
              </select>
            </div>
            <div class="field actions">
              <button class="btn btn-primary" :disabled="saving || !assignForm.userId" @click="assignStaff">
                Assign
              </button>
            </div>
          </div>
          <div v-if="assignForm.siteId && assignForm.slotDate" class="table-wrap" style="margin-top: 16px;">
            <h4>Signed up for {{ assignForm.slotDate }}</h4>
            <table class="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Type</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in signupsForDate" :key="s.id">
                  <td>{{ s.first_name }} {{ s.last_name }}</td>
                  <td>{{ s.signup_type === 'on_call' ? 'On-Call' : 'Scheduled' }}</td>
                  <td>{{ s.start_time || '—' }} – {{ s.end_time || '—' }}</td>
                </tr>
                <tr v-if="signupsForDate.length === 0">
                  <td colspan="3" class="muted">No one assigned yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-show="activeTab === 'checklist'" class="tab-content">
          <h2>Program Checklist Items</h2>
          <p class="muted">Choose which checklist items apply to clients in this program. Items are inherited from the agency; disable any that do not apply.</p>
          <div v-if="checklistLoading" class="loading">Loading…</div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in checklistItems" :key="item.id">
                  <td>{{ item.item_label || item.item_key || '—' }}</td>
                  <td class="muted">{{ item.description || '—' }}</td>
                  <td>
                    <label class="toggle-row">
                      <input
                        type="checkbox"
                        :checked="item.enabled"
                        :disabled="checklistSaving === item.id"
                        @change="toggleChecklistItem(item)"
                      />
                      <span>{{ item.enabled ? 'Yes' : 'No' }}</span>
                    </label>
                  </td>
                </tr>
                <tr v-if="checklistItems.length === 0">
                  <td colspan="3" class="muted">No checklist items. Enable items at the agency level first.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-show="activeTab === 'staff'" class="tab-content">
          <h2>Staff Assignments</h2>
          <div class="form-row">
            <div class="field">
              <label>Add Staff</label>
              <select v-model="staffForm.userId" class="select">
                <option value="">Select user…</option>
                <option v-for="u in agencyUsers" :key="u.id" :value="String(u.id)">
                  {{ u.last_name }}, {{ u.first_name }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Role</label>
              <select v-model="staffForm.role" class="select">
                <option value="participant">Participant</option>
                <option value="on_call_eligible">On-Call Eligible</option>
              </select>
            </div>
            <div class="field">
              <label>Min Scheduled Hrs/Week</label>
              <input v-model.number="staffForm.minScheduledHoursPerWeek" type="number" min="0" step="0.5" class="input" placeholder="Optional" />
            </div>
            <div class="field">
              <label>Min On-Call Hrs/Week</label>
              <input v-model.number="staffForm.minOnCallHoursPerWeek" type="number" min="0" step="0.5" class="input" placeholder="Optional" />
            </div>
            <div class="field actions">
              <button class="btn btn-primary" :disabled="saving || !staffForm.userId" @click="addStaff">
                Add
              </button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Min Scheduled</th>
                  <th>Min On-Call</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in selectedProgram.staff" :key="a.id">
                  <td>{{ a.first_name }} {{ a.last_name }}</td>
                  <td>{{ a.role }}</td>
                  <td>{{ a.min_scheduled_hours_per_week ?? '—' }}</td>
                  <td>{{ a.min_on_call_hours_per_week ?? '—' }}</td>
                  <td>
                    <button type="button" class="btn btn-sm btn-danger" @click="removeStaff(a)">Remove</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const programs = ref([]);
const selectedProgramId = ref('');
const selectedProgram = ref(null);
const officeLocations = ref([]);
const agencyUsers = ref([]);
const shiftSlotsBySite = ref({});

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const activeTab = ref('sites');

const siteForm = ref({ name: '', address: '', officeLocationId: '' });
const settingsForm = ref({
  defaultDirectHours: 3,
  onCallPayAmount: null,
  bonusPerfectAttendance: null,
  bonusShiftCoverage: null,
  shiftSchedulingEnabled: true
});
const staffForm = ref({
  userId: '',
  role: 'participant',
  minScheduledHoursPerWeek: null,
  minOnCallHoursPerWeek: null
});

const slotForm = ref({});

const assignForm = ref({
  siteId: '',
  slotDate: new Date().toISOString().slice(0, 10),
  userId: '',
  signupType: 'scheduled'
});
const signupsForDate = ref([]);

const checklistItems = ref([]);
const checklistLoading = ref(false);
const checklistSaving = ref(null);

const loadSignups = async () => {
  const siteId = assignForm.value.siteId;
  const slotDate = assignForm.value.slotDate;
  if (!selectedProgramId.value || !siteId || !slotDate) {
    signupsForDate.value = [];
    return;
  }
  try {
    const res = await api.get(`/shift-programs/${selectedProgramId.value}/sites/${siteId}/signups`, {
      params: { slotDate }
    });
    signupsForDate.value = res.data || [];
  } catch {
    signupsForDate.value = [];
  }
};

const assignStaff = async () => {
  const siteId = assignForm.value.siteId;
  const userId = assignForm.value.userId;
  const slotDate = assignForm.value.slotDate;
  const signupType = assignForm.value.signupType;
  if (!selectedProgramId.value || !siteId || !userId || !slotDate) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/shift-programs/${selectedProgramId.value}/sites/${siteId}/signups`, {
      slotDate,
      userId: parseInt(userId, 10),
      signupType
    });
    assignForm.value.userId = '';
    await loadSignups();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign';
  } finally {
    saving.value = false;
  }
};

const formatTime = (t) => {
  if (!t) return '—';
  const s = String(t);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
};

const loadSlots = async () => {
  if (!selectedProgram.value?.sites) return;
  const bySite = {};
  const forms = { ...slotForm.value };
  for (const site of selectedProgram.value.sites) {
    try {
      const res = await api.get(`/shift-programs/${selectedProgramId.value}/sites/${site.id}/slots`);
      bySite[site.id] = res.data || [];
      if (!forms[site.id]) {
        forms[site.id] = { weekday: 1, startTime: '08:00', endTime: '12:00', slotType: 'scheduled' };
      }
    } catch {
      bySite[site.id] = [];
    }
  }
  shiftSlotsBySite.value = bySite;
  slotForm.value = forms;
};

const addSlot = async (siteId) => {
  if (!selectedProgramId.value) return;
  const form = slotForm.value[siteId];
  if (!form?.startTime || !form?.endTime) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/shift-programs/${selectedProgramId.value}/sites/${siteId}/slots`, {
      weekday: form.weekday,
      startTime: form.startTime,
      endTime: form.endTime,
      slotType: form.slotType
    });
    await loadSlots();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add slot';
  } finally {
    saving.value = false;
  }
};

const removeSlot = async (siteId, slotId) => {
  if (!confirm('Remove this shift slot?')) return;
  try {
    saving.value = true;
    await api.delete(`/shift-programs/${selectedProgramId.value}/sites/${siteId}/slots/${slotId}`);
    await loadSlots();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove slot';
  } finally {
    saving.value = false;
  }
};

const loadPrograms = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/shift-programs/agencies/${agencyId.value}/programs`);
    programs.value = res.data || [];
    if (programs.value.length > 0 && !selectedProgramId.value) {
      selectedProgramId.value = String(programs.value[0].id);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load programs';
  }
};

const loadOfficeLocations = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/offices');
    officeLocations.value = Array.isArray(res.data) ? res.data : (res.data?.locations || []);
  } catch {
    officeLocations.value = [];
  }
};

const loadAgencyUsers = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/agencies/${agencyId.value}/users`);
    agencyUsers.value = res.data || [];
  } catch {
    agencyUsers.value = [];
  }
};

const loadProgram = async () => {
  if (!selectedProgramId.value) {
    selectedProgram.value = null;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get(`/shift-programs/${selectedProgramId.value}`);
    selectedProgram.value = res.data;
    settingsForm.value = {
      defaultDirectHours: res.data?.settings?.default_direct_hours ?? 3,
      onCallPayAmount: res.data?.settings?.on_call_pay_amount ?? null,
      bonusPerfectAttendance: res.data?.settings?.bonus_perfect_attendance ?? null,
      bonusShiftCoverage: res.data?.settings?.bonus_shift_coverage ?? null,
      shiftSchedulingEnabled: res.data?.settings?.shift_scheduling_enabled !== false
    };
    if (activeTab.value === 'slots') loadSlots();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load program';
    selectedProgram.value = null;
  } finally {
    loading.value = false;
  }
};

const addSite = async () => {
  if (!selectedProgramId.value || !siteForm.value.name?.trim()) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/shift-programs/${selectedProgramId.value}/sites`, {
      name: siteForm.value.name.trim(),
      address: siteForm.value.address?.trim() || null,
      officeLocationId: siteForm.value.officeLocationId || null
    });
    siteForm.value = { name: '', address: '', officeLocationId: '' };
    await loadProgram();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add site';
  } finally {
    saving.value = false;
  }
};

const editSite = (site) => {
  // Simple inline edit - could open modal
  const newName = prompt('Edit site name:', site.name);
  if (newName != null && newName.trim()) {
    api.patch(`/shift-programs/${selectedProgramId.value}/sites/${site.id}`, { name: newName.trim() })
      .then(() => loadProgram())
      .catch((e) => { error.value = e.response?.data?.error?.message || 'Failed to update'; });
  }
};

const saveSettings = async () => {
  if (!selectedProgramId.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.put(`/shift-programs/${selectedProgramId.value}/settings`, {
      defaultDirectHours: settingsForm.value.defaultDirectHours ?? 3,
      onCallPayAmount: settingsForm.value.onCallPayAmount ?? null,
      bonusPerfectAttendance: settingsForm.value.bonusPerfectAttendance ?? null,
      bonusShiftCoverage: settingsForm.value.bonusShiftCoverage ?? null,
      shiftSchedulingEnabled: settingsForm.value.shiftSchedulingEnabled
    });
    await loadProgram();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save settings';
  } finally {
    saving.value = false;
  }
};

const addStaff = async () => {
  if (!selectedProgramId.value || !staffForm.value.userId) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/shift-programs/${selectedProgramId.value}/staff`, {
      userId: staffForm.value.userId,
      role: staffForm.value.role,
      minScheduledHoursPerWeek: staffForm.value.minScheduledHoursPerWeek ?? null,
      minOnCallHoursPerWeek: staffForm.value.minOnCallHoursPerWeek ?? null
    });
    staffForm.value = { userId: '', role: 'participant', minScheduledHoursPerWeek: null, minOnCallHoursPerWeek: null };
    await loadProgram();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add staff';
  } finally {
    saving.value = false;
  }
};

const removeStaff = async (a) => {
  if (!selectedProgramId.value || !confirm(`Remove ${a.first_name} ${a.last_name} from this program?`)) return;
  try {
    saving.value = true;
    error.value = '';
    await api.delete(`/shift-programs/${selectedProgramId.value}/staff/${a.user_id}`);
    await loadProgram();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove staff';
  } finally {
    saving.value = false;
  }
};

const loadChecklistItems = async () => {
  if (!selectedProgramId.value) return;
  try {
    checklistLoading.value = true;
    const res = await api.get(`/shift-programs/${selectedProgramId.value}/checklist-items`);
    checklistItems.value = res.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load checklist items';
    checklistItems.value = [];
  } finally {
    checklistLoading.value = false;
  }
};

const toggleChecklistItem = async (item) => {
  if (!selectedProgramId.value) return;
  try {
    checklistSaving.value = item.id;
    error.value = '';
    const newEnabled = !item.enabled;
    await api.put(`/shift-programs/${selectedProgramId.value}/checklist-items/${item.id}`, { enabled: newEnabled });
    item.enabled = newEnabled;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update';
  } finally {
    checklistSaving.value = null;
  }
};

watch(agencyId, () => {
  loadPrograms();
  loadOfficeLocations();
  loadAgencyUsers();
  selectedProgramId.value = '';
  selectedProgram.value = null;
});

watch(selectedProgramId, () => {
  if (selectedProgramId.value) loadProgram();
  else selectedProgram.value = null;
});

onMounted(() => {
  loadPrograms();
  loadOfficeLocations();
  loadAgencyUsers();
});
</script>

<style scoped>
.shift-program-management {
  max-width: 900px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0;
  border-bottom: 1px solid var(--border-color, #ddd);
}
.tab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
}
.tab.active {
  border-bottom-color: var(--primary, #2563eb);
  font-weight: 600;
}
.tab-content {
  padding: 16px 0;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 16px;
}
.form-row .field {
  flex: 0 0 auto;
}
.form-row .field.actions {
  align-self: flex-end;
}
.muted {
  color: var(--text-secondary, #666);
  font-size: 13px;
  margin-bottom: 12px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.table-wrap {
  overflow-x: auto;
  margin-top: 12px;
}
.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
