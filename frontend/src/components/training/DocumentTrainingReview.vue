<template>
  <details v-if="state" class="training-review"><summary>Learning module · {{ state.status === 'ready' ? 'Ready for onboarding & on-demand' : state.status === 'unpublished' ? 'Awaiting publication' : 'Quiz review needed' }}</summary>
    <p>One module appears in the library, onboarding, My Learning and on-demand. Required assignments record paid time. Optional practice is on the employee’s own time.</p>
    <p v-if="state.status === 'needs_review'">The guide’s reading or answer passages changed. Check each question against the published text, update it as needed and approve this edition before new training starts. Existing assignments retain their saved edition.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="state.book" @submit.prevent="save">
      <fieldset :disabled="busy"><label>Module title<input v-model="draft.title" required maxlength="250" /></label><label>Description<textarea v-model="draft.description" maxlength="1500" /></label>
        <details :open="missingRequiredSections.length > 0"><summary>Core reading · {{ draft.requiredSections.length }} sections</summary><p v-for="slug in missingRequiredSections" :key="slug" role="alert">This reading section was removed or is unavailable: {{ slug }}. <button type="button" @click="draft.requiredSections = draft.requiredSections.filter(s => s !== slug)">Remove unavailable reading</button></p><label v-for="s in sections" :key="s.slug" class="reading-choice"><input v-model="draft.requiredSections" type="checkbox" :value="s.slug" />{{ s.title }}</label></details>
        <article v-for="(q, index) in draft.questions" :key="q.id"><h4>Question {{ index + 1 }}</h4><label>Question<textarea v-model="q.prompt" required maxlength="1500" /></label><label v-for="(option, choice) in q.options" :key="choice">Answer {{ choice + 1 }}<input v-model="q.options[choice]" required maxlength="1200" /></label><label>Correct answer<select v-model="q.correctAnswer"><option v-for="(option, choice) in q.options" :key="choice" :value="choice">{{ choice + 1 }}. {{ option }}</option></select></label><label>Explanation<textarea v-model="q.explanation" required maxlength="3000" /></label><label>Source section<select v-model="q.sourceSlug" required><option v-for="s in sections" :key="s.slug" :value="s.slug">{{ s.title }}</option></select></label><details><summary>Read the source passage</summary><div v-html="safeSource(q.sourceSlug)" /></details><button type="button" :disabled="draft.questions.length <= 3" @click="draft.questions.splice(index, 1)">Remove question</button></article>
        <button type="button" :disabled="draft.questions.length >= 12" @click="addQuestion">Add question</button>
      </fieldset><button :disabled="busy || !draft.requiredSections.length">{{ busy ? 'Saving…' : 'Approve quiz for this published edition' }}</button><button v-if="dirty" type="button" :disabled="busy" @click="load">Discard quiz edits</button>
    </form>
  </details>
  <p v-else-if="error" role="alert">{{ error }} <button @click="load">Retry training setup</button></p>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], documentKey: String, versionId: [Number, String] });
const emit = defineEmits(['dirty']);
const state = ref(null), draft = ref(null), baseline = ref(''), error = ref(''), notice = ref(''), busy = ref(false);
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== baseline.value);
const sections = computed(() => (state.value?.book?.sections || []).filter(s => s.content_status === 'ready' && s.body_html));
const missingRequiredSections = computed(() => (draft.value?.requiredSections || []).filter(slug => !sections.value.some(s => s.slug === slug)));
const path = computed(() => `/provider-update/document-learning/courses/${props.documentKey}/review`);
const safeSource = slug => DOMPurify.sanitize(sections.value.find(s => s.slug === slug)?.body_html || 'Select a published source section.');
let sequence = 0;
async function load() { const current = ++sequence; error.value = ''; try { const { data } = await api.get(path.value, { params: { agencyId: props.agencyId } }); if (current === sequence) { state.value = data; draft.value = structuredClone(data.definition); baseline.value = JSON.stringify(draft.value); } } catch(e) { if (current === sequence) { state.value = null; if (e.response?.status !== 404) error.value = e.response?.data?.error?.message || 'Training review could not be loaded.'; } } }
async function save() { busy.value = true; error.value = ''; try { await api.post(path.value, { agencyId: props.agencyId, expectedVersionId: state.value.book.version.id, expectedReviewRevision: state.value.reviewRevision, definition: draft.value }); await load(); notice.value = 'Reviewed learning module saved for this edition.'; } catch(e) { error.value = e.response?.data?.error?.message || 'Review could not be saved.'; } finally { busy.value = false; } }
function addQuestion() { draft.value.questions.push({ id: crypto.randomUUID(), prompt: '', options: ['', '', ''], correctAnswer: 0, explanation: '', sourceSlug: sections.value[0]?.slug || '' }); }
watch(dirty, value => emit('dirty', value));
watch(() => [props.agencyId, props.documentKey, props.versionId], () => { state.value = null; draft.value = null; load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.training-review{margin:20px 0;background:#f2f5ec;border:1px solid #cddbc7;border-radius:10px;padding:20px;font-size:13px;line-height:1.8}.training-review summary{font-weight:700;cursor:pointer}.training-review fieldset{border:0;padding:0;min-width:0}.training-review label{display:grid;gap:5px;margin:14px 0}.training-review input,.training-review textarea,.training-review select{font:inherit;width:100%;box-sizing:border-box;border:1px solid #c8d3c4;border-radius:5px;padding:10px;background:white;min-width:0}.training-review .reading-choice{display:flex;align-items:start}.training-review input[type=checkbox]{width:auto;margin-top:6px}.training-review article{background:white;border:1px solid #d2ddcc;padding:20px;border-radius:8px;margin:18px 0}.training-review button{margin:10px 10px 0 0;padding:10px 14px;border:1px solid #b4c7aa;border-radius:5px;color:#244c35;cursor:pointer}.training-review [role=alert]{color:#993326}.training-review details div{padding:16px;background:#f5f8f1;max-height:360px;overflow:auto;overflow-wrap:anywhere}
</style>
