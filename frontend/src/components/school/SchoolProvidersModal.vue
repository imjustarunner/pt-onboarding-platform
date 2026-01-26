<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2 style="margin: 0;">Providers</h2>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>

      <div v-if="providers.length === 0" class="empty-state">
        No providers found for this school.
      </div>

      <div v-else class="providers-grid">
        <button
          v-for="p in providersSorted"
          :key="p.provider_user_id"
          class="provider-tile"
          type="button"
          @click="selectedProviderId = Number(p.provider_user_id)"
          :class="{ active: Number(p.provider_user_id) === Number(selectedProviderId) }"
        >
          <div class="avatar" aria-hidden="true">
            <img
              v-if="providerPhotoUrl(p)"
              :src="providerPhotoUrl(p)"
              alt=""
              class="avatar-img"
            />
            <span v-else>{{ initialsFor(p) }}</span>
          </div>
          <div class="tile-meta">
            <div class="name">{{ p.first_name }} {{ p.last_name }}</div>
            <div class="sub">
              <span class="badge badge-secondary">{{ p.accepting_new_clients === false ? 'Closed' : 'Open' }}</span>
              <span
                v-if="totalSlotsFor(p) !== null"
                class="badge badge-secondary"
                :style="isOverbooked(p) ? 'background: rgba(217,45,32,0.12); color: var(--danger, #d92d20); border: 1px solid rgba(217,45,32,0.28);' : ''"
              >
                {{ availableSlotsFor(p) }} / {{ totalSlotsFor(p) }} slots
              </span>
            </div>
          </div>
        </button>
      </div>

      <div v-if="selectedProvider" class="details">
        <h3 style="margin: 0 0 10px 0;">This week</h3>
        <div class="assignments">
          <div v-for="a in assignmentsSorted" :key="a.day_of_week" class="assignment-row">
            <div class="day"><strong>{{ a.day_of_week }}</strong></div>
            <div class="badges">
              <span
                class="badge badge-secondary"
                :style="Number(a.slots_available) < 0 ? 'background: rgba(217,45,32,0.12); color: var(--danger, #d92d20); border: 1px solid rgba(217,45,32,0.28);' : ''"
              >
                {{ a.slots_available }} / {{ a.slots_total }} slots
              </span>
              <span v-if="a.start_time || a.end_time" class="badge badge-secondary">
                {{ a.start_time || '—' }}–{{ a.end_time || '—' }}
              </span>
            </div>
          </div>
          <div v-if="assignmentsSorted.length === 0" class="muted">No active assignments.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  providers: { type: Array, default: () => [] },
  preselectProviderUserId: { type: Number, default: null }
});

defineEmits(['close']);

const selectedProviderId = ref(null);

const uploadsBase = computed(() => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return baseURL.replace('/api', '') || 'http://localhost:3000';
});

watch(
  () => props.preselectProviderUserId,
  (v) => {
    if (v) selectedProviderId.value = Number(v);
    else if (!selectedProviderId.value && props.providers?.[0]?.provider_user_id) {
      selectedProviderId.value = Number(props.providers[0].provider_user_id);
    }
  },
  { immediate: true }
);

watch(
  () => props.providers,
  (list) => {
    if (!selectedProviderId.value && list?.[0]?.provider_user_id) {
      selectedProviderId.value = Number(list[0].provider_user_id);
    }
  },
  { immediate: true }
);

const providersSorted = computed(() => {
  const list = Array.isArray(props.providers) ? props.providers : [];
  return [...list].sort((a, b) => String(a?.last_name || '').localeCompare(String(b?.last_name || '')));
});

const selectedProvider = computed(() => {
  const id = Number(selectedProviderId.value || 0);
  if (!id) return null;
  return providersSorted.value.find((p) => Number(p?.provider_user_id) === id) || null;
});

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const assignmentsSorted = computed(() => {
  const list = Array.isArray(selectedProvider.value?.assignments) ? selectedProvider.value.assignments : [];
  return list
    .filter((a) => a && a.is_active)
    .slice()
    .sort((a, b) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week));
});

const initialsFor = (p) => {
  const f = String(p?.first_name || '').trim();
  const l = String(p?.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'P';
};

const providerPhotoUrl = (p) => {
  const rel = p?.profile_photo_url || null;
  if (!rel) return null;
  return `${uploadsBase.value}${String(rel).startsWith('/') ? rel : `/${rel}`}`;
};

const totalSlotsFor = (p) => {
  const list = Array.isArray(p?.assignments) ? p.assignments : [];
  const active = list.filter((a) => a && a.is_active);
  if (active.length === 0) return null;
  return active.reduce((sum, a) => sum + Number(a?.slots_total || 0), 0);
};

const availableSlotsFor = (p) => {
  const list = Array.isArray(p?.assignments) ? p.assignments : [];
  const active = list.filter((a) => a && a.is_active);
  if (active.length === 0) return 0;
  return active.reduce((sum, a) => sum + Number(a?.slots_available || 0), 0);
};

const isOverbooked = (p) => {
  const list = Array.isArray(p?.assignments) ? p.assignments : [];
  return list.some((a) => a && a.is_active && Number(a.slots_available) < 0);
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 1000;
}

.modal-content {
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  overflow: auto;
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  padding: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.provider-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: white;
  text-align: left;
}

.provider-tile.active {
  border-color: rgba(79, 70, 229, 0.6);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-weight: 800;
  color: var(--text-primary);
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.name {
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}

.sub {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.details {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.assignments {
  display: grid;
  gap: 8px;
}

.assignment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}

.badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.muted {
  color: var(--text-secondary);
}
</style>

