<template>
  <div v-if="canRender" class="promo-rail" aria-live="polite" aria-atomic="true">
    <button
      v-if="!toastVisible && !expanded"
      type="button"
      class="promo-reveal-btn"
      @click="expanded = true"
      @mouseenter="setHovering(true)"
      @mouseleave="setHovering(false)"
    >
      Upcoming events ({{ items.length }})
    </button>

    <div
      v-if="toastVisible && activeItem && !expanded"
      class="promo-toast"
      @mouseenter="setHovering(true)"
      @mouseleave="setHovering(false)"
    >
      <div class="promo-toast-title">Upcoming internal registration</div>
      <div class="promo-item-title">{{ activeItem.title }}</div>
      <div class="promo-item-meta">
        {{ formatWhen(activeItem.startsAt, activeItem.endsAt) }}
      </div>
      <div class="promo-actions">
        <a
          v-if="activeItem.registrationUrl"
          :href="activeItem.registrationUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-primary btn-sm"
        >
          Open
        </a>
        <button type="button" class="btn btn-secondary btn-sm" @click="copyLink(activeItem)">
          {{ copiedId === activeItem.id ? 'Copied' : 'Copy link' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="expanded = true">
          All
        </button>
      </div>
    </div>

    <div
      v-if="expanded"
      class="promo-panel"
      @mouseenter="setHovering(true)"
      @mouseleave="setHovering(false)"
    >
      <div class="promo-panel-head">
        <div>
          <div class="promo-panel-title">Upcoming registrations</div>
          <div class="promo-panel-sub">Share links with guardians quickly.</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="expanded = false">Close</button>
      </div>
      <ul class="promo-list">
        <li v-for="item in items" :key="`promo-${item.id}`" class="promo-list-row">
          <div class="promo-list-meta">
            <div class="promo-item-title">{{ item.title }}</div>
            <div class="promo-item-meta">{{ formatWhen(item.startsAt, item.endsAt) }}</div>
          </div>
          <div class="promo-actions">
            <a
              v-if="item.registrationUrl"
              :href="item.registrationUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-primary btn-sm"
            >
              Open
            </a>
            <button type="button" class="btn btn-secondary btn-sm" @click="copyLink(item)">
              {{ copiedId === item.id ? 'Copied' : 'Copy link' }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { buildPublicIntakeUrl } from '../utils/publicIntakeUrl';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const items = ref([]);
const currentIndex = ref(0);
const toastVisible = ref(true);
const expanded = ref(false);
const hovering = ref(false);
const copiedId = ref(null);

let cycleTimer = null;
let pollTimer = null;
let copyTimer = null;

const eligibleRole = computed(() => {
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  return role === 'provider' || role === 'provider_plus' || role === 'school_staff';
});

const currentAgencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const operationalAgencyId = computed(() => {
  const current = agencyStore.currentAgency || null;
  const currentType = String(current?.organization_type || current?.organizationType || 'agency').toLowerCase();
  if (currentType === 'agency' && Number(current?.id || 0) > 0) return Number(current.id);
  if (['school', 'program', 'learning', 'clinical'].includes(currentType)) {
    const parent = Number(current?.affiliated_agency_id || current?.affiliatedAgencyId || 0);
    if (parent > 0) return parent;
  }
  const list = agencyStore.userAgencies || [];
  const fallback = list.find((a) => String(a?.organization_type || a?.organizationType || 'agency').toLowerCase() === 'agency');
  return fallback?.id ? Number(fallback.id) : null;
});
const routePath = computed(() => String(route.path || '').toLowerCase());
const routeBlocked = computed(() => {
  const p = routePath.value;
  return p.includes('/login') || p.includes('/guardian') || p.includes('/public/');
});

const canRender = computed(() => {
  return !!authStore.isAuthenticated && eligibleRole.value && !!operationalAgencyId.value && !routeBlocked.value && items.value.length > 0;
});

const activeItem = computed(() => {
  if (!items.value.length) return null;
  const idx = Math.max(0, Math.min(items.value.length - 1, Number(currentIndex.value || 0)));
  return items.value[idx] || null;
});

function clearCycle() {
  if (cycleTimer) {
    clearTimeout(cycleTimer);
    cycleTimer = null;
  }
}

function scheduleCycle() {
  clearCycle();
  if (!canRender.value || hovering.value || expanded.value || items.value.length <= 1) return;

  cycleTimer = setTimeout(() => {
    toastVisible.value = false;
    cycleTimer = setTimeout(() => {
      if (!items.value.length) return;
      currentIndex.value = (currentIndex.value + 1) % items.value.length;
      toastVisible.value = true;
      scheduleCycle();
    }, 1400);
  }, 5200);
}

function setHovering(next) {
  hovering.value = !!next;
  if (hovering.value) clearCycle();
  else scheduleCycle();
}

function normalizeItems(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const key = String(row?.intakePublicKey || '').trim();
      if (!key) return null;
      return {
        id: Number(row?.id || 0),
        title: String(row?.title || '').trim() || 'Upcoming event',
        startsAt: row?.startsAt || null,
        endsAt: row?.endsAt || null,
        intakePublicKey: key,
        registrationUrl: buildPublicIntakeUrl(key)
      };
    })
    .filter(Boolean);
}

async function loadFeed() {
  const agencyId = operationalAgencyId.value;
  if (!agencyId || !eligibleRole.value || routeBlocked.value) {
    items.value = [];
    clearCycle();
    return;
  }
  try {
    const { data } = await api.get(`/agencies/${agencyId}/company-events/internal-registration-feed`, { skipGlobalLoading: true });
    items.value = normalizeItems(data?.items);
    if (currentIndex.value >= items.value.length) currentIndex.value = 0;
    toastVisible.value = true;
    scheduleCycle();
  } catch {
    items.value = [];
    clearCycle();
  }
}

function formatWhen(startsAt, endsAt) {
  const a = startsAt ? new Date(startsAt) : null;
  const b = endsAt ? new Date(endsAt) : null;
  const opts = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    if (a && Number.isFinite(a.getTime()) && b && Number.isFinite(b.getTime())) {
      return `${a.toLocaleString(undefined, opts)} - ${b.toLocaleString(undefined, opts)}`;
    }
    if (a && Number.isFinite(a.getTime())) return a.toLocaleString(undefined, opts);
  } catch {
    // ignore
  }
  return 'Upcoming';
}

async function copyLink(item) {
  const url = String(item?.registrationUrl || '').trim();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copiedId.value = Number(item.id || 0) || null;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedId.value = null;
    }, 1800);
  } catch {
    copiedId.value = null;
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    loadFeed();
  }, 120000);
}

onMounted(async () => {
  await loadFeed();
  startPolling();
});

onUnmounted(() => {
  clearCycle();
  if (pollTimer) clearInterval(pollTimer);
  if (copyTimer) clearTimeout(copyTimer);
});

watch([currentAgencyId, operationalAgencyId, eligibleRole, routeBlocked], () => {
  loadFeed();
});

watch([canRender, hovering, expanded, () => items.value.length], () => {
  scheduleCycle();
});
</script>

<style scoped>
.promo-rail {
  position: fixed;
  right: 14px;
  top: 110px;
  z-index: 80;
  width: 340px;
  max-width: calc(100vw - 28px);
}

.promo-toast,
.promo-panel {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 12px;
}

.promo-toast-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.promo-item-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
}

.promo-item-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 3px;
}

.promo-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.promo-reveal-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  background: #fff;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.promo-panel {
  max-height: min(65vh, 620px);
  overflow: auto;
}

.promo-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.promo-panel-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.promo-panel-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.promo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.promo-list-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
  padding: 10px;
}

@media (max-width: 800px) {
  .promo-rail {
    top: auto;
    bottom: 14px;
    right: 10px;
    width: min(340px, calc(100vw - 20px));
  }
}
</style>
