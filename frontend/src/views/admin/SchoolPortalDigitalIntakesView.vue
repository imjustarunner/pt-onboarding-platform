<template>
  <div class="container spd-page">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!hasSchoolPortalsAccess" class="error spd-banner">
      School Portals is not enabled for this tenant, or you do not have access to this page.
      <router-link class="btn btn-secondary btn-sm spd-back" :to="backTo">Back</router-link>
    </div>
    <div v-else-if="loadError" class="error">{{ loadError }}</div>
    <template v-else>
      <header class="spd-header">
        <div>
          <h1>Digital intakes for this school</h1>
          <p class="muted spd-sub">
            Create or copy <strong>English</strong> and <strong>Spanish</strong> intake links scoped to
            <strong>{{ schoolName }}</strong>. Full form builder remains under Digital Forms in settings.
          </p>
        </div>
        <div class="spd-header-actions">
          <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to portal</router-link>
          <router-link v-if="advancedDigitalFormsTo" class="btn btn-secondary btn-sm" :to="advancedDigitalFormsTo">
            Advanced edit (Digital Forms)
          </router-link>
        </div>
      </header>

      <section v-for="lane in lanes" :key="lane.lang" class="spd-lane">
        <h2 class="spd-lane-title">{{ lane.title }}</h2>
        <p class="muted spd-lane-desc">Active and draft links for this language on this portal.</p>

        <div v-if="laneError[lane.lang]" class="error">{{ laneError[lane.lang] }}</div>

        <ul v-if="linksForLang(lane.lang).length" class="spd-link-list">
          <li v-for="link in linksForLang(lane.lang)" :key="link.id" class="spd-link-row">
            <div>
              <strong>{{ link.title || 'Untitled' }}</strong>
              <span class="spd-badges">
                <span class="badge" :class="link.is_active ? 'badge-success' : 'badge-muted'">
                  {{ link.is_active ? 'Active' : 'Inactive' }}
                </span>
                <span class="badge badge-outline">#{{ link.id }}</span>
              </span>
            </div>
            <div class="spd-link-actions">
              <button
                v-if="!link.is_active"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="savingId === link.id"
                @click="activateLink(link)"
              >
                {{ savingId === link.id ? 'Saving…' : 'Activate' }}
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="muted">No links yet for this language.</p>

        <div class="spd-lane-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="creatingLang === lane.lang"
            @click="createForLang(lane.lang)"
          >
            {{ creatingLang === lane.lang ? 'Creating…' : `Create ${lane.short} form` }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="openCopyModal(lane.lang)">
            Copy from another school…
          </button>
        </div>
      </section>
    </template>

    <div v-if="copyModal.open" class="modal-overlay" @click.self="closeCopyModal">
      <div class="modal spd-copy-modal" role="dialog" aria-modal="true" @click.stop>
        <div class="modal-header">
          <strong>Copy {{ copyModal.lang === 'es' ? 'Spanish' : 'English' }} form</strong>
          <button type="button" class="close" aria-label="Close" @click="closeCopyModal">×</button>
        </div>
        <div class="modal-body">
          <p class="muted">
            Pick a form from another school under the same agency. A new <strong>inactive</strong> copy is created for this
            portal—activate it when ready.
          </p>
          <div v-if="copyModal.loading" class="muted">Loading…</div>
          <div v-else-if="!copyModal.rows.length" class="muted">No other schools have copyable forms for this language.</div>
          <table v-else class="spd-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Title</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in copyModal.rows" :key="row.id">
                <td>{{ row.school_name || row.organization_id }}</td>
                <td>{{ row.title || '—' }}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="copySavingId === row.id"
                    @click="duplicateFrom(row)"
                  >
                    {{ copySavingId === row.id ? 'Copying…' : 'Copy here' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="copyModal.error" class="error">{{ copyModal.error }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { canAccessSchoolPortalsSurfaces } from '../../utils/schoolPortalsAccess.js';
import { getDashboardRoute } from '../../utils/router';

const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const loading = ref(true);
const loadError = ref('');
const schoolOrgId = ref(null);
const schoolName = ref('');
const gateParentAgency = ref(null);
const links = ref([]);
const creatingLang = ref('');
const savingId = ref(null);
const copySavingId = ref(null);
const laneError = reactive({ en: '', es: '' });

const copyModal = reactive({
  open: false,
  lang: 'en',
  loading: false,
  rows: [],
  error: ''
});

const lanes = [
  { lang: 'en', title: 'English', short: 'English' },
  { lang: 'es', title: 'Spanish', short: 'Spanish' }
];

const orgSlug = computed(() => (typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''));

const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/dashboard` : getDashboardRoute()));

const hasSchoolPortalsAccess = computed(() => {
  const parent = gateParentAgency.value;
  if (!parent?.id) return false;
  const pb = brandingStore.platformBranding || {};
  return canAccessSchoolPortalsSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: parent.feature_flags ?? parent.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      parent.tenant_available_agency_features_json ?? parent.tenantAvailableAgencyFeaturesJson
  });
});

const advancedDigitalFormsTo = computed(() => {
  const parent = gateParentAgency.value;
  const pslug = String(parent?.portal_url || parent?.portalUrl || parent?.slug || '').trim();
  if (pslug) return `/${pslug}/admin/digital-forms`;
  return orgSlug.value ? `/${orgSlug.value}/admin/digital-forms` : '/admin/digital-forms';
});

function normLang(lc) {
  const s = String(lc || '').trim().toLowerCase();
  if (s === 'es' || s.startsWith('es')) return 'es';
  return 'en';
}

function linksForLang(lang) {
  return (links.value || []).filter((l) => normLang(l.language_code) === lang);
}

const refreshLinks = async () => {
  if (!schoolOrgId.value) return;
  const res = await api.get(`/school-portal/${schoolOrgId.value}/intake-links`, {
    params: { includeInactive: '1' }
  });
  links.value = Array.isArray(res.data?.links) ? res.data.links : [];
};

const createForLang = async (lang) => {
  laneError[lang] = '';
  creatingLang.value = lang;
  try {
    await api.post(`/school-portal/${schoolOrgId.value}/intake-links/create`, { languageCode: lang });
    await refreshLinks();
  } catch (e) {
    laneError[lang] = e?.response?.data?.error?.message || 'Failed to create link';
  } finally {
    creatingLang.value = '';
  }
};

const activateLink = async (link) => {
  savingId.value = link.id;
  laneError.en = '';
  laneError.es = '';
  try {
    await api.put(`/school-portal/${schoolOrgId.value}/intake-links/${link.id}/activate`, {});
    await refreshLinks();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || 'Failed to activate';
    laneError[normLang(link.language_code)] = msg;
  } finally {
    savingId.value = null;
  }
};

const openCopyModal = async (lang) => {
  copyModal.open = true;
  copyModal.lang = lang;
  copyModal.loading = true;
  copyModal.rows = [];
  copyModal.error = '';
  try {
    const res = await api.get(`/school-portal/${schoolOrgId.value}/intake-links/copy-sources`, {
      params: { languageCode: lang }
    });
    copyModal.rows = Array.isArray(res.data?.links) ? res.data.links : [];
  } catch (e) {
    copyModal.error = e?.response?.data?.error?.message || 'Failed to load sources';
  } finally {
    copyModal.loading = false;
  }
};

const closeCopyModal = () => {
  copyModal.open = false;
  copyModal.rows = [];
  copyModal.error = '';
};

const duplicateFrom = async (row) => {
  copySavingId.value = row.id;
  copyModal.error = '';
  try {
    await api.post(`/school-portal/${schoolOrgId.value}/intake-links/duplicate-from`, {
      sourceLinkId: row.id,
      languageCode: copyModal.lang
    });
    await refreshLinks();
    closeCopyModal();
  } catch (e) {
    copyModal.error = e?.response?.data?.error?.message || 'Failed to copy form';
  } finally {
    copySavingId.value = null;
  }
};

onMounted(async () => {
  loading.value = true;
  loadError.value = '';
  try {
    if (!brandingStore.platformBranding) {
      await brandingStore.fetchPlatformBranding();
    }
    const slug = orgSlug.value;
    if (!slug) {
      loadError.value = 'Missing organization in URL.';
      return;
    }
    const orgRes = await api.get(`/agencies/slug/${encodeURIComponent(slug)}`);
    const org = orgRes.data;
    const id = org?.id ? Number(org.id) : null;
    if (!id) {
      loadError.value = 'Organization not found.';
      return;
    }
    const t = String(org.organization_type || org.organizationType || '').toLowerCase();
    if (!['school', 'program', 'learning'].includes(t)) {
      loadError.value = 'This page is only available from a school, program, or learning portal.';
      return;
    }
    schoolOrgId.value = id;
    schoolName.value = String(org.name || org.official_name || slug).trim() || 'School';

    const parentId = Number(org.affiliated_agency_id || org.affiliatedAgencyId || 0);
    if (!parentId) {
      loadError.value = 'No affiliated agency is configured for this organization.';
      return;
    }
    const parRes = await api.get(`/agencies/${parentId}`);
    gateParentAgency.value = parRes.data || null;

    if (!hasSchoolPortalsAccess.value) {
      return;
    }
    await refreshLinks();
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.spd-page {
  padding-top: 1rem;
  padding-bottom: 2rem;
  max-width: 800px;
}
.spd-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}
.spd-header h1 {
  margin: 0 0 6px;
  font-size: 1.5rem;
}
.spd-sub {
  margin: 0;
  max-width: 40rem;
  line-height: 1.45;
}
.spd-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.spd-banner {
  padding: 12px 14px;
  border-radius: 8px;
}
.spd-back {
  margin-top: 10px;
  display: inline-block;
}
.spd-lane {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 16px;
  background: var(--panel, #fff);
}
.spd-lane-title {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.spd-lane-desc {
  margin: 0 0 12px;
  font-size: 0.9rem;
}
.spd-link-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}
.spd-link-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.spd-link-row:last-child {
  border-bottom: none;
}
.spd-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: 8px;
  vertical-align: middle;
}
.spd-lane-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 16px;
}
.spd-copy-modal {
  width: 100%;
  max-width: 560px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.modal-body {
  padding: 14px 16px 18px;
}
.close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
}
.spd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.spd-table th,
.spd-table td {
  border: 1px solid var(--border, #e2e8f0);
  padding: 8px 10px;
  text-align: left;
}
.badge-muted {
  background: #f1f5f9;
  color: #475569;
}
</style>
