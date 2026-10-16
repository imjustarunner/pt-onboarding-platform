<template>
  <Teleport to="body">
    <div class="preferred-time-backdrop" @click.self="close">
      <section ref="dialog" class="preferred-time-dialog" role="dialog" aria-modal="true" :aria-busy="busy" :aria-labelledby="headingId" :aria-describedby="descriptionId" tabindex="-1" @keydown="handleKeydown">
        <div class="preferred-time-top"><span>YOUR PREFERRED TIME</span><button type="button" aria-label="Close time confirmation" :disabled="busy" @click="close">×</button></div>
        <h2 :id="headingId">Request this time and enroll?</h2>
        <div v-if="summary" class="preferred-time-summary">
          <strong>{{ providerName }}</strong>
          <span>{{ summary.date }}</span>
          <b>{{ summary.time }}</b>
          <span>{{ summary.frequency }} · {{ summary.setting }}</span>
          <small>{{ summary.timeZone }}</small>
        </div>
        <p :id="descriptionId">We’ll include this preferred time in your enrollment. Availability may change, and this does not reserve or confirm an appointment.</p>
        <p>Our support team will reach out if anything else is needed, or you’ll hear directly from your provider.</p>
        <p v-if="error" class="preferred-time-error" role="alert">{{ error }}</p>
        <footer><button type="button" :disabled="busy" @click="close">Keep browsing</button><button ref="continueButton" type="button" class="preferred-time-continue" :disabled="busy" @click="$emit('confirm')">{{ busy ? 'Continuing…' : 'Continue to enrollment →' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, useId, watch } from 'vue';
import { openingPreferencePresentation } from '../../utils/openingPreferencePresentation';
const props = defineProps({ opening: { type:Object, required:true }, providerName:String, busy:Boolean, error:String });
const emit = defineEmits(['confirm', 'close']);
const headingId = `preferred-time-${useId()}`, descriptionId = `${headingId}-description`;
const dialog = ref(null), continueButton = ref(null);
const summary = computed(() => openingPreferencePresentation(props.opening));
const close = () => { if (!props.busy) emit('close'); };
let returnFocus, previousOverflow, mounted = true;
watch(() => props.busy, async busy => {
  await nextTick();
  if (!mounted) return;
  if (busy) dialog.value?.focus();
  else if (document.activeElement === dialog.value) continueButton.value?.focus();
});
function handleKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  if (event.key !== 'Tab') return;
  const buttons = [...dialog.value.querySelectorAll('button:not(:disabled)')];
  if (!buttons.length) { event.preventDefault(); return; }
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(async () => {
  returnFocus = document.activeElement; previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  await nextTick(); if (mounted) continueButton.value?.focus();
});
onBeforeUnmount(() => {
  mounted = false; document.body.style.overflow = previousOverflow || '';
  if (returnFocus?.isConnected) returnFocus.focus();
});
</script>

<style scoped>
.preferred-time-backdrop { position:fixed; inset:0; z-index:15000; display:grid; place-items:center; padding:20px; background:#102c3b88; color:#173c38; font-family:system-ui,sans-serif; }
.preferred-time-dialog { width:min(520px,100%); box-sizing:border-box; max-height:calc(100dvh - 40px); overflow:auto; padding:24px; border-radius:18px; background:#fff; box-shadow:0 24px 80px #102b3d40; }
.preferred-time-top { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.preferred-time-top span { font-size:10px; font-weight:750; letter-spacing:.12em; color:#506f67; }
.preferred-time-dialog .preferred-time-top button { font-size:24px; padding:0; width:36px; height:36px; min-height:36px; border:0; }
.preferred-time-dialog h2 { margin:8px 0 18px; font-size:24px; line-height:1.25; letter-spacing:-.025em; color:#173c38; }
.preferred-time-summary { display:grid; gap:6px; padding:16px; border:1px solid #c9ddd3; border-radius:10px; background:#f2f8f5; font-size:14px; }
.preferred-time-summary strong { margin-bottom:4px; font-size:16px; }
.preferred-time-summary b { font-size:20px; color:#185c43; }
.preferred-time-summary small { color:#506f67; }
.preferred-time-dialog p { font-size:14px; line-height:1.6; margin:16px 0 0; }
.preferred-time-dialog .preferred-time-error { color:#a12821; padding:10px; border:1px solid #f2c5c0; border-radius:8px; background:#fff7f6; }
.preferred-time-dialog footer { display:flex; justify-content:flex-end; gap:10px; margin-top:24px; }
.preferred-time-dialog button { border:1px solid #c9dad1; border-radius:8px; padding:10px 14px; min-height:44px; background:#fff; color:#245840; font:inherit; font-size:13px; cursor:pointer; }
.preferred-time-dialog .preferred-time-continue { background:#1c634b; border-color:#1c634b; color:#fff; font-weight:650; }
.preferred-time-dialog button:disabled { opacity:.6; cursor:wait; }
.preferred-time-dialog :focus-visible { outline:3px solid #79ae97; outline-offset:3px; }
@media(max-width:480px) { .preferred-time-backdrop { padding:12px; } .preferred-time-dialog { padding:20px; max-height:calc(100dvh - 24px); } .preferred-time-dialog footer { flex-direction:column-reverse; } .preferred-time-dialog footer button { width:100%; } }
</style>
