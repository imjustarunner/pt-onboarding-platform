<template>
  <div class="handbook-prose foundation-content" :class="`foundation-${section.slug}`">
    <template v-if="section.slug === historySectionSlug">
      <div class="story-opening">
        <span class="foundation-label">{{ storyLabel }}</span>
        <h4>A shared vision.<br /><em>Care where it matters.</em></h4>
        <Icon name="leaf" class="story-leaf" />
      </div>
      <div v-if="founders.length" class="founder-grid" :aria-label="`${brandLabel} founders`">
        <figure v-for="person in founders" :key="person.name" class="founder-portrait">
          <img v-if="person.photoUrl && !failedPhotos[person.photoUrl]" :src="person.photoUrl" :alt="person.name" width="500" height="560" @error="failedPhotos[person.photoUrl] = true" />
          <div v-else class="founder-initials" aria-hidden="true">{{ initials(person.name) }}</div>
          <figcaption><span>Co-founder</span><strong>{{ person.name }}</strong></figcaption>
        </figure>
      </div>
      <div class="story-body" v-html="safeBody" />
    </template>

    <div v-else-if="['mission', 'vision'].includes(section.slug)" class="purpose-panel">
      <div class="purpose-heading"><span class="foundation-label">{{ section.slug === 'mission' ? 'Why we are here' : 'The future we see' }}</span><Icon :name="section.slug === 'mission' ? 'heart' : 'mountain'" /></div>
      <div class="purpose-statement" v-html="safeBody" />
      <div class="purpose-signature"><span aria-hidden="true" />{{ brandLabel }} · {{ section.title }}</div>
    </div>

    <template v-else-if="section.slug === 'values' && valueCards">
      <div class="foundation-intro values-intro"><div><span class="foundation-label">What guides us</span><h4>How we show up.<br /><em>Every day.</em></h4></div><img v-if="botanicalUrl && !failedPhotos[botanicalUrl]" class="botanical-art" :src="botanicalUrl" alt="" width="1536" height="1024" loading="lazy" decoding="async" @error="failedPhotos[botanicalUrl] = true" /></div>
      <div class="values-grid">
        <section v-for="(card, index) in valueCards" :key="index" class="value-card">
          <div class="value-top"><Icon :name="valueIcon(card.title)" /><span aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span></div>
          <h4>{{ card.title }}</h4><div v-html="card.body" />
        </section>
      </div>
    </template>

    <template v-else-if="section.slug === 'goals'">
      <div class="foundation-intro"><span class="foundation-label">Our commitments</span><h4>More access.<br /><em>More possibility.</em></h4></div>
      <div class="goals-body" v-html="safeBody" />
    </template>

    <div v-else v-html="safeBody" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import DOMPurify from 'dompurify';
import Icon from '../rise/RiseIcon.vue';

const props = defineProps({ section: { type: Object, required: true }, founders: { type: Array, default: () => [] }, botanicalUrl: { type: String, default: '' }, brandLabel: { type: String, default: 'ITSCO' }, historySectionSlug: { type: String, default: 'history-and-background-of-itsco' }, storyLabel: { type: String, default: 'Our beginnings · Est. 2022' } });
const safeBody = computed(() => DOMPurify.sanitize(String(props.section.body_html || '')));
const failedPhotos = ref({});
const initials = name => String(name).split(' ').map(word => word[0]).slice(0, 2).join('');
const valueIcon = title => ({ 'Good Judgment': 'shield', Communication: 'chat', Impact: 'target', Curiosity: 'mountain', Innovation: 'leaf', Honesty: 'heart', Selflessness: 'people' }[title] || 'leaf');

// Style the current section text, including later edits. Unexpected structures
// fall back to the entire sanitized body instead of dropping supplied wording.
const valueCards = computed(() => {
  if (props.section.slug !== 'values') return null;
  const body = new DOMParser().parseFromString(safeBody.value, 'text/html').body;
  const cards = [];
  for (const node of body.childNodes) {
    if (node.nodeType === 3 && !node.textContent.trim()) continue;
    if (node.nodeType !== 1) return null;
    if (node.tagName === 'H4') cards.push({ title: node.textContent, body: '' });
    else if (cards.length && node.tagName === 'P') cards[cards.length - 1].body += node.outerHTML;
    else return null;
  }
  return cards.length && cards.every(card => card.body) ? cards : null;
});
</script>

<style scoped>
.foundation-content { --foundation-green: #11583f; --foundation-aqua: #d0f4eb; --foundation-lime: #e8ed9d; }
.foundation-content .foundation-label { display: block; font: 600 10px/1.5 var(--handbook-font, var(--font-ptco)); letter-spacing: .17em; text-transform: uppercase; }
.foundation-content .foundation-intro { padding: 8px 0 28px; }
.values-intro { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; }.values-intro > div { flex: 1 1 240px; }.botanical-art { width: 190px; height: auto; flex: 0 1 190px; margin-left: auto; }
.foundation-content .foundation-intro h4,.foundation-content .story-opening h4 { font: 42px/1.12 var(--handbook-font, var(--font-ptco)); letter-spacing: -.035em; margin: 14px 0 0; color: var(--foundation-green); }
.foundation-content .foundation-intro em,.foundation-content .story-opening em { font-weight: normal; }
.foundation-content .story-opening { position: relative; padding: 30px 32px; background: var(--foundation-green); color: #e9edba; border-radius: 12px 12px 0 0; overflow: hidden; }
.foundation-content .story-opening h4 { color: #fffef3; position: relative; z-index: 1; max-width: 540px; }
.foundation-content .story-opening em { color: #cbe9d7; }
.story-leaf { position: absolute; width: 160px; height: 160px; right: -26px; bottom: -33px; color: #dff29c; opacity: .18; transform: rotate(-18deg); }
.founder-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 2px; margin: 0 0 32px; }
.founder-portrait { margin: 0; background: #edf2e5; min-width: 0; }
.founder-portrait img { display: block; width: 100%; height: auto; aspect-ratio: 1 / 1.1; object-fit: cover; object-position: center 28%; }
.founder-portrait figcaption { padding: 17px 20px 20px; }
.founder-portrait figcaption span { display: block; color: #566b58; font: 600 9px/1.5 var(--handbook-font, var(--font-ptco)); letter-spacing: .16em; text-transform: uppercase; margin-bottom: 5px; }
.founder-portrait figcaption strong { display: block; font: 25px/1.2 var(--handbook-font, var(--font-ptco)); color: var(--foundation-green); }
.founder-initials { aspect-ratio: 1 / 1.1; display: grid; place-items: center; font: 60px var(--handbook-font, var(--font-ptco)); color: var(--foundation-green); background: #d5e4d6; }
.story-body :deep(p:first-child) { font: 22px/1.55 var(--handbook-font, var(--font-ptco)); color: #174e3b; border-left: 3px solid #adc94e; padding-left: 22px; margin-bottom: 26px; }
.purpose-panel { position: relative; padding: clamp(26px,4vw,48px); border-radius: 12px; overflow: hidden; background: var(--foundation-green); color: #fffef3; }
.purpose-panel::after { content: ''; width: 230px; height: 230px; border: 1px solid #a9c7a94a; border-radius: 50%; position: absolute; right: -100px; bottom: -120px; box-shadow: 0 0 0 25px #a9c7a90a, 0 0 0 50px #a9c7a908; pointer-events: none; }
.purpose-heading { display: flex; justify-content: space-between; align-items: center; gap: 15px; margin-bottom: 40px; color: #dfe994; }
.purpose-heading svg { width: 31px; height: 31px; flex: 0 0 auto; }
.purpose-statement { position: relative; z-index: 1; }
.purpose-statement :deep(p) { font: 30px/1.5 var(--handbook-font, var(--font-ptco)); letter-spacing: -.015em; margin: 0; }
.purpose-signature { display: flex; align-items: center; gap: 12px; margin-top: 35px; font: 10px/1.5 var(--handbook-font, var(--font-ptco)); text-transform: uppercase; letter-spacing: .12em; color: #dbe6c6; }
.purpose-signature span { height: 1px; width: 35px; background: currentColor; }
.foundation-vision .purpose-panel { background: #d7eee5; color: #154f3d; }
.foundation-vision .purpose-heading,.foundation-vision .purpose-signature { color: #245d48; }
.values-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
.value-card { padding: 25px; background: #eef4e9; border: 1px solid #d7e3d4; border-radius: 10px; }
.value-card:nth-child(3n + 2) { background: #def2ec; border-color: #c9e2d9; }
.value-card:nth-child(3n) { background: #f3f2db; border-color: #e4e3bf; }
.value-card:last-child:nth-child(odd) { grid-column: 1 / -1; background: var(--foundation-green); border-color: var(--foundation-green); color: #f6faed; }
.value-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; color: #426d51; }
.value-top svg { width: 27px; height: 27px; }
.value-top span { font: 11px/1 var(--handbook-font, var(--font-ptco)); letter-spacing: .1em; }
.foundation-content .value-card h4 { font: 25px/1.2 var(--handbook-font, var(--font-ptco)); margin: 0 0 12px; color: #174e3b; }
.value-card :deep(p) { font-size: 14px; line-height: 1.65; margin: 0; }
.value-card:last-child:nth-child(odd) h4,.value-card:last-child:nth-child(odd) .value-top { color: #ecf1b1; }
.goals-body :deep(ul),.goals-body :deep(ol) { list-style: none; padding: 0; margin: 0; counter-reset: goal; }
.goals-body :deep(li) { position: relative; counter-increment: goal; border-top: 1px solid #cbd9c4; padding: 24px 0 24px 62px; font: 22px/1.5 var(--handbook-font, var(--font-ptco)); color: #254f3b; }
.goals-body :deep(li)::before { content: counter(goal, decimal-leading-zero); position: absolute; left: 0; top: 28px; font: 12px/1.5 var(--handbook-font, var(--font-ptco)); color: #486b39; background: #e7eccb; padding: 7px 9px; border-radius: 50%; }
@media(max-width:1000px) and (min-width:721px) { .values-grid { grid-template-columns: 1fr; }.foundation-content .story-opening h4 { font-size: 32px; }.founder-portrait figcaption { padding: 14px 10px; }.founder-portrait figcaption strong { font-size: 21px; }.purpose-statement :deep(p) { font-size: 25px; } }
@media(max-width:500px) { .values-grid { grid-template-columns: 1fr; }.foundation-content .foundation-intro h4 { font-size: 35px; }.foundation-content .story-opening { padding: 25px 20px; }.foundation-content .story-opening h4 { font-size: 30px; }.founder-portrait figcaption { padding: 14px 10px; }.founder-portrait figcaption strong { font-size: 19px; }.founder-portrait img { aspect-ratio: 1 / 1.22; }.purpose-panel { padding: 26px 22px; }.purpose-heading { margin-bottom: 28px; }.purpose-statement :deep(p) { font-size: 25px; }.story-body :deep(p:first-child) { font-size: 20px; padding-left: 17px; }.goals-body :deep(li) { font-size: 20px; padding-left: 50px; } }
</style>
