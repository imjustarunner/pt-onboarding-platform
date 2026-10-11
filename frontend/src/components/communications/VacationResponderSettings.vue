<template>
  <section class="vacation-settings" aria-labelledby="vacation-heading">
    <header><div><p class="eyebrow">Email settings</p><h2 id="vacation-heading">Vacation responder</h2></div><span class="state">{{ stateLabel }}</span></header>
    <p>A planned out reserves your time. This separate switch controls your email reply. It starts only during the selected approved absence and stops at your return time or when that absence ends.</p>
    <p v-if="!agencyId">Select an agency to manage its responder.</p>
    <p v-else-if="loading">Loading your responder…</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="success" role="status">{{ success }}</p>
    <form v-if="data && !loading" @submit.prevent="save">
      <p><strong>{{ data.agencyName }}</strong> · Replies from your connected personal inbox in the app. This does not turn on Gmail’s separate vacation setting or change voicemail.</p>
      <p v-if="data.personalInboxReady === false" role="status">Your personal email inbox is not connected to this agency in the app yet. You can save your setup, but replies will not send until it is connected.</p>
      <p v-if="data.agencyAutoRepliesEnabled === false" role="status">Automatic unavailable replies are disabled by your agency. Your responder will not send until an administrator enables them.</p>
      <label class="switch"><input v-model="form.enabled" type="checkbox" /> Turn on my vacation responder</label>
      <div class="fields">
        <label>Planned out<select aria-label="Planned out" v-model="form.plannedOutId" :required="form.enabled"><option :value="null">Choose an absence</option><option v-for="po in data.plannedOuts" :key="po.id" :value="po.id">{{ absenceLabel(po) }}</option></select></label>
        <label>Template<select aria-label="Template" v-model="form.templateKey"><option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option></select></label>
        <label>Expected return / turn responder off<input v-model="form.endsLocal" type="datetime-local" :required="form.enabled" /></label>
        <label>Time zone<select v-model="form.timeZone"><option value="America/Denver">Mountain time (Colorado)</option><option value="America/Chicago">Central time</option><option value="America/New_York">Eastern time</option><option value="America/Los_Angeles">Pacific time</option><option value="UTC">UTC</option></select></label>
      </div>
      <p v-if="!data.plannedOuts.length">Add a planned out first. You can prepare this message while the absence awaits approval.</p>
      <label class="switch"><input v-model="custom" type="checkbox" /> Customize my message</label>
      <label v-if="custom">My reply<textarea v-model="form.messageTemplate" rows="13" maxlength="10000" :required="form.enabled && custom" /></label>
      <button v-if="custom" type="button" class="btn btn-secondary" @click="form.messageTemplate = data.defaults.templates[form.templateKey]">Replace my text with the selected template</button>
      <p class="hint">Placeholders: {provider_name}, {agency_name}, {return_at}, {support_contact}. Keep {return_at} so the date updates automatically. Agency defaults apply unless you customize your message. Changing the selected template preserves custom text until you replace it.</p>
      <details open><summary>Message preview</summary><pre>{{ preview }}</pre></details>
      <p class="hint">One vacation reply per sender per 24 hours. With this switch off, the general unavailable / after-hours reply still follows agency settings. Saving does not send a test email.</p>
      <button class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save my responder' }}</button>
    </form>
    <details v-if="data?.canManageDefaults" class="defaults">
      <summary>Agency default vacation templates</summary>
      <p>Applies to {{ data.agencyName }} only. Personal custom messages are preserved. These defaults do not turn anyone’s responder on.</p>
      <label>Support email or contact instruction<input v-model="defaults.supportContact" maxlength="320" /></label>
      <label>Default template<select v-model="defaultKey"><option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option></select></label>
      <label>Default message<textarea v-model="defaults.templates[defaultKey]" rows="14" maxlength="10000" /></label>
      <button type="button" class="btn btn-secondary" :disabled="saving" @click="saveDefaults">Save agency defaults</button>
    </details>
    <details v-if="data"><summary>Crisis resource sources · Reviewed {{ data.sourcesReviewedAt }}</summary><ul><li v-for="url in data.sources" :key="url"><a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a></li></ul></details>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [Number, String], default: null } });
const data = ref(null), loading = ref(false), saving = ref(false), error = ref(''), success = ref(''), custom = ref(false);
const form = ref({ enabled: false, plannedOutId: null, endsLocal: '', timeZone: 'America/Denver', templateKey: 'provider_colorado_springs', messageTemplate: '' });
const defaults = ref({ templates: {}, supportContact: '' }), defaultKey = ref('provider_colorado_springs');
const labels = { provider_colorado_springs: 'Provider · Colorado Springs', provider_denver: 'Provider · Denver', staff_colorado_springs: 'Admin / support · Colorado Springs', staff_denver: 'Admin / support · Denver' };
const stateLabel = computed(() => ({ active: 'Active', waiting: 'Waiting for approved absence', expired: 'Expired · Off', inactive: 'Inactive · Absence ended or unavailable', off: 'Off' }[data.value?.config?.state] || 'Off'));
function wall(instant, timeZone) {
  if (!instant) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function absenceLabel(po) { return `${po.allDay ? po.start : wall(po.start, form.value.timeZone).replace('T', ' ')} → ${po.allDay ? po.end + ' (exclusive)' : wall(po.end, form.value.timeZone).replace('T', ' ')} · ${po.status}`; }
const preview = computed(() => {
  const template = custom.value ? form.value.messageTemplate : data.value?.defaults.templates[form.value.templateKey] || '';
  const vars = { provider_name: data.value?.providerName, agency_name: data.value?.agencyName, return_at: form.value.endsLocal ? `${form.value.endsLocal.replace('T', ' ')} (${form.value.timeZone})` : '[choose your return time]', support_contact: data.value?.defaults.supportContact };
  return template.replace(/\{(provider_name|agency_name|return_at|support_contact)\}/g, (_, k) => vars[k] || '');
});
watch(custom, on => { if (on && !form.value.messageTemplate) form.value.messageTemplate = data.value?.defaults.templates[form.value.templateKey] || ''; });
let request = 0;
async function load() {
  const token = ++request; data.value = null; error.value = ''; success.value = '';
  if (!props.agencyId) return;
  loading.value = true;
  try {
    const r = await api.get('/email-settings/vacation', { params: { agencyId: props.agencyId } });
    if (token !== request) return;
    data.value = r.data; defaults.value = structuredClone(r.data.defaults);
    form.value = { ...r.data.config, enabled: r.data.config.state === 'expired' ? false : r.data.config.enabled, endsLocal: wall(r.data.config.endsAt, r.data.config.timeZone) };
    custom.value = !!form.value.messageTemplate;
  } catch (e) { if (token === request) error.value = e.response?.data?.error?.message || 'Unable to load vacation responder. The feature may need its database migration.'; }
  finally { if (token === request) loading.value = false; }
}
async function save() {
  const token = request;
  saving.value = true; error.value = ''; success.value = '';
  try {
    const r = await api.put('/email-settings/vacation', { agencyId: Number(props.agencyId), ...form.value, messageTemplate: custom.value ? form.value.messageTemplate : '' });
    if (token !== request) return;
    data.value.config = r.data.config; success.value = 'Vacation responder saved.';
  } catch (e) { if (token === request) error.value = e.response?.data?.error?.message || 'Unable to save responder.'; }
  finally { saving.value = false; }
}
async function saveDefaults() {
  const token = request;
  saving.value = true; error.value = ''; success.value = '';
  try {
    const r = await api.put('/email-settings/vacation/defaults', { agencyId: Number(props.agencyId), ...defaults.value });
    if (token !== request) return;
    data.value.defaults = r.data.defaults; success.value = 'Agency defaults saved. Personal custom messages are unchanged.';
  } catch (e) { if (token === request) error.value = e.response?.data?.error?.message || 'Unable to save defaults.'; }
  finally { saving.value = false; }
}
watch(() => props.agencyId, load, { immediate: true });
</script>
<style scoped>
.vacation-settings { padding:24px; margin:24px 0; border:1px solid var(--border,#d5dfdf); border-radius:16px; background:var(--bg-secondary,#fff); color:var(--text-primary,#203a3b); }
header { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:center; } h2 { margin:0; } .eyebrow { text-transform:uppercase; font-size:12px; letter-spacing:.1em; } .state { padding:8px 12px; border-radius:20px; background:var(--bg-tertiary,#edf3ef); } p { line-height:1.6; } .fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin:20px 0; } label { min-width:0; display:flex; flex-direction:column; gap:8px; margin:12px 0; font-weight:600; } .switch { flex-direction:row; align-items:center; } input,select,textarea { font:inherit; padding:10px; border:1px solid var(--border,#ccd7d7); border-radius:8px; min-width:0; background:var(--bg-primary,#fff); color:inherit; } textarea { width:100%; box-sizing:border-box; } pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; line-height:1.7; padding:18px; background:var(--bg-tertiary,#f3f6f3); border-radius:10px; } .hint { font-size:13px; } details { margin:18px 0; } summary { cursor:pointer; font-weight:600; } a { overflow-wrap:anywhere; } [role=alert] { color:#a32222; } @media(max-width:640px) { .fields { grid-template-columns:minmax(0,1fr); } .vacation-settings { padding:16px; } }
</style>
