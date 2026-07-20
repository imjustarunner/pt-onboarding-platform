<template>
  <span class="peer-tenant-mark" @click.stop>
    <span
      class="peer-logo"
      :style="logoStyle"
      :title="brand.name"
    >
      <img v-if="brand.logoUrl" :src="brand.logoUrl" alt="" />
      <span v-else class="peer-logo-fallback">{{ initials }}</span>
    </span>
    <button
      type="button"
      class="peer-info-btn"
      aria-label="Tenant memberships"
      @mouseenter="open = true"
      @mouseleave="scheduleClose"
      @focus="open = true"
      @blur="open = false"
      @click.prevent="open = !open"
    >
      i
    </button>
    <div
      v-if="open && memberships.length"
      class="peer-info-pop"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    >
      <div class="peer-info-title">Tenants</div>
      <div v-for="m in memberships" :key="m.id" class="peer-info-row">
        <span class="peer-info-dot" :style="{ background: membershipPrimaryColor(m) || '#94a3b8' }" />
        <img v-if="resolveMembershipLogoUrl(m)" class="peer-info-logo" :src="resolveMembershipLogoUrl(m)" alt="" />
        <span class="peer-info-name">{{ m.name }}</span>
      </div>
      <div v-if="brand.mode === 'default' && memberships.length > 1" class="peer-info-hint">
        Shown in your default brand (shared tenants).
      </div>
      <div v-else-if="brand.mode === 'tenant'" class="peer-info-hint">
        Shown in {{ brand.name }} branding.
      </div>
    </div>
  </span>
</template>

<script setup>
import { computed, ref } from 'vue';
import {
  membershipPrimaryColor,
  membershipsForHover,
  resolveMembershipLogoUrl,
  resolvePeerTenantBrand
} from '../../utils/peerTenantBrand';

const props = defineProps({
  person: { type: Object, default: null },
  defaultPrimary: { type: String, default: null },
  defaultLogoUrl: { type: String, default: null },
  defaultName: { type: String, default: null },
  viewerMemberships: { type: Array, default: () => [] }
});

const open = ref(false);
let closeTimer = null;

const brand = computed(() =>
  resolvePeerTenantBrand(props.person, {
    defaultPrimary: props.defaultPrimary,
    defaultLogoUrl: props.defaultLogoUrl,
    defaultName: props.defaultName
  })
);

const memberships = computed(() =>
  membershipsForHover(props.person, props.viewerMemberships)
);

const logoStyle = computed(() => ({
  borderColor: brand.value.primaryColor || 'var(--border, #e2e8f0)',
  boxShadow: brand.value.primaryColor
    ? `0 0 0 1px ${brand.value.primaryColor}33`
    : 'none'
}));

const initials = computed(() => {
  const f = String(props.person?.first_name || '').trim();
  const l = String(props.person?.last_name || '').trim();
  return `${f[0] || ''}${l[0] || ''}`.toUpperCase() || '?';
});

function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    open.value = false;
  }, 160);
}

function cancelClose() {
  clearTimeout(closeTimer);
}
</script>

<style scoped>
.peer-tenant-mark {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.peer-logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid var(--border, #e2e8f0);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}
.peer-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.peer-logo-fallback {
  font-size: 9px;
  font-weight: 800;
  color: var(--text-secondary, #64748b);
}
.peer-info-btn {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid var(--border, #cbd5e1);
  background: #f8fafc;
  color: #475569;
  font-size: 10px;
  font-weight: 800;
  font-style: italic;
  line-height: 1;
  padding: 0;
  cursor: help;
}
.peer-info-pop {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 40;
  min-width: 180px;
  max-width: 260px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 8px 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
}
.peer-info-title {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.peer-info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-primary, #0f172a);
}
.peer-info-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.peer-info-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 3px;
}
.peer-info-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.peer-info-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  line-height: 1.35;
}
</style>
