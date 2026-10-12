<template>
  <section v-if="agency && (!hideEmpty || loading || error || courses.length)" :style="fontStyle" class="guide-catalog" aria-label="Guide learning">
    <Player v-if="selectedId" :key="`${agency}:${selectedId}`" :agency-id="agency" :learning-id="selectedId" :http="http" :api-base="apiBase" @close="selectedId = null; load()" @completed="completed" @handbook-link="$emit('handbook-link', $event)" />
    <template v-else>
      <header><p class="eyebrow">Plotline · Beta · Read · Ask · Practice</p><h2>{{ mode === 'onboarding' ? 'Onboarding guides' : mode === 'completed' ? 'Completed guide training' : mode === 'assigned' ? 'Assigned guide training' : mode === 'on-demand' ? 'Practice from your guides' : 'Learn from your company guides' }}</h2><p>{{ mode === 'on-demand' ? 'Optional review is always on your own time. Assigned training is available in My Learning.' : 'Your guides and learning progress stay together, wherever you open them.' }}</p></header>
      <p v-if="error" role="alert">{{ error }} <button @click="load">Retry</button></p><p v-if="loading" role="status">Loading guide training…</p>
      <div class="guide-course-grid"><article v-for="course in courses" :key="course.key">
        <p class="eyebrow">{{ course.key === 'service-documentation-standards' ? 'Clinical practice · Documentation' : course.key === 'facilitator-coding-protocol' ? 'Facilitator practice · Coding & records' : course.key === 'crisis-response-guide' ? 'Safety & response · Orientation' : course.key === 'facilities-guide' ? 'Operations · Shared facilities' : course.key === 'skill-development-guide' ? 'Skills & learning · Orientation' : course.key === 'counseling-guide' ? 'Care approaches · Orientation' : course.key === 'school-practice-guide' ? 'ITSCO · School practice' : 'Clinical practice' }}</p><h3>{{ course.title }}</h3><p>{{ course.description }}</p><p class="course-meta">{{ course.readingCount }} core sections · {{ course.questionCount }} questions · Read, search &amp; ask</p>
        <p v-if="!['ready', 'beta'].includes(course.status)" class="availability">{{ course.status === 'unpublished' ? 'Your company is preparing this guide for publication.' : 'Questions are being reviewed for the current guide edition.' }} Existing assignments keep their saved edition.</p>
        <p v-if="course.status === 'beta'" class="availability">Beta edition · Open for practice while the company edition is under review.</p>
        <template v-if="mode !== 'on-demand'">
          <p v-if="mode === 'onboarding' && course.onboardingRequired" class="pay-label">Required onboarding · Paid time</p>
          <button v-if="mode === 'onboarding' && course.onboardingRequired && !onboarding(course)" :disabled="busy || course.status !== 'ready'" @click="start(course, 'onboarding')">Start required training</button>
          <div v-for="record in assigned(course)" :key="record.id" class="record"><span>{{ record.purpose === 'onboarding' ? 'Onboarding' : record.purpose === 'practice' ? 'Optional practice' : 'Assigned by your supervisor / admin' }} · {{ record.status === 'completed' ? 'Completed' : 'Paid training' }}</span><button :disabled="busy" @click="selectedId = record.id">{{ record.status === 'completed' ? 'Review completion' : 'Continue assigned training' }}</button></div>
        </template>
        <div v-if="mode !== 'assigned' && mode !== 'completed' && mode !== 'onboarding'" class="practice-actions"><strong>Optional practice · Your own time</strong><p>No paid time or payroll claim. Required completion remains saved.</p><button v-if="practice(course)" :disabled="busy" @click="selectedId = practice(course).id">Continue optional practice</button><button v-else :disabled="busy || !['ready', 'beta'].includes(course.status)" @click="start(course, 'practice')">Start optional practice</button><small v-if="course.enrollments.some(r => r.purpose === 'practice' && r.status === 'completed')">Previous practice completion saved</small></div>
      </article></div>
    </template>
    <p v-if="!loading && !error && !selectedId && !courses.length">No guide training in this view. Browse on-demand to start learning.</p>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import Player from './DocumentLearningPlayer.vue';
const props = defineProps({ hideEmpty: Boolean, agencyId: [String, Number], mode: { type: String, default: 'all' }, documentKey: String, search: { type: String, default: '' }, http: { type: Object, default: () => api }, apiBase: { type: String, default: '/provider-update/document-learning' } });
const emit = defineEmits(['completed', 'handbook-link', 'count', 'progress', 'catalog']);
const route = useRoute(), store = useAgencyStore();
const agency = computed(() => {
  if (props.agencyId) return Number(props.agencyId);
  const slug = route.params.organizationSlug;
  if (slug) return [store.currentAgency, ...(store.userAgencies || [])].find(a => a && [a.slug, a.portal_url].includes(slug))?.id;
  return store.currentAgency?.id;
});
const fontStyle = { '--learning-font': 'var(--font-ptco)' };
const state = ref({ courses: [] }), error = ref(''), loading = ref(false), busy = ref(false), selectedId = ref(null);
let sequence = 0;
const requests = new Map();
const assigned = c => c.enrollments.filter(r => props.mode === 'completed' ? r.status === 'completed' : props.mode === 'onboarding' ? r.purpose === 'onboarding' : props.mode === 'assigned' ? r.purpose === 'assigned' : r.purpose !== 'practice');
const onboarding = c => c.enrollments.find(r => r.purpose === 'onboarding');
const practice = c => c.enrollments.find(r => r.purpose === 'practice' && r.status !== 'completed');
const courses = computed(() => (state.value.courses || []).filter(c => (!props.documentKey || c.key === props.documentKey) && (props.mode !== 'assigned' || assigned(c).length) && (props.mode !== 'onboarding' || c.onboardingRequired || assigned(c).length) && (props.mode !== 'completed' || c.enrollments.some(r => r.status === 'completed')) && (props.mode !== 'in_progress' || c.enrollments.some(r => r.status === 'in_progress')) && `${c.title} ${c.description}`.toLowerCase().includes(props.search.toLowerCase())));
async function load() {
  const current = ++sequence; error.value = ''; if (!agency.value) return; loading.value = true;
  try { const { data } = await props.http.get(props.apiBase, { params: { agencyId: agency.value } }); if (current === sequence) { state.value = data; emit('catalog', data.courses || []); const records = (data.courses || []).flatMap(c => c.enrollments); emit('progress', { total: records.length + (data.courses || []).filter(c => c.onboardingRequired && !onboarding(c)).length, completed: records.filter(r => r.status === 'completed').length }); emit('count', (data.courses || []).reduce((n, c) => n + assigned(c).filter(r => r.status !== 'completed').length + (c.onboardingRequired && !onboarding(c) ? 1 : 0), 0)); } }
  catch (e) { if (current === sequence) error.value = e.response?.data?.error?.message || 'Guide training could not be loaded.'; }
  finally { if (current === sequence) loading.value = false; }
}
async function start(course, purpose) {
  if (busy.value) return; busy.value = true; error.value = ''; const current = sequence, key = `${course.key}:${purpose}`;
  if (!requests.has(key)) requests.set(key, crypto.randomUUID());
  try { const { data } = await props.http.post(`${props.apiBase}/courses/${course.key}/start`, { agencyId: agency.value, purpose, expectedVersionId: course.version?.id, expectedBetaRevision: course.betaRevision, requestKey: requests.get(key) }); if (current === sequence) { selectedId.value = data.id; requests.delete(key); } }
  catch (e) { if (current === sequence) error.value = e.response?.data?.error?.message || 'Training could not be started. Please retry.'; }
  finally { if (current === sequence) busy.value = false; }
}
function completed() { load(); emit('completed'); }
watch(() => [agency.value, props.documentKey, props.apiBase], () => { selectedId.value = null; state.value = { courses: [] }; emit('count', 0); emit('progress', { total: 0, completed: 0 }); requests.clear(); busy.value = false; load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<style scoped>
.guide-catalog{font-family:var(--learning-font,var(--font-ptco));margin:24px 0;padding:clamp(16px,3vw,28px);background:#f6f8f1;border:1px solid #d9e2d2;border-radius:14px;color:#284336;min-width:0}.guide-catalog header{margin-bottom:22px}.eyebrow{font-size:10px!important;letter-spacing:.12em;text-transform:uppercase;color:#536956}.guide-catalog h2{font-size:23px;margin:8px 0;line-height:1.5}.guide-catalog h3{font-size:19px;line-height:1.6;margin:10px 0}.guide-catalog p{font-size:13px;line-height:1.8}.guide-course-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}.guide-course-grid article{padding:24px;background:#fffef9;border:1px solid #d5dfcc;border-radius:10px;min-width:0}.course-meta{color:#52674b}.record{display:flex;flex-direction:column;align-items:start;gap:10px;margin:18px 0;font-size:12px;line-height:1.8}.pay-label{font-weight:700}.practice-actions{border-top:1px solid #dde4d5;margin-top:20px;padding-top:20px;font-size:12px}.practice-actions small{display:block;margin-top:12px}.guide-catalog button{font:inherit;font-size:12px;padding:11px 15px;border:1px solid #b6cbb5;background:#e5efdc;color:#21482e;border-radius:7px;cursor:pointer;line-height:1.6}.guide-catalog button:disabled{opacity:.55;cursor:default}.availability{background:#fff1d5;padding:12px;border-radius:7px}.guide-catalog [role=alert]{color:#9b3328}button:focus-visible{outline:3px solid #386751;outline-offset:3px}
</style>
