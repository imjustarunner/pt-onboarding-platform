<template>
  <transition name="sstc-bar-slide">
    <div v-if="visible" class="sstc-context-bar" aria-label="Club and team context">
      <div class="sstc-context-inner">
        <!-- Club identity -->
        <div class="sstc-club-block">
          <img
            v-if="clubLogoSrc"
            :src="clubLogoSrc"
            alt=""
            class="sstc-club-logo"
            width="36"
            height="36"
          />
          <span class="sstc-pill-badge">Club</span>
          <span class="sstc-club-name" :title="clubDisplayName">{{ clubDisplayName }}</span>
        </div>

        <!-- Season / challenge name — pushed to the right on wide screens -->
        <div v-if="selectedTeam?.challengeName" class="sstc-season-block">
          <span class="sstc-season-icon" aria-hidden="true">🏆</span>
          <span class="sstc-season-label" :title="selectedTeam.challengeName">{{ selectedTeam.challengeName }}</span>
          <router-link
            v-if="challengeLink(selectedTeam)"
            class="sstc-challenge-btn"
            :to="challengeLink(selectedTeam)"
          >
            Open season
          </router-link>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { isSummitPlatformRouteSlug } from '../../utils/summitPlatformSlugs.js';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const platformLogoUrl = computed(() =>
  brandingStore.platformBranding?.organization_logo_url ||
  brandingStore.displayLogoUrl ||
  null
);

const loading = ref(false);
const teams = ref([]);
const selectedTeamId = ref(null);

const orgId = computed(() => {
  const id = Number(agencyStore.currentAgency?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const orgSlug = computed(() => {
  const fromRoute = String(route.params?.organizationSlug || '').trim();
  if (fromRoute) return fromRoute;
  const a = agencyStore.currentAgency;
  return String(a?.slug || a?.portal_url || a?.portalUrl || '').trim() || null;
});

const clubDisplayName = computed(() => String(agencyStore.currentAgency?.name || '').trim() || 'Club');

const clubLogoSrc = computed(() => {
  const a = agencyStore.currentAgency;
  if (!a?.id) return null;
  const t = String(a.organization_type || a.organizationType || '').toLowerCase();
  if (t !== 'affiliation') return null;
  if (a.logo_path) return toUploadsUrl(a.logo_path);
  if (a.icon_file_path) return toUploadsUrl(a.icon_file_path);
  if (a.logo_url && /^https?:\/\//i.test(String(a.logo_url))) return String(a.logo_url);
  return null;
});

function storageKey() {
  return orgId.value ? `sstcContextTeamId:${orgId.value}` : null;
}

const teamOptions = computed(() =>
  (teams.value || []).map((t, i) => ({
    key: `${t.teamId}-${t.challengeId}-${i}`,
    teamId: t.teamId,
    teamName: t.teamName,
    label: `${t.teamName} · ${t.challengeName || 'Season'}`
  }))
);

const selectedTeam = computed(() => {
  const id = selectedTeamId.value;
  if (id == null) return teams.value[0] || null;
  return (teams.value || []).find((t) => Number(t.teamId) === Number(id)) || null;
});

function challengeLink(row) {
  if (!row?.challengeId || !orgSlug.value) return null;
  return `/${orgSlug.value}/season/${row.challengeId}`;
}

async function loadSummary() {
  if (!props.visible) {
    teams.value = [];
    selectedTeamId.value = null;
    return;
  }
  loading.value = true;
  try {
    let list = [];
    if (orgId.value) {
      const r = await api.get('/learning-program-classes/my/summary', {
        params: { organizationId: orgId.value },
        skipGlobalLoading: true
      });
      list = Array.isArray(r.data?.teams) ? r.data.teams : [];
    }
    const summitPlatformPath = isSummitPlatformRouteSlug(String(route.params?.organizationSlug || ''));
    if (!list.length && !summitPlatformPath) {
      const rAll = await api.get('/learning-program-classes/my/summary', { skipGlobalLoading: true });
      list = Array.isArray(rAll.data?.teams) ? rAll.data.teams : [];
    }
    teams.value = list;
    const key = storageKey();
    let nextId = null;
    if (key) {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const want = Number(raw);
        if (list.some((t) => Number(t.teamId) === want)) nextId = want;
      }
    }
    if (nextId == null && list.length) nextId = Number(list[0].teamId);
    selectedTeamId.value = nextId;
  } catch {
    teams.value = [];
    selectedTeamId.value = null;
  } finally {
    loading.value = false;
  }
}

watch(selectedTeamId, (id) => {
  const key = storageKey();
  if (!key || id == null) return;
  try { sessionStorage.setItem(key, String(id)); } catch { /* ignore */ }
});

watch(
  () => [props.visible, orgId.value],
  () => { loadSummary(); },
  { immediate: true }
);
</script>

<style scoped>
/* Slide-in transition */
.sstc-bar-slide-enter-active,
.sstc-bar-slide-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.sstc-bar-slide-enter-from,
.sstc-bar-slide-leave-to {
  max-height: 0;
  opacity: 0;
}
.sstc-bar-slide-enter-to,
.sstc-bar-slide-leave-from {
  max-height: 80px;
  opacity: 1;
}

.sstc-context-bar {
  width: 100%;
  flex-shrink: 0;
  background: linear-gradient(
    to bottom,
    rgba(30, 58, 138, 0.07),
    rgba(30, 58, 138, 0.03)
  );
  border-bottom: 2px solid var(--accent, #f97316);
  box-sizing: border-box;
  overflow: hidden;
}

.sstc-context-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  padding: 8px 28px;
  min-width: 0;
  max-width: 100%;
}

/* ── Club block ─────────────────────────────── */
.sstc-club-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 1;
}

.sstc-club-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(30, 58, 138, 0.2);
  background: #fff;
  flex-shrink: 0;
}

.sstc-club-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--primary, #1e3a8a);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
  min-width: 0;
  max-width: none;
}

/* ── Pill badges (Club / Team labels) ────────── */
.sstc-pill-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(30, 58, 138, 0.1);
  color: var(--primary, #1e3a8a);
  border: 1px solid rgba(30, 58, 138, 0.2);
}

.sstc-pill-badge--team {
  background: rgba(249, 115, 22, 0.1);
  color: #c2570a;
  border-color: rgba(249, 115, 22, 0.28);
}

/* ── Vertical separator ───────────────────── */
.sstc-separator {
  width: 1px;
  height: 28px;
  background: rgba(30, 58, 138, 0.18);
  flex-shrink: 0;
  border-radius: 1px;
}

/* ── Team block ───────────────────────────── */
.sstc-team-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 1;
}

.sstc-team-name {
  font-size: 15px;
  font-weight: 700;
  color: #c2570a;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sstc-muted {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  font-style: italic;
}

/* ── Team dropdown ────────────────────────── */
.sstc-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.sstc-team-select {
  appearance: none;
  -webkit-appearance: none;
  min-width: 140px;
  max-width: 220px;
  padding: 5px 28px 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(30, 58, 138, 0.22);
  background: #fff;
  color: var(--primary, #1e3a8a);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  outline-offset: 2px;
}

.sstc-team-select:focus {
  outline: 2px solid var(--accent, #f97316);
  border-color: transparent;
}

.sstc-select-caret {
  position: absolute;
  right: 9px;
  pointer-events: none;
  font-size: 11px;
  color: var(--primary, #1e3a8a);
  opacity: 0.6;
}

/* ── Season / challenge ──────────────────── */
.sstc-season-block {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 1;
  min-width: 0;
}

.sstc-season-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.sstc-season-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.sstc-challenge-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 7px;
  border: 1.5px solid var(--accent, #f97316);
  background: transparent;
  color: #c2570a;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.sstc-challenge-btn:hover {
  background: var(--accent, #f97316);
  color: #fff;
}

/* ── Skeleton / loading states ───────────── */
.sstc-skeleton {
  display: inline-block;
  width: 120px;
  height: 16px;
  border-radius: 6px;
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: sstc-shimmer 1.4s infinite;
}

@keyframes sstc-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.sstc-loading-logo {
  height: 22px;
  width: auto;
  max-width: 80px;
  object-fit: contain;
  opacity: 0.75;
  animation: sstc-spin 1.1s linear infinite;
  transform-origin: center;
}

@keyframes sstc-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Responsive ──────────────────────────── */
@media (max-width: 640px) {
  .sstc-context-inner {
    padding: 8px 16px;
    gap: 6px 14px;
  }

  .sstc-separator {
    display: none;
  }

  .sstc-season-block {
    width: 100%;
    margin-left: 0;
    margin-top: 2px;
    flex-wrap: wrap;
  }

  .sstc-team-name {
    max-width: 180px;
  }

  .sstc-club-block {
    flex: 1 1 100%;
    min-width: 0;
  }

  .sstc-club-name {
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
  }
}
</style>
