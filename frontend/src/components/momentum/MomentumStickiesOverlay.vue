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
const stickies = computed(() => momentumStore.stickies);
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
    const current = momentumStore.stickies;
    const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
      title: 'Focus list',
      position_x: 80 + current.length * 40,
      position_y: 80 + current.length * 40
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

watch(() => momentumStore.pendingAddToSticky, async (payload) => {
  if (!payload?.text || !userId.value) return;
  momentumStore.clearPendingAdd();
  try {
    const stickyId = payload.stickyId;
    if (stickyId != null) {
      await api.post(`/users/${userId.value}/momentum-stickies/${stickyId}/entries`, {
        text: payload.text,
        is_expanded: true
      });
    } else if (momentumStore.stickies.length === 0) {
      const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
        title: 'Quick capture',
        position_x: 80,
        position_y: 80
      });
      await api.post(`/users/${userId.value}/momentum-stickies/${data.id}/entries`, {
        text: payload.text,
        is_expanded: true
      });
    } else {
      const first = momentumStore.stickies[0];
      await api.post(`/users/${userId.value}/momentum-stickies/${first.id}/entries`, {
        text: payload.text,
        is_expanded: true
      });
    }
    await fetchStickies();
  } catch (err) {
    console.error('Failed to add to sticky:', err);
  }
});

watch(() => momentumStore.pendingAddMultipleToSticky, async (payload) => {
  if (!payload?.items?.length || !userId.value) return;
  momentumStore.clearPendingAddMultiple();
  try {
    let targetStickyId = payload.stickyId;
    if (targetStickyId == null) {
      const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
        title: 'Focus list',
        position_x: 80 + momentumStore.stickies.length * 40,
        position_y: 80 + momentumStore.stickies.length * 40
      });
      targetStickyId = data.id;
    }
    for (const text of payload.items) {
      const t = String(text || '').trim();
      if (t) {
        await api.post(`/users/${userId.value}/momentum-stickies/${targetStickyId}/entries`, {
          text: t,
          is_expanded: true
        });
      }
    }
    await fetchStickies();
  } catch (err) {
    console.error('Failed to add multiple to sticky:', err);
  }
});

const fetchStickies = async () => {
  if (!userId.value) return;
  try {
    loading.value = true;
    const { data } = await api.get(`/users/${userId.value}/momentum-stickies`);
    momentumStore.setStickies(data || []);
  } catch (err) {
    console.error('Failed to fetch Momentum Stickies:', err);
  } finally {
    loading.value = false;
  }
};

const createSticky = async () => {
  if (!userId.value) return;
  try {
    const current = momentumStore.stickies;
    const { data } = await api.post(`/users/${userId.value}/momentum-stickies`, {
      title: 'New Sticky',
      position_x: 80 + current.length * 40,
      position_y: 80 + current.length * 40
    });
    momentumStore.setStickies([...current, data]);
  } catch (err) {
    console.error('Failed to create Momentum Sticky:', err);
  }
};

const updateSticky = async (sticky, patch) => {
  if (!userId.value) return;
  try {
    const { data } = await api.patch(`/users/${userId.value}/momentum-stickies/${sticky.id}`, patch);
    const list = momentumStore.stickies.map((s) => (s.id === sticky.id ? data : s));
    momentumStore.setStickies(list);
  } catch (err) {
    console.error('Failed to update Momentum Sticky:', err);
  }
};

const deleteSticky = async (sticky) => {
  if (!userId.value) return;
  try {
    await api.delete(`/users/${userId.value}/momentum-stickies/${sticky.id}`);
    momentumStore.setStickies(momentumStore.stickies.filter((s) => s.id !== sticky.id));
  } catch (err) {
    console.error('Failed to delete Momentum Sticky:', err);
  }
};

const hideSticky = async (sticky) => {
  if (!userId.value) return;
  try {
    await api.patch(`/users/${userId.value}/momentum-stickies/${sticky.id}`, { is_hidden: true });
    momentumStore.setStickies(momentumStore.stickies.filter((s) => s.id !== sticky.id));
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
    momentumStore.setStickies([...momentumStore.stickies, data]);
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
    const list = momentumStore.stickies.map((s) =>
      s.id === sticky.id ? { ...s, entries: [...(s.entries || []), data] } : s
    );
    momentumStore.setStickies(list);
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
    const list = momentumStore.stickies.map((s) => {
      if (s.id !== sticky.id || !s.entries) return s;
      const i = s.entries.findIndex((e) => e.id === entry.id);
      if (i < 0) return s;
      const entries = [...s.entries];
      entries[i] = data;
      return { ...s, entries };
    });
    momentumStore.setStickies(list);
  } catch (err) {
    console.error('Failed to update entry:', err);
  }
};

const deleteEntry = async (sticky, entry) => {
  if (!userId.value) return;
  try {
    await api.delete(`/users/${userId.value}/momentum-stickies/${sticky.id}/entries/${entry.id}`);
    const list = momentumStore.stickies.map((s) =>
      s.id === sticky.id && s.entries
        ? { ...s, entries: s.entries.filter((e) => e.id !== entry.id) }
        : s
    );
    momentumStore.setStickies(list);
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
      const list = momentumStore.stickies.map((s) => {
        if (s.id !== sticky.id || !s.entries) return s;
        const i = s.entries.findIndex((e) => e.id === entry.id);
        if (i < 0) return s;
        const entries = [...s.entries];
        entries[i] = { ...entries[i], is_checked: true };
        return { ...s, entries };
      });
      momentumStore.setStickies(list);
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
