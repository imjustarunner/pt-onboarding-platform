<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
defineProps({ selectedRange: String, blockRange: String, officeLabel: String, dateLabel: String, hourCount: Number });
const emit = defineEmits(['choose', 'close']);
const dialog = ref(null), firstChoice = ref(null);
let previousFocus;
function keydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
  if (event.key !== 'Tab') return;
  const buttons = [...dialog.value.querySelectorAll('button:not(:disabled)')];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(async () => { previousFocus = document.activeElement; await nextTick(); firstChoice.value?.focus(); });
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
</script>
<template>
  <Teleport to="body">
    <div class="office-selection-backdrop" @click.self="emit('close')" @keydown="keydown">
      <section ref="dialog" class="office-selection-dialog" role="dialog" aria-modal="true" aria-labelledby="office-selection-title" aria-describedby="office-selection-description">
        <header><div><p class="eyebrow">Office reservation</p><h2 id="office-selection-title">Which hours would you like to open?</h2></div><button type="button" class="close" aria-label="Back to calendar" @click="emit('close')">×</button></header>
        <p v-if="officeLabel || dateLabel" class="context">{{ [officeLabel, dateLabel].filter(Boolean).join(' · ') }}</p>
        <p id="office-selection-description">The hour you clicked is part of a longer reservation. Choose the time you want to work with.</p>
        <div class="choices">
          <button ref="firstChoice" type="button" class="choice" @click="emit('choose','hour')"><span>Only this hour</span><strong>{{ selectedRange }}</strong><small>Open the selected hour</small></button>
          <button type="button" class="choice" @click="emit('choose','block')"><span>Whole office block</span><strong>{{ blockRange }}</strong><small>{{ hourCount }} reserved hours</small></button>
        </div>
        <footer><p>Choosing hours does not change or cancel your reservation.</p><button type="button" class="back" @click="emit('close')">Back to calendar</button></footer>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.office-selection-backdrop{position:fixed;inset:0;z-index:10650;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(30,48,65,.28);backdrop-filter:blur(6px)}
.office-selection-dialog{box-sizing:border-box;width:min(590px,100%);max-height:calc(100dvh - 40px);overflow:auto;padding:24px;border:1px solid rgba(204,222,233,.8);border-radius:22px;color:var(--text-primary,#243d50);background:var(--bg-card,#fff);background:color-mix(in srgb,var(--bg-card,#fff) 96%,transparent);box-shadow:0 24px 80px rgba(18,42,64,.18)}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.eyebrow{margin:0 0 6px;text-transform:uppercase;letter-spacing:.1em;font-size:10px;color:var(--text-secondary,#60788a)}h2{font-size:22px;line-height:1.25;letter-spacing:-.025em;margin:0}.close{padding:0 4px;border:0;background:transparent;color:inherit;font:inherit;font-size:25px;cursor:pointer}.context{font-size:12px;font-weight:600;color:var(--text-secondary,#60788a);margin:14px 0 0}#office-selection-description{font-size:14px;line-height:1.6;margin:16px 0;color:var(--text-secondary,#60788a)}
.choices{display:grid;grid-template-columns:1fr 1fr;gap:12px}.choice{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:17px;text-align:left;font:inherit;color:inherit;border:1px solid rgba(119,151,175,.3);border-radius:15px;background:color-mix(in srgb,var(--bg-card,#fff) 65%,#eaf4f8);cursor:pointer}.choice:hover{border-color:#428d7b;background:color-mix(in srgb,var(--bg-card,#fff) 65%,#d9eee8)}.choice span{font-size:13px;font-weight:600}.choice strong{font-size:20px}.choice small{font-size:12px;color:var(--text-secondary,#60788a)}button:focus-visible{outline:3px solid #5b9fce;outline-offset:3px}footer{margin-top:20px;padding-top:14px;border-top:1px solid rgba(138,161,181,.18);display:flex;align-items:center;justify-content:space-between;gap:16px}footer p{font-size:11px;line-height:1.5;color:var(--text-secondary,#60788a);margin:0;max-width:280px}.back{font:inherit;font-size:12px;font-weight:600;padding:10px 13px;border:1px solid rgba(119,151,175,.25);border-radius:11px;background:transparent;color:inherit;cursor:pointer;flex-shrink:0}@media(max-width:520px){.office-selection-backdrop{padding:12px}.office-selection-dialog{padding:19px;max-height:calc(100dvh - 24px)}.choices{grid-template-columns:1fr}.choice{padding:14px}footer{align-items:flex-start;flex-direction:column;gap:12px}.back{align-self:flex-end}}
</style>
