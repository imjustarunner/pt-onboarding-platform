<template>
  <main class="records-requests" :class="{ 'public-records': !base }">
    <header class="records-header">
      <a class="records-brand" href="/auricwell" aria-label="AuricWell home"><span class="brand-mark"><img src="/auricwell/logo.png" alt="" width="96" height="96" /></span><span>AuricWell</span></a>
      <span class="header-label">Records center</span>
      <RouterLink v-if="!base" class="sign-in" to="/my-records">Sign in <span aria-hidden="true">↗</span></RouterLink>
    </header>
    <div class="records-layout">
    <div class="records-intro">
      <p class="eyebrow">YOUR CARE. YOUR RECORDS.</p>
      <h1>{{ manage ? 'Records requests' : 'Request my records' }}</h1>
      <p class="lead">Request a copy of your records or records for someone you are authorized to represent. Your practice reviews every request before release.</p>
      <aside v-if="!base" class="what-next" aria-label="What happens next">
        <h2>A little clarity on what comes next.</h2>
        <ol>
          <li><strong>Tell us what you need</strong><span>Choose your practice and the records you’d like to receive.</span></li>
          <li><strong>We confirm it’s you</strong><span>Your practice verifies your identity using contact information already on file or in person. A parent or representative’s authority is reviewed separately.</span></li>
          <li><strong>Your practice arranges delivery</strong><span>The records team reviews your request and coordinates secure delivery.</span></li>
        </ol>
        <p>Already have an account? <RouterLink to="/my-records">Sign in to request and track your records.</RouterLink></p>
      </aside>
    </div>
    <div class="records-content">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Loading…</p>
    <template v-else>
      <template v-if="!manage">
        <form v-if="!submitted" class="card request-form" @submit.prevent="submit">
          <div class="form-heading"><span class="eyebrow">RECORDS REQUEST</span><h2>How can we help?</h2><p>Complete the details below to get started.</p></div>
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
    </div>
    </div>
    <footer v-if="!base" class="records-footer"><span>AuricWell</span><span>Thoughtful tools for the work of care.</span><a href="/auricwell">About AuricWell ↗</a></footer>
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
.records-requests { color:#112044; font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; margin:auto; padding:24px; }
.records-requests *, .records-requests *::before { box-sizing:border-box; }
.public-records { max-width:none; padding:0; background:radial-gradient(ellipse at 0 30%,#eef4fd,transparent 55%),#f8fafd; min-height:100vh; }
.records-header { display:flex; align-items:center; gap:24px; padding:16px 0; border-bottom:1px solid #e3eaf3; }
.public-records .records-header { padding:16px max(24px,calc((100% - 1200px)/2)); background:#fff; }
.records-brand { display:inline-flex; align-items:center; gap:8px; font-size:27px; font-weight:720; letter-spacing:-1px; text-decoration:none; }
.brand-mark { display:block; width:48px; height:49px; overflow:hidden; position:relative; }
.brand-mark img { position:absolute; width:96px; height:96px; max-width:none; object-fit:contain; left:-24px; top:-16px; }
.header-label { border-left:1px solid #dce4ef; padding-left:24px; color:#5b6982; font-size:14px; }
.records-requests a { color:#0649ce; text-underline-offset:3px; }
.records-requests .records-brand { color:#082761; }
.sign-in { margin-left:auto; padding:10px 18px; border:1px solid #bdcdeb; border-radius:7px; text-decoration:none; font-size:14px; font-weight:600; white-space:nowrap; }
.records-layout { max-width:1200px; margin:auto; padding:36px 0; }
.public-records .records-layout { display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr); align-items:start; gap:72px; padding:64px 24px; max-width:1248px; }
.records-intro { padding-top:12px; }
.records-requests .eyebrow { color:#5277b5; font-size:11px; font-weight:700; letter-spacing:2px; margin:0 0 16px; }
.records-requests h1 { font-size:clamp(36px,4vw,54px); line-height:1.08; letter-spacing:-2px; color:#0d1d43; margin:0 0 24px; font-weight:650; }
.records-requests p { line-height:1.7; color:#5b6982; margin:0 0 18px; }
.records-requests .lead { font-size:17px; }
.what-next { margin-top:36px; border-top:2px solid #ba891e; padding-top:26px; }
.records-requests h2 { font-size:23px; letter-spacing:-.6px; color:#0d1d43; margin:0 0 18px; line-height:1.3; }
.what-next h2 { font-size:20px; }
.what-next ol { padding:0; margin:24px 0; list-style:none; counter-reset:records-step; }
.what-next li { counter-increment:records-step; position:relative; padding:0 0 24px 42px; font-size:14px; line-height:1.65; }
.what-next li::before { content:counter(records-step,decimal-leading-zero); position:absolute; left:0; top:0; color:#a07318; font-size:12px; font-weight:700; }
.what-next strong, .what-next li span { display:block; }
.what-next li span { color:#5b6982; margin-top:4px; }
.what-next > p { font-size:14px; }
.records-content { min-width:0; }
.records-requests .card { padding:30px; border:1px solid #e0e7f1; border-radius:16px; background:white; box-shadow:0 8px 32px #18386808; margin:20px 0; }
.records-requests .request-form { margin-top:0; }
.form-heading { padding-bottom:18px; margin-bottom:22px; border-bottom:1px solid #e3eaf3; }
.form-heading .eyebrow { display:block; margin-bottom:10px; }
.form-heading h2 { margin-bottom:8px; }
.form-heading p { font-size:14px; margin-bottom:0; }
.records-requests label { display:grid; gap:8px; margin:18px 0; font-size:14px; font-weight:550; color:#263958; }
.records-requests input, .records-requests select, .records-requests textarea { width:100%; min-width:0; padding:12px; border:1px solid #bcc9dc; background:#fff; color:#112044; border-radius:7px; font:inherit; font-size:16px; }
.records-requests textarea { min-height:100px; resize:vertical; }
.records-requests input::placeholder, .records-requests textarea::placeholder { color:#64738b; }
.records-requests :is(input,select,textarea,button,a):focus-visible { outline:3px solid #ba891e; outline-offset:3px; }
.records-requests button { padding:13px 20px; border:1px solid #0649ce; background:#0649ce; color:white; border-radius:7px; cursor:pointer; font:inherit; font-weight:600; font-size:14px; }
.records-requests button:hover:not(:disabled) { background:#073baa; }
.records-requests button:disabled { opacity:.55; cursor:not-allowed; }
.request-form > button { width:100%; margin-top:8px; }
.request-form > p { font-size:13px; }
.records-requests button.outline { background:white; color:#0649ce; }
.records-requests .focused { outline:2px solid #ba891e; }
.records-requests .attestation { display:flex; align-items:flex-start; gap:10px; font-weight:400; line-height:1.6; }
.records-requests .attestation input { width:17px; height:17px; flex-shrink:0; margin-top:3px; accent-color:#0649ce; }
.records-requests .error { color:#922c2c; background:#fff2f2; padding:16px; border-radius:8px; }
.records-requests .notice { color:#164737; background:#eaf6ef; padding:20px; border-radius:8px; }
.records-footer { display:flex; align-items:center; gap:20px; max-width:1200px; margin:auto; padding:26px 24px; border-top:1px solid #dce4ef; font-size:12px; color:#5b6982; }
.records-footer > span:first-child { color:#082761; font-size:17px; font-weight:700; }
.records-footer a { margin-left:auto; }
@media (max-width:850px) { .public-records .records-layout { grid-template-columns:1fr; gap:20px; padding-top:32px; } .what-next { margin-top:24px; } .what-next ol { margin-bottom:0; } }
@media (max-width:480px) { .header-label { display:none; } .records-header { gap:12px; } .records-brand { font-size:24px; } .public-records .records-layout { padding:28px 18px; } .records-requests .card { padding:22px 18px; } .records-footer { flex-wrap:wrap; gap:10px 20px; } .records-footer a { margin-left:0; } }
</style>
