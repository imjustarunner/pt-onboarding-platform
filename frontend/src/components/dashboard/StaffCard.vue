<template>
  <button
    type="button"
    class="staff-pill"
    :aria-label="`Your Team — ${coworkerCount} members`"
    @click="openModal"
  >
    <div v-if="loading" class="staff-pill-loading">Loading team…</div>
    <template v-else>
      <div class="staff-pill-avatars">
        <div
          v-for="person in previewPeople"
          :key="person.id"
          class="staff-pill-avatar"
          :title="person.displayName"
        >
          <img
            v-if="person.profilePhotoUrl"
            :src="person.profilePhotoUrl"
            :alt="person.displayName"
            loading="lazy"
          />
          <span v-else class="staff-pill-initial">{{ avatarInitial(person) }}</span>
        </div>
      </div>
      <div class="staff-pill-meta">
        <span class="staff-pill-label">Your Team</span>
        <span class="staff-pill-count">{{ coworkerCount }} member{{ coworkerCount === 1 ? '' : 's' }}</span>
      </div>
    </template>
  </button>

  <CoworkerModal
    v-if="modalOpen"
    :agency-id="agencyId"
    :coworkers="coworkers"
    :management="management"
    :peers="peers"
    @close="modalOpen = false"
  />
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import CoworkerModal from './CoworkerModal.vue';

const props = defineProps({
  agencyId: { type: Number, default: null },
  iconUrl: { type: String, default: null }
});

const PREVIEW_LIMIT = 6;

const modalOpen = ref(false);
const loading = ref(false);
const coworkers = ref([]);
const management = ref([]);
const peers = ref([]);

const coworkerCount = computed(() => coworkers.value.length);
const previewPeople = computed(() => {
  const all = [...management.value, ...peers.value];
  return all.slice(0, PREVIEW_LIMIT);
});
const previewLimit = computed(() => PREVIEW_LIMIT);

const avatarInitial = (p) => {
  const f = String(p.firstName || '').trim();
  const l = String(p.lastName || '').trim();
  return `${f ? f[0] : ''}${l ? l[0] : ''}`.toUpperCase() || '?';
};

const fetchCoworkers = async () => {
  if (!props.agencyId) return;
  loading.value = true;
  try {
    const res = await api.get('/staff/coworkers', { params: { agencyId: props.agencyId } });
    coworkers.value = res.data?.coworkers || [];
    management.value = res.data?.management || [];
    peers.value = res.data?.peers || [];
  } catch {
    coworkers.value = [];
    management.value = [];
    peers.value = [];
  } finally {
    loading.value = false;
  }
};

const openModal = () => {
  modalOpen.value = true;
  if (coworkers.value.length === 0) fetchCoworkers();
};

watch(
  () => props.agencyId,
  (id) => {
    if (id) fetchCoworkers();
    else {
      coworkers.value = [];
      management.value = [];
      peers.value = [];
    }
  },
  { immediate: true }
);
</script>

<style scoped>
/* Compact clickable pill */
.staff-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s, border-color 0.15s;
}
.staff-pill:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}

.staff-pill-loading {
  font-size: 12px;
  color: var(--muted, #9ca3af);
}

/* Stacked overlapping avatars */
.staff-pill-avatars {
  display: flex;
  flex-direction: row;
}

.staff-pill-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--gray-200, #e5e7eb);
  border: 2px solid #fff;
  flex-shrink: 0;
  margin-left: -8px;
}
.staff-pill-avatar:first-child {
  margin-left: 0;
}

.staff-pill-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.staff-pill-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  font-weight: 700;
  color: var(--gray-600, #4b5563);
}

/* Label + count */
.staff-pill-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.staff-pill-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  white-space: nowrap;
}

.staff-pill-count {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}
</style>
