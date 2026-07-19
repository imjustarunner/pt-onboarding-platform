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
        v-if="organizationPortalCards.length > 0 || bookClubChipVisible"
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
            :class="{ active: isPortalCardActive(card) }"
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
            v-if="!hasBookClubMembershipCard"
            role="listitem"
            @visibility="onBookClubVisibility"
          />
        </div>
      </div>
    </div>

    <!-- SSTC clubs the user belongs to (any role). Always visible if they have any. -->
    <MySstcClubsCard class="agency-sstc" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useRoute, useRouter } from 'vue-router';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { isBookClubAgency } from '../utils/bookClubAgency.js';
import {
  isTenantOrganizationType,
  isPortalBubbleOrg,
  nestedOrganizationTypeLabel,
  getOrganizationType,
  getOrgSlug,
  listNestedPortalOrgs,
  resolveNestedOrgNavigation
} from '../utils/organizationTypes.js';
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

const isDashboardRoute = computed(() => {
  const p = String(route.path || '');
  return /(^|\/)(dashboard|mydashboard)(\/|$)/i.test(p);
});

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

const allMembershipOrgs = computed(() => {
  const fromUser = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  const fromAgencies = Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
  if (fromUser.length) return fromUser;
  return fromAgencies;
});

/** Org dropdown: full tenants only. */
const agencies = computed(() => {
  const list = allMembershipOrgs.value || [];
  const tenants = list.filter((a) => isTenantOrganizationType(a));
  if (roleNorm.value === 'school_staff' && !tenants.length) {
    // School-only staff: no tenant switcher (portals cover navigation).
    return [];
  }
  return tenants;
});

const organizationPortalCards = computed(() => {
  return listNestedPortalOrgs(allMembershipOrgs.value).map((org) => ({
    id: org.id,
    org,
    name: String(org?.name || 'Organization').trim(),
    typeLabel: nestedOrganizationTypeLabel(org),
    logoUrl: resolveOrgLogoUrl(org),
    initials: toInitials(org?.name),
    slug: getOrgSlug(org)
  }));
});

const hasBookClubMembershipCard = computed(() =>
  (organizationPortalCards.value || []).some((card) => isBookClubAgency(card.org))
);

const isPortalCardActive = (card) => {
  const slug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  const cardSlug = String(card?.slug || '').trim().toLowerCase();
  if (slug && cardSlug && slug === cardSlug) return true;
  if (isBookClubAgency(card?.org) && /\/bookclub(\/|$)/i.test(String(route.path || ''))) return true;
  return false;
};

const navigateToTenantOrganization = (agency) => {
  if (!agency) return;
  agencyStore.setCurrentAgency(agency);

  const slug = getOrgSlug(agency);
  if (!slug) return;

  const path = String(route.path || '');
  const nextDashboard = `/${slug}/dashboard`;
  const onAdminSurface = path.includes('/admin/');
  const onTickets = path.includes('/tickets');
  // Stay on schedule / calendar surfaces — only swap tenant context (and slug if present).
  // Never bounce to that tenant's admin dashboard from these surfaces.
  const onScheduleSurface = /\/(my-schedule|schedule)(\/|$)/i.test(path)
    || /\/buildings\/schedule/i.test(path)
    || /\/provider-mobile\/schedule/i.test(path)
    || /\/office\/schedule/i.test(path)
    || (/\/dashboard(\/|$)/i.test(path) && String(route.query?.tab || '') === 'my_schedule');

  if (onScheduleSurface || onAdminSurface || onTickets) {
    if (route.params.organizationSlug) {
      const nextParams = { ...route.params, organizationSlug: slug };
      router.push({ name: route.name, params: nextParams, query: route.query });
      return;
    }
    if (onTickets) {
      router.push({ path: '/tickets', query: route.query });
      return;
    }
    // Platform HQ / unscoped schedule: agency context already updated; do not bounce to dashboard.
    return;
  }

  router.push(nextDashboard);
};

const openNestedPortal = async (org) => {
  if (!org?.id) return;
  const nav = resolveNestedOrgNavigation(org, allMembershipOrgs.value);
  if (nav.setCurrentAgencyToNested) {
    try {
      const hydrated = await agencyStore.hydrateAgencyById?.(org.id);
      agencyStore.setCurrentAgency(hydrated || org);
    } catch {
      agencyStore.setCurrentAgency(org);
    }
  } else if (nav.setCurrentAgencyToParent && nav.parent) {
    agencyStore.setCurrentAgency(nav.parent);
    selectedAgencyId.value = Number(nav.parent.id);
  }
  if (nav.path) await router.push(nav.path);
};

const handleAgencyChange = () => {
  const agency = agencies.value.find((a) => Number(a.id) === Number(selectedAgencyId.value));
  if (!agency) return;
  navigateToTenantOrganization(agency);
};

const openOrganizationPortal = (org) => {
  if (!org?.id) return;
  if (isPortalBubbleOrg(org)) {
    void openNestedPortal(org);
    return;
  }
  selectedAgencyId.value = Number(org.id);
  navigateToTenantOrganization(org);
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

  const current = agencyStore.currentAgency;
  if (current && isTenantOrganizationType(current)) {
    selectedAgencyId.value = current.id;
  } else if (current && !isTenantOrganizationType(current)) {
    // Book Club / school / learning / program / clinical must not own tenant context.
    // SSTC affiliation clubs may temporarily own currentAgency for Summit chrome.
    const t = getOrganizationType(current);
    const shouldDemote =
      isBookClubAgency(current) ||
      t === 'school' ||
      t === 'program' ||
      t === 'learning' ||
      t === 'clinical';
    if (shouldDemote) {
      const nav = resolveNestedOrgNavigation(current, allMembershipOrgs.value);
      if (nav.parent) {
        agencyStore.setCurrentAgency(nav.parent);
        selectedAgencyId.value = Number(nav.parent.id);
      } else if (agencies.value.length > 0) {
        selectedAgencyId.value = agencies.value[0].id;
        agencyStore.setCurrentAgency(agencies.value[0]);
      }
    } else if (agencies.value.length > 0) {
      selectedAgencyId.value = agencies.value[0].id;
    }
  } else if (agencies.value.length > 0) {
    selectedAgencyId.value = agencies.value[0].id;
    agencyStore.setCurrentAgency(agencies.value[0]);
  }
});

watch(() => agencyStore.currentAgency, (newAgency) => {
  if (newAgency && isTenantOrganizationType(newAgency)) {
    selectedAgencyId.value = newAgency.id;
  }
});
</script>

<style scoped>
.agency-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.agency-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}
.org-pick {
  display: flex;
  align-items: center;
  gap: 8px;
}
.org-pick-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
}
.org-pick-select {
  min-width: 160px;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 13px;
}
.portal-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.portal-strip-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  flex-shrink: 0;
}
.portal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
}
.portal-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 5px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  cursor: pointer;
  max-width: 220px;
  text-align: left;
}
.portal-chip:hover {
  border-color: var(--primary, #0f766e);
}
.portal-chip.active {
  border-color: var(--primary, #0f766e);
  box-shadow: 0 0 0 1px var(--primary, #0f766e);
}
.portal-chip-logo {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--surface-2, #f1f5f9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.portal-chip-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.portal-chip-logo-fallback {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.portal-chip-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}
.portal-chip-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.portal-chip-type {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}
.agency-sstc {
  margin-top: 2px;
}
.agency-selector--dashboard .org-pick-select {
  background: rgba(255, 255, 255, 0.92);
}
</style>
