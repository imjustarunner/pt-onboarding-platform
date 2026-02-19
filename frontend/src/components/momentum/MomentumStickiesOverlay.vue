<template>
  <div class="momentum-stickies-overlay" ref="overlayRef" @dragover.prevent @drop="onDrop">
    <MomentumStickyCard
      v-for="sticky in stickies"
      :key="sticky.id"
      :sticky="sticky"
      :user-id="userId"
      @update="(patch) => updateSticky(sticky, patch)"
      @delete="() => deleteSticky(sticky)"
      @add-entry="() => addEntry(sticky)"
      @update-entry="(entry) => updateEntry(sticky, entry)"
      @delete-entry="(entry) => deleteEntry(sticky, entry)"
      @promote-entry="(entry) => promoteEntry(sticky, entry)"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useMomentumStickiesStore } from '../../store/momentumStickies';
import MomentumStickyCard from './MomentumStickyCard.vue';

const authStore = useAuthStore();
const momentumStore = useMomentumStickiesStore();
const userId = computed(() => authStore.user?.id ?? null);
const stickies = ref([]);
const overlayRef = ref(null);
const loading = ref(false);

watch(userId, (id) => {
  if (id) fetchStickies();
}, { immediate: true });

watch(() => momentumStore.createNewStickyRequest, () => {
  createSticky();
});

watch(() => momentumStore.pendingConvertList, async (items) => {
  if (!items?.length || !userId.value) return;
  momentumStore.clearPendingConvertList();
  try {
    const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
      title: 'Focus list',
      position_x: 80 + stickies.value.length * 40,
      position_y: 80 + stickies.value.length * 40
    });
    for (const text of items) {
      const t = String(text || '').trim();
      if (t) {
        await api.post(`/users/${userId.value}/momentum-stickies/${data.id}/entries`, {
          text: t,
          is_expanded: true
        });
      }
    }
    await fetchStickies();
  } catch (err) {
    console.error('Failed to convert list to sticky:', err);
  }
});

watch(() => momentumStore.pendingAddText, async (text) => {
  if (!text || !userId.value) return;
  momentumStore.clearPendingAdd();
  try {
    if (stickies.value.length === 0) {
      const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
        title: 'Quick capture',
        position_x: 80,
        position_y: 80
      });
      await api.post(`/users/${userId.value}/momentum-stickies/${data.id}/entries`, {
        text,
        is_expanded: true
      });
    } else {
      const first = stickies.value[0];
      await api.post(`/users/${userId.value}/momentum-stickies/${first.id}/entries`, {
        text,
        is_expanded: true
      });
    }
    await fetchStickies();
  } catch (err) {
    console.error('Failed to add to sticky:', err);
  }
});

const fetchStickies = async () => {
  if (!userId.value) return;
  try {
    loading.value = true;
    const { data } = await api.get(`/users/${userId.value}/momentum-stickies`);
    stickies.value = data || [];
  } catch (err) {
    console.error('Failed to fetch Momentum Stickies:', err);
  } finally {
    loading.value = false;
  }
};

const createSticky = async () => {
  if (!userId.value) return;
  try {
    const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
      title: 'New Sticky',
      position_x: 80 + stickies.value.length * 40,
      position_y: 80 + stickies.value.length * 40
    });
    stickies.value = [...stickies.value, data];
  } catch (err) {
    console.error('Failed to create Momentum Sticky:', err);
  }
};

const updateSticky = async (sticky, patch) => {
  if (!userId.value) return;
  try {
    const { data } = await api.patch(`/users/${userId.value}/momentum-stickies/${sticky.id}`, patch);
    const idx = stickies.value.findIndex((s) => s.id === sticky.id);
    if (idx >= 0) stickies.value[idx] = data;
  } catch (err) {
    console.error('Failed to update Momentum Sticky:', err);
  }
};

const deleteSticky = async (sticky) => {
  if (!userId.value) return;
  try {
    await api.delete(`/users/${userId.value}/momentum-stickies/${sticky.id}`);
    stickies.value = stickies.value.filter((s) => s.id !== sticky.id);
  } catch (err) {
    console.error('Failed to delete Momentum Sticky:', err);
  }
};

const addEntry = async (sticky) => {
  if (!userId.value) return;
  try {
    const { data } = await api.post(`/users/${userId.value}/momentum-stickies/${sticky.id}/entries`, {
      text: '',
      is_expanded: true
    });
    const s = stickies.value.find((x) => x.id === sticky.id);
    if (s) s.entries = [...(s.entries || []), data];
  } catch (err) {
    console.error('Failed to add entry:', err);
  }
};

const updateEntry = async (sticky, entry) => {
  if (!userId.value) return;
  try {
    const { data } = await api.patch(
      `/users/${userId.value}/momentum-stickies/${sticky.id}/entries/${entry.id}`,
      { text: entry.text, is_checked: entry.is_checked, is_expanded: entry.is_expanded }
    );
    const s = stickies.value.find((x) => x.id === sticky.id);
    if (s?.entries) {
      const i = s.entries.findIndex((e) => e.id === entry.id);
      if (i >= 0) s.entries[i] = data;
    }
  } catch (err) {
    console.error('Failed to update entry:', err);
  }
};

const deleteEntry = async (sticky, entry) => {
  if (!userId.value) return;
  try {
    await api.delete(`/users/${userId.value}/momentum-stickies/${sticky.id}/entries/${entry.id}`);
    const s = stickies.value.find((x) => x.id === sticky.id);
    if (s?.entries) s.entries = s.entries.filter((e) => e.id !== entry.id);
  } catch (err) {
    console.error('Failed to delete entry:', err);
  }
};

const promoteEntry = async (sticky, entry) => {
  if (!userId.value) return;
  try {
    const { data } = await api.post(
      `/users/${userId.value}/momentum-stickies/${sticky.id}/entries/${entry.id}/promote-to-task`,
      { markChecked: true }
    );
    if (data?.entryUpdated) {
      const s = stickies.value.find((x) => x.id === sticky.id);
      if (s?.entries) {
        const i = s.entries.findIndex((e) => e.id === entry.id);
        if (i >= 0) s.entries[i] = { ...s.entries[i], is_checked: true };
      }
    }
  } catch (err) {
    console.error('Failed to promote entry to task:', err);
  }
};

const onDrop = (e) => {
  e.preventDefault();
  const stickyId = parseInt(e.dataTransfer?.getData('text/plain'), 10);
  if (!stickyId) return;
  const sticky = stickies.value.find((s) => s.id === stickyId);
  if (!sticky) return;
  const positionX = Math.max(8, e.clientX - 110);
  const positionY = Math.max(8, e.clientY - 24);
  updateSticky(sticky, { position_x: positionX, position_y: positionY });
};

onMounted(() => {
  if (userId.value) fetchStickies();
});
</script>

<style scoped>
.momentum-stickies-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
}

.momentum-stickies-overlay > * {
  pointer-events: auto;
}
</style>
