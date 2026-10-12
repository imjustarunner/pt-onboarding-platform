<template>
  <main class="my-learning">
    <LearningLibraryHeader />
    <div class="learning-toolbar">
      <nav class="learning-tabs" aria-label="Your learning sections">
        <button v-for="item in tabs.filter(t => t.id !== 'onboarding')" :key="item.id" :aria-pressed="activeTab === item.id" @click="activeTab = item.id">{{ item.label }}</button>
      </nav>
      <button class="onboarding-link" :aria-pressed="activeTab === 'onboarding'" @click="activeTab = 'onboarding'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5H5v16h14V5h-3M8 3h8v4H8zM8 12h8M8 16h5"/></svg>My Onboarding Package <span aria-hidden="true">→</span></button>
    </div>
    <section class="learning-content" :aria-label="tabs.find(t => t.id === activeTab)?.label">
      <header class="section-heading">
        <div><h2>{{ sectionTitles[activeTab] }}</h2><p>{{ sectionDescriptions[activeTab] }}</p></div>
        <label class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><span class="sr-only">Search training</span><input v-model="searchQuery" type="search" placeholder="Search training…" /></label>
      </header>
      <p v-if="loading" class="load-status" role="status">Loading your learning…</p><p v-if="error" class="load-error" role="alert">{{ error }} <button @click="load">Retry</button></p>
      <template v-if="activeTab === 'assigned'">
        <div class="learning-summary" aria-label="Your training overview">
          <div class="summary-item"><span class="summary-icon summary-icon--assigned" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 5H5v16h14V5h-3M8 3h8v4H8zM8 12h8M8 16h5"/></svg></span><div><strong>{{ outstandingCount }}</strong><span>Assigned to finish</span></div></div>
          <div class="summary-item"><span class="summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9 5 10 7-10 7z"/></svg></span><div><strong>{{ inProgressCount }}</strong><span>In progress</span></div></div>
          <button class="summary-item summary-item--completed" @click="activeTab = 'completed'"><span class="summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m5 12 4 4L19 6"/></svg></span><div><strong>{{ completedCount }}</strong><span>Completed activities</span></div><span class="summary-arrow" aria-hidden="true">→</span></button>
        </div>
        <section class="assigned-learning"><h3 class="section-label">Your assigned training</h3><TrainingFocusTab :key="agencyId" :search="searchQuery" /></section>
      </template>
      <OnboardingChecklistView v-if="activeTab === 'onboarding'" />
      <DocumentLearningCatalog :key="activeTab" :hide-empty="activeTab === 'assigned'" :search="searchQuery" :mode="activeTab" @progress="guideProgress = $event" @catalog="guideCourses = $event" />
      <template v-if="activeTab === 'assigned'">
        <section v-if="suggestions.length" class="on-demand-preview" aria-label="Explore on-demand training">
          <header class="section-heading"><div><h3>Explore on-demand</h3><p>Build a skill or revisit something useful.</p></div><div class="browse-actions"><template v-if="suggestions.length > 3"><button class="icon-button" @click="rotateSuggestions(-1)" aria-label="Previous training suggestions">←</button><button class="icon-button" @click="rotateSuggestions(1)" aria-label="Next training suggestions">→</button></template><button class="text-button" @click="searchQuery = ''; activeTab = 'on-demand'">Browse all →</button></div></header>
          <div class="course-grid"><article v-for="(item, index) in featuredSuggestions" :key="item.key" class="course-card suggestion-card" :class="`course-accent-${index % 3}`"><div class="course-topline"><span class="course-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14"/></svg></span><span class="course-status">{{ item.beta ? 'Beta guide' : item.type === 'focus' ? 'Learning path' : 'On-demand' }}</span></div><h3>{{ item.title }}</h3><p>{{ item.description }}</p><div class="course-footer"><span v-if="item.readingCount">{{ item.readingCount }} sections</span><span v-else-if="item.estimatedMinutes">{{ item.estimatedMinutes }} min</span><button @click="previewSuggestion(item)">Explore <span aria-hidden="true">→</span></button></div></article></div>
        </section>
        <section v-if="recentCompletions.length" class="recent-completions"><header class="section-heading"><h3>Recently completed</h3><button class="text-button" @click="activeTab = 'completed'">View history →</button></header><button v-for="item in recentCompletions" :key="item.key" class="completion-row" @click="activeTab = 'completed'"><span class="completion-check" aria-hidden="true">✓</span><span>{{ item.title }}</span><time v-if="item.completedAt">{{ formatDate(item.completedAt) }}</time><span aria-hidden="true">↗</span></button></section>
      </template>
      <template v-if="activeTab === 'on-demand' || activeTab === 'completed'">
        <section class="additional-courses"><h3>{{ activeTab === 'completed' ? 'Completed courses' : 'Courses & learning paths' }}</h3>
          <div class="course-grid"><article v-for="course in visibleCourses" :key="course.key" class="course-card">
            <div class="course-topline"><span class="course-status" :class="{ 'status-complete': course.status === 'completed' }">{{ statusLabel(course.status) }}</span><span v-if="course.estimatedMinutes" class="course-duration">{{ course.estimatedMinutes }} min</span></div><h3>{{ course.title }}</h3><p>{{ course.description }}</p>
            <div v-if="course.progress > 0" class="course-progress"><progress :value="course.progress" max="100" :aria-label="`${course.title} progress`"/><span>{{ course.progress }}%</span></div>
            <div class="course-footer"><span v-if="course.lessonsTotal">{{ course.lessonsTotal }} {{ course.type === 'focus' ? 'steps' : 'sections' }}</span><button @click="openCourse(course)">{{ course.status === 'completed' ? 'Review' : course.status === 'in_progress' ? 'Continue' : 'Start course' }} <span aria-hidden="true">→</span></button></div>
          </article></div>
          <p v-if="!loading && !visibleCourses.length" class="empty-courses">{{ activeTab === 'completed' ? 'Your completed courses will appear here.' : 'No additional courses match your search. You can practice with the guides above.' }}</p>
        </section>
        <section v-if="activeTab === 'completed' && certificates.length" class="certificates"><h3>Certificates earned</h3><p v-for="certificate in certificates" :key="certificate.id">{{ certificate.module_title || certificate.moduleTitle || certificate.title || certificate.training_focus_name || 'Training certificate' }} · {{ formatDate(certificate.issued_at || certificate.created_at) }}</p></section>
      </template>
    </section>
  </main>
</template>
<script setup>
import LearningLibraryHeader from '../components/library/LearningLibraryHeader.vue';
import OnboardingChecklistView from './OnboardingChecklistView.vue';
import TrainingFocusTab from '../components/dashboard/TrainingFocusTab.vue';
import DocumentLearningCatalog from '../components/training/DocumentLearningCatalog.vue';
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const agencyId = computed(() => {
  const slug = route.params.organizationSlug;
  return [agencyStore.currentAgency, ...(agencyStore.userAgencies || [])].find(a => a && (!slug || [a.slug, a.portal_url].includes(slug)))?.id;
});
const scoped = item => !agencyId.value || !(item.agencyId || item.agency_id) || Number(item.agencyId || item.agency_id) === Number(agencyId.value);

const guideProgress = ref({ total: 0, completed: 0 });
const guideCourses = ref([]), suggestionOffset = ref(0);
const suggestions = computed(() => [
  ...guideCourses.value.filter(c => ['ready', 'beta'].includes(c.status)).map(c => ({ ...c, beta: c.status === 'beta', guide: true })),
  ...allCourses.value.filter(c => c.source !== 'assigned')
].filter(c => `${c.title} ${c.description || ''}`.toLowerCase().includes(searchQuery.value.trim().toLowerCase())));
const featuredSuggestions = computed(() => Array.from({ length: Math.min(3, suggestions.value.length) }, (_, i) => suggestions.value[(suggestionOffset.value + i) % suggestions.value.length]));
function rotateSuggestions(direction) { if (suggestions.value.length) suggestionOffset.value = (suggestionOffset.value + direction * 3 + suggestions.value.length) % suggestions.value.length; }
function previewSuggestion(item) { if (item.guide) { searchQuery.value = item.title; activeTab.value = 'on-demand'; } else openCourse(item); }
const recentCompletions = computed(() => [
  ...guideCourses.value.flatMap(c => (c.enrollments || []).filter(e => e.status === 'completed').map(e => ({ key: `guide-${e.id}`, title: c.title, completedAt: e.completed_at }))),
  ...completedCourses.value
].sort((a, b) => (Date.parse(b.completedAt) || 0) - (Date.parse(a.completedAt) || 0)).slice(0, 3));
const loading = ref(true);
const error = ref('');
const searchQuery = ref('');
const sectionIds = ['assigned', 'onboarding', 'on-demand', 'completed'];
const activeTab = computed({ get: () => sectionIds.includes(route.query.learning) ? route.query.learning : 'assigned', set: value => router.replace({ query: { ...route.query, learning: value } }) });
const sortBy = ref('recent');
const categoryFilter = ref('');
const typeFilter = ref('');
const modules = ref([]);
const agencyFocuses = ref([]);
const assignedFocuses = ref([]);
const progressRows = ref([]);
const certificates = ref([]);
const trainingTasks = ref([]);

const tabs = [
  { id: 'assigned', label: 'My Training' },
  { id: 'onboarding', label: 'My Onboarding Package' },
  { id: 'on-demand', label: 'On-Demand' },
  { id: 'completed', label: 'Completed' }
];
const sectionTitles = { assigned: 'Your learning, all together.', onboarding: 'My Onboarding Package', 'on-demand': 'Discover your next skill', completed: 'Your learning history' };
const sectionDescriptions = {
  assigned: 'Continue your training or find something new to learn.',
  onboarding: 'Your onboarding checklist, documents and required learning.',
  'on-demand': 'Explore available courses and practice with your company guides.',
  completed: 'Review your completed courses, guide training and certificates.'
};
const visibleCourses = computed(() => filteredSorted(allCourses.value.filter(c => activeTab.value === 'completed' ? c.status === 'completed' : activeTab.value === 'on-demand' && c.source !== 'assigned')));
const rows = (value, key) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
const progressMap = computed(() => {
  const map = new Map();
  for (const p of progressRows.value) {
    map.set(Number(p.module_id), p);
  }
  return map;
});

const dueByModule = computed(() => {
  const map = new Map();
  const now = Date.now();
  for (const t of trainingTasks.value) {
    if (!t.due_date || ['completed', 'overridden'].includes(t.status)) continue;
    const mid = Number(t.reference_id);
    if (!mid) continue;
    const due = new Date(t.due_date).getTime();
    map.set(mid, {
      dueDate: t.due_date,
      isOverdue: due < now,
      taskId: t.id
    });
  }
  return map;
});

function moduleProgress(moduleId) {
  const p = progressMap.value.get(Number(moduleId));
  if (!p) return 0;
  if (p.status === 'completed') return 100;
  const measured = Number(p.progress_percentage ?? p.completion_percentage ?? p.completionPercent);
  return Number.isFinite(measured) ? Math.max(0, Math.min(100, measured)) : 0;
}

function normalizeModule(m, source = 'on_demand') {
  const id = m.module_id || m.id;
  const progress = moduleProgress(id);
  const due = dueByModule.value.get(Number(id));
  return {
    key: `${source}-m-${id}`,
    type: 'module',
    id,
    title: m.module_title || m.title,
    description: m.module_description || m.description,
    estimatedMinutes: m.estimated_time_minutes,
    progress,
    lessonsTotal: m.contentCount || m.content_count || null,
    lessonsDone: progress === 100 ? (m.contentCount || 1) : progress > 0 ? 1 : 0,
    minutesLeft: m.estimated_time_minutes && progress < 100
      ? Math.max(1, Math.round(m.estimated_time_minutes * (1 - progress / 100)))
      : null,
    source,
    dueDate: due?.dueDate || null,
    isOverdue: !!(due?.isOverdue && progress < 100),
    status: progress >= 100 ? 'completed' : progress > 0 || progressMap.value.get(Number(id))?.status === 'in_progress' ? 'in_progress' : 'not_started',
    completedAt: progressMap.value.get(Number(id))?.completed_at || null
  };
}

function normalizeFocus(f, source = 'agency_focus') {
  const id = f.training_focus_id || f.id || f.track_id;
  const modulesIn = f.modules || [];
  const done = modulesIn.filter((mod) => moduleProgress(mod.id || mod.module_id) >= 100).length;
  const total = modulesIn.length || f.module_count || 0;
  const progress = (f.progress_percentage ?? f.completionPercent) != null
    ? Number(f.progress_percentage ?? f.completionPercent)
    : (total ? Math.round((done / total) * 100) : 0);
  const dueDates = modulesIn
    .map((mod) => dueByModule.value.get(Number(mod.id || mod.module_id)))
    .filter((d) => d?.isOverdue);
  return {
    key: `${source}-f-${id}`,
    type: 'focus',
    id,
    title: f.training_focus_name || f.name || f.title,
    description: f.training_focus_description || f.description,
    progress,
    lessonsTotal: total,
    lessonsDone: done,
    modules: modulesIn,
    source,
    dueDate: dueDates[0]?.dueDate || null,
    isOverdue: dueDates.length > 0 && progress < 100,
    status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started',
    completedAt: f.completed_at || f.completedAt || null,
    estimatedMinutes: modulesIn.reduce((s, m) => s + (Number(m.estimated_time_minutes) || 0), 0) || null
  };
}

const allCourses = computed(() => {
  const list = [];
  for (const f of assignedFocuses.value) list.push(normalizeFocus(f, 'assigned'));
  const pathModuleIds = new Set(assignedFocuses.value.flatMap(f => (f.modules || []).map(m => Number(m.id || m.module_id))));
  for (const t of trainingTasks.value.filter(t => t.reference_id && !pathModuleIds.has(Number(t.reference_id)) && (!t.reference_type || t.reference_type === 'module'))) list.push(normalizeModule({ id: t.reference_id, title: t.title, description: t.description }, 'assigned'));
  for (const f of agencyFocuses.value) list.push(normalizeFocus(f, 'agency_focus'));
  for (const m of modules.value) list.push(normalizeModule(m));
  const seen = new Set();
  return list.filter((c) => {
    const k = `${c.type}-${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
});

const completedCourses = computed(() => allCourses.value.filter((c) => c.status === 'completed'));
const completedCount = computed(() => completedCourses.value.length + guideProgress.value.completed);
const guideRecords = computed(() => guideCourses.value.flatMap(course => course.enrollments || []));
const outstandingCount = computed(() => allCourses.value.filter(course => course.source === 'assigned' && course.status !== 'completed').length + guideRecords.value.filter(record => ['onboarding', 'assigned'].includes(record.purpose) && record.status !== 'completed').length);
const inProgressCount = computed(() => allCourses.value.filter(course => course.status === 'in_progress').length + guideRecords.value.filter(record => record.status === 'in_progress').length);
const statusLabel = status => ({ completed: 'Completed', in_progress: 'In progress', not_started: 'Ready to start' }[status] || status);
function matchesFilters(course) {
  const q = searchQuery.value.trim().toLowerCase();
  if (q && !`${course.title} ${course.description || ''}`.toLowerCase().includes(q)) return false;
  if (activeTab.value === 'on-demand' && course.source === 'assigned') return false;
  if (categoryFilter.value && course.source !== categoryFilter.value) return false;
  if (typeFilter.value && course.type !== typeFilter.value) return false;
  return true;
}

function filteredSorted(list) {
  let rows = list.filter(matchesFilters);
  if (sortBy.value === 'title') {
    rows = [...rows].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  } else if (sortBy.value === 'progress') {
    rows = [...rows].sort((a, b) => (b.progress || 0) - (a.progress || 0));
  }
  return rows;
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

async function openCourse(course) {
  const org = route.params.organizationSlug;
  if (course.type === 'module') {
    if (course.source === 'assigned') {
      router.push(org ? `/${org}/module/${course.id}` : `/module/${course.id}`);
      return;
    }
    router.push(
      org
        ? `/${org}/on-demand-training/modules/${course.id}`
        : `/on-demand-training/modules/${course.id}`
    );
    return;
  }
  let modulesIn = course.modules || [];
  if (!modulesIn.length && course.id) {
    try {
      const stepsRes = await api.get(`/training-focuses/${course.id}/steps`);
      modulesIn = (stepsRes.data?.steps || [])
        .filter((s) => (s.stepType || s.step_type) === 'module')
        .map((s) => ({
          id: s.referenceId || s.reference_id,
          title: s.title
        }));
    } catch {
      modulesIn = [];
    }
  }
  const target =
    modulesIn.find((m) => moduleProgress(m.id || m.module_id) < 100)
    || modulesIn[0];
  const mid = target?.id || target?.module_id;
  if (!mid) {
    alert('This course has no lessons yet.');
    return;
  }
  if (course.source === 'assigned') {
    router.push({
      path: org ? `/${org}/module/${mid}` : `/module/${mid}`,
      query: { focusId: course.id }
    });
    return;
  }
  router.push(org ? `/${org}/on-demand-training/modules/${mid}` : `/on-demand-training/modules/${mid}`);
}

let loadSequence = 0;
async function load() {
  const request = ++loadSequence;
  loading.value = true;
  error.value = '';
  try {
    const userId = authStore.user?.id;
    const tasks = [
      api.get('/on-demand-training/modules', { params: { agencyId: agencyId.value } }).catch(() => ({ data: [], failed: true })),
      api.get('/on-demand-training/training-focuses', { params: { agencyId: agencyId.value } }).catch(() => ({ data: [], failed: true })),
      api.get('/progress').catch(() => ({ data: [], failed: true })),
      api.get('/certificates').catch(() => ({ data: [], failed: true })),
      api.get('/tasks', { params: { taskType: 'training' } }).catch(() => ({ data: [], failed: true })),
    ];
    if (userId) {
      tasks.push(api.get(`/users/${userId}/training-focuses`).catch(() => ({ data: [], failed: true })));
    }
    const [modRes, focusRes, progRes, certRes, taskRes, assignedRes] = await Promise.all(tasks);
    if (request !== loadSequence) return;
    if ([modRes, focusRes, progRes, certRes, taskRes, assignedRes].some(result => result?.failed)) error.value = 'Some training could not be loaded. Retry to refresh your records.';
    modules.value = rows(modRes.data, 'modules');
    agencyFocuses.value = rows(focusRes.data, 'focuses');
    progressRows.value = rows(progRes.data, 'progress');
    certificates.value = Array.isArray(certRes.data) ? certRes.data : (certRes.data?.certificates || []);
    trainingTasks.value = rows(taskRes.data, 'tasks').filter(scoped);
    assignedFocuses.value = rows(assignedRes?.data, 'focuses').filter(scoped);
  } catch (err) {
    if (request === loadSequence) error.value = err?.response?.data?.error?.message || 'Failed to load learning library';
  } finally {
    if (request === loadSequence) loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.organizationSlug, () => { modules.value = []; assignedFocuses.value = []; agencyFocuses.value = []; trainingTasks.value = []; guideCourses.value = []; load(); });
onBeforeUnmount(() => { loadSequence++; });
</script>

<style scoped>
.my-learning{width:100%;min-width:0;box-sizing:border-box;padding:8px clamp(16px,2.5vw,36px) 36px;font-family:'Plotline Inter',var(--font-ptco),sans-serif;color:#243c33;background:#fafbf9;--primary:#294f40;--learning-font:'Plotline Inter',var(--font-ptco);--font-header:'Plotline Sora',var(--font-ptco)}.my-learning button,.my-learning input{font-family:inherit}.learning-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #dce4df;margin-bottom:24px;min-height:62px}.learning-tabs{display:flex;align-self:stretch;gap:24px;min-width:0}.learning-tabs button{font-size:13px;font-weight:500;cursor:pointer;border:0;border-bottom:2px solid transparent;padding:16px 0;background:transparent;color:#66776d;white-space:nowrap}.learning-tabs [aria-pressed=true]{border-bottom-color:#234c3e;color:#173e30;font-weight:600}.onboarding-link{display:inline-flex;gap:7px;align-items:center;font-size:12px;color:#294f40;background:white;border:1px solid #cfdcd3;border-radius:7px;padding:9px 12px;min-height:38px;cursor:pointer;white-space:nowrap}.onboarding-link[aria-pressed=true]{background:#e7efe8}.onboarding-link svg{width:17px;height:17px;flex-shrink:0}.learning-content{min-width:0}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px;min-width:0}.section-heading h2{font:600 21px/1.4 'Plotline Sora',var(--font-ptco),sans-serif;color:#1d372d;letter-spacing:-.6px;margin:0}.section-heading h3,.additional-courses>h3,.certificates h3{font-size:16px;font-weight:600;line-height:1.4;margin:0 0 5px;color:#253f33}.section-heading p{font-size:13px;line-height:1.5;margin:5px 0 0;color:#6c7b70}.search-wrap{display:flex;align-items:center;gap:10px;flex:0 1 310px;min-width:180px;border:1px solid #d6dfd8;border-radius:8px;padding:0 13px;background:white;height:41px}.search-wrap svg{width:17px;height:17px;color:#697e70;flex-shrink:0}.search-wrap input{border:0;background:transparent;outline:none!important;width:100%;min-width:0;font-size:12px;padding:10px 0;color:#273f34}.search-wrap:focus-within{outline:2px solid #9cbdab;outline-offset:2px}.learning-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0 24px}.summary-item{display:flex;align-items:center;gap:14px;min-height:84px;padding:16px 20px;border:1px solid #dfe6df;background:#fff;border-radius:10px;text-align:left;color:inherit;box-sizing:border-box}.summary-item>div{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.summary-item strong{font-size:26px;font-weight:500;color:#214437;line-height:1}.summary-item>div>span{font-size:12px;color:#65786a}.summary-icon{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#e9f2eb;color:#346b48;flex-shrink:0}.summary-icon--assigned{background:#fbefe6;color:#bd7652}.summary-icon svg{width:22px;height:22px}.summary-item--completed{cursor:pointer}.summary-item--completed:hover{border-color:#96b9a2;background:#fcfdfa}.summary-arrow{margin-left:auto;color:#477b5b}.section-label{font-size:15px;font-weight:600;margin:0 0 10px;color:#284334}.assigned-learning{padding:18px 20px;background:white;border:1px solid #dfe6df;border-radius:10px;margin-bottom:20px}.on-demand-preview,.recent-completions,.additional-courses,.certificates{margin-top:26px}.browse-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}.text-button{border:0;background:transparent;color:#315846;cursor:pointer;font-size:12px;padding:9px 5px;white-space:nowrap}.icon-button{width:33px;height:33px;border:1px solid #d0ddd4;border-radius:7px;background:white;color:#42674d;font-size:16px;cursor:pointer}.course-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,275px),1fr));gap:15px}.on-demand-preview .course-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.course-card{display:flex;flex-direction:column;min-width:0;padding:18px 20px;background:white;border:1px solid #dfe6df;border-radius:10px;box-shadow:0 2px 4px #203e2f03}.suggestion-card{background:linear-gradient(150deg,#f2f7ef 0%,#fff 58%)}.course-accent-1{background:linear-gradient(150deg,#fbf0e9 0%,#fff 58%)}.course-accent-2{background:linear-gradient(150deg,#ecf3f7 0%,#fff 58%)}.course-topline{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:12px;min-height:28px}.course-symbol{width:32px;height:32px;border-radius:9px;background:#e3eedc;display:grid;place-items:center;color:#315f43}.course-accent-1 .course-symbol{background:#f8e2d4;color:#a76543}.course-accent-2 .course-symbol{background:#dfeef5;color:#41677c}.course-symbol svg{width:19px;height:19px}.course-status{font-size:10px;letter-spacing:.035em;font-weight:500;background:#f0f4ed;color:#4b6954;border-radius:20px;padding:5px 8px}.course-accent-1 .course-status{background:#f9eee8;color:#9a6448}.course-accent-2 .course-status{background:#eaf2f7;color:#497189}.course-card h3{font:600 15px/1.5 'Plotline Inter',var(--font-ptco),sans-serif;color:#233d30;margin:0 0 8px}.course-card>p{font-size:12px;line-height:1.7;color:#6b7c70;margin:0 0 16px}.course-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid #edf0eb}.course-footer>span,.course-duration{font-size:11px;color:#77867a}.course-footer button{display:inline-flex;align-items:center;gap:14px;justify-content:space-between;border:0;background:#edf3eb;color:#315540;border-radius:6px;padding:9px 12px;font-size:12px;font-weight:500;cursor:pointer;margin-left:auto}.course-footer button:hover{background:#ddeada}.course-progress{display:flex;align-items:center;gap:10px;margin:0 0 16px}.course-progress progress{width:100%;height:6px;accent-color:#49774f;border:0;border-radius:8px;overflow:hidden}.course-progress progress::-webkit-progress-bar{background:#e5eae4}.course-progress progress::-webkit-progress-value{background:#49774f;border-radius:8px}.course-progress span{font-size:11px;color:#6b7c70;white-space:nowrap}.recent-completions{padding:18px 20px;border:1px solid #dfe6df;border-radius:10px;background:white}.recent-completions .section-heading{margin-bottom:8px}.completion-row{display:flex;align-items:center;width:100%;gap:12px;padding:12px 0;border:0;border-top:1px solid #edf0eb;background:transparent;text-align:left;font-size:12px;color:#365443;cursor:pointer}.completion-check{background:#ebf4e8;color:#518556;border-radius:50%;width:22px;height:22px;display:grid;place-items:center;flex-shrink:0}.completion-row time{font-size:11px;color:#7b897f;margin-left:auto}.completion-row>span:last-child{margin-left:auto}.empty-courses{padding:20px;border:1px dashed #d9e1d8;border-radius:8px;color:#6b7b6e;font-size:13px}.additional-courses>h3{margin-bottom:14px}.certificates p{font-size:13px}.load-status,.load-error{font-size:13px;padding:12px;background:#eef3e9;border-radius:8px}.load-error{background:#fff2e8;color:#925632}.load-error button{margin-left:10px;background:transparent;border:0;text-decoration:underline;color:inherit;cursor:pointer}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.my-learning :deep(.container){max-width:none;width:100%;padding:0}.my-learning :deep(.guide-catalog){margin:20px 0;padding:0;background:transparent;border:0}.my-learning :deep(.guide-catalog>header){margin:0 0 16px}.my-learning :deep(.guide-catalog>header>.eyebrow){display:none}.my-learning :deep(.guide-catalog>header h2){font-size:16px;margin:0 0 5px;color:#253f33}.my-learning :deep(.guide-catalog>header p){font-size:12px;margin:4px 0;color:#72806f;line-height:1.6}.my-learning :deep(.guide-course-grid){gap:15px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))}.my-learning :deep(.guide-course-grid article){padding:18px 20px;border-color:#dfe6df;background:white;display:flex;flex-direction:column}.my-learning :deep(.guide-course-grid h3){font-size:15px;line-height:1.5;color:#233d30;margin:8px 0}.my-learning :deep(.guide-course-grid p){font-size:12px;line-height:1.65;margin:6px 0}.my-learning :deep(.guide-course-grid .eyebrow){font-size:9px!important;letter-spacing:.06em}.my-learning :deep(.guide-course-grid .availability){padding:8px 10px;font-size:11px;background:#fbf2e4;color:#87693b}.my-learning :deep(.guide-course-grid .practice-actions){margin-top:auto;padding-top:12px}.my-learning :deep(.guide-course-grid .practice-actions strong){font-size:11px}.my-learning :deep(.guide-course-grid .practice-actions p){font-size:11px;margin:5px 0 10px}.my-learning :deep(.guide-course-grid button){font-size:12px;padding:9px 12px;border:0;background:#edf3eb;color:#315540;line-height:1.4}.my-learning :deep(.training-focus-tab){font-family:inherit}.my-learning :deep(.training-focus-tab .empty-state){padding:4px 0;text-align:left;color:#748174;font-size:12px}.my-learning :deep(.training-focus-tab .focus-card){padding:18px;background:#fbfcf9;border-color:#e0e7df;box-shadow:none}.my-learning :deep(.training-focus-tab .sort-controls){font-size:12px;margin-bottom:12px}.my-learning :deep(.training-focus-tab .sort-select){font-size:12px;padding:7px 9px}.my-learning :deep(.training-focus-tab .focus-header h3){font-size:16px;color:#23402f}.my-learning :deep(.training-focus-tab .focus-description){font-size:12px;line-height:1.6}.my-learning :deep(.training-focus-tab .module-item){padding:10px 12px}.my-learning :deep(.training-focus-tab .module-title){font-size:13px}.my-learning :deep(.training-focus-tab .path-hint){font-size:12px}.my-learning :deep(.training-focus-tab .focus-meta){font-size:11px}button:focus-visible{outline:3px solid #b87961;outline-offset:3px}
@media(max-width:1000px){.summary-item{padding:15px 14px;gap:10px}.summary-item>div{display:block}.summary-item>div>span{display:block;font-size:11px;margin-top:5px}.learning-tabs{gap:18px}.course-card{padding:16px}.on-demand-preview .course-grid{gap:12px}.my-learning :deep(.guide-course-grid article){padding:16px}}
@media(max-width:700px){.my-learning{padding:8px 14px 28px}.learning-toolbar{align-items:stretch;flex-direction:column;gap:9px;padding:0 0 12px;margin-bottom:18px}.learning-tabs{min-height:50px;gap:24px}.onboarding-link{align-self:flex-start}.section-heading{align-items:flex-start;flex-wrap:wrap;gap:12px}.section-heading h2{font-size:19px}.search-wrap{flex-basis:100%;height:40px}.learning-summary{gap:8px;margin:16px 0 20px}.summary-item{padding:12px 8px;gap:8px;flex-direction:column;align-items:flex-start;min-height:118px}.summary-item strong{font-size:23px}.summary-icon{width:28px;height:28px}.summary-icon svg{width:17px;height:17px}.summary-item>div>span{font-size:10px}.summary-arrow{display:none}.assigned-learning{padding:15px}.on-demand-preview .course-grid{grid-template-columns:1fr}.course-grid{grid-template-columns:1fr}.browse-actions{margin-left:auto}.recent-completions{padding:15px}.completion-row{gap:8px}.completion-row time{display:none}.course-topline{margin-bottom:10px}.learning-tabs button{font-size:13px}.on-demand-preview,.recent-completions,.additional-courses{margin-top:22px}}
</style>
