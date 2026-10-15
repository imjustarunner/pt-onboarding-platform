<template>
  <details v-if="state" class="training-review"><summary>Edit visual training · {{ ['ready', 'beta'].includes(state.status) ? 'Ready to use' : 'Review needed' }}</summary>
    <p>Edit the lesson points, photos, scenarios and answer explanations here. New learning attempts use your saved changes; people already learning keep their saved edition.</p>
    <p v-if="state.status === 'needs_review'">The guide has changed. Review your lesson points and questions against its current text before saving.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="state.book && draft" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label>Module title<input v-model="draft.title" required maxlength="250" /></label>
        <label>Description<textarea v-model="draft.description" maxlength="1500" /></label>
        <details :open="missingRequiredSections.length > 0"><summary>Topics to include · {{ draft.requiredSections.length }}</summary><p v-for="slug in missingRequiredSections" :key="slug" role="alert">This reading section was removed or is unavailable: {{ slug }}. <button type="button" @click="draft.requiredSections = draft.requiredSections.filter(s => s !== slug)">Remove unavailable reading</button></p><label v-for="s in sections" :key="s.slug" class="reading-choice"><input v-model="draft.requiredSections" type="checkbox" :value="s.slug" />{{ s.title }}</label></details>
        <h3>Visual lessons</h3><p>Each point appears when the learner clicks. Leave custom points empty to use the guide’s wording automatically.</p>
        <details v-for="section in selectedSections" :key="section.slug" class="lesson-editor"><summary>{{ section.title }}</summary>
          <label>Lesson title<input v-model="draft.lessonPresentation[section.slug].title" :placeholder="section.title" maxlength="250" /></label>
          <label>Photo<select v-model="draft.lessonPresentation[section.slug].imageUrl"><option value="">Choose automatically for this topic</option><option value="/assets/rise/therapy.webp">A listening conversation</option><option value="/assets/rise/coaching.webp">Balanced stones and mountains</option><option value="/assets/rise/in-person.webp">A path through the forest</option><option v-if="draft.lessonPresentation[section.slug].imageUrl && !imageChoices.includes(draft.lessonPresentation[section.slug].imageUrl)" :value="draft.lessonPresentation[section.slug].imageUrl">Your image</option></select></label>
          <label>Or use your image link<input v-model="draft.lessonPresentation[section.slug].imageUrl" placeholder="https://… or /uploads/…" maxlength="2000" /></label><label>Image description<input v-model="draft.lessonPresentation[section.slug].imageAlt" maxlength="500" placeholder="Describe the image for someone who cannot see it" /></label>
          <label v-for="(fact, i) in draft.lessonPresentation[section.slug].facts" :key="i">Point {{ i + 1 }}<textarea v-model="draft.lessonPresentation[section.slug].facts[i]" maxlength="5000" /><button type="button" @click="draft.lessonPresentation[section.slug].facts.splice(i, 1)">Remove point {{ i + 1 }}</button></label>
          <button type="button" :disabled="draft.lessonPresentation[section.slug].facts.length >= 50" @click="draft.lessonPresentation[section.slug].facts.push('')">Add a point</button><button v-if="!draft.lessonPresentation[section.slug].facts.length" type="button" @click="copySource(section)">Customize source points</button><button v-else type="button" @click="draft.lessonPresentation[section.slug].facts = []">Use guide text instead</button>
          <details><summary>Read the source passage</summary><div v-html="safeSource(section.slug)" /></details>
        </details>
        <h3>Scenarios &amp; answer reveals</h3>
        <article v-for="(q, index) in draft.questions" :key="q.id"><h4>Scenario {{ index + 1 }}</h4><label>Question<textarea v-model="q.prompt" required maxlength="1500" /></label>
          <div v-for="(option, choice) in q.options" :key="choice" class="answer-editor"><label>Answer {{ choice + 1 }}<input v-model="q.options[choice]" required maxlength="1200" /></label><label>Why this choice does or doesn’t fit <span class="optional-label">Optional · Shown when this choice is selected</span><textarea v-model="q.choiceExplanations[choice]" maxlength="3000" placeholder="Explain the reasoning, without a score or pass/fail label." /></label></div>
          <label>Recommended answer<select v-model="q.correctAnswer"><option v-for="(option, choice) in q.options" :key="choice" :value="choice">{{ choice + 1 }}. {{ option }}</option></select></label><label>Why this is the recommended answer<textarea v-model="q.explanation" required maxlength="3000" /></label><label>Source section<select v-model="q.sourceSlug" required><option v-for="s in sections" :key="s.slug" :value="s.slug">{{ s.title }}</option></select></label><details><summary>Read the source passage</summary><div v-html="safeSource(q.sourceSlug)" /></details><button type="button" :disabled="draft.questions.length <= 3" @click="draft.questions.splice(index, 1)">Remove question</button>
        </article>
        <button type="button" :disabled="draft.questions.length >= 12" @click="addQuestion">Add question</button>
      </fieldset>
      <div class="editor-actions"><button type="button" :disabled="busy || !selectedSections.length" @click="startPreview">Preview interactive training</button><button class="primary" :disabled="busy || !draft.requiredSections.length">{{ busy ? 'Saving…' : 'Save training for this edition' }}</button><button v-if="dirty" type="button" :disabled="busy" @click="load">Discard training edits</button></div>
    </form>
    <section v-if="preview" class="training-preview"><header><strong>Preview only · Progress is not recorded</strong><button type="button" @click="preview = null">Close preview</button></header><GuideLessonDeck :key="preview.id" :lesson="preview" :save-reading="previewReading" :reveal-reflection="previewReflection" @finish="preview.status = 'completed'" @source="previewSource = $event" /><details v-if="previewSource" open><summary>Source passage</summary><div v-html="safeSource(previewSource)" /></details></section>
  </details>
  <p v-else-if="error" role="alert">{{ error }} <button @click="load">Retry training setup</button></p>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import GuideLessonDeck from './GuideLessonDeck.vue';
import { lessonFacts } from '../../utils/guideLessonSlides';
const props = defineProps({ agencyId: [Number, String], documentKey: String, versionId: [Number, String] });
const emit = defineEmits(['dirty']);
const state = ref(null), draft = ref(null), baseline = ref(''), error = ref(''), notice = ref(''), busy = ref(false), preview = ref(null), previewSource = ref('');
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== baseline.value);
const sections = computed(() => (state.value?.book?.sections || []).filter(s => s.content_status === 'ready' && s.body_html));
const selectedSections = computed(() => (draft.value?.requiredSections || []).map(slug => sections.value.find(s => s.slug === slug)).filter(Boolean));
const missingRequiredSections = computed(() => (draft.value?.requiredSections || []).filter(slug => !sections.value.some(s => s.slug === slug)));
const imageChoices = ['/assets/rise/therapy.webp', '/assets/rise/coaching.webp', '/assets/rise/in-person.webp'];
const path = computed(() => `/provider-update/document-learning/courses/${props.documentKey}/review`);
const safeSource = slug => DOMPurify.sanitize(sections.value.find(s => s.slug === slug)?.body_html || 'Select a source section.');
let sequence = 0;
async function load() {
  const current = ++sequence; error.value = '';
  try {
    const { data } = await api.get(path.value, { params: { agencyId: props.agencyId } }); if (current !== sequence) return;
    state.value = data; const next = structuredClone(data.definition); next.lessonPresentation ||= {};
    for (const s of sections.value) next.lessonPresentation[s.slug] = { title: '', imageUrl: '', imageAlt: '', facts: [], ...next.lessonPresentation[s.slug] };
    next.questions.forEach(q => { q.choiceExplanations = q.options.map((_, i) => q.choiceExplanations?.[i] || ''); });
    draft.value = next; baseline.value = JSON.stringify(next);
  } catch(e) { if (current === sequence) { state.value = null; if (e.response?.status !== 404) error.value = e.response?.data?.error?.message || 'Training review could not be loaded.'; } }
}
async function save() {
  busy.value = true; error.value = '';
  try { await api.post(path.value, { agencyId: props.agencyId, expectedVersionId: state.value.book.version.id, expectedSourceRevision: state.value.sourceRevision, expectedReviewRevision: state.value.reviewRevision, definition: draft.value }); await load(); notice.value = 'Visual lessons, scenarios and explanations saved for new learning attempts.'; preview.value = null; }
  catch(e) { error.value = e.response?.data?.error?.message || 'Review could not be saved. Your edits are still here.'; }
  finally { busy.value = false; }
}
function addQuestion() { draft.value.questions.push({ id: crypto.randomUUID(), prompt: '', options: ['', '', ''], choiceExplanations: ['', '', ''], correctAnswer: 0, explanation: '', sourceSlug: sections.value[0]?.slug || '' }); }
function copySource(section) { draft.value.lessonPresentation[section.slug].facts = lessonFacts(section.body_html).map(html => new DOMParser().parseFromString(html, 'text/html').body.textContent.trim()); }
function startPreview() { previewSource.value = ''; preview.value = { id: `preview-${Date.now()}`, status: 'in_progress', definition: JSON.parse(JSON.stringify(draft.value)), book: state.value.book, readSections: [], reflections: [], attempts: [] }; }
async function previewReading(slug) { preview.value.readSections = [...new Set([...preview.value.readSections, slug])]; }
async function previewReflection(id, selectedAnswer) { const q = preview.value.definition.questions.find(q => q.id === id); preview.value.reflections.push({ id, selectedAnswer, correctAnswer: q.correctAnswer, answer: q.options[q.correctAnswer], explanation: q.explanation, choiceExplanation: q.choiceExplanations?.[selectedAnswer], sourceSlug: q.sourceSlug }); }
watch(dirty, value => emit('dirty', value));
watch(() => [props.agencyId, props.documentKey, props.versionId], () => { state.value = null; draft.value = null; preview.value = null; load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.training-review{margin:20px 0;background:#f6f8fc;border:1px solid #d7e0ec;border-radius:12px;padding:24px;font-size:13px;line-height:1.8;color:#243247}.training-review summary{font-weight:700;cursor:pointer}.training-review fieldset{border:0;padding:0;min-width:0}.training-review label{display:grid;gap:5px;margin:14px 0}.training-review input,.training-review textarea,.training-review select{font:inherit;width:100%;box-sizing:border-box;border:1px solid #ccd7e5;border-radius:6px;padding:10px;background:white;min-width:0}.training-review textarea{min-height:80px}.training-review .reading-choice{display:flex;align-items:start}.training-review input[type=checkbox]{width:auto;margin-top:6px}.training-review article,.lesson-editor{background:white;border:1px solid #d7e0ec;padding:20px;border-radius:9px;margin:18px 0}.training-review button{font:inherit;margin:10px 10px 0 0;padding:10px 14px;border:1px solid #ccd7e5;border-radius:7px;background:white;color:#243247;cursor:pointer}.training-review button:disabled{opacity:.5;cursor:default}.training-review .primary{background:#172339;color:white}.training-review [role=alert]{color:#993326}.training-review details>div:not(.editor-actions){overflow-wrap:anywhere}.answer-editor{padding:8px 18px;border:1px solid #e0e6ee;border-radius:8px;margin:14px 0}.optional-label{font-weight:400;font-size:11px;color:#64748b}.training-preview{margin-top:24px;border-top:1px solid #ccd7e5;padding-top:20px}.training-preview>header{display:flex;justify-content:space-between;gap:16px;align-items:center}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #7899c2;outline-offset:3px}@media(max-width:650px){.training-review{padding:16px}.training-review article{padding:14px}}
</style>
