<template>
  <main class="records-requests">
    <p class="eyebrow">AuricWell · Records</p>
    <RouterLink v-if="!base" to="/auricwell">← AuricWell</RouterLink>
    <h1>{{ manage ? 'Records requests' : 'Request my records' }}</h1>
    <p>Request a copy of your records or records for someone you are authorized to represent. Your practice reviews every request before release.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Loading…</p>
    <template v-else>
      <template v-if="!manage">
        <p v-if="!base">Already have an account? <RouterLink to="/my-records">Sign in to request and track your records.</RouterLink> Otherwise, submit below. Staff will verify your identity using contact information already on file or in person. A parent or representative’s authority is reviewed separately.</p>
        <form v-if="!submitted" class="card" @submit.prevent="submit">
          <label v-if="!base">Practice<select v-model="slug" required><option value="">Choose your practice</option><option v-for="p in practices" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <p v-if="!base && !practices.length">No practices are currently accepting online requests here. Contact your practice directly.</p>
          <label v-if="base">Patient<select v-model="form.patientId" required @change="selectPatient"><option value="">Choose patient</option><option v-for="p in patients" :key="p.id" :value="p.id">{{ p.data.name }}</option></select></label>
          <label>Your full name<input v-model="form.requesterName" required maxlength="200" autocomplete="name" /></label>
          <label v-if="!base">Patient’s full name<input v-model="form.patientName" required maxlength="200" /></label>
          <label>Relationship<select v-model="form.relationship" required><option value="self">My own records</option><option value="parent">Parent</option><option value="guardian">Legal guardian</option><option value="representative">Authorized representative</option></select></label>
          <label>Email<input v-model="form.email" type="email" required maxlength="254" autocomplete="email" /></label>
          <label>Phone<input v-model="form.phone" type="tel" required maxlength="50" autocomplete="tel" /></label>
          <label>Which records and dates would you like?<textarea v-model="form.scope" required maxlength="2000" placeholder="For example: visit summaries from January through June 2026, or all available records." /></label>
          <p>Please do not include diagnoses, treatment details, or identification documents. Staff will arrange delivery after review.</p>
          <label class="attestation"><input v-model="form.attested" type="checkbox" required /> I am the patient or am authorized to request records for this patient.</label>
          <button :disabled="busy || (!base && !slug)">{{ busy ? 'Submitting…' : 'Submit records request' }}</button>
        </form>
      </template>
      <section v-if="base">
        <h2>{{ manage ? 'Records Manager queue' : 'My requests' }}</h2>
        <p v-if="manage">Support coordinates follow-up in a separate ticket. Identity checks, authority review, and release decisions stay here.</p>
        <button class="outline" :disabled="busy" @click="load">Refresh requests</button>
        <p v-if="!rows.length">No records requests yet.</p>
        <article v-for="r in rows" :key="r.id" class="card" :class="{ focused: r.id === requestId }">
          <h3>{{ r.data.patientName }}</h3><p>{{ label(r.data.status) }} · {{ new Date(r.createdAt).toLocaleDateString() }}</p>
          <p>{{ r.data.scope }}</p><p v-if="r.data.response">{{ r.data.response }}</p>
          <template v-if="manage">
            <p><strong>{{ r.data.unassigned ? 'Unassigned' : 'Assigned to ' + (managers.find(m => m.id === r.data.assignedAccountId)?.name || 'Records Manager') }}</strong>
              · Internal follow-up: {{ r.data.followUpAt ? new Date(r.data.followUpAt).toLocaleDateString() : 'Pending' }}
              <strong v-if="r.data.overdue"> · Follow-up overdue</strong>
            </p>
            <p>{{ r.data.supportTicketId ? 'Support ticket #' + r.data.supportTicketId : 'Support routing pending — automatic retries run every 15 minutes.' }}</p>
            <form v-if="actions[r.data.status]" @submit.prevent="assign(r)">
              <label>Assign to<select v-model="assignments[r.id]" required><option value="">Choose Records Manager</option><option v-for="m in managers" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
              <button class="outline" :disabled="busy">Assign request</button>
            </form>
            <p>{{ r.data.requesterName }} · {{ r.data.relationship }} · {{ r.data.email }} · {{ r.data.phone }}</p>
            <p>Source: {{ r.data.source }}. Identity: {{ label(r.data.identityMethod || 'not_verified') }}.</p>
            <p v-if="r.data.deliveryReference">Delivery reference: {{ r.data.deliveryReference }}</p>
            <form v-if="actions[r.data.status]" @submit.prevent="save(r)">
              <label>Next status<select v-model="edits[r.id].status" required><option value="">Choose update</option><option v-for="status in actions[r.data.status]" :key="status" :value="status">{{ label(status) }}</option></select></label>
              <template v-if="edits[r.id].status === 'pending_review'">
                <p>Match the request to the correct chart. Use contact information independently retrieved from the chart, rather than relying on the information supplied in this request.</p>
                <label>Verification method<select v-model="edits[r.id].identityMethod" required><option value="on_file_callback">Callback using contact information on file</option><option value="in_person">In person</option></select></label>
                <label class="attestation"><input v-model="edits[r.id].identityConfirmed" type="checkbox" required /> I verified the requester’s identity.</label>
              </template>
              <label v-if="edits[r.id].status === 'approved'" class="attestation"><input v-model="edits[r.id].authorityConfirmed" type="checkbox" required /> I reviewed the requester’s authority, the requested records, and any applicable release restrictions.</label>
              <label v-if="edits[r.id].status === 'fulfilled'">Secure delivery reference<input v-model="edits[r.id].deliveryReference" required maxlength="500" placeholder="Reference to completed delivery in the chart" /></label>
              <p v-if="r.data.source === 'website'">Website requesters cannot see portal updates. Contact the verified requester directly with the outcome; saving here does not send email or text.</p>
              <label>Update for requester<textarea v-model="edits[r.id].response" required maxlength="2000" /></label>
              <p v-if="edits[r.id].status === 'fulfilled'">Record completion only after delivering the reviewed records through an approved secure channel. This button does not send records.</p>
              <button :disabled="busy">Save update</button>
            </form>
          </template>
        </article>
      </section>
    </template>
  </main>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { api } from './api.js';
const props = defineProps({ base: { type: String, default: '' }, manage: Boolean, requestId: { type: String, default: '' }, patients: { type: Array, default: () => [] } });
const managers = ref([]), assignments = ref({});
const practices = ref([]), rows = ref([]), edits = ref({}), slug = ref(''), error = ref(''), notice = ref(''), busy = ref(false), loading = ref(true), submitted = ref(false);
const form = ref({ patientId: '', patientName: '', requesterName: '', relationship: 'self', email: '', phone: '', scope: '', attested: false });
const actions = { pending_verification: ['pending_review', 'closed'], pending_review: ['approved', 'closed'], approved: ['fulfilled', 'closed'] };
const label = value => value.replaceAll('_', ' ');
function selectPatient() { form.value.patientName = props.patients.find(p => p.id === form.value.patientId)?.data.name || ''; }
async function load() {
  error.value = '';
  try {
    if (props.base) {
      rows.value = await api(`${props.base}/${props.manage ? 'requests' : 'mine'}`);
      if (props.manage) {
        managers.value = (await api(`${props.base}/options`)).managers;
        assignments.value = Object.fromEntries(rows.value.map(r => [r.id, r.data.assignedAccountId || '']));
        rows.value.sort((a, b) => Number(b.id === props.requestId) - Number(a.id === props.requestId) || Number(b.data.overdue || b.data.unassigned) - Number(a.data.overdue || a.data.unassigned));
      }
      edits.value = Object.fromEntries(rows.value.map(r => [r.id, { status: '', response: '', identityMethod: 'on_file_callback', identityConfirmed: false, authorityConfirmed: false, deliveryReference: '' }]));
    } else practices.value = await api('/practices');
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
async function submit() {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const result = await api(props.base ? `${props.base}/${props.manage ? 'requests' : 'mine'}` : `/public/${encodeURIComponent(slug.value)}`, { method: 'POST', body: form.value });
    submitted.value = true;
    notice.value = result.message || 'Your records request was submitted for review. You can track its progress below.';
    if (props.base) await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function assign(r) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await api(`${props.base}/${props.manage ? 'requests' : 'mine'}/${r.id}/assignment`, { method: 'PUT', body: { accountId: assignments.value[r.id] } }); await load(); notice.value = 'Request assigned.'; }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function save(r) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await api(`${props.base}/${props.manage ? 'requests' : 'mine'}/${r.id}`, { method: 'PATCH', body: { ...edits.value[r.id], revision: r.revision } }); await load(); notice.value = 'Request updated.'; }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
onMounted(load);
</script>
<style scoped>
.records-requests input, .records-requests select, .records-requests textarea { width: 100%; padding: 10px; border: 1px solid #aeb6b4; border-radius: 6px; font: inherit; }
.records-requests button { padding: 10px 16px; border: 1px solid #23554b; background: #23554b; color: white; border-radius: 6px; cursor: pointer; }
.records-requests button:disabled { opacity: .55; cursor: wait; }
.records-requests .card { padding: 20px; border: 1px solid #d5dcda; border-radius: 12px; background: white; }
.records-requests { max-width: 850px; margin: auto; padding: 24px; }
.card { margin: 20px 0; }
.focused { outline: 2px solid #8a6a32; }
label { display: grid; gap: 6px; margin: 14px 0; }
.attestation { display: flex; align-items: flex-start; gap: 10px; }
.attestation input { width: auto; }
</style>
