<template>
  <Teleport to="body">
    <transition name="osd-toast">
      <div
        v-if="visible"
        class="osd-toast"
        role="status"
        aria-live="polite"
        data-tour="open-school-days-toast"
      >
        <div class="osd-toast-body">
          <strong>{{ title }}</strong>
          <p>{{ message }}</p>
        </div>
        <div class="osd-toast-meta">
          <span class="countdown" aria-label="Seconds remaining">{{ secondsLeft }}s</span>
          <button type="button" class="dismiss" @click="dismiss">Dismiss</button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  count: { type: Number, default: 0 },
  storageKey: { type: String, default: 'caseload-hub-open-days-toast' },
  durationMs: { type: Number, default: 5000 }
});

const visible = ref(false);
const secondsLeft = ref(5);
let timer = null;
let tick = null;

const title = ref('Open school days');
const message = ref('');

function dismiss() {
  visible.value = false;
  clearTimers();
}

function clearTimers() {
  if (timer) clearTimeout(timer);
  if (tick) clearInterval(tick);
  timer = null;
  tick = null;
}

function maybeShow() {
  clearTimers();
  const n = Number(props.count || 0);
  if (n <= 0) {
    visible.value = false;
    return;
  }
  try {
    if (sessionStorage.getItem(props.storageKey) === '1') {
      visible.value = false;
      return;
    }
  } catch {
    /* ignore */
  }

  title.value = n === 1 ? '1 open school day available' : `${n} open school days available`;
  message.value = 'Review openings at the top of this page.';
  secondsLeft.value = Math.max(1, Math.round(props.durationMs / 1000));
  visible.value = true;

  try {
    sessionStorage.setItem(props.storageKey, '1');
  } catch {
    /* ignore */
  }

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  tick = setInterval(() => {
    secondsLeft.value = Math.max(0, secondsLeft.value - 1);
  }, 1000);

  timer = setTimeout(
    () => {
      dismiss();
    },
    reduced ? Math.min(props.durationMs, 3000) : props.durationMs
  );
}

onMounted(() => {
  maybeShow();
});

watch(
  () => props.count,
  (n, prev) => {
    if (n > 0 && prev === 0) maybeShow();
  }
);

onBeforeUnmount(() => clearTimers());
</script>

<style scoped>
.osd-toast {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 9999;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  max-width: 22rem;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: #1e293b;
  color: #f8fafc;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
}

.osd-toast-body p {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  opacity: 0.9;
}

.osd-toast-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  flex-shrink: 0;
}

.countdown {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.95rem;
}

.dismiss {
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}

.dismiss:hover {
  color: #fff;
}

.osd-toast-enter-active,
.osd-toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.osd-toast-enter-from,
.osd-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .osd-toast-enter-active,
  .osd-toast-leave-active {
    transition: none;
  }
}
</style>
