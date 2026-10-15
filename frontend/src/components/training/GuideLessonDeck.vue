<template>
  <section class="lesson-deck" aria-label="Interactive lessons">
    <div class="deck-topline"><span>Plotline PO <span aria-hidden="true">/</span> Learning studio</span><span>Screen {{ index + 1 }} of {{ slides.length }}</span></div>
    <progress :value="index + 1" :max="slides.length" aria-label="Lesson position" />
    <article :key="slide.id" class="lesson-screen">
      <figure class="lesson-visual">
        <img :src="visual.url" :alt="visual.alt" @error="imageFailed = true" v-show="!imageFailed" />
        <div class="visual-caption"><span>{{ visual.label }}</span><strong>{{ slide.kind === 'scenario' ? 'What would you do?' : slide.kind === 'finish' ? 'Ready for what’s next.' : 'Learn it. Use it.' }}</strong></div>
        <figcaption>{{ visual.credit }}</figcaption>
      </figure>
      <div class="lesson-body">
        <p class="deck-eyebrow">{{ slide.kind === 'read' ? `Topic ${slide.topicIndex + 1} · Explore` : slide.kind === 'scenario' ? `Scenario ${slide.questionIndex + 1} · Try it` : 'Your takeaway' }}</p>
        <h3 ref="heading" tabindex="-1">{{ slide.kind === 'scenario' ? 'Put yourself in this moment.' : slide.title }}</h3>
        <template v-if="slide.kind === 'read'">
          <span class="part-label" v-if="slide.parts > 1">Part {{ slide.part }} of {{ slide.parts }}</span>
          <div class="lesson-facts" aria-live="polite" aria-relevant="additions">
            <div v-for="(fact, factIndex) in facts.slice(0, visibleFacts)" :key="`${slide.id}-${factIndex}`" class="fact-card"><span class="fact-number">{{ String(factIndex + 1).padStart(2, '0') }}</span><div class="lesson-prose" @click="followLink" v-html="fact" /></div>
          </div>
          <button v-if="visibleFacts < facts.length" class="reveal-point" @click="openedFacts[slide.id] = visibleFacts + 1">+ Reveal next point <span>{{ visibleFacts }} / {{ facts.length }}</span></button>
          <p v-else-if="facts.length > 1" class="facts-reviewed">All {{ facts.length }} points revealed. Continue when you’re ready.</p>
          <button class="source-link" @click="$emit('source', slide.slug)">Open this section in the guide ↗</button>
        </template>
        <template v-else-if="slide.kind === 'scenario'">
          <form @submit.prevent="reveal">
            <fieldset :disabled="working || !!feedback || lesson.status === 'completed'">
              <legend>{{ slide.question.prompt }}</legend>
              <p class="choice-prompt">Choose what you would do, then explore the explanation.</p>
              <label v-for="(option, choice) in slide.question.options" :key="choice" :class="{ chosen: selected === choice }"><input v-model="selected" type="radio" :name="`scenario-${lesson.id}-${slide.question.id}`" :value="choice" /><span class="choice-letter" aria-hidden="true">{{ String.fromCharCode(65 + choice) }}</span><span>{{ option }}</span></label>
            </fieldset>
            <button v-if="!feedback && lesson.status !== 'completed'" class="deck-primary" :disabled="working || selected === null" type="submit">{{ working ? 'Saving your reflection…' : 'Reveal the explanation' }}</button>
          </form>
          <div v-if="feedback" class="scenario-reveal" aria-live="polite"><p class="deck-eyebrow">From your guide</p><p v-if="Number.isInteger(feedback.selectedAnswer)" class="your-choice"><strong>Your choice:</strong> {{ slide.question.options[feedback.selectedAnswer] }}</p><p v-if="feedback.choiceExplanation" class="choice-explanation">{{ feedback.choiceExplanation }}</p><h4>{{ feedback.answer || slide.question.options[feedback.correctAnswer] }}</h4><p><strong>Why:</strong> {{ feedback.explanation }}</p><button class="source-link" @click="$emit('source', feedback.sourceSlug)">Explore the source section ↗</button><small>Your reflection is saved. Every response is an opportunity to learn.</small></div>
        </template>
        <template v-else>
          <p>You’ve explored the guide and tried its workplace scenarios. Take a moment to think about one idea you can use in your next workday.</p>
          <div class="takeaway"><strong>Pause &amp; practice</strong><p>Picture that moment. What will you do first? Who could you ask for support?</p></div>
          <p v-if="lesson.status === 'completed'" role="status" class="deck-completed">Completed and saved. You can revisit any topic or explanation.</p>
          <template v-else><p>{{ lesson.readSections.length }} topics reviewed · {{ reflectionCount }} of {{ lesson.definition.questions.length }} scenarios explored</p><button class="deck-primary" :disabled="working || busy || !readyToFinish" @click="$emit('finish')">{{ busy ? 'Saving…' : 'Finish & save my learning' }}</button><button v-if="!readyToFinish" class="source-link" @click="go(firstUnfinishedSlide(slides, lesson))">Return to my next activity →</button></template>
        </template>
        <p v-if="error" class="deck-error" role="alert">{{ error }}</p>
      </div>
    </article>
    <footer class="deck-navigation"><button :disabled="index === 0 || working || busy" @click="go(index - 1)">← Back</button><span>{{ slide.kind === 'scenario' ? (feedback ? 'Reflection saved' : 'Choose a response to explore') : slide.kind === 'read' ? 'Read at your own pace' : 'Keep your guide close' }}</span><button v-if="slide.kind !== 'finish'" class="deck-primary" :disabled="working || busy || (slide.kind === 'scenario' && !feedback) || (slide.kind === 'read' && visibleFacts < facts.length)" @click="continueLesson">{{ working ? 'Saving…' : 'Continue →' }}</button><button v-else @click="go(0)">Revisit lessons ↺</button></footer>
    <details class="lesson-outline"><summary>Explore the lesson map</summary><ol><li v-for="(item, i) in slides" :key="item.id"><button :aria-current="index === i ? 'step' : undefined" :disabled="working || busy" @click="go(i)"><span>{{ i + 1 }}</span>{{ item.kind === 'scenario' ? `Try it · ${item.question.prompt}` : item.title }}{{ item.kind === 'read' && item.parts > 1 ? ` · ${item.part}/${item.parts}` : '' }}</button></li></ol></details>
  </section>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { buildGuideSlides, firstUnfinishedSlide, lessonVisual, lessonFacts } from '../../utils/guideLessonSlides';
const props = defineProps({ lesson: { type: Object, required: true }, busy: Boolean, saveReading: { type: Function, required: true }, revealReflection: { type: Function, required: true } });
const emit = defineEmits(['source', 'finish']);
const index = ref(0), heading = ref(null), selected = ref(null), working = ref(false), error = ref(''), imageFailed = ref(false);
const slides = computed(() => buildGuideSlides(props.lesson));
const slide = computed(() => slides.value[Math.min(index.value, slides.value.length - 1)]);
const openedFacts = ref({});
const facts = computed(() => slide.value.kind === 'read' ? lessonFacts(slide.value.html) : []);
const visibleFacts = computed(() => openedFacts.value[slide.value.id] || (props.lesson.readSections.includes(slide.value.slug) ? facts.value.length : 1));
const visual = computed(() => lessonVisual(slide.value));
const feedbacks = computed(() => [...(props.lesson.reflections || []), ...(props.lesson.attempts?.[0]?.feedback || [])]);
const feedback = computed(() => feedbacks.value.find(f => f.id === slide.value.question?.id));
const reflectionCount = computed(() => props.lesson.definition.questions.filter(q => feedbacks.value.some(f => f.id === q.id)).length);
const readyToFinish = computed(() => props.lesson.definition.requiredSections.every(s => props.lesson.readSections.includes(s)) && reflectionCount.value === props.lesson.definition.questions.length);
watch(() => props.lesson.id, () => { index.value = props.lesson.status === 'completed' ? slides.value.length - 1 : firstUnfinishedSlide(slides.value, props.lesson); }, { immediate: true });
watch(() => slide.value.id, () => { selected.value = feedback.value?.selectedAnswer ?? null; error.value = ''; imageFailed.value = false; }, { immediate: true });
async function go(next) { index.value = Math.max(0, Math.min(next, slides.value.length - 1)); await nextTick(); heading.value?.focus({ preventScroll: true }); heading.value?.closest('.lesson-deck')?.scrollIntoView?.({ block: 'start', behavior: 'auto' }); }
async function continueLesson() {
  if (working.value || props.busy || (slide.value.kind === 'scenario' && !feedback.value) || (slide.value.kind === 'read' && visibleFacts.value < facts.value.length)) return;
  working.value = true; error.value = '';
  try { if (slide.value.kind === 'read' && slide.value.last && !props.lesson.readSections.includes(slide.value.slug) && props.lesson.status !== 'completed') await props.saveReading(slide.value.slug); await go(index.value + 1); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Your place could not be saved. Please try Continue again.'; }
  finally { working.value = false; }
}
async function reveal() {
  if (working.value || selected.value === null || feedback.value) return;
  working.value = true; error.value = '';
  try { await props.revealReflection(slide.value.question.id, selected.value); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Your reflection could not be saved. Please try again.'; }
  finally { working.value = false; }
}
function followLink(event) { const link = event.target.closest('a'); if (link?.getAttribute('href')?.startsWith('#')) { event.preventDefault(); emit('source', slide.value.slug); } }
</script>
<style scoped>
.lesson-deck{--ink:#172339;--muted:#607087;--line:#dbe2ec;color:var(--ink);scroll-margin-top:24px}
.deck-topline{display:flex;justify-content:space-between;gap:16px;padding:18px 0;font-size:12px;font-weight:600;letter-spacing:.03em}.deck-topline span span{padding:0 10px;color:#95a2b5}
progress{display:block;width:100%;height:4px;border:0;background:#e2e8f0;accent-color:#49678f;margin-bottom:22px}progress::-webkit-progress-bar{background:#e2e8f0;border-radius:10px}progress::-webkit-progress-value{background:#49678f;border-radius:10px}
.lesson-screen{display:grid;grid-template-columns:minmax(240px,.85fr) minmax(0,1.3fr);background:white;border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 12px 30px #17233908;min-height:510px}
.lesson-visual{position:relative;margin:0;background:linear-gradient(140deg,#263851,#7292b1);min-height:300px;overflow:hidden}.lesson-visual img{position:absolute;width:100%;height:100%;object-fit:cover;object-position:54% center}.lesson-visual:after{content:'';position:absolute;inset:0;background:linear-gradient(transparent 32%,#0f1d32d9)}
.visual-caption{position:absolute;bottom:56px;left:30px;right:26px;z-index:1;color:white}.visual-caption span{display:block;text-transform:uppercase;letter-spacing:.14em;font-size:10px;margin-bottom:14px}.visual-caption strong{font-size:clamp(25px,3vw,40px);line-height:1.15;display:block;max-width:240px}.lesson-visual figcaption{position:absolute;bottom:20px;left:30px;right:24px;z-index:1;color:#e2e8f0;font-size:9px;line-height:1.5}
.lesson-body{padding:36px 38px;min-width:0}.deck-eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:10px;color:#657a97;font-weight:700;margin:0 0 14px}.lesson-body h3{font-size:27px;line-height:1.25;letter-spacing:-.025em;margin:0 0 22px;outline:none}.lesson-body h4{font-size:17px;line-height:1.6;margin:0 0 10px}.part-label{font-size:11px;color:var(--muted)}
.fact-card{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #edf0f5;animation:fact-in .2s ease-out}.fact-number{font-size:10px;color:#7c8faa;padding-top:18px;font-weight:700;flex-shrink:0}.lesson-deck .reveal-point{width:100%;display:flex;justify-content:space-between;margin:18px 0;background:#f2f6fb;border-style:dashed;color:#345477}.facts-reviewed{font-size:11px!important;color:#6c7d91}.lesson-prose{min-width:0}@keyframes fact-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.fact-card{animation:none}}
.lesson-body p,.lesson-prose{font-size:15px;line-height:1.85}.lesson-prose{overflow-wrap:anywhere}.lesson-prose :deep(p){margin:12px 0}.lesson-prose :deep(li){margin:10px 0}.lesson-prose :deep(ul),.lesson-prose :deep(ol){padding-left:22px}.lesson-prose :deep(table){display:block;max-width:100%;overflow:auto}.lesson-prose :deep(img){max-width:100%;height:auto}.lesson-prose :deep(h2),.lesson-prose :deep(h3){font-size:19px}.lesson-prose :deep(a){color:#355b86;text-decoration:underline}
.lesson-deck button{font:inherit;font-size:13px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;min-height:44px;padding:12px 18px;cursor:pointer}.lesson-deck .deck-primary{background:var(--ink);color:white;border-color:var(--ink)}.lesson-deck button:disabled{opacity:.5;cursor:default}.lesson-deck .source-link{padding:10px 0;background:transparent;border:0;text-align:left;color:#41618c;font-size:12px;text-decoration:underline;text-underline-offset:4px}
fieldset{padding:0;margin:0 0 18px;border:0;min-width:0}legend{font-size:18px;line-height:1.6;font-weight:650;padding:0}.choice-prompt{color:var(--muted);font-size:12px!important;line-height:1.6!important}.lesson-body label{display:flex;align-items:center;gap:11px;border:1px solid var(--line);border-radius:10px;margin:9px 0;padding:13px;font-size:13px;line-height:1.65;cursor:pointer}.lesson-body label.chosen{background:#eef3fa;border-color:#617d9f}.lesson-body input{accent-color:#243d60;width:17px;height:17px;flex-shrink:0;margin:0}.choice-letter{font-size:11px;font-weight:700;color:#75839b}.scenario-reveal{border-left:3px solid #6789b0;background:#f1f5fa;padding:20px;margin-top:22px;border-radius:0 10px 10px 0}.scenario-reveal p{font-size:13px}.scenario-reveal small{display:block;color:var(--muted);font-size:11px;line-height:1.6;margin-top:12px}
.takeaway{padding:20px;border:1px solid #d8e3ee;border-radius:12px;background:#f6f8fc;margin:24px 0}.takeaway p{margin-bottom:0}.deck-completed{background:#edf2f8;border-radius:8px;padding:14px}.deck-error{color:#9d3225;background:#fff1ee;padding:14px;border-radius:8px}
.deck-navigation{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 0}.deck-navigation>span{font-size:12px;color:var(--muted)}.lesson-outline{border-top:1px solid var(--line);padding:18px 0;font-size:12px;color:var(--muted)}summary{cursor:pointer}.lesson-outline ol{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}.lesson-outline button{text-align:left;width:100%;display:flex;gap:12px;align-items:baseline;font-size:12px}.lesson-outline [aria-current=step]{background:#e9eff7;border-color:#617d9f}.lesson-outline button span{font-size:10px;color:#64748b}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #7899c2;outline-offset:3px}
@media(max-width:760px){.lesson-screen{grid-template-columns:1fr;min-height:0}.lesson-visual{height:200px;min-height:0}.visual-caption{bottom:42px;left:24px}.visual-caption strong{font-size:28px;max-width:none}.visual-caption span{margin-bottom:8px}.lesson-visual figcaption{left:24px;bottom:14px}.lesson-body{padding:25px 22px}.lesson-body h3{font-size:24px}.deck-navigation{flex-wrap:wrap}.deck-navigation>span{order:3;text-align:center;width:100%}.lesson-outline ol{grid-template-columns:1fr}.deck-topline{font-size:10px}.deck-topline span span{padding:0 4px}}
</style>
