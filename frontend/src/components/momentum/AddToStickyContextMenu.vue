<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="add-to-sticky-menu"
      :style="menuStyle"
      role="menu"
      @click.stop
    >
      <template v-if="stickies.length > 0">
        <button
          v-for="s in stickies"
          :key="s.id"
          type="button"
          class="menu-item"
          @click="addToSticky(s.id)"
        >
          {{ s.title || 'Untitled' }}
        </button>
        <div class="menu-divider" />
      </template>
      <button
        type="button"
        class="menu-item"
        @click="addToSticky(null)"
      >
        {{ stickies.length > 0 ? '+ New sticky' : 'Add to Momentum Sticky' }}
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMomentumStickiesStore } from '../../store/momentumStickies';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const momentumStore = useMomentumStickiesStore();
const authStore = useAuthStore();
const stickies = computed(() => momentumStore.stickies || []);
const visible = ref(false);
const menuStyle = ref({});
let pendingText = '';
let targetEl = null;

const getTextFromTarget = (el) => {
  if (!el) return '';
  const addAttr = el.closest?.('[data-add-to-sticky]') || el;
  const explicit = addAttr?.getAttribute?.('data-add-to-sticky');
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().slice(0, 500);
  const sel = window.getSelection?.();
  const selText = sel?.toString?.()?.trim();
  if (selText) return selText.slice(0, 500);
  return String(addAttr?.textContent || el?.textContent || '').trim().slice(0, 500);
};

const show = async (e, el) => {
  targetEl = el || e?.target;
  pendingText = getTextFromTarget(targetEl);
  if (!pendingText) return;
  const uid = authStore.user?.id;
  if (uid && momentumStore.stickies.length === 0) {
    try {
      const { data } = await api.get(`/users/${uid}/momentum-stickies`);
      momentumStore.setStickies(data || []);
    } catch {
      momentumStore.setStickies([]);
    }
  }
  visible.value = true;
  const x = e?.clientX ?? 0;
  const y = e?.clientY ?? 0;
  menuStyle.value = {
    left: `${x}px`,
    top: `${y}px`
  };
};

const hide = () => {
  visible.value = false;
  pendingText = '';
  targetEl = null;
};

const addToSticky = (stickyId) => {
  if (pendingText) {
    momentumStore.triggerAddToSticky(pendingText, stickyId);
  }
  hide();
};

const onContextMenu = (e) => {
  const el = e.target;
  const addable = el.closest?.('[data-add-to-sticky]');
  const hasSelection = window.getSelection?.()?.toString?.()?.trim();
  if (!addable && !hasSelection) return;
  const text = getTextFromTarget(addable || el);
  if (!text) return;
  e.preventDefault();
  e.stopPropagation();
  show(e, addable || el);
};

const onClickOutside = () => {
  if (visible.value) hide();
};

onMounted(() => {
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('click', onClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu, true);
  document.removeEventListener('click', onClickOutside);
});
</script>

<style scoped>
.add-to-sticky-menu {
  position: fixed;
  z-index: 10000;
  min-width: 180px;
  padding: 4px 0;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.menu-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  color: #1a1a1a;
}

.menu-item:hover {
  background: rgba(254, 249, 195, 0.4);
}

.menu-divider {
  height: 1px;
  margin: 4px 0;
  background: rgba(0, 0, 0, 0.1);
}
</style>
