<template>
  <div
    v-if="hasContent"
    class="jds"
    :class="{ 'jds--compact': compact }"
    :style="rootStyle"
  >
    <header v-if="showHeader" class="jds-header">
      <h2 v-if="title" class="jds-title">{{ title }}</h2>
      <div v-if="metaItems.length" class="jds-meta">
        <span v-for="m in metaItems" :key="m.label" class="jds-meta-item">
          <span class="jds-meta-ico" aria-hidden="true">{{ m.icon }}</span>
          {{ m.label }}
        </span>
      </div>
      <div v-if="summaryParagraphs.length && !aboutTheRole" class="jds-summary">
        <p v-for="(para, i) in summaryParagraphs" :key="`sum-${i}`">{{ para }}</p>
      </div>
      <hr v-if="title || summaryParagraphs.length || metaItems.length" class="jds-rule" />
    </header>

    <div class="jds-grid">
      <section v-if="aboutParagraphs.length" class="jds-card">
        <h3 class="jds-card-title">
          <span class="jds-card-ico" aria-hidden="true">👤</span>
          About the Role
        </h3>
        <div class="jds-card-body">
          <p v-if="aboutParagraphs.length === 1">{{ aboutParagraphs[0] }}</p>
          <template v-else>
            <p>{{ aboutParagraphs[0] }}</p>
            <ul class="jds-list">
              <li v-for="(para, i) in aboutParagraphs.slice(1)" :key="`about-b-${i}`">{{ para }}</li>
            </ul>
          </template>
        </div>
      </section>

      <section v-if="responsibilitySets.length" class="jds-card">
        <h3 class="jds-card-title">
          <span class="jds-card-ico" aria-hidden="true">✅</span>
          Responsibilities
        </h3>
        <div v-for="(set, si) in responsibilitySets" :key="`rs-${si}`" class="jds-set">
          <h4 v-if="set.title" class="jds-set-title">{{ set.title }}</h4>
          <ul class="jds-list">
            <li v-for="(item, i) in set.items" :key="`r-${si}-${i}`">{{ item }}</li>
          </ul>
        </div>
      </section>

      <section v-if="qualifications.length" class="jds-card">
        <h3 class="jds-card-title">
          <span class="jds-card-ico" aria-hidden="true">🎓</span>
          Qualifications
        </h3>
        <ul class="jds-list">
          <li v-for="(item, i) in qualifications" :key="`q-${i}`">{{ item }}</li>
        </ul>
      </section>

      <section v-if="benefits.length" class="jds-card">
        <h3 class="jds-card-title">
          <span class="jds-card-ico" aria-hidden="true">✨</span>
          Benefits
        </h3>
        <ul class="jds-list">
          <li v-for="(item, i) in benefits" :key="`b-${i}`">{{ item }}</li>
        </ul>
      </section>
    </div>

    <p v-if="pdfUrl" class="jds-pdf">
      <a :href="pdfUrl" target="_blank" rel="noopener noreferrer" class="jds-pdf-link">
        {{ pdfLabel || 'Download full PDF' }} →
      </a>
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  sections: { type: Object, default: null },
  title: { type: String, default: '' },
  summary: { type: String, default: '' },
  roleType: { type: String, default: '' },
  location: { type: String, default: '' },
  schedule: { type: String, default: '' },
  workMode: { type: String, default: '' },
  accentColor: { type: String, default: '#1a8c54' },
  compact: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: false },
  pdfUrl: { type: String, default: '' },
  pdfLabel: { type: String, default: '' }
});

const aboutTheRole = computed(() => String(props.sections?.aboutTheRole || '').trim());

/** Split dense walls of text into readable paragraphs. */
function splitIntoParagraphs(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const byBlank = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const byLine = text.split(/\n/).map((p) => p.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  // Single long block: break on sentence boundaries into ~2–4 chunks.
  if (text.length < 280) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    const next = `${buf}${s}`.trim();
    if (buf && next.length > 220) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [text];
}

const aboutParagraphs = computed(() => splitIntoParagraphs(aboutTheRole.value));
const summaryParagraphs = computed(() => splitIntoParagraphs(props.summary));

const responsibilitySets = computed(() => {
  const src = props.sections;
  const sets = Array.isArray(src?.responsibilitySets) ? src.responsibilitySets : null;
  if (sets && sets.length) {
    return sets
      .map((s) => ({
        title: String(s?.title || '').trim(),
        items: Array.isArray(s?.items)
          ? s.items.map((x) => String(x || '').trim()).filter(Boolean)
          : []
      }))
      .filter((s) => s.title || s.items.length);
  }
  const flat = Array.isArray(src?.responsibilities)
    ? src.responsibilities.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  return flat.length ? [{ title: '', items: flat }] : [];
});
const qualifications = computed(() =>
  Array.isArray(props.sections?.qualifications)
    ? props.sections.qualifications.map((s) => String(s || '').trim()).filter(Boolean)
    : []
);
const benefits = computed(() =>
  Array.isArray(props.sections?.benefits)
    ? props.sections.benefits.map((s) => String(s || '').trim()).filter(Boolean)
    : []
);

const hasContent = computed(() =>
  !!(
    aboutParagraphs.value.length
    || responsibilitySets.value.length
    || qualifications.value.length
    || benefits.value.length
    || props.pdfUrl
    || (props.showHeader && (props.title || summaryParagraphs.value.length))
  )
);

const metaItems = computed(() => {
  const items = [];
  if (String(props.roleType || '').trim()) items.push({ icon: '💼', label: String(props.roleType).trim() });
  if (String(props.location || '').trim()) items.push({ icon: '📍', label: String(props.location).trim() });
  if (String(props.schedule || '').trim()) items.push({ icon: '🗓️', label: String(props.schedule).trim() });
  if (String(props.workMode || '').trim()) items.push({ icon: '👥', label: String(props.workMode).trim() });
  return items;
});

const rootStyle = computed(() => ({
  '--jds-accent': props.accentColor || '#1a8c54'
}));
</script>

<style scoped>
.jds {
  --jds-accent: #1a8c54;
  color: #0f172a;
  font-family: inherit;
  text-align: left;
}
.jds-header { margin-bottom: 8px; text-align: left; }
.jds-title {
  margin: 0 0 10px;
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--jds-accent);
  letter-spacing: -0.02em;
  text-align: left;
}
.jds-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
  margin-bottom: 14px;
  font-size: 0.88rem;
  color: #475569;
  font-weight: 600;
  justify-content: flex-start;
}
.jds-meta-item { display: inline-flex; align-items: center; gap: 6px; }
.jds-meta-ico { font-size: 0.95rem; }
.jds-summary {
  margin: 0 0 16px;
  font-size: 0.98rem;
  line-height: 1.65;
  color: #334155;
  text-align: left;
}
.jds-summary p { margin: 0 0 0.75rem; }
.jds-summary p:last-child { margin-bottom: 0; }
.jds-rule {
  border: 0;
  border-top: 1px solid #e2e8f0;
  margin: 0 0 20px;
}
.jds-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px 28px;
  text-align: left;
}
.jds--compact .jds-grid { gap: 16px; }
.jds-card { text-align: left; min-width: 0; }
.jds-card-title {
  margin: 0 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.02rem;
  font-weight: 800;
  color: var(--jds-accent);
  text-align: left;
  justify-content: flex-start;
}
.jds-card-ico { font-size: 1.05rem; line-height: 1; }
.jds-card-body {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.65;
  color: #1e293b;
  text-align: left;
}
.jds-card-body p { margin: 0 0 0.75rem; }
.jds-card-body p:last-child { margin-bottom: 0; }
.jds-list {
  margin: 0;
  padding-left: 1.25rem;
  list-style: disc outside;
  font-size: 0.92rem;
  line-height: 1.55;
  color: #1e293b;
  text-align: left;
}
.jds-list li {
  margin: 0 0 7px;
  padding-left: 0.15rem;
  text-align: left;
}
.jds-list li:last-child { margin-bottom: 0; }
.jds-set + .jds-set { margin-top: 14px; }
.jds-set-title {
  margin: 0 0 8px;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
  text-align: left;
}
.jds-list li::marker { color: var(--jds-accent); }
.jds-pdf { margin: 18px 0 0; text-align: left; }
.jds-pdf-link {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--jds-accent);
  text-decoration: none;
}
.jds-pdf-link:hover { text-decoration: underline; }

@media (max-width: 720px) {
  .jds-grid { grid-template-columns: 1fr; }
  .jds-title { font-size: 1.35rem; }
}
</style>
