<template>
  <section id="provider-transition" class="provider-learning" aria-labelledby="provider-learning-title">
    <header class="manual-header">
      <div><p class="eyebrow">AuricWell · Provider transition · {{ guide.edition }}</p><h2 id="provider-learning-title">{{ guide.title }}</h2><p>{{ guide.subtitle }}</p></div>
      <button type="button" class="primary" :aria-expanded="opened" aria-controls="provider-manual" @click="opened = !opened">{{ opened ? 'Close field guide' : 'Open field guide' }}</button>
    </header>
    <p class="reference-note">Reference and practice. Reading this guide does not change assigned-course progress, record training completion or create paid time.</p>
    <div v-if="opened" id="provider-manual">
      <p class="scope">{{ guide.scope }}</p>
      <aside class="sharing-policy" aria-label="Family communication sharing"><strong>{{ sharingNotice.title }}</strong><p v-for="statement in sharingNotice.statements" :key="statement">{{ statement }}</p><p><strong>Acknowledgment · {{ sharingVersion }}:</strong> {{ sharingNotice.acknowledgment }}</p></aside>
      <nav class="downloads" aria-label="Download provider training"><a :href="`${base}/PROVIDER-FIELD-GUIDE.pdf`" download>Download manual PDF</a><a :href="`${base}/PROVIDER-TRANSITION-TRAINING.pptx`" download>PowerPoint with presenter notes</a><a :href="`${base}/PROVIDER-FIELD-GUIDE.html`" target="_blank" rel="noopener">Printable / accessible manual</a></nav>
      <div class="manual-controls"><label>Search this guide<input v-model="query" type="search" placeholder="Try scheduling, school, email, note…" /></label><label>Category<select v-model="category"><option value="">All categories</option><option v-for="item in categories" :key="item">{{ item }}</option></select></label></div>
      <p class="result-count" role="status">{{ modules.length }} of {{ guide.modules.length }} topics</p>
      <div class="topic-grid">
        <details v-for="module in modules" :key="module.id" :open="activeTopic === module.id" @toggle="topicToggled(module.id, $event)">
          <summary><span class="topic-category">{{ module.category }} · {{ module.minutes }} min practice</span><strong>{{ module.title }}</strong><span>{{ module.summary }}</span></summary>
          <div class="topic-body">
            <p class="availability">{{ module.status }}</p>
            <figure><a :href="imageUrl(module)" target="_blank" rel="noopener" :aria-label="`Open full-size image: ${module.title}`"><img :src="imageUrl(module)" :alt="module.imageAlt" loading="lazy" /></a><figcaption>{{ caption(module) }} Open the image to view it at full size.</figcaption></figure>
            <figure v-for="figure in module.additionalImages || []" :key="figure.image"><a :href="imageUrl(figure)" target="_blank" rel="noopener" :aria-label="`Open full-size image: ${figure.alt}`"><img :src="imageUrl(figure)" :alt="figure.alt" loading="lazy" /></a><figcaption>{{ caption(figure) }} Open the image to view it at full size.</figcaption></figure>
            <h3>Do the work</h3><ol><li v-for="step in module.steps" :key="step">{{ step }}</li></ol>
            <div class="practice"><h3>Try it in a supervised synthetic exercise</h3><p>{{ module.practice }}</p><p><strong>Check your result:</strong> {{ module.check }}</p><label class="practice-mark"><input type="checkbox" v-model="reviewed[module.id]" /> I reviewed this topic in this visit</label><small>This check is temporary and clears when the guide closes or the page reloads. It is not course completion.</small></div>
            <p class="pitfall"><strong>Watch for:</strong> {{ module.pitfall }}</p>
          </div>
        </details>
      </div>
      <p v-if="!modules.length" class="no-results">No topics match. Try another word or choose All categories.</p>
      <footer><p>Keep real client information out of training exercises. Use your agency’s ordinary clinical, assignment, coverage and security rules.</p><button type="button" @click="resetPractice">Clear this visit’s practice checks</button></footer>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import guide from '../../content/provider-transition.json';
import { FAMILY_COMMUNICATION_NOTICE as sharingNotice, FAMILY_COMMUNICATION_POLICY_VERSION as sharingVersion } from '../../navigation/familyCommunicationPolicy';
const props = defineProps({ search: { type: String, default: '' }, initiallyOpen: Boolean });
const base = '/auricwell/provider-training';
const opened = ref(props.initiallyOpen), query = ref(''), category = ref(''), activeTopic = ref(''), reviewed = ref({});
const categories = [...new Set(guide.modules.map(m => m.category))];
const modules = computed(() => {
  const words = `${props.search} ${query.value}`.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return guide.modules.filter(module => (!category.value || module.category === category.value) && words.every(word => JSON.stringify(module).toLowerCase().includes(word)));
});
function imageUrl(module) { return `${base}/screenshots/${module.image}.png`; }
function caption(module) {
  if (module.image?.startsWith('secure-')) return 'Actual release-candidate application component · Synthetic fixture-only capture · No live records, saves or sends. See screenshot provenance. Live acceptance is separate.';
  if (['account', 'learning', 'clinical'].includes(module.image)) return 'Actual application component · Local synthetic training preview · No live records, saves or sends. This image is not live workflow acceptance.';
  return 'Actual synthetic QA screen · Provider Avery1433 · Agency450 · Chrome desktop · November 11, 2026. Screen layout and available actions depend on your role and release.';
}
function topicToggled(id, event) { if (event.target.open) activeTopic.value = id; else if (activeTopic.value === id) activeTopic.value = ''; }
function resetPractice() { reviewed.value = {}; }
watch(opened, value => { if (!value) resetPractice(); });
watch(() => props.initiallyOpen, value => { if (value) opened.value = true; });
</script>
<style scoped>
.provider-learning{margin:24px 0;border:1px solid #cbd9e9;border-radius:16px;background:linear-gradient(135deg,#f3f7fd,#fff);color:#172c49;overflow:hidden}.manual-header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:25px 28px 12px}.eyebrow{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#496c91;font-weight:700}.manual-header h2{font-size:24px;line-height:1.25;margin:8px 0 12px;color:#102a50}.manual-header p{font-size:14px;line-height:1.7;max-width:760px}.provider-learning button,.downloads a{font:inherit;cursor:pointer;border:1px solid #a9bfd8;border-radius:9px;padding:11px 15px;min-height:44px;background:white;color:#153965;font-size:13px}.provider-learning button.primary{background:#063e82;color:white;border-color:#063e82;flex-shrink:0}.reference-note{font-size:12px;line-height:1.7;margin:0;padding:0 28px 24px;color:#586b83}#provider-manual{padding:0 28px 24px}.scope{font-size:13px;line-height:1.8;padding:16px;background:#eaf1f9;border-radius:8px}.sharing-policy{border-left:4px solid #c58a13;background:#fff6df;padding:16px 20px;font-size:13px;line-height:1.85;margin:18px 0}.sharing-policy strong{font-size:15px;color:#63450a}.sharing-policy p{margin:9px 0}.downloads{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}.downloads a{display:inline-flex;align-items:center;text-decoration:none}.manual-controls{display:flex;gap:16px;margin:22px 0 10px}.manual-controls label{font-size:12px;line-height:1.5;font-weight:600;flex:1}.manual-controls input,.manual-controls select{display:block;width:100%;box-sizing:border-box;border:1px solid #acbfd3;background:white;border-radius:8px;min-height:44px;padding:10px 12px;font:inherit;margin-top:6px;color:inherit}.result-count{font-size:12px;color:#546b86}.topic-grid{display:grid;gap:13px}.topic-grid details{border:1px solid #d2deec;border-radius:12px;background:white;min-width:0}.topic-grid summary{padding:18px 22px;cursor:pointer;line-height:1.6}.topic-grid summary strong{display:block;font-size:17px;margin:5px 0;color:#102b51}.topic-grid summary>span:last-child{font-size:13px;color:#546982;display:block}.topic-category{text-transform:uppercase;font-size:10px;letter-spacing:.1em;color:#4b6d92}.topic-body{padding:0 22px 20px;border-top:1px solid #e0e8f2;font-size:14px;line-height:1.85;overflow-wrap:anywhere}.availability{background:#fff3d6;padding:10px 14px;border-radius:7px;font-size:12px}.topic-body h3{font-size:15px;margin:20px 0 8px;color:#173b68}.topic-body figure{margin:18px 0}.topic-body img{display:block;width:100%;height:auto;border:1px solid #d6dfeb;border-radius:8px}.topic-body figcaption{font-size:11px;line-height:1.7;color:#526780;margin-top:7px}.topic-body ol{padding-left:25px}.topic-body li{margin:11px 0}.practice{background:#edf4fc;border:1px solid #d0e0f3;border-radius:10px;padding:0 18px 17px}.practice p{margin:9px 0}.practice-mark{display:flex;align-items:center;gap:9px;font-size:12px}.practice-mark input{height:18px;width:18px;accent-color:#0a4c91;flex-shrink:0}.practice small{display:block;font-size:11px;line-height:1.7;margin-top:7px;color:#526780}.pitfall{border-left:3px solid #e8ac27;padding:10px 14px;background:#fff9e9}.no-results{padding:22px;background:white;border-radius:10px}footer{border-top:1px solid #d4dfed;margin-top:24px;padding-top:15px;font-size:12px;line-height:1.8}.provider-learning :is(button,a,input,select,summary):focus-visible{outline:3px solid #d79816;outline-offset:3px}@media(max-width:700px){.manual-header{flex-direction:column;align-items:flex-start;padding:20px 18px 10px}.manual-header h2{font-size:22px}.reference-note{padding:0 18px 20px}#provider-manual{padding:0 18px 20px}.manual-controls{flex-direction:column}.downloads{display:grid}.topic-grid summary{padding:16px}.topic-body{padding:0 16px 16px}}
</style>
