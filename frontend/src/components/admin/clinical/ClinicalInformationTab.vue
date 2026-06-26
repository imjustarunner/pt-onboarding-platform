<template>
  <div class="clinical-information-tab">
    <div class="ci-header">
      <div class="ci-header-text">
        <h2>Clinical Information</h2>
        <p class="ci-subtitle">
          Profile data from onboarding forms — used for client matching, directory search, and public booking filters.
        </p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="refresh">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="loading" class="loading">Loading clinical profile…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <nav class="ci-subtabs" aria-label="Clinical information sections">
        <button
          v-for="tab in visibleSubTabs"
          :key="tab.id"
          type="button"
          :class="['ci-subtab', { active: activeSubTab === tab.id }]"
          @click="activeSubTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-if="activeSubTab === 'overview'" class="ci-overview-layout">
        <div class="ci-overview-main">
          <ClinicalOverviewView
            :fields="clinicalFields"
            :can-edit="canEdit"
            @edit-section="onEditSection"
          />
        </div>
        <aside class="ci-snapshot">
          <div class="ci-snapshot-title">Clinical Snapshot</div>
          <p class="ci-snapshot-hint">Quick reference for assignment and public matching.</p>
          <div v-for="item in snapshotItems" :key="item.id" class="ci-snapshot-row">
            <div class="ci-snapshot-label">{{ item.label }}</div>
            <div class="ci-snapshot-value" :class="{ 'ci-snapshot-value--empty': item.value === '—' }">
              {{ item.value }}
            </div>
          </div>
        </aside>
      </div>

      <div v-else class="ci-panel">
        <ProviderInfoTab
          :user-id="userId"
          embedded
          ensure-empty-fields
          :field-keys="activeFieldKeys"
          :field-groups="activeFieldGroups"
          :panel-title="activeSubTabLabel"
          :panel-hint="activePanelHint"
          :clinical-filter="true"
        />
      </div>

      <div v-if="activeSubTab !== 'all_fields'" class="ci-footer-note">
        <span class="muted">
          Fields can be edited here directly — no form assignment required. Blank multi-selects mean open to all clients for matching.
          See also
          <button type="button" class="link-btn" @click="activeSubTab = 'all_fields'">All Profile Fields</button>.
        </span>
      </div>

      <details class="ci-bulk-section">
        <summary>Agency bulk import data</summary>
        <p class="muted ci-bulk-hint">Legacy spreadsheet columns stored separately from form modules.</p>
        <UserInformationTab :user-id="userId" />
      </details>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import {
  CLINICAL_SNAPSHOT_SPECS,
  CLINICAL_SUB_TABS,
  fieldGroupsForSubTab,
  fieldKeysForSubTab,
  isClinicalProfileField,
  panelHintForSubTab
} from '../../../constants/clinicalProfileLayout.js';
import { formatSnapshotValue } from '../../../utils/clinicalFieldDisplay.js';
import ClinicalOverviewView from './ClinicalOverviewView.vue';
import ProviderInfoTab from '../ProviderInfoTab.vue';
import UserInformationTab from '../UserInformationTab.vue';

const props = defineProps({
  userId: { type: Number, required: true }
});

const authStore = useAuthStore();
const canEdit = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support', 'staff'].includes(role);
});

const loading = ref(true);
const error = ref('');
const allFields = ref([]);
const activeSubTab = ref('overview');

const clinicalFields = computed(() =>
  (allFields.value || []).filter((f) => isClinicalProfileField(f))
);

const visibleSubTabs = CLINICAL_SUB_TABS;

const activeSubTabLabel = computed(() =>
  CLINICAL_SUB_TABS.find((t) => t.id === activeSubTab.value)?.label || ''
);

const activeFieldKeys = computed(() => {
  if (activeSubTab.value === 'all_fields') return null;
  return fieldKeysForSubTab(activeSubTab.value);
});

const activeFieldGroups = computed(() => fieldGroupsForSubTab(activeSubTab.value));

const activePanelHint = computed(() => panelHintForSubTab(activeSubTab.value));

const fieldByKey = computed(() => {
  const map = new Map();
  for (const f of clinicalFields.value) {
    const k = String(f?.field_key || '').trim();
    if (k && !map.has(k)) map.set(k, f);
  }
  return map;
});

const snapshotItems = computed(() =>
  CLINICAL_SNAPSHOT_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    value: formatSnapshotValue(fieldByKey.value, spec)
  }))
);

const onEditSection = (subTabId) => {
  if (subTabId) activeSubTab.value = subTabId;
};

const refresh = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get(`/users/${props.userId}/user-info`, {
      params: { assignedOrHasValueOnly: true }
    });
    allFields.value = res.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load clinical profile';
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.userId,
  () => refresh(),
  { immediate: true }
);
</script>

<style scoped>
.clinical-information-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ci-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.ci-header-text h2 {
  margin: 0;
  font-size: 22px;
}
.ci-subtitle {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  max-width: 640px;
}
.ci-subtabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border, #e5e7eb);
  overflow-x: auto;
  margin-bottom: 16px;
  -webkit-overflow-scrolling: touch;
}
.ci-subtab {
  flex-shrink: 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.ci-subtab:hover {
  color: var(--text-primary);
}
.ci-subtab.active {
  color: #065f46;
  border-bottom-color: #10b981;
}
.ci-overview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 16px;
  align-items: start;
}
.ci-overview-main {
  min-width: 0;
}
.ci-snapshot {
  position: sticky;
  top: 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: #f8fafc;
  padding: 14px;
}
.ci-snapshot-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 4px;
}
.ci-snapshot-hint {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.ci-snapshot-row + .ci-snapshot-row {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.ci-snapshot-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ci-snapshot-value {
  font-size: 13px;
  font-weight: 600;
  margin-top: 3px;
  line-height: 1.4;
}
.ci-snapshot-value--empty {
  color: var(--text-secondary);
  font-weight: 500;
}
.ci-panel {
  min-height: 80px;
}
.ci-footer-note {
  margin-top: 14px;
  font-size: 13px;
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--primary, #059669);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
.ci-bulk-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.ci-bulk-section summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-secondary);
  user-select: none;
}
.ci-bulk-hint {
  margin: 8px 0 12px;
  font-size: 13px;
}
@media (max-width: 1024px) {
  .ci-overview-layout {
    grid-template-columns: 1fr;
  }
  .ci-snapshot {
    position: static;
    order: -1;
  }
}
</style>
