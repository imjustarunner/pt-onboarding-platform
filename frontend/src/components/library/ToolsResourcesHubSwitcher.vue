<template>
  <nav class="tools-res-hub-switcher" aria-label="Tools and Resources sections">
    <template v-for="item in items" :key="item.key">
      <span
        v-if="item.isActive"
        class="tools-res-hub-switcher-btn is-active"
        aria-current="page"
      >{{ item.label }}</span>
      <router-link
        v-else
        class="tools-res-hub-switcher-btn"
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
  /**
   * Active key: library | referrals | documents | assessments | games | ai
   */
  active: { type: String, default: '' },
  showReferralDirectory: { type: Boolean, default: true },
  showMyDocuments: { type: Boolean, default: true },
  showToolHubs: { type: Boolean, default: true }
});

const route = useRoute();

const prefix = computed(() => {
  const p = String(props.orgPrefix || '').trim();
  if (p) return p.startsWith('/') ? p.replace(/\/$/, '') : `/${p}`;
  const slug = String(route.params.organizationSlug || '').trim();
  return slug ? `/${slug}` : '';
});

const items = computed(() => {
  const p = prefix.value;
  const active = String(props.active || '').toLowerCase();
  const list = [
    {
      key: 'library',
      label: 'Library',
      to: `${p}/library`,
      isActive: active === 'library'
    }
  ];
  if (props.showReferralDirectory) {
    list.push({
      key: 'referrals',
      label: 'Referral Directory',
      to: `${p}/admin/referral-directory`,
      isActive: active === 'referrals'
    });
  }
  if (props.showMyDocuments) {
    list.push({
      key: 'documents',
      label: 'My Documents',
      to: { path: `${p}/dashboard`, query: { tab: 'my', my: 'documents' } },
      isActive: active === 'documents'
    });
  }
  if (props.showToolHubs) {
    list.push(
      {
        key: 'assessments',
        label: 'Assessments',
        to: { path: `${p}/tools-aids`, query: { tab: 'assessments' } },
        isActive: active === 'assessments'
      },
      {
        key: 'games',
        label: 'Games',
        to: { path: `${p}/tools-aids`, query: { tab: 'games' } },
        isActive: active === 'games'
      },
      {
        key: 'ai',
        label: 'AI Tools',
        to: { path: `${p}/tools-aids`, query: { tab: 'ai' } },
        isActive: active === 'ai'
      }
    );
  }
  return list;
});
</script>

<style scoped>
.tools-res-hub-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 3px;
  flex-wrap: wrap;
}
.tools-res-hub-switcher-btn {
  display: inline-flex;
  align-items: center;
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
.tools-res-hub-switcher-btn:hover {
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.tools-res-hub-switcher-btn.is-active {
  background: #fff;
  color: var(--primary, #1f6b4a);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
