<template>
  <div class="staff-card top-snapshot-wrap">
    <div class="top-snapshot-head" @click="openModal">
      <img
        v-if="iconUrl"
        :src="iconUrl"
        alt=""
        class="staff-card-icon"
        aria-hidden="true"
      />
      <div class="top-snapshot-title">Your Team</div>
      <span class="top-snapshot-toggle">Open</span>
    </div>
    <div v-if="!modalOpen" class="staff-card-preview" @click="openModal">
      <div v-if="loading" class="staff-preview-loading">Loading…</div>
      <div v-else class="staff-avatar-strip">
        <div
          v-for="person in previewPeople"
          :key="person.id"
          class="staff-avatar"
          :title="person.displayName"
        >
          <img
            v-if="person.profilePhotoUrl"
            :src="person.profilePhotoUrl"
            :alt="person.displayName"
            loading="lazy"
          />
          <span v-else class="staff-avatar-initial">{{ avatarInitial(person) }}</span>
        </div>
        <span v-if="coworkerCount > previewLimit" class="staff-more">+{{ coworkerCount - previewLimit }}</span>
      </div>
    </div>
    <CoworkerModal
      v-if="modalOpen"
      :agency-id="agencyId"
      :coworkers="coworkers"
      :management="management"
      :peers="peers"
      @close="modalOpen = false"
    />
  </div>
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
.staff-card-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  margin-right: 8px;
  flex-shrink: 0;
}

.top-snapshot-head {
  display: flex;
  align-items: center;
}

.staff-card-preview {
  cursor: pointer;
  padding: 8px 0;
}

.staff-preview-loading {
  font-size: 13px;
  color: var(--muted, #666);
}

.staff-avatar-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.staff-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--gray-200, #e5e7eb);
  flex-shrink: 0;
}

.staff-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.staff-avatar-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-600, #4b5563);
}

.staff-more {
  font-size: 12px;
  color: var(--muted, #666);
  margin-left: 2px;
}
</style>
