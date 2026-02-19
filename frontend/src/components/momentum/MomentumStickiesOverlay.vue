<template>
  <div class="momentum-stickies-overlay" :class="{ collapsed: overlayCollapsed }">
    <div class="stickies-bar" @click="overlayCollapsed && (overlayCollapsed = false)">
      <img
        v-if="stickiesIconUrl"
        :src="stickiesIconUrl"
        alt=""
        class="stickies-bar-icon"
        aria-hidden="true"
      />
      <span class="stickies-label">Momentum Stickies</span>
      <button
        type="button"
        class="collapse-btn"
        :title="overlayCollapsed ? 'Expand' : 'Collapse'"
        @click.stop="overlayCollapsed = !overlayCollapsed"
      >
        {{ overlayCollapsed ? '▼' : '▲' }}
      </button>
      <button
        type="button"
        class="add-sticky-btn"
        title="Add sticky"
        @click.stop="createSticky"
      >
        + New
      </button>
    </div>
    <div v-show="!overlayCollapsed" class="stickies-container" ref="containerRef" @dragover.prevent @drop="onDrop">
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { useMomentumStickiesStore } from '../../store/momentumStickies';
import MomentumStickyCard from './MomentumStickyCard.vue';

const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const stickiesIconUrl = computed(() => brandingStore.getDashboardCardIconUrl('momentum_stickies'));
const momentumStore = useMomentumStickiesStore();
const userId = computed(() => authStore.user?.id);
const stickies = ref([]);
const overlayCollapsed = ref(false);
const containerRef = ref(null);
const loading = ref(false);

watch(() => momentumStore.expandOverlayRequest, () => {
  overlayCollapsed.value = false;
});

watch(() => momentumStore.createNewStickyRequest, () => {
  overlayCollapsed.value = false;
  createSticky();
});

watch(() => momentumStore.pendingConvertList, async (items) => {
  if (!items?.length || !userId.value) return;
  momentumStore.clearPendingConvertList();
  try {
    const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
      title: 'Focus list',
      position_x: 20 + stickies.value.length * 30,
      position_y: 20 + stickies.value.length * 30
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
    overlayCollapsed.value = false;
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
        position_x: 20,
        position_y: 20
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
    overlayCollapsed.value = false;
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
      position_x: 20 + stickies.value.length * 30,
      position_y: 20 + stickies.value.length * 30
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
    // Optionally navigate to tasks or show toast - task is created and will appear in task list
  } catch (err) {
    console.error('Failed to promote entry to task:', err);
  }
};

const onDrop = (e) => {
  e.preventDefault();
  const stickyId = parseInt(e.dataTransfer?.getData('text/plain'), 10);
  if (!stickyId) return;
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) return;
  const sticky = stickies.value.find((s) => s.id === stickyId);
  if (!sticky) return;
  const positionX = Math.max(0, e.clientX - rect.left - 100);
  const positionY = Math.max(0, e.clientY - rect.top - 20);
  updateSticky(sticky, { position_x: positionX, position_y: positionY });
};

onMounted(() => {
  fetchStickies();
});
</script>

<style scoped>
.momentum-stickies-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  pointer-events: none;
}

.momentum-stickies-overlay > * {
  pointer-events: auto;
}

.stickies-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stickies-bar-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.stickies-label {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.collapse-btn {
  width: 32px;
  height: 28px;
  padding: 0;
  border: none;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  margin-left: auto;
}

.collapse-btn:hover {
  background: rgba(0, 0, 0, 0.12);
}

.add-sticky-btn {
  padding: 6px 12px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: white;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.add-sticky-btn:hover {
  background: #fef08a;
}

.stickies-container {
  position: relative;
  min-height: 120px;
  padding: 12px;
  background: rgba(254, 249, 195, 0.4);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.momentum-stickies-overlay.collapsed .stickies-container {
  display: none;
}
</style>
