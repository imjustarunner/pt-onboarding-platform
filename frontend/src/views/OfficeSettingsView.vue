<template>
  <div class="office-settings">
    <div class="card" data-tour="buildings-settings-card">
      <div class="card-head" data-tour="buildings-settings-header">
        <h3 style="margin: 0;" data-tour="buildings-settings-title">Building Settings</h3>
        <button class="btn btn-secondary" @click="loadAll" :disabled="loading">Refresh</button>
      </div>

      <div v-if="!officeId" class="muted" data-tour="buildings-settings-empty">
        Select a building above to manage settings.
      </div>

      <div v-else>
        <div v-if="error" class="error-box">{{ error }}</div>

        <div v-if="canManageOfficeSettings" class="section">
          <div class="section-title">Add Building</div>
          <div class="row">
            <input v-model="newOfficeName" placeholder="Building name" />
            <select v-if="isSuperAdmin" v-model="newOfficeAgencyId">
              <option value="">Select agency…</option>
              <option v-for="a in agencyOrganizations" :key="`new-office-ag-${a.id}`" :value="String(a.id)">
                {{ a.name }}
              </option>
            </select>
            <input v-model="newOfficeTimezone" placeholder="Timezone (e.g. America/New_York)" />
            <button class="btn btn-primary" @click="createOffice" :disabled="saving || loading || !newOfficeName.trim() || (isSuperAdmin && !newOfficeAgencyId)">
              Add building
            </button>
          </div>
          <div class="hint">
            For non-super-admin users, the building is created in your primary agency.
          </div>
        </div>

        <div class="section" data-tour="buildings-settings-svg">
          <div class="section-title">Building Details</div>
          <div class="row">
            <input v-model="officeName" placeholder="Building name" />
            <input v-model="officeTimezone" placeholder="Timezone (e.g. America/New_York)" />
            <input v-model="svgUrl" type="url" placeholder="https://.../building.svg" />
            <button class="btn btn-primary" @click="saveOffice" :disabled="saving || loading || !canManageOfficeSettings">Save</button>
            <button class="btn btn-secondary" @click="archiveOffice" :disabled="saving || loading || !canManageOfficeSettings">
              Archive
            </button>
            <button class="btn btn-danger" @click="deleteOfficePermanently" :disabled="saving || loading || !canManageOfficeSettings">
              Delete
            </button>
          </div>
          <div class="hint">
            Delete archives then permanently deletes this building and its rooms/events.
          </div>
        </div>

        <div v-if="isSuperAdmin" class="section">
          <div class="section-title">Agency Access (Booking Privileges)</div>
          <div class="hint">
            Agencies listed here can see/book this building (schedule + kiosk staff tools).
          </div>

          <div class="row" style="margin-top: 10px;">
            <select v-model="selectedAgencyToAdd" :disabled="loading || saving">
              <option value="">Select an agency…</option>
              <option v-for="a in availableAgenciesToAdd" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
            </select>
            <button class="btn btn-primary" @click="addAgencyAccess" :disabled="saving || loading || !selectedAgencyToAdd">
              Add Agency
            </button>
          </div>

          <div v-if="officeAgencies.length === 0" class="muted" style="margin-top: 10px;">
            No agencies assigned yet.
          </div>
          <div v-else class="list" style="margin-top: 10px;">
            <div v-for="a in officeAgencies" :key="a.id" class="list-row">
              <div class="list-main">
                <div class="title">{{ a.name }}</div>
                <div class="meta">Agency ID: {{ a.id }}</div>
              </div>
              <button class="btn btn-danger btn-sm" @click="removeAgencyAccess(a.id)" :disabled="saving">Remove</button>
            </div>
          </div>
        </div>

        <div class="section" data-tour="buildings-settings-questionnaires">
          <div class="section-title">Questionnaires (Kiosk)</div>
          <div class="row">
            <select v-model="selectedModuleId" :disabled="loading">
              <option value="">Select a module…</option>
              <option v-for="m in modules" :key="m.id" :value="String(m.id)">{{ m.title }}</option>
            </select>
            <button class="btn btn-primary" @click="addQuestionnaire" :disabled="saving || loading || !selectedModuleId || !canManageOfficeSettings">
              Add
            </button>
          </div>

          <div v-if="questionnaires.length === 0" class="muted" style="margin-top: 10px;">
            No questionnaires assigned to this office yet.
          </div>

          <div v-else class="list" style="margin-top: 10px;">
            <div v-for="q in questionnaires" :key="`${q.office_location_id}-${q.module_id}-${q.agency_id ?? 'any'}`" class="list-row">
              <div class="list-main">
                <div class="title">{{ q.module_title }}</div>
                <div class="meta">Module ID: {{ q.module_id }}</div>
              </div>
              <button class="btn btn-danger btn-sm" @click="removeQuestionnaire(q.module_id)" :disabled="saving || !canManageOfficeSettings">Remove</button>
            </div>
          </div>
        </div>

        <div class="section" data-tour="buildings-settings-room-types">
          <div class="section-title">Office Types</div>
          <div class="row">
            <input v-model="newRoomTypeName" placeholder="New room type name" />
            <button class="btn btn-primary" @click="createRoomType" :disabled="saving || loading || !newRoomTypeName.trim() || !canManageOfficeSettings">Add</button>
          </div>
          <div class="chips">
            <span v-for="rt in roomTypes" :key="rt.id" class="chip">{{ rt.name }}</span>
          </div>
        </div>

        <div class="section" data-tour="buildings-settings-rooms">
          <div class="section-title">Offices</div>
          <div class="row" data-tour="buildings-settings-rooms-create">
            <input v-model="newRoomNumber" type="number" placeholder="Number" style="max-width: 120px;" />
            <input v-model="newRoomLabel" placeholder="Label (e.g. Office 101)" />
            <button class="btn btn-primary" @click="createRoom" :disabled="saving || loading || (!newRoomLabel.trim() && !newRoomNumber) || !canManageOfficeSettings">Add</button>
          </div>
          <div v-if="rooms.length === 0" class="muted" style="margin-top: 10px;">No offices yet.</div>
          <div v-else class="list" style="margin-top: 10px;">
            <div v-for="r in rooms" :key="r.id" class="list-row">
              <div class="list-main">
                <div class="title">
                  {{ r.room_number ? `#${r.room_number}` : '' }} {{ r.label || r.name }}
                </div>
                <div class="meta">Office ID: {{ r.id }}</div>
                <div style="margin-top: 10px;">
                  <button class="btn btn-secondary btn-sm" @click="toggleEditRoom(r)" :disabled="saving || loading || !canManageOfficeSettings">
                    {{ editingRoomIds.has(r.id) ? 'Cancel' : 'Edit' }}
                  </button>
                  <button class="btn btn-danger btn-sm" style="margin-left: 8px;" @click="deleteRoom(r)" :disabled="saving || loading || !canManageOfficeSettings">
                    Delete
                  </button>
                </div>

                <div v-if="editingRoomIds.has(r.id)" class="meta" style="margin-top: 10px;">
                  <div style="font-weight: 700; margin-bottom: 6px;">Edit office</div>
                  <div class="row" style="margin: 0;">
                    <input
                      v-model="roomEdits[String(r.id)].roomNumber"
                      type="number"
                      placeholder="Number"
                      style="max-width: 140px;"
                    />
                    <input v-model="roomEdits[String(r.id)].label" placeholder="Label (e.g. Office 101)" />
                  </div>
                  <div class="row" style="margin-top: 8px; margin-bottom: 0;">
                    <input v-model="roomEdits[String(r.id)].svgRoomId" placeholder="SVG room id (optional)" />
                  </div>
                  <div style="margin-top: 10px;">
                    <div style="font-weight: 700; margin-bottom: 6px;">Office types</div>
                    <div v-if="roomTypes.length === 0" class="muted">No office types yet.</div>
                    <div v-else style="display: flex; flex-wrap: wrap; gap: 8px;">
                      <label
                        v-for="rt in roomTypes"
                        :key="rt.id"
                        style="display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid var(--border); border-radius: 999px;"
                      >
                        <input
                          type="checkbox"
                          :value="Number(rt.id)"
                          v-model="roomEdits[String(r.id)].roomTypeIds"
                        />
                        <span>{{ rt.name }}</span>
                      </label>
                    </div>
                  </div>
                  <div class="row" style="margin-top: 8px; margin-bottom: 0;">
                    <button class="btn btn-primary btn-sm" @click="saveRoomEdits(r)" :disabled="saving || loading || !canManageOfficeSettings">
                      Save changes
                    </button>
                  </div>
                  <div class="hint" style="margin-top: 6px;">
                    The “label” is what users see (we fall back to name if label is empty).
                  </div>
                </div>
                <div class="meta" style="margin-top: 8px;">
                  <div style="font-weight: 700; margin-bottom: 4px;">Google room resource email</div>
                  <div class="row" style="margin: 0;">
                    <input
                      v-model="roomGoogleEmails[String(r.id)]"
                      type="email"
                      placeholder="office-101@resource.yourdomain.com"
                    />
                    <button class="btn btn-primary btn-sm" @click="saveRoomGoogleEmail(r)" :disabled="saving || loading || !canManageOfficeSettings">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="hint">Office type assignment UI will come next (API is in place).</div>
        </div>

        <div class="section">
          <div class="section-title">Google Calendar Sync Test</div>
          <div class="muted">Tests the next few booked events in this building (next 4 weeks).</div>
          <div class="row" style="margin-top: 8px;">
            <button class="btn btn-secondary" @click="runGoogleSyncTest('dry_run')" :disabled="googleTestRunning || loading">
              Dry-run (no Google write)
            </button>
            <button class="btn btn-primary" @click="runGoogleSyncTest('live')" :disabled="googleTestRunning || loading">
              Run test sync (writes to Google)
            </button>
          </div>
          <div v-if="googleTestResult" class="list" style="margin-top: 10px;">
            <div class="list-row">
              <div class="list-main">
                <div class="title">
                  Configured: {{ googleTestResult.configured ? 'Yes' : 'No' }} • Candidates: {{ googleTestResult.candidates }}
                </div>
                <div class="meta">Mode: {{ googleTestResult.mode }}</div>
              </div>
            </div>
            <div v-for="r in (googleTestResult.results || [])" :key="String(r.officeEventId)" class="list-row">
              <div class="list-main">
                <div class="title">
                  Event #{{ r.officeEventId }} — {{ r.ok ? 'OK' : 'FAILED' }}
                </div>
                <div v-if="r.preview" class="meta">
                  {{ r.preview.summary }} • {{ r.preview.providerEmail || 'no provider email' }} • {{ r.preview.roomResourceEmail || 'no room email' }}
                </div>
                <div v-if="r.missing && r.missing.length" class="meta">Missing: {{ r.missing.join(', ') }}</div>
                <div v-if="r.reason && !r.ok" class="meta">Reason: {{ r.reason }}</div>
                <div v-if="r.error" class="meta">Error: {{ r.error }}</div>
                <div v-if="r.googleEventId" class="meta">Google event id: {{ r.googleEventId }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const router = useRouter();
const officeId = computed(() => (typeof route.query.officeId === 'string' ? route.query.officeId : ''));
const authStore = useAuthStore();
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const canManageOfficeSettings = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const roleAllowed = ['staff', 'admin', 'super_admin', 'clinical_practice_assistant'].includes(role);
  const skillBuilderCoordinator =
    authStore.user?.has_skill_builder_coordinator_access === true ||
    authStore.user?.has_skill_builder_coordinator_access === 1 ||
    authStore.user?.has_skill_builder_coordinator_access === '1';
  return roleAllowed || skillBuilderCoordinator;
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');

const officeName = ref('');
const officeTimezone = ref('America/New_York');
const svgUrl = ref('');
const officeAgencies = ref([]);
const allAgencies = ref([]);
const selectedAgencyToAdd = ref('');
const newOfficeName = ref('');
const newOfficeTimezone = ref('America/New_York');
const newOfficeAgencyId = ref('');

const availableAgenciesToAdd = computed(() => {
  const assigned = new Set((officeAgencies.value || []).map((a) => Number(a?.id)));
  return (allAgencies.value || [])
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .filter((a) => !assigned.has(Number(a?.id)))
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const agencyOrganizations = computed(() =>
  (allAgencies.value || [])
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
);

const questionnaires = ref([]);
const modules = ref([]);
const selectedModuleId = ref('');

const roomTypes = ref([]);
const newRoomTypeName = ref('');

const rooms = ref([]);
const newRoomNumber = ref('');
const newRoomLabel = ref('');
const roomGoogleEmails = ref({});
const roomEdits = ref({});
const editingRoomIds = ref(new Set());

const googleTestRunning = ref(false);
const googleTestResult = ref(null);

const loadAgencyOptions = async () => {
  if (!canManageOfficeSettings.value) return;
  try {
    const resp = await api.get('/agencies');
    allAgencies.value = resp.data || [];
  } catch {
    allAgencies.value = [];
  }
};

const loadAll = async () => {
  if (!officeId.value) return;
  try {
    loading.value = true;
    error.value = '';

    const settled = await Promise.allSettled([
      api.get(`/offices/${officeId.value}`),
      api.get(`/offices/${officeId.value}/questionnaires`),
      api.get(`/offices/questionnaire-modules/search`),
      api.get(`/offices/${officeId.value}/room-types`),
      api.get(`/offices/${officeId.value}/rooms`)
    ]);

    const officeResp = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const qResp = settled[1].status === 'fulfilled' ? settled[1].value : null;
    const modResp = settled[2].status === 'fulfilled' ? settled[2].value : null;
    const rtResp = settled[3].status === 'fulfilled' ? settled[3].value : null;
    const roomResp = settled[4].status === 'fulfilled' ? settled[4].value : null;

    if (!officeResp) {
      throw new Error('Failed to load building');
    }

    officeName.value = officeResp.data?.name || '';
    officeTimezone.value = officeResp.data?.timezone || 'America/New_York';
    svgUrl.value = officeResp.data?.svg_url || '';
    officeAgencies.value = officeResp.data?.agencies || [];
    questionnaires.value = qResp?.data || [];
    // Show only shared modules with form pages (kiosk questionnaires)
    modules.value = (modResp?.data || []).filter((m) => m?.is_custom_input_module === 1 || m?.is_custom_input_module === true);
    roomTypes.value = rtResp?.data || [];
    rooms.value = roomResp?.data || [];
    // Seed editable google resource email map
    const map = {};
    for (const r of rooms.value || []) {
      map[String(r.id)] = r.google_resource_email || '';
    }
    roomGoogleEmails.value = map;
    // Seed editable room fields map (label/number/svg)
    const edits = {};
    for (const r of rooms.value || []) {
      edits[String(r.id)] = {
        roomNumber: r.room_number === null || r.room_number === undefined ? '' : String(r.room_number),
        label: r.label || '',
        svgRoomId: r.svg_room_id || '',
        roomTypeIds: Array.isArray(r.roomTypeIds) ? r.roomTypeIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : []
      };
    }
    roomEdits.value = edits;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load office settings';
  } finally {
    loading.value = false;
  }
};

const saveOffice = async () => {
  if (!officeId.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.put(`/offices/${officeId.value}`, {
      name: officeName.value?.trim() || null,
      timezone: officeTimezone.value?.trim() || 'America/New_York',
      svgUrl: svgUrl.value || null
    });
    await loadAll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save office';
  } finally {
    saving.value = false;
  }
};

const createOffice = async () => {
  try {
    saving.value = true;
    error.value = '';
    const payload = {
      name: newOfficeName.value.trim(),
      timezone: newOfficeTimezone.value?.trim() || 'America/New_York',
      svgUrl: null
    };
    if (isSuperAdmin.value && newOfficeAgencyId.value) payload.agencyId = Number(newOfficeAgencyId.value);
    const resp = await api.post('/offices', payload);
    const createdId = Number(resp?.data?.id || 0) || null;
    newOfficeName.value = '';
    if (createdId) {
      await router.replace({ query: { ...route.query, officeId: String(createdId) } });
      await loadAll();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create building';
  } finally {
    saving.value = false;
  }
};

const archiveOffice = async () => {
  if (!officeId.value) return;
  const ok = window.confirm('Archive this building? It will be hidden from active building lists.');
  if (!ok) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/offices/${officeId.value}/archive`, {});
    await router.replace({ query: { ...route.query, officeId: undefined } });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to archive building';
  } finally {
    saving.value = false;
  }
};

const deleteOfficePermanently = async () => {
  if (!officeId.value) return;
  const ok = window.confirm('Delete this building permanently? This will remove related rooms and schedule data.');
  if (!ok) return;
  try {
    saving.value = true;
    error.value = '';
    // Delete endpoint requires archived first.
    await api.post(`/offices/${officeId.value}/archive`, {});
    await api.delete(`/offices/${officeId.value}`);
    await router.replace({ query: { ...route.query, officeId: undefined } });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete building';
  } finally {
    saving.value = false;
  }
};

const addQuestionnaire = async () => {
  if (!officeId.value || !selectedModuleId.value) return;
  try {
    saving.value = true;
    error.value = '';
    const resp = await api.post(`/offices/${officeId.value}/questionnaires`, { moduleId: Number(selectedModuleId.value), isActive: true });
    questionnaires.value = resp.data || [];
    selectedModuleId.value = '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add questionnaire';
  } finally {
    saving.value = false;
  }
};

const removeQuestionnaire = async (moduleId) => {
  if (!officeId.value || !moduleId) return;
  try {
    saving.value = true;
    error.value = '';
    const resp = await api.delete(`/offices/${officeId.value}/questionnaires/${moduleId}`);
    questionnaires.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove questionnaire';
  } finally {
    saving.value = false;
  }
};

const createRoomType = async () => {
  if (!officeId.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/offices/${officeId.value}/room-types`, { name: newRoomTypeName.value.trim(), sortOrder: 0 });
    newRoomTypeName.value = '';
    await loadAll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create room type';
  } finally {
    saving.value = false;
  }
};

const createRoom = async () => {
  if (!officeId.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/offices/${officeId.value}/rooms`, {
      roomNumber: newRoomNumber.value === '' ? null : Number(newRoomNumber.value),
      label: newRoomLabel.value.trim() || null,
      roomTypeIds: []
    });
    newRoomNumber.value = '';
    newRoomLabel.value = '';
    await loadAll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create room';
  } finally {
    saving.value = false;
  }
};

const saveRoomGoogleEmail = async (room) => {
  if (!officeId.value || !room?.id) return;
  try {
    saving.value = true;
    error.value = '';
    const email = String(roomGoogleEmails.value?.[String(room.id)] || '').trim();
    await api.put(`/offices/${officeId.value}/rooms/${room.id}`, {
      googleResourceEmail: email || null
    });
    await loadAll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save Google room resource email';
  } finally {
    saving.value = false;
  }
};

const toggleEditRoom = (room) => {
  const id = Number(room?.id);
  if (!id) return;
  const next = new Set(editingRoomIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  editingRoomIds.value = next;
};

const saveRoomEdits = async (room) => {
  if (!officeId.value || !room?.id) return;
  try {
    saving.value = true;
    error.value = '';
    const edit = roomEdits.value?.[String(room.id)] || {};
    const roomNumberRaw = String(edit.roomNumber ?? '').trim();
    const roomNumber = roomNumberRaw === '' ? null : Number(roomNumberRaw);
    const label = String(edit.label ?? '').trim();
    const svgRoomId = String(edit.svgRoomId ?? '').trim();
    const roomTypeIds = Array.isArray(edit.roomTypeIds)
      ? edit.roomTypeIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      : [];
    await api.put(`/offices/${officeId.value}/rooms/${room.id}`, {
      roomNumber: Number.isFinite(roomNumber) ? roomNumber : null,
      label: label || null,
      svgRoomId: svgRoomId || null,
      roomTypeIds
    });
    const next = new Set(editingRoomIds.value);
    next.delete(Number(room.id));
    editingRoomIds.value = next;
    await loadAll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save office changes';
  } finally {
    saving.value = false;
  }
};

const deleteRoom = async (room) => {
  if (!officeId.value || !room?.id) return;
  const ok = window.confirm(`Delete office "${room.label || room.name || room.id}"?`);
  if (!ok) return;
  try {
    saving.value = true;
    error.value = '';
    await api.delete(`/offices/${officeId.value}/rooms/${room.id}`);
    await loadAll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete office';
  } finally {
    saving.value = false;
  }
};

const runGoogleSyncTest = async (mode) => {
  if (!officeId.value) return;
  try {
    googleTestRunning.value = true;
    error.value = '';
    googleTestResult.value = null;
    const resp = await api.post(`/offices/${officeId.value}/test-google-sync`, {
      mode,
      limit: 3
    });
    googleTestResult.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to run Google sync test';
  } finally {
    googleTestRunning.value = false;
  }
};

const addAgencyAccess = async () => {
  if (!officeId.value || !selectedAgencyToAdd.value) return;
  try {
    saving.value = true;
    error.value = '';
    const resp = await api.post(`/offices/${officeId.value}/agencies`, { agencyId: Number(selectedAgencyToAdd.value) });
    officeAgencies.value = resp.data?.agencies || [];
    selectedAgencyToAdd.value = '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add agency access';
  } finally {
    saving.value = false;
  }
};

const removeAgencyAccess = async (agencyId) => {
  if (!officeId.value || !agencyId) return;
  try {
    saving.value = true;
    error.value = '';
    const resp = await api.delete(`/offices/${officeId.value}/agencies/${agencyId}`);
    officeAgencies.value = resp.data?.agencies || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove agency access';
  } finally {
    saving.value = false;
  }
};

watch(() => officeId.value, async () => {
  await loadAll();
}, { immediate: true });

onMounted(loadAgencyOptions);
</script>

<style scoped>
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.section-title {
  font-weight: 800;
  margin-bottom: 8px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
input, select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  min-width: 260px;
}
.muted { color: var(--text-secondary); }
.hint { margin-top: 6px; color: var(--text-secondary); font-size: 13px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.list { display: flex; flex-direction: column; gap: 10px; }
.list-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.list-main { min-width: 0; }
.title { font-weight: 800; color: var(--text-primary); }
.meta { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.chip {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
}
.btn-sm { padding: 8px 10px; font-size: 13px; }
</style>

