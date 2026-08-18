<template>
  <div class="wo-hub">
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

    <header class="hub-header" data-tour="schedule-hub-header">
      <div class="hub-brand">
        <div class="hub-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12h8M12 8v8" stroke-linecap="round" />
          </svg>
        </div>
        <div>
          <h1 class="hub-title" data-tour="schedule-hub-title">Workforce Operations</h1>
          <p class="hub-subtitle" data-tour="schedule-hub-subtitle">
            Everything connected. Schedules, billing, buildings, and staff — all in one place.
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
        <router-link class="hub-calendar-btn" :to="orgTo('/my-schedule')">
          View calendar
        </router-link>
      </div>
    </header>

    <div class="hub-layout" data-tour="schedule-hub-grid">
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

          <!-- Center node -->
          <div class="hub-center-wrap">
            <button
              type="button"
              class="hub-center"
              :class="[
                activeSectionId ? `tone-${activeSection?.tone}` : 'tone-root',
                { 'is-clickable': !!activeSectionId }
              ]"
              :aria-label="activeSectionId ? `Return to all areas` : 'Workforce Operations hub'"
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

          <!-- Orbit connectors -->
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

          <!-- Satellite nodes -->
          <div
            v-for="(node, idx) in orbitNodes"
            :key="node.key"
            class="hub-orbit-node"
            :class="node.tone ? `tone-${node.tone}` : null"
            :style="orbitStyle(idx, orbitNodes.length)"
          >
            <!-- Category satellite (root view) -->
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

            <!-- Card satellite (drilled view) -->
            <template v-else>
              <a
                v-if="node.external"
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
                v-else
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
              <span
                v-if="node.count > 0"
                class="hub-satellite-badge hub-satellite-badge-pulse"
                :title="`${node.count} item${node.count === 1 ? '' : 's'} need attention`"
              >{{ formatNotificationCount(node.count) }}</span>
            </template>

            <!-- Hover preview for categories -->
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
                      v-if="card.external"
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
                    <router-link v-else :to="card.to" class="hub-preview-link" @click="clearHover">
                      <span class="hub-preview-dot" />
                      {{ card.title }}
                      <span v-if="card.count > 0" class="hub-preview-count">{{ card.count }}</span>
                    </router-link>
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
            Tip: Hover a category to preview what's inside. Click to explore and manage related tools.
          </template>
        </p>
      </div>

      <aside v-if="canOpenPrivilegedScheduleTools" class="hub-sidebar">
        <section class="hub-sidebar-panel">
          <h2>At a glance</h2>
          <ul class="hub-glance-list">
            <li>
              <span class="glance-dot office" />
              <span>Office requests</span>
              <strong>{{ officePending }}</strong>
              <em>{{ officePending === 1 ? 'Pending' : 'Pending' }}</em>
            </li>
            <li>
              <span class="glance-dot school" />
              <span>School requests</span>
              <strong>{{ schoolPending }}</strong>
              <em>{{ schoolPending === 1 ? 'Pending' : 'Pending' }}</em>
            </li>
            <li>
              <span class="glance-dot total" />
              <span>Total to review</span>
              <strong>{{ pendingTotal }}</strong>
              <em>Open</em>
            </li>
          </ul>
        </section>

        <section class="hub-sidebar-panel">
          <h2>Your top 5</h2>
          <HubTopCardsBar :cards="allHubCards" :limit="5" class="htcb-hub" />
          <div class="hub-quick-links">
            <router-link :to="officeApprovalsTo" class="hub-quick-link">
              <span>Approve office requests</span>
              <span v-if="officePending > 0" class="hub-quick-badge">{{ officePending }}</span>
            </router-link>
            <router-link :to="schoolApprovalsTo" class="hub-quick-link">
              <span>Approve school requests</span>
              <span v-if="schoolPending > 0" class="hub-quick-badge">{{ schoolPending }}</span>
            </router-link>
            <router-link :to="orgTo('/schedule/staff')" class="hub-quick-link">Staff schedules</router-link>
            <router-link :to="orgTo('/my-schedule')" class="hub-quick-link">My calendar</router-link>
          </div>
        </section>
      </aside>
    </div>

    <!-- Mobile fallback: stacked cards -->
    <div class="hub-mobile-fallback">
      <section v-for="section in visibleSections" :key="section.id" class="hub-mobile-section">
        <h2>
          {{ section.label }}
          <span v-if="sectionNotificationCount(section) > 0" class="hub-mobile-section-badge">
            {{ formatNotificationCount(sectionNotificationCount(section)) }}
          </span>
        </h2>
        <div class="hub-mobile-grid">
          <template v-for="card in sortCardsByVisits(section.cards)" :key="card.id">
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
  workspaceNavContextFromStores
} from '../utils/workspaceNavAccess.js';
import { isSupervisor } from '../utils/helpers.js';
import { isSummitPlatformRouteSlug } from '../utils/summitPlatformSlugs.js';
import { canSeeClientExchangeNav, clientExchangePath } from '../utils/clientExchangeNav.js';
import { resolveHostImpliedPortalSlug } from '../utils/orgScopedPath.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const user = computed(() => authStore.user);
const actorRole = computed(() => String(user.value?.role || '').toLowerCase());
const isProviderBusyOnly = computed(() => actorRole.value === 'provider');
const canOpenPrivilegedScheduleTools = computed(() => !isProviderBusyOnly.value);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const currentAgencyId = agencyId;
const officePending = ref(0);
const schoolPending = ref(0);
const pendingTotal = computed(() => officePending.value + schoolPending.value);

const isAdmin = computed(() => ['admin', 'super_admin', 'support'].includes(actorRole.value));
const isTrueAdmin = computed(() => actorRole.value === 'admin' || actorRole.value === 'super_admin');
const isAffiliationContext = computed(() => {
  const t = String(agencyStore.currentAgency?.organization_type || '').toLowerCase();
  return t === 'affiliation';
});

const publicAgencySlug = computed(() =>
  String(
    agencyStore.currentAgency?.portal_url ||
    agencyStore.currentAgency?.slug ||
    orgSlug.value ||
    ''
  ).trim()
);

const publicCareersTo = computed(() =>
  publicAgencySlug.value ? `/careers/${publicAgencySlug.value}` : '/careers'
);
const publicJoinTo = computed(() =>
  publicAgencySlug.value ? `/join/${publicAgencySlug.value}` : '/join'
);
const publicOfficeIntakeTo = computed(() =>
  publicAgencySlug.value ? `/office-intake/${publicAgencySlug.value}` : '/office-intake'
);

const canSeePublicFacing = computed(() => !isAffiliationContext.value);

const canSeeClientsManagementHub = computed(
  () => (isAdmin.value || ['provider', 'provider_plus', 'staff'].includes(actorRole.value))
    && !isAffiliationContext.value
);
const canSeeGuardiansHub = computed(
  () => (isAdmin.value || actorRole.value === 'support') && !isAffiliationContext.value
);
const canSeeClientOnboardingHub = computed(
  () => canOpenPrivilegedScheduleTools.value
    && !isAffiliationContext.value
    && ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(actorRole.value)
);
const canSeeClientExchangeHub = computed(
  () => canSeeClientExchangeNav(actorRole.value) && !isAffiliationContext.value
);
const clientExchangeTo = computed(() => clientExchangePath(orgSlug.value));

const hubSwitcherLinks = computed(() => {
  const ctx = workspaceNavContextFromStores({
    role: actorRole.value,
    slug: orgSlug.value,
    agency: agencyStore.currentAgency,
    branding: brandingStore,
    user: user.value,
    isAffiliationContext: isAffiliationContext.value
  });
  return buildHubSwitcherLinks({
    ...ctx,
    currentSurface: 'workforce'
  });
});

const canSeePayrollManagement = computed(() => {
  if (user.value?.role === 'super_admin') return true;
  const caps = user.value?.capabilities || {};
  if (!caps.canManagePayroll) return false;
  const ids = Array.isArray(user.value?.payrollAgencyIds) ? user.value.payrollAgencyIds : [];
  if (!currentAgencyId.value) return false;
  return ids.includes(currentAgencyId.value);
});

const canSeeCredentialing = computed(() => {
  if (user.value?.role === 'super_admin') return true;
  const caps = user.value?.capabilities || {};
  if (!caps.canManageCredentialing) return false;
  const ids = Array.isArray(user.value?.credentialingAgencyIds) ? user.value.credentialingAgencyIds : [];
  if (!currentAgencyId.value) return false;
  return ids.includes(currentAgencyId.value);
});

const canSeeProviderAvailability = computed(() =>
  ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff'].includes(actorRole.value)
  && !isAffiliationContext.value
);

const canSeeGearInventory = computed(() =>
  (isAdmin.value || actorRole.value === 'clinical_practice_assistant' || actorRole.value === 'provider_plus')
  && !isAffiliationContext.value
);

const canSeeProviderBooking = computed(() =>
  (isAdmin.value || actorRole.value === 'clinical_practice_assistant' || actorRole.value === 'provider_plus')
  && !isAffiliationContext.value
);

const isSscSstcTenant = computed(() => {
  const routeSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  const agencySlug = String(
    agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || ''
  ).trim().toLowerCase();
  const slug = routeSlug || agencySlug;
  return isSummitPlatformRouteSlug(slug);
});

const canSeeUsersHub = computed(() =>
  isAdmin.value || isSupervisor(user.value) || actorRole.value === 'clinical_practice_assistant'
);

const usersHubTitle = computed(() => (isSscSstcTenant.value ? 'Members' : 'Users'));

const canSeeFacilitatorAvailability = computed(() => isAdmin.value && !isAffiliationContext.value);

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

const schoolApprovalsTo = computed(() => ({
  path: orgTo('/admin/school-approvals'),
  query: {
    tab: 'adjustments',
    ...(agencyId.value ? { agencyId: String(agencyId.value) } : {})
  }
}));

const officeApprovalsTo = computed(() => ({
  path: orgTo('/admin/office-approvals'),
  query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
}));

const providerManagementTo = computed(() => ({
  path: orgTo('/admin/provider-availability'),
  query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
}));

const adminMeetingsTo = computed(() => ({
  path: orgTo('/admin/admin-meetings'),
  query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
}));

const icon = {
  hub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" stroke-linecap="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V9z"/></svg>',
  compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 8v8" stroke-linecap="round"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 10h5a1 1 0 0 1 1 1v10M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6" stroke-linecap="round"/></svg>',
  school: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="M5 10v5c0 1.5 3 3 7 3s7-1.5 7-3v-5M12 13v8" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calEvent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4M8 14h4M8 17h6" stroke-linecap="round"/></svg>',
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 10h8M8 14h5" stroke-linecap="round"/></svg>',
  audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6" stroke-linecap="round"/></svg>',
  badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/><path d="M8.2 13.5 7 22l5-3 5 3-1.2-8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4" stroke-linecap="round"/></svg>',
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m16.5 9.4-9-5.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/><path d="M8 11h6M11 8v6" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke-linecap="round"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M12 12v3" stroke-linecap="round"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M5 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M9 21h6M12 11v2" stroke-linecap="round"/></svg>',
  clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/><path d="M16 11h5M18.5 8.5v5" stroke-linecap="round"/></svg>',
  onboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/><path d="M7 8h10M7 11h6" stroke-linecap="round"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5" stroke-linecap="round"/></svg>'
};

const allSections = computed(() => [
  {
    id: 'staff-scheduling',
    label: 'Staff & Scheduling',
    desc: 'Manage staff, schedules, shifts, and meetings.',
    tone: 'blue',
    icon: icon.people,
    cards: [
      {
        id: 'staff',
        title: 'Staff schedules (compare)',
        shortDesc: 'Compare provider schedules side by side.',
        desc: isProviderBusyOnly.value
          ? 'See coworker busy blocks across your agencies (details hidden).'
          : 'Select multiple providers and compare schedules; reorder and view two+ at once.',
        cta: 'Open →',
        to: orgTo('/schedule/staff'),
        tone: 'orange',
        icon: icon.compare,
        tour: 'schedule-hub-card-staff',
        show: true,
        count: 0
      },
      {
        id: 'events',
        title: 'Event shift requests',
        shortDesc: 'Request program-event sessions.',
        desc: 'Request to work upcoming program-event sessions (regular, waitlist, or on-call).',
        cta: 'Open →',
        to: orgTo('/schedule/event-staffing'),
        tone: 'amber',
        icon: icon.ticket,
        tour: null,
        show: canOpenPrivilegedScheduleTools.value,
        count: 0
      },
      {
        id: 'provider-mgmt',
        title: 'Provider Management',
        shortDesc: 'Slots, availability, ratios, and kudos.',
        desc: 'School slots, office & virtual availability, payroll ratios, app usage, and kudos — by agency.',
        cta: 'Open →',
        to: providerManagementTo.value,
        tone: 'blue',
        icon: icon.people,
        tour: 'schedule-hub-card-provider-management',
        show: canOpenPrivilegedScheduleTools.value,
        count: 0
      },
      {
        id: 'users',
        title: usersHubTitle.value,
        shortDesc: 'Staff accounts and roles.',
        desc: 'All user accounts and staff members — roles, access, and roster management.',
        cta: 'Open →',
        to: orgTo('/admin/users'),
        tone: 'indigo',
        icon: icon.people,
        tour: 'schedule-hub-card-users',
        show: canSeeUsersHub.value,
        count: 0
      },
      {
        id: 'announcements',
        title: 'Announcements',
        shortDesc: 'Splashes, banners, and auto celebrations.',
        desc: 'Post agency announcements and splashes, review engagement, and see who is in the birthday and work-anniversary queue.',
        cta: 'Open →',
        to: orgTo('/admin/announcements'),
        tone: 'teal',
        icon: icon.docs,
        tour: null,
        show: canSeeUsersHub.value,
        count: 0
      },
      {
        id: 'school-staff',
        title: 'School Staff',
        shortDesc: 'School portal staff accounts and roles.',
        desc: 'Manage school staff accounts, School Admin / Scheduler flags, and portal access for schools.',
        cta: 'Open →',
        to: orgTo('/admin/caseload-hub/schools-staff'),
        tone: 'teal',
        icon: icon.people,
        tour: null,
        show: canOpenPrivilegedScheduleTools.value,
        count: 0
      },
      {
        id: 'meetings',
        title: 'Meetings',
        shortDesc: 'Admin meetings, huddles, and history.',
        desc: 'Admin meetings, huddles, and leadership sessions — attendance logs, transcripts, summaries, and full history. Access varies by role.',
        cta: 'Open →',
        to: adminMeetingsTo.value,
        tone: 'green',
        icon: icon.people,
        tour: 'schedule-hub-card-admin-meetings',
        show: canOpenPrivilegedScheduleTools.value,
        count: 0
      },
      {
        id: 'provider-availability',
        title: 'Provider Availability',
        shortDesc: 'Provider slots and availability.',
        desc: 'School slots, office and virtual availability, ratios, and usage by agency.',
        cta: 'Open →',
        to: providerManagementTo.value,
        tone: 'teal',
        icon: icon.calendar,
        tour: null,
        show: canSeeProviderAvailability.value,
        count: 0
      },
      {
        id: 'facilitator-availability',
        title: 'Facilitator Availability',
        shortDesc: 'Facilitator schedule intake.',
        desc: 'Manage facilitator availability submissions and review.',
        cta: 'Open →',
        to: orgTo('/admin/facilitator-availability'),
        tone: 'slate',
        icon: icon.people,
        tour: null,
        show: canSeeFacilitatorAvailability.value,
        count: 0
      },
      {
        id: 'gear-inventory',
        title: 'Gear & Inventory',
        shortDesc: 'Equipment and inventory tracking.',
        desc: 'Track gear assignments, inventory, and equipment across the agency.',
        cta: 'Open →',
        to: orgTo('/admin/gear-inventory'),
        tone: 'cyan',
        icon: icon.package,
        tour: null,
        show: canSeeGearInventory.value,
        count: 0
      },
      {
        id: 'provider-booking',
        title: 'Provider Booking Interface',
        shortDesc: 'Search and book available providers.',
        desc: 'Find and book available providers across agencies using the provider booking interface.',
        cta: 'Open →',
        to: orgTo('/admin/find-providers'),
        tone: 'rose',
        icon: icon.booking,
        tour: null,
        show: canSeeProviderBooking.value,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'clients-guardians',
    label: 'Clients & Guardians',
    desc: 'Agency clients, guardians, new intakes, and exchange.',
    tone: 'cyan',
    icon: icon.clients,
    cards: [
      {
        id: 'clients',
        title: 'Clients',
        shortDesc: 'Full agency client directory.',
        desc: 'Client management, caseload assignment, documents, and provider routing across school and office.',
        cta: 'Open →',
        to: orgTo('/admin/clients'),
        tone: 'cyan',
        icon: icon.clients,
        tour: null,
        show: canSeeClientsManagementHub.value,
        count: 0
      },
      {
        id: 'guardians',
        title: 'Guardians',
        shortDesc: 'All guardian accounts and contacts.',
        desc: 'Guardian and parent contact management for every client in the agency.',
        cta: 'Open →',
        to: orgTo('/admin/guardians'),
        tone: 'teal',
        icon: icon.people,
        tour: null,
        show: canSeeGuardiansHub.value,
        count: 0
      },
      {
        id: 'client-onboarding',
        title: 'Client Action Needed',
        shortDesc: 'Fall confirmation, new-client intake, and agency clearance.',
        desc: 'See every client who still needs a next step and which stage they are in.',
        cta: 'Open →',
        to: orgTo('/admin/client-onboarding?scope=all'),
        tone: 'blue',
        icon: icon.onboard,
        tour: null,
        show: canSeeClientOnboardingHub.value,
        count: 0
      },
      {
        id: 'client-exchange',
        title: 'Client Exchange',
        shortDesc: 'Reassign or exchange clients.',
        desc: 'Client exchange for reassignment and handoff without exposing unnecessary identity.',
        cta: 'Open →',
        to: clientExchangeTo.value,
        tone: 'amber',
        icon: icon.clients,
        tour: null,
        show: canSeeClientExchangeHub.value,
        count: 0
      },
      {
        id: 'master-office-form',
        title: 'Master Counseling Digital Form',
        shortDesc: 'Join In-Depth counseling intake master.',
        desc: 'Counseling digital intake master (EN/ES) used by Join → In-Depth Intake Packet. Separate from school and tutoring masters.',
        cta: 'Open →',
        to: orgTo('/admin/master-office-form'),
        tone: 'violet',
        icon: icon.docs || icon.onboard || icon.clients,
        tour: null,
        show: canSeeClientsManagementHub.value,
        count: 0
      },
      {
        id: 'master-office-paper',
        title: 'Master Counseling Paper',
        shortDesc: 'Printable counseling packet.',
        desc: 'Edit and download the branded blank counseling intake packet for staff to give clients and guardians.',
        cta: 'Open →',
        to: orgTo('/admin/master-office-paper'),
        tone: 'indigo',
        icon: icon.docs || icon.onboard || icon.clients,
        tour: null,
        show: canSeeClientsManagementHub.value,
        count: 0
      },
      {
        id: 'master-digital-tutoring',
        title: 'Master Tutoring',
        shortDesc: 'Intake, assessment, and evaluation.',
        desc: 'Tutoring digital master for intake, assessment, and evaluation. Currently uses the same questions as Master Counseling so NLU Join tutoring has a full packet.',
        cta: 'Open →',
        to: orgTo('/admin/master-channel-form/tutoring'),
        tone: 'teal',
        icon: icon.docs || icon.clients,
        tour: null,
        show: canSeeClientsManagementHub.value,
        count: 0
      },
      {
        id: 'master-digital-consulting',
        title: 'Master Digital Consulting',
        shortDesc: 'Framed — coming online.',
        desc: 'Future master digital form channel for consulting intakes. Shell is ready; content activates later.',
        cta: 'Open →',
        to: orgTo('/admin/master-channel-form/consulting'),
        tone: 'cyan',
        icon: icon.docs || icon.clients,
        tour: null,
        show: canSeeClientsManagementHub.value,
        count: 0
      },
      {
        id: 'master-digital-coaching',
        title: 'Master Digital Coaching',
        shortDesc: 'Framed — coming online.',
        desc: 'Future master digital form channel for coaching intakes. Shell is ready; content activates later.',
        cta: 'Open →',
        to: orgTo('/admin/master-channel-form/coaching'),
        tone: 'blue',
        icon: icon.docs || icon.clients,
        tour: null,
        show: canSeeClientsManagementHub.value,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'payroll-expenses',
    label: 'Payroll & Expenses',
    desc: 'Payroll runs, submissions, and expense reimbursements.',
    tone: 'orange',
    icon: icon.dollar,
    cards: [
      {
        id: 'payroll',
        title: 'Payroll',
        shortDesc: 'Runs, pending submissions, and pay.',
        desc: 'Payroll runs, pending submissions, PTO, mileage, and reimbursement review.',
        cta: 'Open →',
        to: orgTo('/admin/payroll'),
        tone: 'orange',
        icon: icon.dollar,
        tour: null,
        show: canSeePayrollManagement.value,
        count: 0
      },
      {
        id: 'expenses',
        title: 'Expense/Reimbursements',
        shortDesc: 'Expenses and reimbursement claims.',
        desc: 'Review expense and reimbursement submissions tied to payroll workflows.',
        cta: 'Open →',
        to: orgTo('/admin/expenses'),
        tone: 'amber',
        icon: icon.receipt,
        tour: null,
        show: canSeePayrollManagement.value,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'billing-revenue',
    label: 'Billing & Revenue',
    desc: 'Billing reports, receivables, medical billing, and revenue.',
    tone: 'teal',
    icon: icon.receipt,
    cards: [
      {
        id: 'billing-reports',
        title: 'Billing Reports',
        shortDesc: 'Billing report exports and review.',
        desc: 'Generate and review billing reports for payroll and finance workflows.',
        cta: 'Open →',
        to: orgTo('/admin/billing-reports'),
        tone: 'teal',
        icon: icon.receipt,
        tour: null,
        show: canSeePayrollManagement.value,
        count: 0
      },
      {
        id: 'receivables',
        title: 'Receivables',
        shortDesc: 'Outstanding receivables tracking.',
        desc: 'Track receivables and outstanding balances across agencies.',
        cta: 'Open →',
        to: orgTo('/admin/receivables'),
        tone: 'blue',
        icon: icon.clipboard,
        tour: null,
        show: canSeePayrollManagement.value,
        count: 0
      },
      {
        id: 'revenue',
        title: 'Revenue',
        shortDesc: 'Agency revenue tracking.',
        desc: 'Track and review agency revenue data, trends, and financial performance.',
        cta: 'Open →',
        to: orgTo('/admin/revenue'),
        tone: 'amber',
        icon: icon.dollar,
        tour: null,
        show: user.value?.role === 'super_admin',
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'compliance-oversight',
    label: 'Compliance & Oversight',
    desc: 'Credentialing, audits, compliance tools, and executive reporting.',
    tone: 'amber',
    icon: icon.shield,
    cards: [
      {
        id: 'credentialing',
        title: 'Credentialing',
        shortDesc: 'Licenses and credentials.',
        desc: 'Agency credentialing workflows, licenses, and verification status.',
        cta: 'Open →',
        to: orgTo('/admin/credentialing'),
        tone: 'amber',
        icon: icon.badge,
        tour: null,
        show: canSeeCredentialing.value,
        count: 0
      },
      {
        id: 'psychotherapy-compliance',
        title: 'Psychotherapy Compliance',
        shortDesc: 'Psychotherapy CPT compliance.',
        desc: 'Upload billing reports and track psychotherapy compliance thresholds.',
        cta: 'Open →',
        to: orgTo('/admin/psychotherapy-compliance'),
        tone: 'slate',
        icon: icon.shield,
        tour: null,
        show: canSeePayrollManagement.value,
        count: 0
      },
      {
        id: 'compliance-corner',
        title: 'Compliance Corner',
        shortDesc: 'School compliance inquiry tools.',
        desc: 'Compliance inquiry tools including pending school clients and access logs.',
        cta: 'Open →',
        to: orgTo('/admin/compliance-corner'),
        tone: 'blue',
        icon: icon.shield,
        tour: null,
        show: isTrueAdmin.value && !isAffiliationContext.value,
        count: 0
      },
      {
        id: 'audit-center',
        title: 'Audit Center',
        shortDesc: 'Immutable audit and activity logs.',
        desc: 'Agency-scoped audit reporting with filters by source, category, action, and date.',
        cta: 'Open →',
        to: orgTo('/admin/audit-center'),
        tone: 'rose',
        icon: icon.audit,
        tour: null,
        show: isTrueAdmin.value && !isAffiliationContext.value,
        count: 0
      },
      {
        id: 'executive-report',
        title: 'Executive Report',
        shortDesc: 'High-level financial and ops report.',
        desc: 'Top-level executive summary of agency financials, operations, and performance.',
        cta: 'Open →',
        to: orgTo('/admin/executive-report'),
        tone: 'orange',
        icon: icon.clipboard,
        tour: null,
        show: user.value?.role === 'super_admin',
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'public-facing',
    label: 'Public & Community',
    desc: 'Shareable pages for careers, new client intake, and community outreach.',
    tone: 'green',
    icon: icon.globe,
    cards: [
      {
        id: 'public-careers',
        title: 'Careers Page',
        shortDesc: 'Open roles and team applications.',
        desc: 'Your public careers hub — open positions, culture highlights, and job applications for prospective team members.',
        cta: 'View site ↗',
        to: publicCareersTo.value,
        tone: 'green',
        icon: icon.briefcase,
        tour: null,
        show: canSeePublicFacing.value,
        external: true,
        count: 0
      },
      {
        id: 'public-office-join',
        title: 'Office Join',
        shortDesc: 'Adaptive intake for new clients.',
        desc: 'The public entry point where families choose a service and start the office intake flow — counseling, tutoring, and more.',
        cta: 'View site ↗',
        to: publicJoinTo.value,
        tone: 'teal',
        icon: icon.door,
        tour: null,
        show: canSeePublicFacing.value,
        external: true,
        count: 0
      },
      {
        id: 'public-office-intake',
        title: 'Office Appointment Request',
        shortDesc: 'Quick scheduling interest form.',
        desc: 'A lightweight public form for scheduling interest — captures contact info and preferences before your team follows up.',
        cta: 'View site ↗',
        to: publicOfficeIntakeTo.value,
        tone: 'blue',
        icon: icon.calendar,
        tour: null,
        show: canSeePublicFacing.value,
        external: true,
        count: 0
      }
    ].filter((c) => c.show)
  },
  {
    id: 'office-buildings',
    label: 'Office & Buildings',
    desc: 'Manage buildings, offices, requests, and settings.',
    tone: 'slate',
    icon: icon.building,
    cards: [
      {
        id: 'buildings-grid',
        title: 'Buildings master grid',
        shortDesc: 'Building-centric room schedule.',
        desc: 'All rooms in a building — building-centric schedule view (find availability, company holds).',
        cta: 'Open →',
        to: orgTo('/buildings/schedule'),
        tone: 'blue',
        icon: icon.building,
        tour: 'schedule-hub-card-buildings-schedule',
        show: canOpenPrivilegedScheduleTools.value,
        count: 0
      },
      {
        id: 'office',
        title: 'Approve office requests',
        shortDesc: 'Office requests and TN conflicts.',
        desc: 'Dedicated inbox for office requests and reported Therapy Notes coverage conflicts.',
        cta: officePending.value > 0 ? `Review ${officePending.value} →` : 'Open →',
        to: officeApprovalsTo.value,
        tone: 'orange',
        icon: icon.mail,
        tour: 'schedule-hub-card-approvals',
        show: canOpenPrivilegedScheduleTools.value,
        count: officePending.value
      },
      {
        id: 'buildings-admin',
        title: 'Buildings settings',
        shortDesc: 'Buildings, review workflows, settings.',
        desc: 'Building selection, review workflows, and building settings.',
        cta: 'Open →',
        to: orgTo('/buildings'),
        tone: 'cyan',
        icon: icon.gear,
        tour: 'schedule-hub-card-buildings-admin',
        show: canOpenPrivilegedScheduleTools.value,
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

const centerTitle = computed(() => (activeSection.value ? activeSection.value.label : 'Workforce Operations'));
const centerDesc = computed(() =>
  activeSection.value
    ? activeSection.value.desc
    : 'Everything connected. Everything in sync.'
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

/** Deterministic scatter — stable positions, feels random. */
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

/** Shared polar layout — keeps satellites on the same ring as the SVG connectors. */
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
  // Open away from the orbit edge so previews aren't clipped by the page chrome.
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
  if (!canOpenPrivilegedScheduleTools.value) return;
  try {
    const { data } = await api.get('/availability/admin/pending-counts', {
      params: agencyId.value ? { agencyId: agencyId.value } : undefined,
      skipGlobalLoading: true
    });
    officePending.value = Number(data?.officeRequestsPending || 0);
    schoolPending.value = Number(data?.schoolRequestsPending || 0);
  } catch {
    officePending.value = 0;
    schoolPending.value = 0;
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
  // Silently redirect to the org-scoped URL on mount if a tenant is active
  // but the URL is the flat slug-less route. Skip on dedicated app hosts
  // (app.itsco.health) where the host already implies the portal.
  const hostSlug = resolveHostImpliedPortalSlug(brandingStore);
  if (!route.params.organizationSlug && agencyStore.currentAgency && !hostSlug) {
    const slug = agencyStore.currentAgency.slug || agencyStore.currentAgency.portal_url;
    if (slug) router.replace(`/${slug}/workforce-operations`);
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
    radial-gradient(circle at 20% 10%, rgba(15, 118, 110, 0.05), transparent 40%),
    radial-gradient(circle at 80% 20%, rgba(30, 58, 138, 0.04), transparent 35%),
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
    background: #2563eb;
    box-shadow: 0 0 10px rgba(37, 99, 235, 0.55);
  }
}
@keyframes hub-dot-float {
  0%, 100% { transform: translate(0, 0); opacity: 0.4; }
  50% { transform: translate(var(--drift-x, 6px), var(--drift-y, -8px)); opacity: 0.7; }
}

.hub-header,
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
  border: 1px solid #cbd5e1;
  background:
    radial-gradient(circle at 50% 30%, #f8fafc 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(14, 116, 144, 0.12),
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
    0 0 56px rgba(14, 116, 144, 0.18),
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
    0 0 48px rgba(100, 116, 139, 0.16),
    0 20px 50px rgba(15, 23, 42, 0.08);
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
.hub-center.tone-orange {
  border-color: #fdba74;
  background: radial-gradient(circle at 50% 30%, #fff7ed 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(249, 115, 22, 0.2),
    0 20px 50px rgba(249, 115, 22, 0.1);
}
.hub-center.tone-root .hub-center-icon { background: #f1f5f9; color: #475569; }
.hub-center.tone-purple .hub-center-icon { background: #f1f5f9; color: #475569; }
.hub-center.tone-green .hub-center-icon { background: #ecfdf5; color: #16a34a; }
.hub-center.tone-blue .hub-center-icon { background: #eff6ff; color: #2563eb; }
.hub-center.tone-orange .hub-center-icon { background: #fff7ed; color: #c2410c; }
.hub-center.tone-teal {
  border-color: #99f6e4;
  background: radial-gradient(circle at 50% 30%, #f0fdfa 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(20, 184, 166, 0.2),
    0 8px 32px rgba(15, 118, 110, 0.1);
}
.hub-center.tone-indigo {
  border-color: #99f6e4;
  background: radial-gradient(circle at 50% 30%, #ecfeff 0%, #ffffff 58%);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.65),
    0 0 48px rgba(14, 116, 144, 0.18),
    0 8px 32px rgba(15, 118, 110, 0.1);
}
.hub-center.tone-teal .hub-center-icon { background: #f0fdfa; color: #0f766e; }
.hub-center.tone-indigo .hub-center-icon { background: #ecfeff; color: #0e7490; }

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
  background: radial-gradient(circle, rgba(100, 116, 139, 0.28) 0%, rgba(100, 116, 139, 0.1) 42%, transparent 72%);
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
  background: radial-gradient(circle, rgba(14, 116, 144, 0.3) 0%, rgba(14, 116, 144, 0.1) 42%, transparent 72%);
}
.hub-orbit-node.tone-teal::before {
  background: radial-gradient(circle, rgba(45, 212, 191, 0.34) 0%, rgba(45, 212, 191, 0.1) 42%, transparent 72%);
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
  border-color: #cbd5e1;
  background: radial-gradient(circle at 50% 28%, #f8fafc 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(100, 116, 139, 0.1),
    0 0 28px rgba(71, 85, 105, 0.14),
    0 12px 28px rgba(15, 23, 42, 0.06);
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
  border-color: #99f6e4;
  background: radial-gradient(circle at 50% 28%, #ecfeff 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(14, 116, 144, 0.1),
    0 0 28px rgba(14, 116, 144, 0.16),
    0 12px 28px rgba(15, 118, 110, 0.08);
}
.hub-satellite.tone-teal {
  border-color: #5eead4;
  background: radial-gradient(circle at 50% 28%, #f0fdfa 0%, #ffffff 65%);
  box-shadow:
    0 0 0 5px rgba(45, 212, 191, 0.12),
    0 0 28px rgba(20, 184, 166, 0.18),
    0 12px 28px rgba(20, 184, 166, 0.08);
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
    0 0 0 7px rgba(100, 116, 139, 0.14),
    0 0 40px rgba(71, 85, 105, 0.2),
    0 18px 36px rgba(15, 23, 42, 0.1);
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
    0 0 0 7px rgba(14, 116, 144, 0.16),
    0 0 40px rgba(14, 116, 144, 0.24),
    0 18px 36px rgba(15, 118, 110, 0.1);
}
.hub-satellite.tone-teal:hover,
.hub-satellite.tone-teal.hovered {
  box-shadow:
    0 0 0 7px rgba(45, 212, 191, 0.18),
    0 0 40px rgba(20, 184, 166, 0.28),
    0 18px 36px rgba(20, 184, 166, 0.12);
}

.hub-satellite-icon {
  width: 40px; height: 40px; border-radius: 12px;
  display: grid; place-items: center; margin-bottom: 8px;
}
.hub-satellite-icon :deep(svg) { width: 20px; height: 20px; }
.tone-purple .hub-satellite-icon { background: #f1f5f9; color: #475569; }
.tone-green .hub-satellite-icon { background: #ecfdf5; color: #16a34a; }
.tone-blue .hub-satellite-icon { background: #eff6ff; color: #2563eb; }
.tone-orange .hub-satellite-icon { background: #fff7ed; color: #c2410c; }
.tone-indigo .hub-satellite-icon { background: #ecfeff; color: #0e7490; }
.tone-teal .hub-satellite-icon { background: #f0fdfa; color: #0f766e; }

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
.tone-purple .hub-satellite-pill { background: #f1f5f9; color: #475569; }
.tone-green .hub-satellite-pill { background: #ecfdf5; color: #15803d; }
.tone-blue .hub-satellite-pill { background: #eff6ff; color: #1d4ed8; }
.tone-orange .hub-satellite-pill { background: #fff7ed; color: #c2410c; }
.tone-teal .hub-satellite-pill { background: #f0fdfa; color: #0f766e; }
.tone-indigo .hub-satellite-pill { background: #ecfeff; color: #0e7490; }

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
.hub-preview.tone-orange { border-color: #fdba74; }

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
  .tone-purple .hub-mobile-icon { background: #f1f5f9; color: #475569; }
  .tone-green .hub-mobile-icon { background: #ecfdf5; color: #16a34a; }
  .tone-blue .hub-mobile-icon { background: #eff6ff; color: #2563eb; }
  .tone-orange .hub-mobile-icon { background: #fff7ed; color: #c2410c; }
  .tone-indigo .hub-mobile-icon { background: #ecfeff; color: #0e7490; }
  .tone-teal .hub-mobile-icon { background: #f0fdfa; color: #0f766e; }
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
</style>

<style src="../styles/hubSectionTones.css"></style>
