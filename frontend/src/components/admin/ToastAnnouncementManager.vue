<template>
  <section class="toast-manager">
    <h2>{{ support ? 'AuricWell support announcements' : 'Office toast announcements' }}</h2>
    <p>{{ support ? 'Notify all AuricWell practice teams when support is unavailable.' : 'Post a toast to everyone on your practice team.' }} Messages appear during the scheduled window and can be dismissed.</p>
    <p v-if="error" role="alert" class="toast-error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form @submit.prevent="save('published')">
      <div class="toast-fields">
        <label>Title<input v-model="form.title" maxlength="255" /></label>
        <label>Starts<input v-model="form.starts_at" type="datetime-local" required /></label>
        <label>Ends<input v-model="form.ends_at" type="datetime-local" required /></label>
      </div>
      <p class="toast-hint">Times are in your device’s local time zone ({{ timeZone }}). Maximum duration: two weeks.</p>
      <label>Message<textarea v-model="form.message" rows="3" maxlength="1200" placeholder="Our administrative offices are closed today and will reopen on…" /></label>
      <div class="toast-example">
        <label>Return date for example<input v-model="returnDate" type="date" /></label>
        <button type="button" @click="useExample">Use closure example</button>
      </div>
      <div class="toast-actions">
        <button type="submit" :disabled="busy">{{ form.id ? 'Save and publish' : 'Publish toast' }}</button>
        <button type="button" :disabled="busy" @click="save('draft')">Save draft</button>
        <button v-if="form.id" type="button" :disabled="busy" @click="reset">New toast</button>
      </div>
    </form>
    <p v-if="loading">Loading announcements…</p>
    <p v-else-if="!items.length">No toast announcements yet.</p>
    <article v-for="item in items" :key="item.id" class="toast-row">
      <div><strong>{{ item.title || 'Office announcement' }}</strong> <small>{{ status(item) }}</small><p>{{ item.message }}</p><small>{{ displayDate(item.starts_at) }} – {{ displayDate(item.ends_at) }}</small></div>
      <div class="toast-actions"><button type="button" :disabled="busy" @click="edit(item)">Edit</button><button type="button" :disabled="busy" @click="remove(item)">Delete</button></div>
    </article>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ request: { type: Function, required: true }, basePath: { type: String, required: true }, support: Boolean });
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const localInput = (raw) => {
  const d = new Date(raw);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const blank = () => ({ id: null, title: '', message: '', starts_at: localInput(Date.now()), ends_at: localInput(Date.now() + 86400000) });
const form = ref(blank());
const returnDate = ref(localInput(Date.now() + 86400000).slice(0, 10));
const items = ref([]), error = ref(''), notice = ref(''), loading = ref(false), busy = ref(false);
let generation = 0;
const displayDate = (raw) => new Date(raw).toLocaleString();
const status = (item) => item.publish_status === 'draft' ? 'Draft' : new Date(item.ends_at) <= new Date() ? 'Expired' : new Date(item.starts_at) > new Date() ? 'Scheduled' : 'Live';
function reset() { form.value = blank(); }
function edit(item) { form.value = { ...item, starts_at: localInput(item.starts_at), ends_at: localInput(item.ends_at) }; notice.value = ''; }
function useExample() {
  const returns = new Date(`${returnDate.value}T00:00:00`);
  if (!Number.isFinite(returns.getTime()) || returns <= new Date()) { error.value = 'Choose a future return date.'; return; }
  error.value = '';
  form.value.title = props.support ? 'AuricWell support is out of office' : 'Administrative offices closed today';
  form.value.message = `${props.support ? 'AuricWell support is out of office today' : 'Our administrative offices are closed today'} and will ${props.support ? 'return' : 'reopen'} on ${returns.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. ${props.support ? 'This notice applies to AuricWell support availability only' : 'This closure applies to administrative offices only'}; provider appointments and services follow their individual schedules.`;
  form.value.starts_at = localInput(Date.now());
  form.value.ends_at = localInput(returns);
}
async function load() {
  const requestGeneration = generation;
  loading.value = true;
  try { const result = await props.request(props.basePath); if (generation === requestGeneration) items.value = result; }
  catch (e) { if (generation === requestGeneration) error.value = e.response?.data?.error?.message || e.message; }
  finally { if (generation === requestGeneration) loading.value = false; }
}
async function save(publishStatus) {
  error.value = ''; notice.value = '';
  const starts = new Date(form.value.starts_at), ends = new Date(form.value.ends_at);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) { error.value = 'Choose a valid start and a later end time.'; return; }
  if (ends - starts > 14 * 86400000) { error.value = 'Announcements may last at most two weeks.'; return; }
  if (publishStatus === 'published' && !form.value.message.trim()) { error.value = 'Message is required.'; return; }
  busy.value = true;
  try {
    await props.request(`${props.basePath}${form.value.id ? `/${form.value.id}` : ''}`, { method: form.value.id ? 'PUT' : 'POST', body: {
      title: form.value.title, message: form.value.message, starts_at: starts.toISOString(), ends_at: ends.toISOString(), publish_status: publishStatus, display_type: 'toast'
    } });
    reset(); await load(); notice.value = publishStatus === 'draft' ? 'Draft saved.' : 'Toast scheduled.';
  } catch (e) { error.value = e.response?.data?.error?.message || e.message; }
  finally { busy.value = false; }
}
async function remove(item) {
  if (!window.confirm(`Delete “${item.title || 'Office announcement'}”?`)) return;
  busy.value = true; error.value = '';
  try { await props.request(`${props.basePath}/${item.id}`, { method: 'DELETE' }); if (form.value.id === item.id) reset(); await load(); }
  catch (e) { error.value = e.response?.data?.error?.message || e.message; }
  finally { busy.value = false; }
}
watch(() => props.basePath, () => { generation++; reset(); items.value = []; error.value = ''; notice.value = ''; load(); }, { immediate: true });
</script>

<style scoped>
.toast-manager { padding: 24px; border: 1px solid #d5ded8; border-radius: 12px; background: white; color: #24382e; }
.toast-fields { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 16px; }
.toast-manager label { display: grid; gap: 6px; }
.toast-manager input, .toast-manager textarea { padding: 10px; border: 1px solid #bbc9c0; border-radius: 6px; font: inherit; color: inherit; background: white; box-sizing: border-box; width: 100%; }
.toast-example, .toast-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-top: 14px; }
.toast-manager button { padding: 9px 14px; border: 1px solid #456854; border-radius: 6px; background: #f0f7f2; color: #274a35; cursor: pointer; }
.toast-manager button:disabled { opacity: .5; cursor: wait; }
.toast-row { padding: 18px 0; border-top: 1px solid #d5ded8; margin-top: 18px; }
.toast-row p { white-space: pre-wrap; overflow-wrap: anywhere; }
.toast-hint, .toast-row small { color: #56645b; font-size: 13px; }
.toast-error { color: #a02020; }
</style>
