<template>
  <div class="momentum-stickies-overlay" ref="overlayRef">
    <MomentumStickyCard
      v-for="sticky in stickies"
      :key="sticky.id"
      :sticky="sticky"
      :user-id="userId"
      @update="(patch) => updateSticky(sticky, patch)"
      @delete="() => deleteSticky(sticky)"
      @hide="() => hideSticky(sticky)"
      @add-entry="() => addEntry(sticky)"
      @update-entry="(entry) => updateEntry(sticky, entry)"
      @delete-entry="(entry) => deleteEntry(sticky, entry)"
      @promote-entry="(entry) => promoteEntry(sticky, entry)"
    />
    <div v-if="showRestorePopover" class="restore-popover-backdrop" @click="showRestorePopover = false" />
    <div class="restore-wrap">
      <button
        type="button"
        class="restore-btn"
        title="Restore hidden stickies"
        @click="toggleRestorePopover"
      >
        Restore
      </button>
      <div v-if="showRestorePopover" class="restore-popover" @click.stop>
        <div v-if="restoreLoading" class="restore-loading">Loading…</div>
        <div v-else-if="hiddenStickies.length === 0" class="restore-empty">No hidden stickies</div>
        <div v-else class="restore-list">
          <button
            v-for="s in hiddenStickies"
            :key="s.id"
            type="button"
            class="restore-item"
            @click="restoreSticky(s)"
          >
            {{ s.title || 'Untitled' }}
          </button>
        </div>
      </div>
    </div>
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
const showRestorePopover = ref(false);
const hiddenStickies = ref([]);
const restoreLoading = ref(false);

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

const hideSticky = async (sticky) => {
  if (!userId.value) return;
  try {
    await api.patch(`/users/${userId.value}/momentum-stickies/${sticky.id}`, { is_hidden: true });
    stickies.value = stickies.value.filter((s) => s.id !== sticky.id);
  } catch (err) {
    console.error('Failed to hide Momentum Sticky:', err);
  }
};

const toggleRestorePopover = async () => {
  showRestorePopover.value = !showRestorePopover.value;
  if (showRestorePopover.value) {
    restoreLoading.value = true;
    hiddenStickies.value = [];
    try {
      const { data } = await api.get(`/users/${userId.value}/momentum-stickies`, {
        params: { includeHidden: 'true' }
      });
      hiddenStickies.value = (data || []).filter((s) => s.is_hidden);
    } catch (err) {
      console.error('Failed to fetch hidden stickies:', err);
    } finally {
      restoreLoading.value = false;
    }
  }
};

const restoreSticky = async (sticky) => {
  if (!userId.value) return;
  try {
    const { data } = await api.patch(`/users/${userId.value}/momentum-stickies/${sticky.id}`, { is_hidden: false });
    hiddenStickies.value = hiddenStickies.value.filter((s) => s.id !== sticky.id);
    stickies.value = [...stickies.value, data];
    if (hiddenStickies.value.length === 0) showRestorePopover.value = false;
  } catch (err) {
    console.error('Failed to restore Momentum Sticky:', err);
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

.restore-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9996;
  pointer-events: auto;
}

.restore-wrap {
  position: fixed;
  bottom: 90px;
  right: 24px;
  z-index: 9997;
}

.restore-btn {
  padding: 6px 12px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.restore-btn:hover {
  background: white;
  color: #1a1a1a;
}

.restore-popover {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  min-width: 180px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.restore-loading,
.restore-empty {
  padding: 12px 16px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.5);
}

.restore-list {
  display: flex;
  flex-direction: column;
}

.restore-item {
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.restore-item:hover {
  background: rgba(0, 0, 0, 0.06);
}
</style>
