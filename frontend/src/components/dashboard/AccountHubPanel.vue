<template>
  <div class="acct-hub">
    <header class="acct-hub__header">
      <div class="acct-hub__header-left">
        <div class="acct-hub__title-row">
          <span class="acct-hub__title-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <h2 class="acct-hub__title">My Account</h2>
        </div>
        <p class="acct-hub__subtitle">{{ activeMeta.description }}</p>
        <div v-if="userDisplayName" class="acct-hub__user">
          <span class="acct-hub__user-avatar" aria-hidden="true">{{ userInitials }}</span>
          <span class="acct-hub__user-name">{{ userDisplayName }}</span>
          <span v-if="userRoleLabel" class="acct-hub__user-role">
            <span class="acct-hub__user-dot" aria-hidden="true" />
            {{ userRoleLabel }}
          </span>
        </div>
      </div>
    </header>

    <div class="acct-hub__stats">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="acct-hub__stat"
        :class="{ 'acct-hub__stat--active': section.id === activeSection }"
        :aria-current="section.id === activeSection ? 'true' : undefined"
        @click="$emit('select-section', section.id)"
      >
        <div class="acct-hub__stat-icon" :style="{ background: section.theme.iconBg, color: section.theme.icon }">
          <span v-html="sectionIcon(section.icon)" />
        </div>
        <div class="acct-hub__stat-text">
          <div class="acct-hub__stat-value">{{ section.statLabel }}</div>
          <div class="acct-hub__stat-label">{{ section.navLabel }}</div>
          <div class="acct-hub__stat-hint">{{ section.statHint }}</div>
        </div>
      </button>
    </div>

    <div v-if="showInfoBanner" class="acct-hub__banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <p>
        Manage your profile, credentials, payroll history, and notification settings in one place.
        Use <strong>Submit</strong> on the dashboard to file new claims.
      </p>
      <button type="button" class="acct-hub__banner-close" aria-label="Dismiss" @click="showInfoBanner = false">×</button>
    </div>

    <div class="acct-hub__body">
      <nav class="acct-hub__nav" data-tour="dash-my-subnav" aria-label="My Account sections">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          class="acct-hub__nav-item"
          :class="{ 'acct-hub__nav-item--active': section.id === activeSection }"
          :style="section.id === activeSection ? getAccountSectionThemeStyle(section.id) : undefined"
          @click="$emit('select-section', section.id)"
        >
          <span class="acct-hub__nav-icon" v-html="sectionIcon(section.icon)" />
          <span class="acct-hub__nav-text">
            <span class="acct-hub__nav-label">{{ section.navLabel }}</span>
            <span class="acct-hub__nav-desc">{{ section.description }}</span>
          </span>
        </button>
      </nav>

      <div class="acct-hub__main">
        <header class="acct-hub__main-head" :style="getAccountSectionThemeStyle(activeSection)">
          <span class="acct-hub__main-icon" v-html="sectionIcon(activeMeta.icon)" />
          <div>
            <h3 class="acct-hub__main-title">{{ activeMeta.title }}</h3>
            <div class="acct-hub__main-tags">
              <span class="acct-hub__main-tag">{{ activeMeta.tag }}</span>
              <span v-if="activeMeta.tagSecondary" class="acct-hub__main-tag acct-hub__main-tag--muted">{{ activeMeta.tagSecondary }}</span>
            </div>
          </div>
        </header>
        <div class="acct-hub__main-body">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { getAccountSectionMeta, getAccountSectionThemeStyle } from '../../config/accountDisplaySections';

const props = defineProps({
  activeSection: { type: String, default: 'account' },
  sections: { type: Array, default: () => [] },
  userDisplayName: { type: String, default: '' },
  userInitials: { type: String, default: '' },
  userRoleLabel: { type: String, default: '' },
});

defineEmits(['select-section']);

const showInfoBanner = ref(true);

const activeMeta = computed(() => getAccountSectionMeta(props.activeSection));

const ICONS = {
  user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  wallet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h16v-5"/></svg>',
  chart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  star: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

const sectionIcon = (name) => ICONS[name] || ICONS.user;
</script>

<style scoped>
.acct-hub {
  --hub-green: #166534;
  --hub-border: #e5e7eb;
  --hub-muted: #6b7280;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  color: #111827;
}

.acct-hub__header {
  margin-bottom: 24px;
}

.acct-hub__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.acct-hub__title-icon {
  display: flex;
  color: var(--hub-green);
}

.acct-hub__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.acct-hub__subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--hub-muted);
  max-width: 560px;
  line-height: 1.5;
}

.acct-hub__user {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.acct-hub__user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #dcfce7;
  color: var(--hub-green);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.acct-hub__user-name {
  font-size: 15px;
  font-weight: 600;
}

.acct-hub__user-role {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--hub-muted);
}

.acct-hub__user-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #22c55e;
}

.acct-hub__stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.acct-hub__stat {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  width: 100%;
  padding: 18px 20px;
  text-align: left;
  background: #fff;
  border: 1px solid var(--hub-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  font: inherit;
  color: inherit;
}

.acct-hub__stat:hover {
  border-color: #86efac;
  background: #fafafa;
  box-shadow: 0 2px 8px rgba(22, 101, 52, 0.06);
}

.acct-hub__stat:focus-visible {
  outline: 2px solid #166534;
  outline-offset: 2px;
}

.acct-hub__stat--active {
  border-color: #86efac;
  box-shadow: 0 2px 8px rgba(22, 101, 52, 0.08);
}

.acct-hub__stat-text {
  min-width: 0;
}

.acct-hub__stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.acct-hub__stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.acct-hub__stat-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-top: 2px;
}

.acct-hub__stat-hint {
  font-size: 12px;
  color: var(--hub-muted);
  margin-top: 2px;
}

.acct-hub__banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #166534;
  font-size: 14px;
  line-height: 1.5;
}

.acct-hub__banner p {
  margin: 0;
  flex: 1;
}

.acct-hub__banner-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
}

.acct-hub__body {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .acct-hub__body {
    grid-template-columns: 1fr;
  }
}

.acct-hub__nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 900px) {
  .acct-hub__nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

.acct-hub__nav-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  background: #fff;
  border: 1px solid var(--hub-border);
  border-left: 3px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

@media (max-width: 900px) {
  .acct-hub__nav-item {
    width: auto;
    flex: 1 1 200px;
  }
}

.acct-hub__nav-item:hover {
  border-color: #d1d5db;
  background: #fafafa;
}

.acct-hub__nav-item--active {
  border-left-color: var(--cat-accent, var(--hub-green));
  background: color-mix(in srgb, var(--cat-icon-bg, #ecfdf5) 40%, #fff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.acct-hub__nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #374151;
  flex-shrink: 0;
}

.acct-hub__nav-item--active .acct-hub__nav-icon {
  background: var(--cat-icon-bg, #dcfce7);
  color: var(--cat-icon, var(--hub-green));
}

.acct-hub__nav-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.acct-hub__nav-label {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.acct-hub__nav-desc {
  font-size: 12px;
  color: var(--hub-muted);
  line-height: 1.35;
}

@media (max-width: 900px) {
  .acct-hub__nav-desc {
    display: none;
  }
}

.acct-hub__main {
  background: #fff;
  border: 1px solid var(--hub-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

.acct-hub__main-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--hub-border);
  background: color-mix(in srgb, var(--cat-icon-bg, #fafafa) 50%, #fff);
  border-left: 4px solid var(--cat-accent, var(--hub-green));
}

.acct-hub__main-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--cat-icon-bg, #dcfce7);
  color: var(--cat-icon, var(--hub-green));
  flex-shrink: 0;
}

.acct-hub__main-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.acct-hub__main-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.acct-hub__main-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--cat-tag-bg, #ecfdf5);
  color: var(--cat-tag-color, #166534);
}

.acct-hub__main-tag--muted {
  background: var(--cat-tag-muted-bg, #f3f4f6);
  color: var(--cat-tag-muted-color, #4b5563);
}

.acct-hub__main-body {
  padding: 18px 20px 24px;
  overflow-x: auto;
  min-width: 0;
}
</style>
