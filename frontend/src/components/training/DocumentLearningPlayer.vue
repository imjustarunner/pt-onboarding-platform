<template>
  <section class="document-learning-player" :style="fontStyle" aria-label="Guide training">
    <header><div><p class="eyebrow">{{ lesson?.purpose === 'onboarding' ? 'Onboarding' : lesson?.paid ? 'Assigned learning' : 'On-demand review' }}</p><h2>{{ lesson?.definition.title || 'Guide training' }}</h2></div><button type="button" :disabled="busy" @click="close">Save &amp; close</button></header>
    <p v-if="error" role="alert" class="training-error">{{ error }} <button @click="load">Reload</button></p>
    <p v-if="!lesson" role="status">Loading your guide and learning record…</p>
    <template v-else>
      <p v-if="lesson.book?.metadata?.beta" class="time-banner optional">Beta practice edition · Your progress is saved separately from required training.</p>
      <div :class="['time-banner', { optional: !lesson.paid }]">
        <div><strong>{{ lesson.paid ? 'Assigned training · Paid time' : 'Optional review · Your own time' }}</strong><p v-if="lesson.paid">{{ lesson.onboardingTime ? 'Active time joins your onboarding record and is submitted with your onboarding package.' : 'Active reading, questions and quiz retries are recorded for payroll review. You can submit time before finishing.' }}</p><p v-else>This practice attempt does not track paid time or create a payroll claim. Your required completion record stays intact.</p><p v-if="lesson.paid && lesson.status !== 'completed'" role="status">{{ activity.tracking.value ? 'Recording active time' : activity.paused.value ? 'Timer paused' : 'Timer waits while you are away or inactive' }}</p></div>
        <button v-if="lesson.paid && lesson.status !== 'completed'" @click="activity.paused.value = !activity.paused.value">{{ activity.paused.value ? 'Resume timer' : 'Pause timer' }}</button>
        <button v-if="lesson.paid && !lesson.onboardingTime" :disabled="busy" @click="saveTime">Submit recorded time</button>
      </div>
      <p v-if="activity.error.value" role="alert" class="training-error">{{ activity.error.value }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p class="edition-note">Assigned edition v{{ lesson.book.version.version_number }} · {{ lesson.definition.questions.length }} questions · All answers correct to complete. Review feedback and retry as needed.</p>
      <p v-if="lesson.key === 'counseling-guide' || lesson.book.metadata?.learningPurpose === 'orientation'" class="edition-note"><strong>Orientation only.</strong> A saved completion is not a clinical skills assessment, certification or authorization to practice a technique.</p>
      <nav class="learning-tabs" aria-label="Learning activity"><button :aria-pressed="tab === 'read'" @click="tab = 'read'">1. Read &amp; ask · {{ lesson.readSections.length }}/{{ lesson.definition.requiredSections.length }}</button><button :aria-pressed="tab === 'quiz'" @click="tab = 'quiz'">2. Knowledge check{{ lesson.status === 'completed' ? ' · Complete' : '' }}</button></nav>
      <div v-show="tab === 'read'">
        <div class="reading-plan"><h3>Core reading</h3><p>Review these sections, ask questions as needed, then mark each section reviewed. The full guide remains available below.</p><ol><li v-for="slug in lesson.definition.requiredSections" :key="slug"><button @click="openSection(slug)"><span aria-hidden="true">{{ lesson.readSections.includes(slug) ? '✓' : '○' }}</span> {{ titleFor(slug) }}</button></li></ol></div>
        <Book ref="book" :handbook="lesson.book" :analytics-http="http" :analytics="{ agencyId, enabled: !lesson.book.metadata?.beta, apiBase: apiBase.includes('/prehire-portal/') ? apiBase.replace(/\/document-learning$/, '/document-analytics') : '/document-analytics', surface: lesson.purpose === 'practice' ? 'on-demand' : lesson.purpose === 'onboarding' ? 'onboarding' : 'assigned-training' }" :answer-question="ask" @section-change="selectedSlug = $event" @handbook-link="openHandbook">
          <template #section-actions="{ section }">
            <div v-if="lesson.definition.requiredSections.includes(section.slug)" class="reading-confirmation"><p>{{ titleFor(section.slug) }}</p><button :disabled="busy || lesson.status === 'completed' || lesson.readSections.includes(section.slug)" @click="markRead">{{ lesson.readSections.includes(section.slug) ? '✓ Reviewed' : 'I have reviewed this section' }}</button><button v-if="lesson.readSections.includes(section.slug) && !allRead" @click="openSection(lesson.definition.requiredSections.find(s => !lesson.readSections.includes(s)))">Next core section →</button></div>
          </template>
        </Book>
        <button class="primary" @click="tab = 'quiz'">Continue to knowledge check →</button>
      </div>
      <div v-if="tab === 'quiz'" class="knowledge-check">
        <p v-if="lesson.status === 'completed'" class="completion-note" role="status">✓ Completed and saved for this edition. You can revisit the guide at any time or start a separate on-demand practice attempt.</p>
        <p v-else-if="!allRead">Finish the core reading before submitting your answers. <button @click="tab = 'read'">Return to reading</button></p>
        <form @submit.prevent="submitQuiz">
          <fieldset v-for="(question, index) in lesson.definition.questions" :key="question.id" :disabled="busy || lesson.status === 'completed'"><legend>{{ index + 1 }}. {{ question.prompt }}</legend><label v-for="(option, choice) in question.options" :key="choice"><input v-model="answers[index]" type="radio" :name="`${lesson.id}-${question.id}`" :value="choice" required />{{ option }}</label></fieldset>
          <button v-if="lesson.status !== 'completed'" class="primary" :disabled="busy || !allRead">{{ busy ? 'Saving…' : 'Check my answers' }}</button>
        </form>
        <section v-if="result" class="quiz-feedback" aria-label="Quiz feedback"><h3>{{ result.passed ? 'Knowledge check complete' : `${result.score}% · Review and try again` }}</h3><article v-for="(feedback, index) in result.feedback" :key="feedback.id"><strong>{{ index + 1 }}. {{ feedback.correct ? 'Correct' : 'Review this answer' }}</strong><p>{{ feedback.explanation }}</p><button @click="openSection(feedback.sourceSlug)">Read {{ titleFor(feedback.sourceSlug) }} ↗</button></article></section>
        <details v-if="lesson.attempts.length"><summary>Saved attempts · {{ lesson.attempts.length }}</summary><p v-for="attempt in lesson.attempts" :key="attempt.id">{{ attempt.score }}% · {{ attempt.passed ? 'Passed' : 'Review and retry' }}</p></details>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';
import Book from '../handbook/WorkplaceHandbookBook.vue';
import { useGuideTrainingActivity } from '../../composables/useGuideTrainingActivity';
const props = defineProps({ agencyId: [Number, String], learningId: { type: [Number, String], required: true }, http: { type: Object, default: () => api }, apiBase: { type: String, default: '/provider-update/document-learning' } });
const emit = defineEmits(['close', 'completed', 'handbook-link']);
const router = useRouter(), route = useRoute();
const lesson = ref(null), error = ref(''), notice = ref(''), busy = ref(false), tab = ref('read'), selectedSlug = ref(''), book = ref(null), answers = ref([]), result = ref(null);
let sequence = 0, submissionKey = crypto.randomUUID();
const base = computed(() => `${props.apiBase}/enrollments/${props.learningId}`);
const enabled = computed(() => lesson.value?.paid && lesson.value.status !== 'completed');
const activity = useGuideTrainingActivity({ enabled, send: async payload => (await props.http.post(`${base.value}/heartbeat`, { ...payload, agencyId: props.agencyId })).data });
const allRead = computed(() => lesson.value?.definition.requiredSections.every(s => lesson.value.readSections.includes(s)));
const fontStyle = { '--learning-font': 'var(--font-ptco)' };
const titleFor = slug => lesson.value?.book.sections.find(s => s.slug === slug)?.title || slug;
async function load() {
  const current = ++sequence; error.value = '';
  try { const { data } = await props.http.get(base.value, { params: { agencyId: props.agencyId } }); if (current !== sequence) return; lesson.value = data; if (!result.value && data.attempts.length) result.value = data.attempts[0]; }
  catch (e) { if (current === sequence) error.value = e.response?.data?.error?.message || 'The training could not be loaded.'; }
}
async function openSection(slug) { tab.value = 'read'; await nextTick(); await book.value?.selectSection(slug, true); }
async function markRead() {
  busy.value = true; error.value = '';
  try { const { data } = await props.http.post(`${base.value}/reading`, { agencyId: props.agencyId, slug: selectedSlug.value }); lesson.value.readSections = data.readSections; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Reading progress could not be saved.'; }
  finally { busy.value = false; }
}
async function ask(payload, options) { return (await props.http.post(`${base.value}/answer`, { ...payload, agencyId: props.agencyId }, { ...options, timeout: 240000 })).data; }
async function submitTime(flush = true) {
  if (!lesson.value?.paid) return;
  if (flush) await activity.flush();
  const { data } = await props.http.post(`${base.value}/time`, { agencyId: props.agencyId }); notice.value = data.message;
}
async function saveTime() {
  if (busy.value) return; busy.value = true; error.value = '';
  try { await submitTime(); } catch (e) { error.value = e.response?.data?.error?.message || 'Time could not be submitted. Recorded time is retained; please retry.'; }
  finally { busy.value = false; }
}
async function submitQuiz() {
  if (busy.value || !allRead.value) return;
  busy.value = true; error.value = '';
  try {
    if (lesson.value.paid) await activity.flush();
    const { data } = await props.http.post(`${base.value}/quiz`, { agencyId: props.agencyId, answers: answers.value, requestKey: submissionKey }); result.value = data;
    await load();
    if (data.passed) { await submitTime(); emit('completed'); }
  } catch (e) { error.value = e.response?.data?.error?.message || 'Your answers could not be saved. Please retry.'; }
  finally { busy.value = false; }
}
async function close() {
  if (busy.value) return; busy.value = true;
  try { if (lesson.value?.paid) { await activity.flush(); await activity.flush(true); await submitTime(false); } emit('close'); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Recorded time could not be submitted. Your recorded time is retained; retry before closing.'; }
  finally { busy.value = false; }
}
function openHandbook(hash) {
  if (props.apiBase.startsWith('/prehire-portal/')) { emit('handbook-link', hash); return; }
  const prefix = route.params.organizationSlug ? `/${route.params.organizationSlug}` : '';
  const url = router.resolve({ path: `${prefix}/library`, query: { companyDocument: 'workplace-handbook' }, hash: hash ? `#${hash}` : '' }).href;
  window.open(url, '_blank', 'noopener');
}
watch(answers, () => { submissionKey = crypto.randomUUID(); }, { deep: true });
watch(() => [props.agencyId, props.learningId], () => { lesson.value = null; result.value = null; answers.value = []; load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.document-learning-player{font-family:var(--learning-font,var(--font-ptco));color:#244236;min-width:0}.document-learning-player header{display:flex;justify-content:space-between;align-items:start;gap:20px;flex-wrap:wrap;margin:24px 0}.eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase}.document-learning-player h2{font:700 26px/1.5 var(--learning-font,var(--font-ptco));margin:7px 0}.document-learning-player button{font:inherit;font-size:12px;border:1px solid #bdd1c2;border-radius:7px;background:white;color:#24513d;padding:11px 15px;cursor:pointer}.document-learning-player button:disabled{opacity:.55;cursor:default}.document-learning-player .primary,.learning-tabs [aria-pressed=true]{background:#165a42;color:white}.time-banner{display:flex;align-items:center;flex-wrap:wrap;gap:18px;padding:20px;background:#e4efe0;border:1px solid #c6d9bc;border-radius:10px;font-size:13px;line-height:1.8}.time-banner>div{flex:1;min-width:220px}.time-banner p{margin:6px 0}.time-banner.optional{background:#fff3d8;border-color:#e3d5b1}.training-error{background:#fff0ed;color:#8c3528;padding:15px}.edition-note{font-size:12px;line-height:1.8;margin:18px 0}.learning-tabs{display:flex;gap:10px;margin:20px 0;flex-wrap:wrap}.reading-plan{padding:22px;background:#f5f7ef;border-radius:10px;margin-bottom:20px}.reading-plan p{font-size:13px;line-height:1.8}.reading-plan ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:8px;padding:0;list-style:none}.reading-plan button{text-align:left;line-height:1.6;width:100%}.reading-confirmation{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px;background:#fff9e7;margin:16px 0;flex-wrap:wrap;font-size:13px}.knowledge-check{max-width:860px;margin:24px auto}.knowledge-check fieldset{padding:24px;border:1px solid #d6e1d2;border-radius:10px;margin:24px 0;background:#fffef9}.knowledge-check legend{font-weight:700;font-size:15px;line-height:1.8;padding:0 8px}.knowledge-check label{display:flex;align-items:start;gap:12px;padding:12px 0;font-size:14px;line-height:1.8}.knowledge-check input{flex-shrink:0;margin-top:6px;accent-color:#165a42}.quiz-feedback{background:#edf3e7;padding:24px;border-radius:10px;margin:24px 0}.quiz-feedback article{border-top:1px solid #d0deca;padding:16px 0;font-size:13px;line-height:1.8}.completion-note{background:#e4efe0;padding:18px;line-height:1.8}.document-learning-player:deep(.handbook-book){margin-bottom:24px}button:focus-visible,input:focus-visible{outline:3px solid #38705a;outline-offset:3px}@media(max-width:600px){.knowledge-check fieldset{padding:15px}.knowledge-check legend{font-size:14px}}
</style>
