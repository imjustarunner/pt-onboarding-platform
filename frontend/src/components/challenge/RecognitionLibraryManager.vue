<template>
  <div class="rlm">

    <!-- ════════════════════════════════════════════════════════════
         TENANT AWARD LIBRARY
    ══════════════════════════════════════════════════════════════ -->
    <div v-if="hasTenantAwards || canWriteTenantLibrary" class="rlm-section">
      <div class="rlm-section-head">
        <div>
          <span class="rlm-section-title">Tenant Award Library</span>
          <span class="rlm-section-hint">Shared award templates available to all clubs. Clone to add to your library.</span>
        </div>
        <button v-if="canWriteTenantLibrary" type="button" class="btn btn-sm btn-secondary"
          @click="openTenantAwardModal()">
          + Add to Tenant Library
        </button>
      </div>

      <div v-if="tenantAwardsLoading" class="rlm-hint">Loading tenant awards…</div>
      <div v-else-if="!tenantAwards.length" class="rlm-empty">
        No tenant awards yet.
        <template v-if="canWriteTenantLibrary"> Click "Add to Tenant Library" to create one.</template>
      </div>
      <div v-else class="rlm-list">
        <div v-for="ta in tenantAwards" :key="ta.id" class="rlm-row">
          <div class="rlm-row-main">
            <span class="rlm-award-icon">
              <template v-if="isLibraryIcon(ta.icon)">
                <img :src="resolvedIconUrl(ta.icon)" class="rlm-award-icon-img" alt="" />
              </template>
              <template v-else>{{ ta.icon }}</template>
            </span>
            <div>
              <span class="rlm-row-title">
                {{ ta.label }}
                <span class="rlm-tenant-badge">Tenant</span>
              </span>
              <span class="rlm-row-meta">
                {{ periodLabel(ta.period) }} · {{ metricLabel(ta.metric) }} · {{ aggregationLabel(ta.aggregation) }}
                <template v-if="ta.activityType"> · {{ ta.activityType }}</template>
              </span>
            </div>
          </div>
          <div class="rlm-row-actions">
            <button type="button" class="rlm-action-btn" @click="cloneTenantAward(ta)">Clone to My Library</button>
            <button v-if="canWriteTenantLibrary" type="button" class="rlm-action-btn" @click="openTenantAwardModal(ta)">Edit</button>
            <button v-if="canWriteTenantLibrary" type="button" class="rlm-action-btn rlm-action-btn--danger" @click="confirmDeleteTenantAward(ta)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tenant Award Modal -->
    <div v-if="showTenantAwardModal" class="rlm-modal-overlay" @click.self="closeTenantAwardModal">
      <div class="rlm-modal rlm-modal--wide">
        <div class="rlm-modal-head">
          <h3>{{ editingTenantAward ? 'Edit Tenant Award' : 'New Tenant Award' }}</h3>
          <button type="button" class="rlm-close-btn" @click="closeTenantAwardModal">×</button>
        </div>
        <div class="rlm-modal-body">
          <div class="rlm-field-row">
            <!-- Icon picker -->
            <div class="rlm-field rlm-field--narrow">
              <label class="rlm-label">Icon</label>
              <div class="rlm-icon-mode-tabs">
                <button type="button" :class="['rlm-icon-tab', { active: !tenantUseLibraryIcon }]" @click="tenantUseLibraryIcon = false">Emoji</button>
                <button type="button" :class="['rlm-icon-tab', { active: tenantUseLibraryIcon }]" @click="tenantUseLibraryIcon = true">Library</button>
              </div>
              <template v-if="!tenantUseLibraryIcon">
                <div class="rlm-icon-cell" @click="showTenantIconPicker = !showTenantIconPicker">
                  <span class="rlm-icon-preview">{{ tenantAwardForm.icon || '🏆' }}</span>
                  <span class="rlm-icon-change">▾</span>
                </div>
                <div v-if="showTenantIconPicker" class="rlm-icon-grid">
                  <button v-for="ic in ICONS" :key="ic" type="button"
                    class="rlm-icon-opt" :class="{ active: tenantAwardForm.icon === ic }"
                    @click="tenantAwardForm.icon = ic; showTenantIconPicker = false">
                    {{ ic }}
                  </button>
                </div>
              </template>
              <template v-else>
                <IconSelector
                  :modelValue="tenantLibraryIconId"
                  :summitStatsClubId="props.clubId"
                  :context="`tenant-award-${props.clubId}`"
                  @update:modelValue="onTenantLibraryIconSelected"
                />
              </template>
            </div>
            <div class="rlm-field" style="flex:1">
              <label class="rlm-label">Award title *</label>
              <input v-model="tenantAwardForm.label" type="text" class="rlm-input" placeholder="Award title" maxlength="128" />
            </div>
          </div>
          <div class="rlm-field-row">
            <div class="rlm-field">
              <label class="rlm-label">Period</label>
              <select v-model="tenantAwardForm.period" class="rlm-select">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="season">Full Season</option>
              </select>
            </div>
            <div class="rlm-field">
              <label class="rlm-label">Metric</label>
              <select v-model="tenantAwardForm.metric" class="rlm-select">
                <option value="distance_miles">Miles</option>
                <option value="points">Points</option>
                <option value="duration_minutes">Duration (min)</option>
                <option value="activities_count">Activity count</option>
              </select>
            </div>
            <div class="rlm-field">
              <label class="rlm-label">Winner by</label>
              <select v-model="tenantAwardForm.aggregation" class="rlm-select">
                <option value="most">Most (total)</option>
                <option value="average">Average per entry</option>
              </select>
            </div>
          </div>
          <div class="rlm-field">
            <label class="rlm-label">Activity type</label>
            <input v-model="tenantAwardForm.activityType" type="text" class="rlm-input" placeholder="Any (leave blank)" maxlength="64" />
          </div>
        </div>
        <div class="rlm-modal-footer">
          <span v-if="tenantAwardSaveError" class="rlm-error">{{ tenantAwardSaveError }}</span>
          <button type="button" class="btn btn-secondary" @click="closeTenantAwardModal">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="tenantAwardSaving" @click="saveTenantAward">
            {{ tenantAwardSaving ? 'Saving…' : (editingTenantAward ? 'Save Changes' : 'Create Award') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tenant Award delete confirmation -->
    <div v-if="tenantDeleteConfirm" class="rlm-modal-overlay" @click.self="tenantDeleteConfirm = null">
      <div class="rlm-modal rlm-modal--sm">
        <div class="rlm-modal-head"><h3>Confirm Delete</h3></div>
        <div class="rlm-modal-body"><p>Delete tenant award <strong>{{ tenantDeleteConfirm.label }}</strong>?</p></div>
        <div class="rlm-modal-footer">
          <button type="button" class="btn btn-secondary" @click="tenantDeleteConfirm = null">Cancel</button>
          <button type="button" class="btn btn-danger" :disabled="tenantDeleteLoading" @click="executeTenantDelete">
            {{ tenantDeleteLoading ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════
         ELIGIBILITY GROUPS
    ══════════════════════════════════════════════════════════════ -->
    <div class="rlm-section">
      <div class="rlm-section-head">
        <div>
          <span class="rlm-section-title">Eligibility Groups</span>
          <span class="rlm-section-hint">Reusable groups (e.g. Juniors, Sprinters) you can apply to any award.</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" @click="openGroupModal()">
          + Add Group
        </button>
      </div>

      <div v-if="groupsLoading" class="rlm-hint">Loading groups…</div>
      <div v-else-if="!groups.length" class="rlm-empty">
        No custom eligibility groups saved yet. Click "Add Group" to create one.
      </div>
      <div v-else class="rlm-list">
        <div v-for="g in groups" :key="g.id" class="rlm-row">
          <div class="rlm-row-main">
            <span class="rlm-row-title">{{ g.label }}</span>
            <span class="rlm-row-meta">{{ formatCriteria(g.criteria) }}</span>
          </div>
          <div class="rlm-row-actions">
            <button type="button" class="rlm-action-btn" @click="openGroupModal(g)">Edit</button>
            <button type="button" class="rlm-action-btn rlm-action-btn--danger" @click="confirmDeleteGroup(g)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════
         RECOGNITION AWARDS LIBRARY
    ══════════════════════════════════════════════════════════════ -->
    <div class="rlm-section">
      <div class="rlm-section-head">
        <div>
          <span class="rlm-section-title">Recognition Awards Library</span>
          <span class="rlm-section-hint">Saved award templates you can reuse across seasons.</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" @click="openAwardModal()">
          + Add Award
        </button>
      </div>

      <div v-if="awardsLoading" class="rlm-hint">Loading awards…</div>
      <div v-else-if="!awards.length" class="rlm-empty">
        No recognition awards saved yet. Click "Add Award" or use "Save to library" on a season award.
      </div>
      <div v-else class="rlm-list">
        <div v-for="a in awards" :key="a.id" class="rlm-row">
          <div class="rlm-row-main">
            <span class="rlm-award-icon">
              <template v-if="isLibraryIcon(a.icon)">
                <img :src="resolvedIconUrl(a.icon)" class="rlm-award-icon-img" alt="" />
              </template>
              <template v-else>{{ a.icon }}</template>
            </span>
            <div>
              <span class="rlm-row-title">{{ a.label }}</span>
              <span class="rlm-row-meta">
                {{ periodLabel(a.period) }} · {{ metricLabel(a.metric) }} · {{ aggregationLabel(a.aggregation) }}
                <template v-if="a.activityType"> · {{ a.activityType }}</template>
              <template v-if="a.monthEndDay && a.period === 'monthly'"> · ends day {{ a.monthEndDay }}</template>
                <template v-if="a.groupFilter"> · {{ groupFilterLabel(a.groupFilter) }}</template>
              </span>
            </div>
          </div>
          <div class="rlm-row-actions">
            <button type="button" class="rlm-action-btn" @click="openAwardModal(a)">Edit</button>
            <button type="button" class="rlm-action-btn rlm-action-btn--danger" @click="confirmDeleteAward(a)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════
         GROUP MODAL
    ══════════════════════════════════════════════════════════════ -->
    <div v-if="showGroupModal" class="rlm-modal-overlay" @click.self="closeGroupModal">
      <div class="rlm-modal">
        <div class="rlm-modal-head">
          <h3>{{ editingGroup ? 'Edit Group' : 'New Eligibility Group' }}</h3>
          <button type="button" class="rlm-close-btn" @click="closeGroupModal">×</button>
        </div>

        <div class="rlm-modal-body">
          <div class="rlm-field">
            <label class="rlm-label">Group name *</label>
            <input v-model="groupForm.label" type="text" class="rlm-input"
              placeholder="e.g. Juniors, Sprinters, Youth" maxlength="128" />
          </div>

          <div class="rlm-field">
            <label class="rlm-label">Criteria</label>
            <div v-for="(crit, ci) in groupForm.criteria" :key="ci" class="rlm-crit-row">
              <select v-model="crit.field" class="rlm-select">
                <option value="age">Age (years)</option>
                <option value="weight_lbs">Weight (lbs)</option>
                <option value="height_inches">Height (inches)</option>
                <option v-for="cf in customFieldDefs" :key="cf.id" :value="`custom_${cf.id}`">
                  {{ cf.label }} ({{ cf.unit_label || cf.field_type }})
                </option>
              </select>
              <select v-model="crit.operator" class="rlm-select rlm-select--xs">
                <option value="lte">≤ at most</option>
                <option value="gte">≥ at least</option>
              </select>
              <input v-model.number="crit.value" type="number" class="rlm-crit-val" placeholder="Value" />
              <button type="button" class="rlm-remove-btn" @click="groupForm.criteria.splice(ci, 1)">×</button>
            </div>
            <button type="button" class="rlm-text-btn" @click="groupForm.criteria.push({ field: 'age', operator: 'lte', value: null })">
              + criterion
            </button>
          </div>
        </div>

        <div class="rlm-modal-footer">
          <span v-if="groupSaveError" class="rlm-error">{{ groupSaveError }}</span>
          <button type="button" class="btn btn-secondary" @click="closeGroupModal">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="groupSaving" @click="saveGroup">
            {{ groupSaving ? 'Saving…' : (editingGroup ? 'Save Changes' : 'Create Group') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════
         AWARD MODAL
    ══════════════════════════════════════════════════════════════ -->
    <div v-if="showAwardModal" class="rlm-modal-overlay" @click.self="closeAwardModal">
      <div class="rlm-modal rlm-modal--wide">
        <div class="rlm-modal-head">
          <h3>{{ editingAward ? 'Edit Award' : 'New Recognition Award' }}</h3>
          <button type="button" class="rlm-close-btn" @click="closeAwardModal">×</button>
        </div>

        <div class="rlm-modal-body">
          <div class="rlm-field-row">
            <!-- Icon picker -->
            <div class="rlm-field rlm-field--narrow">
              <label class="rlm-label">Icon</label>

              <!-- Toggle between emoji and library icon -->
              <div class="rlm-icon-mode-tabs">
                <button type="button"
                  :class="['rlm-icon-tab', { active: !useLibraryIcon }]"
                  @click="useLibraryIcon = false; showIconPicker = false">
                  Emoji
                </button>
                <button type="button"
                  :class="['rlm-icon-tab', { active: useLibraryIcon }]"
                  @click="useLibraryIcon = true; showIconPicker = false">
                  Library
                </button>
              </div>

              <!-- Emoji picker -->
              <template v-if="!useLibraryIcon">
                <div class="rlm-icon-cell" @click="showIconPicker = !showIconPicker">
                  <span class="rlm-icon-preview">{{ emojiPreview }}</span>
                  <span class="rlm-icon-change">▾</span>
                </div>
                <div v-if="showIconPicker" class="rlm-icon-grid">
                  <button v-for="ic in ICONS" :key="ic" type="button"
                    class="rlm-icon-opt" :class="{ active: awardForm.icon === ic }"
                    @click="awardForm.icon = ic; showIconPicker = false">
                    {{ ic }}
                  </button>
                </div>
              </template>

              <!-- Library icon picker using IconSelector -->
              <template v-else>
                <IconSelector
                  :modelValue="libraryIconId"
                  :summitStatsClubId="props.clubId"
                  :context="`recognition-award-${props.clubId}`"
                  @update:modelValue="onLibraryIconSelected"
                />
                <div v-if="libraryIconId" class="rlm-library-icon-preview">
                  <img :src="resolvedIconUrl(`icon:${libraryIconId}`)" class="rlm-award-icon-img" alt="Selected icon" />
                </div>
              </template>
            </div>
            <!-- Title -->
            <div class="rlm-field" style="flex:1">
              <label class="rlm-label">Award title *</label>
              <input v-model="awardForm.label" type="text" class="rlm-input"
                placeholder="e.g. Sasquatch, Iron Miles, Trail Blazer" maxlength="128" />
            </div>
          </div>

          <div class="rlm-field-row">
            <div class="rlm-field">
              <label class="rlm-label">Period</label>
              <select v-model="awardForm.period" class="rlm-select">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="season">Full Season</option>
              </select>
            </div>
            <div v-if="awardForm.period === 'monthly'" class="rlm-field">
              <label class="rlm-label">Month ends</label>
              <select v-model="awardForm.monthEndDay" class="rlm-select">
                <option value="last">Last day of month</option>
                <option v-for="d in 28" :key="d" :value="d">Day {{ d }}</option>
              </select>
            </div>
            <div class="rlm-field">
              <label class="rlm-label">Metric</label>
              <select v-model="awardForm.metric" class="rlm-select">
                <option value="distance_miles">Miles</option>
                <option value="points">Points</option>
                <option value="duration_minutes">Duration (min)</option>
                <option value="activities_count">Activity count</option>
              </select>
            </div>
            <div class="rlm-field">
              <label class="rlm-label">Winner by</label>
              <select v-model="awardForm.aggregation" class="rlm-select">
                <option value="most">Most (total)</option>
                <option value="least">Least (total)</option>
                <option value="average">Average per entry</option>
                <option value="best_single">Best single workout</option>
                <option value="best_day">Best single day</option>
              </select>
            </div>
          </div>

          <div class="rlm-field-row">
            <div class="rlm-field">
              <label class="rlm-label">Activity type</label>
              <input v-model="awardForm.activityType" type="text" class="rlm-input"
                placeholder="Any (leave blank)" maxlength="64" />
              <span class="rlm-field-hint">e.g. trail_run, cycling — leave blank for all</span>
            </div>
            <div class="rlm-field">
              <label class="rlm-label">Eligible group</label>
              <select v-model="awardForm.groupFilter" class="rlm-select">
                <option value="">Everyone</option>
                <option value="gender_male">Male</option>
                <option value="gender_female">Female</option>
                <option value="masters">Masters</option>
                <option value="heavyweight_male">Heavyweight — Male</option>
                <option value="heavyweight_female">Heavyweight — Female</option>
                <option v-for="g in groups" :key="g.id" :value="`group_${g.id}`">
                  {{ g.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div class="rlm-modal-footer">
          <span v-if="awardSaveError" class="rlm-error">{{ awardSaveError }}</span>
          <button type="button" class="btn btn-secondary" @click="closeAwardModal">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="awardSaving" @click="saveAward">
            {{ awardSaving ? 'Saving…' : (editingAward ? 'Save Changes' : 'Create Award') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div v-if="deleteConfirm" class="rlm-modal-overlay" @click.self="deleteConfirm = null">
      <div class="rlm-modal rlm-modal--sm">
        <div class="rlm-modal-head">
          <h3>Confirm Delete</h3>
        </div>
        <div class="rlm-modal-body">
          <p>Delete <strong>{{ deleteConfirm.label }}</strong>? This cannot be undone.</p>
        </div>
        <div class="rlm-modal-footer">
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
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import IconSelector from '../admin/IconSelector.vue';

const props = defineProps({
  clubId: { type: [Number, String], default: null },
  customFieldDefs: { type: Array, default: () => [] },
  /** Whether the superadmin has enabled the temp manager write flag for the tenant library */
  tenantWriteEnabled: { type: Boolean, default: false },
  /** The logged-in user's role */
  userRole: { type: String, default: '' }
});

// ── Icon URL resolution ────────────────────────────────────────────
const iconUrlCache = ref({});  // iconId -> url

function isLibraryIcon(icon) {
  return typeof icon === 'string' && icon.startsWith('icon:');
}

function resolvedIconUrl(iconRef) {
  if (!isLibraryIcon(iconRef)) return null;
  const id = parseInt(iconRef.replace('icon:', ''), 10);
  if (!id) return null;
  if (iconUrlCache.value[id]) return iconUrlCache.value[id];
  // Fetch asynchronously and cache
  api.get(`/icons/${id}`).then(({ data }) => {
    if (data?.url) iconUrlCache.value[id] = data.url;
    else if (data?.file_path) iconUrlCache.value[id] = `/uploads/${data.file_path}`.replace('/uploads/uploads/', '/uploads/');
  }).catch(() => {});
  return null;
}

const emit = defineEmits(['groups-updated', 'awards-updated']);

// ── Icon set ──────────────────────────────────────────────────────
const ICONS = [
  '🏆','🥇','🥈','🥉','⭐','🌟','💪','🔥','⚡','🎯',
  '🏅','🎖','🦁','🦅','🐺','🦊','🦋','🌊','🏔','🌲',
  '⛰','🚵','🏃','🚴','🎽','👟','🩺','🧠','💎','👑'
];

// ── State ─────────────────────────────────────────────────────────
const groups       = ref([]);
const groupsLoading = ref(false);

const awards       = ref([]);
const awardsLoading = ref(false);

// Tenant library state
const tenantAwards       = ref([]);
const tenantAwardsLoading = ref(false);
const tenantAgencyId     = ref(null);

const showTenantAwardModal = ref(false);
const editingTenantAward   = ref(null);
const tenantAwardForm      = ref(defaultTenantAwardForm());
const tenantAwardSaving    = ref(false);
const tenantAwardSaveError = ref('');
const showTenantIconPicker = ref(false);
const tenantUseLibraryIcon = ref(false);
const tenantLibraryIconId  = ref(null);
const tenantDeleteConfirm  = ref(null);
const tenantDeleteLoading  = ref(false);

const canWriteTenantLibrary = computed(() =>
  props.userRole === 'super_admin' || props.tenantWriteEnabled
);

const hasTenantAwards = computed(() => tenantAwards.value.length > 0);

// Group modal
const showGroupModal = ref(false);
const editingGroup   = ref(null);
const groupForm      = ref({ label: '', criteria: [] });
const groupSaving    = ref(false);
const groupSaveError = ref('');

// Award modal
const showAwardModal  = ref(false);
const editingAward    = ref(null);
const awardForm       = ref(defaultAwardForm());
const awardSaving     = ref(false);
const awardSaveError  = ref('');
const showIconPicker  = ref(false);
const useLibraryIcon  = ref(false);
const libraryIconId   = ref(null);

// Emoji preview when in emoji mode
const emojiPreview = computed(() => {
  if (isLibraryIcon(awardForm.value.icon)) return '🏆';
  return awardForm.value.icon || '🏆';
});

function onLibraryIconSelected(iconId) {
  libraryIconId.value = iconId;
  awardForm.value.icon = iconId ? `icon:${iconId}` : '🏆';
  // Pre-cache the URL
  if (iconId) {
    api.get(`/icons/${iconId}`).then(({ data }) => {
      if (data?.url) iconUrlCache.value[iconId] = data.url;
      else if (data?.file_path) iconUrlCache.value[iconId] = `/uploads/${data.file_path}`.replace('/uploads/uploads/', '/uploads/');
    }).catch(() => {});
  }
}

// (variants removed — gender is now an eligible group)

// Delete confirm
const deleteConfirm  = ref(null);  // { type: 'group'|'award', id, label }
const deleteLoading  = ref(false);

function defaultTenantAwardForm() {
  return { label: '', icon: '🏆', period: 'weekly', metric: 'distance_miles', aggregation: 'most', activityType: '' };
}

// ── Load ──────────────────────────────────────────────────────────
async function loadTenantAwards() {
  if (!props.clubId) return;
  tenantAwardsLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/tenant-awards`);
    tenantAwards.value = Array.isArray(data?.awards) ? data.awards : [];
    tenantAgencyId.value = data?.tenantAgencyId || null;
  } catch {
    tenantAwards.value = [];
  } finally {
    tenantAwardsLoading.value = false;
  }
}

async function loadGroups() {
  if (!props.clubId) return;
  groupsLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/eligibility-groups`);
    groups.value = Array.isArray(data?.groups) ? data.groups : [];
    emit('groups-updated', groups.value);
  } catch {
    groups.value = [];
  } finally {
    groupsLoading.value = false;
  }
}

async function loadAwards() {
  if (!props.clubId) return;
  awardsLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/recognition-awards`);
    awards.value = Array.isArray(data?.awards) ? data.awards : [];
    emit('awards-updated', awards.value);
  } catch {
    awards.value = [];
  } finally {
    awardsLoading.value = false;
  }
}

watch(() => props.clubId, (id) => {
  if (id) { loadGroups(); loadAwards(); loadTenantAwards(); }
  else { groups.value = []; awards.value = []; tenantAwards.value = []; }
}, { immediate: false });

onMounted(() => { if (props.clubId) { loadGroups(); loadAwards(); loadTenantAwards(); } });

// expose for parent to refresh after "save to library"
defineExpose({ loadAwards, loadGroups, loadTenantAwards, awards, groups, tenantAwards });

// ── Group modal ───────────────────────────────────────────────────
function openGroupModal(g = null) {
  editingGroup.value = g;
  groupForm.value = g
    ? { label: g.label, criteria: JSON.parse(JSON.stringify(g.criteria || [])) }
    : { label: '', criteria: [] };
  groupSaveError.value = '';
  showGroupModal.value = true;
}
function closeGroupModal() {
  showGroupModal.value = false;
  editingGroup.value = null;
}
async function saveGroup() {
  if (!groupForm.value.label.trim()) { groupSaveError.value = 'Group name is required.'; return; }
  groupSaving.value = true;
  groupSaveError.value = '';
  try {
    const payload = { label: groupForm.value.label.trim(), criteria: groupForm.value.criteria };
    if (editingGroup.value) {
      const { data } = await api.put(`/summit-stats/clubs/${props.clubId}/eligibility-groups/${editingGroup.value.id}`, payload);
      const idx = groups.value.findIndex(g => g.id === editingGroup.value.id);
      if (idx !== -1) groups.value[idx] = data.group;
    } else {
      const { data } = await api.post(`/summit-stats/clubs/${props.clubId}/eligibility-groups`, payload);
      groups.value.push(data.group);
    }
    emit('groups-updated', groups.value);
    closeGroupModal();
  } catch (e) {
    groupSaveError.value = e.response?.data?.error?.message || 'Save failed.';
  } finally {
    groupSaving.value = false;
  }
}

// ── Award modal ───────────────────────────────────────────────────
function defaultAwardForm() {
  return { label: '', icon: '🏆', period: 'weekly', monthEndDay: 'last', metric: 'distance_miles', aggregation: 'most', activityType: '', groupFilter: '' };
}
function openAwardModal(a = null) {
  editingAward.value = a;
  const icon = a?.icon || '🏆';
  awardForm.value = a
    ? { label: a.label, icon, period: a.period, monthEndDay: a.monthEndDay || 'last', metric: a.metric, aggregation: a.aggregation, activityType: a.activityType || '', groupFilter: a.groupFilter || '' }
    : defaultAwardForm();
  awardSaveError.value = '';
  showIconPicker.value = false;
  if (isLibraryIcon(icon)) {
    useLibraryIcon.value = true;
    libraryIconId.value = parseInt(icon.replace('icon:', ''), 10) || null;
  } else {
    useLibraryIcon.value = false;
    libraryIconId.value = null;
  }
  showAwardModal.value = true;
}
function closeAwardModal() {
  showAwardModal.value = false;
  editingAward.value = null;
  useLibraryIcon.value = false;
  libraryIconId.value = null;
}
async function saveAward() {
  if (!awardForm.value.label.trim()) { awardSaveError.value = 'Award title is required.'; return; }
  awardSaving.value = true;
  awardSaveError.value = '';
  try {
    const payload = {
      label: awardForm.value.label.trim(),
      icon: awardForm.value.icon,
      period: awardForm.value.period,
      monthEndDay: awardForm.value.monthEndDay || 'last',
      metric: awardForm.value.metric,
      aggregation: awardForm.value.aggregation,
      activityType: awardForm.value.activityType.trim(),
      groupFilter: awardForm.value.groupFilter
    };
    if (editingAward.value) {
      const { data } = await api.put(`/summit-stats/clubs/${props.clubId}/recognition-awards/${editingAward.value.id}`, payload);
      const idx = awards.value.findIndex(a => a.id === editingAward.value.id);
      if (idx !== -1) awards.value[idx] = data.award;
    } else {
      const { data } = await api.post(`/summit-stats/clubs/${props.clubId}/recognition-awards`, payload);
      awards.value.push(data.award);
    }
    emit('awards-updated', awards.value);
    closeAwardModal();
  } catch (e) {
    awardSaveError.value = e.response?.data?.error?.message || 'Save failed.';
  } finally {
    awardSaving.value = false;
  }
}

// ── Tenant Award Modal ────────────────────────────────────────────
function openTenantAwardModal(a = null) {
  editingTenantAward.value = a;
  const icon = a?.icon || '🏆';
  tenantAwardForm.value = a
    ? { label: a.label, icon, period: a.period, metric: a.metric, aggregation: a.aggregation, activityType: a.activityType || '' }
    : defaultTenantAwardForm();
  tenantAwardSaveError.value = '';
  showTenantIconPicker.value = false;
  if (isLibraryIcon(icon)) {
    tenantUseLibraryIcon.value = true;
    tenantLibraryIconId.value = parseInt(icon.replace('icon:', ''), 10) || null;
  } else {
    tenantUseLibraryIcon.value = false;
    tenantLibraryIconId.value = null;
  }
  showTenantAwardModal.value = true;
}
function closeTenantAwardModal() {
  showTenantAwardModal.value = false;
  editingTenantAward.value = null;
  tenantUseLibraryIcon.value = false;
  tenantLibraryIconId.value = null;
}
function onTenantLibraryIconSelected(iconId) {
  tenantLibraryIconId.value = iconId;
  tenantAwardForm.value.icon = iconId ? `icon:${iconId}` : '🏆';
}
async function saveTenantAward() {
  if (!tenantAwardForm.value.label.trim()) { tenantAwardSaveError.value = 'Award title is required.'; return; }
  tenantAwardSaving.value = true;
  tenantAwardSaveError.value = '';
  try {
    const payload = {
      label: tenantAwardForm.value.label.trim(),
      icon: tenantAwardForm.value.icon,
      period: tenantAwardForm.value.period,
      metric: tenantAwardForm.value.metric,
      aggregation: tenantAwardForm.value.aggregation,
      activityType: tenantAwardForm.value.activityType.trim()
    };
    if (editingTenantAward.value) {
      const { data } = await api.put(`/summit-stats/clubs/${props.clubId}/tenant-awards/${editingTenantAward.value.id}`, payload);
      const idx = tenantAwards.value.findIndex(a => a.id === editingTenantAward.value.id);
      if (idx !== -1) tenantAwards.value[idx] = data.award;
    } else {
      const { data } = await api.post(`/summit-stats/clubs/${props.clubId}/tenant-awards`, payload);
      tenantAwards.value.push(data.award);
    }
    closeTenantAwardModal();
  } catch (e) {
    tenantAwardSaveError.value = e.response?.data?.error?.message || 'Save failed.';
  } finally {
    tenantAwardSaving.value = false;
  }
}
async function cloneTenantAward(ta) {
  try {
    const { data } = await api.post(`/summit-stats/clubs/${props.clubId}/recognition-awards/clone-from-tenant/${ta.id}`);
    awards.value.push(data.award);
    emit('awards-updated', awards.value);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Clone failed.');
  }
}
function confirmDeleteTenantAward(ta) { tenantDeleteConfirm.value = { id: ta.id, label: ta.label }; }
async function executeTenantDelete() {
  if (!tenantDeleteConfirm.value) return;
  tenantDeleteLoading.value = true;
  try {
    await api.delete(`/summit-stats/clubs/${props.clubId}/tenant-awards/${tenantDeleteConfirm.value.id}`);
    tenantAwards.value = tenantAwards.value.filter(a => a.id !== tenantDeleteConfirm.value.id);
    tenantDeleteConfirm.value = null;
  } catch { /**/ } finally {
    tenantDeleteLoading.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────────────
function confirmDeleteGroup(g) { deleteConfirm.value = { type: 'group', id: g.id, label: g.label }; }
function confirmDeleteAward(a) { deleteConfirm.value = { type: 'award', id: a.id, label: a.label }; }
async function executeDelete() {
  if (!deleteConfirm.value) return;
  deleteLoading.value = true;
  try {
    const { type, id } = deleteConfirm.value;
    if (type === 'group') {
      await api.delete(`/summit-stats/clubs/${props.clubId}/eligibility-groups/${id}`);
      groups.value = groups.value.filter(g => g.id !== id);
      emit('groups-updated', groups.value);
    } else {
      await api.delete(`/summit-stats/clubs/${props.clubId}/recognition-awards/${id}`);
      awards.value = awards.value.filter(a => a.id !== id);
      emit('awards-updated', awards.value);
    }
    deleteConfirm.value = null;
  } catch {
    // silent - confirm stays open
  } finally {
    deleteLoading.value = false;
  }
}

// ── Display helpers ────────────────────────────────────────────────
function periodLabel(p) { return { weekly: 'Weekly', monthly: 'Monthly', season: 'Full Season' }[p] || p; }
function metricLabel(m) { return { distance_miles: 'Miles', points: 'Points', duration_minutes: 'Duration', activities_count: 'Activity count' }[m] || m; }
function aggregationLabel(a) { return { most: 'Most total', least: 'Least total', average: 'Avg/entry', best_single: 'Best workout', best_day: 'Best day' }[a] || a; }
function groupFilterLabel(gf) {
  if (!gf) return 'Everyone';
  if (gf === 'gender_male') return 'Male';
  if (gf === 'gender_female') return 'Female';
  if (gf === 'masters') return 'Masters';
  if (gf === 'heavyweight_male') return 'Heavyweight (M)';
  if (gf === 'heavyweight_female') return 'Heavyweight (F)';
  if (gf.startsWith('group_')) {
    const id = Number(gf.replace('group_', ''));
    const g = groups.value.find(g => g.id === id);
    return g ? g.label : gf;
  }
  return gf;
}
function formatCriteria(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) return 'No criteria';
  return criteria.map(c => {
    const f = { age: 'Age', weight_lbs: 'Weight (lbs)', height_inches: 'Height (in)' }[c.field] || c.field;
    const op = c.operator === 'lte' ? '≤' : '≥';
    return `${f} ${op} ${c.value}`;
  }).join(', ');
}
</script>

<style scoped>
.rlm {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Section ──────────────────────────────────────────────────── */
.rlm-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rlm-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.rlm-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  display: block;
}

.rlm-section-hint {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  display: block;
  margin-top: 2px;
}

.rlm-hint  { font-size: 12px; color: var(--text-secondary, #64748b); padding: 4px 0; }
.rlm-empty { font-size: 12px; color: var(--text-secondary, #94a3b8); padding: 12px; background: var(--bg-alt, #f8fafc); border-radius: 8px; text-align: center; }

/* ── List rows ───────────────────────────────────────────────── */
.rlm-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rlm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}

.rlm-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.rlm-award-icon { font-size: 20px; flex-shrink: 0; display: flex; align-items: center; }
.rlm-award-icon-img { width: 28px; height: 28px; object-fit: contain; display: block; }
.rlm-icon-mode-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.rlm-icon-tab {
  flex: 1; padding: 4px 8px; font-size: 12px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px; background: var(--bg-alt, #f8fafc); cursor: pointer; color: var(--text-secondary, #64748b);
}
.rlm-icon-tab.active {
  background: var(--primary, #2563eb); color: #fff; border-color: var(--primary, #2563eb);
}
.rlm-library-icon-preview { margin-top: 8px; }
.rlm-tenant-badge {
  display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; background: var(--primary-light, #eff6ff); color: var(--primary, #2563eb);
  border-radius: 4px; padding: 1px 6px; margin-left: 6px;
}

.rlm-row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rlm-row-meta {
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rlm-row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.rlm-action-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 5px;
  background: #fff;
  color: var(--text-primary, #0f172a);
  cursor: pointer;
  transition: background .15s;
}
.rlm-action-btn:hover { background: var(--bg-alt, #f1f5f9); }
.rlm-action-btn--danger { color: #dc2626; border-color: #fecaca; }
.rlm-action-btn--danger:hover { background: #fef2f2; }

/* ── Modal overlay ───────────────────────────────────────────── */
.rlm-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.rlm-modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0,0,0,.2);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
}
.rlm-modal--wide { max-width: 620px; }
.rlm-modal--sm   { max-width: 340px; }

.rlm-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.rlm-modal-head h3 { margin: 0; font-size: 15px; font-weight: 700; }

.rlm-close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.rlm-modal-body {
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rlm-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border, #e2e8f0);
  flex-wrap: wrap;
}

/* ── Form elements inside modal ──────────────────────────────── */
.rlm-field { display: flex; flex-direction: column; gap: 5px; }
.rlm-field-row { display: flex; gap: 12px; flex-wrap: wrap; }
.rlm-field-row .rlm-field { flex: 1 1 140px; }
.rlm-field--narrow { flex: 0 0 auto !important; min-width: 72px; }

.rlm-label { font-size: 12px; font-weight: 600; color: var(--text-primary, #0f172a); }
.rlm-label-hint { font-weight: 400; color: var(--text-secondary, #64748b); font-size: 11px; }
.rlm-field-hint { font-size: 11px; color: var(--text-secondary, #94a3b8); }

.rlm-input,
.rlm-select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary, #0f172a);
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.rlm-select--xs { flex: 0 0 auto; width: auto; }

.rlm-crit-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.rlm-crit-val {
  width: 80px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
}
.rlm-remove-btn {
  background: none;
  border: none;
  color: #dc2626;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.rlm-text-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--primary, #2563eb);
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
}

/* ── Icon picker inside award modal ──────────────────────────── */
.rlm-icon-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  padding: 0 10px;
  cursor: pointer;
  background: #fff;
  user-select: none;
}
.rlm-icon-preview { font-size: 20px; line-height: 1; }
.rlm-icon-change  { font-size: 10px; color: var(--text-secondary, #64748b); }

.rlm-icon-grid {
  position: absolute;
  z-index: 50;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(10, 28px);
  gap: 2px;
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  margin-top: 2px;
}
.rlm-icon-opt {
  font-size: 18px;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rlm-icon-opt:hover, .rlm-icon-opt.active { background: var(--bg-alt, #f1f5f9); }

/* ── Chips / variants ────────────────────────────────────────── */
.rlm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.rlm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-alt, #f1f5f9);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
}
.rlm-chip-remove {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  line-height: 1;
}
.rlm-chip-add {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #64748b);
}
.rlm-chip-input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  width: 120px;
}

.rlm-error {
  font-size: 12px;
  color: #dc2626;
  flex: 1;
}
</style>
