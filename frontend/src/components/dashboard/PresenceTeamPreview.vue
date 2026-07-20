<template>
  <div class="presence-preview" :class="{ 'presence-preview--card': !embedded }">
    <div class="presence-preview-header">
      <div>
        <span class="presence-preview-title">{{ title }}</span>
        <p class="presence-preview-legend">
          <span class="leg"><i class="dot-available" /> Available</span>
          <span class="leg"><i class="dot-away-reachable" /> Away · reachable</span>
          <span class="leg"><i class="dot-unavailable" /> Unavailable</span>
          <span class="leg"><i class="dot-available-offline" /> Available · logged out</span>
        </p>
      </div>
      <router-link :to="boardTo" class="presence-preview-link">View full board</router-link>
    </div>
    <div v-if="loading" class="presence-preview-loading">Loading…</div>
    <div v-else-if="error" class="presence-preview-error">{{ error }}</div>
    <div v-else-if="!people.length" class="presence-preview-loading">No team presence yet</div>
    <div v-else class="presence-preview-grid">
      <div
        v-for="person in people"
        :key="person.id"
        class="person-tile"
        @mouseenter="hoveredId = person.id"
        @mouseleave="hoveredId = null"
        @focusin="hoveredId = person.id"
        @focusout="hoveredId = null"
        tabindex="0"
      >
        <div class="avatar-wrap">
          <div class="avatar" :class="{ 'has-photo': person.profile_photo_url }">
            <img
              v-if="person.profile_photo_url"
              :src="avatarUrl(person.profile_photo_url)"
              :alt="person.display_name"
              class="avatar-img"
              loading="lazy"
            />
            <span v-else class="avatar-initial">{{ avatarInitial(person) }}</span>
          </div>
          <span class="status-dot" :class="dotClass(person)" aria-hidden="true" />
        </div>
        <span class="person-name">{{ shortName(person) }}</span>
        <span class="person-band">{{ bandLabel(person) }}</span>

        <div v-if="hoveredId === person.id" class="person-popover" role="tooltip">
          <strong>{{ person.display_name || shortName(person) }}</strong>
          <ul>
            <li v-for="(line, i) in detailLines(person)" :key="i">{{ line }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  availabilityBandForPerson,
  availabilityBandLabel,
  presenceDetailLines,
  presenceDotClassForPerson,
  presenceSortRankForPerson
} from '../../utils/presenceStatus';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  boardTo: { type: String, default: '/admin/presence' },
  title: { type: String, default: 'Team Presence' },
  limit: { type: Number, default: 36 },
  embedded: { type: Boolean, default: false }
});

const POLL_INTERVAL_MS = 15 * 1000;
let pollTimer = null;

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const loading = ref(true);
const error = ref('');
const peopleRaw = ref([]);
const hoveredId = ref(null);

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSuperAdmin = computed(() => role.value === 'super_admin');

const resolvedAgencyId = computed(() => {
  const fromProp = props.agencyId != null && props.agencyId !== ''
    ? Number(props.agencyId)
    : null;
  if (Number.isFinite(fromProp) && fromProp > 0) return fromProp;
  const fromStore = Number(agencyStore.currentAgency?.id);
  return Number.isFinite(fromStore) && fromStore > 0 ? fromStore : null;
});

const people = computed(() => {
  const list = Array.isArray(peopleRaw.value) ? [...peopleRaw.value] : [];
  list.sort((a, b) => {
    const rank = presenceSortRankForPerson(a) - presenceSortRankForPerson(b);
    if (rank !== 0) return rank;
    return String(a.display_name || '').localeCompare(String(b.display_name || ''));
  });
  const lim = Number(props.limit);
  if (Number.isFinite(lim) && lim > 0) return list.slice(0, lim);
  return list;
});

const avatarUrl = (rel) => toUploadsUrl(rel);

const avatarInitial = (p) => {
  const f = String(p.first_name || '').trim();
  const l = String(p.last_name || '').trim();
  return `${f ? f[0] : ''}${l ? l[0] : ''}`.toUpperCase() || '?';
};

const shortName = (p) => {
  const f = String(p.first_name || '').trim();
  const l = String(p.last_name || '').trim();
  if (f && l) return `${f} ${l[0]}.`;
  return f || l || p.display_name || '—';
};

const bandLabel = (p) => availabilityBandLabel(availabilityBandForPerson(p));
const dotClass = (p) => presenceDotClassForPerson(p);
const detailLines = (p) => presenceDetailLines(p);

const fetchPresence = async (showLoading = true) => {
  try {
    if (showLoading) loading.value = true;
    error.value = '';
    const agencyId = resolvedAgencyId.value;
    const url = agencyId
      ? `/presence/agency/${agencyId}/team`
      : (isSuperAdmin.value ? '/presence' : null);
    if (!url) {
      error.value = 'Select a tenant to view team presence';
      peopleRaw.value = [];
      return;
    }
    const res = await api.get(url, { skipGlobalLoading: true });
    peopleRaw.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
    peopleRaw.value = [];
  } finally {
    loading.value = false;
  }
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') fetchPresence(false);
};

watch(resolvedAgencyId, () => fetchPresence(true));

onMounted(() => {
  fetchPresence(true);
  pollTimer = setInterval(() => fetchPresence(false), POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<style scoped>
.presence-preview {
  background: transparent;
  border-radius: 0;
  border: none;
  padding: 0;
  box-shadow: none;
}

.presence-preview--card {
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 18px 20px 20px;
  box-shadow: var(--shadow, 0 8px 24px rgba(15, 23, 42, 0.06));
}

.presence-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.presence-preview-title {
  display: block;
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--ops-primary, var(--primary, #1f6b4a));
  margin-bottom: 6px;
}

.presence-preview-legend {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.leg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.leg i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}

.presence-preview-link {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ops-primary, var(--primary, #1f6b4a));
  text-decoration: none;
  white-space: nowrap;
}

.presence-preview-link:hover {
  text-decoration: underline;
}

.presence-preview-loading,
.presence-preview-error {
  font-size: 0.9rem;
  color: var(--text-secondary, #64748b);
  padding: 12px 0;
}

.presence-preview-error {
  color: var(--danger, #b91c1c);
}

.presence-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 14px 10px;
}

.person-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px 8px;
  border-radius: 14px;
  cursor: default;
  outline: none;
}

.person-tile:hover,
.person-tile:focus-visible {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 6%, #fff);
}

.avatar-wrap {
  position: relative;
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-alt, #f1f5f9);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-secondary, #64748b);
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.1);
}

.person-name {
  font-size: 12px;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-band {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-align: center;
  line-height: 1.2;
}

.person-popover {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  z-index: 5;
  min-width: 180px;
  max-width: 240px;
  padding: 10px 12px;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.28);
  pointer-events: none;
}

.person-popover strong {
  display: block;
  font-size: 13px;
  margin-bottom: 6px;
}

.person-popover ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.person-popover li {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.35;
}

.person-popover li + li {
  margin-top: 2px;
}

.dot-available,
.status-dot.dot-available { background: #16a34a; }
.dot-away-reachable,
.status-dot.dot-away-reachable { background: #eab308; }
.dot-unavailable,
.status-dot.dot-unavailable { background: #dc2626; }
.dot-available-offline,
.status-dot.dot-available-offline { background: #0ea5e9; }
.dot-offline,
.status-dot.dot-offline { background: #94a3b8; }
</style>
