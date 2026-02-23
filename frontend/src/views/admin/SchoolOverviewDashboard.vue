<template>
  <div class="container">
    <div class="page-header" data-tour="schools-overview-header">
      <div class="header-left">
        <h1 data-tour="schools-overview-title">{{ pageTitle }}</h1>
        <span class="badge badge-info">Admin</span>
      </div>
      <div class="header-actions" data-tour="schools-overview-actions">
        <router-link class="btn btn-secondary" to="/admin/clients">Back to Client Management</router-link>
        <router-link class="btn btn-secondary" :to="showAllPortalsTo">Show All School Portals</router-link>
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

      <div class="control control-search" style="flex: 1;">
        <label class="control-label">Search</label>
        <div class="search-row">
          <input
            v-model="searchQuery"
            class="control-input control-input-search"
            type="text"
            :placeholder="searchPlaceholder"
            data-tour="schools-overview-search"
          />
          <div v-if="districtOptions.length > 1" class="district-buttons" role="group" aria-label="District filter">
            <button
              v-for="d in districtOptions"
              :key="`district-${d.value}`"
              type="button"
              class="district-btn"
              :class="{ active: selectedDistrict === d.value }"
              @click="selectedDistrict = d.value"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
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

      <!-- Show All School Portals: small cards (school name + icon) like My Dashboard -->
      <div
        v-else-if="isAllPortalsPage"
        class="portal-cards-grid"
        data-tour="schools-overview-cards"
      >
        <button
          v-for="s in filteredSchools"
          :key="s.school_id"
          type="button"
          class="portal-card"
          data-tour="schools-overview-card"
          @click="openSchool(s)"
        >
          <div class="portal-card-logo">
            <img
              v-if="schoolLogoUrl(s) && !failedCardLogoIds.has(String(s.school_id))"
              :src="schoolLogoUrl(s)"
              :alt="`${s.school_name} logo`"
              class="portal-card-logo-img"
              @error="onCardLogoError(s.school_id)"
            />
            <div v-else class="portal-card-logo-fallback" aria-hidden="true">
              {{ schoolInitials(s) }}
            </div>
          </div>
          <div class="portal-card-body">
            <div class="portal-card-name">{{ s.school_name }}</div>
            <div class="portal-card-type">{{ formatOrgType(s.organization_type) }}</div>
          </div>
          <div class="portal-card-cta">Open portal</div>
        </button>
      </div>

      <!-- School Overview: full stats cards -->
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
            <div
              class="stat stat-clickable"
              role="button"
              tabindex="0"
              @click.stop="cycleStudentStatus(s)"
              @keydown.enter.prevent="cycleStudentStatus(s)"
              @keydown.space.prevent="cycleStudentStatus(s)"
            >
              <div class="stat-label">{{ studentStatusLabel(s) }}</div>
              <div class="stat-value">{{ studentStatusValue(s) }}</div>
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
            <div
              class="stat stat-comments"
              :class="{ active: Number(s.notifications_comments_count || 0) > 0 }"
              role="button"
              tabindex="0"
              @click.stop="openSchoolNotificationsFiltered(s, 'comments')"
              @keydown.enter.prevent="openSchoolNotificationsFiltered(s, 'comments')"
              @keydown.space.prevent="openSchoolNotificationsFiltered(s, 'comments')"
            >
              <div class="stat-label">New Comments</div>
              <div class="stat-value" :class="{ attention: Number(s.notifications_comments_count || 0) > 0 }">
                {{ s.notifications_comments_count }}
              </div>
            </div>
            <div
              class="stat stat-messages"
              :class="{ active: Number(s.notifications_messages_count || 0) > 0 }"
              role="button"
              tabindex="0"
              @click.stop="openSchoolNotificationsFiltered(s, 'messages')"
              @keydown.enter.prevent="openSchoolNotificationsFiltered(s, 'messages')"
              @keydown.space.prevent="openSchoolNotificationsFiltered(s, 'messages')"
            >
              <div class="stat-label">New Messages</div>
              <div class="stat-value" :class="{ attention: Number(s.notifications_messages_count || 0) > 0 }">
                {{ s.notifications_messages_count }}
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
            <div
              class="stat stat-clickable"
              role="button"
              tabindex="0"
              @click.stop="openSkillsUnassigned(s)"
              @keydown.enter.prevent="openSkillsUnassigned(s)"
              @keydown.space.prevent="openSkillsUnassigned(s)"
            >
              <div class="stat-label">Skills Groups</div>
              <div class="stat-value">{{ Number(s.skills_clients_unassigned_count || 0) }}</div>
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
import { toUploadsUrl } from '../../utils/uploadsUrl';

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
const selectedDistrict = ref('all');
const failedCardLogoIds = ref(new Set());

function schoolLogoUrl(school) {
  const candidates = [
    school?.logo_path,
    school?.icon_file_path,
    school?.icon_path,
    school?.logo_url,
    school?.icon_url
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return toUploadsUrl(s);
}

function schoolInitials(school) {
  const parts = String(school?.school_name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function onCardLogoError(schoolId) {
  failedCardLogoIds.value = new Set([...failedCardLogoIds.value, String(schoolId)]);
}

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const orgType = computed(() => {
  const t = String(route.query?.orgType || '').trim().toLowerCase();
  if (t === 'school' || t === 'program' || t === 'learning') return t;
  return 'school';
});
const isAllPortalsPage = computed(() => String(route.name || '') === 'SchoolPortals' || String(route.name || '') === 'OrganizationSchoolPortals');
const showAllPortalsTo = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug : '';
  return slug ? `/${slug}/admin/school-portals` : '/admin/school-portals';
});

const pageTitle = computed(() => {
  if (isAllPortalsPage.value) return 'Show All School Portals';
  if (orgType.value === 'program') return 'Program Overview';
  if (orgType.value === 'learning') return 'Learning Overview';
  return 'School Overview';
});

const searchPlaceholder = computed(() => {
  if (isAllPortalsPage.value) return 'Search by school/program/learning portal name…';
  if (orgType.value === 'program') return 'Search by program name…';
  if (orgType.value === 'learning') return 'Search by learning org name…';
  return 'Search by school name…';
});

const emptyStateText = computed(() => {
  if (isAllPortalsPage.value) return 'No affiliated school/program/learning portals found for this agency.';
  if (orgType.value === 'program') return 'No affiliated programs or learning orgs found for this agency.';
  if (orgType.value === 'learning') return 'No affiliated learning orgs found for this agency.';
  return 'No affiliated schools found for this agency.';
});

const districtOptions = computed(() => {
  const values = new Set();
  for (const s of schools.value || []) {
    const name = String(s?.district_name || '').trim();
    if (name) values.add(name);
  }
  const sorted = Array.from(values).sort((a, b) => a.localeCompare(b));
  return [{ label: 'All', value: 'all' }, ...sorted.map((d) => ({ label: d, value: d }))];
});

const agencyOptions = ref([]);
const selectedAgencyId = ref('');
const studentStatusBySchool = ref({});
const studentStatusOrder = ['current', 'packet', 'screener', 'waitlist'];

const studentStatusKeyFor = (school) => {
  const sid = String(school?.school_id || '');
  if (!sid) return 'current';
  return studentStatusBySchool.value?.[sid] || 'current';
};

const studentStatusLabel = (school) => {
  const key = studentStatusKeyFor(school);
  if (key === 'packet') return 'Students (Packet)';
  if (key === 'screener') return 'Students (Screener)';
  if (key === 'waitlist') return 'Students (Waitlist)';
  return 'Students (Current)';
};

const studentStatusValue = (school) => {
  const key = studentStatusKeyFor(school);
  if (key === 'packet') return Number(school?.clients_packet || 0);
  if (key === 'screener') return Number(school?.clients_screener || 0);
  if (key === 'waitlist') return Number(school?.waitlist_count || 0);
  return Number(school?.clients_current || 0);
};

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
    failedCardLogoIds.value = new Set();
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
  const district = String(selectedDistrict.value || 'all');
  const withDistrict = district && district !== 'all'
    ? (schools.value || []).filter((s) => String(s?.district_name || '').trim() === district)
    : (schools.value || []);
  const base = q
    ? withDistrict.filter((s) => String(s?.school_name || '').toLowerCase().includes(q))
    : withDistrict;

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

const openSchoolNotificationsFiltered = (school, filter) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  const key = filter === 'messages' ? 'messages' : 'comments';
  router.push(`/${slug}/dashboard?sp=notifications&notif=${key}`);
};

const cycleStudentStatus = (school) => {
  const sid = String(school?.school_id || '');
  if (!sid) return;
  const current = studentStatusKeyFor(school);
  const idx = studentStatusOrder.indexOf(current);
  const next = studentStatusOrder[(idx + 1) % studentStatusOrder.length] || 'current';
  studentStatusBySchool.value = { ...studentStatusBySchool.value, [sid]: next };
};

const sumSkillsParticipants = (school) => {
  const groups = Array.isArray(school?.active_skills_groups) ? school.active_skills_groups : [];
  return groups.reduce((acc, g) => acc + Number(g?.participants_count || 0), 0);
};

const openSkillsUnassigned = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard?sp=skills&skillsUnassigned=1`);
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
.control-search {
  min-width: 320px;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.control-input-search {
  flex: 1 1 320px;
  max-width: 420px;
}
.district-buttons {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.district-btn {
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
}
.district-btn:hover {
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.2);
}
.district-btn.active {
  border-color: rgba(16, 185, 129, 0.8);
  background: rgba(16, 185, 129, 0.28);
}

.cards-wrap {
  margin-top: 10px;
}

/* Small portal cards (Show All School Portals) - matches My Dashboard / AgencySelector */
.portal-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}
.portal-card {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.portal-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.portal-card-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.portal-card-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.portal-card-logo-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.portal-card-body {
  min-width: 0;
}
.portal-card-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.portal-card-type {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.portal-card-cta {
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1200px) {
  .cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 780px) {
  .cards-grid {
    grid-template-columns: 1fr;
  }
}
.school-card {
  text-align: left;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
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
.stat-clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-clickable:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-comments {
  cursor: pointer;
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.1);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-comments:hover {
  border-color: rgba(16, 185, 129, 0.6);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-comments .stat-label {
  color: #065f46;
}
.stat-comments .stat-value {
  color: #065f46;
}
.stat-messages {
  cursor: pointer;
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.1);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-messages:hover {
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-messages .stat-label {
  color: #3730a3;
}
.stat-messages .stat-value {
  color: #3730a3;
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

