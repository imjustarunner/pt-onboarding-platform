<template>
  <div class="container">
    <div class="page-header" data-tour="schools-overview-header">
      <div class="header-left">
        <h1 data-tour="schools-overview-title">{{ pageTitle }}</h1>
        <span class="badge badge-info">Admin</span>
      </div>
      <div class="header-actions" data-tour="schools-overview-actions">
        <router-link class="btn btn-secondary" to="/admin/clients">Back to Client Management</router-link>
        <button class="btn btn-secondary" type="button" :disabled="loading" @click="refresh">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="controls" data-tour="schools-overview-controls">
      <div v-if="isSuperAdmin" class="control" data-tour="schools-overview-agency">
        <label class="control-label">Agency</label>
        <select v-model="selectedAgencyId" class="control-select">
          <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">
            {{ a.name }}
          </option>
        </select>
      </div>

      <div class="control" style="flex: 1;">
        <label class="control-label">Search</label>
        <input v-model="searchQuery" class="control-input" type="text" :placeholder="searchPlaceholder" data-tour="schools-overview-search" />
      </div>

      <div class="control">
        <label class="control-label">Sort</label>
        <select v-model="sortBy" class="control-select">
          <option value="school_name-asc">Name (A–Z)</option>
          <option value="school_name-desc">Name (Z–A)</option>
          <option value="district_name-asc">District (A–Z)</option>
          <option value="district_name-desc">District (Z–A)</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading school overview…</div>

    <div v-else class="cards-wrap">
      <div v-if="filteredSchools.length === 0" class="empty-state">
        {{ emptyStateText }}
      </div>

      <div v-else class="cards-grid" data-tour="schools-overview-cards">
        <div
          v-for="s in filteredSchools"
          :key="s.school_id"
          class="school-card"
          data-tour="schools-overview-card"
          role="button"
          tabindex="0"
          :class="{ 'skills-active': s.skills_group_occurring_now }"
          @click="openSchool(s)"
          @keydown.enter.prevent="openSchool(s)"
          @keydown.space.prevent="openSchool(s)"
        >
          <div class="card-head">
            <div class="card-title">
              <div class="school-name">{{ s.school_name }}</div>
              <div class="school-meta">
                <span class="pill">{{ formatOrgType(s.organization_type) }}</span>
                <span v-if="s.district_name" class="pill pill-muted">{{ s.district_name }}</span>
                <button
                  v-if="Number(s.skills_groups_count || 0) > 0"
                  type="button"
                  class="sg-icon-btn"
                  title="Open Skills Groups in School Portal"
                  @click.stop="goToSchoolSkillsGroups(s)"
                >
                  <img v-if="skillBuildersIconUrl" :src="skillBuildersIconUrl" alt="" class="sg-icon-img" />
                  <span v-else aria-hidden="true" class="sg-icon-fallback">SB</span>
                </button>
                <span
                  v-for="g in (Array.isArray(s.active_skills_groups) ? s.active_skills_groups : [])"
                  :key="`asg-${s.school_id}-${g.skills_group_id}`"
                  class="pill pill-sg-badge"
                  title="Active Skills Group participants"
                >
                  SG
                  <span class="sg-count">{{ Number(g.participants_count || 0) }}</span>
                </span>
                <span v-if="!s.is_active" class="pill pill-warn">Inactive</span>
                <span v-if="s.is_archived" class="pill pill-warn">Archived</span>
                <span v-if="s.skills_group_occurring_now" class="pill pill-accent">Skills Group Live</span>
              </div>
            </div>
            <div class="card-cta">Open</div>
          </div>

          <div class="stats-grid">
            <div class="stat">
              <div class="stat-label">Students (Current)</div>
              <div class="stat-value">{{ s.clients_current }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Students (Assigned)</div>
              <div class="stat-value">{{ s.clients_assigned }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Providers</div>
              <div class="stat-value">{{ s.providers_count }}</div>
            </div>
            <div
              class="stat stat-notifications"
              :class="{ active: Number(s.notifications_count || 0) > 0 }"
              role="button"
              tabindex="0"
              @click.stop="openSchoolNotifications(s)"
              @keydown.enter.prevent="openSchoolNotifications(s)"
              @keydown.space.prevent="openSchoolNotifications(s)"
            >
              <div class="stat-label">Notifications</div>
              <div class="stat-value" :class="{ attention: Number(s.notifications_count || 0) > 0 }">
                {{ s.notifications_count }}
              </div>
            </div>
            <div class="stat">
              <div class="stat-label">Slots Available</div>
              <div class="stat-value">{{ s.slots_available }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Waitlist</div>
              <div class="stat-value">{{ s.waitlist_count }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Docs / Needs</div>
              <div class="stat-value" :class="{ danger: s.docs_needs_count > 0 }">{{ s.docs_needs_count }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Skills Participants</div>
              <div class="stat-value">{{ sumSkillsParticipants(s) }}</div>
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
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();

const loading = ref(false);
const error = ref('');
const schools = ref([]);
const searchQuery = ref('');
const sortBy = ref('school_name-asc');

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const orgType = computed(() => {
  const t = String(route.query?.orgType || '').trim().toLowerCase();
  if (t === 'school' || t === 'program' || t === 'learning') return t;
  return null;
});

const pageTitle = computed(() => {
  if (orgType.value === 'program') return 'Program Overview';
  if (orgType.value === 'learning') return 'Learning Overview';
  return 'School Overview';
});

const searchPlaceholder = computed(() => {
  if (orgType.value === 'program') return 'Search by program name…';
  if (orgType.value === 'learning') return 'Search by learning org name…';
  return 'Search by school name…';
});

const emptyStateText = computed(() => {
  if (orgType.value === 'program') return 'No affiliated programs or learning orgs found for this agency.';
  if (orgType.value === 'learning') return 'No affiliated learning orgs found for this agency.';
  return 'No affiliated schools found for this agency.';
});

const agencyOptions = ref([]);
const selectedAgencyId = ref('');

const resolveDefaultAgencyId = () => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const currentType = String(current?.organization_type || 'agency').toLowerCase();
  if (current?.id && currentType === 'agency') return String(current.id);

  const fromStore = isSuperAdmin.value ? (agencyStore.agencies?.value || agencyStore.agencies) : (agencyStore.userAgencies?.value || agencyStore.userAgencies);
  const firstAgency = (fromStore || []).find((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
  return firstAgency?.id ? String(firstAgency.id) : '';
};

const fetchAgenciesForPicker = async () => {
  if (!isSuperAdmin.value) return;
  try {
    const res = await api.get('/agencies');
    const raw = Array.isArray(res.data) ? res.data : [];
    agencyOptions.value = raw
      .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  } catch {
    agencyOptions.value = [];
  }
};

const fetchOverview = async () => {
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (!agencyId) {
    schools.value = [];
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/dashboard/school-overview', { params: { agencyId, orgType: orgType.value || undefined } });
    schools.value = res.data?.schools || [];
  } catch (e) {
    schools.value = [];
    error.value = e?.response?.data?.error?.message || 'Failed to load school overview';
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  await fetchOverview();
};

const filteredSchools = computed(() => {
  const q = String(searchQuery.value || '').trim().toLowerCase();
  const base = q
    ? (schools.value || []).filter((s) => String(s?.school_name || '').toLowerCase().includes(q))
    : (schools.value || []);

  const [field, dirRaw] = String(sortBy.value || 'school_name-asc').split('-');
  const dir = dirRaw === 'desc' ? -1 : 1;
  const norm = (v) => String(v || '').trim().toLowerCase();
  const getVal = (s) => {
    if (field === 'district_name') return norm(s?.district_name || '');
    if (field === 'school_name') return norm(s?.school_name || '');
    return norm(s?.[field]);
  };

  return base.slice().sort((a, b) => {
    const av = getVal(a);
    const bv = getVal(b);
    const cmp = av.localeCompare(bv);
    if (cmp !== 0) return cmp * dir;
    return Number(a?.school_id || 0) - Number(b?.school_id || 0);
  });
});

const formatOrgType = (t) => {
  const k = String(t || '').toLowerCase();
  if (!k) return 'Org';
  if (k === 'school') return 'School';
  if (k === 'program') return 'Program';
  if (k === 'learning') return 'Learning';
  return k;
};

const openSchool = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard`);
};

const skillBuildersIconUrl = computed(() => {
  try {
    return brandingStore.getAdminQuickActionIconUrl('skill_builders_availability', agencyStore.currentAgency || null);
  } catch {
    return null;
  }
});

const goToSchoolSkillsGroups = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard?sp=skills`);
};

const openSchoolNotifications = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard?sp=notifications`);
};

const sumSkillsParticipants = (school) => {
  const groups = Array.isArray(school?.active_skills_groups) ? school.active_skills_groups : [];
  return groups.reduce((acc, g) => acc + Number(g?.participants_count || 0), 0);
};

watch(
  () => selectedAgencyId.value,
  async () => {
    await fetchOverview();
  }
);

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  await fetchAgenciesForPicker();
  selectedAgencyId.value = resolveDefaultAgencyId();
  await fetchOverview();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border);
  gap: 12px;
}
@media (max-width: 820px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .header-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.header-left h1 {
  margin: 0;
}
.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: end;
  margin-bottom: 16px;
}
.control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}
.control-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.control-input,
.control-select {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
}

.cards-wrap {
  margin-top: 10px;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
@media (max-width: 900px) {
  .cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}
.school-card {
  text-align: left;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.school-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.school-card.skills-active {
  border-color: var(--accent);
  box-shadow: var(--shadow);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 10px;
  margin-bottom: 12px;
}
.school-name {
  font-weight: 900;
  color: var(--text-primary);
  line-height: 1.2;
}
.school-meta {
  margin-top: 6px;
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.pill-icon {
  padding: 3px 8px;
  cursor: pointer;
  gap: 6px;
}
.pill-icon:hover {
  background: rgba(255, 255, 255, 0.08);
}
.pill-icon-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  display: block;
}

/* Skills icon should not be nested in a "pill" bubble */
.sg-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
}
.sg-icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.sg-icon-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}
.sg-icon-fallback {
  font-size: 12px;
  font-weight: 900;
  color: var(--text-secondary);
}
.pill-warn {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #92400e;
}
.pill-accent {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.35);
  color: #9a3412;
}
.pill-sg-badge {
  background: rgba(16, 185, 129, 0.10);
  border-color: rgba(16, 185, 129, 0.28);
  color: #065f46;
  gap: 6px;
}
.sg-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.35);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}
.card-cta {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  white-space: nowrap;
  padding-top: 2px;
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-xs {
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.1;
}

.btn-danger {
  background: #dc2626;
  border-color: #dc2626;
  color: white;
}
.btn-danger:hover {
  background: #b91c1c;
  border-color: #b91c1c;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 980px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.stat {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}
.stat-notifications {
  cursor: pointer;
  border-color: rgba(14, 165, 233, 0.35);
  background: rgba(14, 165, 233, 0.08);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-notifications:hover {
  border-color: rgba(14, 165, 233, 0.65);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-notifications.active {
  border-color: rgba(14, 165, 233, 0.75);
  background: rgba(14, 165, 233, 0.16);
}
.stat-notifications .stat-label {
  color: #0369a1;
}
.stat-notifications .stat-value {
  color: #0c4a6e;
}
.stat-value.attention {
  color: #0c4a6e;
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
  line-height: 1.2;
}
.stat-value {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 900;
  color: var(--text-primary);
}
.stat-value.danger {
  color: #dc2626;
}

.empty-state {
  text-align: center;
  padding: 28px;
  color: var(--text-secondary);
  background: white;
  border: 1px dashed var(--border);
  border-radius: 12px;
}
</style>

