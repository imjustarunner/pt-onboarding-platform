<template>
  <div class="agency-selector">
    <div
      v-if="agencies.length > 0 && !(roleNorm === 'school_staff' && agencies.length === 1)"
      class="selector-group"
    >
      <label>Organization</label>
      <select v-model.number="selectedAgencyId" @change="handleAgencyChange" class="selector">
        <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
          {{ agency.name }}
        </option>
      </select>
    </div>

    <div v-if="organizationPortalCards.length > 0" class="portal-cards-wrap">
      <div class="portal-cards-header">Assigned portals</div>
      <div class="portal-cards-grid">
        <button
          v-for="card in organizationPortalCards"
          :key="card.id"
          type="button"
          class="portal-card"
          :class="{ active: Number(selectedAgencyId) === Number(card.id) }"
          @click="openOrganizationPortal(card.org)"
        >
          <div class="portal-card-logo">
            <img
              v-if="card.logoUrl && !failedCardLogoIds.has(String(card.id))"
              :src="card.logoUrl"
              :alt="`${card.name} logo`"
              class="portal-card-logo-img"
              @error="onCardLogoError(card.id)"
            />
            <div v-else class="portal-card-logo-fallback" aria-hidden="true">
              {{ card.initials }}
            </div>
          </div>
          <div class="portal-card-body">
            <div class="portal-card-name">{{ card.name }}</div>
            <div class="portal-card-type">{{ card.typeLabel }}</div>
          </div>
          <div class="portal-card-cta">Open portal</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useRoute, useRouter } from 'vue-router';
import { toUploadsUrl } from '../utils/uploadsUrl';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const selectedAgencyId = ref(agencyStore.currentAgency?.id || null);
const failedCardLogoIds = ref(new Set());

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isPortalOrg = (a) => {
  const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning';
};
const isAgencyOrg = (a) => {
  const t = String(a?.organization_type || a?.organizationType || 'agency').toLowerCase();
  return t === 'agency';
};
const toTypeLabel = (orgType) => {
  const t = String(orgType || '').toLowerCase();
  if (t === 'school') return 'School';
  if (t === 'program') return 'Program';
  if (t === 'learning') return 'Learning';
  if (t) return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return 'Organization';
};
const getPortalSlug = (org) => {
  const slug = String(org?.slug || org?.portal_url || org?.portalUrl || '').trim();
  return slug || null;
};
const toInitials = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};
const resolveOrgLogoUrl = (org) => {
  const candidates = [
    org?.logo_path,
    org?.logoPath,
    org?.logo_url,
    org?.logoUrl,
    org?.icon_path,
    org?.iconPath,
    org?.icon_url,
    org?.iconUrl
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/uploads/') || s.startsWith('uploads/')) return toUploadsUrl(s);
  return s;
};

const agencies = computed(() => {
  const list = Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
  if (roleNorm.value !== 'school_staff') return list;
  const portal = list.filter(isPortalOrg);
  // Best-effort fallback for older payloads missing organization_type.
  return portal.length ? portal : list;
});

const organizationPortalCards = computed(() => {
  return (agencies.value || [])
    .filter((org) => !isAgencyOrg(org) && !!getPortalSlug(org))
    .map((org) => ({
      id: org.id,
      org,
      name: String(org?.name || 'Organization').trim(),
      typeLabel: toTypeLabel(org?.organization_type || org?.organizationType),
      logoUrl: resolveOrgLogoUrl(org),
      initials: toInitials(org?.name)
    }));
});

const navigateToOrganization = (agency) => {
  if (!agency) return;
  agencyStore.setCurrentAgency(agency);

  // Keep URL slug + branding in sync with the selected organization.
  const slug = getPortalSlug(agency);
  if (!slug) return;

  // Switching into a non-agency portal should always land on its portal dashboard.
  const nextDashboard = `/${slug}/dashboard`;
  if (!isAgencyOrg(agency)) {
    router.push(nextDashboard);
    return;
  }

  // For non-admin surfaces, default to dashboard as well.
  const onAdminSurface = String(route.path || '').includes('/admin/');
  if (!onAdminSurface) {
    router.push(nextDashboard);
    return;
  }

  // Admin surfaces: preserve current sub-route and swap slug.
  if (route.params.organizationSlug) {
    const nextParams = { ...route.params, organizationSlug: slug };
    router.push({ name: route.name, params: nextParams, query: route.query });
    return;
  }

  router.push(nextDashboard);
};

const handleAgencyChange = () => {
  const agency = agencies.value.find((a) => Number(a.id) === Number(selectedAgencyId.value));
  if (!agency) return;
  navigateToOrganization(agency);
};

const openOrganizationPortal = (org) => {
  if (!org?.id) return;
  selectedAgencyId.value = Number(org.id);
  navigateToOrganization(org);
};

const onCardLogoError = (cardId) => {
  const next = new Set(failedCardLogoIds.value);
  next.add(String(cardId));
  failedCardLogoIds.value = next;
};

onMounted(async () => {
  // Fetch user's assigned agencies and set default
  await agencyStore.fetchUserAgencies();

  // For super_admin, load all agencies (not just assigned)
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else if (roleNorm.value !== 'school_staff' && authStore.user?.id && authStore.user?.type !== 'approved_employee') {
    // Regular users/admins: load assigned agencies
    await agencyStore.fetchAgencies(authStore.user.id);
  }
  
  // For approved employees, agencies are already loaded from fetchUserAgencies
  // Ensure current agency is set
  if (agencyStore.currentAgency) {
    selectedAgencyId.value = agencyStore.currentAgency.id;
  } else if (agencies.value.length > 0) {
    selectedAgencyId.value = agencies.value[0].id;
    agencyStore.setCurrentAgency(agencies.value[0]);
  }
});

watch(() => agencyStore.currentAgency, (newAgency) => {
  if (newAgency) {
    selectedAgencyId.value = newAgency.id;
  }
});
</script>

<style scoped>
.agency-selector {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: stretch;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow);
  margin-bottom: 24px;
  border: 1px solid var(--border);
}

.selector-group {
  flex: 0 0 auto;
  max-width: 300px;
}

.selector-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #1e293b;
  font-size: 14px;
}

.selector {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s;
}

.selector option {
  color: var(--text-primary);
  background: white;
}

.selector:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.portal-cards-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.portal-cards-header {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.01em;
}

.portal-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.portal-card {
  border: 1px solid #e2e8f0;
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
  border-color: #cbd5e1;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.portal-card.active {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
}

.portal-card-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
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
  color: #334155;
  text-transform: uppercase;
}

.portal-card-body {
  min-width: 0;
}

.portal-card-name {
  font-weight: 600;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.portal-card-type {
  margin-top: 2px;
  color: #64748b;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.portal-card-cta {
  color: #4f46e5;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .selector-group {
    max-width: none;
  }

  .portal-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>

