import { computed, unref } from 'vue';

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();

const readArray = (value) => {
  const unwrapped = unref(value);
  return Array.isArray(unwrapped) ? unwrapped : [];
};

const pickParentAgencyId = (row) => {
  const type = String(row?.organization_type || row?.organizationType || '').toLowerCase();
  const id = Number(row?.id || 0);
  if (type === 'agency' && id > 0) return id;
  const parentId = Number(row?.affiliated_agency_id || row?.affiliatedAgencyId || 0);
  return parentId > 0 ? parentId : null;
};

export const resolveRouteTenantAgency = (organizationSlug, organizationsInput) => {
  const slug = normalizeSlug(organizationSlug);
  const organizations = readArray(organizationsInput);
  if (!slug || organizations.length === 0) return null;

  const matchesSlug = (row) => {
    const rowSlug = normalizeSlug(row?.slug);
    const rowPortal = normalizeSlug(row?.portal_url || row?.portalUrl);
    return rowSlug === slug || rowPortal === slug;
  };

  const matchedOrg = organizations.find(matchesSlug) || null;
  if (!matchedOrg) return null;

  const parentAgencyId = pickParentAgencyId(matchedOrg);
  if (!parentAgencyId) {
    return {
      organization: matchedOrg,
      agency: null,
      agencyId: null
    };
  }

  const agencyRow =
    organizations.find((row) => {
      const id = Number(row?.id || 0);
      const type = String(row?.organization_type || row?.organizationType || '').toLowerCase();
      return id === parentAgencyId && type === 'agency';
    }) || null;

  return {
    organization: matchedOrg,
    agency: agencyRow,
    agencyId: parentAgencyId
  };
};

export function useRouteTenantAgencyId(route, organizationsInput) {
  const resolvedRouteTenant = computed(() =>
    resolveRouteTenantAgency(route?.params?.organizationSlug, organizationsInput)
  );

  const routeTenantAgencyId = computed(() => resolvedRouteTenant.value?.agencyId || null);
  const routeTenantAgency = computed(() => resolvedRouteTenant.value?.agency || null);
  const routeTenantOrganization = computed(() => resolvedRouteTenant.value?.organization || null);

  return {
    routeTenantAgencyId,
    routeTenantAgency,
    routeTenantOrganization
  };
}
