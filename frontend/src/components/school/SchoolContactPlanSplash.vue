<template>
  <Teleport to="body">
    <aside v-if="plan?.eligible && !open && !locked" class="contact-plan-dock" aria-label="School contact plan">
      <button type="button" class="contact-plan-resume" @click="resume">
        <span class="contact-plan-dock-icon" aria-hidden="true">↗</span>
        <span><strong>{{ notice.startsWith('Example sent') ? 'Your example is ready' : 'Your school contact plan' }}</strong><small>{{ notice || (plan.status === 'enabled' ? 'Automation is on · Review your plan' : 'Set up your first hello') }}</small></span>
        <span aria-hidden="true">⌃</span>
      </button>
      <RouterLink v-if="exampleConversationId && !plan.routing?.isSso" :to="exampleMessagesTo" class="contact-plan-inbox">Check Messages ↗</RouterLink>
    </aside>
    <div v-if="plan?.eligible && open && !locked" class="contact-plan-shade" @keydown="onKeydown">
      <section ref="panel" class="contact-plan-panel" role="dialog" aria-modal="true" aria-labelledby="contact-plan-title" aria-describedby="contact-plan-description" tabindex="-1">
        <aside class="contact-plan-story">
          <div class="contact-plan-brand"><SchoolCareBridgeBrand compact /></div>
          <div class="contact-plan-orbit" aria-hidden="true"><span>✉</span><i></i><b>✓</b></div>
          <p class="contact-plan-eyebrow">A STRONG START, TOGETHER</p>
          <h2>A thoughtful<br>first hello.</h2>
          <p>Give each new family a warm introduction, with a contact plan that works for you.</p>
          <ol class="contact-plan-journey"><li><span>01</span> Your introduction</li><li><span>02</span> A gentle follow-up</li><li><span>03</span> A connected care team</li></ol>
          <div class="contact-plan-demo"><span aria-hidden="true">◉</span><div><strong>Connected to your school team</strong><small>Your introductions and follow-ups, together in SchoolCareBridge.</small></div></div>
        </aside>
        <div class="contact-plan-main">
          <header class="contact-plan-top"><span>{{ step === 'welcome' ? 'YOUR CLIENT CONTACT PLAN' : 'MAKE IT YOURS' }}</span><button type="button" class="contact-plan-icon-button" :disabled="busy" @click="minimize" aria-label="Minimize contact plan">−</button></header>
          <template v-if="step === 'welcome'">
            <div class="contact-plan-welcome">
              <span class="contact-plan-pill">{{ plan.mandatory ? 'Required setup' : 'Optional to start' }}</span>
              <h1 id="contact-plan-title">A little help with<br>the first contact?</h1>
              <p id="contact-plan-description">When a school client is assigned to you, we can help introduce you to their parent or guardian and keep the next steps moving.</p>
              <div class="contact-plan-benefits"><p><span aria-hidden="true">✓</span> A personal email, in your words</p><p><span aria-hidden="true">✓</span> Follow-ups when a family hasn’t replied</p><p><span aria-hidden="true">✓</span> Every contact recorded in SchoolCareBridge</p></div>
              <button type="button" class="contact-plan-primary contact-plan-wide" @click="step = 'configure'">Yes, help with my initial contact <span aria-hidden="true">→</span></button>
              <button v-if="!plan.mandatory" type="button" class="contact-plan-text-button contact-plan-wide" :disabled="busy" @click="decline">{{ busy ? 'Saving…' : 'No thanks, I’ll handle it myself' }}</button>
              <p class="contact-plan-fine">You can return to this plan from the small card in the corner.</p>
            </div>
          </template>
          <template v-else>
            <div class="contact-plan-configure">
              <h1 id="contact-plan-title">Your first hello,<br>ready to go.</h1>
              <p id="contact-plan-description">When a new school client is assigned to me, send an introduction on my behalf.</p>
              <div class="contact-plan-tabs" role="tablist" aria-label="Contact plan settings"><button type="button" role="tab" :aria-selected="tab === 'message'" aria-controls="contact-plan-message" id="contact-plan-message-tab" @click="tab = 'message'">01 · Your message</button><button type="button" role="tab" :aria-selected="tab === 'followup'" aria-controls="contact-plan-followup" id="contact-plan-followup-tab" @click="tab = 'followup'">02 · Follow-up plan</button></div>
              <div v-show="tab === 'message'" id="contact-plan-message" role="tabpanel" aria-labelledby="contact-plan-message-tab">
                <div class="contact-plan-preview">
                  <div class="contact-plan-envelope"><span class="contact-plan-mail-dot"></span><strong>{{ plan.preview?.subject || 'An introduction from your child’s provider' }}</strong><span class="contact-plan-sample-label">EXAMPLE</span></div>
                  <dl class="contact-plan-addresses"><div><dt>From</dt><dd>{{ providerName || plan.providerName || 'Your provider name' }} &lt;{{ plan.routing?.from }}&gt;</dd></div><div><dt>To</dt><dd>Parent name · testing@itsco.health</dd></div><div><dt>Reply to</dt><dd>{{ plan.routing?.replyTo }}</dd></div><div><dt>Copy</dt><dd>You receive a private copy (BCC)</dd></div></dl>
                  <p class="contact-plan-email-body">{{ renderedBody }}</p>
                </div>
                <button type="button" class="contact-plan-edit-toggle" :aria-expanded="editing" aria-controls="contact-plan-editor" @click="editing = !editing">{{ editing ? 'Close editor' : 'Edit my introduction' }} <span aria-hidden="true">{{ editing ? '−' : '↗' }}</span></button>
                <div v-if="editing" id="contact-plan-editor" class="contact-plan-editor"><label for="contact-plan-template">Your default email body</label><textarea id="contact-plan-template" v-model="draft.template" rows="9" maxlength="6000" spellcheck="true"></textarea><p>Keep these fields so each introduction stays personal:</p><div class="contact-plan-tokens"><code v-for="token in requiredTokens" :key="token">{{ token }}</code></div><p v-if="templateError" class="contact-plan-field-error">{{ templateError }}</p></div>
                <button type="button" class="contact-plan-example" :disabled="busy || !!templateError" @click="sendExample"><span aria-hidden="true">✉</span> {{ sendingExample ? 'Sending your example…' : exampleConversationId ? 'Send me another example' : 'Send me an example' }} <span aria-hidden="true">↗</span></button>
                <p class="contact-plan-fine">{{ plan.routing?.isSso ? 'The plan will minimize so you can check your email. Replies return to Messages in the app.' : 'The plan will minimize so you can check Messages, then reopen it here. Replies go to your email address.' }}</p>
                <p v-if="plan.routing?.replyTrackingNote" class="contact-plan-fine">{{ plan.routing.replyTrackingNote }}</p>
              </div>
              <div v-show="tab === 'followup'" id="contact-plan-followup" role="tabpanel" aria-labelledby="contact-plan-followup-tab" class="contact-plan-followups">
                <div class="contact-plan-timeline-item"><span class="contact-plan-timeline-number">1</span><div><h3>A warm introduction</h3><p>Send the email when a new school client is assigned. Record the first contact and update Parents Contacted.</p></div></div>
                <div class="contact-plan-timeline-item"><span class="contact-plan-timeline-number">2</span><div><h3>A gentle text</h3><p>If there’s no reply, send a text only when the family has opted in.</p><label class="contact-plan-number-label">After <input v-model.number="draft.smsAfterDays" type="number" min="1" max="30" aria-label="Days before text follow-up"> days without a reply</label></div></div>
                <div class="contact-plan-timeline-item"><span class="contact-plan-timeline-number">3</span><div><h3>One more email</h3><p>If neither message gets a reply, follow up by email. You receive a private copy of each email.</p><label class="contact-plan-number-label">After <input v-model.number="draft.emailAfterDays" type="number" min="1" max="60" aria-label="Days before email follow-up"> days from the introduction</label></div></div>
                <div class="contact-plan-support"><span aria-hidden="true">✦</span><div><h3>We’ll help keep the conversation moving</h3><p>When a family replies and is waiting on you, remind you by email and opted-in text, and notify support.</p><label class="contact-plan-number-label">After <input v-model.number="draft.staleAfterHours" type="number" min="1" max="336" aria-label="Hours before stale reply reminder"> hours without your response</label></div></div>
                <p class="contact-plan-fine">For replies that go to an outside email address, send your response in the app so the contact record stays current.</p>
              </div>
              <p v-if="notice" role="status" class="contact-plan-notice">{{ notice }}</p>
              <p v-if="timingError" class="contact-plan-field-error">{{ timingError }}</p>
              <footer class="contact-plan-actions"><button type="button" class="contact-plan-text-button" :disabled="busy" @click="minimize">Finish later</button><button v-if="tab === 'message'" type="button" class="contact-plan-primary" :disabled="busy || !!templateError" @click="tab = 'followup'">Next: follow-ups <span aria-hidden="true">→</span></button><button v-else type="button" class="contact-plan-primary" :disabled="busy || !!templateError || !!timingError" @click="save">{{ busy ? 'Saving…' : plan.status === 'enabled' ? 'Save my contact plan' : 'Turn on my contact plan' }} <span aria-hidden="true">✓</span></button></footer>
              <template v-if="plan.status === 'enabled' && !plan.mandatory"><button type="button" class="contact-plan-text-button contact-plan-wide" :disabled="busy" @click="decline">Turn off automatic contact</button><p class="contact-plan-fine">Turning this off stops new introductions and automated follow-ups. Your recorded contacts stay in the client history.</p></template>
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

const props = defineProps({ agencyId: [Number, String], userId: [Number, String], providerName: { type: String, default: '' }, messagesPath: { type: String, default: '/messages' }, locked: Boolean });
const plan = ref(null), open = ref(false), step = ref('welcome'), tab = ref('message'), editing = ref(false), busy = ref(false), sendingExample = ref(false), error = ref(''), notice = ref(''), panel = ref(null), exampleConversationId = ref(null);
const draft = reactive({ template: '', smsAfterDays: 3, emailAfterDays: 7, staleAfterHours: 72 });
const requiredTokens = ['{{parent_name}}', '{{provider_name}}', '{{school_name}}', '{{service_day}}'];
const templateError = computed(() => {
  const missing = requiredTokens.filter(token => !draft.template.includes(token));
  if (missing.length) return `Keep these fields in your message: ${missing.join(', ')}.`;
  if (draft.template.trim().length < 80 || draft.template.length > 6000) return 'Keep your message between 80 and 6,000 characters.';
  if (/<[^>]*>/.test(draft.template)) return 'Use plain text in your introduction.';
  if ([...draft.template.matchAll(/{{\s*([^}]+)\s*}}/g)].some(match => !requiredTokens.includes(`{{${match[1]}}}`))) return 'Use only the four name, school, and day fields shown below.';
  return '';
});
const timingError = computed(() => {
  if (!Number.isInteger(draft.smsAfterDays) || draft.smsAfterDays < 1 || draft.smsAfterDays > 30) return 'Choose a text follow-up between 1 and 30 days.';
  if (!Number.isInteger(draft.emailAfterDays) || draft.emailAfterDays <= draft.smsAfterDays || draft.emailAfterDays > 60) return 'Schedule the email after the text follow-up, within 60 days.';
  if (!Number.isInteger(draft.staleAfterHours) || draft.staleAfterHours < 1 || draft.staleAfterHours > 336) return 'Choose a reminder between 1 and 336 hours.';
  return '';
});
const renderedBody = computed(() => {
  const values = { parent_name: 'Parent name', provider_name: props.providerName || plan.value?.providerName || 'Provider name', school_name: 'Example Middle School', service_day: 'Example Day', ...plan.value?.previewValues };
  return draft.template.replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => values[key] ?? token);
});
const exampleMessagesTo = computed(() => ({ path: props.messagesPath, query: { conversationId: exampleConversationId.value } }));
let version = 0, disposed = false, timer, loading = false, previousFocus;
function requestOptions() { return { params: { agencyId: props.agencyId }, skipGlobalLoading: true }; }
function setPlan(data) {
  plan.value = data;
  draft.template = data.template || '';
  for (const key of ['smsAfterDays', 'emailAfterDays', 'staleAfterHours']) draft[key] = Number(data[key] ?? data.defaults?.[key] ?? ({ smsAfterDays: 3, emailAfterDays: 7, staleAfterHours: 72 })[key]);
}
function resume() { error.value = ''; open.value = true; }
function minimize() { if (!busy.value) open.value = false; }
async function load({ reset = false } = {}) {
  if (!props.agencyId || !props.userId || loading || disposed) return;
  if (!reset && (open.value || busy.value || plan.value?.eligible)) return;
  loading = true;
  const request = version;
  try {
    const { data } = await api.get('/school-contact-plan', requestOptions());
    if (disposed || request !== version) return;
    setPlan(data);
    step.value = data.status === 'enabled' ? 'configure' : 'welcome';
    open.value = !!data.eligible && (data.status === 'unconfigured' || (data.mandatory && data.status !== 'enabled'));
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
    if (turningOff) { notice.value = 'Automatic contact is off.'; step.value = 'welcome'; }
  } catch (e) { if (request === version) error.value = messageFrom(e, 'Your preference could not be saved. Please try again.'); }
  finally { if (request === version) busy.value = false; }
}
async function sendExample() {
  if (busy.value || templateError.value) return;
  busy.value = true; sendingExample.value = true; error.value = '';
  const request = version;
  try {
    const { data } = await api.post('/school-contact-plan/example', { template: draft.template }, requestOptions());
    if (disposed || request !== version) return;
    if (!data.sent) throw new Error('Example not sent');
    exampleConversationId.value = data.conversationId;
    notice.value = `Example sent to ${data.deliveredTo || 'your demo inbox'}.`;
    open.value = false;
  } catch (e) { if (request === version) error.value = messageFrom(e, 'The example could not be sent. Your draft is still here; please try again.'); }
  finally { if (request === version) { busy.value = false; sendingExample.value = false; } }
}
async function save() {
  if (busy.value || templateError.value || timingError.value) return;
  busy.value = true; error.value = '';
  const request = version;
  try {
    const { data } = await api.put('/school-contact-plan', { status: 'enabled', ...draft }, requestOptions());
    if (disposed || request !== version) return;
    setPlan(data); notice.value = 'Your contact plan is on.'; open.value = false;
  } catch (e) { if (request === version) error.value = messageFrom(e, 'Your contact plan could not be saved. Please try again.'); }
  finally { if (request === version) busy.value = false; }
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
  version++; plan.value = null; open.value = false; busy.value = false; sendingExample.value = false; notice.value = ''; error.value = ''; exampleConversationId.value = null; editing.value = false; tab.value = 'message'; loading = false;
  load({ reset: true });
}, { immediate: true });
function onFocus() { load(); }
onMounted(() => { timer = setInterval(onFocus, 60000); window.addEventListener('focus', onFocus); });
onBeforeUnmount(() => { disposed = true; version++; clearInterval(timer); window.removeEventListener('focus', onFocus); previousFocus?.focus?.(); });
</script>

<style scoped>
.contact-plan-shade{position:fixed;inset:0;z-index:17500;display:grid;place-items:center;overflow:auto;padding:28px;background:#102e5399;backdrop-filter:blur(9px);font-family:inherit;color:#102e53}.contact-plan-panel{display:grid;grid-template-columns:300px minmax(0,650px);width:min(100%,950px);max-height:92dvh;overflow:auto;border-radius:26px;background:#fff;box-shadow:0 30px 100px #102b3f50;outline:none}.contact-plan-story{position:relative;overflow:hidden;display:flex;flex-direction:column;padding:32px 30px;color:#edf9f5;background:radial-gradient(ellipse at 90% 45%,#007cdd45,transparent 70%),linear-gradient(155deg,#102e53,#174765 58%,#006b91)}.contact-plan-brand{display:flex;justify-content:center;background:#fff;border-radius:14px;padding:8px 12px}.contact-plan-brand :deep(.scb-brand){width:205px;max-width:100%}.contact-plan-brand :deep(img){object-fit:contain!important}.contact-plan-brand :deep(a:focus-visible){outline:3px solid #007cdd;outline-offset:4px}.contact-plan-orbit{position:relative;display:grid;place-items:center;width:160px;height:150px;margin:37px auto 20px}.contact-plan-orbit>span{position:relative;z-index:1;display:grid;place-items:center;width:100px;height:100px;border-radius:28px;background:linear-gradient(140deg,#d8f3ff,#91d8ef);color:#184765;font-size:50px;box-shadow:12px 18px 35px #071e3240;transform:rotate(-8deg)}.contact-plan-orbit i{position:absolute;width:151px;height:151px;border:1px solid #d3ebe233;border-radius:50%;transform:rotate(25deg);box-shadow:0 0 0 19px #d3ebe207}.contact-plan-orbit b{position:absolute;z-index:2;right:4px;bottom:13px;display:grid;place-items:center;width:38px;height:38px;border:4px solid #174765;border-radius:50%;background:#e6f8ed;color:#087a48;font-size:18px}.contact-plan-eyebrow{font-size:9px;letter-spacing:2px;color:#b9e6f2;margin:16px 0}.contact-plan-story h2{color:#f6f8f5;font-size:37px;line-height:1.15;letter-spacing:-1.4px;font-weight:550;margin:0 0 16px}.contact-plan-story>p:not(.contact-plan-eyebrow){font-size:13px;line-height:1.8;color:#d3e8f3}.contact-plan-journey{list-style:none;padding:0;margin:22px 0 30px;display:grid;gap:18px;font-size:12px}.contact-plan-journey span{margin-right:12px;color:#9ad4ec;font-size:10px}.contact-plan-demo{margin-top:auto;display:flex;align-items:flex-start;gap:10px;padding-top:20px;border-top:1px solid #d3ebe226}.contact-plan-demo>span{color:#7ee3af;font-size:14px}.contact-plan-demo strong,.contact-plan-demo small{display:block}.contact-plan-demo strong{font-size:11px;font-weight:600}.contact-plan-demo small{font-size:10px;line-height:1.6;color:#c9e4ef;margin-top:6px}.contact-plan-main{min-width:0;padding:25px 34px 24px}.contact-plan-top{display:flex;align-items:center;justify-content:space-between;color:#75858c;font-size:9px;font-weight:650;letter-spacing:1.5px}.contact-plan-icon-button{border:1px solid #e0e8e8;border-radius:10px;background:#fff;color:#5e7279;width:34px;height:34px;cursor:pointer;font:inherit;font-size:23px}.contact-plan-welcome{padding:30px 0 12px}.contact-plan-pill{display:inline-block;padding:6px 10px;border-radius:30px;background:#e7f5fc;color:#17638b;font-size:10px;font-weight:600}.contact-plan-main h1{margin:18px 0 15px;font-size:35px;line-height:1.18;letter-spacing:-1.1px;font-weight:550;color:#102e53}.contact-plan-main p{line-height:1.7}.contact-plan-welcome>p:not(.contact-plan-fine),.contact-plan-configure>p:first-of-type{font-size:13px;color:#687b83;max-width:440px}.contact-plan-benefits{display:grid;gap:2px;margin:24px 0 30px}.contact-plan-benefits p{font-size:12px;margin:8px 0}.contact-plan-benefits span{display:inline-grid;place-items:center;width:21px;height:21px;margin-right:11px;background:#edf5ef;border-radius:50%;color:#537a60}.contact-plan-primary{display:flex;align-items:center;justify-content:center;gap:22px;min-height:45px;padding:12px 19px;border:0;border-radius:10px;background:#007cbd;color:white;font:inherit;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 4px 10px #007cbd19}.contact-plan-primary:hover{background:#075c91}.contact-plan-wide{width:100%}.contact-plan-text-button{min-height:43px;border:0;background:transparent;color:#687d83;cursor:pointer;font:inherit;font-size:11px;padding:10px 6px}.contact-plan-fine{font-size:10px!important;color:#7e8b90!important;line-height:1.7;margin:12px 0}.contact-plan-welcome>.contact-plan-fine{text-align:center}.contact-plan-tabs{display:flex;border-bottom:1px solid #e4eaea;margin:22px 0 17px;gap:20px}.contact-plan-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:0 0 12px;color:#839096;font:inherit;font-size:11px;cursor:pointer}.contact-plan-tabs [aria-selected=true]{color:#007cbd;border-bottom-color:#007cbd;font-weight:650}.contact-plan-preview{border:1px solid #dfe8e7;border-radius:13px;overflow:hidden;background:#fcfdfc}.contact-plan-envelope{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid #e5edeb;background:#f4f8f5}.contact-plan-envelope strong{font-size:10px;font-weight:600;flex:1}.contact-plan-mail-dot{width:6px;height:6px;border-radius:50%;background:#139e61}.contact-plan-sample-label{font-size:8px;letter-spacing:1px;color:#82918a}.contact-plan-addresses{margin:12px 15px;padding-bottom:11px;border-bottom:1px solid #e9eeeb;font-size:9px}.contact-plan-addresses>div{display:flex;gap:7px;line-height:1.7}.contact-plan-addresses dt{width:42px;flex-shrink:0;color:#91a09d}.contact-plan-addresses dd{margin:0;color:#647871;overflow-wrap:anywhere}.contact-plan-email-body{white-space:pre-wrap;font-size:11px;line-height:1.85!important;padding:0 16px 9px;color:#425c60}.contact-plan-edit-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 0 10px;border:0;background:transparent;color:#075c91;font:inherit;font-size:10px;font-weight:600;cursor:pointer}.contact-plan-editor{margin:3px 0 14px}.contact-plan-editor label{display:block;font-size:11px;font-weight:600;margin-bottom:8px}.contact-plan-editor textarea{box-sizing:border-box;width:100%;resize:vertical;border:1px solid #bacdca;border-radius:10px;padding:12px;background:#fff;color:#304f52;font:inherit;font-size:11px;line-height:1.7}.contact-plan-editor p{font-size:10px;color:#74867f}.contact-plan-tokens{display:flex;flex-wrap:wrap;gap:5px}.contact-plan-tokens code{font-size:9px;padding:4px 6px;border-radius:5px;background:#edf4ef;color:#4b6e61}.contact-plan-example{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:1px solid #c8d9d1;border-radius:9px;background:#eff8fd;color:#075c91;font:inherit;font-size:11px;font-weight:600;cursor:pointer}.contact-plan-example>span:last-child{margin-left:auto}.contact-plan-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #e9eeeb;padding-top:17px;margin-top:20px}.contact-plan-actions .contact-plan-primary{font-size:11px}.contact-plan-followups{padding-top:3px}.contact-plan-timeline-item{display:flex;gap:14px;position:relative;padding:0 0 22px}.contact-plan-timeline-item:not(:nth-child(3)):after{content:'';position:absolute;left:13px;top:30px;bottom:4px;width:1px;background:#dce7e0}.contact-plan-timeline-number{display:grid;place-items:center;width:27px;height:27px;flex-shrink:0;border:1px solid #cbded1;border-radius:50%;color:#547b65;font-size:10px;background:#f3f8f2}.contact-plan-timeline-item h3,.contact-plan-support h3{font-size:12px;font-weight:650;margin:4px 0 6px}.contact-plan-timeline-item p,.contact-plan-support p{font-size:11px;color:#73858a;margin:0 0 8px}.contact-plan-number-label{font-size:10px;color:#576f73}.contact-plan-number-label input{width:46px;margin:0 3px;border:1px solid #c6d7d0;border-radius:6px;padding:6px;color:#345a53;background:white;text-align:center;font:inherit;font-weight:600;box-sizing:border-box}.contact-plan-support{display:flex;gap:12px;border-radius:12px;background:#f3f6f1;padding:15px}.contact-plan-support>span{font-size:19px;color:#779068}.contact-plan-error,.contact-plan-field-error{font-size:11px!important;color:#9c3a37!important;background:#fff0ed;border-radius:8px;padding:10px 12px}.contact-plan-notice{font-size:11px;color:#2e7256;border-radius:8px;background:#eef7ef;padding:9px 12px}.contact-plan-panel button:focus-visible,.contact-plan-panel input:focus-visible,.contact-plan-panel textarea:focus-visible,.contact-plan-dock a:focus-visible,.contact-plan-dock button:focus-visible{outline:3px solid #bd9d57;outline-offset:3px}.contact-plan-panel button:disabled{opacity:.55;cursor:wait}.contact-plan-dock{position:fixed;bottom:20px;left:22px;width:min(320px,calc(100vw - 44px));z-index:1100;border:1px solid #c4e2f1;border-radius:14px;background:#fff;box-shadow:0 10px 30px #23483b24;font-family:inherit;overflow:hidden}.contact-plan-resume{display:flex;align-items:center;gap:12px;border:0;width:100%;background:#fff;color:#184765;text-align:left;cursor:pointer;padding:15px;font:inherit}.contact-plan-resume>span:nth-child(2){flex:1;min-width:0}.contact-plan-resume strong,.contact-plan-resume small{display:block}.contact-plan-resume strong{font-size:12px;font-weight:600}.contact-plan-resume small{font-size:10px;line-height:1.5;color:#7a8b87;margin-top:5px;overflow-wrap:anywhere}.contact-plan-dock-icon{display:grid;place-items:center;width:33px;height:33px;flex-shrink:0;border-radius:10px;background:#edf4ed;color:#007cbd;font-size:19px}.contact-plan-inbox{display:block;border-top:1px solid #e3ece7;padding:9px 15px;color:#416e64;background:#f7faf7;font-size:10px;text-decoration:none}@media(max-width:760px){.contact-plan-shade{padding:14px}.contact-plan-panel{grid-template-columns:1fr;width:min(100%,540px);max-height:94dvh;border-radius:20px}.contact-plan-story{padding:15px 25px}.contact-plan-story>*:not(.contact-plan-brand){display:none}.contact-plan-main{padding:20px 25px}.contact-plan-welcome{padding-top:18px}.contact-plan-main h1{font-size:30px}.contact-plan-dock{left:12px;bottom:12px}.contact-plan-envelope{padding:12px}.contact-plan-sample-label{display:none}}@media(prefers-reduced-motion:no-preference){.contact-plan-panel{animation:contact-plan-enter .24s ease-out}@keyframes contact-plan-enter{from{opacity:0;transform:translateY(12px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}}
</style>
