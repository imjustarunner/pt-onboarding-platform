<template>
  <div
    class="agency-selector"
    :class="{ 'agency-selector--dashboard': isDashboardRoute }"
  >
    <div class="agency-bar">
      <div
        v-if="agencies.length > 0 && !(roleNorm === 'school_staff' && agencies.length === 1)"
        class="org-pick"
      >
        <label class="org-pick-label" for="agency-selector-org">Org</label>
        <select
          id="agency-selector-org"
          v-model.number="selectedAgencyId"
          class="org-pick-select"
          @change="handleAgencyChange"
        >
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>

      <div
        v-if="!hidePortalCards"
        class="portal-strip"
        :class="{ 'portal-strip--empty': organizationPortalCards.length === 0 && !bookClubChipVisible }"
        aria-label="Assigned portals"
      >
        <span class="portal-strip-label">Portals</span>
        <div class="portal-chips" role="list">
          <button
            v-for="card in organizationPortalCards"
            :key="card.id"
            type="button"
            class="portal-chip"
            role="listitem"
            :class="{ active: Number(selectedAgencyId) === Number(card.id) }"
            :title="`${card.name} · ${card.typeLabel}`"
            @click="openOrganizationPortal(card.org)"
          >
            <span class="portal-chip-logo">
              <img
                v-if="card.logoUrl && !failedCardLogoIds.has(String(card.id))"
                :src="card.logoUrl"
                alt=""
                class="portal-chip-logo-img"
                @error="onCardLogoError(card.id)"
              />
              <span v-else class="portal-chip-logo-fallback" aria-hidden="true">
                {{ card.initials }}
              </span>
            </span>
            <span class="portal-chip-text">
              <span class="portal-chip-name">{{ card.name }}</span>
              <span class="portal-chip-type">{{ card.typeLabel }}</span>
            </span>
          </button>
          <BookClubPortalChip
            v-if="!hidePortalCards"
            role="listitem"
            @visibility="onBookClubVisibility"
          />
        </div>
      </div>
    </div>

    <!-- SSTC clubs the user belongs to (any role). Always visible if they have any. -->
    <MySstcClubsCard v-if="!hidePortalCards" class="agency-sstc" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useRoute, useRouter } from 'vue-router';
import { toUploadsUrl } from '../utils/uploadsUrl';
import MySstcClubsCard from './sstc/MySstcClubsCard.vue';
import BookClubPortalChip from './bookClub/BookClubPortalChip.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const selectedAgencyId = ref(agencyStore.currentAgency?.id || null);
const failedCardLogoIds = ref(new Set());
const bookClubChipVisible = ref(false);

const onBookClubVisibility = (visible) => {
  bookClubChipVisible.value = !!visible;
};

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const hidePortalCards = computed(() => {
  const r = roleNorm.value;
  return r === 'admin' || r === 'support' || r === 'super_admin';
});

const isDashboardRoute = computed(() => {
  const p = String(route.path || '');
  return /(^|\/)(dashboard|mydashboard)(\/|$)/i.test(p);
});

const isPortalOrg = (a) => {
  const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning';
};
const isAgencyOrg = (a) => {
  const t = String(a?.organization_type || a?.organizationType || '').toLowerCase().trim();
  return !t || !['school', 'program', 'learning'].includes(t);
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

  const slug = getPortalSlug(agency);
  if (!slug) return;

  const nextDashboard = `/${slug}/dashboard`;
  if (!isAgencyOrg(agency)) {
    router.push(nextDashboard);
    return;
  }

  const onAdminSurface = String(route.path || '').includes('/admin/');
  const onTickets = String(route.path || '').includes('/tickets');
  if (!onAdminSurface && !onTickets) {
    router.push(nextDashboard);
    return;
  }

  if (route.params.organizationSlug) {
    const nextParams = { ...route.params, organizationSlug: slug };
    router.push({ name: route.name, params: nextParams, query: route.query });
    return;
  }

  if (onTickets) {
    router.push({ path: '/tickets', query: route.query });
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
  await agencyStore.fetchUserAgencies();

  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else if (roleNorm.value !== 'school_staff' && authStore.user?.id && authStore.user?.type !== 'approved_employee') {
    await agencyStore.fetchAgencies(authStore.user.id);
  }

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
  gap: 8px;
  margin-bottom: 12px;
}

.agency-selector--dashboard {
  margin-bottom: 6px;
}

.agency-bar {
  display: flex;
  align-items: center;
  gap: 10px 14px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

.agency-selector--dashboard .agency-bar {
  padding: 4px 8px;
  gap: 8px 10px;
  border-radius: 8px;
}

.org-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}

.org-pick-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  white-space: nowrap;
}

.org-pick-select {
  min-width: 140px;
  max-width: 220px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  background: #f9fafb;
  color: var(--text-primary, #111827);
  cursor: pointer;
}

.org-pick-select:focus {
  outline: none;
  border-color: #166534;
  box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.15);
  background: #fff;
}

.portal-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 200px;
  min-width: 0;
}

.portal-strip--empty {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  pointer-events: none;
}

.portal-strip-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  flex-shrink: 0;
}

.portal-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0;
  min-width: 0;
  flex: 1;
  scrollbar-width: thin;
}

.portal-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  max-width: 180px;
  padding: 4px 10px 4px 4px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.portal-chip:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.portal-chip.active {
  border-color: #166534;
  background: #f0fdf4;
  box-shadow: 0 0 0 1px rgba(22, 101, 52, 0.2);
}

.portal-chip-logo {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.portal-chip-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portal-chip-logo-fallback {
  font-size: 9px;
  font-weight: 800;
  color: #374151;
}

.portal-chip-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}

.portal-chip-name {
  font-size: 12px;
  font-weight: 650;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.portal-chip-type {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}

.agency-sstc {
  margin: 0;
}

.agency-selector--dashboard :deep(.my-sstc-card) {
  padding: 10px 12px;
  margin-bottom: 0;
}

@media (max-width: 640px) {
  .agency-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .org-pick {
    width: 100%;
  }

  .org-pick-select {
    flex: 1;
    max-width: none;
  }

  .portal-strip {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .portal-chip {
    max-width: none;
  }

  .portal-chip-name {
    max-width: none;
  }
}
</style>
