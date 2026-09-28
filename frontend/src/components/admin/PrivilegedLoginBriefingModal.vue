<template>
  <Teleport to="body">
    <Transition name="briefing-fade">
      <div
        v-if="visible"
        class="briefing-overlay"
        role="presentation"
        @click.self="dismiss"
      >
        <section
          class="briefing-modal"
          :class="{
            'briefing-modal--platform': isPlatformBriefing,
            'briefing-modal--multi': brandedAgencies.length > 1
          }"
          :style="brandVars"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privileged-briefing-title"
          @keydown.esc.stop="panel ? goBack() : dismiss()"
        >
          <div class="briefing-brand-rail" aria-hidden="true">
            <div class="brand-logo-stack">
              <div
                v-for="(agency, index) in visibleBrandAgencies"
                :key="agency.id || agency.slug || index"
                class="brand-logo-wrap"
                :title="agency.name"
              >
                <img v-if="agency.logo" :src="agency.logo" alt="" class="brand-logo" />
                <span v-else class="brand-logo-fallback">{{ agency.initials }}</span>
              </div>
              <div v-if="hiddenBrandCount" class="brand-logo-wrap brand-logo-more">
                +{{ hiddenBrandCount }}
              </div>
            </div>
          </div>

          <button class="briefing-close" type="button" aria-label="Close login briefing" @click="dismiss">×</button>

          <header class="briefing-header">
            <div>
              <div class="briefing-eyebrow">{{ isPlatformBriefing ? 'Platform command center' : `${tenantContextLabel} command center` }}</div>
              <h1 id="privileged-briefing-title">Welcome back, {{ firstName }}</h1>
              <p>Here’s what needs your attention across your organization{{ brandedAgencies.length === 1 ? '' : 's' }} today.</p>
            </div>
            <time class="briefing-date" :datetime="todayIso">
              <span class="date-icon" aria-hidden="true">▦</span>
              <span><strong>{{ dateLabel }}</strong><small>{{ weekdayLabel }}</small></span>
            </time>
          </header>

          <div v-if="brandedAgencies.length > 1 && !isSuperadmin" class="tenant-strip" aria-label="Affiliated tenants">
            <span>Tenant briefing</span>
            <span
              v-for="agency in brandedAgencies"
              :key="`tenant-${agency.id || agency.slug}`"
              class="tenant-chip"
              :style="{ '--tenant-color': agency.primary }"
            >{{ agency.name }}</span>
          </div>

          <div v-if="loading" class="briefing-loading" role="status">
            <span class="briefing-spinner" aria-hidden="true"></span>
            Building your personalized briefing…
          </div>

          <template v-else>
            <div v-if="loadError" class="briefing-warning" role="status">
              Some live information could not be loaded. The available sections are shown below.
            </div>

            <div class="briefing-layout">
              <div class="briefing-main">
                <section v-if="panel" ref="panelElement" class="briefing-browser" tabindex="-1" :aria-label="panel.section.title">
                  <header class="browser-toolbar">
                    <button type="button" class="browser-back" @click="goBack"><ArrowLeft :size="18" aria-hidden="true" /> Back</button>
                    <button v-if="panel.section.to" type="button" class="browser-full" @click="navigate(panel.item?.to || panel.section.to)"><Maximize2 :size="16" aria-hidden="true" /> Open full page</button>
                  </header>
                  <BriefingItemDetails v-if="panel.item" :key="`${panel.section.key}:${panel.item.id}`" :item="panel.item" :section="panel.section" />
                  <template v-else>
                    <h2>{{ panel.section.title }}</h2>
                    <p class="browser-count">{{ panel.section.items.length }} {{ panel.section.key === 'urgent' ? 'urgent items' : 'recent items' }}</p>
                    <button v-for="entry in panel.section.items.slice(0, panelLimit)" :key="`${entry.section?.key || panel.section.key}:${entry.id}`" type="button" class="briefing-item browser-item" @click="inspectItem(entry.section || panel.section, entry)">
                      <span class="item-copy"><strong>{{ entry.label }}</strong><small>{{ [entry.section?.title, entry.meta].filter(Boolean).join(' · ') }}</small></span>
                      <span v-if="entry.badge" class="item-badge" :class="`item-badge--${entry.badgeTone || 'neutral'}`">{{ entry.badge }}</span>
                      <ChevronRight :size="18" aria-hidden="true" />
                    </button>
                    <p v-if="!panel.section.items.length">No recent items available.</p>
                    <button v-if="panel.section.items.length > panelLimit" type="button" class="browser-more" @click="panelLimit += 20">Show more</button>
                  </template>
                </section>
                <div v-show="!panel">
                <DashboardMeetings :include-all-agencies="!workspaceSlug" inspect-in-place @inspect="inspectMeeting" />
                <div v-if="sections.length" class="briefing-card-grid">
                  <article
                    v-for="section in sections"
                    :key="section.key"
                    class="briefing-card"
                    :class="`briefing-card--${section.tone}`"
                  >
                    <header class="card-header">
                      <span class="card-icon" aria-hidden="true">{{ section.icon }}</span>
                      <div>
                        <div class="card-kicker">{{ section.title }}</div>
                        <div class="card-count"><strong>{{ section.count }}</strong> {{ section.countLabel }}</div>
                      </div>
                    </header>
                    <button
                      v-for="item in section.items.slice(0, 3)"
                      :key="item.id"
                      type="button"
                      class="briefing-item"
                      @click="inspectItem(section, item)"
                    >
                      <span class="item-dot" aria-hidden="true"></span>
                      <span class="item-copy">
                        <strong>{{ item.label }}</strong>
                        <small v-if="item.meta">{{ item.meta }}</small>
                      </span>
                      <span v-if="item.badge" class="item-badge" :class="`item-badge--${item.badgeTone || 'neutral'}`">
                        {{ item.badge }}
                      </span>
                    </button>
                    <div class="card-actions">
                      <button type="button" class="card-link" @click="inspectSection(section)">Recent <ChevronRight :size="16" aria-hidden="true" /></button>
                      <button class="card-link" type="button" @click="navigate(section.to)">{{ section.action }} <Maximize2 :size="15" aria-hidden="true" /></button>
                    </div>
                  </article>
                </div>

                <div v-else class="all-clear-card">
                  <span aria-hidden="true">✓</span>
                  <div><strong>You’re all caught up.</strong><small>No new assigned items need your attention right now.</small></div>
                </div>

                <div class="at-a-glance" aria-label="At a glance">
                  <div class="glance-title"><span aria-hidden="true">▥</span> At a glance</div>
                  <div v-for="metric in glanceMetrics" :key="metric.label" class="glance-metric">
                    <strong>{{ metric.value }}</strong>
                    <span>{{ metric.label }}</span>
                    <small v-if="metric.hint">{{ metric.hint }}</small>
                  </div>
                </div>
                </div>
              </div>

              <aside class="briefing-side">
                <section v-if="activePeople.length" class="presence-card">
                  <header>
                    <div class="side-kicker">Who’s currently logged in</div>
                    <div class="active-session-count"><span></span> Active sessions ({{ activePeople.length }})</div>
                  </header>
                  <button
                    v-for="person in activePeople.slice(0, 7)"
                    :key="person.id"
                    type="button"
                    class="presence-person"
                    @click="navigate(`${prefix}/admin/presence`)"
                  >
                    <img v-if="person.profile_photo_url" :src="person.profile_photo_url" alt="" />
                    <span v-else class="person-avatar">{{ person.initials }}</span>
                    <span class="person-copy">
                      <strong>{{ person.name }}{{ Number(person.id) === Number(userId) ? ' (You)' : '' }}</strong>
                      <small>{{ workspaceSlug ? tenantContextLabel : (person.agency_names || roleLabel(person.role)) }}</small>
                    </span>
                    <span class="person-status" :class="`person-status--${person.availability_band || 'available'}`">
                      {{ presenceBandLabel(person) }}
                    </span>
                  </button>
                  <button class="card-link" type="button" @click="navigate(`${prefix}/admin/presence`)">
                    View Team Board <span aria-hidden="true">→</span>
                  </button>
                </section>

                <button v-if="urgentCount" class="urgent-card" type="button" @click="inspectSection(urgentSection)">
                  <span class="urgent-icon" aria-hidden="true">△</span>
                  <span><small>Urgent items</small><strong>{{ urgentCount }}</strong> require immediate attention</span>
                  <span aria-hidden="true">→</span>
                </button>

                <section class="security-card">
                  <span aria-hidden="true">♢</span>
                  <div><strong>Security tip</strong><p>If you see an unfamiliar active session or account activity, sign out and reset your password.</p></div>
                </section>
              </aside>
            </div>
          </template>

          <footer class="briefing-footer">
            <label class="dont-show-label">
              <input v-model="dontShowAgain" type="checkbox" />
              <span>Don’t show this briefing again on this device</span>
            </label>

            <!-- Tenant quick-launch row (admin and superadmin) -->
            <div v-if="tenantLaunchers.length > 0" class="tenant-launcher-strip">
              <span v-if="isSuperadmin" class="tenant-launchers__label">Tenants</span>
              <button type="button" class="tenant-scroll" aria-label="Scroll tenants left" title="Scroll tenants left" @click="scrollTenants(-1)"><ChevronLeft :size="18" /></button>
              <div ref="tenantScroller" class="tenant-launchers" role="group" aria-label="Tenant dashboards, most recently visited first" tabindex="0">
              <button
                v-for="agency in tenantLaunchers"
                :key="`launch-${agency.id}`"
                type="button"
                class="tenant-launcher"
                :class="{ 'tenant-launcher--top': Number(workspaceAgency?.id) === Number(agency.id) }"
                :title="agency.name"
                :style="{ '--tl-color': agency.primary || '#334155' }"
                @click="navigateToTenant(agency)"
              >
                <div class="tenant-launcher__icon-wrap">
                  <img
                    v-if="agency.logo"
                    :src="agency.logo"
                    :alt="agency.name"
                    class="tenant-launcher__logo"
                    @error="$event.target.style.display='none'"
                  />
                  <span v-else class="tenant-launcher__initials">{{ agency.initials }}</span>
                </div>
                <span class="tenant-launcher__name">{{ agency.name }}</span>
              </button>
              </div>
              <button type="button" class="tenant-scroll" aria-label="Scroll tenants right" title="Scroll tenants right" @click="scrollTenants(1)"><ChevronRight :size="18" /></button>
            </div>

            <div class="briefing-dashboard-actions">
              <button v-if="isSuperadmin" class="superadmin-dashboard" type="button" @click="navigateToPlatform">
                <LayoutDashboard :size="16" aria-hidden="true" /> Superadmin Dashboard
              </button>
              <button class="enter-dashboard" type="button" @click="dismiss">
                <span aria-hidden="true">&#x25A3;</span> Enter Dashboard
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import DashboardMeetings from '../meetings/DashboardMeetings.vue';
import BriefingItemDetails from './BriefingItemDetails.vue';
import { PLATFORM_BRAND } from '../../config/platformBrand.js';
import { tenantFaviconUrl } from '../../utils/tenantBrandAssets.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { claimLoginBriefing } from '../../utils/loginBriefingGate';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { openTenantWorkspace, openPlatformWorkspace } from '../../services/workspaceNavigation';
import { LayoutDashboard, ArrowLeft, ChevronLeft, ChevronRight, Maximize2 } from '@lucide/vue';
import { readTenantVisits, recordTenantVisit, sortTenantsByRecency } from '../../utils/tenantRecency';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  SUPERADMIN_BRIEFING_PALETTE,
  activeBriefingSections,
  buildTenantBlend,
  isAgencyTenantOrg,
  isLivePrivilegedPresence,
  isPrivilegedLoginBriefingUser,
  parseBrandPalette,
  schoolBriefingItemsFromNotifications,
  tenantBriefingNotifications
} from '../../utils/privilegedLoginBriefing';

const props = defineProps({
  loginTrigger: { type: [Number, String], default: 0 }
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const router = useRouter();

const visible = ref(false);
const loading = ref(false);
const loadError = ref(false);
const dontShowAgain = ref(false);
const panel = ref(null);
const panelElement = ref(null);
const panelLimit = ref(20);
const panelHistory = [];
const tenantScroller = ref(null);
const tenantVisits = ref({});
let dismissedLogin = null;
let activeBriefingContext = null;
const briefing = ref({
  notifications: null,
  messages: null,
  tickets: null,
  tasks: null,
  escalations: null,
  schoolUpdates: null,
  calendar: null
});
const activePeopleRaw = ref([]);
const affiliationRows = ref([]);
let requestGeneration = 0;
const BRIEFING_PRIMARY_TIMEOUT_MS = 10000;
const BRIEFING_SECONDARY_TIMEOUT_MS = 8000;

const userId = computed(() => authStore.user?.id || null);
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSuperadmin = computed(() => role.value === 'super_admin' || role.value === 'superadmin');
const workspaceSlug = computed(() => String(brandingStore.activeWorkspaceSlug || '').trim().toLowerCase());
const isPlatformBriefing = computed(() => isSuperadmin.value && !workspaceSlug.value);
const workspaceAgency = computed(() => {
  const slug = workspaceSlug.value;
  if (!slug) return null;
  const rows = [agencyStore.currentAgency, ...(agencyStore.userAgencies || []), ...(affiliationRows.value || [])];
  return rows.find((agency) => agency && [agency.slug, agency.portal_url, agency.portalUrl]
    .some((value) => String(value || '').trim().toLowerCase() === slug)) || null;
});
const firstName = computed(() => String(
  authStore.user?.preferredName || authStore.user?.preferred_name || authStore.user?.firstName || authStore.user?.first_name || 'Admin'
).trim().split(/\s+/)[0] || 'Admin');

const platformPalette = computed(() => {
  if (isPlatformBriefing.value) return SUPERADMIN_BRIEFING_PALETTE;
  const pb = brandingStore.platformBranding || {};
  const primary = pb.primary_color || PLATFORM_BRAND.primary;
  return {
    primary,
    secondary: pb.secondary_color || '#0f2f27',
    accent: pb.accent_color || primary
  };
});

function agencyLogo(agency) {
  const direct = agency?.logo_url ?? agency?.logoUrl;
  if (direct) return /^(https?:\/\/|\/assets\/|\/branding\/)/.test(String(direct)) ? direct : toUploadsUrl(direct);
  const path = agency?.logo_path ?? agency?.logoPath ?? agency?.icon_file_path;
  return path ? toUploadsUrl(path) : tenantFaviconUrl(agency?.slug || agency?.portal_url);
}

function initialsFor(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PT';
}

const brandedAgencies = computed(() => {
  if (workspaceSlug.value) {
    const agency = workspaceAgency.value || {};
    const name = brandingStore.displayName || agency.name || workspaceSlug.value.toUpperCase();
    return [{
      ...agency, slug: workspaceSlug.value, name,
      logo: brandingStore.displayLogoUrl,
      initials: initialsFor(name),
      primary: brandingStore.primaryColor,
      secondary: brandingStore.secondaryColor,
      accent: brandingStore.accentColor
    }];
  }
  if (isPlatformBriefing.value) {
    const pb = brandingStore.platformBranding || {};
    const name = pb.organization_name || 'Plot Twist Co.';
    return [{
      id: 'platform',
      slug: 'platform',
      name,
      logo: PLATFORM_BRAND.logo,
      initials: initialsFor(name),
      ...SUPERADMIN_BRIEFING_PALETTE
    }];
  }
  return (affiliationRows.value || []).filter(isAgencyTenantOrg).map((agency) => ({
    ...agency,
    ...parseBrandPalette(agency, platformPalette.value),
    logo: agencyLogo(agency),
    initials: initialsFor(agency?.name)
  }));
});

const visibleBrandAgencies = computed(() => brandedAgencies.value.slice(0, 4));
const hiddenBrandCount = computed(() => Math.max(0, brandedAgencies.value.length - visibleBrandAgencies.value.length));
const tenantContextLabel = computed(() => {
  if (brandedAgencies.value.length === 1) return brandedAgencies.value[0].name;
  if (brandedAgencies.value.length > 1) return `${brandedAgencies.value.length} affiliated tenants`;
  return 'Administrative briefing';
});

function liveCssPrimary() {
  if (typeof document === 'undefined') return '';
  const root = getComputedStyle(document.documentElement);
  const v = (root.getPropertyValue('--primary-color') || root.getPropertyValue('--primary') || '').trim();
  if (!v) return '';
  return v;
}

const brandVars = computed(() => {
  const first = brandedAgencies.value[0] || {};
  const platform = platformPalette.value;
  const primary = first.primary
    ? first.primary
    : (liveCssPrimary() || platform.primary || '#1f6b4a');
  return {
    '--brief-primary': primary,
    '--brief-secondary': first.secondary || platform.secondary,
    '--brief-accent': first.accent || platform.accent,
    '--brief-blend': buildTenantBlend(brandedAgencies.value, { ...platform, primary })
  };
});

const now = new Date();
const todayIso = now.toISOString().slice(0, 10);
const dateLabel = now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
const weekdayLabel = now.toLocaleDateString([], { weekday: 'long' });

const prefix = computed(() => {
  // Multi-tenant briefings navigate to the flat/global workspaces so the selected
  // destination preserves the same combined scope represented by this modal.
  if (brandingStore.portalHostPortalUrl === workspaceSlug.value && !router.currentRoute.value.params?.organizationSlug) return '';
  if (workspaceSlug.value) return `/${workspaceSlug.value}`;
  if (isPlatformBriefing.value || brandedAgencies.value.length !== 1) return '';
  const slug = String(router.currentRoute.value.params?.organizationSlug || '').trim();
  if (slug) return `/${slug}`;
  const preferred = brandedAgencies.value.find((agency) => agency.slug || agency.portal_url);
  const preferredSlug = String(preferred?.slug || preferred?.portal_url || '').trim();
  return preferredSlug ? `/${preferredSlug}` : '';
});

const sections = computed(() => activeBriefingSections(briefing.value));
const activePeople = computed(() => activePeopleRaw.value
  .filter(isLivePrivilegedPresence)
  .filter((person) => !workspaceAgency.value?.id || String(person.agency_ids || '').split(',').map(Number).includes(Number(workspaceAgency.value.id)))
  .map((person) => ({
    ...person,
    name: [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') || person.email || 'Team member',
    initials: initialsFor([person.first_name, person.last_name].filter(Boolean).join(' '))
  })));

const urgentSection = computed(() => ({
  key: 'urgent', title: 'Urgent items',
  items: sections.value.filter(section => ['tickets', 'escalations', 'tasks'].includes(section.key))
    .flatMap(section => section.items.filter(item => item.badgeTone === 'danger').map(item => ({ ...item, section })))
}));
const urgentCount = computed(() => urgentSection.value.items.length);

const glanceMetrics = computed(() => [
  { value: workspaceSlug.value ? tenantContextLabel.value : (isPlatformBriefing.value ? 'Platform' : brandedAgencies.value.length), label: workspaceSlug.value || isPlatformBriefing.value ? 'Scope' : 'Tenant affiliations' },
  { value: sections.value.reduce((sum, section) => sum + Number(section.count || 0), 0), label: 'Items needing attention' },
  { value: activePeople.value.length, label: 'Privileged sessions', hint: 'Active or away' },
  { value: Number(briefing.value.calendar?.count || 0), label: 'Calendar today' }
]);

function storageKey() {
  return `pt.privilegedLoginBriefing.disabled:${userId.value || 0}`;
}

const tenantLaunchers = computed(() => {
  const base = isSuperadmin.value
    ? (affiliationRows.value || []).filter(isAgencyTenantOrg).map((agency) => ({
        ...agency,
        ...parseBrandPalette(agency, platformPalette.value),
        logo: agencyLogo(agency),
        initials: initialsFor(agency?.name)
      }))
    : brandedAgencies.value;

  return sortTenantsByRecency(base, tenantVisits.value);
});

watch([userId, () => workspaceAgency.value?.id], ([user, agencyId]) => {
  tenantVisits.value = agencyId ? recordTenantVisit(user, agencyId) : readTenantVisits(user);
}, { immediate: true });

function scrollTenants(direction) {
  tenantScroller.value?.scrollBy({ left: direction * tenantScroller.value.clientWidth * 0.8, behavior: 'smooth' });
}

async function openPanel(next) {
  panelHistory.push({ panel: panel.value, limit: panelLimit.value, focus: document.activeElement });
  panel.value = next;
  panelLimit.value = 20;
  await nextTick();
  panelElement.value?.focus();
}
function inspectItem(section, item) {
  const to = ['tickets', 'escalations'].includes(section.key) && item.raw?.id
    ? `${section.to}${section.to.includes('?') ? '&' : '?'}ticketId=${encodeURIComponent(item.raw.id)}`
    : item.to;
  return openPanel({ section, item: { ...item, to } });
}
function inspectSection(section) { return openPanel({ section }); }
function inspectMeeting(meeting) {
  return inspectItem({ key: 'meetings', title: 'Meeting details', to: meeting.to }, {
    id: meeting.key, label: meeting.title, raw: meeting, to: meeting.to
  });
}
async function goBack() {
  const previous = panelHistory.pop();
  panel.value = previous?.panel || null;
  panelLimit.value = previous?.limit || 20;
  await nextTick();
  if (previous?.focus?.isConnected) previous.focus.focus();
  else panelElement.value?.focus();
}

function isDisabled() {
  try { return localStorage.getItem(storageKey()) === '1'; } catch { return false; }
}

function relativeTime(raw) {
  const ms = new Date(raw || 0).getTime();
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function localYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayYmd() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() + ((day === 0 ? -6 : 1) - day));
  return localYmd(date);
}

function formatTime(raw) {
  const date = new Date(raw || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.notifications)) return data.notifications;
  return [];
}

function todayScheduleItems(data) {
  const rows = [
    ...(data?.officeEvents || []),
    ...(data?.scheduleEvents || []),
    ...(data?.supervisionSessions || [])
  ];
  return rows
    .map((item, index) => {
      const startsAt = item.startAt || item.startsAt || item.startDate;
      const date = new Date(startsAt || 0);
      if (Number.isNaN(date.getTime()) || localYmd(date) !== localYmd()) return null;
      return {
        id: `calendar-${item.id || index}`,
        raw: item,
        label: item.title || item.counterpartyName || item.buildingName || 'Scheduled event',
        meta: formatTime(startsAt),
        sortAt: date.getTime()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortAt - b.sortAt);
}

function roleLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'super_admin' || normalized === 'superadmin') return 'Superadmin';
  if (normalized === 'support') return 'Support';
  return 'Admin';
}

function presenceBandLabel(person) {
  const band = String(person?.availability_band || '').toLowerCase();
  if (band === 'away_reachable') return 'Away · reachable';
  if (band === 'unavailable') return 'Unavailable';
  if (band === 'available_offline') return 'Available · logged out';
  return person?.status === 'idle' ? 'Away · reachable' : 'Available';
}

function baseSection({ title, icon, tone, count, countLabel, items, action, to }) {
  const timestamp = item => new Date(item.raw?.created_at || item.raw?.createdAt || 0).getTime() || 0;
  const recentItems = [...(items || [])].sort((a, b) => a.sortAt && b.sortAt ? a.sortAt - b.sortAt : timestamp(b) - timestamp(a));
  return { title, icon, tone, count: Number(count || 0), countLabel, items: recentItems, action, to };
}

function resolvePrimaryAgencyId() {
  if (workspaceSlug.value) return Number(workspaceAgency.value?.id) || null;
  if (isPlatformBriefing.value) return null;
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency || null;
  const currentId = Number(current?.id || 0);
  if (currentId > 0 && isAgencyTenantOrg(current)) return currentId;
  const tenant = (affiliationRows.value || []).find(isAgencyTenantOrg);
  return tenant?.id ? Number(tenant.id) : null;
}

function mapNotificationItems(rows = []) {
  return rows.map((item) => ({
    id: `notification-${item.id}`,
    raw: item,
    label: item.title || item.message || 'Notification',
    meta: relativeTime(item.created_at || item.createdAt)
  }));
}

function mapSchoolUpdateItems(rows = []) {
  return rows.map((item) => ({
    id: `school-update-${item.id}`,
    raw: item,
    label: item.title || item.message || 'School update',
    meta: relativeTime(item.created_at || item.createdAt)
  }));
}

function applyNotificationSections(unreadNotifications, notificationCount) {
  const tenantRows = tenantBriefingNotifications(unreadNotifications);
  const schoolRows = schoolBriefingItemsFromNotifications(unreadNotifications);
  briefing.value = {
    ...briefing.value,
    notifications: baseSection({
      title: 'Notifications',
      icon: '♢',
      tone: 'slate',
      count: Math.max(notificationCount, tenantRows.length),
      countLabel: tenantRows.length === 1 ? 'new' : 'new',
      items: mapNotificationItems(tenantRows),
      action: 'View all notifications',
      to: `${prefix.value}/notifications`
    }),
    schoolUpdates: baseSection({
      title: 'School updates',
      icon: '▣',
      tone: 'green',
      count: schoolRows.length,
      countLabel: schoolRows.length === 1 ? 'update' : 'updates',
      items: mapSchoolUpdateItems(schoolRows),
      action: 'View communications',
      to: `${prefix.value}/admin/communications`
    })
  };
}

async function loadBriefing() {
  const generation = ++requestGeneration;
  panel.value = null;
  panelHistory.length = 0;
  loading.value = true;
  loadError.value = false;
  briefing.value = {
    notifications: null,
    messages: null,
    tickets: null,
    tasks: null,
    escalations: null,
    schoolUpdates: null,
    calendar: null
  };
  activePeopleRaw.value = [];
  visible.value = true;

  const apiOpts = (timeoutMs) => ({
    timeout: timeoutMs,
    skipGlobalLoading: true,
    skipAuthRedirect: true
  });

  try {
    if (!isSuperadmin.value) {
      const current = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
      const rows = current.length ? current : (await agencyStore.fetchUserAgencies());
      affiliationRows.value = (rows || []).filter(isAgencyTenantOrg);
    } else {
      // For superadmin: fetch all tenant agencies so the launcher row can be shown and ranked
      try {
        const { data } = await api.get('/agencies', {
          params: { limit: 200 },
          ...apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS)
        });
        const rows = Array.isArray(data) ? data : (data?.items || data?.agencies || []);
        affiliationRows.value = rows.filter(isAgencyTenantOrg);
      } catch {
        affiliationRows.value = [];
      }
    }

    if (generation !== requestGeneration) return;
    const primaryAgencyId = resolvePrimaryAgencyId();
    if (workspaceSlug.value && !primaryAgencyId) {
      loadError.value = true;
      return;
    }
    const notificationParams = {
      isRead: false,
      isResolved: false,
      limit: 40
    };
    if (primaryAgencyId) notificationParams.agencyId = primaryAgencyId;

    const phase1 = await Promise.allSettled([
      api.get('/notifications/counts', apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS)),
      api.get('/notifications', {
        params: notificationParams,
        ...apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS)
      }),
      primaryAgencyId
        ? api.get('/messages/dashboard-summary', {
          params: { agencyId: primaryAgencyId },
          ...apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS)
        })
        : Promise.resolve({ data: { cards: { unread: 0 }, priority: [] } })
    ]);

    if (generation !== requestGeneration) return;

    const notificationCounts = phase1[0].status === 'fulfilled' ? (phase1[0].value?.data || {}) : {};
    const notificationList = phase1[1].status === 'fulfilled'
      ? unwrapList(phase1[1].value?.data)
      : [];
    const unreadNotifications = notificationList.filter((item) => {
      const read = item._is_read_for_viewer ?? item.is_read;
      return !read && !item.is_resolved;
    });
    const scopedCount = primaryAgencyId
      ? Number(notificationCounts[primaryAgencyId] || 0)
      : Number(notificationCounts._total ?? Object.values(notificationCounts).reduce((sum, count) => sum + Number(count || 0), 0));
    const notificationCount = Math.max(scopedCount, unreadNotifications.length);
    applyNotificationSections(unreadNotifications, notificationCount);

    const messageData = phase1[2].status === 'fulfilled' ? (phase1[2].value?.data || {}) : {};
    const messageCount = Number(messageData?.cards?.unread || 0);
    briefing.value = {
      ...briefing.value,
      messages: baseSection({
        title: 'Missed messages',
        icon: '◌',
        tone: 'blue',
        count: messageCount,
        countLabel: 'unread',
        items: (messageData?.priority || []).map((item) => ({
          id: item.id,
          raw: item,
          label: item.label || 'Conversation',
          meta: [item.agencyName, relativeTime(item.occurredAt)].filter(Boolean).join(' · ')
        })),
        action: 'View all messages',
        to: `${prefix.value}/messages`
      })
    };

    loadError.value = phase1[0].status === 'rejected' && phase1[1].status === 'rejected';
    loading.value = false;

    const ticketParams = primaryAgencyId ? { agencyId: primaryAgencyId } : {};
    const scheduleParams = {
      weekStart: mondayYmd(),
      ...(primaryAgencyId ? { agencyId: primaryAgencyId } : {})
    };

    const phase2 = await Promise.allSettled([
      api.get('/support-tickets', {
        params: { ...ticketParams, status: 'open', mine: true, ticketKind: 'support', limit: 30 },
        ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)
      }),
      api.get('/tasks', {
        params: { ...ticketParams, ...(primaryAgencyId ? { tenantId: primaryAgencyId } : {}) },
        ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)
      }),
      api.get('/support-tickets', {
        params: { ...ticketParams, mine: true, ticketKind: 'escalation', limit: 30 },
        ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)
      }),
      api.get(`/users/${userId.value}/schedule-summary`, {
        params: scheduleParams,
        ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)
      }),
      api.get('/presence/privileged', apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS))
    ]);

    if (generation !== requestGeneration) return;

    const value = (index, fallback = null) => phase2[index].status === 'fulfilled'
      ? phase2[index].value?.data
      : fallback;

    const ticketRows = unwrapList(value(0, []));
    const taskRows = unwrapList(value(1, [])).filter((task) => ['pending', 'in_progress'].includes(String(task?.status || 'pending').toLowerCase()));
    const escalationRows = unwrapList(value(2, [])).filter((item) => !['resolved', 'closed'].includes(String(item?.escalation_status || item?.status || '').toLowerCase()));
    const calendarRows = todayScheduleItems(value(3, {}));
    activePeopleRaw.value = unwrapList(value(4, []));

    briefing.value = {
      ...briefing.value,
      tickets: baseSection({
        title: 'Assigned tickets',
        icon: '◇',
        tone: 'orange',
        count: ticketRows.length,
        countLabel: 'open',
        items: ticketRows.map((item) => ({
          id: `ticket-${item.id}`,
          raw: item,
          label: item.subject || `Support ticket #${item.id}`,
          meta: item.agency_name || item.school_name || '',
          badge: String(item.priority || '').toUpperCase() || null,
          badgeTone: ['high', 'urgent', 'critical'].includes(String(item.priority || '').toLowerCase()) ? 'danger' : 'warning'
        })),
        action: 'View assigned tickets',
        to: `${prefix.value}/tickets?mine=true`
      }),
      tasks: baseSection({
        title: 'Assigned tasks / to dos',
        icon: '☷',
        tone: 'green',
        count: taskRows.length,
        countLabel: 'pending',
        items: taskRows.map((item) => {
          const dueAt = item.due_date || item.dueDate;
          const overdue = dueAt && new Date(dueAt).getTime() < Date.now();
          return {
            id: `task-${item.id}`,
            raw: item,
            label: item.title || 'Assigned task',
            meta: dueAt ? `Due ${new Date(dueAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '',
            badge: overdue ? 'PAST DUE' : null,
            badgeTone: overdue ? 'danger' : 'neutral'
          };
        }),
        action: 'View all tasks',
        to: `${prefix.value}/tasks`
      }),
      escalations: baseSection({
        title: 'Escalations',
        icon: '△',
        tone: 'red',
        count: escalationRows.length,
        countLabel: 'urgent',
        items: escalationRows.map((item) => ({
          id: `escalation-${item.id}`,
          raw: item,
          label: item.subject || `Escalation #${item.id}`,
          meta: item.agency_name || '',
          badge: item.immediate_action_required ? 'URGENT' : String(item.priority || 'HIGH').toUpperCase(),
          badgeTone: 'danger'
        })),
        action: 'View all escalations',
        to: `${prefix.value}/admin/escalations?mine=true`
      }),
      calendar: baseSection({
        title: 'Today’s calendar',
        icon: '▦',
        tone: 'blue',
        count: calendarRows.length,
        countLabel: 'scheduled',
        items: calendarRows,
        action: 'View full calendar',
        to: `${prefix.value}/my-schedule`
      })
    };

    if (phase2.some((request) => request.status === 'rejected')) {
      loadError.value = true;
    }
  } catch {
    if (generation === requestGeneration) loadError.value = true;
  } finally {
    if (generation === requestGeneration) {
      loading.value = false;
    }
  }
}

function dismiss() {
  dismissedLogin = `${userId.value}:${props.loginTrigger}`;
  requestGeneration += 1;
  if (dontShowAgain.value) {
    try { localStorage.setItem(storageKey(), '1'); } catch { /* ignore */ }
  }
  visible.value = false;
}

async function navigate(to) {
  dismiss();
  await nextTick();
  if (to) await router.push(to);
}

async function navigateToTenant(agency) {
  tenantVisits.value = recordTenantVisit(userId.value, agency.id);
  dismiss();
  await nextTick();
  await openTenantWorkspace(agency, router);
}

async function navigateToPlatform() {
  if (!isSuperadmin.value) return;
  dismiss();
  await nextTick();
  await openPlatformWorkspace(router);
}

watch(
  () => [authStore.user?.id, props.loginTrigger, router.currentRoute.value.meta?.requiresAuth, workspaceSlug.value, workspaceAgency.value?.id],
  ([nextUserId, trigger]) => {
    if (!nextUserId || !router.currentRoute.value.meta?.requiresAuth || !isPrivilegedLoginBriefingUser(authStore.user) || isDisabled()) {
      visible.value = false;
      return;
    }
    if (dismissedLogin === `${nextUserId}:${trigger}`) return;
    const context = `${nextUserId}:${workspaceSlug.value}:${workspaceAgency.value?.id || ''}`;
    const freshLogin = claimLoginBriefing(nextUserId, trigger);
    if (!freshLogin && !(visible.value && activeBriefingContext !== context)) return;
    activeBriefingContext = context;
    void loadBriefing();
  },
  { immediate: true }
);

function manuallyOpen() {
  if (!userId.value || !router.currentRoute.value.meta?.requiresAuth || !isPrivilegedLoginBriefingUser(authStore.user)) return;
  dismissedLogin = null;
  activeBriefingContext = `${userId.value}:${workspaceSlug.value}:${workspaceAgency.value?.id || ''}`;
  void loadBriefing();
}
onMounted(() => window.addEventListener('app:open-command-center', manuallyOpen));
onBeforeUnmount(() => {
  window.removeEventListener('app:open-command-center', manuallyOpen);
  requestGeneration += 1;
});
</script>

<style scoped>
.briefing-overlay {
  position: fixed;
  inset: 0;
  z-index: 10200;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(29, 38, 51, 0.32);
  backdrop-filter: blur(12px);
}
.briefing-modal {
  --brief-primary: #1f6b4a;
  --brief-link: var(--brief-primary);
  --brief-secondary: #0f2f27;
  --brief-accent: #2f8c68;
  position: relative;
  width: min(1440px, 96vw);
  max-height: min(920px, 94vh);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--brief-primary) 38%, var(--border));
  border-radius: 20px;
  background: var(--bg, #f8fafc);
  color: var(--text-primary, #172033);
  box-shadow: 0 34px 90px rgba(0, 0, 0, 0.38);
}
.briefing-modal::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 5px;
  background: var(--brief-blend);
}
.briefing-brand-rail {
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 66px;
  width: 92px;
  border-radius: 0 0 0 19px;
  background: var(--bg-alt, #f1f5f9);
}
.brand-logo-stack { display: flex; flex-direction: column; align-items: center; padding-top: 34px; }
.brand-logo-wrap {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  margin-bottom: -8px;
  overflow: hidden;
  border: 3px solid color-mix(in srgb, var(--brief-secondary) 88%, #fff);
  border-radius: 50%;
  background: #fff;
  color: var(--brief-link);
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}
.brand-logo { width: 100%; height: 100%; object-fit: contain; }
.brand-logo-more { background: var(--brief-primary); color: #fff; }
.briefing-close {
  position: absolute;
  z-index: 2;
  top: 22px;
  right: 24px;
  border: 0;
  background: transparent;
  color: currentColor;
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
}
.briefing-header {
  min-height: 128px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 28px 92px 20px 126px;
  background: linear-gradient(115deg, color-mix(in srgb, var(--brief-primary) 8%, var(--bg-card, #fff)), transparent 58%);
}
.briefing-eyebrow { color: var(--brief-link); font-size: 12px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.briefing-header h1 { color: var(--text-primary, #1f2937); margin: 4px 0 3px; font-size: clamp(25px, 2.2vw, 36px); line-height: 1.1; }
.briefing-header p { margin: 0; color: var(--text-secondary, #526078); font-size: 14px; }
.briefing-date { display: flex; align-items: center; gap: 10px; min-width: 180px; font-size: 12px; }
.briefing-date span:last-child { display: flex; flex-direction: column; }
.briefing-date small { margin-top: 2px; color: var(--text-secondary, #64748b); }
.date-icon { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--border, #d8dee9); border-radius: 8px; font-size: 23px; color: var(--brief-link); background: var(--bg-card, #fff); }
.tenant-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -6px 26px 14px 126px; font-size: 11px; color: var(--text-secondary, #64748b); }
.tenant-strip > span:first-child { font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.tenant-chip { border-left: 4px solid var(--tenant-color); border-radius: 999px; padding: 5px 9px; background: var(--bg-card); border-top: 1px solid var(--border, #e2e8f0); border-right: 1px solid var(--border, #e2e8f0); border-bottom: 1px solid var(--border, #e2e8f0); color: var(--text-primary, #334155); font-weight: 700; }
.briefing-loading { min-height: 430px; display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--text-secondary, #64748b); }
.briefing-spinner { width: 23px; height: 23px; border: 3px solid #dbe5e0; border-top-color: var(--brief-link); border-radius: 50%; animation: briefing-spin .75s linear infinite; }
.briefing-warning { margin: 0 26px 12px 126px; padding: 9px 12px; border: 1px solid #fcd34d; border-radius: 8px; background: var(--app-tint-amber, #fffbeb); color: var(--app-text-amber, #92400e); font-size: 12px; }
.briefing-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 18px; padding: 0 28px 18px 126px; }
.briefing-main { min-width: 0; }
.briefing-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.briefing-card { min-height: 230px; display: flex; flex-direction: column; padding: 18px; border: 1px solid var(--border, #dce2ea); border-radius: 12px; background: var(--bg-card, #fff); box-shadow: 0 6px 24px rgba(15, 23, 42, .035); }
.card-header { display: flex; gap: 13px; align-items: center; margin-bottom: 12px; }
.card-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 10px; color: #fff; background: var(--card-color, #334155); font-size: 25px; }
.briefing-card--blue { --card-color: #245b9c; }
.briefing-card--orange { --card-color: #b3470b; }
.briefing-card--green { --card-color: #236747; }
.briefing-card--red { --card-color: #a51c1c; }
.briefing-card--slate { --card-color: #17333b; }
.card-kicker, .side-kicker { color: var(--text-primary); font-size: 12px; font-weight: 850; letter-spacing: .025em; text-transform: uppercase; }
.card-count { margin-top: 2px; color: var(--text-secondary, #475569); font-size: 12px; }
.card-count strong { margin-right: 5px; color: var(--text-primary); font-size: 28px; }
.briefing-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 0; border: 0; border-top: 1px solid var(--border, #eef1f5); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.briefing-item:hover .item-copy strong { color: var(--brief-link); }
.item-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--card-color, #334155); }
.item-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; }
.item-copy strong { overflow: hidden; color: inherit; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.item-copy small { margin-top: 2px; overflow: hidden; color: var(--text-secondary, #64748b); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.item-badge { flex: 0 0 auto; border-radius: 5px; padding: 3px 5px; background: var(--bg-muted, #f1f5f9); color: var(--text-secondary, #475569); font-size: 8px; font-weight: 850; }
.item-badge--danger { background: var(--app-tint-red, #fee2e2); color: var(--app-text-red, #b91c1c); }
.item-badge--warning { background: var(--app-tint-amber, #ffedd5); color: var(--app-text-amber, #c2410c); }
.card-link { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: auto; padding: 12px 0 0; border: 0; background: transparent; color: var(--brief-link); font-size: 12px; font-weight: 800; cursor: pointer; }
.all-clear-card { display: flex; align-items: center; gap: 14px; min-height: 120px; padding: 24px; border: 1px solid var(--border, #dce2ea); border-radius: 12px; background: var(--bg-card); }
.all-clear-card > span { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: #dcfce7; color: #166534; font-size: 22px; }
.all-clear-card div { display: flex; flex-direction: column; gap: 4px; }
.all-clear-card small { color: var(--text-secondary, #64748b); }
.at-a-glance { display: grid; grid-template-columns: 1.2fr repeat(4, 1fr); margin-top: 14px; padding: 16px 18px; border: 1px solid var(--border, #dce2ea); border-radius: 12px; background: var(--bg-card, #fff); }
.glance-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 850; }
.glance-metric { display: flex; flex-direction: column; padding-left: 18px; border-left: 1px solid var(--border, #dce2ea); }
.glance-metric strong { font-size: 20px; }
.glance-metric span { color: var(--text-secondary, #64748b); font-size: 10px; }
.glance-metric small { color: var(--app-text-green, #16803c); font-size: 9px; }
.briefing-side { display: flex; flex-direction: column; gap: 14px; }
.presence-card, .security-card { padding: 18px; border: 1px solid var(--border, #dce2ea); border-radius: 12px; background: var(--bg-card, #fff); }
.active-session-count { display: flex; align-items: center; gap: 7px; margin-top: 12px; color: var(--app-text-green, #15803d); font-size: 11px; font-weight: 700; }
.active-session-count span { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; }
.presence-person { width: 100%; display: grid; grid-template-columns: 35px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 10px 0; border: 0; border-bottom: 1px solid var(--border, #eef1f5); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.presence-person img, .person-avatar { width: 35px; height: 35px; border-radius: 50%; object-fit: cover; }
.person-avatar { display: grid; place-items: center; background: color-mix(in srgb, var(--brief-primary) 14%, var(--bg-card)); color: var(--brief-link); font-size: 10px; font-weight: 900; }
.person-copy { min-width: 0; display: flex; flex-direction: column; }
.person-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.person-copy small { margin-top: 2px; overflow: hidden; color: var(--text-secondary, #64748b); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.person-status { display: inline-flex; align-items: center; gap: 5px; color: var(--app-text-green, #15803d); font-size: 9px; font-weight: 800; white-space: nowrap; }
.person-status::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.person-status--away_reachable { color: #e9a700; }
.person-status--unavailable { color: #dc2626; }
.person-status--available_offline { color: #1da7d8; }
.urgent-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 18px; border: 0; border-radius: 12px; background: var(--brief-primary); color: #fff; text-align: left; cursor: pointer; }
.urgent-icon { color: #fff; font-size: 25px; }
.urgent-card span:nth-child(2) { font-size: 11px; }
.urgent-card small { display: block; margin-bottom: 7px; color: #fff; font-size: 9px; font-weight: 850; text-transform: uppercase; }
.urgent-card strong { margin-right: 5px; font-size: 24px; }
.security-card { display: flex; gap: 12px; font-size: 12px; }
.security-card > span { color: var(--brief-link); font-size: 22px; }
.security-card p { margin: 7px 0 0; color: var(--text-secondary, #526078); font-size: 11px; line-height: 1.55; }
.briefing-footer { position: sticky; bottom: 0; z-index: 2; min-height: 66px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; padding: 10px 28px 10px 126px; border-top: 1px solid rgba(203, 213, 225, .35); border-radius: 0 0 19px 19px; background: var(--bg-alt, #f1f5f9); color: var(--text-primary); }
.dont-show-label { display: flex; align-items: center; gap: 9px; font-size: 11px; cursor: pointer; }
.dont-show-label input { width: 16px; height: 16px; accent-color: var(--brief-link); }
.briefing-dashboard-actions { display: flex; flex-wrap: wrap; gap: 8px; flex-shrink: 0; }
.enter-dashboard, .superadmin-dashboard { min-height: 44px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; }
.enter-dashboard { background: var(--brief-blend); color: #fff; }
.superadmin-dashboard { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--bg-card); color: var(--text-primary); }

/* Tenant quick-launch icons in footer */
.tenant-launcher-strip { display:flex; align-items:center; gap:8px; flex-basis:100%; min-width:0; order:-1; }
.tenant-scroll { display:grid; place-items:center; flex:0 0 32px; width:32px; height:40px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); cursor:pointer; }
.tenant-launchers {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 4px 2px 8px;
  scrollbar-width: thin;
}
.tenant-launchers__label {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
  color: var(--text-secondary);
  margin-right: 2px;
  flex-shrink: 0;
}
.tenant-launcher {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  flex: 0 0 104px;
  width: 104px;
  height: 64px;
  transition: background .15s, border-color .15s, transform .1s;
}
.tenant-launcher:hover { background: rgba(255,255,255,.18); border-color: var(--text-secondary); transform: translateY(-1px); }
.tenant-launcher--top { border-color: var(--brief-primary); background: color-mix(in srgb, var(--brief-primary) 10%, var(--bg-card)); }
.tenant-launcher__icon-wrap { position: relative; display: inline-flex; }
.tenant-launcher__logo { width: 28px; height: 28px; object-fit: contain; border-radius: 5px; background: #fff; }
.tenant-launcher__initials {
  width: 28px; height: 28px;
  border-radius: 5px;
  background: var(--tl-color, #334155);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800;
}
.tenant-launcher__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 88px; text-align: center; }
.card-actions { margin-top:auto; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.card-actions .card-link { gap:6px; width:auto; }
.briefing-browser { min-height:380px; padding:16px 0 24px; }
.briefing-browser:focus { outline:none; }
.browser-toolbar { display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; padding-bottom:16px; margin-bottom:20px; border-bottom:1px solid var(--border); }
.browser-toolbar button, .browser-more { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:40px; padding:8px 12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); font:inherit; font-size:13px; cursor:pointer; }
.browser-count { color:var(--text-secondary); font-size:13px; }
.browser-item { width:100%; padding:14px 0; }
.browser-item .item-copy strong { white-space:normal; overflow-wrap:anywhere; }
.browser-item > svg { flex-shrink:0; }
.browser-more { margin-top:16px; }
.briefing-modal button:focus-visible, .tenant-launchers:focus-visible { outline:2px solid var(--brief-link); outline-offset:3px; }
.briefing-fade-enter-active, .briefing-fade-leave-active { transition: opacity .18s ease; }
.briefing-fade-enter-active .briefing-modal, .briefing-fade-leave-active .briefing-modal { transition: transform .18s ease; }
.briefing-fade-enter-from, .briefing-fade-leave-to { opacity: 0; }
.briefing-fade-enter-from .briefing-modal, .briefing-fade-leave-to .briefing-modal { transform: translateY(12px) scale(.985); }
@keyframes briefing-spin { to { transform: rotate(360deg); } }

[data-theme="dark"] .briefing-overlay { background: rgba(5, 10, 17, .84); }
[data-theme="dark"] .briefing-modal { --brief-link: color-mix(in srgb, var(--brief-primary) 45%, white); }

@media (max-width: 1100px) {
  .briefing-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .briefing-layout { grid-template-columns: minmax(0, 1fr) 280px; }
  .at-a-glance { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .glance-title { grid-column: 1 / -1; }
  .glance-metric { border-left: 0; padding-left: 0; }
}
@media (max-width: 760px) {
  .briefing-overlay { padding: 0; }
  .briefing-modal { width: 100vw; max-height: 100dvh; min-height: 100dvh; border: 0; border-radius: 0; }
  .briefing-brand-rail { display: none; }
  .briefing-header { min-height: auto; align-items: flex-start; flex-direction: column; padding: 30px 52px 16px 20px; }
  .briefing-date { min-width: 0; }
  .tenant-strip, .briefing-warning { margin-left: 20px; margin-right: 20px; }
  .briefing-layout { display: block; padding: 0 16px 100px; }
  .briefing-card-grid { grid-template-columns: 1fr; }
  .briefing-card { min-height: 210px; }
  .briefing-side { margin-top: 14px; }
  .briefing-footer { position: static; padding: 10px 14px; border-radius: 0; }
  .briefing-dashboard-actions { width: 100%; flex-direction: column; }
  .tenant-launchers__label { display:none; }
  .dont-show-label span { max-width: 150px; }
  .enter-dashboard { min-width: 155px; }
}
@media (prefers-reduced-motion: reduce) {
  .briefing-fade-enter-active, .briefing-fade-leave-active, .briefing-fade-enter-active .briefing-modal, .briefing-fade-leave-active .briefing-modal { transition: none; }
  .briefing-spinner { animation: none; }
}
</style>
