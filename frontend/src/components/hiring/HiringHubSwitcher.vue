<template>
  <nav class="hiring-hub-switcher" aria-label="Hiring sections">
    <template v-for="item in items" :key="item.key">
      <span
        v-if="item.isActive"
        class="hiring-hub-switcher-btn is-active"
        aria-current="page"
      >{{ item.label }}</span>
      <router-link
        v-else
        class="hiring-hub-switcher-btn"
        :to="item.to"
      >{{ item.label }}</router-link>
    </template>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps({
  /** Base org path prefix, e.g. `/itsco` or `` */
  orgPrefix: { type: String, default: '' },
  /** Active key: dashboard | applicants | prehire | onboarding */
  active: { type: String, default: '' },
  agencyId: { type: [String, Number], default: null }
});

const route = useRoute();

const prefix = computed(() => {
  const p = String(props.orgPrefix || '').trim();
  if (p) return p.startsWith('/') ? p.replace(/\/$/, '') : `/${p}`;
  const slug = String(route.params.organizationSlug || '').trim();
  return slug ? `/${slug}` : '';
});

const agencyQuery = computed(() => {
  const id = props.agencyId != null && String(props.agencyId).trim() !== ''
    ? String(props.agencyId).trim()
    : '';
  return id ? { agencyId: id } : {};
});

const items = computed(() => {
  const q = agencyQuery.value;
  const p = prefix.value;
  const active = String(props.active || '').toLowerCase();
  return [
    {
      key: 'dashboard',
      label: 'Dashboard',
      to: { path: `${p}/admin/hiring`, query: q },
      isActive: active === 'dashboard'
    },
    {
      key: 'applicants',
      label: 'Applications',
      to: { path: `${p}/admin/hiring/applicants`, query: q },
      isActive: active === 'applicants'
    },
    {
      key: 'prehire',
      label: 'Pre-Hire',
      to: { path: `${p}/admin/pre-hire`, query: q },
      isActive: active === 'prehire'
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      to: { path: `${p}/admin/onboarding`, query: q },
      isActive: active === 'onboarding'
    }
  ];
});
</script>

<style scoped>
.hiring-hub-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 3px;
  flex-wrap: wrap;
}
.hiring-hub-switcher-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748b;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  border: none;
  background: transparent;
  cursor: pointer;
}
.hiring-hub-switcher-btn:hover {
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.hiring-hub-switcher-btn.is-active {
  background: #fff;
  color: var(--primary, #1f6b4a);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  font-weight: 700;
  cursor: default;
}
</style>
