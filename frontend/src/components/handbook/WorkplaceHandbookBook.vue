<template>
  <Teleport to="body" :disabled="!expanded"><section ref="analyticsRoot" :role="expanded ? 'dialog' : undefined" :aria-modal="expanded || undefined" @keydown="readerKeydown" :class="['handbook-book', metadata.presentation?.theme, { 'handbook-screen-only': !canPrint, 'reader-expanded': expanded }]" :aria-label="documentTitle">
    <div class="reader-toolbar"><span>{{ documentTitle }}</span><button ref="expandButton" type="button" :aria-expanded="expanded" @click="toggleExpanded">{{ expanded ? 'Return to page ↙' : 'Expand reader ↗' }}</button></div>
    <p class="handbook-print-notice">Read the current {{ documentTitle }} in the app. Printing and PDF export are not available in this view.</p>
    <DocumentAnalyticsControl v-if="analytics" :agency-id="analytics.agencyId" :document-key="metadata.documentKey || 'workplace-handbook'" :document-title="documentTitle" />
    <p v-if="analytics && analytics.enabled !== false" class="reading-disclosure">Your company administrators can see reading activity, link clicks, helpfulness feedback and questions asked here.</p>
    <CrisisGuideQuickActions v-if="isCrisisGuide" @open="selectSection($event, true)" />
    <header class="book-cover">
      <BrandedHandbookCover v-if="isGuide || ['isi-foundations', 'company-foundations'].includes(metadata.presentation?.theme)" class="cover-art" :organization="metadata.organization" :title-lines="metadata.coverTitle" :presentation="metadata.presentation" :isi="metadata.presentation?.theme === 'isi-foundations'" />
      <img v-else-if="metadata.coverUrl" :src="metadata.coverUrl" :alt="`${metadata.organization || ''} Workplace Handbook cover`" class="cover-art" />
      <div class="cover-copy">
        <img v-if="metadata.presentation?.logoUrl" :src="metadata.presentation.logoUrl" :alt="metadata.organization" class="cover-logo" />
        <span class="eyebrow">{{ metadata.organization || 'Our workplace' }} · People &amp; practice</span>
        <h2>{{ metadata.coverTitle?.[0] || 'Workplace' }}<br /><span>{{ metadata.coverTitle?.[1] || 'handbook.' }}</span></h2>
        <p class="cover-description">{{ metadata.coverDescription || 'Our shared foundations. The way we work. A place to find the guidance you need.' }}</p>
        <div class="cover-meta">
          <span>{{ readyCount }} of {{ sections.length }} sections added</span>
          <span v-if="handbook.version?.version_number">Version {{ handbook.version.version_number }}</span>
          <span v-if="handbook.version?.is_draft || !handbook.version">Preview</span>
        </div>
        <button type="button" class="book-primary" :disabled="!sections.length" @click="selectSection(firstReady?.slug || sections[0]?.slug, true)">Start reading <span aria-hidden="true">↗</span></button>
      </div>
    </header>

    <div v-if="isDocumentationStandards" class="care-orientation-banner"><strong>A clear record of the care you provide.</strong><p>Capture the actual service, the client’s response and what comes next. Review the essentials before you sign.</p><button type="button" @click="selectSection('minimum-note', true)">What every note needs →</button></div>
    <div v-if="isFacilitatorProtocol" class="care-orientation-banner"><strong>From approved service to accurate record.</strong><p>A working companion for bachelor’s-level facilitators. Keep service authorization, claim coding and actual paid work distinct.</p><button type="button" @click="selectSection('before-the-service', true)">Before the service →</button></div>
    <SchoolPracticeRoadmap v-if="isSchoolGuide" :sections="sections" @open="selectSection($event, true)" />
    <div v-if="isCareGuide" class="care-orientation-banner"><strong>Familiarization, with clear boundaries.</strong><p>Learn about our approaches and the roles behind them. Reading or completing a knowledge check does not certify a technique or authorize clinical practice.</p><button type="button" @click="selectSection('facilitator-scope', true)">Facilitator scope &amp; H0004 →</button></div>
    <div v-if="isSkillsGuide" class="care-orientation-banner"><strong>Skills in practice, with support.</strong><p>Explore connection, regulation and learning. Completing this orientation does not authorize a group or replace observed competence and licensed oversight.</p><button type="button" @click="selectSection('program-boundaries', true)">Our program &amp; group rules →</button></div>
    <div v-if="isFacilitiesGuide" class="care-orientation-banner"><strong>437 Windchime · Shared office</strong><p>Use the app for room requests and operations. Obtain current access credentials privately from authorized staff.</p><button type="button" @click="selectSection(metadata.facilities?.denverSectionSlug || 'windchime-opening-and-closing', true)">{{ metadata.facilities?.denverStatus === 'coming_soon' ? 'ITSCO Denver · Coming soon →' : 'Opening & closing →' }}</button></div>

    <p v-if="missingTextCount" class="transfer-note"><span aria-hidden="true">◐</span> {{ isGuide ? 'Complete the company setup sections before publishing this guide for your team.' : metadata.template ? 'Company edition in preparation. Complete the company-specific sections before publishing this handbook for your team.' : 'We’re bringing the handbook into the app section by section. Sections marked “Text pending” are still being added; People Operations can help with those policies.' }}<a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer">Admin · Open original ↗</a></p>

    <WorkplaceHandbookAssistant v-if="answerQuestion" ref="assistant" :ask="answerQuestion" :version="handbook.version" :preview="assistantPreview" :document-label="documentLabel" :anchor-prefix="anchorPrefix" @open="selectSection($event, true)" @reload="$emit('reload')" />
    <div class="book-layout">
      <aside class="book-outline" :aria-label="`${documentTitle} contents`">
        <div class="outline-heading"><span class="eyebrow">Inside the {{ isGuide ? 'guide' : 'handbook' }}</span><strong>Contents</strong></div>
        <label class="book-search"><span class="sr-only">Search {{ documentLabel }}</span><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="Find a section or phrase…" /></label>
        <p class="search-count" aria-live="polite">{{ query ? `${filtered.length} matching sections` : `${chapters.length} chapters · ${sections.length} sections` }}</p>
        <nav class="outline-scroll">
          <p v-if="!filtered.length" class="no-results">No sections match “{{ query }}”.</p>
          <a v-for="section in filtered" :key="section.slug" :href="`#${anchorPrefix}-${section.slug}`" :class="['outline-link', { active: selected?.slug === section.slug, child: !!section.parent_slug }]" :aria-current="selected?.slug === section.slug ? 'location' : undefined" @click.prevent="selectSection(section.slug, true)">
            <span class="outline-title">{{ section.title }}</span>
            <span class="outline-status">{{ isChapterDivider(section) ? 'Chapter contents' : section.content_status === 'pending' ? 'Text pending' : 'Read section' }}<span v-if="section.source_page"> · p. {{ section.source_page }}</span><span v-if="updatesFor(section.slug).length"> · {{ updatesFor(section.slug).length }} {{ updatesFor(section.slug).some(e => e.status === 'draft') ? 'changes to review' : 'updates' }}</span></span>
          </a>
        </nav>
      </aside>

      <article v-if="selected" :id="`${anchorPrefix}-${selected.slug}`" ref="article" :class="['book-page', { 'foundation-page': isFoundation }]" tabindex="-1">
        <div class="page-topline"><span>{{ parentTitle || metadata.organization || 'Handbook' }}</span><span v-if="selected.source_page">Original p. {{ selected.source_page }}</span></div>
        <WorkplaceHandbookLandscape :artwork="selectedLandscape" />
        <span class="section-eyebrow">{{ selected.parent_slug ? 'In this chapter' : 'Chapter' }}</span>
        <h3>{{ selected.title }}</h3>
        <div class="page-rule" />
        <StudentTrainingEvaluationForm v-if="matchesForm(metadata.forms?.studentTrainingEvaluation)" :template="metadata.forms.studentTrainingEvaluation" preview />
        <WorkplaceHandbookSelfAssessment v-else-if="selectedSelfAssessment" :form="selectedSelfAssessment" />
        <WorkplaceHandbookFoundations v-else-if="isFoundation && selected.content_status !== 'pending' && selected.body_html" :section="selected" :founders="metadata.presentation?.founders || []" :brand-label="metadata.presentation?.brandLabel || 'ITSCO'" :history-section-slug="metadata.presentation?.historySectionSlug || 'history-and-background-of-itsco'" :story-label="metadata.presentation?.storyLabel || 'Our beginnings · Est. 2022'" :botanical-url="metadata.presentation?.botanicalUrl || ''" @click="followPolicyLink" />
        <div v-else-if="selected.content_status !== 'pending' && selected.body_html" class="handbook-prose" @click="followPolicyLink" v-html="safeHtml(selected.body_html)" />
        <p v-else-if="isChapterDivider(selected)" class="chapter-introduction">Explore the sections in this chapter.</p>
        <div v-else class="pending-section">
          <span class="pending-tag">Text pending</span>
          <p>{{ (metadata.requiredSections || metadata.template?.requiredSections)?.find(topic => topic.slug === selected.slug)?.prompt || 'This section is in the handbook’s contents. Its full text is still being added here.' }}</p>
          <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer">Read this section in the original handbook ↗</a>
        </div>

        <div v-if="children.length" class="chapter-sections"><h4>In this chapter</h4><button v-for="child in children" :key="child.slug" type="button" @click="selectSection(child.slug, true)"><span>{{ child.title }}</span><span aria-hidden="true">↗</span></button></div>

        <section v-if="sectionUpdates.length" class="section-updates" aria-label="Section updates">
          <span class="eyebrow">Connected changes</span><h4>Updates to this section</h4>
          <p>Read these changes alongside the section text. Draft entries await publication.</p>
          <article v-for="entry in sectionUpdates" :key="entry.id" class="section-update"><span class="update-status">{{ entry.status === 'draft' ? 'Draft · awaiting publication' : 'Published update' }}{{ entry.period_label ? ` · ${entry.period_label}` : '' }}</span><strong>{{ entry.subject }}</strong><p v-if="entry.rationale">{{ entry.rationale }}</p><div class="handbook-prose" v-html="safeChanged(entry.changed_content)" /></article>
        </section>

        <div v-if="analytics && analytics.enabled !== false" class="reading-feedback"><span>Was this section helpful?</span><button type="button" @click="rateSection(true)">Yes</button><button type="button" @click="rateSection(false)">Not yet</button><span role="status">{{ feedbackMessage }}</span></div>
        <slot name="section-actions" :section="selected" />
        <footer class="page-navigation"><button type="button" :disabled="selectedIndex <= 0" @click="selectSection(sections[selectedIndex - 1]?.slug, true)">← Previous section</button><span>{{ selectedIndex + 1 }} / {{ sections.length }}</span><button type="button" :disabled="selectedIndex >= sections.length - 1" @click="selectSection(sections[selectedIndex + 1]?.slug, true)">Next section →</button></footer>
      </article>
      <p v-else class="pending-section">This document has not been added yet.</p>
    </div>
    <details v-if="metadata.presentation?.landscapes?.length" class="artwork-credits">
      <summary>Photography &amp; illustration</summary>
      <ul><li v-for="photo in metadata.presentation.landscapes" :key="photo.id"><a :href="creditUrl(photo.sourceUrl)" target="_blank" rel="noopener noreferrer">{{ photo.title }}</a> · {{ photo.credit }} · <a v-if="photo.licenseUrl" :href="creditUrl(photo.licenseUrl)" target="_blank" rel="noopener noreferrer">{{ photo.license }}</a><span v-else>{{ photo.license }}</span>.</li></ul>
      <p>Photographs are cropped to fit the page. Photo licenses apply to the photographs. The columbine, pine and aspen botanical accent is an AI-generated illustration.</p>
    </details>
  </section></Teleport>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { routeLocationKey } from 'vue-router';
import DOMPurify from 'dompurify';
import WorkplaceHandbookFoundations from './WorkplaceHandbookFoundations.vue';
import WorkplaceHandbookLandscape from './WorkplaceHandbookLandscape.vue';
import WorkplaceHandbookAssistant from './WorkplaceHandbookAssistant.vue';
import StudentTrainingEvaluationForm from '../evaluations/StudentTrainingEvaluationForm.vue';
import WorkplaceHandbookSelfAssessment from './WorkplaceHandbookSelfAssessment.vue';
import BrandedHandbookCover from './BrandedHandbookCover.vue';
import SchoolPracticeRoadmap from './SchoolPracticeRoadmap.vue';
import CrisisGuideQuickActions from './CrisisGuideQuickActions.vue';
import DocumentAnalyticsControl from '../library/DocumentAnalyticsControl.vue';
import { useDocumentAnalytics } from '../../composables/useDocumentAnalytics';

const props = defineProps({ handbook: { type: Object, required: true }, updates: { type: Array, default: () => [] }, fullHandbookUrl: { type: String, default: '' }, canOpenOriginal: { type: Boolean, default: false }, canPrint: { type: Boolean, default: false }, answerQuestion: { type: Function, default: null }, assistantPreview: { type: Boolean, default: false }, analytics: { type: Object, default: null }, analyticsHttp: { type: Object, default: undefined } });
const emit = defineEmits(['reload', 'handbook-link', 'section-change']);
const expanded = ref(false), expandButton = ref(null);
let previousFocus = null, previousOverflow = '';
async function toggleExpanded() {
  if (!expanded.value) {
    previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
    expanded.value = true; document.body.style.overflow = 'hidden';
    await nextTick(); expandButton.value?.focus(); article.value?.scrollIntoView?.({block:'start'});
  } else {
    expanded.value = false; document.body.style.overflow = previousOverflow;
    await nextTick(); previousFocus?.focus?.({preventScroll:true});
  }
}
function readerKeydown(event) {
  if (!expanded.value) return;
  if (event.key === 'Escape') { event.preventDefault(); toggleExpanded(); }
  if (event.key !== 'Tab') return;
  const controls = [...analyticsRoot.value.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')].filter(el=>el.getClientRects().length);
  const first=controls[0], last=controls.at(-1);
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
}
onBeforeUnmount(()=>{if(expanded.value)document.body.style.overflow=previousOverflow;});
const assistant = ref(null);
const query = ref('');
const selectedSlug = ref('');
const analyticsRoot = ref(null), feedbackMessage = ref('');
const readingAnalytics = useDocumentAnalytics(() => props.analytics ? { ...props.analytics, documentKey: props.handbook.metadata?.documentKey || 'workplace-handbook', versionId: props.handbook.version?.id, enabled: props.analytics.enabled !== false && !props.handbook.version?.is_draft } : null, { root: analyticsRoot, http: props.analyticsHttp, activeElement: () => article.value });
watch([selectedSlug, readingAnalytics.status], () => { readingAnalytics.section(selectedSlug.value); feedbackMessage.value = ''; });
async function rateSection(helpful) { feedbackMessage.value = await readingAnalytics.feedback(helpful) ? 'Thank you. Your feedback was saved.' : 'Feedback could not be saved. Please try again.'; }
const article = ref(null);
const sections = computed(() => props.handbook?.sections || []);
const metadata = computed(() => props.handbook?.metadata || {});
const isSchoolGuide = computed(() => metadata.value.documentKey === 'school-practice-guide');
const isCareGuide = computed(() => metadata.value.documentKey === 'counseling-guide');
const isSkillsGuide = computed(() => metadata.value.documentKey === 'skill-development-guide');
const isFacilitiesGuide = computed(() => metadata.value.documentKey === 'facilities-guide');
const isDocumentationStandards = computed(() => metadata.value.documentKey === 'service-documentation-standards');
const isFacilitatorProtocol = computed(() => metadata.value.documentKey === 'facilitator-coding-protocol');
const isCrisisGuide = computed(() => metadata.value.documentKey === 'crisis-response-guide');
const isGuide = computed(() => !!metadata.value.documentKey && metadata.value.documentKey !== 'workplace-handbook');
const documentTitle = computed(() => isGuide.value ? metadata.value.title || (isCareGuide.value ? 'Care Approaches & Practice Guide' : isSchoolGuide.value ? 'School Practice Guide' : isSkillsGuide.value ? 'Skill Development & Learning Guide' : 'Provider’s Guide') : 'Workplace handbook');
const documentLabel = computed(() => metadata.value.documentKey === 'nlu-learning-pilot-guide' ? 'NLU learning pilot guide' : metadata.value.documentKey === 'clinical-note-aid-guide' ? 'clinical note aid guide' : metadata.value.documentKey === 'caseload-management-sop' ? 'caseload management SOP' : metadata.value.documentKey === 'mandated-reporting-sop' ? 'mandated reporting SOP' : metadata.value.documentKey === 'group-psychotherapy-sop' ? 'group psychotherapy SOP' : isDocumentationStandards.value ? 'documentation guide' : isFacilitatorProtocol.value ? 'facilitator protocol' : isCrisisGuide.value ? 'crisis guide' : isFacilitiesGuide.value ? 'facilities guide' : isSkillsGuide.value ? 'skills guide' : isCareGuide.value ? 'care guide' : isSchoolGuide.value ? 'school practice guide' : isGuide.value ? 'provider guide' : 'handbook');
const anchorPrefix = computed(() => isGuide.value ? metadata.value.documentKey : 'handbook');
const chapters = computed(() => sections.value.filter(s => !s.parent_slug));
const readyCount = computed(() => sections.value.filter(s => s.content_status !== 'pending' && s.body_html).length);
const isChapterDivider = section => !section.parent_slug && !section.body_html && metadata.value.presentation?.chapterDividers?.includes(section.slug) && sections.value.some(s => s.parent_slug === section.slug);
const missingTextCount = computed(() => sections.value.filter(s => s.content_status === 'pending' && !isChapterDivider(s)).length);
const selectedLandscape = computed(() => {
  const presentation = metadata.value.presentation;
  const id = presentation?.sectionArtwork?.[selected.value?.slug];
  return presentation?.landscapes?.find(photo => photo.id === id) || null;
});
const creditUrl = value => /^https?:\/\//i.test(value || '') ? value : undefined;
const firstReady = computed(() => sections.value.find(s => s.content_status !== 'pending' && s.body_html));
const selectedIndex = computed(() => sections.value.findIndex(s => s.slug === selectedSlug.value));
const selected = computed(() => sections.value[selectedIndex.value]);
// If an administrator edits the handbook text independently, display that text
// instead of hiding it behind a now-stale form snapshot.
const matchesForm = form => form?.sectionSlug === selected.value?.slug && selected.value?.content_status !== 'pending' && form?.sectionBodyHtml === selected.value?.body_html;
const selectedSelfAssessment = computed(() => metadata.value.forms?.employeeSelfAssessments?.find(matchesForm));
const isFoundation = computed(() => ['itsco-foundations', 'nlu-foundations', 'isi-foundations'].includes(metadata.value.presentation?.theme) && [metadata.value.presentation?.historySectionSlug || 'history-and-background-of-itsco', 'mission', 'vision', 'goals', 'values'].includes(selected.value?.slug));
const parentTitle = computed(() => sections.value.find(s => s.slug === selected.value?.parent_slug)?.title);
const children = computed(() => sections.value.filter(s => s.parent_slug === selected.value?.slug));
const updatesFor = slug => props.updates.filter(e => e.handbook_section_slug === slug || e.policy_section_slugs?.includes(slug) || e.related_section_slugs?.includes(slug));
const sectionUpdates = computed(() => updatesFor(selected.value?.slug));
const sourceUrl = computed(() => props.canOpenOriginal && /^https?:\/\//i.test(props.fullHandbookUrl) ? props.fullHandbookUrl : '');
const documentRoute = inject(routeLocationKey, null);
const safeHtml = value => {
  const prefix = documentRoute?.params?.organizationSlug ? `/${encodeURIComponent(documentRoute.params.organizationSlug)}` : '';
  return DOMPurify.sanitize(String(value || '').replace(/href="\/(outcome-measures|library)(?=[?"])/g, (_, path) => `href="${prefix}/${path}`));
};
function safeChanged(value) {
  const raw = String(value || '');
  return raw.includes('<') ? safeHtml(raw) : `<p>${raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
}
const filtered = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  if (!term) return sections.value;
  return sections.value.filter(s => {
    const changes = updatesFor(s.slug).map(e => `${e.subject} ${e.rationale || ''} ${e.changed_content || ''}`).join(' ');
    return `${s.title} ${s.body_html || ''} ${changes}`.replace(/<[^>]*>/g, ' ').toLocaleLowerCase().includes(term);
  });
});
async function selectSection(slug, focus = false) {
  if (!sections.value.some(s => s.slug === slug)) return;
  selectedSlug.value = slug;
  if (focus) window.history.replaceState(window.history.state, '', `#${anchorPrefix.value}-${slug}`);
  if (focus) {
    await nextTick();
    article.value?.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    article.value?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}
function followPolicyLink(event) {
  const href = event.target.closest?.('a')?.getAttribute('href') || '';
  if (href.startsWith('/workplace-handbook')) { event.preventDefault(); emit('handbook-link', href.split('#')[1] || ''); return; }
  if (!href.startsWith(`#${anchorPrefix.value}-`)) return;
  const slug = href.slice(anchorPrefix.value.length + 2);
  if (!sections.value.some(s => s.slug === slug)) return;
  event.preventDefault(); selectSection(slug, true);
}
function readHash() {
  const slug = window.location.hash.startsWith(`#${anchorPrefix.value}-`) ? window.location.hash.slice(anchorPrefix.value.length + 2) : '';
  if (sections.value.some(s => s.slug === slug)) selectSection(slug);
}
watch(sections, () => { if (!sections.value.some(s => s.slug === selectedSlug.value)) selectedSlug.value = firstReady.value?.slug || sections.value[0]?.slug || ''; readHash(); }, { immediate: true });
watch(selectedSlug, slug => emit('section-change', slug), { immediate: true });
onMounted(() => window.addEventListener('hashchange', readHash));
onBeforeUnmount(() => window.removeEventListener('hashchange', readHash));
defineExpose({ selectSection, showAssistant: () => assistant.value?.show() });
</script>

<style scoped>
.reader-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; background:#f8f9f3; border-bottom:1px solid var(--line); color:var(--ink); }
.reader-toolbar button { font:inherit; border:1px solid var(--ink); color:var(--ink); background:white; padding:10px 14px; border-radius:8px; cursor:pointer; }
.handbook-book.reader-expanded { position:fixed; inset:0; z-index:10000; border-radius:0; overflow:auto; }
.reader-expanded .reader-toolbar { position:sticky; top:0; z-index:5; }

.reading-disclosure{font-size:11px;padding:10px 16px;color:#596b60}.reading-feedback{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:24px 0;font-size:12px}.reading-feedback button{padding:8px 12px;border:1px solid #bbcbbb;background:white;border-radius:6px;cursor:pointer}

.handbook-print-notice { display: none; }
@media print { .handbook-screen-only > * { display: none !important; }.handbook-screen-only > .handbook-print-notice { display: block !important; padding: 24px; color: black; background: white; }.handbook-screen-only { border: 0 !important; } }
.handbook-book { --handbook-font: var(--font-ptco); font-family: var(--handbook-font); --ink: #12583f; --muted: #637267; --line: #dce3d6; color: #233c2c; background: #f8f9f3; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
.book-cover { display: flex; gap: clamp(24px, 4vw, 64px); align-items: center; padding: clamp(22px, 4vw, 48px); background: radial-gradient(ellipse at 90% 5%, #edf2a7, transparent 70%), #e7edc8; }
.care-orientation-banner { display:flex; flex-wrap:wrap; align-items:center; gap:12px 24px; padding:22px clamp(22px,4vw,48px); background:#f0f5ef; border-bottom:1px solid var(--line); font-size:13px; line-height:1.8; }
.care-orientation-banner p { flex:1; min-width:min(100%,260px); margin:0; }
.care-orientation-banner button { font:inherit; padding:10px 14px; border:1px solid #b7c9bd; border-radius:6px; color:#234b39; background:white; cursor:pointer; }
.cover-art { width: clamp(150px, 25%, 235px); height: auto; border-radius: 3px; box-shadow: 8px 12px 0 #155c4018, 0 14px 28px #183b2522; }
.cover-copy { flex: 1; min-width: 0; }
.cover-logo { display: block; width: 200px; max-width: 65%; height: auto; margin-bottom: 26px; }
.itsco-foundations { --handbook-font: var(--font-itsco); }
.nlu-foundations { --handbook-font: var(--font-nlu); --ink: #243358; --muted: #536b77; --line: #d7e4e6; color: #283c4b; background: #f4f8f8; }
.nlu-foundations .book-cover { position: relative; isolation: isolate; background: #eaf4f2; }
.nlu-foundations .book-cover::after { content: ''; position: absolute; z-index: -1; inset: 0 0 0 48%; background: linear-gradient(90deg, #eaf4f2 0%, #eaf4f230 70%), url('/assets/handbooks/colorado-pikes-peak.jpg') center / cover; opacity: .8; }
.nlu-foundations .cover-description { color: #314b5b; }
.nlu-foundations .book-page { background: #fffefa; }
.nlu-foundations .page-rule { background: #6bbdb1; }
.nlu-foundations :deep(.foundation-content) { --foundation-green: #243358; --foundation-aqua: #def2ef; --foundation-lime: #eeeacf; }
.nlu-foundations :deep(.founder-portrait) { background: #e5efef; }
.nlu-foundations :deep(.founder-initials) { background: #d0e4e6; }
.nlu-foundations :deep(.purpose-heading),.nlu-foundations :deep(.purpose-signature) { color: #c5eee7; }
.nlu-foundations :deep(.foundation-vision .purpose-heading),.nlu-foundations :deep(.foundation-vision .purpose-signature) { color: #24535d; }
.nlu-foundations :deep(.story-body p:first-child) { color: #243358; border-color: #6bbdb1; }
.nlu-foundations :deep(.value-card) { background: #edf1f7; border-color: #d8e1ef; }
.nlu-foundations :deep(.value-card:nth-child(3n + 2)) { background: #e2f2ef; border-color: #d1e6e2; }
.nlu-foundations :deep(.value-card:nth-child(3n)) { background: #f3f1e3; border-color: #e7e3ce; }
.nlu-foundations :deep(.value-card:last-child:nth-child(odd)) { background: #243358; border-color: #243358; }
.isi-foundations { --handbook-font: var(--font-isi); --ink: #0b1f3a; --muted: #536574; --line: #dce3db; background: #f7f8f3; }
.isi-foundations .book-cover { background: radial-gradient(ellipse at 100% 0, #e1ece4, transparent 75%), #f7f8fa; font-family: var(--handbook-font, var(--font-ptco)); }
.isi-foundations .cover-copy h2 { font-family: inherit; color: #0b1f3a; }
.company-foundations { --ink: #223a50; }
.company-foundations .book-cover { background: #eef2f3; }
.company-foundations .book-page { background: white; }
.isi-foundations .cover-logo { width: 64px; margin-bottom: 18px; }
.isi-foundations .book-page { background: #fffefa; }
.isi-foundations .page-rule { background: #2f6b3a; }
.isi-foundations :deep(.foundation-content) { --foundation-green: #0b1f3a; --foundation-aqua: #e5efdf; --foundation-lime: #e9e7cb; }
.isi-foundations :deep(.purpose-heading), .isi-foundations :deep(.purpose-signature) { color: #d3e7cc; }
.isi-foundations :deep(.foundation-vision .purpose-heading), .isi-foundations :deep(.foundation-vision .purpose-signature) { color: #244e31; }
.isi-foundations :deep(.foundation-vision .purpose-panel) { background: #e5eddf; color: #193e2a; }
.isi-foundations :deep(.story-body p:first-child) { color: #173a36; border-color: #2f6b3a; }
.isi-foundations :deep(.value-card) { background: #edf1e8; border-color: #dce5d5; }
.isi-foundations :deep(.value-card:nth-child(3n + 2)) { background: #eaf0f5; border-color: #d6e2ec; }
.isi-foundations :deep(.value-card:nth-child(3n)) { background: #f5f1e5; border-color: #e7e0cd; }
.isi-foundations :deep(.value-card:last-child:nth-child(odd)) { background: #0b1f3a; border-color: #0b1f3a; }
@media(max-width:600px) { .nlu-foundations .book-cover::after { inset: 0; opacity: .2; }.nlu-foundations .cover-logo { width: 130px; margin-bottom: 16px; } }
.eyebrow { font-size: 10px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; color: var(--ink); }
.cover-copy h2 { font-size: clamp(32px, 4.5vw, 66px); line-height: 1.05; letter-spacing: -.045em; margin: 18px 0; font-weight: 750; color: var(--ink); }
.cover-copy h2 span { font-family: var(--handbook-font, var(--font-ptco)); font-weight: 650; font-style: normal; }
.cover-description { color: #425e43; font-size: 15px; line-height: 1.7; margin: 0 0 20px; }
.cover-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.cover-meta span { border: 1px solid #12583f28; border-radius: 20px; padding: 5px 10px; font-size: 11px; }
.book-primary { display: inline-flex; gap: 24px; background: var(--ink); color: #fff; border: 0; border-radius: 6px; padding: 12px 18px; cursor: pointer; font: inherit; font-size: 13px; }
.transfer-note { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0; padding: 14px 24px; font-size: 12px; line-height: 1.7; color: #596547; background: #f4f2d8; border-bottom: 1px solid var(--line); }
.transfer-note a,.pending-section a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.book-layout { display: grid; grid-template-columns: minmax(230px, 29%) minmax(0, 1fr); }
.book-outline { padding: 25px 18px; border-right: 1px solid var(--line); background: #f2f5ed; min-width: 0; }
.outline-heading { display: grid; gap: 6px; padding: 0 7px 17px; }.outline-heading strong { font: 27px var(--handbook-font, var(--font-ptco)); color: var(--ink); }
.book-search { display: flex; align-items: center; gap: 8px; padding: 10px; background: white; border: 1px solid #d6dece; border-radius: 6px; }
.book-search input { background: transparent; border: 0; width: 100%; font: inherit; font-size: 12px; color: #233c2c; min-width: 0; }.book-search input:focus { outline: none; }.book-search:focus-within { outline: 2px solid var(--ink); }
.search-count { font-size: 10px; color: var(--muted); padding-left: 7px; margin: 12px 0; }
.outline-scroll { contain: size; flex: 1 1 0px; min-height: 280px; height: 0; overflow: auto; scrollbar-width: thin; }
.book-outline { display: flex; flex-direction: column; min-height: 560px; }
.outline-link { display: grid; gap: 5px; padding: 12px 10px; border-radius: 5px; color: #354c39; text-decoration: none; border-left: 3px solid transparent; }
.outline-link.child { padding-left: 23px; }.outline-title { font-size: 11px; line-height: 1.6; font-weight: 650; }.outline-status { font-size: 10px; color: #6a7867; }.outline-link.active { background: #e0e9d7; border-left-color: var(--ink); color: var(--ink); }.outline-link:hover { background: #e7eddf; }
.book-page { padding: clamp(24px, 4vw, 56px); background: #fffef8; min-width: 0; scroll-margin-top: 25px; }.book-page:focus { outline: none; }.book-page:focus-visible { outline: 2px solid var(--ink); outline-offset: -3px; }
.page-topline { display: flex; gap: 14px; justify-content: space-between; font-size: 10px; color: #78806b; line-height: 1.6; padding-bottom: 32px; overflow-wrap: anywhere; }.page-topline span + span { flex-shrink: 0; }
.section-eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .16em; color: #738363; }.book-page h3 { font-size: clamp(23px, 2.6vw, 36px); line-height: 1.24; letter-spacing: -.025em; margin: 12px 0 23px; color: var(--ink); overflow-wrap: anywhere; }.page-rule { width: 50px; height: 3px; background: #bfcc65; margin-bottom: 28px; }
.handbook-prose { font-size: 15px; line-height: 1.95; color: #3c493a; overflow-wrap: anywhere; }.handbook-prose :deep(p) { margin: 0 0 22px; }.handbook-prose :deep(table) { display: block; max-width: 100%; overflow: auto; border-collapse: collapse; }.handbook-prose :deep(td),.handbook-prose :deep(th) { padding: 8px; border: 1px solid var(--line); }.handbook-prose :deep(img) { max-width: 100%; }
.handbook-prose :deep(h4),.handbook-prose :deep(h5),.handbook-prose :deep(h6) { color: var(--ink); line-height: 1.45; margin: 30px 0 14px; }.handbook-prose :deep(h4) { font-size: 21px; }.handbook-prose :deep(h5) { font-size: 17px; }.handbook-prose :deep(h6) { font-size: 15px; }.handbook-prose :deep(ul),.handbook-prose :deep(ol) { padding-left: 24px; margin: 0 0 22px; }.handbook-prose :deep(li) { padding-left: 4px; margin-bottom: 10px; }
.handbook-prose :deep(table) { overflow-wrap: normal; }.handbook-prose :deep(th),.handbook-prose :deep(td) { vertical-align: top; text-align: left; }
.foundation-page > h3 { font-size: 15px; font-family: var(--handbook-font, var(--font-ptco)); font-weight: 600; letter-spacing: .04em; line-height: 1.5; }
.foundation-page > .page-rule { margin-bottom: 22px; }
.chapter-introduction { font: 21px/1.6 var(--handbook-font, var(--font-ptco)); color: #536b4d; margin: 0; }
.artwork-credits { border-top: 1px solid var(--line); padding: 18px 24px; font-size: 11px; line-height: 1.8; color: #637267; background: #f2f5ed; }
.artwork-credits summary { cursor: pointer; width: fit-content; color: var(--ink); }.artwork-credits ul { padding-left: 18px; }.artwork-credits a { color: var(--ink); text-underline-offset: 3px; }.artwork-credits p { max-width: 760px; }
.handbook-prose :deep(a) { color: #175e47; text-decoration-color: #83a890; text-underline-offset: 3px; }
.handbook-prose :deep(blockquote) { margin: 22px 0; padding: 20px 24px; background: #edf4e7; border-left: 3px solid #729352; border-radius: 0 8px 8px 0; }
.handbook-prose :deep(blockquote p:last-child) { margin-bottom: 0; }
.pending-section { padding: 22px; background: #f3f5eb; border: 1px dashed #cdd7c0; border-radius: 8px; line-height: 1.8; font-size: 14px; }.pending-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #657351; }.pending-section p { margin: 10px 0; }
.chapter-sections { margin-top: 32px; }.chapter-sections h4 { font: 20px var(--handbook-font, var(--font-ptco)); }.chapter-sections button { display: flex; width: 100%; justify-content: space-between; gap: 12px; text-align: left; padding: 13px 0; background: none; border: 0; border-bottom: 1px solid var(--line); font: inherit; font-size: 12px; color: var(--ink); cursor: pointer; }
.section-updates { margin-top: 30px; padding: 20px; background: #edf2e5; border-left: 3px solid #86a368; }.section-updates h4 { margin: 8px 0; }.section-updates>p { font-size: 12px; }.section-update { border-top: 1px solid #cfdbc2; padding-top: 18px; margin-top: 18px; font-size: 13px; }.section-update .handbook-prose { font-size: 13px; }
.update-status { display: block; margin-bottom: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7141; }
.page-navigation { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid var(--line); padding-top: 22px; margin-top: 45px; }.page-navigation button { color: var(--ink); border: 0; background: none; cursor: pointer; font-size: 11px; padding: 8px 0; }.page-navigation span { font-size: 10px; color: var(--muted); }.page-navigation button:disabled { opacity: .4; cursor: default; }
.no-results { font-size: 13px; padding: 10px; }.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
button:focus-visible,a:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
@media (max-width: 720px) { .book-cover { gap: 22px; padding: 22px; }.cover-art { width: 32%; }.cover-copy h2 { font-size: 32px; }.cover-description { font-size: 12px; }.cover-copy>.eyebrow { font-size: 8px; }.cover-meta { gap: 4px; }.cover-meta span { font-size: 9px; }.book-layout { grid-template-columns: 1fr; }.book-outline { border-right: 0; border-bottom: 1px solid var(--line); }.outline-scroll { flex: none; height: 230px; min-height: 0; max-height: 230px; }.book-outline { min-height: 0; }.book-page { padding: 25px; }.page-topline { padding-bottom: 20px; }.handbook-prose { font-size: 14px; }.transfer-note { padding: 12px 20px; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
@media (max-width: 450px) { .book-cover { padding: 18px; gap: 16px; }.cover-art { width: 30%; }.cover-copy h2 { font-size: 28px; }.cover-description { font-size: 11px; }.book-primary { font-size: 11px; padding: 10px 12px; gap: 15px; } }
.handbook-book :is(h1,h2,h3,h4,h5,h6,button,input,select,textarea) { font-family: var(--handbook-font); }
.handbook-prose :deep(h1), .handbook-prose :deep(h2), .handbook-prose :deep(h3), .handbook-prose :deep(h4), .handbook-prose :deep(h5), .handbook-prose :deep(h6) { font-family: var(--handbook-font); }
</style>
