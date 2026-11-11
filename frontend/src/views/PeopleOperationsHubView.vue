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
            >Year Awards</router-link>
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
import { parseFeatureFlags } from '../utils/schoolPortalsAccess.js';

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
  parseFeatureFlags(agencyStore.currentAgency?.feature_flags ?? agencyStore.currentAgency?.featureFlags)
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
      },
      {
        id: 'contract-generator',
        title: 'Contract Generator',
        shortDesc: 'Employment agreements from clauses.',
        desc: 'Build and assign employment contracts from editable clauses, configs, and pay levels.',
        cta: 'Open →',
        to: orgTo('/admin/contracts'),
        tone: 'violet',
        icon: icon.docs,
        tour: 'people-ops-contract-generator',
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
      },
      {
        id: 'employee-evaluations',
        title: 'Employee Evaluations',
        shortDesc: 'Semiannual self-assessments.',
        desc: 'Track scheduling, submissions, and reviews for H1/H2 employee evaluation cycles.',
        cta: 'Open →',
        to: orgTo('/admin/employee-evaluations'),
        tone: 'teal',
        icon: icon.progress,
        tour: 'people-ops-employee-evaluations',
        show: canManageHiring.value,
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
        title: 'Year Awards',
        shortDesc: 'Anniversary awards and eligibility.',
        desc: 'See who is eligible for a cup, dinner, pullover, or later milestone, and track gifts sent.',
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

<style scoped src="../styles/operationsHub.css"></style>

<style src="../styles/hubSectionTones.css"></style>
