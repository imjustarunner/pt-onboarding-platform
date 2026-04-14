<template>
  <div class="ctlm">
    <div v-if="tenantTemplates.length || canWriteTenantLibrary" class="ctlm-section">
      <div class="ctlm-section-head">
        <div>
          <span class="ctlm-section-title">Summit Stats Challenge Library</span>
          <span class="ctlm-section-hint">Shared challenge templates for this Summit Stats tenant. Build once, then clone into any club library or apply them inside a season.</span>
        </div>
        <button v-if="canWriteTenantLibrary" type="button" class="btn btn-sm btn-secondary" @click="openTemplateModal('tenant')">
          + Add to Summit Stats Library
        </button>
      </div>

      <div v-if="tenantLoading" class="ctlm-hint">Loading Summit Stats challenge templates…</div>
      <div v-else-if="!tenantTemplates.length" class="ctlm-empty">
        No shared challenge templates yet.
        <template v-if="canWriteTenantLibrary"> Click “Add to Summit Stats Library” to create one.</template>
      </div>
      <div v-else class="ctlm-list">
        <div v-for="tpl in tenantTemplates" :key="`tenant-${tpl.id}`" class="ctlm-row">
          <div class="ctlm-row-main">
            <span class="ctlm-icon-shell">
              <img v-if="isLibraryIcon(tpl.icon) && resolvedIconUrl(tpl.icon)" :src="resolvedIconUrl(tpl.icon)" class="ctlm-icon-img" alt="" />
              <span v-else>{{ templateIcon(tpl) }}</span>
            </span>
            <div class="ctlm-row-copy">
              <div class="ctlm-title-line">
                <span class="ctlm-row-title">{{ tpl.name }}</span>
                <span class="ctlm-badge ctlm-badge--tenant">Summit Stats Library</span>
                <span v-if="primaryActivityLabel(tpl)" class="ctlm-badge">{{ primaryActivityLabel(tpl) }}</span>
                <span v-if="tpl.isSeasonLong" class="ctlm-badge">Season-long</span>
              </div>
              <span class="ctlm-row-meta">{{ templateMeta(tpl) }}</span>
              <p v-if="tpl.description" class="ctlm-row-description">{{ tpl.description }}</p>
            </div>
          </div>
          <div class="ctlm-row-actions">
            <button type="button" class="ctlm-action-btn" @click="cloneTenantTemplate(tpl)">Clone to My Library</button>
            <button v-if="canWriteTenantLibrary" type="button" class="ctlm-action-btn" @click="openTemplateModal('tenant', tpl)">Edit</button>
            <button v-if="canWriteTenantLibrary" type="button" class="ctlm-action-btn ctlm-action-btn--danger" @click="confirmDelete('tenant', tpl)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <div class="ctlm-section">
      <div class="ctlm-section-head">
        <div>
          <span class="ctlm-section-title">My Challenge Library</span>
          <span class="ctlm-section-hint">Reusable templates for this club. These show up in Manage Season → Weekly challenges.</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" @click="openTemplateModal('club')">
          + Add Challenge
        </button>
      </div>

      <div v-if="clubLoading" class="ctlm-hint">Loading club challenge templates…</div>
      <div v-else-if="!clubTemplates.length" class="ctlm-empty">
        No challenge templates saved yet. Create one here or clone from the Summit Stats library.
      </div>
      <div v-else class="ctlm-list">
        <div v-for="tpl in clubTemplates" :key="`club-${tpl.id}`" class="ctlm-row">
          <div class="ctlm-row-main">
            <span class="ctlm-icon-shell">
              <img v-if="isLibraryIcon(tpl.icon) && resolvedIconUrl(tpl.icon)" :src="resolvedIconUrl(tpl.icon)" class="ctlm-icon-img" alt="" />
              <span v-else>{{ templateIcon(tpl) }}</span>
            </span>
            <div class="ctlm-row-copy">
              <div class="ctlm-title-line">
                <span class="ctlm-row-title">{{ tpl.name }}</span>
                <span v-if="primaryActivityLabel(tpl)" class="ctlm-badge">{{ primaryActivityLabel(tpl) }}</span>
                <span v-if="tpl.isSeasonLong" class="ctlm-badge">Season-long</span>
              </div>
              <span class="ctlm-row-meta">{{ templateMeta(tpl) }}</span>
              <p v-if="tpl.description" class="ctlm-row-description">{{ tpl.description }}</p>
            </div>
          </div>
          <div class="ctlm-row-actions">
            <button type="button" class="ctlm-action-btn" @click="openTemplateModal('club', tpl)">Edit</button>
            <button type="button" class="ctlm-action-btn ctlm-action-btn--danger" @click="confirmDelete('club', tpl)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showTemplateModal" class="ctlm-modal-overlay" @click.self="closeTemplateModal">
      <div class="ctlm-modal ctlm-modal--wide">
        <div class="ctlm-modal-head">
          <h3>{{ editingTemplate ? `Edit ${scopeLabel(templateScope)}` : `New ${scopeLabel(templateScope)}` }}</h3>
          <button type="button" class="ctlm-close-btn" @click="closeTemplateModal">×</button>
        </div>

        <div class="ctlm-modal-body">
          <div class="ctlm-field-row">
            <div class="ctlm-field ctlm-field--narrow">
              <label class="ctlm-label">Icon</label>
              <div class="ctlm-icon-mode-tabs">
                <button type="button" :class="['ctlm-icon-tab', { active: !useLibraryIcon }]" @click="useLibraryIcon = false; showIconPicker = false">Emoji</button>
                <button type="button" :class="['ctlm-icon-tab', { active: useLibraryIcon }]" @click="useLibraryIcon = true; showIconPicker = false">Library</button>
              </div>

              <template v-if="!useLibraryIcon">
                <div class="ctlm-icon-cell" @click="showIconPicker = !showIconPicker">
                  <span class="ctlm-icon-preview">{{ templateForm.icon || '🏃' }}</span>
                  <span class="ctlm-icon-change">▾</span>
                </div>
                <div v-if="showIconPicker" class="ctlm-icon-grid">
                  <button
                    v-for="ic in ICONS"
                    :key="ic"
                    type="button"
                    class="ctlm-icon-opt"
                    :class="{ active: templateForm.icon === ic }"
                    @click="templateForm.icon = ic; showIconPicker = false"
                  >
                    {{ ic }}
                  </button>
                </div>
              </template>

              <template v-else>
                <IconSelector
                  :modelValue="libraryIconId"
                  :summitStatsClubId="props.clubId"
                  :context="`challenge-template-${props.clubId}-${templateScope}`"
                  @update:modelValue="onLibraryIconSelected"
                />
                <div v-if="libraryIconId && resolvedIconUrl(`icon:${libraryIconId}`)" class="ctlm-library-icon-preview">
                  <img :src="resolvedIconUrl(`icon:${libraryIconId}`)" class="ctlm-icon-img" alt="Selected icon" />
                </div>
              </template>
            </div>

            <div class="ctlm-field" style="flex:1">
              <label class="ctlm-label">Challenge title *</label>
              <input v-model="templateForm.name" type="text" class="ctlm-input" maxlength="255" placeholder="e.g. Trailblazer Sprint" />
            </div>
          </div>

          <div class="ctlm-field-row">
            <div class="ctlm-field">
              <label class="ctlm-label">Primary activity</label>
              <select v-model="templateForm.activityType" class="ctlm-select">
                <option value="">Choose activity</option>
                <option v-for="opt in ACTIVITY_TYPES" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
            <div class="ctlm-field">
              <label class="ctlm-label">Assignment</label>
              <select v-model="templateForm.mode" class="ctlm-select">
                <option value="volunteer_or_elect">Volunteer or Elect</option>
                <option value="captain_assigns">Captain Assigns</option>
                <option value="full_team">Full Team</option>
              </select>
            </div>
            <div class="ctlm-field">
              <label class="ctlm-label">Proof</label>
              <select v-model="templateForm.proofPolicy" class="ctlm-select">
                <option value="none">No proof required</option>
                <option value="photo_required">Photo required</option>
                <option value="gps_or_photo">GPS or photo proof</option>
                <option value="gps_required_no_treadmill">GPS required (no treadmill)</option>
                <option value="screenshot">Screenshot</option>
                <option value="manager_approval">Manager approval</option>
              </select>
            </div>
          </div>

          <div class="ctlm-field">
            <label class="ctlm-label">Description / AI seed</label>
            <textarea
              v-model="templateForm.description"
              rows="3"
              maxlength="4000"
              class="ctlm-textarea"
              placeholder="Describe the intended workout or challenge idea. This is the text you’ll reuse in season management or hand to the guided draft helper."
            ></textarea>
          </div>

          <div class="ctlm-inline-check">
            <label>
              <input v-model="templateForm.isSeasonLong" type="checkbox" />
              Season-long challenge
            </label>
            <label>
              <input v-model="templateForm.splitRunEnabled" type="checkbox" />
              Split-run example
            </label>
          </div>

          <div class="ctlm-field-row">
            <div class="ctlm-field">
              <label class="ctlm-label">Min distance (miles)</label>
              <input v-model.number="templateForm.minMiles" type="number" min="0" step="0.1" class="ctlm-input" placeholder="e.g. 3.1" />
            </div>
            <div class="ctlm-field">
              <label class="ctlm-label">Min duration (minutes)</label>
              <input v-model.number="templateForm.minMinutes" type="number" min="0" step="1" class="ctlm-input" placeholder="e.g. 30" />
            </div>
          </div>

          <div class="ctlm-field-hint">
            These templates feed the season weekly challenge picker. You can still tweak the full challenge criteria inside a specific season before publishing.
          </div>
        </div>

        <div class="ctlm-modal-footer">
          <span v-if="saveError" class="ctlm-error">{{ saveError }}</span>
          <button type="button" class="btn btn-secondary" @click="closeTemplateModal">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveTemplate">
            {{ saving ? 'Saving…' : (editingTemplate ? 'Save Changes' : 'Create Template') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirm" class="ctlm-modal-overlay" @click.self="deleteConfirm = null">
      <div class="ctlm-modal ctlm-modal--sm">
        <div class="ctlm-modal-head"><h3>Confirm Delete</h3></div>
        <div class="ctlm-modal-body">
          <p>Delete <strong>{{ deleteConfirm.name }}</strong> from {{ scopeLabel(deleteConfirm.scope) }}?</p>
        </div>
        <div class="ctlm-modal-footer">
          <button type="button" class="btn btn-secondary" @click="deleteConfirm = null">Cancel</button>
          <button type="button" class="btn btn-danger" :disabled="deleteLoading" @click="executeDelete">
            {{ deleteLoading ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import IconSelector from '../admin/IconSelector.vue';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  clubId: { type: [Number, String], default: null },
  tenantWriteEnabled: { type: Boolean, default: false },
  userRole: { type: String, default: '' }
});

const emit = defineEmits(['templates-updated']);

const ICONS = ['🏃', '🥾', '🌲', '🚴', '💪', '🔥', '⚡', '🎯', '🏔', '⭐', '👟', '🏆'];
const ACTIVITY_TYPES = ['Run', 'Trail Run', 'Ruck', 'Walk', 'Bike', 'Swim', 'Fitness', 'Other'];

const clubTemplates = ref([]);
const tenantTemplates = ref([]);
const clubLoading = ref(false);
const tenantLoading = ref(false);
const iconUrlCache = ref({});

const showTemplateModal = ref(false);
const editingTemplate = ref(null);
const templateScope = ref('club');
const templateForm = ref(defaultTemplateForm());
const saving = ref(false);
const saveError = ref('');
const showIconPicker = ref(false);
const useLibraryIcon = ref(false);
const libraryIconId = ref(null);
const deleteConfirm = ref(null);
const deleteLoading = ref(false);

const canWriteTenantLibrary = computed(() =>
  props.userRole === 'super_admin' ||
  props.userRole === 'club_manager' ||
  props.tenantWriteEnabled
);

function defaultCriteria() {
  return {
    challengeType: '',
    activityTypes: [],
    distance: { minMiles: null },
    duration: { minMinutes: null },
    splitRuns: { count: 2, minSeparationMinutes: 60 }
  };
}

function defaultTemplateForm() {
  return {
    name: '',
    description: '',
    icon: '🏃',
    activityType: '',
    mode: 'volunteer_or_elect',
    proofPolicy: 'none',
    isSeasonLong: false,
    minMiles: null,
    minMinutes: null,
    splitRunEnabled: false,
    criteriaJson: defaultCriteria()
  };
}

function isLibraryIcon(icon) {
  return typeof icon === 'string' && icon.startsWith('icon:');
}

function resolvedIconUrl(iconRef) {
  if (!isLibraryIcon(iconRef)) return null;
  const id = Number.parseInt(String(iconRef).replace('icon:', ''), 10);
  if (!id) return null;
  if (iconUrlCache.value[id]) return iconUrlCache.value[id];
  api.get(`/icons/${id}`).then(({ data }) => {
    const raw = data?.url || data?.file_path || null;
    if (raw) iconUrlCache.value[id] = toUploadsUrl(raw) || raw;
  }).catch(() => {});
  return null;
}

function templateIcon(tpl) {
  if (tpl?.icon && !isLibraryIcon(tpl.icon)) return tpl.icon;
  switch (primaryActivityLabel(tpl)) {
    case 'Ruck': return '🥾';
    case 'Trail Run': return '🌲';
    case 'Walk': return '👟';
    case 'Bike': return '🚴';
    case 'Fitness': return '💪';
    default: return '🏃';
  }
}

function primaryActivityLabel(tpl) {
  if (tpl?.activityType) return tpl.activityType;
  const list = Array.isArray(tpl?.criteriaJson?.activityTypes) ? tpl.criteriaJson.activityTypes : [];
  return list[0] || '';
}

function modeLabel(mode) {
  return ({
    volunteer_or_elect: 'Volunteer or Elect',
    captain_assigns: 'Captain Assigns',
    full_team: 'Full Team'
  })[String(mode || '')] || 'Volunteer or Elect';
}

function proofLabel(proof) {
  return ({
    none: 'No proof',
    photo_required: 'Photo required',
    gps_or_photo: 'GPS or photo',
    gps_required_no_treadmill: 'GPS only',
    screenshot: 'Screenshot',
    manager_approval: 'Manager approval'
  })[String(proof || '')] || 'No proof';
}

function templateMeta(tpl) {
  const parts = [modeLabel(tpl.mode), proofLabel(tpl.proofPolicy)];
  const crit = tpl.criteriaJson || {};
  if (crit?.distance?.minMiles) parts.push(`>= ${Number(crit.distance.minMiles)} mi`);
  if (crit?.duration?.minMinutes) parts.push(`>= ${Number(crit.duration.minMinutes)} min`);
  if (crit?.splitRuns?.count > 1) parts.push(`${crit.splitRuns.count} split workouts`);
  return parts.join(' · ');
}

function scopeLabel(scope) {
  return scope === 'tenant' ? 'Summit Stats Library' : 'My Library';
}

async function loadClubTemplates() {
  if (!props.clubId) return;
  clubLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/challenge-templates`);
    clubTemplates.value = Array.isArray(data?.templates) ? data.templates : [];
    emit('templates-updated', { club: clubTemplates.value, tenant: tenantTemplates.value });
  } catch {
    clubTemplates.value = [];
  } finally {
    clubLoading.value = false;
  }
}

async function loadTenantTemplates() {
  if (!props.clubId) return;
  tenantLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/tenant-challenge-templates`);
    tenantTemplates.value = Array.isArray(data?.templates) ? data.templates : [];
    emit('templates-updated', { club: clubTemplates.value, tenant: tenantTemplates.value });
  } catch {
    tenantTemplates.value = [];
  } finally {
    tenantLoading.value = false;
  }
}

async function loadTemplates() {
  await Promise.all([loadClubTemplates(), loadTenantTemplates()]);
}

function onLibraryIconSelected(iconId) {
  libraryIconId.value = iconId;
  templateForm.value.icon = iconId ? `icon:${iconId}` : '🏃';
}

function formFromTemplate(tpl) {
  const criteria = tpl?.criteriaJson && typeof tpl.criteriaJson === 'object'
    ? {
        ...defaultCriteria(),
        ...tpl.criteriaJson,
        distance: { minMiles: tpl.criteriaJson?.distance?.minMiles ?? null },
        duration: { minMinutes: tpl.criteriaJson?.duration?.minMinutes ?? null },
        splitRuns: tpl.criteriaJson?.splitRuns || { count: 2, minSeparationMinutes: 60 }
      }
    : defaultCriteria();
  return {
    name: tpl?.name || '',
    description: tpl?.description || '',
    icon: tpl?.icon || '🏃',
    activityType: tpl?.activityType || primaryActivityLabel(tpl) || '',
    mode: tpl?.mode || 'volunteer_or_elect',
    proofPolicy: tpl?.proofPolicy || 'none',
    isSeasonLong: !!tpl?.isSeasonLong,
    minMiles: criteria?.distance?.minMiles ?? null,
    minMinutes: criteria?.duration?.minMinutes ?? null,
    splitRunEnabled: !!(criteria?.splitRuns?.count > 1),
    criteriaJson: criteria
  };
}

function buildCriteriaPayload() {
  const criteria = {
    ...(templateForm.value.criteriaJson || {})
  };
  if (templateForm.value.activityType) {
    criteria.activityTypes = [templateForm.value.activityType];
  } else if (!Array.isArray(criteria.activityTypes)) {
    criteria.activityTypes = [];
  }
  criteria.distance = templateForm.value.minMiles ? { minMiles: Number(templateForm.value.minMiles) } : undefined;
  criteria.duration = templateForm.value.minMinutes ? { minMinutes: Number(templateForm.value.minMinutes) } : undefined;
  if (templateForm.value.splitRunEnabled) {
    criteria.splitRuns = criteria.splitRuns?.count > 1 ? criteria.splitRuns : { count: 2, minSeparationMinutes: 60 };
  } else {
    delete criteria.splitRuns;
  }
  if (!criteria.activityTypes?.length) delete criteria.activityTypes;
  if (!criteria.distance?.minMiles) delete criteria.distance;
  if (!criteria.duration?.minMinutes) delete criteria.duration;
  return Object.keys(criteria).length ? criteria : null;
}

function openTemplateModal(scope, tpl = null) {
  templateScope.value = scope;
  editingTemplate.value = tpl;
  templateForm.value = tpl ? formFromTemplate(tpl) : defaultTemplateForm();
  useLibraryIcon.value = isLibraryIcon(templateForm.value.icon);
  libraryIconId.value = useLibraryIcon.value ? Number.parseInt(String(templateForm.value.icon).replace('icon:', ''), 10) || null : null;
  saveError.value = '';
  showIconPicker.value = false;
  showTemplateModal.value = true;
}

function closeTemplateModal() {
  showTemplateModal.value = false;
  editingTemplate.value = null;
  templateForm.value = defaultTemplateForm();
  saveError.value = '';
}

async function saveTemplate() {
  if (!props.clubId) return;
  if (!String(templateForm.value.name || '').trim()) {
    saveError.value = 'Challenge title is required.';
    return;
  }
  saving.value = true;
  saveError.value = '';
  const payload = {
    name: templateForm.value.name.trim(),
    description: String(templateForm.value.description || '').trim() || null,
    icon: templateForm.value.icon || null,
    activityType: templateForm.value.activityType || null,
    mode: templateForm.value.mode,
    proofPolicy: templateForm.value.proofPolicy,
    isSeasonLong: templateForm.value.isSeasonLong,
    criteriaJson: buildCriteriaPayload()
  };
  const isTenant = templateScope.value === 'tenant';
  const basePath = isTenant
    ? `/summit-stats/clubs/${props.clubId}/tenant-challenge-templates`
    : `/summit-stats/clubs/${props.clubId}/challenge-templates`;
  try {
    if (editingTemplate.value?.id) {
      await api.put(`${basePath}/${editingTemplate.value.id}`, payload);
    } else {
      await api.post(basePath, payload);
    }
    await loadTemplates();
    closeTemplateModal();
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Failed to save challenge template.';
  } finally {
    saving.value = false;
  }
}

async function cloneTenantTemplate(tpl) {
  if (!props.clubId || !tpl?.id) return;
  try {
    await api.post(`/summit-stats/clubs/${props.clubId}/challenge-templates/clone-from-tenant/${tpl.id}`);
    await loadClubTemplates();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to clone challenge template.');
  }
}

function confirmDelete(scope, tpl) {
  deleteConfirm.value = { scope, id: tpl.id, name: tpl.name };
}

async function executeDelete() {
  if (!props.clubId || !deleteConfirm.value) return;
  deleteLoading.value = true;
  try {
    const basePath = deleteConfirm.value.scope === 'tenant'
      ? `/summit-stats/clubs/${props.clubId}/tenant-challenge-templates/${deleteConfirm.value.id}`
      : `/summit-stats/clubs/${props.clubId}/challenge-templates/${deleteConfirm.value.id}`;
    await api.delete(basePath);
    deleteConfirm.value = null;
    await loadTemplates();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to delete challenge template.');
  } finally {
    deleteLoading.value = false;
  }
}

watch(() => props.clubId, (id) => {
  if (id) loadTemplates();
  else {
    clubTemplates.value = [];
    tenantTemplates.value = [];
  }
}, { immediate: false });

onMounted(() => {
  if (props.clubId) loadTemplates();
});

defineExpose({ loadTemplates });
</script>

<style scoped>
.ctlm {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ctlm-section {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  padding: 18px;
}
.ctlm-section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.ctlm-section-title {
  display: block;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}
.ctlm-section-hint {
  display: block;
  margin-top: 4px;
  font-size: 0.86rem;
  color: #64748b;
  max-width: 760px;
}
.ctlm-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ctlm-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid #dbe3ef;
  border-radius: 14px;
  background: #fff;
}
.ctlm-row-main {
  display: flex;
  gap: 12px;
  min-width: 0;
}
.ctlm-row-copy {
  min-width: 0;
}
.ctlm-title-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.ctlm-row-title {
  font-weight: 700;
  color: #0f172a;
}
.ctlm-row-meta {
  display: block;
  margin-top: 4px;
  font-size: 0.84rem;
  color: #475569;
}
.ctlm-row-description {
  margin: 8px 0 0;
  color: #334155;
  font-size: 0.9rem;
  white-space: pre-wrap;
}
.ctlm-row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 8px;
}
.ctlm-icon-shell {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%);
  border: 1px solid #bfdbfe;
  font-size: 1.35rem;
  flex-shrink: 0;
  overflow: hidden;
}
.ctlm-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ctlm-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 0.72rem;
  font-weight: 700;
}
.ctlm-badge--tenant {
  background: #e0f2fe;
  color: #0369a1;
}
.ctlm-action-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.84rem;
  cursor: pointer;
}
.ctlm-action-btn--danger {
  color: #b91c1c;
  border-color: #fecaca;
}
.ctlm-hint,
.ctlm-empty {
  color: #64748b;
  font-size: 0.9rem;
}
.ctlm-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}
.ctlm-modal {
  width: min(720px, 100%);
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}
.ctlm-modal--sm {
  width: min(420px, 100%);
}
.ctlm-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 0;
}
.ctlm-close-btn {
  border: 0;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  color: #64748b;
}
.ctlm-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
}
.ctlm-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 20px;
}
.ctlm-field-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.ctlm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 180px;
}
.ctlm-field--narrow {
  flex: 0 0 160px;
}
.ctlm-label {
  font-size: 0.84rem;
  font-weight: 700;
  color: #334155;
}
.ctlm-input,
.ctlm-select,
.ctlm-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 0.92rem;
}
.ctlm-inline-check {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 0.88rem;
  color: #475569;
}
.ctlm-inline-check label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ctlm-field-hint {
  font-size: 0.8rem;
  color: #64748b;
}
.ctlm-error {
  margin-right: auto;
  color: #b91c1c;
  font-size: 0.84rem;
}
.ctlm-icon-mode-tabs {
  display: inline-flex;
  gap: 6px;
}
.ctlm-icon-tab {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}
.ctlm-icon-tab.active {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.ctlm-icon-cell {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.ctlm-icon-preview {
  font-size: 1.4rem;
}
.ctlm-icon-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.ctlm-icon-opt {
  border: 1px solid #dbe3ef;
  background: #fff;
  border-radius: 10px;
  padding: 8px;
  font-size: 1.1rem;
  cursor: pointer;
}
.ctlm-icon-opt.active {
  background: #eff6ff;
  border-color: #93c5fd;
}
.ctlm-library-icon-preview {
  width: 48px;
  height: 48px;
  margin-top: 8px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #dbe3ef;
}
@media (max-width: 720px) {
  .ctlm-row,
  .ctlm-section-head {
    flex-direction: column;
  }
  .ctlm-row-actions {
    justify-content: flex-start;
  }
}
</style>
