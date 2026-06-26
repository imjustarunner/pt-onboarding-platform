<template>
  <div class="provider-info-tab" :class="{ 'provider-info-tab--embedded': embedded }">
    <div v-if="!embedded" class="tab-header">
      <div>
        <h2 style="margin: 0;">Profile Info</h2>
        <p class="subtitle">Profile fields captured into the user’s file (spec-driven).</p>
      </div>

      <div class="header-actions">
        <label class="toggle" style="display:flex; align-items:center; gap:8px; margin-right: 10px;">
          <input type="checkbox" v-model="showEmptyAssignedFields" />
          <span style="font-size: 13px; color: var(--text-secondary);">Show empty assigned fields</span>
        </label>
        <label v-if="canAdminEdit" class="toggle" style="display:flex; align-items:center; gap:8px; margin-right: 10px;">
          <input type="checkbox" v-model="showFieldKeys" />
          <span style="font-size: 13px; color: var(--text-secondary);">Show field keys</span>
        </label>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading || installing">
          Refresh
        </button>
        <button class="btn btn-primary" @click="saveAll" :disabled="saving || loading || installing || visibleProviderFields.length === 0 || !canEditAnyVisible">
          {{ saving ? 'Saving...' : 'Save Profile Info' }}
        </button>
      </div>
    </div>

    <div v-else-if="embedded && panelTitle" class="embedded-header">
      <div>
        <h3 style="margin: 0;">{{ panelTitle }}</h3>
        <p v-if="embeddedHint" class="subtitle">{{ embeddedHint }}</p>
      </div>
      <div class="header-actions">
        <label class="toggle" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" v-model="showEmptyAssignedFields" />
          <span style="font-size: 13px; color: var(--text-secondary);">Show empty fields</span>
        </label>
        <button class="btn btn-primary btn-sm" @click="saveAll" :disabled="saving || loading || visibleProviderFields.length === 0 || !canEditAnyVisible">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <div v-if="installError" class="error" style="margin-bottom: 12px;">{{ installError }}</div>
    <div v-if="saveError" class="error" style="margin-bottom: 12px;">{{ saveError }}</div>
    <div v-if="saveSuccess" class="success" style="margin-bottom: 12px;">{{ saveSuccess }}</div>
    <div v-if="showEmptyAssignedFields && providerFields.length === providerFieldsWithValue.length" class="muted" style="margin-bottom: 12px;">
      No empty assigned fields detected for this user (they may not have any profile form modules assigned).
    </div>

    <div class="install-card" v-if="false && showInstallCard">
      <div class="install-card-header">
        <div>
          <h3 style="margin: 0;">Install Provider Onboarding Modules</h3>
          <p class="subtitle" style="margin-top: 6px;">
            This legacy installer has been replaced by the spec-driven sync (Admin Actions → Sync Forms).
          </p>
        </div>
        <button class="btn btn-primary" @click="installTemplate" :disabled="installing">
          {{ installing ? 'Installing...' : 'Install Template' }}
        </button>
      </div>
      <div v-if="installSuccess" class="success">{{ installSuccess }}</div>
      <div class="small-note">
        Target agency: <strong>{{ targetAgency?.name || 'Unknown' }}</strong>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading provider info…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else>
      <div v-if="visibleProviderFields.length === 0" class="empty-state">
        <p v-if="missingClinicalFieldKeys.length" style="margin: 0;">
          Field definitions not found for:
          <code>{{ missingClinicalFieldKeys.join(', ') }}</code>.
        </p>
        <p v-else style="margin: 0;">No profile fields found for this section yet.</p>
        <p style="margin: 8px 0 0 0; color: var(--text-secondary);">
          Run “Sync Forms (Spec)” to create categories/fields, then refresh. You can still assign form modules from the user’s training tasks.
        </p>
      </div>

      <div v-else class="sections">
        <div v-if="!embedded" class="section-controls" style="display:flex; gap:10px; margin: 0 0 14px 0; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" @click="collapseAllSections" :disabled="loading || saving">
            Collapse all
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="expandAllSections" :disabled="loading || saving">
            Expand all
          </button>
        </div>

        <div v-for="section in visibleProviderSections" :key="section.key" class="section">
          <div v-if="!(embedded && section.key === '__clinical_panel')" class="section-title">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="toggleSection(section.key)"
                :title="isSectionCollapsed(section.key) ? 'Expand section' : 'Collapse section'"
                style="display:flex; align-items:center; gap:10px;"
              >
                <span style="width: 14px; display:inline-block; text-align:center;">
                  {{ isSectionCollapsed(section.key) ? '+' : '–' }}
                </span>
                <span style="font-weight: 600;">{{ section.label }}</span>
                <span style="opacity: 0.7;">({{ (section.fields || []).length }})</span>
              </button>
              <button
                v-if="section.key === 'provider_legacy_matching' && legacyCleanupCandidateCount > 0"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="cleanupLegacyDuplicates"
                :disabled="saving || legacyCleanupRunning"
                :title="`Remove ${legacyCleanupCandidateCount} duplicate field(s) from this legacy provider so they won’t be shown/edited.`"
              >
                {{ legacyCleanupRunning ? 'Cleaning…' : 'Remove duplicate fields' }}
              </button>
            </div>
          </div>

          <div v-show="embedded && section.key === '__clinical_panel' ? true : !isSectionCollapsed(section.key)" class="fields-grid">
            <div v-for="field in section.fields" :key="field.id" class="field-item">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <label :for="`provider-field-${field.id}`" style="margin: 0;">
                    {{ field.field_label }}
                    <span v-if="field.is_required" class="required-asterisk">*</span>
                  </label>
                  <div v-if="showFieldKeys" class="muted" style="font-size: 12px;">
                    key: <code>{{ field.field_key }}</code>
                    <span style="opacity: 0.7;">&nbsp;|&nbsp;defId: {{ field.id }}</span>
                    <span v-if="field.category_key" style="opacity: 0.7;">&nbsp;|&nbsp;cat: <code>{{ field.category_key }}</code></span>
                  </div>
                </div>
                <button
                  v-if="canDeleteField(field) && field?.hasValue"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="deleteFieldValue(field)"
                  :disabled="saving || loading"
                  title="Delete this saved value (removes from database)."
                >
                  Delete
                </button>
              </div>

              <div v-if="fileValueUrl(fieldValues[field.id])" style="margin-bottom: 6px;">
                <a :href="fileValueUrl(fieldValues[field.id])" target="_blank" rel="noopener noreferrer">View uploaded file</a>
              </div>

              <input
                v-if="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
                :id="`provider-field-${field.id}`"
                :type="field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
                :disabled="!canEditField(field)"
              />

              <input
                v-else-if="field.field_type === 'number'"
                :id="`provider-field-${field.id}`"
                type="number"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
                :disabled="!canEditField(field)"
              />

              <input
                v-else-if="field.field_type === 'date'"
                :id="`provider-field-${field.id}`"
                type="date"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
                :disabled="!canEditField(field)"
              />

              <textarea
                v-else-if="field.field_type === 'textarea'"
                :id="`provider-field-${field.id}`"
                v-model="fieldValues[field.id]"
                rows="4"
                :required="field.is_required"
                :disabled="!canEditField(field)"
              ></textarea>

              <select
                v-else-if="field.field_type === 'select'"
                :id="`provider-field-${field.id}`"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
                :disabled="!canEditField(field)"
              >
                <option value="">Select an option</option>
                <option v-for="option in (field.options || [])" :key="optionKey(option)" :value="optionValue(option)">
                  {{ optionLabel(option) }}
                </option>
              </select>

              <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
                <p v-if="!(field.options || []).length" class="muted" style="margin: 0; font-size: 13px;">
                  No choices configured yet — run Sync Forms (Spec) for this agency, then refresh.
                </p>
                <label v-for="option in (field.options || [])" :key="optionKey(option)" class="multi-select-option">
                  <input
                    type="checkbox"
                    :checked="Array.isArray(fieldValues[field.id]) ? fieldValues[field.id].includes(optionValue(option)) : false"
                    :disabled="!canEditField(field)"
                    @change="canEditField(field) && toggleMultiSelect(field.id, option)"
                  />
                  <span>{{ optionLabel(option) }}</span>
                </label>
              </div>

              <div v-else-if="field.field_type === 'boolean'" class="checkbox-wrapper">
                <input
                  :id="`provider-field-${field.id}`"
                  type="checkbox"
                  :checked="isTruthy(fieldValues[field.id])"
                  :disabled="!canEditField(field)"
                  @change="canEditField(field) && (fieldValues[field.id] = $event.target.checked ? 'true' : 'false')"
                />
                <label :for="`provider-field-${field.id}`" class="checkbox-label">Yes</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Public Listings section -->
    <div class="section" style="margin-top: 16px;">
      <div class="section-title">
        <span style="font-weight: 600;">Public Listings</span>
        <span style="color: var(--text-secondary); font-size: 13px; margin-left: 8px;">Controls which public-facing booking finders this provider appears in.</span>
      </div>

      <div v-if="listingsLoading" style="color: var(--text-secondary); font-size: 13px;">Loading…</div>
      <div v-else-if="listingsError" style="color: #dc3545; font-size: 13px;">{{ listingsError }}</div>
      <div v-else-if="(targetAgency?.slug || '').trim() === ''" style="color: var(--text-secondary); font-size: 13px;">No linked agency found — cannot manage listings.</div>
      <div v-else>
        <div class="fields-grid" style="margin-bottom: 16px;">
          <div v-for="svc in SERVICE_TYPES" :key="svc.type" class="field-item">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input
                type="checkbox"
                :checked="enrollments[svc.type] === true"
                @change="toggleEnrollment(svc.type, $event.target.checked)"
                :disabled="listingsSaving"
              />
              <span style="font-size: 13px; font-weight: 600;">{{ svc.label }}</span>
            </label>
            <span style="font-size: 12px; color: var(--text-secondary);">{{ svc.description }}</span>
          </div>
        </div>

        <!-- Tutoring profile form -->
        <div v-if="enrollments['tutoring']" class="section" style="border-color: #dbeafe; background: #f8fbff;">
          <div class="section-title">
            <span style="font-weight: 600; font-size: 13px;">Tutoring Profile</span>
          </div>
          <div v-if="tutoringSaveSuccess" class="success" style="margin-bottom: 10px;">{{ tutoringSaveSuccess }}</div>
          <div v-if="tutoringSaveError" class="error" style="margin-bottom: 10px;">{{ tutoringSaveError }}</div>
          <div class="fields-grid">
            <div class="field-item">
              <label>Subject Areas</label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                <label v-for="s in SUBJECT_OPTIONS" :key="s" style="display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" :checked="tutoringForm.subjectAreas.includes(s)" @change="toggleSubject(s)" />
                  {{ s }}
                </label>
              </div>
            </div>
            <div class="field-item">
              <label>Grade Levels</label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                <label v-for="g in GRADE_OPTIONS" :key="g" style="display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" :checked="tutoringForm.gradeLevels.includes(g)" @change="toggleGrade(g)" />
                  {{ g }}
                </label>
              </div>
            </div>
            <div class="field-item">
              <label>Session Rate (per session)</label>
              <input type="number" v-model="tutoringForm.sessionRateDollars" placeholder="e.g. 60" min="0" step="1" />
              <span style="font-size: 11px; color: var(--text-secondary);">Enter dollar amount; leave empty to show "Contact office"</span>
            </div>
            <div class="field-item">
              <label>Rate Note (optional)</label>
              <input type="text" v-model="tutoringForm.sessionRateNote" placeholder="e.g. sliding scale available" />
            </div>
            <div class="field-item" style="grid-column: 1 / -1;">
              <label>Public Bio</label>
              <textarea v-model="tutoringForm.bio" rows="3" placeholder="Brief public-facing description of your tutoring experience and approach…" />
            </div>
            <div class="field-item">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" v-model="tutoringForm.acceptingNewStudents" />
                <span>Accepting new students</span>
              </label>
            </div>
            <div class="field-item">
              <label>Minimum session package</label>
              <select v-model.number="tutoringForm.minSessionPackage">
                <option :value="1">1 — Single session OK</option>
                <option :value="2">2 sessions minimum</option>
                <option :value="3">3 sessions minimum</option>
                <option :value="4">4 sessions minimum</option>
              </select>
            </div>
            <div class="field-item">
              <label>Payment policy</label>
              <select v-model="tutoringForm.paymentPolicy">
                <option value="POST_SESSION">Charge after each session</option>
                <option value="PREPAY">Require prepayment at booking</option>
              </select>
            </div>
          </div>
          <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
            <button class="btn btn-primary" :disabled="tutoringSaving" @click="saveTutoringProfile">
              {{ tutoringSaving ? 'Saving…' : 'Save Tutoring Profile' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import {
  isClinicalProfileField,
  isMappedClinicalField
} from '../../constants/clinicalProfileLayout.js';

import {
  expandFieldKeys
} from '../../utils/clinicalFieldDisplay.js';

const props = defineProps({
  userId: { type: Number, required: true },
  embedded: { type: Boolean, default: false },
  fieldKeys: { type: Array, default: null },
  fieldGroups: { type: Array, default: null },
  panelTitle: { type: String, default: '' },
  panelHint: { type: String, default: '' },
  ensureEmptyFields: { type: Boolean, default: false },
  showUnmappedOnly: { type: Boolean, default: false },
  clinicalFilter: { type: Boolean, default: false }
});

const authStore = useAuthStore();
const currentUser = computed(() => authStore.user || null);
const currentUserId = computed(() => Number(currentUser.value?.id || 0));
const currentRole = computed(() => String(currentUser.value?.role || '').trim().toLowerCase());
const isSelf = computed(() => currentUserId.value > 0 && currentUserId.value === Number(props.userId));
const isProviderSelf = computed(() => isSelf.value && currentRole.value === 'provider');
const canAdminEdit = computed(() => ['admin', 'super_admin', 'support', 'staff'].includes(currentRole.value));

const loading = ref(true);
const error = ref('');
const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref('');

const installing = ref(false);
const installError = ref('');
const installSuccess = ref('');

const categories = ref([]);
const allFields = ref([]);
const fieldValues = ref({});
const userAgencies = ref([]);
const showEmptyAssignedFields = ref(false);
const showFieldKeys = ref(false);
const collapsedSections = ref(new Set());

const isSectionCollapsed = (key) => collapsedSections.value.has(String(key || ''));
const toggleSection = (key) => {
  const k = String(key || '');
  if (!k) return;
  const next = new Set(collapsedSections.value);
  if (next.has(k)) next.delete(k);
  else next.add(k);
  collapsedSections.value = next;
};
const collapseAllSections = () => {
  const keys = (visibleProviderSections.value || []).map((s) => String(s?.key || '')).filter(Boolean);
  collapsedSections.value = new Set(keys);
};
const expandAllSections = () => {
  collapsedSections.value = new Set();
};

const platformCategoryKeys = computed(() => {
  return new Set((categories.value || []).filter((c) => c.is_platform_template === 1 || c.is_platform_template === true).map((c) => c.category_key));
});

// Providers can edit their own profile, except staff-managed ITSCO/provider ops fields.
const PROVIDER_SELF_LOCKED_FIELD_KEYS = new Set([
  'provider_status',
  'provider_accepts_commercial',
  'provider_accepts_medicaid',
  'provider_accepts_tricare',
  'provider_background_check_date',
  'provider_background_check_status',
  'provider_background_check_notes',
  'provider_cleared_to_start',
  'provider_clinician_notes',
  'provider_credential',
  'provider_display_name',
  'provider_risk_high_behavioral_needs',
  'provider_risk_skills',
  'provider_risk_substance_use',
  'provider_risk_suicidal',
  'provider_risk_trauma'
]);

const canEditField = (field) => {
  if (canAdminEdit.value) return true;
  if (!isProviderSelf.value) return false;
  const fk = String(field?.field_key || '').trim();
  if (fk && PROVIDER_SELF_LOCKED_FIELD_KEYS.has(fk)) return false;
  return true;
};
const canDeleteField = (field) => {
  // Only admin/support/staff can delete values entirely.
  return canAdminEdit.value === true;
};

const canEditAnyVisible = computed(() => {
  const list = visibleProviderFields.value || [];
  return list.some((f) => canEditField(f));
});

const deleteFieldValue = async (field) => {
  try {
    if (!canDeleteField(field)) return;
    const label = String(field?.field_label || field?.field_key || 'this field');
    if (!confirm(`Delete the saved value for “${label}” for this user? This removes it from the database for them.`)) return;
    saving.value = true;
    await api.delete(`/users/${props.userId}/user-info/${field.id}`, { params: { agencyId: targetAgency.value?.id || null } });
    await refresh();
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to delete field value';
  } finally {
    saving.value = false;
  }
};

const normalizeMultiSelectValue = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Accept legacy shapes like [{value,label}] but store as string values for consistent checkbox behavior.
        return parsed
          .map((x) => {
            if (x && typeof x === 'object') return String(x.value ?? x.label ?? '').trim();
            return String(x ?? '').trim();
          })
          .filter(Boolean);
      }
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

const optionValue = (opt) => {
  if (opt && typeof opt === 'object') return String(opt.value ?? opt.label ?? '').trim();
  return String(opt ?? '').trim();
};
const optionLabel = (opt) => {
  if (opt && typeof opt === 'object') return String(opt.label ?? opt.value ?? '').trim();
  return String(opt ?? '').trim();
};
const optionKey = (opt) => optionValue(opt) || optionLabel(opt);

const toggleMultiSelect = (fieldId, opt) => {
  const v = optionValue(opt);
  if (!v) return;
  const current = normalizeMultiSelectValue(fieldValues.value[fieldId]);
  const exists = current.includes(v);
  const next = exists ? current.filter((x) => x !== v) : [...current, v];
  fieldValues.value[fieldId] = next;
};

const isTruthy = (raw) => {
  if (raw === true) return true;
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
};

const targetAgency = computed(() => {
  // Prefer a real agency org if present; otherwise use first org.
  const agencies = (userAgencies.value || []).filter((o) => (o.organization_type || '').toLowerCase() === 'agency');
  return agencies[0] || userAgencies.value?.[0] || null;
});

const providerFields = computed(() => {
  let list = allFields.value || [];
  if (props.clinicalFilter) {
    list = list.filter((f) => isClinicalProfileField(f));
  }
  if (Array.isArray(props.fieldKeys) && props.fieldKeys.length) {
    const allow = new Set(expandFieldKeys(props.fieldKeys));
    list = list.filter((f) => allow.has(String(f?.field_key || '').trim()));
    if (props.embedded) {
      const hasLegacyAge = list.some((f) => String(f?.field_key || '').trim() === 'age_specialty');
      if (hasLegacyAge) {
        list = list.filter((f) => {
          const fk = String(f?.field_key || '').trim();
          if (fk !== 'provider_marketing_age_specialty') return true;
          return !!f?.hasValue;
        });
      }
    }
  } else if (props.showUnmappedOnly) {
    list = list.filter((f) => {
      const fk = String(f?.field_key || '').trim();
      return fk && !isMappedClinicalField(fk);
    });
  }
  return list;
});

const embeddedHint = computed(() => {
  if (props.panelHint) return props.panelHint;
  if (!props.embedded) return '';
  if (props.showUnmappedOnly) {
    return 'Fields not yet grouped into a clinical sub-tab appear here.';
  }
  if (Array.isArray(props.fieldKeys) && props.fieldKeys.length) {
    return 'Edit or add values here even if onboarding forms were never assigned. Empty multi-select fields mean the provider is open to all clients for that category.';
  }
  return '';
});

// Legacy matching keys (imported via Employee Info import)
const LEGACY_MATCH_KEYS = new Set(['age_specialty', 'treatment_prefs_max15']);

const sectionKeyForField = (f) => {
  if (props.embedded && Array.isArray(props.fieldGroups) && props.fieldGroups.length) {
    const fk = String(f?.field_key || '').trim();
    for (const g of props.fieldGroups) {
      const allow = new Set(expandFieldKeys(g?.fieldKeys || []));
      if (allow.has(fk)) return `clinical_group_${g.id || g.label}`;
    }
    return '__clinical_panel_other';
  }
  if (props.embedded && Array.isArray(props.fieldKeys) && props.fieldKeys.length) {
    return '__clinical_panel';
  }
  const fk = String(f?.field_key || '').trim();
  if (fk && LEGACY_MATCH_KEYS.has(fk)) return 'provider_legacy_matching';
  return f?.category_key || '__uncategorized';
};

const sectionLabelForKey = (key) => {
  if (key.startsWith('clinical_group_')) {
    const id = key.replace('clinical_group_', '');
    const g = (props.fieldGroups || []).find((x) => String(x?.id || x?.label) === id);
    if (g?.label) return g.label;
  }
  if (key === '__clinical_panel_other') return 'Other';
  if (key === '__clinical_panel') return props.panelTitle || 'Clinical fields';
  if (key === 'provider_legacy_matching') return 'Legacy Provider Matching (Imported)';
  const c = (categories.value || []).find((x) => x.category_key === key);
  return c?.category_label || key;
};

// If a provider is managed via legacy import, we often want to remove duplicate “new” marketing fields
// so the profile stays clean and only one source of truth is editable.
const LEGACY_DUPLICATE_KEYS_TO_REMOVE = [
  'provider_marketing_age_specialty',
  'provider_marketing_treatment_modalities'
];
const legacyCleanupRunning = ref(false);
const legacyCleanupCandidateFields = computed(() => {
  const list = providerFields.value || [];
  return list.filter((f) => {
    const fk = String(f?.field_key || '').trim();
    return fk && LEGACY_DUPLICATE_KEYS_TO_REMOVE.includes(fk) && f?.hasValue;
  });
});
const legacyCleanupCandidateCount = computed(() => legacyCleanupCandidateFields.value.length);

const cleanupLegacyDuplicates = async () => {
  try {
    if (!legacyCleanupCandidateFields.value.length) return;
    if (!confirm(`Remove ${legacyCleanupCandidateFields.value.length} duplicate field(s) from this legacy provider? This deletes the saved values and hides the fields.`)) {
      return;
    }
    legacyCleanupRunning.value = true;

    for (const f of legacyCleanupCandidateFields.value) {
      await api.delete(`/users/${props.userId}/user-info/${f.id}`, { params: { agencyId: targetAgency.value?.id || null } });
    }

    await refresh();
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to remove duplicate fields';
  } finally {
    legacyCleanupRunning.value = false;
  }
};

const providerSections = computed(() => buildProviderSections(providerFields.value));

const providerFieldsWithValue = computed(() => {
  return (providerFields.value || []).filter((f) => f?.hasValue);
});

const visibleProviderFields = computed(() => {
  if (props.ensureEmptyFields) return providerFields.value || [];
  if (showEmptyAssignedFields.value) return providerFields.value || [];
  return providerFieldsWithValue.value || [];
});

const visibleProviderSections = computed(() => buildProviderSections(visibleProviderFields.value));

function buildProviderSections(fieldsList) {
  const byCat = new Map();
  (fieldsList || []).forEach((f) => {
    const key = sectionKeyForField(f);
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(f);
  });

  let keys = Array.from(byCat.keys());
  if (Array.isArray(props.fieldGroups) && props.fieldGroups.length) {
    const order = props.fieldGroups.map((g) => `clinical_group_${g.id || g.label}`);
    order.push('__clinical_panel_other');
    keys.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return String(a).localeCompare(String(b));
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  } else {
    keys.sort((a, b) => String(a).localeCompare(String(b)));
  }

  return keys
    .map((key) => ({
      key,
      label: sectionLabelForKey(key),
      fields: (byCat.get(key) || []).slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    }))
    .filter((s) => (s.fields || []).length > 0);
}

const missingClinicalFieldKeys = computed(() => {
  if (!props.embedded || !Array.isArray(props.fieldKeys) || !props.fieldKeys.length) return [];
  const present = new Set((providerFields.value || []).map((f) => String(f?.field_key || '').trim()));
  return (props.fieldKeys || []).filter((k) => {
    const key = String(k || '').trim();
    if (!key || present.has(key)) return false;
    return !expandFieldKeys([key]).some((alias) => present.has(alias));
  });
});

const showInstallCard = computed(() => {
  return providerFields.value.length === 0 || (providerSections.value.length > 0 && providerFields.value.length < 5);
});

const refresh = async () => {
  try {
    loading.value = true;
    error.value = '';
    saveError.value = '';
    saveSuccess.value = '';
    installError.value = '';
    installSuccess.value = '';

    const [infoRes, catsRes, agenciesRes] = await Promise.all([
      api.get(`/users/${props.userId}/user-info`, { params: { assignedOrHasValueOnly: true } }),
      api.get('/user-info-categories'),
      api.get(`/users/${props.userId}/agencies`)
    ]);

    let fields = infoRes.data || [];
    categories.value = catsRes.data || [];
    userAgencies.value = agenciesRes.data || [];

    if ((props.ensureEmptyFields || props.embedded) && Array.isArray(props.fieldKeys) && props.fieldKeys.length) {
      const presentKeys = new Set(fields.map((f) => String(f?.field_key || '').trim()));
      const needed = (props.fieldKeys || [])
        .map((k) => String(k || '').trim())
        .filter((k) => k && !presentKeys.has(k) && !expandFieldKeys([k]).some((alias) => presentKeys.has(alias)));

      if (needed.length) {
        try {
          const defs = await fetchFieldDefinitions();
          const agencyId = targetAgency.value?.id || null;
          for (const key of needed) {
            const def = pickBestFieldDefinition(defs, key, agencyId);
            if (def) fields.push(syntheticFieldFromDef(def));
          }
        } catch {
          // Non-fatal: staff still see fields that were assigned or have values.
        }
      }
    }

    allFields.value = fields.map(applyDefaultFieldOptions);

    const values = {};
    (allFields.value || []).forEach((f) => {
      if (f.field_type === 'multi_select') {
        values[f.id] = normalizeMultiSelectValue(f.value);
      } else {
        values[f.id] = f.value ?? '';
      }
    });
    fieldValues.value = values;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider info';
  } finally {
    loading.value = false;
  }
};

const saveAll = async () => {
  try {
    saving.value = true;
    saveError.value = '';
    saveSuccess.value = '';

    const values = Object.keys(fieldValues.value).map((fieldId) => ({
      fieldDefinitionId: parseInt(fieldId),
      value: Array.isArray(fieldValues.value[fieldId]) ? JSON.stringify(fieldValues.value[fieldId]) : (fieldValues.value[fieldId] || null)
    }));

    await api.post(`/users/${props.userId}/user-info`, { values, agencyId: targetAgency.value?.id || null });
    saveSuccess.value = 'Saved Profile Info.';
    setTimeout(() => (saveSuccess.value = ''), 2500);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save Profile Info';
  } finally {
    saving.value = false;
  }
};

const fileValueUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (v.startsWith('/uploads/')) return v;
  if (v.startsWith('uploads/')) return `/uploads/${v.substring('uploads/'.length)}`;
  return '';
};

// ---- Template provisioning (legacy) ----
// This component used to include a hard-coded template installer. The UI for it is disabled.
// Keep this file safe to mount by not referencing legacy constants like PROVIDER_CATEGORY_ORDER.
const TEMPLATE = {
  categories: [],
  modules: [
    {
      title: 'Identity & NPI Setup',
      description: 'Collects location, research interests, and federal provider identification.',
      categoryKey: 'provider_identity_npi',
      introText:
        'Taxonomy codes (only if “No” for NPI): LPC/LPCC: 101YP2500X, MFT/MFTC: 106H00000X, LSW/LCSW: 104100000X.',
      fields: [
        { fieldKey: 'provider_identity_location', fieldLabel: 'Location Selection', fieldType: 'select' },
        { fieldKey: 'provider_identity_research_topics', fieldLabel: 'Have you conducted research? If so, what topics?', fieldType: 'textarea' },
        { fieldKey: 'provider_identity_research_interest', fieldLabel: 'Are you interested in conducting research?', fieldType: 'boolean' },
        {
          fieldKey: 'provider_identity_npi_status',
          fieldLabel: 'Do you have an NPI?',
          fieldType: 'select',
          isRequired: true,
          options: [
            'Yes',
            'No, but I have registered and will list the number below and have added ITSCO as a surrogate.',
            'Yes, I will list the number below and have added ITSCO as a surrogate.',
            'No, and ITSCO can make me one (please contact me).'
          ]
        },
        { fieldKey: 'provider_identity_npi_number', fieldLabel: 'NPI Number', fieldType: 'text' }
      ]
    },
    {
      title: 'Position & Role',
      description: 'Determines the logic flow for the rest of the profile.',
      categoryKey: 'provider_position_role',
      fields: [
        {
          fieldKey: 'provider_position_role',
          fieldLabel: 'Select your position with ITSCO',
          fieldType: 'select',
          isRequired: true,
          options: [
            "Mental Health Provider (Master's or Doctorate Level)",
            "Intern Mental Health Provider (Enrolled in Master's Level Program)",
            "Mental Health Facilitator (Primarily Skill Builders | QBHA or Bachelors Level)",
            "Mental Health Provider (Bachelor's Level with Approval for Counseling/Therapeutic Services)"
          ]
        }
      ]
    },
    {
      title: 'Work Schedule',
      description: 'Work schedule availability for onboarding and scheduling setup.',
      categoryKey: 'provider_work_schedule',
      fields: [
        {
          fieldKey: 'provider_work_schedule_notes',
          fieldLabel: 'Work Schedule (days/times available)',
          fieldType: 'textarea'
        }
      ]
    },
    {
      title: 'Counseling Profile (General)',
      description: 'General counseling approach and specialty identification.',
      categoryKey: 'provider_counseling_profile_general',
      fields: [
        { fieldKey: 'provider_counseling_ideal_client', fieldLabel: 'Imagine your ideal client. What are their issues, needs, and goals? What do they want and why?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_how_help', fieldLabel: 'How can you help your client/s? What can you offer?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_build_empathy', fieldLabel: 'How can you build empathy and invite the potential client to reach out to you?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_certifications', fieldLabel: 'Do you have any certifications?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_work_experience', fieldLabel: 'Work experience to share?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_clients_avoid', fieldLabel: 'Are there any clients we should absolutely avoid scheduling with you?', fieldType: 'textarea' },
        {
          fieldKey: 'provider_counseling_specialties',
          fieldLabel: 'Specialties',
          fieldType: 'multi_select',
          options: [
            'ADHD',
            'Adoption',
            'Anger Management',
            'Anxiety',
            "Asperger's Syndrome",
            'Autism',
            'Behavioral Issues',
            'Bipolar Disorder',
            'Eating Disorders',
            'Education and Learning Disabilities',
            'Family Conflict',
            'Mood Disorders',
            'LGBTQ+',
            'Obesity',
            'Obsessive-Compulsive (OCD)',
            'Peer Relationships',
            'Racial Identity',
            'School Issues',
            'Self Esteem',
            'Self-Harming',
            'Sports Performance',
            'Stress',
            'Teen Violence',
            'Transgender',
            'Trauma and PTSD',
            'Traumatic Brain Injury (TBI)',
            'Video Game Addiction'
          ]
        },
        { fieldKey: 'provider_counseling_top3_specialties', fieldLabel: 'Top 3 Specialties', fieldType: 'text' }
      ]
    },
    {
      title: 'Clinical Credentialing',
      description: 'License and insurance registration details.',
      categoryKey: 'provider_clinical_credentialing',
      fields: [
        { fieldKey: 'provider_credential_license_type_number', fieldLabel: 'License Type and Number (e.g., LPCC #00154326). List states if multiple.', fieldType: 'text' },
        { fieldKey: 'provider_credential_license_issued_date', fieldLabel: 'Date License Issued', fieldType: 'date' },
        { fieldKey: 'provider_credential_license_expiration_date', fieldLabel: 'Date License Expires', fieldType: 'date' },
        { fieldKey: 'provider_credential_license_document_link', fieldLabel: 'License Document (link or note)', fieldType: 'text' },
        { fieldKey: 'provider_credential_caqh_has_account', fieldLabel: 'Do you have a CAQH account?', fieldType: 'boolean' },
        { fieldKey: 'provider_credential_caqh_provider_id', fieldLabel: 'CAQH Provider ID', fieldType: 'text' },
        { fieldKey: 'provider_credential_medicaid_location_id', fieldLabel: 'Medicaid Location ID Number (or "I don’t have a medicaid account")', fieldType: 'text' },
        { fieldKey: 'provider_credential_medicaid_revalidation_date', fieldLabel: 'Revalidation Date (if applicable)', fieldType: 'date' }
      ]
    },
    {
      title: 'External Marketing Profile (Psychology Today)',
      description: 'Data for the website bio and Psychology Today profile.',
      categoryKey: 'provider_external_marketing_profile',
      fields: [
        {
          fieldKey: 'provider_marketing_psych_today_status',
          fieldLabel: 'Psychology Today Status',
          fieldType: 'select',
          options: [
            'Yes and I have a profile already.',
            'Yes and I do not yet have a profile.',
            'No and I would prefer not to have a profile or will manage my own.'
          ]
        },
        { fieldKey: 'provider_marketing_gender', fieldLabel: 'Gender (for profile display)', fieldType: 'text' },
        { fieldKey: 'provider_marketing_ethnicity', fieldLabel: 'Ethnicity (for profile display)', fieldType: 'text' },
        { fieldKey: 'provider_marketing_ideal_client', fieldLabel: 'Ideal Client (Clinical Focus)', fieldType: 'textarea' },
        { fieldKey: 'provider_marketing_how_help', fieldLabel: 'How you help / Specialty offer', fieldType: 'textarea' },
        { fieldKey: 'provider_marketing_build_empathy', fieldLabel: 'Building Empathy (Clinical Focus)', fieldType: 'textarea' },
        { fieldKey: 'provider_marketing_top3_specialties', fieldLabel: 'Top 3 Specialties (re-confirm for this profile)', fieldType: 'text' },
        { fieldKey: 'provider_marketing_group_therapy', fieldLabel: 'Interested in leading groups? (Text/List types)', fieldType: 'textarea' },
        {
          fieldKey: 'provider_marketing_issues_specialties',
          fieldLabel: 'Issues / Specialties (Max 25)',
          fieldType: 'multi_select',
          options: [
            'Addiction','ADHD','Adoption','Alcohol Use',"Alzheimer's",'Anger Management','Antisocial Personality','Anxiety',"Asperger's Syndrome",'Autism','Behavioral Issues','Bipolar Disorder','Borderline Personality (BPD)','Career Counseling','Child','Chronic Illness','Chronic Impulsivity','Chronic Pain','Codependency','Coping Skills','Depression','Developmental Disorders','Divorce','Domestic Violence/Abuse','Drug Abuse','Eating Disorders','Education/Learning Disabilities','Family Conflict','Gambling','Grief','Hoarding','Infertility','Infidelity','Mood Disorders','LGBTQ+','Life Coaching','Life Transitions',"Men's Issues",'Narcissistic Personality (NPD)','Obesity','OCD','ODD','Parenting','Peer Relationships','Pregnancy/Prenatal/Postpartum','Racial Identity','Relationship Issues','School Issues','Self Esteem','Self-Harming','Sex Therapy','Sexual Abuse','Sexual Addiction','Sleep/Insomnia','Spirituality','Sports Performance','Stress','Substance Use','Teen Violence','Transgender','Trauma and PTSD','TBI','Video Game Addiction','Weight Loss',"Women's Issues"
          ]
        },
        {
          fieldKey: 'provider_marketing_mental_health_categories',
          fieldLabel: 'Mental Health Categories',
          fieldType: 'multi_select',
          options: ['Dissociative Disorders (DID)', 'Elderly Persons Disorders', 'Impulse Control Disorders', 'Mood Disorders', 'Personality Disorders', 'Psychosis', 'Thinking Disorders']
        },
        { fieldKey: 'provider_marketing_sexuality', fieldLabel: 'Sexuality', fieldType: 'multi_select', options: ['Bisexual', 'Lesbian', 'LGBTQ+'] },
        { fieldKey: 'provider_marketing_focus', fieldLabel: 'Focus', fieldType: 'multi_select', options: ['Couples', 'Families', 'Groups', 'Individuals'] },
        { fieldKey: 'provider_marketing_age_specialty', fieldLabel: 'Age Specialty', fieldType: 'multi_select', options: ['Toddler (0-5)', 'Children (6-10)', 'Preteen (11-13)', 'Teen (14-18)', 'Adults (18+)', 'Seniors (65+)'] },
        // Legacy import keys (Employee info import) — keep these visible so migrated data shows up as checked boxes.
        // Gemini/provider search can query these reliably until you fully transition to provider_marketing_* keys.
        { fieldKey: 'age_specialty', fieldLabel: 'Age Specialty (Legacy Import)', fieldType: 'multi_select', options: ['Toddler (0-5)', 'Children (6-10)', 'Preteen (11-13)', 'Teen (14-18)', 'Adults (18+)', 'Seniors (65+)'] },
        {
          fieldKey: 'provider_marketing_communities_allied',
          fieldLabel: 'Communities / Allied',
          fieldType: 'multi_select',
          options: [
            'Aviation Professionals','Bisexual Allied','Blind Allied','Body Positivity','Cancer','Deaf Allied','Gay Allied','HIV/AIDS Allied','Immuno-disorders','Intersex Allied','Lesbian Allied','Little Person Allied','Non-Binary Allied','Open Relationships Non-Monogamy','Queer Allied','Racial Justice Allied','Sex Worker Allied','Sex-Positive/Kink Allied','Single Mother','Transgender Allied','Veterans'
          ]
        },
        {
          fieldKey: 'provider_marketing_treatment_modalities',
          fieldLabel: 'Treatment Modalities (Max 15)',
          fieldType: 'multi_select',
          options: [
            'Acceptance and Commitment (ACT)','Adlerian','AEDP','Applied Behavioral Analysis (ABA)','Art Therapy','Attachment-Based','Biofeedback','Brainspotting','Christian Counseling','Clinical Supervision','Coaching','CBT','CPT','Compassion Focused','Culturally Sensitive','Dance Movement Therapy','DBT','Eclectic','EMDR','Emotionally Focused','Energy Psychology','Existential','Experiential Therapy','Exposure Response Prevention (ERP)','Family/Marital','Family Systems','Feminist','Forensic Psychology','Gestalt','Gottman Method','Humanistic','Hypnotherapy','Integrative','IFS','Interpersonal','Intervention','Jungian','Mindfulness-Based (MBCT)','Motivational Interviewing','Multicultural','Music Therapy','Narrative','Neuro-Linguistic (NLP)','Neurofeedback','Parent-Child Interaction (PCIT)','Person-Centered','Play Therapy','Positive Psychology','Prolonged Exposure Therapy','Psychoanalytic','Psychobiological Approach Couple Therapy','Psychodynamic','Psychological Testing and Evaluation','REBT','Reality Therapy','Relational','Sandplay','Schema Therapy','Solution Focused Brief (SFBT)','Somatic','Strength-Based','Structural Family Therapy','Transpersonal','Trauma Focused','Synergetic Play Therapy'
          ]
        }
        ,
        {
          fieldKey: 'treatment_prefs_max15',
          fieldLabel: 'Treatment Modalities / Preferences (Legacy Import, Max 15)',
          fieldType: 'multi_select',
          options: [
            'Acceptance and Commitment (ACT)','Adlerian','AEDP','Applied Behavioral Analysis (ABA)','Art Therapy','Attachment-Based','Biofeedback','Brainspotting','Christian Counseling','Clinical Supervision','Coaching','CBT','CPT','Compassion Focused','Culturally Sensitive','Dance Movement Therapy','DBT','Eclectic','EMDR','Emotionally Focused','Energy Psychology','Existential','Experiential Therapy','Exposure Response Prevention (ERP)','Family/Marital','Family Systems','Feminist','Forensic Psychology','Gestalt','Gottman Method','Humanistic','Hypnotherapy','Integrative','IFS','Interpersonal','Intervention','Jungian','Mindfulness-Based (MBCT)','Motivational Interviewing','Multicultural','Music Therapy','Narrative','Neuro-Linguistic (NLP)','Neurofeedback','Parent-Child Interaction (PCIT)','Person-Centered','Play Therapy','Positive Psychology','Prolonged Exposure Therapy','Psychoanalytic','Psychobiological Approach Couple Therapy','Psychodynamic','Psychological Testing and Evaluation','REBT','Reality Therapy','Relational','Sandplay','Schema Therapy','Solution Focused Brief (SFBT)','Somatic','Strength-Based','Structural Family Therapy','Transpersonal','Trauma Focused','Synergetic Play Therapy'
          ]
        }
      ]
    },
    {
      title: 'Culture & Bio (Getting to Know You)',
      description: 'Personal questions for company culture and internal bios.',
      categoryKey: 'provider_culture_bio',
      fields: [
        { fieldKey: 'provider_culture_clients_expect', fieldLabel: 'One thing you wish all clients knew / What can clients expect?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_inspires_concerns', fieldLabel: 'What inspires you? What concerns you?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_challenges_finished', fieldLabel: 'Challenges you help with / Definition of "finished" with counseling.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_fun_questions', fieldLabel: '"Fun" Questions (grow up to be / can’t live without / first time / what makes you feel alive).', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_philosophies', fieldLabel: 'Philosophies to share.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_why', fieldLabel: 'Why become a counselor? Why ITSCO?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_personal_public', fieldLabel: 'Personal info to share with the world.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_goals_admin', fieldLabel: 'Goals/Aspirations to share with Admin.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_passions', fieldLabel: 'What are your passions?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_favorite_quotes', fieldLabel: 'Favorite quotes?', fieldType: 'textarea' },
        {
          fieldKey: 'provider_culture_team_activities',
          fieldLabel: 'Team Activities',
          fieldType: 'multi_select',
          options: [
            'Top Golf',
            'Hiking',
            'Road Trips',
            'Camping',
            'Paddle Boarding',
            'UFC nights (Saturdays)',
            'Switchbacks (Soccer)',
            'Dinners/Evening events',
            'Running',
            'Fitness',
            'Aerobic activities (swimming/cycling)'
          ]
        }
      ]
    }
  ]
};

const ensureCategory = async (agencyId, cat) => {
  const existing = (categories.value || []).find((c) => c.category_key === cat.categoryKey && (c.agency_id === agencyId || c.agency_id === null));
  if (existing) return existing;
  const res = await api.post('/user-info-categories', {
    categoryKey: cat.categoryKey,
    categoryLabel: cat.categoryLabel,
    orderIndex: cat.orderIndex,
    agencyId
  });
  return res.data;
};

const fetchFieldDefinitions = async () => {
  const res = await api.get('/user-info-fields');
  return res.data || [];
};

const AGE_SPECIALTY_OPTIONS = ['Toddler (0-5)', 'Children (6-10)', 'Preteen (11-13)', 'Teen (14-18)', 'Adults (18+)', 'Seniors (65+)'];

const DEFAULT_MULTI_SELECT_OPTIONS = Object.freeze({
  age_specialty: AGE_SPECIALTY_OPTIONS,
  provider_marketing_age_specialty: AGE_SPECIALTY_OPTIONS,
  mental_health: [
    'Dissociative Disorders (DID)',
    'Elderly Persons Disorders',
    'Impulse Control Disorders',
    'Mood Disorders',
    'Personality Disorders',
    'Psychosis',
    'Thinking Disorders'
  ],
  provider_marketing_mental_health_categories: [
    'Dissociative Disorders (DID)',
    'Elderly Persons Disorders',
    'Impulse Control Disorders',
    'Mood Disorders',
    'Personality Disorders',
    'Psychosis',
    'Thinking Disorders'
  ],
  sexuality: ['Bisexual', 'Lesbian', 'LGBTQ+'],
  provider_marketing_sexuality: ['Bisexual', 'Lesbian', 'LGBTQ+'],
  groups: ['Couples', 'Families', 'Groups', 'Individuals'],
  provider_marketing_focus: ['Couples', 'Families', 'Groups', 'Individuals'],
  treatment_prefs_max15: null,
  provider_marketing_treatment_modalities: null
});

const applyDefaultFieldOptions = (field) => {
  const fk = String(field?.field_key || '').trim();
  const opts = field?.options;
  const hasOptions = Array.isArray(opts) && opts.length > 0;
  if (hasOptions || !fk) return field;
  const fallback = DEFAULT_MULTI_SELECT_OPTIONS[fk];
  if (Array.isArray(fallback) && fallback.length) {
    return { ...field, options: fallback };
  }
  return field;
};

const pickBestFieldDefinition = (defs, fieldKey, agencyId) => {
  const key = String(fieldKey || '').trim();
  if (!key) return null;
  const matches = (defs || []).filter((d) => String(d?.field_key || '').trim() === key);
  if (!matches.length) return null;
  const aid = agencyId ? Number(agencyId) : null;
  matches.sort((a, b) => {
    const aAgency = aid && Number(a.agency_id) === aid;
    const bAgency = aid && Number(b.agency_id) === aid;
    if (aAgency !== bAgency) return aAgency ? -1 : 1;
    const aPlat = a.is_platform_template === 1 || a.is_platform_template === true;
    const bPlat = b.is_platform_template === 1 || b.is_platform_template === true;
    if (aPlat !== bPlat) return aPlat ? -1 : 1;
    const aNull = a.agency_id === null || a.agency_id === undefined;
    const bNull = b.agency_id === null || b.agency_id === undefined;
    if (aNull !== bNull) return aNull ? -1 : 1;
    return Number(a.id || 0) - Number(b.id || 0);
  });
  return matches[0];
};

const syntheticFieldFromDef = (def) => {
  let options = def?.options ?? null;
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch {
      options = null;
    }
  }
  return applyDefaultFieldOptions({
    ...def,
    value: null,
    hasValue: false,
    options
  });
};

const createFieldDefinition = async (agencyId, field, orderIndex, categoryKey) => {
  const payload = {
    fieldLabel: field.fieldLabel,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    isRequired: !!field.isRequired,
    options: field.options || null,
    orderIndex,
    agencyId,
    categoryKey
  };
  const res = await api.post('/user-info-fields', payload);
  return res.data;
};

const ensureModule = async (agencyId, modTitle, description) => {
  const res = await api.get('/modules');
  const existing = (res.data || []).find((m) => (m.title || '').trim() === modTitle && (m.agency_id === agencyId || m.agencyId === agencyId));
  if (existing) return existing;
  const created = await api.post('/modules', {
    title: modTitle,
    description: description || '',
    agencyId
  });
  return created.data;
};

const setModuleContent = async (moduleId, introText, categoryKey, fieldDefinitionIds) => {
  // Make installation idempotent: remove existing content then re-create.
  const existing = await api.get(`/modules/${moduleId}/content`);
  for (const page of (existing.data || [])) {
    if (page?.id) {
      // ignore delete failures (ex: already removed)
      try {
        await api.delete(`/modules/${moduleId}/content/${page.id}`);
      } catch {
        // noop
      }
    }
  }

  let orderIndex = 0;
  if (introText) {
    await api.post(`/modules/${moduleId}/content`, {
      contentType: 'text',
      contentData: { title: 'Notes', description: introText },
      orderIndex
    });
    orderIndex++;
  }

  await api.post(`/modules/${moduleId}/content`, {
    contentType: 'form',
    contentData: { categoryKey, fieldDefinitionIds, requireAll: false },
    orderIndex
  });
};

const installTemplate = async () => {
  try {
    installing.value = true;
    installError.value = '';
    installSuccess.value = '';

    const agencyId = targetAgency.value?.id;
    if (!agencyId) {
      installError.value = 'Could not determine target agency for template installation.';
      return;
    }

    // Ensure categories exist
    for (const cat of TEMPLATE.categories) {
      await ensureCategory(agencyId, cat);
    }

    // Ensure fields exist
    const defs = await fetchFieldDefinitions();
    const byKey = new Map(defs.filter((d) => (d.agency_id === agencyId || d.agency_id === null)).map((d) => [d.field_key, d]));

    // For location field, hydrate options from office schedule locations if available.
    let locationOptions = [];
    try {
      const locRes = await api.get('/office-schedule/locations');
      locationOptions = (locRes.data || [])
        .filter((l) => l.agency_id === agencyId)
        .map((l) => l.name)
        .filter(Boolean);
    } catch {
      // ok to fall back to empty options
    }

    const createdFieldIdsByKey = new Map();
    for (const mod of TEMPLATE.modules) {
      let idx = 0;
      for (const f of mod.fields) {
        const existing = byKey.get(f.fieldKey);
        if (existing) {
          createdFieldIdsByKey.set(f.fieldKey, existing.id);
          idx++;
          continue;
        }
        const categoryKey = mod.categoryKey;
        const field = { ...f };
        if (field.fieldKey === 'provider_identity_location' && field.fieldType === 'select') {
          field.options = locationOptions;
        }
        const created = await createFieldDefinition(agencyId, field, idx, categoryKey);
        createdFieldIdsByKey.set(field.fieldKey, created.id);
        byKey.set(field.fieldKey, created);
        idx++;
      }
    }

    // Create modules + content
    for (const mod of TEMPLATE.modules) {
      const module = await ensureModule(agencyId, mod.title, mod.description);
      const ids = mod.fields.map((f) => createdFieldIdsByKey.get(f.fieldKey)).filter(Boolean);
      await setModuleContent(module.id, mod.introText || '', mod.categoryKey, ids);
    }

    installSuccess.value = 'Installed Provider Onboarding Modules. Refreshing…';
    await refresh();
  } catch (e) {
    installError.value = e.response?.data?.error?.message || 'Failed to install provider onboarding template';
  } finally {
    installing.value = false;
    setTimeout(() => (installSuccess.value = ''), 3500);
  }
};

onMounted(refresh);

watch(
  () => [props.userId, props.fieldKeys, props.ensureEmptyFields],
  () => refresh(),
  { deep: true }
);

watch(
  () => props.ensureEmptyFields || (props.embedded && Array.isArray(props.fieldKeys) && props.fieldKeys.length),
  (v) => {
    if (v) showEmptyAssignedFields.value = true;
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------
// Public Listings
// ---------------------------------------------------------------------------
const SERVICE_TYPES = [
  { type: 'counseling', label: 'Counseling Finder', description: 'Appears on the public "Find a Counselor" page for this agency.' },
  { type: 'tutoring', label: 'Tutoring Finder', description: 'Appears on the public "Find a Tutor" page. Requires a tutoring profile below.' },
  { type: 'evaluation', label: 'Evaluator', description: 'Can conduct academic evaluations for new tutoring clients who need one before their first session.' }
];

const SUBJECT_OPTIONS = ['Math', 'Reading', 'Writing', 'Science', 'History', 'SAT/ACT Prep', 'Spanish', 'English', 'Study Skills', 'PSAT', 'AP Courses', 'College Prep', 'Other'];
const GRADE_OPTIONS = ['K–2', '3–5', '6–8', '9–12', 'College'];

const listingsLoading = ref(false);
const listingsError = ref('');
const listingsSaving = ref(false);

// enrollment state: { counseling: true|false, tutoring: true|false, evaluation: true|false }
const enrollments = ref({ counseling: false, tutoring: false, evaluation: false });

// tutoring profile form
const tutoringForm = ref({
  subjectAreas: [],
  gradeLevels: [],
  sessionRateDollars: '',
  sessionRateNote: '',
  bio: '',
  acceptingNewStudents: true,
  minSessionPackage: 1,
  paymentPolicy: 'POST_SESSION'
});
const tutoringSaving = ref(false);
const tutoringSaveSuccess = ref('');
const tutoringSaveError = ref('');

async function loadListings() {
  const slug = targetAgency.value?.slug;
  if (!slug) return;
  listingsLoading.value = true;
  listingsError.value = '';
  try {
    const [cRes, tRes, eRes] = await Promise.all([
      api.get(`/public/agency-services/${encodeURIComponent(slug)}/enrollment?serviceType=counseling`, { skipAuthRedirect: true }).catch(() => null),
      api.get(`/public/agency-services/${encodeURIComponent(slug)}/enrollment?serviceType=tutoring`, { skipAuthRedirect: true }).catch(() => null),
      api.get(`/public/agency-services/${encodeURIComponent(slug)}/enrollment?serviceType=evaluation`, { skipAuthRedirect: true }).catch(() => null)
    ]);
    const cEnrollments = cRes?.data?.enrollments || [];
    const tEnrollments = tRes?.data?.enrollments || [];
    const eEnrollments = eRes?.data?.enrollments || [];
    const uid = Number(props.userId);
    enrollments.value.counseling = cEnrollments.some((e) => Number(e.user_id) === uid && e.is_active);
    enrollments.value.tutoring = tEnrollments.some((e) => Number(e.user_id) === uid && e.is_active);
    enrollments.value.evaluation = eEnrollments.some((e) => Number(e.user_id) === uid && e.is_active);

    // Load tutoring profile if enrolled
    if (enrollments.value.tutoring) {
      const profileRes = await api.get(`/public/agency-services/${encodeURIComponent(slug)}/tutoring-profiles/${props.userId}`, { skipAuthRedirect: true }).catch(() => null);
      const p = profileRes?.data?.profile;
      if (p) {
        tutoringForm.value.subjectAreas = Array.isArray(p.subjectAreas) ? p.subjectAreas : [];
        tutoringForm.value.gradeLevels = Array.isArray(p.gradeLevels) ? p.gradeLevels : [];
        tutoringForm.value.sessionRateDollars = p.sessionRateCents ? String(Math.round(p.sessionRateCents / 100)) : '';
        tutoringForm.value.sessionRateNote = p.sessionRateNote || '';
        tutoringForm.value.bio = p.bio || '';
        tutoringForm.value.acceptingNewStudents = p.acceptingNewStudents !== false;
        tutoringForm.value.minSessionPackage = p.minSessionPackage || 1;
        tutoringForm.value.paymentPolicy = p.paymentPolicy || 'POST_SESSION';
      }
    }
  } catch (e) {
    listingsError.value = e.response?.data?.error?.message || 'Failed to load listing settings';
  } finally {
    listingsLoading.value = false;
  }
}

async function toggleEnrollment(serviceType, isActive) {
  const slug = targetAgency.value?.slug;
  if (!slug) return;
  listingsSaving.value = true;
  try {
    await api.post(`/public/agency-services/${encodeURIComponent(slug)}/enrollment`, {
      userId: props.userId,
      serviceType,
      isActive
    }, { skipAuthRedirect: true });
    enrollments.value[serviceType] = isActive;
    if (isActive && serviceType === 'tutoring') await loadListings();
  } catch (e) {
    listingsError.value = e.response?.data?.error?.message || 'Failed to update enrollment';
  } finally {
    listingsSaving.value = false;
  }
}

function toggleSubject(s) {
  const arr = tutoringForm.value.subjectAreas;
  const idx = arr.indexOf(s);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(s);
}

function toggleGrade(g) {
  const arr = tutoringForm.value.gradeLevels;
  const idx = arr.indexOf(g);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(g);
}

async function saveTutoringProfile() {
  const slug = targetAgency.value?.slug;
  if (!slug) return;
  tutoringSaving.value = true;
  tutoringSaveSuccess.value = '';
  tutoringSaveError.value = '';
  try {
    const rateDollars = parseFloat(tutoringForm.value.sessionRateDollars);
    await api.put(`/public/agency-services/${encodeURIComponent(slug)}/tutoring-profiles/${props.userId}`, {
      subjectAreas: tutoringForm.value.subjectAreas,
      gradeLevels: tutoringForm.value.gradeLevels,
      sessionRateCents: Number.isFinite(rateDollars) && rateDollars > 0 ? Math.round(rateDollars * 100) : null,
      sessionRateNote: tutoringForm.value.sessionRateNote || null,
      bio: tutoringForm.value.bio || null,
      acceptingNewStudents: tutoringForm.value.acceptingNewStudents,
      minSessionPackage: tutoringForm.value.minSessionPackage,
      paymentPolicy: tutoringForm.value.paymentPolicy
    }, { skipAuthRedirect: true });
    tutoringSaveSuccess.value = 'Tutoring profile saved.';
    setTimeout(() => (tutoringSaveSuccess.value = ''), 3000);
  } catch (e) {
    tutoringSaveError.value = e.response?.data?.error?.message || 'Failed to save tutoring profile';
  } finally {
    tutoringSaving.value = false;
  }
}

// Load listings after user agencies are loaded
watch(targetAgency, (agency) => {
  if (agency?.slug) loadListings();
});
</script>

<style scoped>
.provider-info-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.provider-info-tab--embedded {
  gap: 12px;
}

.embedded-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tab-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.subtitle {
  margin: 6px 0 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.install-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}

.install-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.small-note {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}

.section-title {
  margin-bottom: 12px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.required-asterisk {
  color: #dc3545;
  margin-left: 4px;
}

.field-item input,
.field-item select,
.field-item textarea {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.checkbox-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #fafbfc;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
}

.empty-state {
  padding: 20px;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #fafafa;
}

.success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 600;
}
</style>

