<template>
  <section class="interview-panel" aria-label="Plotline interview details">
    <p v-if="loading" role="status">Loading interview…</p>
    <p v-else-if="loadError" role="alert">{{ loadError }} <button type="button" @click="load">Retry</button></p>
    <template v-else-if="interview">
      <header class="interview-overview">
        <div class="interview-agency"><img v-if="agencyLogo" :src="agencyLogo" alt="" />{{ interview.agencyName }}</div>
        <h2>{{ interview.candidateName }}</h2>
        <p class="interview-role">{{ interview.jobTitle }} <span v-if="interview.jobLocation">· {{ interview.jobLocation }}</span></p>
        <dl class="interview-facts">
          <div><dt>When</dt><dd>{{ when }}</dd></div>
          <div v-if="interview.location"><dt>Format</dt><dd>{{ interview.location }}</dd></div>
          <div><dt>Scheduled by</dt><dd>{{ interview.scheduledBy || 'Organizer unavailable' }}</dd></div>
          <div v-if="interview.status === 'CANCELLED'"><dt>Status</dt><dd>Canceled</dd></div>
        </dl>
        <details v-if="interview.canManage" class="interview-date">
          <summary>Reschedule interview</summary>
          <form class="interview-action" @submit.prevent="reschedule">
            <label>New start ({{ interview.timeZone }}) <input v-model="newStart" type="datetime-local" required /></label>
            <button type="submit" :disabled="busy || !newStart">Save time and notify attendees</button>
          </form>
        </details>
      </header>
      <nav class="interview-tabs" aria-label="Interview sections">
        <button v-for="tab in tabs" :key="tab" type="button" :aria-pressed="section === tab" @click="section = tab">{{ tab }}</button>
      </nav>
      <div v-if="section === 'Overview'" class="interview-columns">
        <section>
          <h3>Resume summary</h3>
          <p v-if="briefLoading" role="status">Loading candidate materials…</p>
          <p v-else-if="briefError" role="alert">{{ briefError }} <button type="button" @click="loadBrief">Retry</button></p>
          <ul v-else-if="resumeBullets.length"><li v-for="bullet in resumeBullets" :key="bullet">{{ bullet }}</li></ul>
          <p v-else>No resume summary saved.</p>
          <div v-if="brief.documents?.length" class="interview-file-actions">
            <button v-for="doc in brief.documents" :key="doc.id" type="button" :disabled="openingDocument"
              @click="loadDocument(doc)">{{ doc.title || (doc.doc_type === 'resume' ? 'Resume' : 'Cover letter') }}</button>
          </div>
          <p v-if="documentError" role="alert">{{ documentError }}</p>
          <a v-if="documentUrl" :href="documentUrl" target="_blank" rel="noopener noreferrer">Open {{ documentTitle }} ↗</a>
          <details v-if="brief.coverLetter"><summary>Cover letter</summary><p class="interview-cover-letter">{{ brief.coverLetter }}</p></details>
        </section>
        <section>
          <h3>Attendees</h3>
          <ul class="interview-people">
            <li v-for="person in interview.participants" :key="person.id">
              <span><strong>{{ person.name }}</strong><small>{{ person.role }}</small></span>
              <span class="interview-rsvp" :data-response="person.rsvp">{{ rsvpLabels[person.rsvp] || 'Invited · Awaiting RSVP' }}</span>
            </li>
          </ul>
          <form v-if="interview.canRsvp" class="interview-action" @submit.prevent="saveRsvp">
            <label>My RSVP <select v-model="myRsvp">
              <option disabled value="">Choose response</option>
              <option v-for="(label, value) in rsvpLabels" :key="value" :value="value">{{ label }}</option>
            </select></label>
            <button type="submit" :disabled="busy || !myRsvp || myRsvp === myParticipant?.rsvp">Save RSVP</button>
          </form>
          <form v-if="interview.canManage" class="interview-action" @submit.prevent="invite">
            <label>Add interviewer <select v-model="staffId">
              <option :value="0" disabled>Select a staff member</option>
              <option v-for="person in interview.availableStaff" :key="person.id" :value="person.id">{{ person.name }}</option>
            </select></label>
            <button type="submit" :disabled="busy || !staffId">Send invitation</button>
          </form>
        </section>
      </div>
      <section v-else-if="section === 'Questions'">
        <h3>Planned questions</h3>
        <p v-if="prepLoading" role="status">Loading interview guide…</p>
        <p v-else-if="prepError" role="alert">{{ prepError }} <button type="button" @click="loadPreparation">Retry</button></p>
        <template v-else>
          <div v-for="group in questionGroups" :key="group.key" class="question-group">
            <h4>{{ group.label }}</h4>
            <p v-if="group.item">{{ group.item }}</p>
            <p v-if="group.prompt">{{ group.prompt }}</p>
            <label v-for="(question, index) in group.questions" :key="question.key" class="interview-question">
              <span class="sr-only">{{ group.label }} question {{ index + 1 }}</span>
              <textarea v-if="preparationEditable" v-model="draftQuestions[question.key]" rows="2" maxlength="2000" />
              <span v-else>{{ question.text }}</span>
            </label>
          </div>
          <template v-if="preparationEditable">
            <label class="interview-question">Add a planned question <textarea v-model="newQuestion" rows="2" maxlength="2000" /></label>
            <button type="button" :disabled="busy || (!questionPatches.length && !newQuestion.trim())" @click="saveQuestions">Save questions</button>
          </template>
        </template>
      </section>
      <section v-else-if="section === 'Scorecard'">
        <h3>Your ratings</h3>
        <p v-if="prepLoading" role="status">Loading scorecard…</p>
        <p v-else-if="prepError" role="alert">{{ prepError }} <button type="button" @click="loadPreparation">Retry</button></p>
        <template v-else>
          <ul class="interview-scorecard">
            <li v-for="criterion in criteria" :key="criterion.key">
              <label>{{ criterion.label }}
                <select v-model.number="ratings[criterion.key]" :disabled="!preparationEditable">
                  <option :value="0">Unrated</option>
                  <option v-for="n in 4" :key="n" :value="n">{{ n }} of 4</option>
                </select>
              </label>
              <small v-if="teamRatings[criterion.key]">Team average {{ Number(teamRatings[criterion.key]).toFixed(1) }} of 4</small>
            </li>
          </ul>
          <button v-if="preparationEditable" type="button" :disabled="busy || !criteria.length" @click="savePreparation({ myRatings: ratings }, 'Ratings saved.')">Save ratings</button>
        </template>
      </section>
      <section v-else-if="section === 'Reminders'" class="interview-reminders">
        <h3>Interview reminders</h3>
        <form v-if="interview.canManage" @submit.prevent="saveReminders">
          <fieldset>
            <legend>Send reminders before the interview</legend>
            <label v-for="choice in offsetChoices" :key="choice.value"><input v-model="reminders" type="checkbox" :value="choice.value" /> {{ choice.label }}</label>
            <div class="interview-action">
              <label>Custom minutes before <input v-model.number="customMinutes" type="number" min="1" max="10080" /></label>
              <button type="button" :disabled="!Number.isInteger(customMinutes) || customMinutes < 1 || customMinutes > 10080 || reminders.length >= 10" @click="addReminderOffset">Add time</button>
            </div>
          </fieldset>
          <label><input v-model="emailReminders" type="checkbox" /> Email reminders to the candidate and interviewing team</label>
          <label v-if="interview.smsProgram?.available"><input v-model="smsReminders" type="checkbox" /> Text the candidate</label>
          <InterviewSmsConsent :key="consentKey" v-model="smsConsent" :program="interview.smsProgram" :status="interview.smsConsentStatus || ''" :disabled="busy" />
          <button type="submit" :disabled="busy || (smsConsent && !smsConsent.verbalConsent)">Save reminders</button>
        </form>
        <p v-else>Reminder settings are managed by the organizer or hiring staff.</p>
        <p>Reminders include the join link.</p>
      </section>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import InterviewSmsConsent from '../hiring/InterviewSmsConsent.vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { buildQuickResumeBullets } from '../../utils/hiringResumeSummaryBullets.js';

const props = defineProps({ eventId: { type: Number, required: true }, agencyLogo: String });
const emit = defineEmits(['rsvp', 'calendar-changed', 'unlinked']);
const auth = useAuthStore();
const tabs = ['Overview', 'Questions', 'Scorecard', 'Reminders'];
const section = ref('Overview');
const interview = ref(null);
const brief = ref({});
const preparation = ref(null);
const draftQuestions = ref({});
const newQuestion = ref('');
const newStart = ref('');
const ratings = ref({});
const reminders = ref([]);
const customMinutes = ref(null);
const extraOffsets = ref([]);
const consentKey = ref(0);
const emailReminders = ref(true);
const smsReminders = ref(false);
const smsConsent = ref(null);
const staffId = ref(0);
const myRsvp = ref('');
const busy = ref(false);
const loading = ref(true);
const briefLoading = ref(false);
const prepLoading = ref(false);
const loadError = ref('');
const briefError = ref('');
const prepError = ref('');
const error = ref('');
const notice = ref('');
const openingDocument = ref(false);
const documentError = ref('');
const documentUrl = ref('');
const documentTitle = ref('');
const rsvpLabels = { accepted: 'Attending', declined: 'Not Attending', maybe: 'Maybe Attending' };
const offsets = [{ value: 10080, label: '7 days' }, { value: 1440, label: '24 hours' }, { value: 60, label: '1 hour' }, { value: 5, label: '5 minutes' }];
const offsetChoices = computed(() => [...offsets, ...[...new Set([...(interview.value?.reminders || []), ...extraOffsets.value])]
  .filter(value => !offsets.some(choice => choice.value === value))
  .map(value => ({ value, label: value === 'business_days_3' ? '3 business days' : value + ' minutes' }))]);
const endpoint = computed(() => '/hiring/interview-hub/calendar/' + props.eventId);
const artifactPath = computed(() => '/hiring/interview-hub/interviews/' + interview.value.interviewId);
const myParticipant = computed(() => interview.value?.participants.find(person => Number(person.id) === Number(auth.user?.id)));
const resumeBullets = computed(() => buildQuickResumeBullets(brief.value.summary));
const questionGroups = computed(() => (preparation.value?.flow?.sections || []).filter(group => group.questions?.length || group.item || group.prompt));
const questionPatches = computed(() => questionGroups.value.flatMap(group => group.questions || [])
  .filter(question => question.key && draftQuestions.value[question.key]?.trim() !== question.text)
  .map(question => ({ key: question.key, original: question.text, text: draftQuestions.value[question.key]?.trim() })));
const criteria = computed(() => preparation.value?.flow?.scorecardCriteria || []);
const teamRatings = computed(() => preparation.value?.artifact?.scorecard_json?.ratings || {});
const preparationEditable = computed(() => interview.value?.status !== 'CANCELLED' && preparation.value?.interview?.status !== 'cancelled');
const when = computed(() => {
  if (!interview.value?.startsAt || !interview.value?.endsAt) return '';
  const formatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: interview.value.timeZone });
  return formatter.formatRange(new Date(interview.value.startsAt), new Date(interview.value.endsAt)) + ' · ' + interview.value.timeZone;
});
const message = (e, fallback) => e.response?.data?.error?.message || e.response?.data?.message || fallback;
const requestOptions = { skipGlobalLoading: true };

async function refreshDetails() {
  interview.value = (await api.get(endpoint.value, requestOptions)).data.data;
  myRsvp.value = rsvpLabels[myParticipant.value?.rsvp] ? myParticipant.value.rsvp : '';
  reminders.value = [...interview.value.reminders];
  emailReminders.value = interview.value.emailReminders;
  smsReminders.value = interview.value.smsReminders === true;
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    await refreshDetails();
    void loadBrief();
    void loadPreparation();
  } catch (e) {
    if (e.response?.data?.error?.code === 'interview_not_linked') emit('unlinked', props.eventId);
    else loadError.value = message(e, 'Could not load this interview.');
  } finally { loading.value = false; }
}

async function loadBrief() {
  briefLoading.value = true;
  briefError.value = '';
  try { brief.value = (await api.get(artifactPath.value + '/brief', requestOptions)).data.data; }
  catch (e) { briefError.value = message(e, 'Could not load candidate materials.'); }
  finally { briefLoading.value = false; }
}

async function loadDocument(doc) {
  openingDocument.value = true;
  documentError.value = '';
  documentUrl.value = '';
  try {
    const response = await api.get(artifactPath.value + '/documents/' + doc.id, requestOptions);
    const url = new URL(response.data.url);
    if (url.protocol !== 'https:') throw new Error('Document unavailable');
    documentUrl.value = url.href;
    documentTitle.value = doc.title || doc.original_name || 'document';
  } catch (e) { documentError.value = message(e, 'Could not open this document.'); }
  finally { openingDocument.value = false; }
}

function setPreparation(data) {
  preparation.value = data;
  draftQuestions.value = Object.fromEntries((data.flow?.sections || []).flatMap(group => group.questions || [])
    .filter(question => question.key).map(question => [question.key, question.text]));
  ratings.value = Object.fromEntries((data.flow?.scorecardCriteria || []).map(criterion =>
    [criterion.key, data.artifact?.my_scorecard?.[criterion.key] || 0]));
}

async function loadPreparation() {
  prepLoading.value = true;
  prepError.value = '';
  try { setPreparation((await api.get('/hiring/interview-hub/by-schedule-event/' + props.eventId, requestOptions)).data.data); }
  catch (e) { prepError.value = message(e, 'Could not load the questions and scorecard.'); }
  finally { prepLoading.value = false; }
}

async function save(action) {
  if (busy.value) return;
  busy.value = true;
  notice.value = '';
  error.value = '';
  try { await action(); }
  catch (e) { error.value = message(e, 'Could not save the interview change.'); }
  finally { busy.value = false; }
}

function saveRsvp() {
  return save(async () => {
    const response = myRsvp.value;
    await api.post('/team-meetings/' + props.eventId + '/my-rsvp', { response }, requestOptions);
    emit('rsvp', { eventId: props.eventId, response });
    await refreshDetails();
    notice.value = 'RSVP saved.';
  });
}

function reschedule() {
  return save(async () => {
    const { data } = (await api.patch(endpoint.value, { startsAt: newStart.value }, requestOptions)).data;
    newStart.value = '';
    emit('calendar-changed');
    await refreshDetails();
    notice.value = [
      'Interview rescheduled.',
      data.delivery?.sent ? 'Candidate notification sent.' : data.delivery?.reason,
      data.calendarWarning ? 'The external calendar copy could not be updated.' : ''
    ].filter(Boolean).join(' ');
  });
}

function invite() {
  return save(async () => {
    const { data } = (await api.patch(endpoint.value, { addInterviewerIds: [staffId.value] }, requestOptions)).data;
    staffId.value = 0;
    await refreshDetails();
    notice.value = [
      data.added ? 'Interview added to the interviewer’s schedule.' : 'This interviewer is already on the list.',
      data.added ? 'Invitation email queued.' : '',
      data.calendarWarning ? 'The external calendar copy could not be updated.' : ''
    ].filter(Boolean).join(' ');
  });
}

function addReminderOffset() {
  if (!extraOffsets.value.includes(customMinutes.value)) extraOffsets.value.push(customMinutes.value);
  if (!reminders.value.includes(customMinutes.value)) reminders.value.push(customMinutes.value);
  customMinutes.value = null;
}

function saveReminders() {
  return save(async () => {
    await api.patch(endpoint.value, {
      reminders: reminders.value, emailReminders: emailReminders.value,
      ...(interview.value.smsProgram?.available ? {
        smsReminders: smsReminders.value || !!smsConsent.value, smsConsent: smsConsent.value
      } : {})
    }, requestOptions);
    smsConsent.value = null;
    consentKey.value++;
    await refreshDetails();
    notice.value = 'Reminder settings saved.';
  });
}

function savePreparation(body, success) {
  return save(async () => {
    const { data } = (await api.put(endpoint.value + '/preparation', body, requestOptions)).data;
    setPreparation(data);
    if (body.questionPatches) newQuestion.value = '';
    notice.value = success;
  });
}

function saveQuestions() {
  const patches = [...questionPatches.value];
  if (newQuestion.value.trim()) patches.push({ key: 'calendar-' + crypto.randomUUID(), text: newQuestion.value.trim() });
  return savePreparation({ questionPatches: patches }, 'Interview questions saved.');
}

onMounted(load);
</script>

<style scoped>
.interview-panel { overflow-y: auto; min-width: 0; padding: 16px; color: var(--text-primary, #143328); }
.interview-overview { border: 1px solid var(--border-color, #cadbd2); border-left: 4px solid #427a61; border-radius: 12px; padding: 16px; background: var(--bg-secondary, #eff6f1); }
.interview-agency { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.interview-agency img { width: 27px; height: 27px; object-fit: contain; }
h2 { margin: 8px 0 2px; font-size: 1.6rem; }
h3 { margin: 0 0 10px; font-size: 1rem; }
h4, p { margin: 0 0 10px; }
.interview-role { font-weight: 600; }
.interview-facts { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 12px 0 0; }
dt { font-size: .8rem; }
dd { margin: 2px 0 0; font-weight: 600; }
.interview-tabs, .interview-file-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.interview-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.interview-columns > section { min-width: 0; border: 1px solid var(--border-color, #cadbd2); border-radius: 10px; padding: 12px; }
.interview-people, .interview-scorecard { margin: 0 0 12px; padding: 0; list-style: none; }
.interview-people li, .interview-scorecard li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border-color, #cadbd2); }
.interview-people small, .interview-scorecard small { display: block; }
.interview-rsvp { border-radius: 8px; padding: 3px 6px; background: var(--bg-secondary, #eef1ee); font-size: .78rem; }
.interview-rsvp[data-response="accepted"] { color: #145c41; background: #d7f1e3; }
.interview-rsvp[data-response="declined"] { color: #7d2632; background: #fbe4e8; }
.interview-rsvp[data-response="maybe"] { color: #653c06; background: #faeed2; }
.interview-action { display: flex; align-items: end; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.interview-action label, .interview-question { display: grid; gap: 4px; }
.interview-question, .question-group { margin-bottom: 8px; }
.interview-panel textarea { width: 100%; box-sizing: border-box; padding: 6px; resize: vertical; }
.interview-panel :is(button, select, textarea) { border: 1px solid var(--border-color, #b4c5bc); border-radius: 6px; color: inherit; background: var(--bg-card, #fff); font: inherit; }
.interview-panel :is(button, select) { min-height: 34px; padding: 4px 8px; }
.interview-panel button[aria-pressed="true"] { color: #fff; border-color: #215641; background: #215641; }
.interview-panel button:disabled { opacity: .55; }
.interview-panel fieldset { padding: 8px; margin-bottom: 8px; }
.interview-reminders label { display: inline-flex; align-items: center; margin: 0 8px 8px 0; }
.interview-date { margin-top: 10px; }
.interview-cover-letter { white-space: pre-wrap; }
.interview-panel p[role="alert"] { color: var(--danger, #a42737); }
@media(max-width: 630px) { .interview-columns { grid-template-columns: 1fr; } }
</style>
