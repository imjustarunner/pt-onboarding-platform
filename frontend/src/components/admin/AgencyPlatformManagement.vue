<template>
  <div class="agency-platform-management">
    <div v-if="!embedInHub" class="section-header">
      <h2>{{ pageTitle }}</h2>
      <p class="section-description">
        {{ pageDescription }}
      </p>
    </div>

    <div v-if="!agencyStore.currentAgency" class="empty-state">
      <p>{{ emptyMessage }}</p>
    </div>

    <template v-else>
      <div class="settings-section">
        <h3>Status & Identity</h3>
        <p class="section-description">
          Active flag, portal slug, and affiliation. Tenant admins cannot change these—only superadmin.
        </p>
        <form @submit.prevent="save" class="platform-form">
          <div class="form-grid">
            <div class="form-group">
              <label>Active</label>
              <select v-model="form.isActive">
                <option :value="true">Active</option>
                <option :value="false">Inactive</option>
              </select>
              <small>Inactive agencies cannot log in. Use Archive for permanent removal.</small>
            </div>
            <div class="form-group">
              <label>Slug (URL identifier)</label>
              <input v-model="form.slug" type="text" pattern="[a-z0-9-]+" placeholder="e.g. acme-health" />
              <small>Lowercase letters, numbers, hyphens only. Used in portal URLs (e.g. /acme-health/login).</small>
            </div>
            <div class="form-group">
              <label>Organization type</label>
              <select v-model="form.organizationType" disabled>
                <option value="agency">Agency</option>
                <option value="school">School</option>
                <option value="program">Program</option>
                <option value="learning">Learning</option>
                <option value="clinical">Clinical</option>
                <option value="office">Building</option>
              </select>
              <small>Cannot be changed after creation.</small>
            </div>
            <div v-if="form.organizationType && form.organizationType !== 'agency'" class="form-group">
              <label>Affiliated agency</label>
              <select v-model="form.affiliatedAgencyId">
                <option value="">Select agency…</option>
                <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">
                  {{ a.name }}
                </option>
              </select>
              <small>Parent agency for schools/programs/learning orgs.</small>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : saveIdentityLabel }}
            </button>
          </div>
        </form>
      </div>

      <div class="settings-section">
        <h3>{{ managedFlagsHeading }}</h3>
        <p class="section-description">
          Superadmin-only toggles for <strong>this tenant</strong>. Everything else is in Company Profile or the feature tables on this organization’s Overview.
        </p>
        <div class="form-grid">
          <div class="form-group checkbox">
            <label>
              <input v-model="form.featureFlags.noteAidEnabled" type="checkbox" />
              Note Aid enabled
            </label>
          </div>
          <div class="form-group checkbox">
            <label>
              <input v-model="form.featureFlags.publicAvailabilityEnabled" type="checkbox" />
              Public availability enabled
            </label>
          </div>
          <div class="form-group checkbox">
            <label>
              <input v-model="form.featureFlags.bookClubEnabled" type="checkbox" />
              Book Club enabled
            </label>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" @click="save" :disabled="saving">
            {{ saving ? 'Saving...' : saveFlagsLabel }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  /** When true, outer title/description is omitted (e.g. wrapped by organization Overview hub). */
  embedInHub: { type: Boolean, default: false }
});

const agencyStore = useAgencyStore();

const pageTitle = computed(() => 'Tenant identity (superadmin)');

const pageDescription = computed(
  () =>
    'These apply to the tenant selected in Settings. Tenant admins cannot edit them—only superadmin.'
);

const emptyMessage = computed(() =>
  props.embedInHub
    ? 'Select a tenant in Tenant context at the top of Settings.'
    : 'Select a tenant above to edit identity and managed flags.'
);

const saveIdentityLabel = computed(() => 'Save identity & URL');
const saveFlagsLabel = computed(() => 'Save managed flags');
const managedFlagsHeading = computed(() => 'Superadmin-managed flags');

const form = ref({
  isActive: true,
  slug: '',
  organizationType: 'agency',
  affiliatedAgencyId: '',
  featureFlags: {
    noteAidEnabled: false,
    publicAvailabilityEnabled: false,
    bookClubEnabled: false
  }
});

const saving = ref(false);
const agencyOptions = ref([]);
let lastLoadedFlags = {};

const loadAgency = async () => {
  const agency = agencyStore.currentAgency;
  if (!agency?.id) return;

  try {
    const res = await api.get(`/agencies/${agency.id}`);
    const a = res.data;
    const flags = typeof a.feature_flags === 'string'
      ? (() => { try { return JSON.parse(a.feature_flags || '{}'); } catch { return {}; } })()
      : (a.feature_flags || {});
    lastLoadedFlags = { ...flags };

    form.value = {
      isActive: a.is_active !== false && a.is_active !== 0,
      slug: a.slug || '',
      organizationType: (a.organization_type || a.organizationType || 'agency').toLowerCase(),
      affiliatedAgencyId: a.affiliated_agency_id != null ? String(a.affiliated_agency_id) : '',
      featureFlags: {
        noteAidEnabled: flags.noteAidEnabled === true || flags.noteAidEnabled === 1,
        publicAvailabilityEnabled: flags.publicAvailabilityEnabled === true || flags.publicAvailabilityEnabled === 1,
        bookClubEnabled: flags.bookClubEnabled === true || flags.bookClubEnabled === 1
      }
    };
  } catch (err) {
    console.error('Failed to load agency:', err);
  }
};

const loadAgencyOptions = async () => {
  try {
    const res = await api.get('/agencies');
    agencyOptions.value = (res.data || []).filter(
      (a) => String(a.organization_type || 'agency').toLowerCase() === 'agency'
    );
  } catch {
    agencyOptions.value = [];
  }
};

const save = async () => {
  const agency = agencyStore.currentAgency;
  if (!agency?.id) return;

  try {
    saving.value = true;
    const mergedFlags = { ...lastLoadedFlags };
    mergedFlags.noteAidEnabled = form.value.featureFlags.noteAidEnabled;
    mergedFlags.publicAvailabilityEnabled = form.value.featureFlags.publicAvailabilityEnabled;
    mergedFlags.bookClubEnabled = form.value.featureFlags.bookClubEnabled;

    await api.put(`/agencies/${agency.id}`, {
      isActive: form.value.isActive,
      slug: form.value.slug?.trim() || undefined,
      affiliatedAgencyId: form.value.affiliatedAgencyId ? parseInt(form.value.affiliatedAgencyId, 10) : undefined,
      featureFlags: mergedFlags
    });
    await agencyStore.fetchAgencies();
    if (agencyStore.currentAgency?.id === agency.id) {
      agencyStore.setCurrentAgency({ ...agencyStore.currentAgency, is_active: form.value.isActive, slug: form.value.slug });
    }
    alert('Tenant identity and flags saved.');
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.message || 'Failed to save';
    alert(msg);
  } finally {
    saving.value = false;
  }
};

watch(() => agencyStore.currentAgency?.id, loadAgency, { immediate: false });
onMounted(async () => {
  await loadAgencyOptions();
  await loadAgency();
});
</script>

<style scoped>
.agency-platform-management {
  padding: 0;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.section-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.settings-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.settings-section:last-child {
  border-bottom: none;
}

.settings-section h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.form-actions {
  margin-top: 16px;
}

.empty-state {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
