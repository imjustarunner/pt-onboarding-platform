<template>
  <section class="fingerprinting-course" aria-label="Fingerprinting steps">
    <aside v-if="guide.instructions" class="course-instructions"><h2>Before you begin</h2><p>{{ guide.instructions }}</p></aside>
    <div v-if="pages.introduction" class="course-introduction" v-html="pages.introduction" />
    <nav class="step-picker" aria-label="Fingerprinting step">
      <button v-for="(step, position) in pages.steps" :key="position" type="button" :aria-current="position === index ? 'step' : undefined" @click="go(position)">
        <span>{{ position + 1 }}</span>{{ step.title }}
      </button>
    </nav>
    <article class="course-step">
      <p ref="positionLabel" class="step-position" tabindex="-1">Step {{ index + 1 }} of {{ pages.steps.length }}</p>
      <HireFingerprintingGuide :html="pages.steps[index].html" :http="http" :training-module-id="moduleId" :on-demand="onDemand" />
    </article>
    <footer class="step-navigation">
      <button type="button" :disabled="index === 0" @click="go(index - 1)">← Previous step</button>
      <button v-if="index < pages.steps.length - 1" type="button" class="next-step" @click="go(index + 1)">Next step →</button>
      <button v-else type="button" @click="go(0)">Review from the beginning</button>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import HireFingerprintingGuide from '../prehire/HireFingerprintingGuide.vue';
const props = defineProps({ guide: { type: Object, required: true }, moduleId: { type: [Number, String], required: true }, http: { type: Object, required: true }, onDemand: Boolean });
const index = ref(0), positionLabel = ref(null);
const pages = computed(() => {
  const document = new DOMParser().parseFromString(props.guide.html, 'text/html');
  const list = document.body.querySelector('ol');
  const steps = list ? [...list.children].filter(item => item.tagName === 'LI').map((item, position) => ({
    title: item.querySelector('h3')?.textContent || `Step ${position + 1}`, html: item.innerHTML
  })) : [];
  if (!steps.length) return { introduction: '', steps: [{ title: 'Fingerprinting guide', html: props.guide.html }] };
  list.remove();
  return { introduction: document.body.innerHTML, steps };
});
async function go(position) {
  index.value = Math.max(0, Math.min(position, pages.value.steps.length - 1));
  await nextTick(); positionLabel.value?.focus();
}
watch(() => props.guide.html, () => { index.value = 0; });
</script>

<style scoped>
.fingerprinting-course { max-width: 72rem; margin-inline: auto; color: #203e36; }
.course-instructions { padding: 1rem 1.25rem; border: 1px solid #b8cec3; border-left: 4px solid #af6249; border-radius: 10px; background: #f6f8f5; }
.course-instructions h2 { margin: 0 0 .5rem; font-size: 1.15rem; color: #203e36; }
.course-instructions p { margin: 0; white-space: pre-wrap; }
.course-introduction { margin-block: 1.25rem; }
.step-picker { display: flex; gap: .5rem; overflow-x: auto; padding-block: .5rem 1rem; }
.step-picker button { flex: 0 0 11rem; display: flex; align-items: center; gap: .5rem; padding: .65rem; text-align: left; font: inherit; font-size: .85rem; background: #fff; color: #203e36; border: 1px solid #d4dfd8; border-radius: 8px; cursor: pointer; }
.step-picker button[aria-current] { background: #173e33; color: #fff; border-color: #173e33; }
.step-picker span { font-weight: 700; }
.course-step { padding: 1.25rem; border: 1px solid #d4dfd8; border-radius: 12px; background: #fff; }
.step-position { margin: 0 0 1rem; color: #67776e; font-size: .85rem; }
.course-step :deep(h3) { color: #173e33; }
.step-navigation { display: flex; justify-content: space-between; gap: 1rem; margin-top: 1rem; }
.step-navigation button { padding: .75rem 1rem; font: inherit; border: 1px solid #b8cec3; border-radius: 8px; background: #fff; color: #203e36; cursor: pointer; }
.step-navigation .next-step { background: #173e33; color: #fff; }
.step-navigation button:disabled { opacity: .5; cursor: default; }
.fingerprinting-course button:focus-visible { outline: 3px solid #af6249; outline-offset: 2px; }
</style>
