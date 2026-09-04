import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';

export function useOfficeClientAgency() {
  const agencyStore = useAgencyStore();
  const route = useRoute();

  const agencyId = computed(() => {
    const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
    return a?.id || null;
  });

  const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());

  function orgPath(path) {
    const p = String(path || '').startsWith('/') ? path : `/${path}`;
    return orgSlug.value ? `/${orgSlug.value}${p}` : p;
  }

  function clientProfilePath(clientId) {
    return orgPath(`/admin/clients/${clientId}`);
  }

  return { agencyId, orgSlug, orgPath, clientProfilePath };
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
