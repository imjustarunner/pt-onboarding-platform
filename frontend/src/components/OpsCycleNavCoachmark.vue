<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="ops-cycle-coach"
      :style="panelStyle"
      role="status"
      aria-live="polite"
    >
      <div class="ops-cycle-coach-bubble">
        <p class="ops-cycle-coach-text">
          Click here to swap between your Operations Dashboard, Workforce Ops, and School Ops views.
        </p>
        <button type="button" class="ops-cycle-coach-btn" @click="dismiss">
          Got it
        </button>
      </div>
      <span class="ops-cycle-coach-arrow" aria-hidden="true" />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const STORAGE_KEY = 'opsCycleNavCoachDismissed.v1';

const props = defineProps({
  anchorEl: { type: Object, default: null },
  enabled: { type: Boolean, default: true }
});

const dismissed = ref(false);
const panelStyle = ref({});

const visible = computed(() => props.enabled && !dismissed.value && !!props.anchorEl);

const readDismissed = () => {
  try {
    dismissed.value = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    dismissed.value = false;
  }
};

const dismiss = () => {
  dismissed.value = true;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
};

const updatePosition = () => {
  const el = props.anchorEl;
  if (!el || dismissed.value || !props.enabled) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const top = Math.round(rect.bottom + 10);
  const left = Math.round(rect.left + rect.width / 2);
  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    transform: 'translateX(-50%)',
    zIndex: 10150
  };
};

const onViewportChange = () => {
  if (visible.value) updatePosition();
};

watch(
  () => [props.anchorEl, props.enabled, dismissed.value],
  async () => {
    if (!visible.value) return;
    await Promise.resolve();
    updatePosition();
  },
  { flush: 'post' }
);

onMounted(() => {
  readDismissed();
  updatePosition();
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});
</script>

<style scoped>
.ops-cycle-coach {
  pointer-events: none;
  max-width: min(320px, calc(100vw - 24px));
}

.ops-cycle-coach-bubble {
  pointer-events: auto;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.35);
}

.ops-cycle-coach-text {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
}

.ops-cycle-coach-btn {
  appearance: none;
  border: 0;
  border-radius: 6px;
  background: #4f46e5;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
}

.ops-cycle-coach-btn:hover {
  background: #4338ca;
}

.ops-cycle-coach-arrow {
  display: block;
  width: 12px;
  height: 12px;
  margin: -1px auto 0;
  background: #0f172a;
  border-left: 1px solid rgba(148, 163, 184, 0.35);
  border-top: 1px solid rgba(148, 163, 184, 0.35);
  transform: rotate(45deg) translateY(-6px);
}
</style>
