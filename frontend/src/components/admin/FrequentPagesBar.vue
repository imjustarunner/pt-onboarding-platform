<template>
  <div v-if="visibleShortcuts.length" class="fpb-wrap" aria-label="Frequent pages">
    <span class="fpb-label" aria-hidden="true">Frequent</span>
    <nav class="fpb-chips" role="navigation" aria-label="Most visited pages">
      <router-link
        v-for="s in visibleShortcuts"
        :key="s.destination"
        :to="s.destination"
        class="fpb-chip"
        :title="`${s.label} — visited ${s.visitCount.toLocaleString()}×`"
      ><img v-if="s.iconUrl" :src="s.iconUrl" alt="" /><span v-else aria-hidden="true">{{ s.icon || '↗' }}</span>{{ s.label }}</router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { canDiscoverQuickNavRoute, resolveRegisteredRoute } from '../../navigation/quickNavRuntime';
import { useNavShortcuts } from '../../composables/useNavShortcuts.js';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  limit: { type: Number, default: 6 },
});

const route = useRoute();
const router = useRouter();
const auth = useAuthStore(), agencies = useAgencyStore(), branding = useBrandingStore();
const { topShortcuts } = useNavShortcuts({ limit: 20, userId: computed(() => auth.user?.id) });
const visibleShortcuts = computed(() => {
  const seen = new Map();
  for (const shortcut of topShortcuts.value || topShortcuts || []) {
    const location = resolvePath(shortcut.path);
    if (!location) continue;
    const resolved = resolveRegisteredRoute(router, location, branding.portalHostPortalUrl);
    if (!resolved || !canDiscoverQuickNavRoute(resolved, {user:auth.user,agency:agencies.currentAgency || {},platformBranding:branding.platformBranding || {}})) continue;
    const path = resolved.path, tab = resolved.query.tab;
    let label = shortcut.label, iconKey = tab || ({'my-schedule':'my_schedule','my-meetings':'meetings','messages':'chats','my-learning':'training','notifications':'notifications'}[shortcut.canonicalKey]) || shortcut.canonicalKey;
    if (/\/(note-aid|clinical-note-generator)(\/|$)/.test(path)) { label = 'Note Workspace'; iconKey = 'clinical_note_generator'; }
    else if (tab === 'clients' && /\/dashboard$/.test(path)) { label = 'My Clients'; iconKey = 'clients'; }
    else if (/school-operations.*clients|\/admin\/school-clients$/.test(path)) { label = 'School Clients'; iconKey = 'clients'; }
    else if (/workforce-operations.*clients|\/admin\/clients$/.test(path)) { label = 'Client Directory'; iconKey = 'clients'; }
    const destination = resolved.fullPath;
    const existing = seen.get(destination);
    if (existing) existing.visitCount += shortcut.visitCount;
    else seen.set(destination, {...shortcut,label,destination,iconUrl:branding.getDashboardCardIconUrl?.(iconKey, agencies.currentAgency) || null});
  }
  return [...seen.values()].sort((a,b) => b.visitCount-a.visitCount).slice(0,props.limit);
});

function resolvePath(path) {
  // History is shared across workspaces. A frequent page is a shortcut within
  // this workspace, not a switch to whichever tenant supplied the most visits.
  const slug = String(route.params?.organizationSlug || '').trim();
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  const saved = router.resolve(path);
  if (!saved.meta.requiresAuth) return null;
  const savedSlug = String(saved.params?.organizationSlug || '');
  const prefix = savedSlug ? `/${savedSlug}` : '';
  const localPath = prefix && saved.path.startsWith(`${prefix}/`)
    ? saved.path.slice(prefix.length)
    : saved.path;
  const query = { ...saved.query };
  // Legacy Settings links use agencyId as a workspace switch in the router.
  // Do not replay that switch from another visit's shortcut.
  if (localPath === '/admin/settings') delete query.agencyId;
  // On dedicated tenant hosts and in HQ, routes stay flat. On shared-host
  // tenant routes, always use the current route's tenant prefix.
  return { path: `${slug ? `/${slug}` : ''}${localPath}`, query, hash: saved.hash };
}
</script>

<style scoped>
.fpb-chip img { width: 22px; height: 22px; object-fit: contain; }
.fpb-wrap { padding: 8px 0; }
.fpb-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.fpb-label {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  white-space: nowrap;
  flex-shrink: 0;
  padding-top: 1px;
}
.fpb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}
.fpb-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  gap: 6px;
  padding: 0 0.75rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  line-height: 1;
}
.fpb-chip:hover {
  background: #f0fdf4;
  border-color: #86efac;
  color: var(--primary, #2d6a4f);
}
.fpb-chip.router-link-active,
.fpb-chip.router-link-exact-active {
  background: #dcfce7;
  border-color: #4ade80;
  color: #15803d;
}
[data-theme="dark"] .fpb-chip {
  background: #25282c;
  border-color: #475569;
  color: #cbd5e1;
}
[data-theme="dark"] .fpb-chip:hover {
  background: #1e3a2f;
  border-color: #4ade80;
  color: #bbf7d0;
}
[data-theme="dark"] .fpb-chip.router-link-active,
[data-theme="dark"] .fpb-chip.router-link-exact-active {
  background: #14532d;
  border-color: #22c55e;
  color: #bbf7d0;
}
</style>
