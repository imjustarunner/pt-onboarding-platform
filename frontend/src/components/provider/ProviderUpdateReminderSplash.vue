<template>
  <Teleport to="body">
    <div v-if="visible" class="update-reminder-overlay" @click.self="dismiss">
      <section ref="panel" class="update-reminder-card" role="dialog" aria-modal="true"
        aria-labelledby="update-reminder-title" @keydown.esc="dismiss" @keydown.tab="trapFocus">
        <button class="update-reminder-close" type="button" aria-label="Close Provider Update reminder" @click="dismiss">×</button>
        <p class="update-reminder-eyebrow">PROVIDER UPDATE · ACTION NEEDED</p>
        <h1 id="update-reminder-title">Your Provider Update is unfinished</h1>
        <p>Your saved progress is ready. Complete the remaining sections, then select <strong>Submit</strong> from the overview.</p>
        <article v-for="update in reminders" :key="update.recipientId" class="update-reminder-item">
          <h2>{{ update.agencyName }}</h2>
          <p v-if="update.progress">
            <strong>{{ update.progress.completed }} of {{ update.progress.total }} sections complete.</strong>
            <span v-if="update.progress.completed === update.progress.total">Your final submission is still needed.</span>
          </p>
          <a :href="update.link" class="btn btn-primary" data-primary @click="dismiss">Continue my Provider Update →</a>
        </article>
        <p class="update-reminder-note">You can also find your personal link in Tasks. Your task and this reminder stop automatically after you submit.</p>
        <button class="btn btn-secondary" type="button" @click="dismiss">Remind me next login</button>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({ loginTrigger: { type: [Number, String], default: 0 } });
const route = useRoute();
const reminders = ref([]);
const dismissed = ref(false);
const panel = ref(null);
let requestGeneration = 0;
let previousFocus;
const insideUpdate = computed(() => /\/provider-update\/|\/provider\/update(?:\/|$)/.test(route.path || ''));
const visible = computed(() => reminders.value.length > 0 && !dismissed.value && !insideUpdate.value);

async function load() {
  const generation = ++requestGeneration;
  try {
    const { data } = await api.get('/provider-update/me/reminders', { skipGlobalLoading: true });
    if (generation === requestGeneration) reminders.value = Array.isArray(data.reminders) ? data.reminders : [];
  } catch {
    if (generation === requestGeneration) reminders.value = [];
  }
}
function dismiss() {
  dismissed.value = true;
  previousFocus?.focus?.();
}
function trapFocus(event) {
  const controls = [...(panel.value?.querySelectorAll('a[href],button:not([disabled])') || [])];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function focus() { if (!document.hidden) void load(); }
watch(() => props.loginTrigger, () => { dismissed.value = false; void load(); }, { immediate: true });
watch(insideUpdate, (inside, previous) => { if (!inside && previous) void load(); });
watch(visible, async shown => {
  if (shown) { previousFocus = document.activeElement; await nextTick(); panel.value?.querySelector('[data-primary]')?.focus(); }
});
onMounted(() => window.addEventListener('focus', focus));
onBeforeUnmount(() => { requestGeneration++; window.removeEventListener('focus', focus); });
</script>

<style scoped>
.update-reminder-overlay{position:fixed;inset:0;z-index:50000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,31,28,.6)}
.update-reminder-card{position:relative;width:100%;max-width:560px;max-height:85vh;overflow:auto;box-sizing:border-box;padding:32px;border-radius:20px;background:var(--app-surface,#fff);color:var(--text-primary,#173d33);box-shadow:0 20px 70px #0004}
.update-reminder-close{position:absolute;right:14px;top:10px;border:0;background:transparent;color:inherit;font-size:30px;cursor:pointer}
.update-reminder-eyebrow{font-size:11px;font-weight:750;letter-spacing:.09em;color:var(--primary,#285b51)}
h1{font-size:28px;line-height:1.2;margin:12px 0 16px}h2{font-size:18px;margin:0 0 8px}p{line-height:1.6}
.update-reminder-item{padding:20px;margin:20px 0;border:1px solid var(--border,#cbded6);border-radius:12px}
.update-reminder-item a{display:block;text-align:center;text-decoration:none;white-space:normal}
.update-reminder-item p span{display:block}.update-reminder-note{font-size:14px;color:var(--text-secondary,#536b62)}
@media(max-width:480px){.update-reminder-overlay{padding:12px}.update-reminder-card{padding:26px 20px}h1{font-size:24px}.update-reminder-item{padding:16px}}
</style>
