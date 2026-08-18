<template>
  <div v-if="topShortcuts.length" class="fpb-wrap" aria-label="Frequent pages">
    <span class="fpb-label" aria-hidden="true">Frequent</span>
    <nav class="fpb-chips" role="navigation" aria-label="Most visited pages">
      <router-link
        v-for="s in topShortcuts"
        :key="s.canonicalKey || s.path"
        :to="resolvePath(s.path)"
        class="fpb-chip"
        :title="`${s.label} — visited ${s.visitCount.toLocaleString()}×`"
      >{{ s.label }}</router-link>
    </nav>
  </div>
</template>

<script setup>
import { useNavShortcuts } from '../../composables/useNavShortcuts.js';
import { useRoute } from 'vue-router';

const props = defineProps({
  limit: { type: Number, default: 6 },
});

const route = useRoute();
const { topShortcuts } = useNavShortcuts({ limit: props.limit });

function resolvePath(path) {
  if (!path) return '/admin';
  const slug = route.params?.organizationSlug;
  if (slug && path.startsWith('/admin')) {
    return `/${slug}${path}`;
  }
  return path;
}
</script>

<style scoped>
.fpb-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.fpb-label {
  font-size: 0.68rem;
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
  height: 26px;
  padding: 0 0.75rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 0.77rem;
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
:global([data-theme="dark"]) .fpb-chip {
  background: #25282c;
  border-color: #475569;
  color: #cbd5e1;
}
:global([data-theme="dark"]) .fpb-chip:hover {
  background: #1e3a2f;
  border-color: #4ade80;
  color: #bbf7d0;
}
:global([data-theme="dark"]) .fpb-chip.router-link-active,
:global([data-theme="dark"]) .fpb-chip.router-link-exact-active {
  background: #14532d;
  border-color: #22c55e;
  color: #bbf7d0;
}
</style>
