import {computed, unref} from 'vue';

function standalone(agency) {
  try {
    const flags = agency?.feature_flags || agency?.featureFlags || {};
    return (typeof flags === 'string' ? JSON.parse(flags) : flags).plotlineOnly === true;
  } catch { return false; }
}

// A named standalone company outranks page preferences and stale shell state.
// While its metadata is loading, a previous Plotline company cannot substitute.
export function usePlotlineCompanyScope(route, agencyStore) {
  const slug = computed(() => String(route.params?.organizationSlug || route.params?.interviewAgencySlug || '').trim().toLowerCase());
  const current = computed(() => unref(agencyStore.currentAgency));
  const company = computed(() => {
    const rows = [current.value, ...(unref(agencyStore.userAgencies) || []), ...(unref(agencyStore.agencies) || [])];
    return slug.value ? rows.find(a => [a?.slug, a?.portal_url, a?.portalUrl].some(value => value && String(value).toLowerCase() === slug.value)) || null : null;
  });
  const locked = computed(() => !!slug.value && (company.value ? standalone(company.value) : standalone(current.value)));
  const companyId = computed(() => locked.value && company.value ? Number(company.value.id) || null : null);
  const storageSuffix = computed(() => locked.value ? `:plotline:${companyId.value || slug.value}` : '');
  return {company, locked, companyId, storageSuffix};
}
