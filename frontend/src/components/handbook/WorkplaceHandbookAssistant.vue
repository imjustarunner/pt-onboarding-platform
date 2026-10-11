<template>
  <details ref="panel" class="handbook-assistant">
    <summary><span class="assistant-mark" aria-hidden="true">✦</span><span><strong>Ask the {{ documentLabel }}</strong><small>Find an answer. See the policy behind it.</small></span><span class="assistant-chevron" aria-hidden="true">⌄</span></summary>
    <div class="assistant-content">
      <div class="assistant-intro"><p>AI answers from {{ preview ? `this unpublished ${documentLabel} preview` : `the published ${documentLabel}` }}, with links to the source sections. {{ ['school practice guide', 'care guide', 'skills guide', 'crisis guide', 'facilitator protocol', 'documentation guide', 'group psychotherapy SOP', 'mandated reporting SOP', 'caseload management SOP'].includes(documentLabel) ? 'For a client-specific decision, check with your clinical supervisor or billing team.' : documentLabel === 'facilities guide' ? 'For current access or site-specific instructions, contact operations.' : 'For a personal decision, check with People Operations.' }}</p><span class="assistant-version">{{ preview ? 'Unpublished preview' : version?.version_number ? `Edition v${version.version_number}` : 'Published edition' }}</span></div>
      <p v-if="['care guide', 'skills guide', 'crisis guide', 'facilitator protocol', 'documentation guide', 'group psychotherapy SOP', 'mandated reporting SOP', 'caseload management SOP'].includes(documentLabel)" class="assistant-intro">Ask about the guide without client names or identifying details. Answers explain the text; they cannot approve care, assess competence or respond to an emergency.</p>
      <div v-if="!turns.length" class="question-ideas" :aria-label="`Suggested ${documentLabel} questions`"><button v-for="idea in ideas" :key="idea" type="button" @click="draft = idea; submit()">{{ idea }} <span aria-hidden="true">↗</span></button></div>
      <div class="assistant-thread" role="log" aria-live="polite" :aria-label="`${documentLabel === 'handbook' ? 'Handbook' : documentLabel} questions and answers`">
        <article v-for="(turn, index) in turns" :key="index" class="assistant-turn">
          <p class="asked-question"><span>You asked</span>{{ turn.question }}</p>
          <div v-if="turn.answer" class="handbook-answer">
            <span class="answer-label">{{ turn.answer.status === 'clarification' ? 'One detail to clarify' : turn.answer.status === 'conflict' ? 'Policies need clarification' : turn.answer.status === 'answered' ? `From the ${documentLabel}` : 'More information needed' }}</span>
            <p v-if="turn.answer.message">{{ turn.answer.message }}</p>
            <div v-for="(paragraph, p) in turn.answer.paragraphs" :key="p" class="answer-paragraph">
              <p>{{ paragraph.text }}</p>
              <details v-for="(citation, c) in paragraph.citations" :key="c" class="answer-source">
                <summary>Source · {{ citation.title }}</summary>
                <blockquote>{{ citation.quote }}</blockquote>
                <a :href="`#${anchorPrefix}-${citation.slug}`" @click.prevent="$emit('open', citation.slug)">{{ citation.path }} <span aria-hidden="true">↗</span></a>
              </details>
              <div class="answer-policy-links"><a v-for="citation in uniqueCitations(paragraph.citations)" :key="citation.slug" :href="`#${anchorPrefix}-${citation.slug}`" @click.prevent="$emit('open', citation.slug)">{{ citation.title }} ↗</a></div>
            </div>
            <p v-if="turn.answer.clarification" class="clarifying-question">{{ turn.answer.clarification }}</p>
            <p v-if="turn.answer.version?.number" class="answer-edition">Based on {{ documentLabel }} v{{ turn.answer.version.number }}</p>
          </div>
          <div v-else-if="turn.error" class="answer-error" role="alert"><p>{{ turn.error }}</p><button v-if="turn.stale" type="button" @click="$emit('reload')">Reload {{ documentLabel }}</button><button v-else type="button" @click="retry(index)">Try again</button></div>
          <p v-else class="answer-loading" role="status"><span aria-hidden="true">✦</span> Reviewing the {{ documentLabel }} and checking the sources…</p>
        </article>
      </div>
      <form class="assistant-form" @submit.prevent="submit">
        <label :for="questionId">{{ turns.length ? 'Ask a follow-up or a new question' : `Your ${documentLabel} question` }}</label>
        <textarea :id="questionId" ref="input" v-model="draft" rows="2" maxlength="1200" :disabled="busy" :placeholder="ideas[0]" @keydown.enter.exact="onEnter" />
        <div class="assistant-actions"><small>Keep questions about policies; leave out client details.</small><button type="submit" :disabled="busy || draft.trim().length < 3">{{ busy ? 'Finding your answer…' : 'Ask question' }} <span aria-hidden="true">↗</span></button></div>
      </form>
      <div v-if="turns.length" class="conversation-actions"><button type="button" @click="clear">{{ busy ? 'Cancel and clear conversation' : 'Clear conversation' }}</button><span>Conversation stays in this view.</span></div>
    </div>
  </details>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
const props = defineProps({ ask: { type: Function, required: true }, version: { type: Object, default: null }, preview: { type: Boolean, default: false }, documentLabel: { type: String, default: 'handbook' }, anchorPrefix: { type: String, default: 'handbook' } });
defineEmits(['open', 'reload']);
const panel = ref(null), input = ref(null), draft = ref(''), turns = ref([]), busy = ref(false);
const questionId = `handbook-question-${useId()}`;
const ideas = computed(() => props.documentLabel === 'caseload management SOP' ? ['How can I plan a manageable caseload?', 'What should I do after repeated missed visits?', 'What should I review before closing a case?'] : props.documentLabel === 'mandated reporting SOP' ? ['How soon must I report a child-abuse concern?', 'What if someone says they already reported?', 'What should I document after reporting?'] : props.documentLabel === 'group psychotherapy SOP' ? ['What approval is needed before starting a group?', 'What if only one participant attends?', 'What belongs in each participant’s group note?'] : props.documentLabel === 'documentation guide' ? ['What belongs in every service note?', 'How should I document a caregiver-only visit?', 'How do I correct a signed note?'] : props.documentLabel === 'facilitator protocol' ? ['How do H0004 units differ from actual work time?', 'How is included indirect time calculated?', 'What should I do when a claim is denied?'] : props.documentLabel === 'crisis guide' ? ['What should staff prepare before a crisis?', 'What belongs in a collaborative safety plan?', 'What must we document after a response?'] : props.documentLabel === 'facilities guide' ? ['How do I request a temporary office?', 'What should I check before closing Windchime?', 'Where do I obtain approved access instructions?'] : props.documentLabel === 'skills guide' ? ['What are our group attendance and approval rules?', 'How can I support frustration during learning?', 'What does the research show about this program?'] : props.documentLabel === 'care guide' ? ['What may a bachelor’s-level facilitator do?', 'Does this guide authorize me to use CBT?', 'What oversight is required for H0004?'] : props.documentLabel === 'school practice guide' ? ['What must I do before seeing a new student?', 'What should I do when school closes?', 'Are parent check-ins automatically billable?'] : props.documentLabel === 'provider guide' ? ['What must I include in a clinical note?', 'What supervision do interns need?', 'How do I record a missed appointment?'] : ['How does PTO work?', 'What counts as indirect service time?', 'What is the supervision milestone?']);
const uniqueCitations = citations => [...new Map(citations.map(c => [c.slug, c])).values()];
let request = 0, controller;
function clear() { request++; controller?.abort(); turns.value = []; draft.value = ''; busy.value = false; }
async function show() { panel.value.open = true; await nextTick(); panel.value.scrollIntoView?.({ behavior: 'auto', block: 'start' }); input.value?.focus({ preventScroll: true }); }
function onEnter(event) { if (!event.isComposing) { event.preventDefault(); submit(); } }
async function submit() {
  if (busy.value || draft.value.trim().length < 3) return;
  const question = draft.value.trim();
  const history = turns.value.filter(t => t.answer).slice(-5).map(t => t.question);
  const turn = { question, answer: null, error: null };
  turns.value.push(turn); draft.value = ''; busy.value = true;
  const index = turns.value.length - 1, current = ++request;
  controller = new AbortController();
  try {
    const answer = await props.ask({ question, history, expectedVersionId: props.version?.id || null }, { signal: controller.signal });
    if (current !== request) return;
    turns.value[index] = { ...turn, answer };
  } catch (error) {
    if (current !== request) return;
    const status = error?.response?.status;
    turns.value[index] = { ...turn, stale: status === 409, error: [400, 409, 429].includes(status) ? error.response.data?.error?.message || 'Please try again.' : props.documentLabel === 'crisis guide' ? 'Guide answers are unavailable. Use the response shortcuts or contact the clinical lead. For immediate danger, call 911; do not wait for Q&A.' : 'Document answers are temporarily unavailable. Try again, search the contents, or ask People Operations.' };
  } finally { if (current === request) { busy.value = false; await nextTick(); input.value?.focus({ preventScroll: true }); } }
}
function retry(index) { if (busy.value) return; draft.value = turns.value[index].question; turns.value.splice(index, 1); submit(); }
watch(() => props.version?.id, clear);
onBeforeUnmount(clear);
defineExpose({ show });
</script>

<style scoped>
.handbook-assistant { color: #254b3b; background: #edf4e9; border-block: 1px solid #d2dfcb; scroll-margin-top: 24px; }.handbook-assistant > summary { display: flex; align-items: center; gap: 14px; padding: 22px 28px; cursor: pointer; list-style: none; }.handbook-assistant > summary::-webkit-details-marker { display: none; }.assistant-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: #155c43; color: #ecf0ae; font-size: 25px; flex-shrink: 0; }.handbook-assistant summary strong { display: block; font: 24px/1.25 var(--handbook-font, var(--font-ptco)); }.handbook-assistant summary small { display: block; font-size: 12px; margin-top: 5px; color: #5a6e53; }.assistant-chevron { margin-left: auto; font-size: 22px; }.handbook-assistant[open] .assistant-chevron { transform: rotate(180deg); }
.assistant-content { padding: 0 28px 26px; max-width: 1000px; margin: auto; }.assistant-intro { display: flex; gap: 18px; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }.assistant-intro p { font-size: 13px; line-height: 1.7; max-width: 650px; margin: 0; color: #53674d; }.assistant-version { white-space: nowrap; font-size: 10px; border: 1px solid #c5d3b9; padding: 5px 9px; border-radius: 20px; }.question-ideas { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }.question-ideas button { border: 1px solid #cedac4; border-radius: 7px; background: #fffef8; color: #24503b; font: inherit; font-size: 12px; padding: 11px 13px; text-align: left; cursor: pointer; }.question-ideas button span { margin-left: 8px; }
.assistant-thread { display: grid; gap: 25px; }.asked-question { background: #dce9d4; border-radius: 10px; padding: 16px 20px; margin: 0 0 12px auto; width: fit-content; max-width: 90%; font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }.asked-question span,.answer-label { display: block; font-size: 10px; letter-spacing: .09em; text-transform: uppercase; margin-bottom: 8px; color: #58714d; }.handbook-answer { background: #fffef9; border: 1px solid #d9e2d1; border-radius: 10px; padding: 22px; font-size: 15px; line-height: 1.8; overflow-wrap: anywhere; }.handbook-answer p { white-space: pre-line; margin: 0 0 14px; }.answer-source { font-size: 12px; color: #5d6f54; margin-top: 9px; }.answer-source summary { cursor: pointer; line-height: 1.6; }.answer-source blockquote { border-left: 2px solid #b5ca92; padding: 6px 0 6px 15px; margin: 12px 0; color: #43533b; white-space: pre-line; }.handbook-answer a { color: #175b42; text-underline-offset: 3px; }.answer-policy-links { display: flex; flex-wrap: wrap; gap: 5px 15px; margin: 10px 0 20px; font-size: 11px; }.answer-edition { font-size: 10px; color: #63745a; margin-bottom: 0 !important; }.clarifying-question { font-weight: 600; }.answer-loading { font-size: 13px; padding: 10px 0 20px; color: #557447; }.answer-loading span { margin-right: 8px; }.answer-error { font-size: 13px; color: #853e28; }.answer-error button { background: white; border: 1px solid #d5d8cc; border-radius: 5px; padding: 8px 12px; cursor: pointer; color: #12583f; }
.assistant-form { margin-top: 22px; }.assistant-form label { display: block; font-size: 12px; font-weight: 650; margin-bottom: 8px; }.assistant-form textarea { box-sizing: border-box; width: 100%; resize: vertical; min-height: 85px; border: 1px solid #bdceb3; border-radius: 8px; padding: 14px; background: #fffefb; color: #254b3b; font: 14px/1.7 var(--handbook-font, var(--font-ptco)); }.assistant-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 10px; }.assistant-actions small { font-size: 11px; color: #64755b; }.assistant-actions button { padding: 12px 17px; border: none; border-radius: 6px; background: #155c43; color: white; font: inherit; font-size: 13px; cursor: pointer; }.assistant-actions button:disabled { opacity: .5; cursor: default; }.assistant-actions button span { margin-left: 15px; }.conversation-actions { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 16px; font-size: 10px; color: #6e7d65; }.conversation-actions button { border: 0; background: none; color: #45673c; text-decoration: underline; cursor: pointer; font-size: 11px; padding: 0; }.handbook-assistant :focus-visible { outline: 2px solid #12583f; outline-offset: 3px; }
@media(max-width:600px) { .handbook-assistant > summary { padding: 20px; }.assistant-content { padding: 0 18px 24px; }.assistant-intro { flex-direction: column; gap: 10px; }.handbook-answer { padding: 18px; font-size: 14px; }.asked-question { max-width: 100%; }.assistant-actions button { width: 100%; } }
@media print { .handbook-assistant { display: none !important; } }
</style>
