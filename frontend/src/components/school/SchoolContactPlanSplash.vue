<template>
  <Teleport to="body">
    <aside v-if="plan?.eligible && !open && !locked" class="contact-plan-dock" aria-label="Family Welcome & Follow-Up">
      <button type="button" class="contact-plan-resume" @click="resume">
        <span class="contact-plan-dock-icon" aria-hidden="true">↗</span>
        <span><strong>{{ notice.startsWith('Example sent') ? 'Your example is ready' : FAMILY_WELCOME_NAME }}</strong><small>{{ notice || (plan.status === 'enabled' ? 'On · Review your welcome and follow-ups' : 'Introduce yourself to new families') }}</small></span>
        <span aria-hidden="true">⌃</span>
      </button>
      <RouterLink :to="settingsLocation" class="contact-plan-settings">Edit my family messages ↗</RouterLink>
      <RouterLink v-if="exampleConversationId && !plan.routing?.isSso" :to="exampleMessagesTo" class="contact-plan-inbox">Check Messages ↗</RouterLink>
    </aside>
    <div v-if="plan?.eligible && open && !locked" class="contact-plan-shade" @keydown="onKeydown">
      <section ref="panel" class="contact-plan-panel" role="dialog" aria-modal="true" aria-labelledby="contact-plan-title" aria-describedby="contact-plan-description" tabindex="-1">
        <aside class="contact-plan-story">
          <div class="contact-plan-brand"><SchoolCareBridgeBrand compact /></div>
          <div class="contact-plan-orbit" aria-hidden="true"><span>✉</span><i></i><b>✓</b></div>
          <p class="contact-plan-eyebrow">FAMILY WELCOME &amp; FOLLOW-UP</p>
          <h2>A thoughtful<br>first hello.</h2>
          <p>{{ FAMILY_WELCOME_TAGLINE }}</p>
          <ol class="contact-plan-journey"><li><span>01</span> Your welcome email</li><li><span>02</span> A follow-up text or email</li><li><span>03</span> A final email</li></ol>
          <div class="contact-plan-demo"><span aria-hidden="true">◉</span><div><strong>Connected to your school team</strong><small>Your introductions and follow-ups, together in SchoolCareBridge.</small></div></div>
        </aside>
        <div class="contact-plan-main">
          <header class="contact-plan-top"><span>{{ step === 'welcome' ? `${FAMILY_WELCOME_NAME.toUpperCase()} · ${slide + 1} OF ${SLIDES.length}` : 'MAKE IT YOURS' }}</span><button type="button" class="contact-plan-icon-button" :disabled="busy" @click="minimize" aria-label="Minimize Family Welcome">−</button></header>
          <template v-if="step === 'welcome'">
            <div class="contact-plan-welcome">
              <nav class="fw-dots" aria-label="Tour steps"><button v-for="(name, i) in SLIDES" :key="name" type="button" :aria-current="slide === i ? 'step' : undefined" :aria-label="`Step ${i + 1}: ${name}`" @click="slide = i"></button></nav>

              <template v-if="slide === 0">
                <span class="contact-plan-pill">{{ plan.mandatory ? 'Required by your organization' : 'New for school providers' }}</span>
                <h1 id="contact-plan-title">{{ FAMILY_WELCOME_NAME }}</h1>
                <p id="contact-plan-description">{{ FAMILY_WELCOME_TAGLINE }} When a new school client is assigned to you, SchoolCareBridge sends your welcome email to the parent or guardian, then follows up until you connect.</p>
                <ol class="fw-timeline">
                  <li><b>Right away</b> Your welcome email, with your profile link and your introduction PDF.</li>
                  <li><b>48 hours later</b> One follow-up: a text when the family allows texting, or your follow-up email.</li>
                  <li><b>96 hours later</b> Your final email, if there is still no reply.</li>
                </ol>
                <div class="contact-plan-benefits"><p><span aria-hidden="true">✓</span> A family reply stops the follow-ups.</p><p><span aria-hidden="true">✓</span> Replies come to you, and you get a private copy of each email.</p><p><span aria-hidden="true">✓</span> Every contact is recorded in SchoolCareBridge.</p></div>
              </template>

              <template v-else-if="slide === 1">
                <h1 id="contact-plan-title">Preview your messages</h1>
                <p id="contact-plan-description">These are your current messages with a sample parent name. Your school details fill in automatically. You can personalize the wording on the next steps or anytime in your settings.</p>
                <div class="fw-example-tabs" role="tablist" aria-label="Example messages"><button v-for="m in FAMILY_WELCOME_MESSAGES" :key="m.field" type="button" role="tab" :aria-selected="exampleField === m.field" @click="exampleField = m.field">{{ m.label.replace(/^\d · /, '') }}</button></div>
                <figure v-if="exampleInfo.sms" class="fw-shot fw-phone" aria-label="Example follow-up text">
                  <figcaption>Example · {{ exampleInfo.when }}</figcaption>
                  <div class="fw-live-preview">
                    <div class="fw-bubble">{{ exampleBody }}</div>
                  </div>
                </figure>
                <figure v-else class="fw-shot fw-mail" :aria-label="`Example ${exampleInfo.label}`">
                  <figcaption>Example · {{ exampleInfo.when }}</figcaption>
                  <div class="fw-live-preview">
                    <div class="fw-mail-bar"><i></i><i></i><i></i><span>Inbox</span></div>
                    <dl><div><dt>From</dt><dd>{{ providerDisplayName }} &lt;{{ plan.routing?.from }}&gt;</dd></div><div><dt>To</dt><dd>Parent name</dd></div><div><dt>Subject</dt><dd><strong>{{ exampleInfo.subject }}</strong></dd></div></dl>
                    <p class="fw-mail-body">{{ exampleBody }}</p>
                    <p v-if="exampleField === 'template' && includePdf" class="fw-attachment">📎 School introduction.pdf</p>
                  </div>
                </figure>
              </template>

              <template v-else-if="slide === 2">
                <h1 id="contact-plan-title">Your introduction PDF</h1>
                <p id="contact-plan-description">Your welcome email can include a one-page SchoolCareBridge introduction with your name, your school blurb, the school team, and your supervisor.</p>
                <div class="fw-pdf-preview">
                  <figure class="fw-shot">
                    <figcaption>Example · Introduction PDF, page 1</figcaption>
                    <FamilyWelcomeScreenshot src="/family-welcome/introduction-pdf-p1.png" alt="Page 1 of an example SchoolCareBridge introduction PDF, with the provider introduction and school team.">
                      <div class="fw-pdf-card"><span aria-hidden="true">📄</span><div><strong>School introduction.pdf</strong><small>Built from your profile and your school.</small></div></div>
                    </FamilyWelcomeScreenshot>
                  </figure>
                  <label v-if="plan.schools?.length > 1" class="contact-plan-fine">PDF school <select v-model="previewSchoolId"><option v-for="school in plan.schools" :key="school.id" :value="school.id">{{ school.name }}</option></select></label>
                  <FamilyWelcomePdfButton :agency-id="plan.agencyId" :school-id="previewSchoolId" label="View my PDF" />
                </div>
                <label class="fw-check"><input v-model="includePdf" type="checkbox" /> Attach my PDF to the welcome email</label>
                <p class="contact-plan-fine">Update your school blurb in My Account to change what the PDF says about you.</p>
              </template>

              <template v-else-if="slide === 3">
                <h1 id="contact-plan-title">Find it anytime</h1>
                <p id="contact-plan-description">You can customize your emails and text at any time in your account settings. Search for <strong>family welcome</strong> to go straight there.</p>
                <figure class="fw-shot" aria-label="Quick Nav search example">
                  <figcaption>Quick Nav · the search bar at the top of every page (⌘/Ctrl+K)</figcaption>
                  <FamilyWelcomeScreenshot src="/family-welcome/quick-nav-search.png" alt="Quick Nav with family welcome typed and the Family Welcome &amp; Follow-Up result showing.">
                    <div class="fw-search"><span aria-hidden="true">⌕</span><span class="fw-typed">family welcome</span><kbd>⌘K</kbd></div>
                    <div class="fw-result"><strong>{{ FAMILY_WELCOME_NAME }}</strong><small>Account · {{ FAMILY_WELCOME_TAGLINE }}</small></div>
                  </FamilyWelcomeScreenshot>
                </figure>
                <figure class="fw-shot" aria-label="Search My Dashboard example">
                  <figcaption>Search My Dashboard · on your dashboard</figcaption>
                  <FamilyWelcomeScreenshot src="/family-welcome/dashboard-search.png" alt="Search My Dashboard with auto message typed and the Family Welcome &amp; Follow-Up result under My Account, Account Info.">
                    <div class="fw-search"><span aria-hidden="true">⌕</span><span class="fw-typed">auto message</span></div>
                    <div class="fw-result"><strong>{{ FAMILY_WELCOME_NAME }}</strong><small>My Account › Account Info</small></div>
                  </FamilyWelcomeScreenshot>
                </figure>
                <p class="contact-plan-fine">These searches also work: {{ FAMILY_WELCOME_SEARCH_TERMS.slice(0, 10).join(', ') }}.</p>
              </template>

              <template v-else>
                <h1 id="contact-plan-title">Ready to say hello?</h1>
                <p v-if="!plan.demoOnly" class="contact-plan-fine">ITSCO school providers. Review your messages and choose On or Off. Your saved choice applies to new assignments after you turn it on. Find and edit it anytime in My Account → Account Info → Family Welcome &amp; Follow-Up.</p>
                <p id="contact-plan-description">Turn on {{ FAMILY_WELCOME_NAME }} to send your welcome and follow-ups automatically. You can customize your emails at any time in your settings.</p>
                <p v-if="plan.canEnable === false" role="alert" class="contact-plan-error">{{ plan.setupNotice }}</p>
                <div class="fw-optout"><strong>If you opt out</strong><p>Our support team sends an introduction email to the family when you are assigned, and you are copied on it.</p></div>
                <button type="button" class="contact-plan-primary contact-plan-wide" :disabled="busy || !!templateError || plan.canEnable === false" @click="optIn">{{ busy ? 'Saving…' : plan.status === 'enabled' ? 'Keep it on' : 'Yes, turn on Family Welcome' }} <span aria-hidden="true">✓</span></button>
                <button type="button" class="contact-plan-text-button contact-plan-wide" :disabled="busy" @click="step = 'configure'">Customize my emails first</button>
                <button v-if="!plan.mandatory" type="button" class="contact-plan-text-button contact-plan-wide" :disabled="busy" @click="decline">No thanks, have support introduce me</button>
              </template>

              <footer v-if="slide < SLIDES.length - 1" class="contact-plan-actions">
                <button type="button" class="contact-plan-text-button" :disabled="slide === 0" @click="slide--">Back</button>
                <button type="button" class="contact-plan-primary" @click="slide++">Next <span aria-hidden="true">→</span></button>
              </footer>
              <p class="contact-plan-fine">You can return to this tour from the small card in the corner.</p>
            </div>
          </template>
          <template v-else>
            <div class="contact-plan-configure">
              <h1 id="contact-plan-title">Your Family Welcome,<br>ready to go.</h1>
              <p id="contact-plan-description">When a new school client is assigned to me, send my welcome email and, if needed, two follow-ups on my behalf.</p>
              <p v-if="plan.canEnable === false" role="alert" class="contact-plan-error">{{ plan.setupNotice }}</p>
              <div class="contact-plan-tabs" role="tablist" aria-label="Contact plan settings"><button type="button" role="tab" :aria-selected="tab === 'message'" aria-controls="contact-plan-message" id="contact-plan-message-tab" @click="tab = 'message'">01 · Your message</button><button type="button" role="tab" :aria-selected="tab === 'followup'" aria-controls="contact-plan-followup" id="contact-plan-followup-tab" @click="tab = 'followup'">02 · Follow-up plan</button></div>
              <div v-show="tab === 'message'" id="contact-plan-message" role="tabpanel" aria-labelledby="contact-plan-message-tab">
                <label class="contact-plan-message-picker">Message to review
                  <select v-model="selectedMessage" aria-label="Contact plan message"><option v-for="message in messageChoices" :key="message.field" :value="message.field">{{ message.label }}</option></select>
                </label>
                <div class="contact-plan-preview">
                  <div class="contact-plan-envelope"><span class="contact-plan-mail-dot"></span><strong>{{ selectedMessageInfo.subject }}</strong><span class="contact-plan-sample-label">EXAMPLE</span></div>
                  <dl class="contact-plan-addresses"><div><dt>From</dt><dd>{{ providerDisplayName }} &lt;{{ plan.routing?.from }}&gt;</dd></div><div><dt>To</dt><dd>Parent name · {{ plan.demoOnly ? 'testing@itsco.health' : 'the assigned family’s email' }}</dd></div><div><dt>Reply to</dt><dd>{{ plan.routing?.replyTo }}</dd></div><div><dt>Copy</dt><dd>You receive a private copy (BCC)</dd></div></dl>
                  <label v-if="plan.schools?.length > 1" class="contact-plan-fine">Preview school <select v-model="previewSchoolId"><option v-for="school in plan.schools" :key="school.id" :value="school.id">{{ school.name }}</option></select></label>
                  <p class="contact-plan-email-body">{{ renderedBody }}</p>
                </div>
                <button type="button" class="contact-plan-edit-toggle" :aria-expanded="editing" aria-controls="contact-plan-editor" @click="editing = !editing">{{ editing ? 'Close editor' : selectedMessage === 'template' ? 'Edit my welcome email' : 'Edit this message' }} <span aria-hidden="true">{{ editing ? '−' : '↗' }}</span></button>
                <div v-if="editing" id="contact-plan-editor" class="contact-plan-editor"><label for="contact-plan-template">{{ selectedMessageInfo.label }} wording</label><FamilyWelcomeFields :sms="selectedMessage === 'smsTemplate'" @insert="insertField" /><textarea id="contact-plan-template" ref="editorEl" v-model="activeTemplate" rows="9" :maxlength="selectedMessage === 'smsTemplate' ? 1000 : 6000" spellcheck="true"></textarea><p v-if="activeTemplateError" class="contact-plan-field-error">{{ activeTemplateError }}</p><button v-if="plan.recommendedTemplates?.[selectedMessage]" type="button" class="contact-plan-text-button" @click="resetRecommended">Use recommended wording</button></div>
                <button v-if="selectedMessage !== 'smsTemplate'" type="button" class="contact-plan-example" :disabled="busy || !!activeTemplateError" @click="sendExample"><span aria-hidden="true">✉</span> {{ sendingExample ? 'Sending your example…' : exampleConversationId ? 'Send me another example' : 'Send me an example' }} <span aria-hidden="true">↗</span></button>
                <p v-if="selectedMessage === 'smsTemplate'" class="contact-plan-fine">Text preview only. The 48-hour contact uses this text only with permission and an active clinical sender; otherwise it sends your second email.</p>
                <p v-else class="contact-plan-fine">{{ plan.routing?.isSso ? 'The plan will minimize so you can check your email. Replies return to Messages in the app.' : 'The plan will minimize so you can check Messages, then reopen it here. Replies go to your email address.' }}</p>
                <p v-if="plan.routing?.replyTrackingNote" class="contact-plan-fine">{{ plan.routing.replyTrackingNote }}</p>
              </div>
              <div v-show="tab === 'followup'" id="contact-plan-followup" role="tabpanel" aria-labelledby="contact-plan-followup-tab" class="contact-plan-followups">
                <div class="contact-plan-timeline-item"><span class="contact-plan-timeline-number">1</span><div><h3>A warm introduction</h3><p>Send the email when a new school client is assigned. Record the first contact and update Parents Contacted.</p></div></div>
                <div class="contact-plan-timeline-item"><span class="contact-plan-timeline-number">2</span><div><h3>A second contact · 48 hours later</h3><p>If the family has not replied, send the permitted text when clinical texting is available; otherwise send your second email. This is one contact, using one channel.</p></div></div>
                <div class="contact-plan-timeline-item"><span class="contact-plan-timeline-number">3</span><div><h3>A final email · 96 hours after introduction</h3><p>If there is still no reply, send your final email, even when the second contact was an email. A family reply stops the remaining family outreach.</p></div></div>
                <div class="contact-plan-support"><span aria-hidden="true">✦</span><div><h3>Keep the intake moving</h3><p>At day 6, if the initial intake is not finalized, remind you and then repeat every 48 hours until it is finalized. If a family replies and waits 48 hours for your response, remind you and notify support.</p></div></div>
                <p class="contact-plan-fine">For replies that go to an outside email address, send your response in the app so the contact record stays current.</p>
              </div>
              <p v-if="notice" role="status" class="contact-plan-notice">{{ notice }}</p>
              <p v-if="templateError" class="contact-plan-field-error">{{ templateError }}</p>
              <div v-if="profilePrompt" class="fw-prompt" role="alertdialog" aria-labelledby="fw-splash-prompt"><p id="fw-splash-prompt">{{ FAMILY_WELCOME_PROFILE_PROMPT }}</p><div><button type="button" class="contact-plan-text-button" @click="addLinkFromPrompt">Add profile link</button><button type="button" class="contact-plan-text-button" @click="save({ skipProfileCheck: true })">No thanks, save anyway</button></div></div>
              <footer class="contact-plan-actions"><button type="button" class="contact-plan-text-button" :disabled="busy" @click="minimize">Finish later</button><button v-if="tab === 'message'" type="button" class="contact-plan-primary" :disabled="busy || !!templateError" @click="tab = 'followup'">Next: follow-ups <span aria-hidden="true">→</span></button><button type="button" class="contact-plan-primary" :disabled="busy || !!templateError || plan.canEnable === false" @click="save()">{{ busy ? 'Saving…' : plan.status === 'enabled' ? 'Save Family Welcome' : 'Turn on Family Welcome' }} <span aria-hidden="true">✓</span></button></footer>
              <template v-if="plan.status === 'enabled' && !plan.mandatory"><button type="button" class="contact-plan-text-button contact-plan-wide" :disabled="busy" @click="decline">Turn off Family Welcome</button><p class="contact-plan-fine">Turning this off stops your welcome emails and follow-ups. Support will introduce you to new families, and you will be copied. Your recorded contacts stay in the client history.</p></template>
            </div>
          </template>
          <p v-if="error" role="alert" class="contact-plan-error">{{ error }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../../services/api';
import SchoolCareBridgeBrand from '../schoolcarebridge/SchoolCareBridgeBrand.vue';
import FamilyWelcomeFields from './FamilyWelcomeFields.vue';
import FamilyWelcomePdfButton from './FamilyWelcomePdfButton.vue';
import FamilyWelcomeScreenshot from './FamilyWelcomeScreenshot.vue';
import {
  FAMILY_WELCOME_MESSAGES, FAMILY_WELCOME_NAME, FAMILY_WELCOME_PROFILE_PROMPT, FAMILY_WELCOME_SEARCH_TERMS, FAMILY_WELCOME_TAGLINE,
  PROFILE_LINK_TOKEN, insertAtCursor, renderFamilyWelcome, validateFamilyWelcomeTemplate, welcomeMissingProfileLink
} from '../../utils/familyWelcome.js';

const props = defineProps({ agencyId: [Number, String], userId: [Number, String], providerName: { type: String, default: '' }, messagesPath: { type: String, default: '/messages' }, locked: Boolean });
const plan = ref(null), open = ref(false), step = ref('welcome'), tab = ref('message'), editing = ref(false), busy = ref(false), sendingExample = ref(false), error = ref(''), notice = ref(''), panel = ref(null), exampleConversationId = ref(null);
const previewSchoolId = ref(null);
const settingsLocation = computed(()=>({path:`/${plan.value?.agencySlug || (Number(plan.value?.agencyId)===450 ? 'auricwell-qa-demo' : 'itsco')}/dashboard`,query:{tab:'my',my:'account',section:'my-family-welcome'}}));
const draft = reactive({ template: '', secondTemplate: '', finalTemplate: '', smsTemplate: '' });
const selectedMessage = ref('template');
const SLIDES = ['What it is', 'Examples', 'Your PDF', 'Find it anytime', 'Your choice'];
const slide = ref(0), exampleField = ref('template'), includePdf = ref(true), profilePrompt = ref(false), editorEl = ref(null);
const messageChoices = [
  {field:'template',label:'1 · Welcome email',subject:'Introduction & Next Steps for Counseling Services'},
  {field:'secondTemplate',label:'2 · 48-hour email fallback',subject:'Following Up About Counseling Services'},
  {field:'smsTemplate',label:'2 · 48-hour text',subject:'Text message preview'},
  {field:'finalTemplate',label:'3 · Final email at 96 hours',subject:'Final Follow-Up About Counseling Services'}
];
const selectedMessageInfo = computed(() => messageChoices.find(m => m.field === selectedMessage.value) || messageChoices[0]);
const activeTemplate = computed({get:() => draft[selectedMessage.value],set:value => {draft[selectedMessage.value] = value;}});
const validateTemplate = validateFamilyWelcomeTemplate;
const activeTemplateError = computed(() => validateTemplate(activeTemplate.value, selectedMessage.value === 'smsTemplate'));
const templateError = computed(() => {
  const invalid = messageChoices.find(m => validateTemplate(draft[m.field],m.field === 'smsTemplate'));
  return invalid ? `${invalid.label}: ${validateTemplate(draft[invalid.field],invalid.field === 'smsTemplate')}` : '';
});
const providerDisplayName = computed(() => plan.value?.providerName || props.providerName || 'Your provider name');
const previewValues = computed(() => ({ parent_name: 'Parent name', provider_name: providerDisplayName.value, school_name: plan.value?.schools?.find(s => Number(s.id) === Number(previewSchoolId.value))?.name || 'Example school', service_day: plan.value?.schools?.find(s => Number(s.id) === Number(previewSchoolId.value))?.serviceDayLabel || 'to be confirmed', agency_name: plan.value?.agencyName || 'Your agency', ...plan.value?.previewValues }));
const renderedBody = computed(() => renderFamilyWelcome(activeTemplate.value, previewValues.value));
const exampleInfo = computed(() => FAMILY_WELCOME_MESSAGES.find(m => m.field === exampleField.value) || FAMILY_WELCOME_MESSAGES[0]);
const exampleBody = computed(() => renderFamilyWelcome(draft[exampleField.value], previewValues.value));
function resetRecommended() { activeTemplate.value = plan.value?.recommendedTemplates?.[selectedMessage.value] || activeTemplate.value; }
async function insertField(token) {
  const position = (editorEl.value?.selectionStart ?? activeTemplate.value.length) + token.length;
  activeTemplate.value = insertAtCursor(editorEl.value, activeTemplate.value, token);
  await nextTick(); editorEl.value?.focus?.(); editorEl.value?.setSelectionRange?.(position, position);
}
async function addLinkFromPrompt() {
  profilePrompt.value = false; tab.value = 'message'; selectedMessage.value = 'template'; editing.value = true;
  await nextTick(); await insertField(PROFILE_LINK_TOKEN);
}
const exampleMessagesTo = computed(() => ({ path: props.messagesPath, query: { conversationId: exampleConversationId.value } }));
let version = 0, disposed = false, timer, loading = false, previousFocus;
function requestOptions() { return { params: { agencyId: props.agencyId }, skipGlobalLoading: true }; }
function setPlan(data) {
  plan.value = data;
  if (!data.schools?.some(s => Number(s.id) === Number(previewSchoolId.value))) previewSchoolId.value = data.schools?.[0]?.id ?? null;
  includePdf.value = data.includePdf !== false;
  for (const key of ['template','secondTemplate','finalTemplate','smsTemplate']) draft[key] = data[key] || data.recommendedTemplates?.[key] || data.template || '';
}
function openTour() {
  if (!plan.value?.eligible) return;
  error.value = ''; step.value = 'welcome'; slide.value = 0; open.value = true;
}
function resume() { error.value = ''; open.value = true; }
function dismissalKey() { return `family-welcome-minimized:${props.userId}:${props.agencyId}`; }
function wasMinimized() { try { return sessionStorage.getItem(dismissalKey()) === '1'; } catch { return false; } }
function minimize() {
  if (busy.value) return;
  open.value = false;
  try { sessionStorage.setItem(dismissalKey(), '1'); } catch { /* Session storage may be unavailable. */ }
}
async function load({ reset = false } = {}) {
  if (!props.agencyId || !props.userId || loading || disposed) return;
  if (!reset && (open.value || busy.value || plan.value?.eligible)) return;
  loading = true;
  const request = version;
  try {
    const { data } = await api.get('/school-contact-plan', requestOptions());
    if (disposed || request !== version) return;
    setPlan(data);
    const firstVisit = !data.welcomeSeen && (data.welcomeSeen === false || data.status === 'unconfigured');
    step.value = data.status === 'enabled' && !firstVisit ? 'configure' : 'welcome';
    slide.value = 0;
    open.value = !!data.eligible && !wasMinimized() && (firstVisit || (data.mandatory && data.status !== 'enabled'));
  } catch { /* Eligibility is retried on focus; this optional setup must not block the app. */ }
  finally { loading = false; }
}
function messageFrom(error, fallback) { return error.response?.data?.error?.message || error.response?.data?.message || fallback; }
async function decline() {
  if (busy.value || plan.value?.mandatory) return;
  const turningOff = plan.value?.status === 'enabled';
  busy.value = true; error.value = '';
  const request = version;
  try {
    const { data } = await api.put('/school-contact-plan', { status: 'declined' }, requestOptions());
    if (disposed || request !== version) return;
    setPlan(data); open.value = false;
    notice.value = 'Off · Support will introduce you, and you are copied.';
    step.value = 'welcome'; slide.value = turningOff ? 0 : SLIDES.length - 1;
  } catch (e) { if (request === version) error.value = messageFrom(e, 'Your preference could not be saved. Please try again.'); }
  finally { if (request === version) busy.value = false; }
}
async function sendExample() {
  if (busy.value || activeTemplateError.value || selectedMessage.value === 'smsTemplate') return;
  busy.value = true; sendingExample.value = true; error.value = '';
  const request = version;
  try {
    const { data } = await api.post('/school-contact-plan/example', { template: activeTemplate.value, schoolId: previewSchoolId.value, includePdf: includePdf.value, ...(selectedMessage.value === 'template' ? {} : {stepKey:selectedMessage.value === 'secondTemplate' ? 'second_contact' : 'final_contact'}) }, requestOptions());
    if (disposed || request !== version) return;
    if (!data.sent) throw new Error('Example not sent');
    exampleConversationId.value = data.conversationId;
    notice.value = `Example sent to ${data.deliveredTo || 'your inbox'}.`;
    open.value = false;
  } catch (e) { if (request === version) error.value = messageFrom(e, 'The example could not be sent. Your draft is still here; please try again.'); }
  finally { if (request === version) { busy.value = false; sendingExample.value = false; } }
}
async function save({ skipProfileCheck = false, keepOpen = false } = {}) {
  if (busy.value || templateError.value) return;
  if (!skipProfileCheck && welcomeMissingProfileLink(draft)) { profilePrompt.value = true; return; }
  profilePrompt.value = false;
  busy.value = true; error.value = '';
  const request = version;
  try {
    const { data } = await api.put('/school-contact-plan', { status: 'enabled', ...draft, includePdf: includePdf.value, smsAfterDays: 2, emailAfterDays: 4, staleAfterHours: 48 }, requestOptions());
    if (disposed || request !== version) return;
    setPlan(data); notice.value = keepOpen ? 'Family Welcome is on. You can personalize your messages below and save your changes.' : 'Your Family Welcome changes are saved.';
    if (keepOpen) { step.value = 'configure'; tab.value = 'message'; selectedMessage.value = 'template'; editing.value = true; open.value = true; } else open.value = false;
  } catch (e) { if (request === version) error.value = messageFrom(e, 'Your Family Welcome could not be saved. Please try again.'); }
  finally { if (request === version) busy.value = false; }
}
async function optIn() {
  if (welcomeMissingProfileLink(draft)) { step.value = 'configure'; profilePrompt.value = true; return; }
  await save({ skipProfileCheck: true, keepOpen: true });
}
function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); minimize(); return; }
  if (event.key !== 'Tab') return;
  const controls = [...(panel.value?.querySelectorAll('button:not(:disabled), input, textarea, a[href]') || [])].filter(el => !el.closest('[style*="display: none"]'));
  if (!controls.length) { event.preventDefault(); return; }
  if (event.shiftKey && [controls[0], panel.value].includes(document.activeElement)) { event.preventDefault(); controls.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
}
watch(() => open.value && !props.locked, async visible => {
  if (visible) { previousFocus = document.activeElement; await nextTick(); panel.value?.focus(); }
  else previousFocus?.focus?.();
});
watch(() => [props.agencyId, props.userId], () => {
  version++; plan.value = null; open.value = false; busy.value = false; sendingExample.value = false; notice.value = ''; error.value = ''; exampleConversationId.value = null; editing.value = false; selectedMessage.value = 'template'; tab.value = 'message'; loading = false;
  load({ reset: true });
}, { immediate: true });
function onFocus() { load(); }
onMounted(() => { timer = setInterval(onFocus, 60000); window.addEventListener('focus', onFocus); window.addEventListener('family-welcome:open', openTour); });
onBeforeUnmount(() => { disposed = true; version++; clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('family-welcome:open', openTour); previousFocus?.focus?.(); });
</script>

<style scoped>
.contact-plan-message-picker{display:grid;gap:8px;margin:12px 0;font-weight:600;font-size:12px}.contact-plan-message-picker select{padding:10px;border:1px solid #cbdde4;border-radius:8px;background:white;max-width:100%}

.contact-plan-shade{position:fixed;inset:0;z-index:17500;display:grid;place-items:center;overflow:auto;padding:28px;background:#102e5399;backdrop-filter:blur(9px);font-family:inherit;color:#102e53}.contact-plan-panel{display:grid;grid-template-columns:300px minmax(0,650px);width:min(100%,950px);max-height:92dvh;overflow:auto;border-radius:26px;background:#fff;box-shadow:0 30px 100px #102b3f50;outline:none}.contact-plan-story{position:relative;overflow:hidden;display:flex;flex-direction:column;padding:32px 30px;color:#edf9f5;background:radial-gradient(ellipse at 90% 45%,#007cdd45,transparent 70%),linear-gradient(155deg,#102e53,#174765 58%,#006b91)}.contact-plan-brand{display:flex;justify-content:center;background:#fff;border-radius:14px;padding:8px 12px}.contact-plan-brand :deep(.scb-brand){width:205px;max-width:100%}.contact-plan-brand :deep(img){object-fit:contain!important}.contact-plan-brand :deep(a:focus-visible){outline:3px solid #007cdd;outline-offset:4px}.contact-plan-orbit{position:relative;display:grid;place-items:center;width:160px;height:150px;margin:37px auto 20px}.contact-plan-orbit>span{position:relative;z-index:1;display:grid;place-items:center;width:100px;height:100px;border-radius:28px;background:linear-gradient(140deg,#d8f3ff,#91d8ef);color:#184765;font-size:50px;box-shadow:12px 18px 35px #071e3240;transform:rotate(-8deg)}.contact-plan-orbit i{position:absolute;width:151px;height:151px;border:1px solid #d3ebe233;border-radius:50%;transform:rotate(25deg);box-shadow:0 0 0 19px #d3ebe207}.contact-plan-orbit b{position:absolute;z-index:2;right:4px;bottom:13px;display:grid;place-items:center;width:38px;height:38px;border:4px solid #174765;border-radius:50%;background:#e6f8ed;color:#087a48;font-size:18px}.contact-plan-eyebrow{font-size:9px;letter-spacing:2px;color:#b9e6f2;margin:16px 0}.contact-plan-story h2{color:#f6f8f5;font-size:37px;line-height:1.15;letter-spacing:-1.4px;font-weight:550;margin:0 0 16px}.contact-plan-story>p:not(.contact-plan-eyebrow){font-size:13px;line-height:1.8;color:#d3e8f3}.contact-plan-journey{list-style:none;padding:0;margin:22px 0 30px;display:grid;gap:18px;font-size:12px}.contact-plan-journey span{margin-right:12px;color:#9ad4ec;font-size:10px}.contact-plan-demo{margin-top:auto;display:flex;align-items:flex-start;gap:10px;padding-top:20px;border-top:1px solid #d3ebe226}.contact-plan-demo>span{color:#7ee3af;font-size:14px}.contact-plan-demo strong,.contact-plan-demo small{display:block}.contact-plan-demo strong{font-size:11px;font-weight:600}.contact-plan-demo small{font-size:10px;line-height:1.6;color:#c9e4ef;margin-top:6px}.contact-plan-main{min-width:0;padding:25px 34px 24px}.contact-plan-top{display:flex;align-items:center;justify-content:space-between;color:#75858c;font-size:9px;font-weight:650;letter-spacing:1.5px}.contact-plan-icon-button{border:1px solid #e0e8e8;border-radius:10px;background:#fff;color:#5e7279;width:34px;height:34px;cursor:pointer;font:inherit;font-size:23px}.contact-plan-welcome{padding:30px 0 12px}.contact-plan-pill{display:inline-block;padding:6px 10px;border-radius:30px;background:#e7f5fc;color:#17638b;font-size:10px;font-weight:600}.contact-plan-main h1{margin:18px 0 15px;font-size:35px;line-height:1.18;letter-spacing:-1.1px;font-weight:550;color:#102e53}.contact-plan-main p{line-height:1.7}.contact-plan-welcome>p:not(.contact-plan-fine),.contact-plan-configure>p:first-of-type{font-size:13px;color:#687b83;max-width:440px}.contact-plan-benefits{display:grid;gap:2px;margin:24px 0 30px}.contact-plan-benefits p{font-size:12px;margin:8px 0}.contact-plan-benefits span{display:inline-grid;place-items:center;width:21px;height:21px;margin-right:11px;background:#edf5ef;border-radius:50%;color:#537a60}.contact-plan-primary{display:flex;align-items:center;justify-content:center;gap:22px;min-height:45px;padding:12px 19px;border:0;border-radius:10px;background:#007cbd;color:white;font:inherit;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 4px 10px #007cbd19}.contact-plan-primary:hover{background:#075c91}.contact-plan-wide{width:100%}.contact-plan-text-button{min-height:43px;border:0;background:transparent;color:#687d83;cursor:pointer;font:inherit;font-size:11px;padding:10px 6px}.contact-plan-fine{font-size:10px!important;color:#7e8b90!important;line-height:1.7;margin:12px 0}.contact-plan-welcome>.contact-plan-fine{text-align:center}.contact-plan-tabs{display:flex;border-bottom:1px solid #e4eaea;margin:22px 0 17px;gap:20px}.contact-plan-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:0 0 12px;color:#839096;font:inherit;font-size:11px;cursor:pointer}.contact-plan-tabs [aria-selected=true]{color:#007cbd;border-bottom-color:#007cbd;font-weight:650}.contact-plan-preview{border:1px solid #dfe8e7;border-radius:13px;overflow:hidden;background:#fcfdfc}.contact-plan-envelope{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid #e5edeb;background:#f4f8f5}.contact-plan-envelope strong{font-size:10px;font-weight:600;flex:1}.contact-plan-mail-dot{width:6px;height:6px;border-radius:50%;background:#139e61}.contact-plan-sample-label{font-size:8px;letter-spacing:1px;color:#82918a}.contact-plan-addresses{margin:12px 15px;padding-bottom:11px;border-bottom:1px solid #e9eeeb;font-size:9px}.contact-plan-addresses>div{display:flex;gap:7px;line-height:1.7}.contact-plan-addresses dt{width:42px;flex-shrink:0;color:#91a09d}.contact-plan-addresses dd{margin:0;color:#647871;overflow-wrap:anywhere}.contact-plan-email-body{overflow-wrap:anywhere;white-space:pre-wrap;font-size:11px;line-height:1.85!important;padding:0 16px 9px;color:#425c60}.contact-plan-edit-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 0 10px;border:0;background:transparent;color:#075c91;font:inherit;font-size:10px;font-weight:600;cursor:pointer}.contact-plan-editor{margin:3px 0 14px}.contact-plan-editor label{display:block;font-size:11px;font-weight:600;margin-bottom:8px}.contact-plan-editor textarea{box-sizing:border-box;width:100%;resize:vertical;border:1px solid #bacdca;border-radius:10px;padding:12px;background:#fff;color:#304f52;font:inherit;font-size:11px;line-height:1.7}.contact-plan-editor p{font-size:10px;color:#74867f}.contact-plan-tokens{display:flex;flex-wrap:wrap;gap:5px}.contact-plan-tokens code{font-size:9px;padding:4px 6px;border-radius:5px;background:#edf4ef;color:#4b6e61}.contact-plan-example{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:1px solid #c8d9d1;border-radius:9px;background:#eff8fd;color:#075c91;font:inherit;font-size:11px;font-weight:600;cursor:pointer}.contact-plan-example>span:last-child{margin-left:auto}.contact-plan-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #e9eeeb;padding-top:17px;margin-top:20px}.contact-plan-actions .contact-plan-primary{font-size:11px}.contact-plan-followups{padding-top:3px}.contact-plan-timeline-item{display:flex;gap:14px;position:relative;padding:0 0 22px}.contact-plan-timeline-item:not(:nth-child(3)):after{content:'';position:absolute;left:13px;top:30px;bottom:4px;width:1px;background:#dce7e0}.contact-plan-timeline-number{display:grid;place-items:center;width:27px;height:27px;flex-shrink:0;border:1px solid #cbded1;border-radius:50%;color:#547b65;font-size:10px;background:#f3f8f2}.contact-plan-timeline-item h3,.contact-plan-support h3{font-size:12px;font-weight:650;margin:4px 0 6px}.contact-plan-timeline-item p,.contact-plan-support p{font-size:11px;color:#73858a;margin:0 0 8px}.contact-plan-number-label{font-size:10px;color:#576f73}.contact-plan-number-label input{width:46px;margin:0 3px;border:1px solid #c6d7d0;border-radius:6px;padding:6px;color:#345a53;background:white;text-align:center;font:inherit;font-weight:600;box-sizing:border-box}.contact-plan-support{display:flex;gap:12px;border-radius:12px;background:#f3f6f1;padding:15px}.contact-plan-support>span{font-size:19px;color:#779068}.contact-plan-error,.contact-plan-field-error{font-size:11px!important;color:#9c3a37!important;background:#fff0ed;border-radius:8px;padding:10px 12px}.contact-plan-notice{font-size:11px;color:#2e7256;border-radius:8px;background:#eef7ef;padding:9px 12px}.contact-plan-panel button:focus-visible,.contact-plan-panel input:focus-visible,.contact-plan-panel textarea:focus-visible,.contact-plan-dock a:focus-visible,.contact-plan-dock button:focus-visible{outline:3px solid #bd9d57;outline-offset:3px}.contact-plan-panel button:disabled{opacity:.55;cursor:wait}.contact-plan-dock{position:fixed;bottom:20px;left:22px;width:min(320px,calc(100vw - 44px));z-index:1100;border:1px solid #c4e2f1;border-radius:14px;background:#fff;box-shadow:0 10px 30px #23483b24;font-family:inherit;overflow:hidden}.contact-plan-resume{display:flex;align-items:center;gap:12px;border:0;width:100%;background:#fff;color:#184765;text-align:left;cursor:pointer;padding:15px;font:inherit}.contact-plan-resume>span:nth-child(2){flex:1;min-width:0}.contact-plan-resume strong,.contact-plan-resume small{display:block}.contact-plan-resume strong{font-size:12px;font-weight:600}.contact-plan-resume small{font-size:10px;line-height:1.5;color:#7a8b87;margin-top:5px;overflow-wrap:anywhere}.contact-plan-dock-icon{display:grid;place-items:center;width:33px;height:33px;flex-shrink:0;border-radius:10px;background:#edf4ed;color:#007cbd;font-size:19px}.contact-plan-inbox,.contact-plan-settings{display:block;border-top:1px solid #e3ece7;padding:9px 15px;color:#416e64;background:#f7faf7;font-size:10px;text-decoration:none}@media(max-width:760px){.contact-plan-shade{padding:14px}.contact-plan-panel{grid-template-columns:1fr;width:min(100%,540px);max-height:94dvh;border-radius:20px}.contact-plan-story{padding:15px 25px}.contact-plan-story>*:not(.contact-plan-brand){display:none}.contact-plan-main{padding:20px 25px}.contact-plan-welcome{padding-top:18px}.contact-plan-main h1{font-size:30px}.contact-plan-dock{left:12px;bottom:12px}.contact-plan-envelope{padding:12px}.contact-plan-sample-label{display:none}}@media(prefers-reduced-motion:no-preference){.contact-plan-panel{animation:contact-plan-enter .24s ease-out}@keyframes contact-plan-enter{from{opacity:0;transform:translateY(12px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}}
.fw-dots{display:flex;gap:6px;margin-bottom:14px}.fw-dots button{width:22px;height:6px;border:0;border-radius:4px;background:#d9e6ec;cursor:pointer;padding:0}.fw-dots button[aria-current=step]{background:#007cbd}
.fw-timeline{list-style:none;padding:0;margin:18px 0;display:grid;gap:10px;font-size:12px;color:#425c60}.fw-timeline li{border-left:3px solid #9ad4ec;padding:4px 0 4px 12px;line-height:1.6}.fw-timeline b{display:block;color:#102e53;font-size:11px;letter-spacing:.5px}
.fw-example-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}.fw-example-tabs button{border:1px solid #cfe0e8;border-radius:20px;background:#fff;color:#4b6470;font:inherit;font-size:11px;padding:6px 10px;cursor:pointer}.fw-example-tabs [aria-selected=true]{background:#007cbd;border-color:#007cbd;color:#fff}
.fw-shot{margin:12px 0;border:1px solid #dfe8e7;border-radius:12px;background:#fcfdfc;overflow:hidden;box-shadow:0 8px 24px #102e5314}.fw-shot figcaption{font-size:10px;letter-spacing:.4px;color:#6d7f86;padding:8px 12px;background:#f4f8f5;border-bottom:1px solid #e5edeb}
.fw-mail-bar{display:flex;align-items:center;gap:5px;padding:7px 12px;border-bottom:1px solid #eef2f1}.fw-mail-bar i{width:8px;height:8px;border-radius:50%;background:#e1e8e6}.fw-mail-bar span{margin-left:8px;font-size:10px;color:#91a09d}
.fw-mail dl{margin:10px 14px;font-size:10px}.fw-mail dl>div{display:flex;gap:8px;line-height:1.7}.fw-mail dt{width:50px;color:#91a09d}.fw-mail dd{margin:0;color:#425c60;overflow-wrap:anywhere}
.fw-mail-body{overflow-wrap:anywhere;white-space:pre-wrap;font-size:11px;line-height:1.75;color:#425c60;padding:0 14px 6px;max-height:260px;overflow:auto}
.fw-attachment{margin:0 14px 12px;display:inline-block;font-size:11px;border:1px solid #cfe0e8;border-radius:8px;padding:6px 10px;background:#fff}
.fw-phone{max-width:340px}.fw-bubble{margin:14px;padding:12px 14px;border-radius:18px 18px 18px 4px;background:#e9f3fb;color:#203847;font-size:12px;line-height:1.6}
.fw-pdf-card{display:flex;gap:12px;align-items:center;border:1px solid #dfe8e7;border-radius:12px;padding:12px 14px;margin:14px 0}.fw-pdf-card>span{font-size:26px}.fw-pdf-card strong,.fw-pdf-card small{display:block}.fw-pdf-card small{color:#6d7f86;font-size:11px}
.fw-pdf-preview{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.fw-pdf-preview figure{flex:1 1 220px;max-width:340px;min-width:0}
.fw-check{display:flex;gap:8px;align-items:center;font-size:12px;margin:12px 0}
.fw-search{display:flex;align-items:center;gap:10px;margin:12px;padding:9px 12px;border:1px solid #9cc9e4;border-radius:10px;background:#fff;font-size:12px;box-shadow:0 0 0 3px #007cbd1f}.fw-typed{flex:1;color:#102e53}.fw-typed:after{content:'';display:inline-block;width:1px;height:13px;margin-left:2px;background:#102e53;vertical-align:middle}.fw-search kbd{font-size:10px;color:#6d7f86;border:1px solid #dfe8e7;border-radius:5px;padding:1px 5px}
.fw-result{margin:0 12px 12px;padding:9px 12px;border-radius:9px;background:#eaf6fd}.fw-result strong,.fw-result small{display:block}.fw-result strong{font-size:12px;color:#075c91}.fw-result small{font-size:10px;color:#4b6470;margin-top:2px}
.fw-optout{border-radius:12px;background:#f3f6f1;padding:12px 14px;margin:16px 0}.fw-optout strong{font-size:12px}.fw-optout p{font-size:11px;color:#4b6470;margin:4px 0 0}
.fw-add-link{display:inline-block;margin:0 0 8px;border:1px solid #9cc9e4;background:#eaf6fd;color:#075c91;border-radius:8px;padding:5px 10px;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.fw-prompt{margin-top:12px;border:1px solid #f0c98b;background:#fff8ea;border-radius:12px;padding:10px 14px}.fw-prompt p{margin:0;font-size:12px;font-weight:600;color:#6b4300}.fw-prompt div{display:flex;gap:12px;justify-content:flex-end}
@media(max-width:760px){.contact-plan-dock{position:static;width:auto;margin:12px;box-shadow:none}.contact-plan-resume{padding:10px}.contact-plan-resume small{display:none}}
</style>
