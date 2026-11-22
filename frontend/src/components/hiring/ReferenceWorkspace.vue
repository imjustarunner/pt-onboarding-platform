<template>
  <section>
    <p>Confidential reference answers and contact notes · People Operations and administrators only. Applicants see completion status and method only.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <p v-if="loading">Loading references…</p>
    <template v-else>
      <nav class="reference-tabs" aria-label="References"><button v-for="(person, index) in references" :key="index" type="button" :aria-pressed="selected === index" @click="selectReference(index)">{{ person.name || `Reference ${index + 1}` }}</button></nav>
      <article v-if="person" class="reference-card">
        <h3>{{ person.name || `Reference ${selected + 1}` }}</h3>
        <p>{{ person.email || 'No email' }} · {{ person.phone || person.phone_number || 'No phone' }}</p>
        <p><strong>{{ latest?.declined ? 'Unable to provide a reference' : completed ? 'Completed' : latest?.status || 'Not yet requested' }}</strong><span v-if="phoneCompletion"> · By phone with People Operations</span></p>
        <p v-if="latest">Deadline: {{ time(latest.token_expires_at) }} · Sent: {{ time(latest.sent_at) }}<br/>Email open detected: {{ time(latest.email_opened_at) }} · Link opened: {{ time(latest.link_opened_at) }}<br/>48-hour reminder: {{ time(latest.reminder_48h_sent_at) }} · Final reminder: {{ time(latest.reminder_24h_sent_at) }}</p>
        <p v-else>When emailed, the deadline defaults to five business days (Monday–Friday), with a reminder after 48 hours.</p>
        <label v-if="!latest || latest.status !== 'sent'">Reference deadline (end of day, UTC)<input v-model="deadline" type="date" :min="new Date().toISOString().slice(0,10)" /></label>
        <small>Email opens are best-effort: mail clients may block images or load them automatically.</small>
        <p><button type="button" :disabled="busy || !questionnaire || !person.email || completed || latest?.declined" @click="prepare">{{ latest?.status === 'sent' ? 'Email reference link again' : 'Email online reference link' }}</button></p>
        <section v-if="preparing && prepared" class="reference-prepare" aria-label="Prepare reference request">
          <h4>Review questions for {{ person.name }}</h4>
          <p>The applicant supplied this contact during their application. Send when you are ready to request a reference.</p>
          <p v-if="latest?.status === 'sent'">This reminder uses the questions already sent to this reference.</p>
          <fieldset :disabled="busy || latest?.status === 'sent'">
            <legend>Rating questions</legend>
            <div v-for="trait in prepared.traits" :key="trait.key">
              <label>Rating title<input v-model="trait.label" required maxlength="120" /></label>
              <label>Question<textarea v-model="trait.question" required maxlength="1000" rows="2" /></label>
              <label>Helpful example<input v-model="trait.example" maxlength="1000" /></label>
            </div>
            <div v-for="(question, index) in prepared.questions" :key="question.key">
              <label>Written question<textarea v-model="question.label" maxlength="1000" rows="2" /></label>
              <label><input v-model="question.required" type="checkbox" /> Required</label>
              <button type="button" @click="prepared.questions.splice(index, 1)">Remove question</button>
            </div>
            <button type="button" :disabled="prepared.questions.length >= 10" @click="addQuestion">Add written question</button>
          </fieldset>
          <p>The form also asks how long they have known the applicant, professional strengths, development areas and rehire preference.</p>
          <button type="button" :disabled="busy" @click="send">{{ busy ? 'Sending…' : 'Send reference request' }}</button>
          <button type="button" :disabled="busy" @click="preparing = false">Cancel</button>
        </section>
        <section v-for="request in requestsForReference.filter(r => r.responses_json)" :key="request.id">
          <h4>Online answers · {{ time(request.completed_at) }}</h4><ReferenceAnswers :answers="request.responses_json" :questionnaire="request.questionnaire || questionnaire" />
        </section>
        <h4>Contact log and phone reference</h4>
        <form @submit.prevent="save">
          <label>Contact method<select v-model="draft.method"><option value="phone">Phone</option><option value="email">Email</option><option value="note">Internal note</option></select></label>
          <label>Outcome<select v-model="draft.outcome"><option value="note">Note</option><option value="no_answer">No answer</option><option value="voicemail">Left voicemail</option><option value="follow_up">Follow-up needed</option><option v-if="draft.method === 'phone'" value="completed">Completed by phone</option></select></label>
          <label>Contact notes<textarea v-model="draft.note" rows="3" maxlength="8000" :required="!draft.useQuestionnaire" placeholder="Record the call, date/time if different, and any follow-up." /></label>
          <label v-if="draft.method === 'phone' && draft.outcome === 'completed'"><input v-model="draft.useQuestionnaire" type="checkbox" /> Record the same questions used online</label>
          <ReferenceQuestionnaire v-if="draft.method === 'phone' && draft.outcome === 'completed' && draft.useQuestionnaire && questionnaire" v-model="answers" :questionnaire="questionnaire" />
          <p v-if="draft.outcome === 'completed'">The applicant will be notified that this reference was completed by phone. Notes and answers remain private.</p>
          <button :disabled="busy">{{ busy ? 'Saving…' : 'Save contact log' }}</button>
        </form>
        <article v-for="contact in contactsForReference" :key="contact.id" class="contact-entry">
          <strong>{{ contact.outcome === 'completed' ? 'Completed by phone' : contact.outcome.replaceAll('_', ' ') }}</strong> · {{ contact.contact_method }} · {{ time(contact.created_at) }} · {{ contact.author_name }}
          <p class="note">{{ contact.note }}</p><ReferenceAnswers v-if="contact.responses_json" :answers="contact.responses_json" :questionnaire="contact.questionnaire || questionnaire" />
        </article>
        <details><summary>Email and request history</summary><article v-for="request in requestsForReference" :key="request.id"><p>#{{ request.id }} · {{ request.status }} · Sent {{ time(request.sent_at) }} · Deadline {{ time(request.token_expires_at) }} · Completed {{ time(request.completed_at) }}</p></article>
          <article v-for="event in eventsForReference" :key="event.id"><p>{{ time(event.created_at) }} · {{ event.metadata?.kind?.replaceAll('_', ' ') }} · {{ event.metadata?.outcome }}</p><p v-if="event.metadata?.error">{{ event.metadata.error }}</p><details v-if="event.metadata?.textBody"><summary>{{ event.metadata.subject || 'Email text' }}</summary><pre>{{ event.metadata.textBody }}</pre></details></article>
        </details>
      </article><p v-else>No references were submitted.</p>
    </template>
  </section>
</template>
<script setup>
import { ref, reactive, computed, watch } from 'vue';
import api from '../../services/api';
import ReferenceQuestionnaire from './ReferenceQuestionnaire.vue';
import ReferenceAnswers from './ReferenceAnswers.vue';
const props = defineProps({ userId: [Number, String], agencyId: [Number, String], references: { type: Array, default: () => [] } });
const selected = ref(0), loading = ref(false), busy = ref(false), error = ref(''), message = ref('');
const requests = ref([]), contacts = ref([]), events = ref([]), questionnaire = ref(null);
const draft = reactive({ method: 'phone', outcome: 'note', note: '', useQuestionnaire: false });
const answers = ref({});
const preparing = ref(false);
const prepared = ref(null);
function defaultDeadline() { const date = new Date(); for (let days = 5; days > 0;) { date.setUTCDate(date.getUTCDate() + 1); if (![0,6].includes(date.getUTCDay())) days--; } return date.toISOString().slice(0,10); }
const deadline = ref(defaultDeadline());
const person = computed(() => props.references[selected.value]);
const requestsForReference = computed(() => requests.value.filter(r => Number(r.reference_index) === selected.value).sort((a,b) => b.id - a.id));
const contactsForReference = computed(() => contacts.value.filter(r => Number(r.reference_index) === selected.value));
const eventsForReference = computed(() => events.value.filter(r => Number(r.metadata?.referenceIndex) === selected.value));
const latest = computed(() => requestsForReference.value[0]);
const phoneCompletion = computed(() => contactsForReference.value.some(r => r.outcome === 'completed'));
const completed = computed(() => phoneCompletion.value || requestsForReference.value.some(r => r.status === 'completed'));
const time = value => value ? new Date(value).toLocaleString() : '—';
const options = () => ({ params: { agencyId: props.agencyId } });
function selectReference(index) { selected.value = index; preparing.value = false; reset(); }
function reset() { preparing.value = false; prepared.value = null; deadline.value = defaultDeadline(); Object.assign(draft, { method:'phone', outcome:'note', note:'', useQuestionnaire:false }); answers.value = { referenceName: person.value?.name || '', relationshipType:'', relationshipOther:'', wouldHire:'', traits:{}, hireReason:'', additionalComments:'' }; }
watch(() => draft.method, value => { if (value !== 'phone' && draft.outcome === 'completed') draft.outcome = 'note'; });
async function load() {
  loading.value = true; error.value = '';
  try {
    const base = `/hiring/candidates/${props.userId}`;
    const [r, w, e] = await Promise.all([api.get(`${base}/reference-requests`, options()), api.get(`${base}/reference-workspace`, options()), api.get(`${base}/reference-activity`, options())]);
    requests.value = r.data; contacts.value = w.data.contacts; questionnaire.value = w.data.questionnaire; events.value = e.data;
  } catch(e) { error.value = e.response?.data?.error?.message || 'Could not load references.'; }
  finally { loading.value = false; }
}
function prepare() {
  prepared.value = JSON.parse(JSON.stringify(latest.value?.questionnaire || questionnaire.value));
  prepared.value.questions ||= [];
  preparing.value = true;
}
function addQuestion() {
  prepared.value.questions.push({ key: `question_${Date.now()}_${prepared.value.questions.length}`, label: '', required: false });
}
async function send() {
  busy.value = true; error.value = ''; message.value = '';
  try { const { data } = await api.post(`/hiring/candidates/${props.userId}/reference-requests/send`, { referenceIndex: selected.value, onlyIfNotSent: false, deadline: latest.value?.status === 'sent' ? null : deadline.value, questionnaire: prepared.value }, options()); preparing.value = false; await load(); message.value = data.sent?.length ? 'Reference email sent.' : 'This reference was already completed.'; }
  catch(e) { error.value = e.response?.data?.error?.message || 'Could not send the reference email.'; }
  finally { busy.value = false; }
}
async function save() {
  busy.value = true; error.value = ''; message.value = '';
  try { await api.post(`/hiring/candidates/${props.userId}/reference-contacts`, { referenceIndex: selected.value, ...draft, responses: draft.method === 'phone' && draft.outcome === 'completed' && draft.useQuestionnaire ? answers.value : null }, options()); reset(); await load(); message.value = 'Contact saved.'; }
  catch(e) { error.value = e.response?.data?.error?.message || 'Could not save the contact log.'; }
  finally { busy.value = false; }
}
watch(() => [props.userId, props.agencyId], async () => { selected.value = 0; reset(); await load(); }, { immediate:true });
</script>
<style scoped>
.reference-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; } button { padding:10px 16px; cursor:pointer; border:1px solid #b8c9bf; border-radius:8px; } button[aria-pressed=true] { background:#176b53; color:white; } button:disabled { opacity:.6; cursor:default; } .reference-card { padding:20px; border:1px solid #dce6e1; border-radius:12px; } label { display:block; margin:14px 0; } input:not([type=checkbox]), select, textarea { display:block; padding:10px; max-width:100%; } textarea { width:100%; box-sizing:border-box; } .reference-prepare { margin:20px 0; padding:20px; background:#f5f8f6; border-radius:12px; } fieldset { border:1px solid #dce6e1; border-radius:10px; } .contact-entry { border-top:1px solid #dce6e1; padding:16px 0; } .note, pre { white-space:pre-wrap; overflow-wrap:anywhere; } .error { color:#b42318; }
</style>
