<template>
  <div class="pch-overlay" @click.self="$emit('close')">
    <div class="pch-modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <div class="pch-header">
        <div>
          <h2 :id="titleId" class="pch-title">{{ displayName }}</h2>
          <p class="pch-sub">{{ headerSubtitle }}</p>
        </div>
        <button type="button" class="pch-close" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <!-- Hub: choose section -->
      <div v-if="!activeSection" class="pch-hub" role="navigation" aria-label="Skill Builders sections">
        <button
          v-for="item in sectionItems"
          :key="item.id"
          type="button"
          class="pch-hub-card"
          @click="openSection(item.id)"
        >
          <div class="pch-hub-card-top">
            <span v-if="item.iconUrl" class="pch-hub-icon pch-hub-icon-img">
              <img :src="item.iconUrl" alt="" class="pch-hub-icon-img-el" />
            </span>
            <span v-else class="pch-hub-icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="pch-hub-card-label">{{ item.label }}</span>
          </div>
          <p class="pch-hub-card-desc">{{ item.description }}</p>
          <span class="pch-hub-card-cta">Open <span aria-hidden="true">→</span></span>
        </button>
      </div>

      <!-- Detail: section content + compact nav -->
      <div v-else class="pch-detail">
        <div class="pch-detail-toolbar">
          <button type="button" class="pch-back-btn" @click="activeSection = null">
            <span class="pch-back-icon" aria-hidden="true">←</span>
            All sections
          </button>
          <div class="pch-segments" role="tablist" aria-label="Switch section">
            <button
              v-for="item in sectionItems"
              :key="item.id"
              type="button"
              role="tab"
              :aria-selected="activeSection === item.id"
              :class="['pch-seg', { active: activeSection === item.id }]"
              @click="openSection(item.id)"
            >
              {{ item.shortLabel }}
            </button>
          </div>
        </div>
        <p v-if="sectionTagline" class="pch-detail-tagline">{{ sectionTagline }}</p>

        <div class="pch-body pch-detail-body">
          <div v-show="activeSection === 'availability'" class="pch-panel">
            <template v-if="mode === 'coordinator' && resolvedOrgId">
              <SkillBuildersAvailabilityPanel
                :agency-id="props.agencyId"
                :organization-id="resolvedOrgId"
                :show-scope-filters="false"
                :show-title="false"
              />
            </template>
            <template v-else-if="mode === 'provider'">
              <p class="pch-muted">
                Set and confirm your Skill Builder availability blocks (6+ hrs/week, biweekly confirmation).
              </p>
              <div class="pch-inline-actions">
                <button type="button" class="btn btn-primary btn-sm" @click="$emit('open-skill-builder-availability')">
                  Manage Skill Builder availability
                </button>
              </div>
            </template>
          </div>

          <div v-show="activeSection === 'events'" class="pch-panel pch-events">
            <div v-if="eventsLoading" class="pch-muted">Loading events…</div>
            <div v-else-if="eventsError" class="pch-error">{{ eventsError }}</div>
            <template v-else-if="mode === 'coordinator'">
              <div v-if="!programEvents.length" class="pch-empty">
                <p>
                  No integrated events yet. We can create <strong>company events</strong> from your existing school Skill
                  Builders groups (names, dates, meeting times).
                </p>
                <div class="pch-empty-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="backfillBusy || !coordinatorAgencyId"
                    @click="runBackfillFromGroups"
                  >
                    {{ backfillBusy ? 'Creating…' : 'Create events from school groups' }}
                  </button>
                </div>
                <p class="pch-muted pch-empty-foot">
                  Or use <code>npm run backfill:skills-groups-company-events</code> in <code>backend/</code>, link events
                  under Agency → Company events, or open each school group and save to sync.
                </p>
              </div>
              <ul v-else class="pch-event-list">
                <li v-for="ev in programEvents" :key="ev.id" class="pch-event-item">
                  <button type="button" class="pch-event-open" @click="goEventPortal(ev.id)">
                    <div class="pch-event-title">{{ ev.title }}</div>
                    <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }}</div>
                    <p
                      v-if="!ev.skillsGroupStartDate && !ev.skillsGroupEndDate && (ev.startsAt || ev.endsAt)"
                      class="pch-muted pch-event-hint"
                    >
                      Date range not set on the skills group.
                    </p>
                    <ul v-if="ev.meetings?.length" class="pch-event-meet-list">
                      <li v-for="(m, i) in ev.meetings" :key="i">
                        {{ m.weekday }}
                        {{ wallHmToDisplay(formatHm(m.startTime)) }}–{{ wallHmToDisplay(formatHm(m.endTime)) }}
                      </li>
                    </ul>
                    <div v-if="ev.description" class="pch-event-desc">{{ ev.description }}</div>
                    <span class="pch-cta">Event portal →</span>
                  </button>
                </li>
              </ul>
            </template>
            <template v-else>
              <h3 class="pch-events-sub">Assigned</h3>
              <ul v-if="assignedEvents.length" class="pch-event-list">
                <li v-for="ev in assignedEvents" :key="`a-${ev.id}`" class="pch-event-item">
                  <button type="button" class="pch-event-open" @click="goEventPortal(ev.id)">
                    <div class="pch-event-title">{{ ev.title }}</div>
                    <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }} · {{ ev.schoolName }}</div>
                    <span class="pch-cta">Event portal →</span>
                  </button>
                </li>
              </ul>
              <p v-else class="pch-muted">You are not assigned to any Skill Builders events yet.</p>

              <h3 class="pch-events-sub" style="margin-top: 20px;">Upcoming (apply)</h3>
              <ul v-if="upcomingEvents.length" class="pch-event-list">
                <li v-for="ev in upcomingEvents" :key="`u-${ev.id}`" class="pch-event-item">
                  <div class="pch-event-title">{{ ev.title }}</div>
                  <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }} · {{ ev.schoolName }}</div>
                  <div class="pch-row-actions">
                    <button type="button" class="btn btn-secondary btn-sm" @click="goEventPortal(ev.id)">Details</button>
                    <button
                      v-if="!ev.applicationStatus || ev.applicationStatus === 'withdrawn'"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="applyBusyId === ev.id"
                      @click="applyToEvent(ev)"
                    >
                      {{ applyBusyId === ev.id ? 'Applying…' : 'Apply' }}
                    </button>
                    <span v-else-if="ev.applicationStatus === 'pending'" class="pch-muted">Application pending</span>
                    <span v-else-if="ev.applicationStatus === 'approved'" class="pch-muted">Approved</span>
                  </div>
                </li>
              </ul>
              <p v-else class="pch-muted">No open events to apply for.</p>
            </template>
          </div>

          <div v-show="activeSection === 'schedule'" class="pch-panel">
            <SkillBuildersWorkSchedulePanel :agency-id="props.agencyId" :mode="props.mode" />
          </div>
          <div v-show="activeSection === 'documents'" class="pch-panel">
            <SkillBuildersProgramDocumentsPanel
              v-if="coordinatorAgencyId && resolvedCoordinatorOrganizationId"
              :agency-id="coordinatorAgencyId"
              :organization-id="resolvedCoordinatorOrganizationId"
            />
            <p v-else class="pch-muted">Program organization is required to manage documents.</p>
          </div>
          <div v-show="activeSection === 'clients'" class="pch-panel">
            <SkillBuildersClientManagementPanel v-if="coordinatorAgencyId" :agency-id="coordinatorAgencyId" />
          </div>
          <div v-show="activeSection === 'clinical_notes'" class="pch-panel">
            <SkillBuildersClinicalNotesHubPanel v-if="coordinatorAgencyId" :agency-id="coordinatorAgencyId" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import SkillBuildersAvailabilityPanel from './SkillBuildersAvailabilityPanel.vue';
import SkillBuildersWorkSchedulePanel from './SkillBuildersWorkSchedulePanel.vue';
import SkillBuildersClientManagementPanel from './SkillBuildersClientManagementPanel.vue';
import SkillBuildersProgramDocumentsPanel from './SkillBuildersProgramDocumentsPanel.vue';
import SkillBuildersClinicalNotesHubPanel from '../skillBuilders/SkillBuildersClinicalNotesHubPanel.vue';
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  mode: { type: String, default: 'coordinator' }, // 'coordinator' | 'provider'
  agencyId: { type: [Number, String, null], default: null },
  organizationId: { type: [Number, String, null], default: null },
  organizationName: { type: String, default: '' },
  /** When set (e.g. `documents`), open this section instead of the hub grid. */
  initialSection: { type: String, default: null }
});

defineEmits(['close', 'open-skill-builder-availability']);

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const titleId = `pch-title-${Math.random().toString(36).slice(2, 9)}`;
/** null = hub (pick a section); otherwise section id */
const activeSection = ref(null);
/** After applying `initialSection` once so we do not override user navigation. */
const initialSectionApplied = ref(false);
const eventsLoading = ref(false);
const eventsError = ref('');
const programEvents = ref([]);
const assignedEvents = ref([]);
const upcomingEvents = ref([]);
const applyBusyId = ref(null);
const backfillBusy = ref(false);
const resolvedOrgId = ref(null);
const resolvedOrgName = ref('');

const displayName = computed(() => {
  if (props.mode === 'provider') return resolvedOrgName.value || 'Skill Builders';
  return props.organizationName || 'Program';
});

const coordinatorAgencyId = computed(() => {
  const a = Number(props.agencyId);
  return Number.isFinite(a) && a > 0 ? a : null;
});

const resolvedCoordinatorOrganizationId = computed(() => {
  const o = Number(props.organizationId);
  return Number.isFinite(o) && o > 0 ? o : null;
});

const sectionItems = computed(() => {
  const base = [
    {
      id: 'availability',
      label: 'Availability',
      shortLabel: 'Availability',
      icon: '📅',
      description: 'Weekly Skill Builder blocks, confirmations, and coordinator view by day.'
    },
    {
      id: 'events',
      label: 'Events',
      shortLabel: 'Events',
      icon: '🎯',
      description: 'Program company events and applications linked to school Skill Builders groups.'
    },
    {
      id: 'schedule',
      label: 'Work schedule',
      shortLabel: 'Schedule',
      icon: '🗓️',
      description: 'Upcoming Skill Builders meetings and your assignments.'
    }
  ];
  if (props.mode === 'coordinator' && coordinatorAgencyId.value) {
    base.push({
      id: 'documents',
      label: 'Program documents',
      shortLabel: 'Docs',
      icon: '📄',
      description: 'Program-wide PDF library; attach per event session from here or the event portal.'
    });
    base.push({
      id: 'clients',
      label: 'Client management',
      shortLabel: 'Clients',
      icon: '👥',
      description: 'Master list of Skill Builders (skills) clients across the agency.'
    });
  }
  if (coordinatorAgencyId.value) {
    const supIcon = brandingStore.getDashboardCardIconUrl('supervision', coordinatorAgencyId.value);
    base.push({
      id: 'clinical_notes',
      label: 'Clinical Notes',
      shortLabel: 'Notes',
      icon: supIcon ? '' : '📝',
      iconUrl: supIcon || '',
      description: 'Your Skill Builders clinical notes across events (copy before expiry).'
    });
  }
  return base;
});

const headerSubtitle = computed(() => {
  if (!activeSection.value) return 'Choose a section — each area opens full-screen style with quick switching above.';
  const item = sectionItems.value.find((s) => s.id === activeSection.value);
  return item ? item.label : displayName.value;
});

const sectionTagline = computed(() => {
  if (activeSection.value === 'documents') return '';
  const item = sectionItems.value.find((s) => s.id === activeSection.value);
  return item?.description || '';
});

watch(
  () => props.initialSection,
  (v) => {
    if (v == null || String(v).trim() === '') initialSectionApplied.value = false;
  }
);

watch(
  () => [props.initialSection, sectionItems.value],
  () => {
    if (initialSectionApplied.value) return;
    const want = String(props.initialSection || '').trim();
    if (!want) return;
    if (sectionItems.value.some((s) => s.id === want)) {
      activeSection.value = want;
      initialSectionApplied.value = true;
    }
  },
  { immediate: true }
);

function openSection(id) {
  activeSection.value = id;
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

function wallHmToDisplay(hm) {
  const s = String(hm || '').slice(0, 5);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s === '—' ? '' : s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function parseYmdLocal(raw) {
  const t = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, mo, da] = t.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Date-only range for program hub cards (skills group dates preferred). */
function formatEventDateRange(ev) {
  const gs = ev?.skillsGroupStartDate;
  const ge = ev?.skillsGroupEndDate;
  if (gs && ge) {
    const a = parseYmdLocal(gs);
    const b = parseYmdLocal(ge);
    if (a && b) {
      const opt = { month: 'short', day: 'numeric', year: 'numeric' };
      return `${a.toLocaleDateString(undefined, opt)} – ${b.toLocaleDateString(undefined, opt)}`;
    }
  }
  const st = ev?.startsAt;
  const en = ev?.endsAt;
  const a = st ? new Date(st) : null;
  const b = en ? new Date(en) : null;
  if (!a || !Number.isFinite(a.getTime())) return '';
  const dateOpt = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    const left = a.toLocaleDateString(undefined, dateOpt);
    if (b && Number.isFinite(b.getTime())) {
      return `${left} – ${b.toLocaleDateString(undefined, dateOpt)}`;
    }
    return left;
  } catch {
    return String(st || '');
  }
}

function orgSlug() {
  return (
    String(route.params?.organizationSlug || '').trim() ||
    String(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || '').trim()
  );
}

function goEventPortal(eventId) {
  const slug = orgSlug();
  if (slug) router.push(`/${slug}/skill-builders/event/${eventId}`);
}

async function loadProgramContext() {
  resolvedOrgId.value = null;
  resolvedOrgName.value = '';
  const aid = Number(props.agencyId);
  if (props.mode !== 'provider' || !Number.isFinite(aid) || aid <= 0) return;
  try {
    const res = await api.get('/skill-builders/me/program', { params: { agencyId: aid }, skipGlobalLoading: true });
    if (res.data?.organizationId) {
      resolvedOrgId.value = Number(res.data.organizationId);
      resolvedOrgName.value = String(res.data.organizationName || 'Skill Builders');
    }
  } catch {
    resolvedOrgId.value = null;
  }
}

async function loadCoordinatorEvents() {
  programEvents.value = [];
  eventsError.value = '';
  const aid = Number(props.agencyId);
  const oid = Number(props.organizationId);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(oid) || oid <= 0) return;
  eventsLoading.value = true;
  try {
    const res = await api.get('/availability/admin/program-company-events', {
      params: { agencyId: aid, organizationId: oid },
      skipGlobalLoading: true
    });
    programEvents.value = Array.isArray(res.data?.events) ? res.data.events : [];
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Failed to load events';
    programEvents.value = [];
  } finally {
    eventsLoading.value = false;
  }
}

async function loadProviderEvents() {
  assignedEvents.value = [];
  upcomingEvents.value = [];
  eventsError.value = '';
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return;
  eventsLoading.value = true;
  try {
    const [a, u] = await Promise.all([
      api.get('/skill-builders/me/assigned-events', { params: { agencyId: aid }, skipGlobalLoading: true }),
      api.get('/skill-builders/me/upcoming-events', { params: { agencyId: aid }, skipGlobalLoading: true })
    ]);
    assignedEvents.value = Array.isArray(a.data?.events) ? a.data.events : [];
    upcomingEvents.value = Array.isArray(u.data?.events) ? u.data.events : [];
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Failed to load events';
  } finally {
    eventsLoading.value = false;
  }
}

async function applyToEvent(ev) {
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0 || !ev?.id) return;
  applyBusyId.value = ev.id;
  try {
    await api.post('/skill-builders/me/applications', { agencyId: aid, companyEventId: ev.id }, { skipGlobalLoading: true });
    await loadProviderEvents();
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Apply failed';
  } finally {
    applyBusyId.value = null;
  }
}

async function runBackfillFromGroups() {
  const aid = coordinatorAgencyId.value;
  if (!aid) return;
  backfillBusy.value = true;
  eventsError.value = '';
  try {
    const res = await api.post(
      '/availability/admin/backfill-skills-group-company-events',
      { agencyId: aid },
      { skipGlobalLoading: true }
    );
    const c = Number(res.data?.created || 0);
    const s = Number(res.data?.skipped || 0);
    const warns = Array.isArray(res.data?.warnings) ? res.data.warnings : [];
    if (c === 0) {
      eventsError.value =
        warns.slice(0, 2).join(' ') ||
        'No new events were created. Groups may already be linked, or there is no affiliated program named "Skill Builders".';
    } else {
      eventsError.value = '';
    }
    await loadCoordinatorEvents();
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Backfill failed';
  } finally {
    backfillBusy.value = false;
  }
}

watch(
  () => [props.mode, props.agencyId, props.organizationId],
  async () => {
    activeSection.value = null;
    if (props.mode === 'provider') {
      await loadProgramContext();
    } else {
      resolvedOrgId.value = Number(props.organizationId) || null;
      resolvedOrgName.value = props.organizationName || '';
    }
  },
  { immediate: true }
);

watch(
  () => [activeSection.value, props.mode, props.agencyId, props.organizationId],
  async () => {
    if (activeSection.value !== 'events') return;
    if (props.mode === 'coordinator') await loadCoordinatorEvents();
    else await loadProviderEvents();
  }
);
</script>

<style scoped>
.pch-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  padding: 12px;
}
.pch-modal {
  width: 100%;
  max-width: 1080px;
  max-height: min(92vh, 900px);
  overflow: hidden;
  background: var(--pch-surface, #fff);
  border-radius: 20px;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.06),
    0 24px 48px -12px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
}
.pch-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  gap: 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}
.pch-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary, #0f172a);
}
.pch-sub {
  margin: 6px 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #64748b);
  line-height: 1.45;
  max-width: 42rem;
}
.pch-close {
  background: #f1f5f9;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.pch-close:hover {
  background: #e2e8f0;
}

/* Hub cards */
.pch-hub {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 18px 22px 22px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.pch-hub-card {
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  padding: 18px 18px 16px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 132px;
}
.pch-hub-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 8px 24px -8px rgba(21, 128, 61, 0.25);
  transform: translateY(-1px);
}
.pch-hub-card:focus-visible {
  outline: 2px solid var(--primary, #15803d);
  outline-offset: 2px;
}
.pch-hub-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pch-hub-icon {
  font-size: 1.5rem;
  line-height: 1;
}
.pch-hub-icon-img-el {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}
.pch-hub-card-label {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text-primary, #0f172a);
}
.pch-hub-card-desc {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary, #64748b);
  line-height: 1.45;
  flex: 1;
}
.pch-hub-card-cta {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary, #15803d);
  margin-top: 4px;
}

/* Detail */
.pch-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pch-detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
}
.pch-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary, #334155);
  cursor: pointer;
  transition: background 0.15s ease;
}
.pch-back-btn:hover {
  background: #f1f5f9;
}
.pch-back-icon {
  font-size: 1rem;
  opacity: 0.85;
}
.pch-segments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
}
.pch-seg {
  border: 1px solid transparent;
  background: #fff;
  color: var(--text-secondary, #64748b);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.pch-seg:hover {
  border-color: var(--border, #cbd5e1);
  color: var(--text-primary, #334155);
}
.pch-seg.active {
  background: var(--primary, #15803d);
  color: #fff;
  border-color: var(--primary, #15803d);
}
.pch-detail-tagline {
  margin: 0;
  padding: 10px 22px 0;
  font-size: 0.8125rem;
  color: var(--text-secondary, #64748b);
  line-height: 1.4;
}
.pch-detail-body {
  flex: 1;
}

.pch-body {
  padding: 12px 22px 22px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.pch-panel {
  min-height: 120px;
}
.pch-inline-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.pch-muted {
  color: var(--text-secondary, #64748b);
  font-size: 0.875rem;
}
.pch-error {
  color: #b91c1c;
  font-size: 0.9rem;
}
.pch-empty {
  padding: 20px 8px 8px;
  text-align: center;
  color: var(--text-secondary, #64748b);
  line-height: 1.55;
  max-width: 38rem;
  margin: 0 auto;
}
.pch-empty-actions {
  margin-top: 16px;
}
.pch-empty-foot {
  margin-top: 16px;
  font-size: 0.78rem;
}
.pch-empty-foot code {
  font-size: 0.72rem;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}
.pch-event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pch-event-item {
  padding: 0;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
}
.pch-event-open {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.pch-event-open:hover {
  background: #f1f5f9;
}
.pch-event-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 2px;
  line-height: 1.25;
}
.pch-event-dates {
  font-size: 0.78rem;
  line-height: 1.3;
}
.pch-event-hint {
  margin: 4px 0 0;
  font-size: 0.72rem;
  line-height: 1.3;
}
.pch-event-meet-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-secondary, #64748b);
}
.pch-event-meet-list li {
  padding: 0;
}
.pch-event-desc {
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--text-secondary, #64748b);
  white-space: pre-wrap;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pch-cta {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.72rem;
  color: var(--primary, #15803d);
  font-weight: 600;
}
.pch-events-sub {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.pch-row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding: 0 14px 12px;
}

@media (max-width: 560px) {
  .pch-hub {
    grid-template-columns: 1fr;
  }
  .pch-segments {
    justify-content: flex-start;
    width: 100%;
  }
}
</style>
