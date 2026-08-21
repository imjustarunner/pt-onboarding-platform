<template>
  <div class="wo-hub so-hub po-hub">
    <div class="hub-ambient" aria-hidden="true">
      <span
        v-for="dot in ambientDots"
        :key="dot.id"
        class="hub-ambient-dot"
        :style="{
          top: dot.top,
          left: dot.left,
          width: `${dot.size}px`,
          height: `${dot.size}px`,
          animationDelay: `${dot.delay}s`,
          '--dot-duration': `${dot.duration}s`,
          '--drift-x': `${dot.driftX}px`,
          '--drift-y': `${dot.driftY}px`
        }"
      />
    </div>

    <header class="hub-header" data-tour="people-ops-hub-header">
      <div class="hub-brand">
        <div class="hub-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke-linecap="round" />
            <circle cx="9" cy="7" r="3" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round" />
          </svg>
        </div>
        <div>
          <h1 class="hub-title" data-tour="people-ops-hub-title">People Operations</h1>
          <p class="hub-subtitle" data-tour="people-ops-hub-subtitle">
            Hiring, careers, onboarding, and development — organized in one place.
          </p>
        </div>
      </div>
      <div class="hub-header-actions">
        <nav class="hub-switcher" aria-label="Switch hub">
          <template v-for="item in hubSwitcherLinks" :key="item.key">
            <span
              v-if="item.isActive"
              class="hub-switcher-btn is-active"
              aria-current="page"
            >
              <svg v-if="item.icon === 'my'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              <svg v-else-if="item.icon === 'admin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke-linecap="round"/></svg>
              <svg v-else-if="item.icon === 'ops'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 17.5h7M17.5 14v7" stroke-linecap="round"/></svg>
              <svg v-else-if="item.icon === 'workforce'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" stroke-linecap="round"/></svg>
              <svg v-else-if="item.icon === 'people'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21V12h6v9" stroke-linecap="round"/></svg>
              {{ item.label }}
            </span>
            <router-link v-else class="hub-switcher-btn" :to="item.to">
              <svg v-if="item.icon === 'my'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              <svg v-else-if="item.icon === 'admin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke-linecap="round"/></svg>
              <svg v-else-if="item.icon === 'ops'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 17.5h7M17.5 14v7" stroke-linecap="round"/></svg>
              <svg v-else-if="item.icon === 'workforce'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" stroke-linecap="round"/></svg>
              <svg v-else-if="item.icon === 'people'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21V12h6v9" stroke-linecap="round"/></svg>
              {{ item.label }}
            </router-link>
          </template>
        </nav>
        <router-link
          v-if="canManageHiring && hasHiringFeature"
          class="hub-calendar-btn"
          :to="orgTo('/admin/hiring')"
        >
          Open Hiring Dashboard
        </router-link>
      </div>
    </header>

    <div class="hub-layout" data-tour="people-ops-hub-grid">
      <div class="hub-stage-wrap">
        <div
          class="hub-stage"
          :class="{ 'is-drilled': !!activeSectionId }"
          @mouseleave="clearHover"
        >
          <div class="hub-rings" aria-hidden="true">
            <span class="hub-ring hub-ring-1 hub-ring-spin-cw" />
            <span class="hub-ring hub-ring-2 hub-ring-spin-ccw" />
            <span class="hub-ring hub-ring-3 hub-ring-spin-cw" />
            <span class="hub-ring hub-ring-orbit hub-ring-spin-ccw" />
          </div>

          <div class="hub-center-wrap">
            <button
              type="button"
              class="hub-center"
              :class="[
                activeSectionId ? `tone-${activeSection?.tone}` : 'tone-root',
                { 'is-clickable': !!activeSectionId }
              ]"
              :aria-label="activeSectionId ? `Return to all areas` : 'People Operations hub'"
              @click="activeSectionId ? goToRoot() : null"
            >
              <div class="hub-center-icon" aria-hidden="true" v-html="centerIcon" />
              <div class="hub-center-title">{{ centerTitle }}</div>
              <p class="hub-center-desc">{{ centerDesc }}</p>
              <span v-if="activeSectionId" class="hub-center-back">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M18 15l-6-6-6 6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Return to all areas
              </span>
              <span v-else class="hub-center-meta">{{ visibleSections.length }} areas</span>
            </button>
            <span
              v-if="hubCenterNotificationCount > 0"
              class="hub-center-badge"
              :title="hubCenterNotificationSummary"
            >{{ formatNotificationCount(hubCenterNotificationCount) }}</span>
          </div>

          <svg class="hub-connectors" aria-hidden="true" viewBox="0 0 600 600">
            <g class="hub-connector-ring-orbit">
              <circle cx="300" cy="300" r="195" class="hub-connector-ring" />
            </g>
            <line
              v-for="(node, idx) in orbitNodes"
              :key="`line-${node.key}`"
              x1="300"
              y1="300"
              :x2="connectorPoints[idx]?.x"
              :y2="connectorPoints[idx]?.y"
              class="hub-connector-line"
              :class="[
                `tone-${node.tone}`,
                {
                  active: isNodeHighlighted(node),
                  'has-notifications': (node.notificationCount || node.count || 0) > 0
                }
              ]"
            />
          </svg>

          <div
            v-for="(node, idx) in orbitNodes"
            :key="node.key"
            class="hub-orbit-node"
            :class="node.tone ? `tone-${node.tone}` : null"
            :style="orbitStyle(idx, orbitNodes.length)"
          >
            <template v-if="node.type === 'section'">
              <button
                type="button"
                class="hub-satellite hub-satellite--section"
                :class="[
                  `tone-${node.tone}`,
                  {
                    hovered: hoveredSectionId === node.id,
                    active: activeSectionId === node.id
                  }
                ]"
                @mouseenter="hoveredSectionId = node.id"
                @focus="hoveredSectionId = node.id"
                @click="selectSection(node.id)"
              >
                <div class="hub-satellite-icon" aria-hidden="true" v-html="node.icon" />
                <div class="hub-satellite-title">{{ node.label }}</div>
                <p class="hub-satellite-desc">{{ node.desc }}</p>
                <span class="hub-satellite-pill">{{ node.cardCount }} areas →</span>
              </button>
              <span
                v-if="node.notificationCount > 0"
                class="hub-satellite-badge hub-satellite-badge-pulse"
                :title="node.notificationSummary"
              >{{ formatNotificationCount(node.notificationCount) }}</span>
            </template>

            <template v-else>
              <a
                v-if="node.external && node.to"
                class="hub-satellite hub-satellite-link hub-satellite--card"
                :class="[`tone-${node.tone}`, { hovered: hoveredCardId === node.id }]"
                :href="node.to"
                target="_blank"
                rel="noopener noreferrer"
                :data-tour="node.tour"
                @mouseenter="hoveredCardId = node.id"
                @focus="hoveredCardId = node.id"
              >
                <div class="hub-satellite-icon" aria-hidden="true" v-html="node.icon" />
                <div class="hub-satellite-title">{{ node.title }}</div>
                <p class="hub-satellite-desc">{{ node.shortDesc }}</p>
                <span class="hub-satellite-pill">{{ node.cta }}</span>
              </a>
              <router-link
                v-else-if="node.to && !node.disabled"
                class="hub-satellite hub-satellite-link hub-satellite--card"
                :class="[`tone-${node.tone}`, { hovered: hoveredCardId === node.id }]"
                :to="node.to"
                :data-tour="node.tour"
                @mouseenter="hoveredCardId = node.id"
                @focus="hoveredCardId = node.id"
              >
                <div class="hub-satellite-icon" aria-hidden="true" v-html="node.icon" />
                <div class="hub-satellite-title">{{ node.title }}</div>
                <p class="hub-satellite-desc">{{ node.shortDesc }}</p>
                <span class="hub-satellite-pill">{{ node.cta }}</span>
              </router-link>
              <div
                v-else
                class="hub-satellite hub-satellite--card hub-satellite--soon"
                :class="[`tone-${node.tone}`]"
                :data-tour="node.tour"
              >
                <div class="hub-satellite-icon" aria-hidden="true" v-html="node.icon" />
                <div class="hub-satellite-title">{{ node.title }}</div>
                <p class="hub-satellite-desc">{{ node.shortDesc }}</p>
                <span class="hub-satellite-pill">Soon</span>
              </div>
              <span
                v-if="node.count > 0"
                class="hub-satellite-badge hub-satellite-badge-pulse"
                :title="`${node.count} item${node.count === 1 ? '' : 's'} need attention`"
              >{{ formatNotificationCount(node.count) }}</span>
            </template>

            <Transition name="hub-preview">
              <div
                v-if="node.type === 'section' && hoveredSectionId === node.id && !activeSectionId"
                class="hub-preview"
                :class="[`tone-${node.tone}`, `pos-${previewPosition(idx, orbitNodes.length)}`]"
                @mouseenter="hoveredSectionId = node.id"
              >
                <div class="hub-preview-title">{{ node.label }}</div>
                <ul class="hub-preview-list">
                  <li v-for="card in node.cards" :key="card.id">
                    <a
                      v-if="card.external && card.to"
                      :href="card.to"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="hub-preview-link"
                      @click="clearHover"
                    >
                      <span class="hub-preview-dot" />
                      {{ card.title }}
                      <span v-if="card.count > 0" class="hub-preview-count">{{ card.count }}</span>
                    </a>
                    <router-link
                      v-else-if="card.to && !card.disabled"
                      :to="card.to"
                      class="hub-preview-link"
                      @click="clearHover"
                    >
                      <span class="hub-preview-dot" />
                      {{ card.title }}
                      <span v-if="card.count > 0" class="hub-preview-count">{{ card.count }}</span>
                    </router-link>
                    <span v-else class="hub-preview-link hub-preview-link--soon">
                      <span class="hub-preview-dot" />
                      {{ card.title }}
                      <span class="hub-preview-count">Soon</span>
                    </span>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>
        </div>

        <p class="hub-stage-tip">
          <span class="hub-stage-tip-icon" aria-hidden="true">💡</span>
          <template v-if="activeSectionId">
            Tip: You're viewing <strong>{{ activeSection?.label }}</strong>. Click the center to return, or pick a tool on the orbit.
          </template>
          <template v-else>
            Tip: Hover a category to preview what's inside. Click to explore hiring, onboarding, and development tools.
          </template>
        </p>
      </div>

      <aside class="hub-sidebar">
        <section class="hub-sidebar-panel">
          <h2>At a glance</h2>
          <ul class="hub-glance-list">
            <li v-if="canManageHiring && hasHiringFeature">
              <span class="glance-dot school" />
              <span>Applications</span>
              <strong>{{ applicationsPending }}</strong>
              <em>Open</em>
            </li>
            <li v-if="canManageHiring && hasHiringFeature">
              <span class="glance-dot office" />
              <span>Onboarding</span>
              <strong>{{ onboardingPending }}</strong>
              <em>In progress</em>
            </li>
            <li>
              <span class="glance-dot total" />
              <span>Areas available</span>
              <strong>{{ visibleSections.length }}</strong>
              <em>Open</em>
            </li>
          </ul>
        </section>

        <section class="hub-sidebar-panel">
          <h2>Your top 5</h2>
          <HubTopCardsBar :cards="allHubCards.filter((c) => c.to && !c.disabled)" :limit="5" class="htcb-hub" />
          <div class="hub-quick-links">
            <a
              v-if="canManageHiring && hasHiringFeature && publicCareersTo"
              :href="publicCareersTo"
              target="_blank"
              rel="noopener noreferrer"
              class="hub-quick-link"
            >Public careers page ↗</a>
            <router-link
              v-if="canManageHiring && hasHiringFeature"
              :to="orgTo('/admin/hiring')"
              class="hub-quick-link"
            >Hiring Dashboard</router-link>
            <router-link
              v-if="canManageHiring && hasHiringFeature"
              :to="orgTo('/admin/hiring/applicants')"
              class="hub-quick-link"
            >
              <span>Applications</span>
              <span v-if="applicationsPending > 0" class="hub-quick-badge">{{ applicationsPending }}</span>
            </router-link>
            <router-link
              v-if="canManageHiring && hasHiringFeature"
              :to="orgTo('/admin/onboarding')"
              class="hub-quick-link"
            >
              <span>Onboarding · Send invite</span>
              <span v-if="onboardingPending > 0" class="hub-quick-badge">{{ onboardingPending }}</span>
            </router-link>
            <router-link
              v-if="canManageHiring && hasHiringFeature"
              :to="orgTo('/admin/careers/jobs')"
              class="hub-quick-link"
            >Job postings</router-link>
            <router-link
              v-if="canManageHiring && (hasHiringFeature || hasPeopleOpsFeature)"
              :to="orgTo('/admin/employee-relations')"
              class="hub-quick-link"
            >Employee Relations</router-link>
          </div>
        </section>
      </aside>
    </div>

    <div class="hub-mobile-fallback">
      <section v-for="section in visibleSections" :key="section.id" class="hub-mobile-section">
        <h2>
          {{ section.label }}
          <span v-if="sectionNotificationCount(section) > 0" class="hub-mobile-section-badge">
            {{ formatNotificationCount(sectionNotificationCount(section)) }}
          </span>
        </h2>
        <div class="hub-mobile-grid">
          <template v-for="card in sortCardsByVisits(section.cards.filter((c) => c.to && !c.disabled))" :key="card.id">
            <a
              v-if="card.external"
              class="hub-mobile-card"
              :class="[`tone-${card.tone}`]"
              :href="card.to"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span v-if="card.count > 0" class="hub-mobile-badge">{{ card.count }}</span>
              <div class="hub-mobile-icon" v-html="card.icon" />
              <div class="hub-mobile-title">{{ card.title }}</div>
              <p>{{ card.desc }}</p>
            </a>
            <router-link
              v-else
              class="hub-mobile-card"
              :class="[`tone-${card.tone}`]"
              :to="card.to"
            >
              <span v-if="card.count > 0" class="hub-mobile-badge">{{ card.count }}</span>
              <div class="hub-mobile-icon" v-html="card.icon" />
              <div class="hub-mobile-title">{{ card.title }}</div>
              <p>{{ card.desc }}</p>
            </router-link>
          </template>
          <div
            v-for="card in section.cards.filter((c) => c.disabled || !c.to)"
            :key="card.id"
            class="hub-mobile-card hub-mobile-card--soon"
            :class="[`tone-${card.tone}`]"
          >
            <span class="hub-mobile-badge">Soon</span>
            <div class="hub-mobile-icon" v-html="card.icon" />
            <div class="hub-mobile-title">{{ card.title }}</div>
            <p>{{ card.desc }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useBrandingStore } from '../store/branding';
import api from '../services/api';
import HubTopCardsBar from '../components/admin/HubTopCardsBar.vue';
import { useHubTopCards } from '../composables/useHubTopCards.js';
import {
  buildHubSwitcherLinks,
  canAccessPeopleOperationsHub,
  workspaceNavContextFromStores
} from '../utils/workspaceNavAccess.js';
import { resolveHostImpliedPortalSlug } from '../utils/orgScopedPath.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const publicAgencySlug = computed(() =>
  String(
    agencyStore.currentAgency?.portal_url ||
    agencyStore.currentAgency?.slug ||
    orgSlug.value ||
    ''
  ).trim()
);

const publicCareersTo = computed(() =>
  publicAgencySlug.value ? `/careers/${publicAgencySlug.value}` : ''
);

const user = computed(() => authStore.user);
const actorRole = computed(() => String(user.value?.role || '').toLowerCase());
const isAdmin = computed(() => ['admin', 'super_admin', 'support'].includes(actorRole.value));
const isAffiliationContext = computed(() => {
  const t = String(agencyStore.currentAgency?.organization_type || '').toLowerCase();
  return t === 'affiliation';
});

const isTruthyFlag = (v) => {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true;
  return false;
};

const agencyFlags = computed(() =>
  agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags || {}
);
const hasPeopleOpsFeature = computed(() => isTruthyFlag(agencyFlags.value?.peopleOpsEnabled));
const hasHiringFeature = computed(() => isTruthyFlag(agencyFlags.value?.hiringEnabled));

const hasCapability = (key) => !!(user.value?.capabilities || {})[key];
const canManageHiring = computed(() => hasCapability('canManageHiring'));
const canViewTraining = computed(() => hasCapability('canViewTraining'));
const canSignDocuments = computed(() => hasCapability('canSignDocuments'));

const hubNavCtx = computed(() => workspaceNavContextFromStores({
  role: actorRole.value,
  slug: orgSlug.value,
  agency: agencyStore.currentAgency,
  branding: brandingStore,
  user: user.value,
  isAffiliationContext: isAffiliationContext.value,
  hasHiringFeature: hasHiringFeature.value,
  hasPeopleOpsFeature: hasPeopleOpsFeature.value
}));

const hubSwitcherLinks = computed(() => buildHubSwitcherLinks({
  ...hubNavCtx.value,
  currentSurface: 'people'
}));

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const canSeeHub = computed(() => canAccessPeopleOperationsHub(hubNavCtx.value));

const applicationsPending = ref(0);
const onboardingPending = ref(0);
const hubPendingTotal = computed(() => applicationsPending.value + onboardingPending.value);

const formatNotificationCount = (n) => {
  const v = Number(n) || 0;
  return v > 99 ? '99+' : String(v);
};

const sectionNotificationCount = (section) =>
  (section?.cards || []).reduce((sum, card) => sum + (Number(card.count) || 0), 0);

const sectionNotificationSummary = (section) => {
  const items = (section?.cards || []).filter((c) => Number(c.count) > 0);
  if (!items.length) return '';
  return items.map((c) => `${c.count} in ${c.title}`).join('; ');
};

const totalHubNotifications = computed(() =>
  visibleSections.value.reduce((sum, section) => sum + sectionNotificationCount(section), 0)
);

const hubNotificationSummary = computed(() => {
  const parts = visibleSections.value
    .map((section) => {
      const n = sectionNotificationCount(section);
      return n > 0 ? `${n} in ${section.label}` : '';
    })
    .filter(Boolean);
  return parts.join('; ') || '';
});

const hubCenterNotificationCount = computed(() =>
  activeSection.value
    ? sectionNotificationCount(activeSection.value)
    : totalHubNotifications.value
);

const hubCenterNotificationSummary = computed(() =>
  activeSection.value
    ? sectionNotificationSummary(activeSection.value)
    : hubNotificationSummary.value
);

const activeSectionId = ref(null);
const hoveredSectionId = ref(null);
const hoveredCardId = ref(null);

const icon = {
  hub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>',
  careers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v4M8 12h8" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>',
  hiring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M19 8v6M22 11h-6" stroke-linecap="round"/></svg>',
  training: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="M5 10v5c0 1.5 3 3 7 3s7-1.5 7-3v-5M12 13v8" stroke-linecap="round"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke-linecap="round"/></svg>',
  onboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/><path d="M7 8h10M7 11h6" stroke-linecap="round"/></svg>',
  offboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  policy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  relations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 13h6" stroke-linecap="round"/></svg>',
  interview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4M8 14h4M8 17h6" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke-linecap="round"/></svg>'
};

const allSections = computed(() => [
  {
    id: 'careers',
    label: 'Careers',
    desc: 'Public careers page and open roles.',
    tone: 'blue',
    icon: icon.careers,
    cards: [
      {
        id: 'public-careers',
        title: 'Public careers page',
        shortDesc: 'View the live careers site.',
        desc: 'Open the public careers page candidates see — open roles, culture, and applications.',
        cta: 'View site ↗',
        to: publicCareersTo.value,
        tone: 'green',
        icon: icon.globe,
        tour: 'people-ops-public-careers',
        show: canManageHiring.value && hasHiringFeature.value && publicCareersTo.value,
        external: true,
        count: 0
      },
      {
        id: 'career-page-settings',
        title: 'Career page settings',
        shortDesc: 'Branding, copy, and page content.',
        desc: 'Configure the public careers page — branding, sections, and messaging.',
        cta: 'Open →',
        to: orgTo('/admin/careers/page'),
        tone: 'blue',
        icon: icon.page,
        tour: 'people-ops-career-page',
        show: canManageHiring.value && hasHiringFeature.value,
        count: 0
      },
      {
        id: 'job-postings',
        title: 'Job postings',
        shortDesc: 'Open roles and descriptions.',
        desc: 'Create and manage job postings shown on the careers page.',
        cta: 'Open →',
        to: orgTo('/admin/careers/jobs'),
        tone: 'indigo',
        icon: icon.careers,
        tour: 'people-ops-job-postings',
        show: canManageHiring.value && hasHiringFeature.value,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'hiring',
    label: 'Hiring',
    desc: 'Dashboard, applicants, interviews, and pre-hire.',
    tone: 'amber',
    icon: icon.hiring,
    cards: [
      {
        id: 'hiring-dashboard',
        title: 'Hiring Dashboard',
        shortDesc: 'Pipeline stats and interviews.',
        desc: 'Hiring overview with pipeline stats and upcoming interviews.',
        cta: 'Open →',
        to: orgTo('/admin/hiring'),
        tone: 'teal',
        icon: icon.people,
        tour: 'people-ops-hiring-dashboard',
        show: canManageHiring.value && hasHiringFeature.value,
        count: 0
      },
      {
        id: 'applicants',
        title: 'Applications',
        shortDesc: 'Pipeline and application records.',
        desc: 'Review applications and manage the hiring pipeline.',
        cta: applicationsPending.value > 0 ? `Review ${applicationsPending.value} →` : 'Open →',
        to: orgTo('/admin/hiring/applicants'),
        tone: 'amber',
        icon: icon.hiring,
        tour: 'people-ops-applicants',
        show: canManageHiring.value && hasHiringFeature.value,
        count: applicationsPending.value
      },
      {
        id: 'interview-hub',
        title: 'Interview Hub',
        shortDesc: 'Interview scheduling and feedback.',
        desc: 'Coordinate interviews and capture feedback.',
        cta: 'Open →',
        to: orgTo('/admin/interview-hub'),
        tone: 'orange',
        icon: icon.interview,
        tour: 'people-ops-interview-hub',
        show: canManageHiring.value && hasHiringFeature.value,
        count: 0
      },
      {
        id: 'pre-hire',
        title: 'Pre-Hire',
        shortDesc: 'Pre-hire checklists and tasks.',
        desc: 'Manage pre-hire packages before onboarding starts.',
        cta: 'Open →',
        to: orgTo('/admin/pre-hire'),
        tone: 'rose',
        icon: icon.onboard,
        tour: 'people-ops-pre-hire',
        show: canManageHiring.value && hasHiringFeature.value,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'performance-development',
    label: 'Performance & Development',
    desc: 'Training, progress, and documents.',
    tone: 'green',
    icon: icon.training,
    cards: [
      {
        id: 'training-modules',
        title: 'Training Modules',
        shortDesc: 'Course builder and modules.',
        desc: 'Build and manage training courses and modules.',
        cta: 'Open →',
        to: orgTo('/admin/modules'),
        tone: 'green',
        icon: icon.training,
        tour: 'people-ops-modules',
        show: hasPeopleOpsFeature.value && isAdmin.value && actorRole.value !== 'clinical_practice_assistant' && canViewTraining.value,
        count: 0
      },
      {
        id: 'progress',
        title: 'Progress',
        shortDesc: 'Staff training completion.',
        desc: 'Track staff training completion and progress.',
        cta: 'Open →',
        to: orgTo('/admin/agency-progress'),
        tone: 'teal',
        icon: icon.progress,
        tour: 'people-ops-progress',
        show: hasPeopleOpsFeature.value && canViewTraining.value,
        count: 0
      },
      {
        id: 'documents',
        title: 'Documents',
        shortDesc: 'Agency documents to sign.',
        desc: 'View, assign, and manage agency documents.',
        cta: 'Open →',
        to: orgTo('/admin/documents'),
        tone: 'indigo',
        icon: icon.docs,
        tour: 'people-ops-documents',
        show: isAdmin.value && actorRole.value !== 'clinical_practice_assistant' && canSignDocuments.value,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    desc: 'New-hire onboarding checklists.',
    tone: 'cyan',
    icon: icon.onboard,
    cards: [
      {
        id: 'onboarding-admin',
        title: 'Onboarding',
        shortDesc: 'Progress and portal invites.',
        desc: 'Track onboarding progress and resend portal / login invites.',
        cta: onboardingPending.value > 0 ? `Review ${onboardingPending.value} →` : 'Open →',
        to: orgTo('/admin/onboarding'),
        tone: 'cyan',
        icon: icon.onboard,
        tour: 'people-ops-onboarding',
        show: canManageHiring.value && hasHiringFeature.value,
        count: onboardingPending.value
      }
    ].filter((c) => c.show)
  },
  {
    id: 'offboarding',
    label: 'Offboarding',
    desc: 'Separation workflows (coming soon).',
    tone: 'orange',
    icon: icon.offboard,
    cards: [
      {
        id: 'offboarding-soon',
        title: 'Offboarding',
        shortDesc: 'Separation checklists coming soon.',
        desc: 'Offboarding workflows and checklists will live here.',
        cta: 'Soon',
        to: null,
        disabled: true,
        tone: 'orange',
        icon: icon.offboard,
        tour: null,
        show: true,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'policies',
    label: 'Policies & Acknowledgements',
    desc: 'Workplace Handbook and policy attestations.',
    tone: 'indigo',
    icon: icon.policy,
    cards: [
      {
        id: 'workplace-handbook',
        title: 'Workplace Handbook',
        shortDesc: 'Edit and publish the in-app handbook.',
        desc: 'Manage Workplace Handbook versions and Provider Update handbook section from Provider Update admin.',
        cta: 'Open →',
        to: orgTo('/admin/provider-update'),
        tone: 'indigo',
        icon: icon.policy,
        tour: null,
        show: true,
        count: 0
      },
      {
        id: 'policies-soon',
        title: 'Policies & Acknowledgements',
        shortDesc: 'Attestations coming soon.',
        desc: 'Policy distribution and acknowledgements will live here.',
        cta: 'Soon',
        to: null,
        disabled: true,
        tone: 'indigo',
        icon: icon.policy,
        tour: null,
        show: true,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'employee-relations',
    label: 'Employee Relations',
    desc: 'Engagement, retention, and milestones.',
    tone: 'rose',
    icon: icon.relations,
    cards: [
      {
        id: 'engagement-retention',
        title: 'Engagement & Retention',
        shortDesc: 'Service milestones and gifts.',
        desc: 'Track service anniversaries, gifts owed, and acknowledgements.',
        cta: 'Open →',
        to: orgTo('/admin/employee-relations'),
        tone: 'rose',
        icon: icon.relations,
        tour: 'people-ops-employee-relations',
        show: canManageHiring.value && (hasHiringFeature.value || hasPeopleOpsFeature.value),
        count: 0
      }
    ].filter((c) => c.show)
  }
]);

const visibleSections = computed(() => allSections.value.filter((s) => s.cards.length > 0));

const allHubCards = computed(() => visibleSections.value.flatMap((section) => section.cards));

const { sortCardsByVisits } = useHubTopCards(allHubCards, { limit: 5 });

const activeSection = computed(() =>
  visibleSections.value.find((s) => s.id === activeSectionId.value) || null
);

const centerTitle = computed(() => (activeSection.value ? activeSection.value.label : 'People Operations'));
const centerDesc = computed(() =>
  activeSection.value
    ? activeSection.value.desc
    : 'Hiring, careers, onboarding, and development — connected.'
);
const centerIcon = computed(() => (activeSection.value ? activeSection.value.icon : icon.hub));

const orbitNodes = computed(() => {
  if (activeSection.value) {
    return sortCardsByVisits(activeSection.value.cards).map((card) => ({
      type: 'card',
      key: card.id,
      ...card
    }));
  }
  return visibleSections.value.map((section) => ({
    type: 'section',
    key: section.id,
    id: section.id,
    label: section.label,
    desc: section.desc,
    tone: section.tone,
    icon: section.icon,
    cards: section.cards,
    cardCount: section.cards.length,
    notificationCount: sectionNotificationCount(section),
    notificationSummary: sectionNotificationSummary(section)
  }));
});

const ORBIT_RADIUS_SVG = 195;
const SVG_CENTER = 300;

function hubRand(seed) {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

const ambientDots = Array.from({ length: 32 }, (_, i) => {
  const r1 = hubRand(i + 1);
  const r2 = hubRand(i + 41);
  const r3 = hubRand(i + 89);
  const r4 = hubRand(i + 131);
  const r5 = hubRand(i + 173);
  return {
    id: i,
    top: `${6 + r1 * 88}%`,
    left: `${3 + r2 * 94}%`,
    size: 3 + Math.floor(r3 * 6),
    delay: r4 * 16,
    duration: 9 + r5 * 12,
    driftX: Math.round((r3 - 0.5) * 24),
    driftY: Math.round((r4 - 0.5) * 20)
  };
});

function getOrbitLayout(idx, count) {
  const startAngle = -90;
  const angleDeg = startAngle + (360 / count) * idx;
  const angleRad = (angleDeg * Math.PI) / 180;
  const radiusRatio = ORBIT_RADIUS_SVG / SVG_CENTER;
  return {
    angleDeg,
    leftPct: 50 + radiusRatio * 50 * Math.cos(angleRad),
    topPct: 50 + radiusRatio * 50 * Math.sin(angleRad),
    svgX: SVG_CENTER + ORBIT_RADIUS_SVG * Math.cos(angleRad),
    svgY: SVG_CENTER + ORBIT_RADIUS_SVG * Math.sin(angleRad)
  };
}

const connectorPoints = computed(() => {
  const count = orbitNodes.value.length;
  if (!count) return [];
  return orbitNodes.value.map((_, idx) => {
    const { svgX, svgY } = getOrbitLayout(idx, count);
    return { x: svgX, y: svgY };
  });
});

const orbitStyle = (idx, count) => {
  const { leftPct, topPct } = getOrbitLayout(idx, count);
  return {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: 'translate(-50%, -50%)'
  };
};

const previewPosition = (idx, count) => {
  const { topPct, leftPct } = getOrbitLayout(idx, count);
  if (topPct < 38) return 'bottom';
  if (topPct > 62) return 'top';
  if (leftPct < 42) return 'right';
  if (leftPct > 58) return 'left';
  return topPct < 50 ? 'bottom' : 'top';
};

const isNodeHighlighted = (node) => {
  if (node.type === 'section') {
    return hoveredSectionId.value === node.id || activeSectionId.value === node.id;
  }
  return hoveredCardId.value === node.id;
};

const selectSection = (id) => {
  activeSectionId.value = id;
  hoveredSectionId.value = null;
  hoveredCardId.value = null;
};

const goToRoot = () => {
  activeSectionId.value = null;
  hoveredSectionId.value = null;
  hoveredCardId.value = null;
};

const clearHover = () => {
  hoveredSectionId.value = null;
  hoveredCardId.value = null;
};

const loadPendingCounts = async () => {
  if (!canSeeHub.value || !canManageHiring.value || !hasHiringFeature.value) {
    applicationsPending.value = 0;
    onboardingPending.value = 0;
    return;
  }
  try {
    const params = agencyId.value ? { agencyId: agencyId.value } : undefined;
    const [dashRes, onboardRes] = await Promise.all([
      api.get('/hiring/dashboard', { params, skipGlobalLoading: true }).catch(() => null),
      api.get('/hiring/onboarding-candidates', { params, skipGlobalLoading: true }).catch(() => null)
    ]);
    const stats = dashRes?.data || {};
    applicationsPending.value = Number(
      stats.pendingReviews
      ?? stats.totalApplicants
      ?? stats.stageCounts?.totalActive
      ?? 0
    );
    const onboardList = Array.isArray(onboardRes?.data) ? onboardRes.data : (onboardRes?.data?.candidates || []);
    onboardingPending.value = onboardList.filter((e) => Number(e.progress_pct || 0) < 100).length;
  } catch {
    applicationsPending.value = 0;
    onboardingPending.value = 0;
  }
};

watch(agencyId, loadPendingCounts);
watch(visibleSections, (sections) => {
  if (activeSectionId.value && !sections.some((s) => s.id === activeSectionId.value)) {
    goToRoot();
  }
});
onMounted(() => {
  loadPendingCounts();
  const hostSlug = resolveHostImpliedPortalSlug(brandingStore);
  if (!route.params.organizationSlug && agencyStore.currentAgency && !hostSlug) {
    const slug = agencyStore.currentAgency.slug || agencyStore.currentAgency.portal_url;
    if (slug) router.replace(`/${slug}/people-operations`);
  }
});
</script>

<style scoped>
.wo-hub {
  --hub-ink: color-mix(in srgb, var(--primary, #1f6b4a) 22%, #0f172a);
  --hub-muted: #64748b;
  --hub-line: #e2e8f0;
  --hub-panel: #fff;
  --hub-bg: #f8fafc;
  position: relative;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 24px 24px 40px;
  box-sizing: border-box;
  color: var(--hub-ink);
  min-height: calc(100vh - 72px);
  min-height: calc(100dvh - 72px);
  background:
    radial-gradient(circle at 20% 10%, rgba(34, 197, 94, 0.05), transparent 40%),
    radial-gradient(circle at 80% 20%, rgba(20, 184, 166, 0.04), transparent 35%),
    radial-gradient(circle at 50% 90%, rgba(14, 116, 144, 0.04), transparent 40%),
    var(--hub-bg);
  overflow: visible;
}

.hub-ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.hub-ambient-dot {
  position: absolute;
  border-radius: 50%;
  opacity: 0.55;
  animation:
    hub-dot-color var(--dot-duration, 12s) ease-in-out infinite,
    hub-dot-float calc(var(--dot-duration, 12s) * 0.85) ease-in-out infinite;
}
@keyframes hub-dot-color {
  0%, 100% {
    background: #0e7490;
    box-shadow: 0 0 10px rgba(14, 116, 144, 0.55);
  }
  33% {
    background: #22c55e;
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.55);
  }
  66% {
    background: #3b82f6;
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.55);
  }
}
@keyframes hub-dot-float {
  0%, 100% { transform: translate(0, 0); opacity: 0.4; }
  50% { transform: translate(var(--drift-x, 6px), var(--drift-y, -8px)); opacity: 0.7; }
}

.hub-header,
.hub-alert,
.hub-layout,
.hub-mobile-fallback {
  position: relative;
  z-index: 1;
}

.hub-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.hub-brand { display: flex; gap: 14px; align-items: flex-start; }
.hub-icon {
  width: 48px; height: 48px; border-radius: 14px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--primary, #1f6b4a) 12%, #fff);
  color: var(--primary, #1f6b4a);
}
.hub-icon svg { width: 24px; height: 24px; }
.hub-title {
  margin: 0;
  font-size: clamp(1.5rem, 2.2vw, 1.9rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--primary, #1f6b4a);
}
.hub-subtitle {
  margin: 6px 0 0;
  color: var(--hub-muted);
  font-size: 14px;
  max-width: 52ch;
  line-height: 1.45;
}
.hub-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.hub-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 3px;
}
.hub-switcher-btn {
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
.hub-switcher-btn:hover {
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.hub-switcher-btn.is-active {
  background: #fff;
  color: var(--primary, #1f6b4a);
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  font-weight: 700;
  cursor: default;
}
.hub-calendar-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 12px;
  border: 1px solid var(--hub-line); background: #fff;
  color: var(--hub-ink); text-decoration: none;
  font-weight: 700; font-size: 13px;
}

.hub-alert {
  display: flex; justify-content: space-between; gap: 10px;
  align-items: center; flex-wrap: wrap;
  margin: 0 0 16px; padding: 9px 14px;
  border: 1px solid #fecaca; border-radius: 12px; background: #fef2f2;
}
.hub-alert-copy strong { color: #991b1b; font-size: 13px; font-weight: 700; }
.hub-alert-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hub-pill {
  display: inline-flex; padding: 4px 10px; border-radius: 999px;
  background: #fff; border: 1px solid #fecaca;
  color: #991b1b; font-size: 12px; font-weight: 700;
}
.hub-pill-link {
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.hub-pill-link:hover {
  background: #fee2e2;
  border-color: #f87171;
}

.hub-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 24px;
  align-items: start;
}

.hub-stage-wrap {
  min-width: 0;
  overflow: visible;
  padding: 24px 12px 8px;
}

.hub-stage {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  aspect-ratio: 1;
  min-height: 560px;
  overflow: visible;
}

.hub-rings {
  position: absolute;
  inset: 8%;
  pointer-events: none;
  z-index: 0;
}
.hub-ring {
  position: absolute;
  border-radius: 50%;
  transform-origin: 50% 50%;
  will-change: transform;
  border-style: dashed;
  background: transparent;
}
.hub-ring-1 {
  inset: 0;
  border-width: 2px;
  border-color: rgba(14, 116, 144, 0.35);
  opacity: 0.9;
}
.hub-ring-2 {
  inset: 10%;
  border-width: 2px;
  border-color: rgba(34, 197, 94, 0.32);
}
.hub-ring-3 {
  inset: 20%;
  border-width: 2px;
  border-color: rgba(59, 130, 246, 0.3);
}
.hub-ring-orbit {
  inset: 0;
  margin: auto;
  width: 77%;
  height: 77%;
  border-width: 2px;
  border-color: rgba(148, 163, 184, 0.38);
}
.hub-ring-spin-cw { animation: hub-spin-cw 56s linear infinite; }
.hub-ring-spin-ccw { animation: hub-spin-ccw 44s linear infinite; }
.hub-ring-orbit.hub-ring-spin-ccw { animation-duration: 48s; }

@keyframes hub-spin-cw {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes hub-spin-ccw {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

.hub-connectors {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
.hub-connector-ring-orbit {
  transform-origin: 300px 300px;
  transform-box: fill-box;
  animation: hub-spin-ccw 48s linear infinite;
}
.hub-connector-ring {
  fill: none;
  stroke: rgba(148, 163, 184, 0.4);
  stroke-width: 2;
  stroke-dasharray: 10 9;
  stroke-linecap: round;
}
.hub-connector-line {
  stroke-width: 2;
  stroke-dasharray: 6 5;
  stroke-linecap: round;
  transition: stroke 0.2s ease, stroke-width 0.2s ease, stroke-opacity 0.2s ease;
}
.hub-connector-line.tone-purple {
  stroke: #64748b;
  stroke-opacity: 0.72;
}
.hub-connector-line.tone-green {
  stroke: #22c55e;
  stroke-opacity: 0.72;
}
.hub-connector-line.tone-blue {
  stroke: #3b82f6;
  stroke-opacity: 0.72;
}
.hub-connector-line.tone-orange {
  stroke: #f97316;
  stroke-opacity: 0.72;
}
.hub-connector-line.tone-indigo {
  stroke: #0e7490;
  stroke-opacity: 0.72;
}
.hub-connector-line.tone-teal {
  stroke: #14b8a6;
  stroke-opacity: 0.72;
}
.hub-connector-line.tone-cyan {
  stroke: #06b6d4;
  stroke-opacity: 0.72;
}
.hub-connector-line.active {
  stroke-width: 2.75;
  stroke-opacity: 1;
}
.hub-connector-line.has-notifications {
  stroke-width: 2.5;
  stroke-opacity: 0.92;
}

.hub-center-wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  width: min(220px, 38vw);
  height: min(220px, 38vw);
}

.hub-center {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid #e9d5ff;
  background:
    radial-gradient(circle at 50% 30%, #f8fafc 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(14, 116, 144, 0.14),
    0 20px 50px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 20px;
  box-sizing: border-box;
  overflow: visible;
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease;
}
.hub-center-wrap:has(.hub-center.is-clickable:hover) .hub-center,
.hub-center.is-clickable:hover {
  transform: scale(1.02);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.75),
    0 0 56px rgba(14, 116, 144, 0.2),
    0 24px 56px rgba(15, 23, 42, 0.12);
}
.hub-center.is-clickable {
  cursor: pointer;
}
.hub-center.tone-purple {
  border-color: #cbd5e1;
  background: radial-gradient(circle at 50% 30%, #f8fafc 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(14, 116, 144, 0.2),
    0 20px 50px rgba(14, 116, 144, 0.1);
}
.hub-center.tone-green {
  border-color: #bbf7d0;
  background: radial-gradient(circle at 50% 30%, #ecfdf5 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(34, 197, 94, 0.2),
    0 20px 50px rgba(34, 197, 94, 0.1);
}
.hub-center.tone-blue {
  border-color: #bfdbfe;
  background: radial-gradient(circle at 50% 30%, #eff6ff 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(59, 130, 246, 0.2),
    0 20px 50px rgba(59, 130, 246, 0.1);
}
.hub-center.tone-root .hub-center-icon { background: #ecfdf5; color: #16a34a; }
.hub-center.tone-indigo {
  border-color: #c7d2fe;
  background: radial-gradient(circle at 50% 30%, #ecfeff 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(14, 116, 144, 0.2),
    0 20px 50px rgba(14, 116, 144, 0.1);
}
.hub-center.tone-teal {
  border-color: #99f6e4;
  background: radial-gradient(circle at 50% 30%, #f0fdfa 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(20, 184, 166, 0.2),
    0 20px 50px rgba(20, 184, 166, 0.1);
}
.hub-center.tone-cyan {
  border-color: #67e8f9;
  background: radial-gradient(circle at 50% 30%, #ecfeff 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(6, 182, 212, 0.22),
    0 20px 50px rgba(6, 182, 212, 0.12);
}
.hub-center.tone-indigo .hub-center-icon { background: #ecfeff; color: #0e7490; }
.hub-center.tone-teal .hub-center-icon { background: #f0fdfa; color: #0f766e; }
.hub-center.tone-cyan .hub-center-icon { background: #ecfeff; color: #0e7490; }
.hub-center.tone-purple .hub-center-icon { background: #f8fafc; color: #475569; }
.hub-center.tone-green .hub-center-icon { background: #ecfdf5; color: #16a34a; }
.hub-center.tone-blue .hub-center-icon { background: #eff6ff; color: #2563eb; }

.hub-center-icon {
  width: 52px; height: 52px; border-radius: 16px;
  display: grid; place-items: center; margin-bottom: 12px;
}
.hub-center-icon :deep(svg) { width: 26px; height: 26px; }
.hub-center-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
  color: var(--hub-ink);
}
.hub-center-desc {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--hub-muted);
  max-width: 22ch;
}
.hub-center-meta,
.hub-center-back {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--hub-muted);
}
.hub-center-back { color: var(--primary, #0f766e); }

.hub-orbit-node {
  position: absolute;
  z-index: 2;
  overflow: visible;
  width: 164px;
  height: 164px;
  transition: left 0.45s cubic-bezier(0.22, 1, 0.36, 1), top 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
.hub-orbit-node:has(.hub-preview),
.hub-orbit-node:has(.hub-satellite.hovered),
.hub-orbit-node:has(.hub-satellite.active) {
  z-index: 30;
}

.hub-orbit-node::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 210px;
  height: 210px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  z-index: -1;
  pointer-events: none;
  opacity: 0.9;
}
.hub-orbit-node.tone-purple::before {
  background: radial-gradient(circle, rgba(100, 116, 139, 0.38) 0%, rgba(100, 116, 139, 0.12) 42%, transparent 72%);
}
.hub-orbit-node.tone-green::before {
  background: radial-gradient(circle, rgba(74, 222, 128, 0.38) 0%, rgba(74, 222, 128, 0.12) 42%, transparent 72%);
}
.hub-orbit-node.tone-blue::before {
  background: radial-gradient(circle, rgba(96, 165, 250, 0.38) 0%, rgba(96, 165, 250, 0.12) 42%, transparent 72%);
}
.hub-orbit-node.tone-orange::before {
  background: radial-gradient(circle, rgba(251, 146, 60, 0.34) 0%, rgba(251, 146, 60, 0.1) 42%, transparent 72%);
}
.hub-orbit-node.tone-indigo::before {
  background: radial-gradient(circle, rgba(14, 116, 144, 0.34) 0%, rgba(14, 116, 144, 0.1) 42%, transparent 72%);
}
.hub-orbit-node.tone-teal::before {
  background: radial-gradient(circle, rgba(45, 212, 191, 0.34) 0%, rgba(45, 212, 191, 0.1) 42%, transparent 72%);
}
.hub-orbit-node.tone-cyan::before {
  background: radial-gradient(circle, rgba(6, 182, 212, 0.36) 0%, rgba(6, 182, 212, 0.12) 42%, transparent 72%);
}

.hub-satellite {
  width: 164px;
  height: 164px;
  aspect-ratio: 1;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--hub-line);
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.07);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 14px 12px;
  box-sizing: border-box;
  overflow: visible;
  cursor: pointer;
  position: relative;
  z-index: 1;
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease,
    border-color 0.25s ease;
  font: inherit;
  color: inherit;
}
.hub-satellite.tone-purple {
  border-color: #c4b5fd;
  background: radial-gradient(circle at 50% 28%, #f8fafc 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(100, 116, 139, 0.14),
    0 0 28px rgba(14, 116, 144, 0.22),
    0 12px 28px rgba(14, 116, 144, 0.1);
}
.hub-satellite.tone-green {
  border-color: #86efac;
  background: radial-gradient(circle at 50% 28%, #ecfdf5 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(74, 222, 128, 0.14),
    0 0 28px rgba(34, 197, 94, 0.22),
    0 12px 28px rgba(34, 197, 94, 0.1);
}
.hub-satellite.tone-blue {
  border-color: #93c5fd;
  background: radial-gradient(circle at 50% 28%, #eff6ff 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(96, 165, 250, 0.14),
    0 0 28px rgba(59, 130, 246, 0.22),
    0 12px 28px rgba(59, 130, 246, 0.1);
}
.hub-satellite.tone-orange {
  border-color: #fdba74;
  background: radial-gradient(circle at 50% 28%, #fff7ed 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(251, 146, 60, 0.12),
    0 0 28px rgba(249, 115, 22, 0.18),
    0 12px 28px rgba(249, 115, 22, 0.08);
}
.hub-satellite.tone-indigo {
  border-color: #a5b4fc;
  background: radial-gradient(circle at 50% 28%, #ecfeff 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(14, 116, 144, 0.12),
    0 0 28px rgba(14, 116, 144, 0.18),
    0 12px 28px rgba(14, 116, 144, 0.08);
}
.hub-satellite.tone-teal {
  border-color: #5eead4;
  background: radial-gradient(circle at 50% 28%, #f0fdfa 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(45, 212, 191, 0.12),
    0 0 28px rgba(20, 184, 166, 0.18),
    0 12px 28px rgba(20, 184, 166, 0.08);
}
.hub-satellite.tone-cyan {
  border-color: #22d3ee;
  background: radial-gradient(circle at 50% 28%, #ecfeff 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(34, 211, 238, 0.14),
    0 0 28px rgba(6, 182, 212, 0.2),
    0 12px 28px rgba(6, 182, 212, 0.1);
}
.hub-satellite-link { text-decoration: none; }
.hub-satellite:hover,
.hub-satellite.hovered,
.hub-satellite:focus-visible {
  transform: scale(1.05);
}
.hub-satellite.tone-purple:hover,
.hub-satellite.tone-purple.hovered {
  box-shadow:
    0 0 0 7px rgba(100, 116, 139, 0.2),
    0 0 40px rgba(14, 116, 144, 0.32),
    0 18px 36px rgba(14, 116, 144, 0.14);
}
.hub-satellite.tone-green:hover,
.hub-satellite.tone-green.hovered {
  box-shadow:
    0 0 0 7px rgba(74, 222, 128, 0.2),
    0 0 40px rgba(34, 197, 94, 0.32),
    0 18px 36px rgba(34, 197, 94, 0.14);
}
.hub-satellite.tone-blue:hover,
.hub-satellite.tone-blue.hovered {
  box-shadow:
    0 0 0 7px rgba(96, 165, 250, 0.2),
    0 0 40px rgba(59, 130, 246, 0.32),
    0 18px 36px rgba(59, 130, 246, 0.14);
}
.hub-satellite.tone-orange:hover,
.hub-satellite.tone-orange.hovered {
  box-shadow:
    0 0 0 7px rgba(251, 146, 60, 0.18),
    0 0 40px rgba(249, 115, 22, 0.28),
    0 18px 36px rgba(249, 115, 22, 0.12);
}
.hub-satellite.tone-indigo:hover,
.hub-satellite.tone-indigo.hovered {
  box-shadow:
    0 0 0 7px rgba(14, 116, 144, 0.18),
    0 0 40px rgba(14, 116, 144, 0.28),
    0 18px 36px rgba(14, 116, 144, 0.12);
}
.hub-satellite.tone-teal:hover,
.hub-satellite.tone-teal.hovered {
  box-shadow:
    0 0 0 7px rgba(45, 212, 191, 0.18),
    0 0 40px rgba(20, 184, 166, 0.28),
    0 18px 36px rgba(20, 184, 166, 0.12);
}
.hub-satellite.tone-cyan:hover,
.hub-satellite.tone-cyan.hovered {
  box-shadow:
    0 0 0 7px rgba(34, 211, 238, 0.22),
    0 0 40px rgba(6, 182, 212, 0.32),
    0 18px 36px rgba(6, 182, 212, 0.14);
}

.hub-satellite-icon {
  width: 40px; height: 40px; border-radius: 12px;
  display: grid; place-items: center; margin-bottom: 8px;
}
.hub-satellite-icon :deep(svg) { width: 20px; height: 20px; }
.tone-purple .hub-satellite-icon { background: #f8fafc; color: #475569; }
.tone-green .hub-satellite-icon { background: #ecfdf5; color: #16a34a; }
.tone-blue .hub-satellite-icon { background: #eff6ff; color: #2563eb; }
.tone-orange .hub-satellite-icon { background: #fff7ed; color: #c2410c; }
.tone-indigo .hub-satellite-icon { background: #ecfeff; color: #0e7490; }
.tone-teal .hub-satellite-icon { background: #f0fdfa; color: #0f766e; }
.tone-cyan .hub-satellite-icon { background: #ecfeff; color: #0e7490; }

.hub-satellite-title {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.15;
  margin-bottom: 3px;
}
.hub-satellite-desc {
  margin: 0;
  font-size: 10px;
  line-height: 1.3;
  color: var(--hub-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hub-satellite-pill {
  margin-top: 6px;
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #f8fafc;
  color: var(--hub-muted);
}
.tone-purple .hub-satellite-pill { background: #f8fafc; color: #475569; }
.tone-green .hub-satellite-pill { background: #ecfdf5; color: #15803d; }
.tone-blue .hub-satellite-pill { background: #eff6ff; color: #1d4ed8; }

.hub-satellite-badge {
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(20%, -20%);
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.45);
  z-index: 12;
  pointer-events: none;
}
.hub-satellite-badge-pulse {
  animation: hub-badge-pulse 2s ease-in-out infinite;
}

.hub-center-badge {
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(20%, -20%);
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 10px rgba(220, 38, 38, 0.4);
  z-index: 12;
  pointer-events: none;
  animation: hub-badge-pulse 2s ease-in-out infinite;
}

@keyframes hub-badge-pulse {
  0%, 100% { transform: translate(20%, -20%) scale(1); box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4); }
  50% { transform: translate(20%, -20%) scale(1.08); box-shadow: 0 4px 16px rgba(220, 38, 38, 0.55); }
}

.hub-preview {
  position: absolute;
  top: 50%;
  width: 240px;
  max-width: min(240px, 72vw);
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--hub-line);
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
  transform: translateY(-50%);
  z-index: 40;
  pointer-events: auto;
}
.hub-preview.pos-left { right: calc(100% + 14px); }
.hub-preview.pos-right { left: calc(100% + 14px); }
.hub-preview.pos-top {
  left: 50%;
  top: auto;
  bottom: calc(100% + 14px);
  transform: translateX(-50%);
}
.hub-preview.pos-bottom {
  left: 50%;
  top: calc(100% + 14px);
  transform: translateX(-50%);
}
.hub-preview.tone-purple { border-color: #cbd5e1; }
.hub-preview.tone-green { border-color: #bbf7d0; }
.hub-preview.tone-blue { border-color: #bfdbfe; }
.hub-preview.tone-indigo { border-color: #c7d2fe; }
.hub-preview.tone-teal { border-color: #99f6e4; }
.hub-preview.tone-cyan { border-color: #67e8f9; }

.hub-preview-title {
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 8px;
  color: var(--hub-ink);
}
.hub-preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(320px, 52vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.hub-preview-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--hub-ink);
  font-size: 12px;
  font-weight: 600;
  transition: background 0.15s ease;
}
.hub-preview-link:hover { background: #f8fafc; }
.hub-preview-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
  background: currentColor;
}
.tone-purple .hub-preview-dot { color: #475569; }
.tone-green .hub-preview-dot { color: #16a34a; }
.tone-blue .hub-preview-dot { color: #2563eb; }
.hub-preview-count {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hub-preview-enter-active,
.hub-preview-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.hub-preview-enter-from,
.hub-preview-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.96);
}
.hub-preview.pos-top.hub-preview-enter-from,
.hub-preview.pos-top.hub-preview-leave-to,
.hub-preview.pos-bottom.hub-preview-enter-from,
.hub-preview.pos-bottom.hub-preview-leave-to {
  transform: translateX(-50%) scale(0.96);
}

.hub-stage-tip {
  margin: 8px auto 0;
  max-width: 720px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--hub-line);
  font-size: 13px;
  color: var(--hub-muted);
  line-height: 1.45;
}
.hub-stage-tip strong { color: var(--hub-ink); }
.hub-stage-tip-icon { flex-shrink: 0; }

.hub-sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 88px;
}
.hub-sidebar-panel {
  background: #fff;
  border: 1px solid var(--hub-line);
  border-radius: 16px;
  padding: 16px;
}
.hub-sidebar-panel h2 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--hub-ink);
}
.hub-glance-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hub-glance-list li {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 4px 8px;
  align-items: center;
  font-size: 12px;
  color: var(--hub-muted);
}
.hub-glance-list strong {
  grid-column: 3;
  grid-row: 1 / span 2;
  font-size: 18px;
  color: var(--hub-ink);
}
.hub-glance-list em {
  grid-column: 2;
  font-style: normal;
  font-size: 11px;
  color: #94a3b8;
}
.glance-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.glance-dot.office { background: #ea580c; }
.glance-dot.school { background: #16a34a; }
.glance-dot.total { background: #64748b; }

.hub-quick-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hub-quick-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--hub-line);
  text-decoration: none;
  color: var(--hub-ink);
  font-size: 12px;
  font-weight: 600;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.hub-quick-link:hover {
  background: #f8fafc;
  border-color: color-mix(in srgb, var(--primary, #1f6b4a) 25%, var(--hub-line));
}
.hub-quick-badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hub-mobile-fallback { display: none; }

@media (max-width: 1100px) {
  .hub-layout {
    grid-template-columns: 1fr;
  }
  .hub-sidebar {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .hub-stage-wrap,
  .hub-sidebar {
    display: none;
  }
  .hub-mobile-fallback {
    display: block;
  }
  .hub-mobile-section + .hub-mobile-section {
    margin-top: 24px;
  }
  .hub-mobile-section h2 {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--hub-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hub-mobile-section-badge {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: #dc2626;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: hub-badge-pulse 2s ease-in-out infinite;
  }
  .hub-mobile-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .hub-mobile-card {
    position: relative;
    display: block;
    text-decoration: none;
    color: inherit;
    background: #fff;
    border: 1px solid var(--hub-line);
    border-radius: 14px;
    padding: 14px;
  }
  .hub-mobile-icon {
    width: 36px; height: 36px; border-radius: 10px;
    display: grid; place-items: center; margin-bottom: 8px;
  }
  .hub-mobile-icon :deep(svg) { width: 18px; height: 18px; }
  .tone-purple .hub-mobile-icon { background: #f8fafc; color: #475569; }
  .tone-green .hub-mobile-icon { background: #ecfdf5; color: #16a34a; }
  .tone-blue .hub-mobile-icon { background: #eff6ff; color: #2563eb; }
  .tone-orange .hub-mobile-icon { background: #fff7ed; color: #c2410c; }
  .tone-indigo .hub-mobile-icon { background: #ecfeff; color: #0e7490; }
  .tone-teal .hub-mobile-icon { background: #f0fdfa; color: #0f766e; }
  .tone-cyan .hub-mobile-icon { background: #ecfeff; color: #0e7490; }
  .hub-mobile-title { font-weight: 800; font-size: 14px; margin-bottom: 4px; }
  .hub-mobile-card p {
    margin: 0;
    font-size: 12px;
    color: var(--hub-muted);
    line-height: 1.4;
  }
  .hub-mobile-badge {
    position: absolute;
    top: 12px; right: 12px;
    min-width: 22px; height: 22px;
    padding: 0 6px; border-radius: 999px;
    background: #dc2626; color: #fff;
    font-size: 11px; font-weight: 800;
    display: inline-flex; align-items: center; justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hub-ring-spin-cw,
  .hub-ring-spin-ccw,
  .hub-connector-ring-orbit,
  .hub-ambient-dot {
    animation: none;
  }
  .hub-ambient-dot {
    opacity: 0.35;
    background: #0e7490;
  }
}
.hub-satellite--soon,
.hub-mobile-card--soon {
  opacity: 0.72;
  cursor: default;
  pointer-events: none;
}
.hub-preview-link--soon {
  opacity: 0.7;
  cursor: default;
  pointer-events: none;
}
.po-hub {
  background:
    radial-gradient(circle at 18% 12%, rgba(99, 102, 241, 0.06), transparent 40%),
    radial-gradient(circle at 82% 18%, rgba(14, 165, 233, 0.05), transparent 35%),
    radial-gradient(circle at 50% 92%, rgba(244, 63, 94, 0.04), transparent 40%),
    var(--hub-bg);
}
</style>

<style src="../styles/hubSectionTones.css"></style>
