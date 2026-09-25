<template>
  <section class="workspace-progress" aria-live="polite" :aria-busy="busy">
    <span v-if="busy" class="workspace-spinner" aria-hidden="true" />
    <h3>{{ error ? 'Let’s try that again' : 'Signing you in' }}</h3>
    <p>{{ error || (takingLonger ? 'This is taking longer than usual. We’re still connecting…' : 'Getting your workspace ready…') }}</p>
    <div v-if="error && !busy" class="workspace-actions">
      <button type="button" class="btn btn-primary" @click="$emit('retry')">Try again</button>
      <button type="button" class="workspace-switch" @click="$emit('switch')">Sign in with another account</button>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';
const props = defineProps({ busy: Boolean, error: { type: String, default: '' } });
defineEmits(['retry', 'switch']);
const takingLonger = ref(false);
let timer;
watch(() => props.busy, busy => {
  clearTimeout(timer);
  takingLonger.value = false;
  if (busy) timer = setTimeout(() => { takingLonger.value = true; }, 8000);
}, { immediate: true });
onUnmounted(() => clearTimeout(timer));
</script>

<style scoped>
.workspace-progress { padding: 36px 20px; text-align: center; color: inherit; min-height: 190px; }
.workspace-progress h3 { font-size: 22px; margin: 18px 0 10px; color: inherit; }
.workspace-progress p { margin: 0; line-height: 1.6; color: inherit; opacity: .85; }
.workspace-spinner { display: inline-block; width: 30px; height: 30px; border: 3px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: workspace-spin .8s linear infinite; }
.workspace-actions { display: grid; gap: 16px; margin-top: 24px; }
.workspace-switch { border: 0; background: transparent; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }
@keyframes workspace-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .workspace-spinner { animation: none; } }
</style>
