import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { isNestedOrganizationType } from '../utils/organizationTypes.js';

function agencyLogoFromRow(a) {
  if (!a) return null;
  const direct = String(a.logo_url || a.logoUrl || '').trim();
  if (direct) return direct;
  const path = String(a.logo_path || a.logoPath || '').trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/uploads/')) return path;
  if (path.startsWith('uploads/')) return `/${path}`;
  return `/uploads/${path.replace(/^\//, '')}`;
}

export function useOfficeClientAgency() {
  const agencyStore = useAgencyStore();
  const route = useRoute();

  const agencyId = computed(() => {
    const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
    return a?.id || null;
  });

  /** Tenants the signed-in user can operate across (no brand switch required). */
  const accessibleAgencies = computed(() => {
    const list = Array.isArray(agencyStore.userAgencies) && agencyStore.userAgencies.length
      ? agencyStore.userAgencies
      : (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : []);
    return (list || [])
      .map((a) => ({
        id: Number(a.id || a.agency_id || 0),
        name: a.name || a.agency_name || 'Agency',
        slug: a.slug || null,
        logoUrl: agencyLogoFromRow(a),
        organizationType: a.organization_type || a.organizationType || null
      }))
      .filter((a) => a.id > 0)
      .filter((a) => !isNestedOrganizationType(a.organizationType));
  });

  const multiTenant = computed(() => accessibleAgencies.value.length > 1);

  /** 'all' or a specific agency id — defaults to all affiliates when multi-tenant. */
  const tenantFilter = ref('all');

  watch(
    multiTenant,
    (multi) => {
      if (!multi && agencyId.value) tenantFilter.value = String(agencyId.value);
      else if (multi && tenantFilter.value !== 'all') {
        // keep explicit filter
      } else if (multi) {
        tenantFilter.value = 'all';
      }
    },
    { immediate: true }
  );

  const scopeAgencyIds = computed(() => {
    const filter = String(tenantFilter.value || 'all');
    if (filter !== 'all') {
      const id = Number(filter);
      if (id > 0) return [id];
    }
    const ids = accessibleAgencies.value.map((a) => a.id);
    if (ids.length) return ids;
    if (agencyId.value) return [Number(agencyId.value)];
    return [];
  });

  const showingAllAgencies = computed(
    () => multiTenant.value && String(tenantFilter.value || 'all') === 'all'
  );

  const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());

  function orgPath(path) {
    const p = String(path || '').startsWith('/') ? path : `/${path}`;
    return orgSlug.value ? `/${orgSlug.value}${p}` : p;
  }

  function clientProfilePath(clientId) {
    return orgPath(`/admin/clients/${clientId}`);
  }

  function agencyIdsParam() {
    return scopeAgencyIds.value.join(',');
  }

  return {
    agencyId,
    accessibleAgencies,
    multiTenant,
    tenantFilter,
    scopeAgencyIds,
    showingAllAgencies,
    agencyIdsParam,
    orgSlug,
    orgPath,
    clientProfilePath
  };
}

export function formatRelativeTime(v) {
  if (!v) return '—';
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return String(v);
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function portalLabel(enabled) {
  return enabled ? 'Active' : 'Not invited';
}
