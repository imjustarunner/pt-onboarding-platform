<template>
  <section class="document-learning-player" :style="fontStyle" aria-label="Guide training">
    <header><div><p class="eyebrow">{{ lesson?.purpose === 'onboarding' ? 'Onboarding' : lesson?.paid ? 'Assigned learning' : 'On-demand training' }}</p><h2>{{ lesson?.definition.title || 'Guide training' }}</h2></div><button type="button" :disabled="busy" @click="close">Save &amp; close</button></header>
    <p v-if="error" role="alert" class="training-error">{{ error }} <button @click="load">Reload</button></p>
    <p v-if="!lesson" role="status">Loading your guide and learning record…</p>
    <template v-else>
      <div :class="['time-banner', { optional: !lesson.paid }]">
        <div><strong>{{ lesson.paid ? 'Assigned training · Paid time' : 'Optional practice · Your own time' }}</strong><span v-if="lesson.book?.metadata?.beta" class="beta-label">Supplied edition</span><p v-if="lesson.paid && lesson.status !== 'completed'" role="status">{{ activity.tracking.value ? 'Recording active time' : activity.paused.value ? 'Timer paused' : 'Timer waits while you are away or inactive' }}</p><details><summary>How your progress is saved</summary><p v-if="lesson.paid">{{ lesson.onboardingTime ? 'Active time joins your onboarding record and is submitted with your onboarding package.' : 'Active reading and reflection questions are recorded for payroll review. You can submit time before finishing.' }}</p><p v-else>Reading is saved as you review each section. This practice attempt does not track paid time or create a payroll claim. Your required completion record stays intact.</p></details></div>
        <button v-if="lesson.paid && lesson.status !== 'completed'" @click="activity.paused.value = !activity.paused.value">{{ activity.paused.value ? 'Resume timer' : 'Pause timer' }}</button>
        <button v-if="lesson.paid && !lesson.onboardingTime" :disabled="busy" @click="saveTime">Submit recorded time</button>
      </div>
      <p v-if="activity.error.value" role="alert" class="training-error">{{ activity.error.value }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p class="edition-note">{{ lesson.book.metadata?.beta ? 'Supplied guide edition' : `Edition v${lesson.book.version.version_number}` }} · {{ lesson.definition.requiredSections.length }} core sections · {{ lesson.definition.questions.length }} questions with feedback. Reveal the key points, try workplace scenarios and explore their explanations. There is no score or pass/fail result.</p>
      <p v-if="lesson.key === 'counseling-guide' || lesson.book.metadata?.learningPurpose === 'orientation'" class="edition-note"><strong>Orientation only.</strong> A saved completion is not a clinical skills assessment, certification or authorization to practice a technique.</p>
      <nav class="learning-tabs" aria-label="Learning activity"><button :aria-pressed="tab === 'learn'" @click="tab = 'learn'">Interactive lessons</button><button :aria-pressed="tab === 'read'" @click="tab = 'read'">Full guide · Read &amp; ask · {{ readCount }}/{{ lesson.definition.requiredSections.length }}</button><button :aria-pressed="tab === 'quiz'" @click="openQuiz">Reflect &amp; reveal{{ lesson.status === 'completed' ? ' · Complete' : '' }}</button></nav>
      <GuideLessonDeck v-if="lesson" v-show="tab === 'learn'" :lesson="lesson" :busy="busy" :save-reading="saveDeckReading" :reveal-reflection="saveReflection" @source="openSection" @finish="submitQuiz" />
      <div v-show="tab === 'read'">
        <div v-if="allRead && lesson.status !== 'completed'" class="reading-ready" role="status"><div><strong>Reading complete. Put it into practice.</strong><p>Try {{ lesson.definition.questions.length }} questions and get feedback linked to your guide.</p></div><button class="primary" @click="openQuiz">Start reflection questions →</button><button v-if="optionalPractice" class="text-action" :disabled="busy" @click="skipQuiz">Skip reflection questions for now</button></div>
        <details class="reading-plan"><summary><strong>Your learning path</strong><span>{{ readCount }} of {{ lesson.definition.requiredSections.length }} sections reviewed · then {{ lesson.definition.questions.length }} questions</span></summary><p>{{ lesson.definition.description || 'Review the core sections, then apply what you learned in the reflection questions.' }}</p><ol><li v-for="slug in lesson.definition.requiredSections" :key="slug"><button :aria-current="selectedSlug === slug ? 'step' : undefined" @click="openSection(slug)"><span aria-hidden="true">{{ lesson.readSections.includes(slug) ? '✓' : '○' }}</span> {{ titleFor(slug) }}</button></li></ol></details>
        <Book neutral ref="book" :handbook="lesson.book" :analytics-http="http" :analytics="{ agencyId, enabled: !lesson.book.metadata?.beta, apiBase: apiBase.includes('/prehire-portal/') ? apiBase.replace(/\/document-learning$/, '/document-analytics') : '/document-analytics', surface: lesson.purpose === 'practice' ? 'on-demand' : lesson.purpose === 'onboarding' ? 'onboarding' : 'assigned-training' }" :answer-question="ask" @section-change="selectedSlug = $event" @handbook-link="openHandbook">
          <template #reader-actions="{ section }">
            <div class="reading-confirmation">
              <div><strong>{{ lesson.status === 'completed' ? 'Training completed' : allRead ? 'Reading complete · Questions next' : `${readCount} of ${lesson.definition.requiredSections.length} core sections reviewed` }}</strong><span>{{ allRead ? `${lesson.definition.questions.length} questions with feedback` : lesson.definition.requiredSections.includes(section?.slug) ? (lesson.readSections.includes(section.slug) ? '✓ This core section is reviewed' : 'Read this core section, then continue') : 'Explore the guide or return to your next core section' }}</span></div>
              <button v-if="lesson.status === 'completed'" @click="openQuiz">Review reflection questions →</button>
              <button v-else-if="allRead" class="primary" @click="openQuiz">Start reflection questions →</button>
              <button v-else-if="lesson.definition.requiredSections.includes(section?.slug) && !lesson.readSections.includes(section.slug)" class="primary" :disabled="busy" @click="markRead(section.slug)">{{ busy ? 'Saving…' : 'Reviewed · Continue →' }}</button>
              <button v-else class="primary" @click="openSection(nextUnread)">Next core section →</button>
            </div>
          </template>
        </Book>
      </div>
      <div v-if="tab === 'quiz'" class="knowledge-check">
        <header class="quiz-heading"><div><p class="eyebrow">Apply what you learned</p><h3 ref="quizHeading" tabindex="-1">Reflection questions</h3><p>Choose the response you would use. Then reveal the suggested answers, explanations and links back to your guide. This is a learning exercise, not a test.</p></div><button v-if="optionalPractice && lesson.status !== 'completed'" class="text-action" :disabled="busy" @click="skipQuiz">Skip reflection questions for now</button></header>
        <p v-if="lesson.status === 'completed'" class="completion-note" role="status">✓ Completed and saved for this edition. You can revisit the guide at any time or start a separate on-demand practice attempt.</p>
        <p v-else-if="!allRead">Finish the core reading before submitting your answers. <button @click="tab = 'read'">Return to reading</button></p>
        <p v-if="lesson.status !== 'completed'" class="question-progress" role="status">{{ answeredCount }} of {{ lesson.definition.questions.length }} questions answered</p>
        <form @submit.prevent="submitQuiz">
          <fieldset v-for="(question, index) in lesson.definition.questions" :key="question.id" :disabled="busy || lesson.status === 'completed'"><legend>{{ index + 1 }}. {{ question.prompt }}</legend><label v-for="(option, choice) in question.options" :key="choice"><input v-model="answers[index]" type="radio" :name="`${lesson.id}-${question.id}`" :value="choice" required />{{ option }}</label></fieldset>
          <button v-if="lesson.status !== 'completed'" class="primary" :disabled="busy || !allRead || answeredCount !== lesson.definition.questions.length">{{ busy ? 'Saving…' : 'Reveal answers & save reflection' }}</button>
        </form>
        <section v-if="result" class="quiz-feedback" aria-label="Quiz feedback"><h3>Answers &amp; explanations</h3><article v-for="(feedback, index) in result.feedback" :key="feedback.id"><strong>{{ index + 1 }}. {{ answerFor(feedback) }}</strong><p><strong>Why:</strong> {{ feedback.explanation }}</p><p v-if="feedback.choiceExplanation"><strong>About your choice:</strong> {{ feedback.choiceExplanation }}</p><button @click="openSection(feedback.sourceSlug)">Read {{ titleFor(feedback.sourceSlug) }} ↗</button></article></section>
        <details v-if="lesson.attempts.length"><summary>Saved reflections · {{ lesson.attempts.length }}</summary><p v-for="attempt in lesson.attempts" :key="attempt.id">Reflection saved · Answers available to review</p></details>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';
import Book from '../handbook/WorkplaceHandbookBook.vue';
import GuideLessonDeck from './GuideLessonDeck.vue';
import { useGuideTrainingActivity } from '../../composables/useGuideTrainingActivity';
const props = defineProps({ agencyId: [Number, String], learningId: { type: [Number, String], required: true }, http: { type: Object, default: () => api }, apiBase: { type: String, default: '/provider-update/document-learning' } });
const emit = defineEmits(['close', 'completed', 'handbook-link']);
const router = useRouter(), route = useRoute();
const quizHeading = ref(null);
const lesson = ref(null), error = ref(''), notice = ref(''), busy = ref(false), tab = ref('learn'), selectedSlug = ref(''), book = ref(null), answers = ref([]), result = ref(null);
let sequence = 0, submissionKey = crypto.randomUUID();
const base = computed(() => `${props.apiBase}/enrollments/${props.learningId}`);
const enabled = computed(() => lesson.value?.paid && lesson.value.status !== 'completed');
const activity = useGuideTrainingActivity({ enabled, send: async payload => (await props.http.post(`${base.value}/heartbeat`, { ...payload, agencyId: props.agencyId })).data });
const optionalPractice = computed(() => lesson.value?.purpose === 'practice');
const readCount = computed(() => lesson.value?.definition.requiredSections.filter(s => lesson.value.readSections.includes(s)).length || 0);
const nextUnread = computed(() => lesson.value?.definition.requiredSections.find(s => !lesson.value.readSections.includes(s)));
const answeredCount = computed(() => lesson.value?.definition.questions.filter((q, i) => Number.isInteger(answers.value[i]) && answers.value[i] >= 0 && answers.value[i] < q.options.length).length || 0);
const allRead = computed(() => lesson.value?.definition.requiredSections.every(s => lesson.value.readSections.includes(s)));
const fontStyle = { '--learning-font': 'var(--font-ptco)' };
const answerFor = feedback => feedback.answer || lesson.value?.definition.questions.find(q => q.id === feedback.id)?.options[feedback.correctAnswer] || 'Suggested response';
const titleFor = slug => lesson.value?.book.sections.find(s => s.slug === slug)?.title || slug;
async function load() {
  const current = ++sequence; error.value = '';
  try { const { data } = await props.http.get(base.value, { params: { agencyId: props.agencyId } }); if (current !== sequence) return; lesson.value = data; if (!result.value && data.attempts.length) result.value = data.attempts[0];
    for (const feedback of [...(data.reflections || []), ...(data.attempts[0]?.feedback || [])]) {
      const index = data.definition.questions.findIndex(q => q.id === feedback.id);
      if (index >= 0 && Number.isInteger(feedback.selectedAnswer)) answers.value[index] = feedback.selectedAnswer;
    } }
  catch (e) { if (current === sequence) error.value = e.response?.data?.error?.message || 'The training could not be loaded.'; }
}
async function openSection(slug) { tab.value = 'read'; await nextTick(); await book.value?.selectSection(slug, true); }
async function openQuiz() {
  await book.value?.closeExpanded?.();
  tab.value = 'quiz'; await nextTick();
  quizHeading.value?.focus({ preventScroll: true });
  quizHeading.value?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
}
async function skipQuiz() {
  if (!optionalPractice.value || lesson.value?.status === 'completed' || busy.value) return;
  // Skipping is navigation, never a passed attempt or required completion.
  emit('close', { skippedKnowledgeCheck: true });
}
async function markRead(slug) {
  if (busy.value || lesson.value?.status === 'completed') return;
  busy.value = true; error.value = '';
  try { const { data } = await props.http.post(`${base.value}/reading`, { agencyId: props.agencyId, slug }); lesson.value.readSections = data.readSections; if (allRead.value) await openQuiz(); else await openSection(nextUnread.value); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Reading progress could not be saved.'; }
  finally { busy.value = false; }
}
async function saveDeckReading(slug) {
  const { data } = await props.http.post(`${base.value}/reading`, { agencyId: props.agencyId, slug });
  lesson.value.readSections = data.readSections;
}
async function saveReflection(questionId, answer) {
  const { data } = await props.http.post(`${base.value}/reflection`, { agencyId: props.agencyId, questionId, answer });
  lesson.value.reflections = [...(lesson.value.reflections || []).filter(f => f.id !== questionId), data];
  const index = lesson.value.definition.questions.findIndex(q => q.id === questionId);
  if (index >= 0) answers.value[index] = answer;
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
  if (busy.value || !allRead.value || answeredCount.value !== lesson.value?.definition.questions.length || lesson.value?.status === 'completed') return;
  busy.value = true; error.value = '';
  try {
    if (lesson.value.paid) await activity.flush();
    const { data } = await props.http.post(`${base.value}/quiz`, { agencyId: props.agencyId, answers: answers.value, requestKey: submissionKey }); result.value = data;
    await load();
    if (data.completed || data.passed) { await submitTime(); emit('completed'); }
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
watch(() => [props.agencyId, props.learningId], () => { lesson.value = null; result.value = null; answers.value = []; tab.value = 'learn'; notice.value = ''; selectedSlug.value = ''; load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.document-learning-player{font-family:var(--learning-font,var(--font-ptco));color:#243247;min-width:0}
.document-learning-player header{display:flex;justify-content:space-between;align-items:start;gap:20px;flex-wrap:wrap;margin:20px 0}
.eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.document-learning-player h2{font:700 24px/1.4 var(--learning-font,var(--font-ptco));margin:6px 0}
.document-learning-player button{font:inherit;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#243247;padding:11px 15px;cursor:pointer;min-height:44px}
.document-learning-player button:disabled{opacity:.55;cursor:default}
.document-learning-player .primary,.learning-tabs [aria-pressed=true]{background:#172339;color:white}
.document-learning-player .text-action{background:transparent;border-color:transparent;text-decoration:underline;text-underline-offset:3px}
.time-banner{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 16px;background:#f1f5f9;border:1px solid #dce3ed;border-radius:10px;font-size:12px;line-height:1.6}
.time-banner>div{flex:1;min-width:220px}
.time-banner p{margin:6px 0}
.time-banner details{margin-top:4px}.time-banner summary{cursor:pointer;color:#64748b}
.beta-label{display:inline-block;margin-left:10px;padding:1px 7px;border-radius:12px;color:#8b5138;background:#faeade;font-size:10px}
.training-error{background:#fff0ed;color:#8c3528;padding:15px}
.edition-note{font-size:12px;line-height:1.7;margin:14px 0;color:#64748b}
.learning-tabs{display:flex;gap:10px;margin:18px 0;flex-wrap:wrap}
.reading-plan{padding:16px 20px;background:#f5f7fb;border:1px solid #dce3ed;border-radius:10px;margin-bottom:16px}
.reading-plan summary{cursor:pointer;font-size:14px}.reading-plan summary span{margin-left:14px;font-size:12px;color:#64748b}
.reading-plan p{font-size:13px;line-height:1.8}
.reading-plan ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:8px;padding:0;list-style:none}
.reading-plan button{text-align:left;line-height:1.6;width:100%}.reading-plan button[aria-current=step]{background:#e9eff7;border-color:#526f95}
.reading-ready{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:18px 20px;background:#edf2f8;border:1px solid #cad7e7;border-radius:10px;margin-bottom:16px}
.reading-ready>div{flex:1;min-width:220px}.reading-ready p{font-size:13px;line-height:1.6;margin:5px 0 0}
.reading-confirmation{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 18px;background:#f0f4fa;border-top:1px solid #dbe2ec;height:84px;box-sizing:border-box;font-size:13px}
.reading-confirmation>div{display:flex;flex-direction:column;gap:4px;min-width:0}.reading-confirmation span{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reading-confirmation strong{font-size:13px;line-height:1.4}
.reading-confirmation button{flex-shrink:0;min-width:210px;font-size:12px}
.knowledge-check{max-width:900px;margin:24px auto}
.quiz-heading h3{font-size:25px;margin:4px 0;scroll-margin-top:100px}.quiz-heading p{font-size:13px;line-height:1.7;max-width:560px}.quiz-heading .eyebrow{font-size:10px}
.question-progress{font-size:13px;color:#64748b;padding-bottom:12px;border-bottom:1px solid #dbe2ec}
.knowledge-check fieldset{padding:20px 24px;border:1px solid #dbe2ec;border-radius:12px;margin:24px 0;background:#fff}
.knowledge-check legend{font-weight:700;font-size:15px;line-height:1.8;padding:0 8px}
.knowledge-check label{display:flex;align-items:start;gap:12px;padding:13px 14px;margin:6px 0;font-size:14px;line-height:1.7;border:1px solid #e1e6ee;border-radius:8px;background:white;cursor:pointer}
.knowledge-check label:has(input:checked){background:#edf2fa;border-color:#617d9f}
.knowledge-check input{flex-shrink:0;width:20px;height:20px;margin:2px 0 0;accent-color:#172339}
.quiz-feedback{background:#f0f4fa;padding:24px;border-radius:10px;margin:24px 0}
.quiz-feedback article{border-top:1px solid #d6e1ed;padding:16px 0;font-size:13px;line-height:1.8}
.completion-note{background:#e9eff7;padding:18px;line-height:1.8}
.document-learning-player:deep(.handbook-book){margin-bottom:24px}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #526f95;outline-offset:3px}
@media(max-width:600px){.knowledge-check fieldset{padding:14px}.knowledge-check legend{font-size:14px}.reading-confirmation{height:132px;flex-direction:column;justify-content:center;align-items:stretch;gap:8px;padding:10px 12px}.reading-confirmation button{width:100%;min-width:0}.reading-plan summary span{display:block;margin:6px 0 0}.reading-ready{padding:16px}.reading-ready button{width:100%}}
</style>
