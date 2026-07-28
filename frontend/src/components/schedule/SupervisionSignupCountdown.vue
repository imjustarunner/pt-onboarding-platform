<template>
  <span class="ssc" :class="{ 'ssc--urgent': urgent, 'ssc--closed': closed }">{{ label }}</span>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps({
  closesAt: { type: [String, Date, Number], default: null },
  prefix: { type: String, default: 'Sign up by' }
});

const nowMs = ref(Date.now());
let timer = null;

onMounted(() => {
  timer = window.setInterval(() => {
    nowMs.value = Date.now();
  }, 30000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});

function parseClosesAt(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const text = String(raw).trim();
  if (!text) return null;
  const d = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

const label = computed(() => {
  const closes = parseClosesAt(props.closesAt);
  if (!closes) return '';
  const diff = closes.getTime() - nowMs.value;
  if (diff <= 0) return 'Signup closed';
  const totalMins = Math.floor(diff / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const body = hrs > 0 ? `${hrs}h ${mins}m` : `${Math.max(mins, 1)}m`;
  return `${props.prefix} ${body}`;
});

const closed = computed(() => label.value === 'Signup closed');
const urgent = computed(() => {
  const closes = parseClosesAt(props.closesAt);
  if (!closes) return false;
  const diff = closes.getTime() - nowMs.value;
  return diff > 0 && diff <= (2 * 60 * 60 * 1000);
});
</script>

<style scoped>
.ssc {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.ssc--urgent {
  color: #b45309;
}

.ssc--closed {
  color: #64748b;
  font-weight: 500;
}
</style>
