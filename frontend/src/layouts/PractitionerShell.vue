<template>
  <div class="practitioner-shell" :class="[theme.cssClass, { 'is-client': isClient }]">
    <aside class="ps-sidebar" aria-label="Primary">
      <div class="ps-brand">
        <div class="ps-brand-mark" aria-hidden="true">{{ brandMark }}</div>
        <div class="ps-brand-text">
          <div class="ps-brand-title">{{ brandTitle }}</div>
          <div v-if="brandSubtitle" class="ps-brand-sub">{{ brandSubtitle }}</div>
        </div>
      </div>

      <nav class="ps-nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="ps-nav-item"
          :class="{ active: item.id === activeNavId }"
          @click="onNav(item)"
        >
          <span class="ps-nav-label">{{ item.label }}</span>
          <span v-if="item.badge" class="ps-nav-badge">{{ item.badge }}</span>
        </button>
      </nav>

      <div class="ps-sidebar-footer">
        <slot name="sidebar-footer">
          <div v-if="footerQuote" class="ps-quote">{{ footerQuote }}</div>
          <div v-if="profileName" class="ps-profile-card">
            <div class="ps-avatar">{{ profileInitials }}</div>
            <div class="ps-profile-meta">
              <div class="ps-profile-name">{{ profileName }}</div>
              <div v-if="profileTitle" class="ps-profile-title">{{ profileTitle }}</div>
            </div>
          </div>
        </slot>
      </div>
    </aside>

    <div class="ps-main">
      <header v-if="showTopBar" class="ps-topbar">
        <div class="ps-topbar-copy">
          <h1 class="ps-greeting">{{ greeting }}</h1>
          <p v-if="tagline" class="ps-tagline">{{ tagline }}</p>
        </div>
        <div class="ps-topbar-actions">
          <slot name="top-actions" />
        </div>
      </header>
      <div class="ps-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  getPractitionerTheme,
  isConsultantOrgType,
  practitionerNavForRole
} from '../utils/practitionerVertical.js';
import { usePractitionerTeamAccess } from '../composables/usePractitionerTeamAccess.js';

const props = defineProps({
  orgType: { type: String, required: true },
  isClient: { type: Boolean, default: false },
  greeting: { type: String, default: '' },
  tagline: { type: String, default: '' },
  brandTitle: { type: String, default: '' },
  brandSubtitle: { type: String, default: '' },
  profileName: { type: String, default: '' },
  profileTitle: { type: String, default: '' },
  footerQuote: { type: String, default: '' },
  activeNavId: { type: String, default: 'dashboard' },
  showTopBar: { type: Boolean, default: true },
  organizationSlug: { type: String, default: '' },
  unreadMessages: { type: Number, default: 0 }
});

const router = useRouter();
const route = useRoute();

const { isOwner, permissions } = usePractitionerTeamAccess();

const theme = computed(() => getPractitionerTheme(props.orgType));

const brandMark = computed(() => (isConsultantOrgType(props.orgType) ? 'E' : 'LC'));

const resolvedBrandTitle = computed(() => {
  if (props.brandTitle) return props.brandTitle;
  return theme.value.label;
});

const brandTitle = resolvedBrandTitle;

const navItems = computed(() => {
  const items = practitionerNavForRole({
    orgType: props.orgType,
    isClient: props.isClient,
    isOwner: props.isClient ? true : isOwner.value,
    permissions: props.isClient ? null : permissions.value
  });
  const unread = Number(props.unreadMessages || 0);
  const showMessagesBadge = props.isClient || isOwner.value || permissions.value?.messages === true;
  return items.map((item) => {
    if (item.id !== 'messages') return item;
    return {
      ...item,
      badge: showMessagesBadge && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined
    };
  });
});

const profileInitials = computed(() => {
  const parts = String(props.profileName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
});

function onNav(item) {
  const slug = props.organizationSlug || route.params.organizationSlug;
  if (!slug) return;

  // Prefer real admin/path routes (Phase 2+); fall back to legacy hash placeholders.
  if (item?.path) {
    const path = item.path.startsWith('/')
      ? item.path
      : `/${slug}/${String(item.path).replace(/^\//, '')}`;
    router.push({ path, query: item.query || {}, hash: item.hash ? `#${item.hash}` : undefined });
    return;
  }

  if (!item?.to) return;
  const path = `/${slug}/${item.to}`;
  if (item.hash) {
    router.push({ path, hash: `#${item.hash}` });
  } else {
    router.push(path);
  }
}
</script>

<style scoped>
.practitioner-shell {
  --ps-accent: #c4a574;
  --ps-accent-2: #d4af37;
  --ps-sidebar: #1a3a2a;
  --ps-sidebar-text: #e8f0ea;
  --ps-surface: #f4f6f4;
  --ps-card: #ffffff;
  --ps-ink: #14241c;
  --ps-muted: #5c6f64;
  --ps-success: #2d6a4f;
  --ps-danger: #b91c1c;
  display: flex;
  min-height: 100vh;
  background: var(--ps-surface);
  color: var(--ps-ink);
  font-family: "Source Sans 3", "Segoe UI", sans-serif;
}

.theme-consultant {
  --ps-accent: #7c3aed;
  --ps-accent-2: #4f46e5;
  --ps-sidebar: #0f172a;
  --ps-sidebar-text: #e2e8f0;
  --ps-surface: #f1f5f9;
  --ps-ink: #0f172a;
  --ps-muted: #64748b;
  --ps-success: #059669;
}

.ps-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--ps-sidebar);
  color: var(--ps-sidebar-text);
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1rem 1.5rem;
}

.ps-brand {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.25rem 0.5rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 1rem;
}

.ps-brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: linear-gradient(135deg, var(--ps-accent), var(--ps-accent-2));
  color: #fff;
  font-size: 0.85rem;
}

.ps-brand-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.25;
}

.ps-brand-sub {
  font-size: 0.68rem;
  opacity: 0.7;
  margin-top: 0.15rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ps-nav {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  overflow-y: auto;
}

.ps-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.92rem;
  opacity: 0.85;
}

.ps-nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  opacity: 1;
}

.ps-nav-item.active {
  background: linear-gradient(135deg, var(--ps-accent), var(--ps-accent-2));
  color: #fff;
  opacity: 1;
  font-weight: 600;
}

.ps-nav-badge {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--ps-accent);
  color: #fff;
  font-size: 0.7rem;
  display: grid;
  place-items: center;
  font-weight: 700;
}

.ps-nav-item.active .ps-nav-badge {
  background: rgba(255, 255, 255, 0.25);
}

.ps-sidebar-footer {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ps-quote {
  font-size: 0.75rem;
  line-height: 1.45;
  opacity: 0.75;
  font-style: italic;
  margin-bottom: 0.85rem;
  padding: 0 0.35rem;
}

.ps-profile-card {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  padding: 0.5rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}

.ps-avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ps-accent), var(--ps-accent-2));
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.ps-profile-name {
  font-size: 0.85rem;
  font-weight: 600;
}

.ps-profile-title {
  font-size: 0.72rem;
  opacity: 0.7;
}

.ps-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ps-topbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.5rem 1.75rem 0.75rem;
}

.ps-greeting {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.ps-tagline {
  margin: 0.35rem 0 0;
  color: var(--ps-muted);
  font-size: 0.95rem;
}

.ps-topbar-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.ps-content {
  padding: 0.75rem 1.75rem 2rem;
}

@media (max-width: 900px) {
  .practitioner-shell {
    flex-direction: column;
  }
  .ps-sidebar {
    width: 100%;
  }
  .ps-nav {
    flex-direction: row;
    flex-wrap: wrap;
    max-height: none;
  }
  .ps-nav-item {
    flex: 1 1 auto;
  }
}
</style>
