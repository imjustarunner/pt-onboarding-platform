import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import {
  isTenantOrganizationType,
  listNestedPortalOrgs,
  nestedOrganizationTypeLabel,
  getParentAgencyFromOrg
} from '../utils/organizationTypes';

/** Roles that pick a tenant (not every nested org) for assistant scoping. */
const BACKOFFICE_TENANT_PICKER_ROLES = new Set(['admin', 'super_admin', 'support', 'staff']);

function orgLabel(org) {
  return String(org?.name || org?.slug || `Org #${org?.id || ''}`).trim();
}

export function useAssistantAgencyContext() {
  const agencyStore = useAgencyStore();
  const authStore = useAuthStore();
  /** Local override when global tenant context is missing (e.g. Platform mode). */
  const panelAgencyId = ref(null);
  const optionsLoaded = ref(false);

  const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
  const isBackofficeTenantPicker = computed(() => BACKOFFICE_TENANT_PICKER_ROLES.has(roleNorm.value));

  const membershipOrgs = computed(() => {
    const fromUser = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
    if (fromUser.length) return fromUser;
    return Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
  });

  const tenantOptions = computed(() => {
    const list = isBackofficeTenantPicker.value && roleNorm.value === 'super_admin'
      ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
      : membershipOrgs.value;
    return (list || [])
      .filter((org) => isTenantOrganizationType(org))
      .map((org) => ({
        id: Number(org.id),
        label: orgLabel(org),
        org
      }))
      .filter((row) => row.id > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const affiliationOptions = computed(() => {
    if (isBackofficeTenantPicker.value) return [];
    return listNestedPortalOrgs(membershipOrgs.value)
      .map((org) => ({
        id: Number(org.id),
        label: `${orgLabel(org)} (${nestedOrganizationTypeLabel(org)})`,
        org
      }))
      .filter((row) => row.id > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const allOptions = computed(() => [...tenantOptions.value, ...affiliationOptions.value]);

  function resolveToolAgencyId(rawId) {
    const n = Number(rawId || 0);
    if (!n) return null;
    const org = resolveOrgById(n);
    if (!org) return n;
    if (isTenantOrganizationType(org)) return Number(org.id);
    const parent = getParentAgencyFromOrg(org, membershipOrgs.value);
    return Number(parent?.id || org.id) || null;
  }

  const effectiveAgencyId = computed(() => {
    const picked = Number(panelAgencyId.value || 0);
    if (picked > 0) return resolveToolAgencyId(picked);
    if (!agencyStore.platformMode && Number(agencyStore.currentAgency?.id || 0) > 0) {
      return resolveToolAgencyId(agencyStore.currentAgency.id);
    }
    const jwt = Number(authStore.user?.agencyId || 0);
    if (jwt > 0) return resolveToolAgencyId(jwt);
    return null;
  });

  const needsAgencySelection = computed(() => !effectiveAgencyId.value);

  const showAgencyPicker = computed(() => needsAgencySelection.value || allOptions.value.length > 1);

  const selectedAgencyId = computed({
    get: () => {
      if (panelAgencyId.value) return Number(panelAgencyId.value);
      if (!agencyStore.platformMode && agencyStore.currentAgency?.id) {
        return Number(agencyStore.currentAgency.id);
      }
      return '';
    },
    set: (v) => {
      const id = Number(v || 0);
      panelAgencyId.value = id > 0 ? id : null;
    }
  });

  const selectedAgencyLabel = computed(() => {
    const id = effectiveAgencyId.value;
    if (!id) return '';
    const hit = allOptions.value.find((o) => o.id === id);
    if (hit) return hit.label;
    return orgLabel(agencyStore.currentAgency) || `Tenant #${id}`;
  });

  function resolveOrgById(id) {
    const n = Number(id || 0);
    if (!n) return null;
    return allOptions.value.find((o) => o.id === n)?.org
      || membershipOrgs.value.find((a) => Number(a?.id) === n)
      || (Number(agencyStore.currentAgency?.id) === n ? agencyStore.currentAgency : null);
  }

  function selectAgency(id) {
    const n = Number(id || 0);
    if (!n) {
      panelAgencyId.value = null;
      return;
    }
    panelAgencyId.value = n;
    const org = resolveOrgById(n);
    if (org) agencyStore.setCurrentAgency(org);
  }

  async function ensureAgencyOptionsLoaded() {
    if (optionsLoaded.value && (membershipOrgs.value.length || agencyStore.agencies?.length)) {
      return;
    }
    if (roleNorm.value === 'super_admin') {
      await agencyStore.fetchAgencies();
    }
    if (!agencyStore.userAgencies?.length) {
      await agencyStore.fetchUserAgencies();
    }
    optionsLoaded.value = true;
  }

  function tryAutoSelectSingleTenant() {
    if (effectiveAgencyId.value) return;
    const opts = allOptions.value;
    if (opts.length === 1) selectAgency(opts[0].id);
  }

  watch(
    () => agencyStore.currentAgency?.id,
    (id) => {
      if (agencyStore.platformMode) return;
      const n = Number(id || 0);
      if (n > 0) panelAgencyId.value = n;
    }
  );

  return {
    panelAgencyId,
    tenantOptions,
    affiliationOptions,
    allOptions,
    effectiveAgencyId,
    needsAgencySelection,
    showAgencyPicker,
    selectedAgencyId,
    selectedAgencyLabel,
    ensureAgencyOptionsLoaded,
    tryAutoSelectSingleTenant,
    selectAgency
  };
}
