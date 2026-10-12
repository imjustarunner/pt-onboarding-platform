<template>
  <main class="my-learning">
    <LearningLibraryHeader active="training" />
    <nav class="learning-tabs" aria-label="Your learning sections">
      <button v-for="item in tabs.filter(t => t.id !== 'onboarding')" :key="item.id" :aria-pressed="activeTab === item.id" @click="activeTab = item.id">{{ item.label }}</button>
    </nav>
    <section class="learning-content" :aria-label="tabs.find(t => t.id === activeTab)?.label">
      <header class="section-heading"><div><h2>{{ tabs.find(t => t.id === activeTab)?.label }} <span>Beta</span></h2><p>{{ sectionDescriptions[activeTab] }}</p></div>
        <label class="search-wrap"><span class="sr-only">Search training</span><input v-model="searchQuery" type="search" placeholder="Search training and guides…" /></label>
      </header>
      <p v-if="loading" role="status">Loading your learning…</p><p v-if="error" role="alert">{{ error }} <button @click="load">Retry</button></p>
      <div v-if="activeTab === 'assigned'" class="learning-summary"><p><strong>{{ completedCount }}</strong> completed training activities</p><button @click="activeTab = 'completed'">View all completed training →</button></div>
      <OnboardingChecklistView v-if="activeTab === 'onboarding'" />
      <template v-if="activeTab === 'assigned'">
        <button class="onboarding-link" @click="activeTab = 'onboarding'">My Onboarding Package →</button>
        <TrainingFocusTab :key="agencyId" />
      </template>
      <DocumentLearningCatalog :key="activeTab" :hide-empty="activeTab === 'assigned'" :search="searchQuery" :mode="activeTab" @progress="guideProgress = $event" @catalog="guideCourses = $event" />
      <template v-if="activeTab === 'assigned'">
        <section v-if="recentCompletions.length" class="recent-completions"><h3>Recently completed</h3><button v-for="item in recentCompletions" :key="item.key" @click="activeTab = 'completed'">✓ {{ item.title }}</button></section>
        <section v-if="suggestions.length" class="on-demand-preview" aria-label="Explore on-demand training"><header class="section-heading"><div><h3>Explore on-demand</h3><p>A few things you can learn next.</p></div><div><button @click="rotateSuggestions(-1)" aria-label="Previous training suggestions">←</button><button @click="rotateSuggestions(1)" aria-label="Next training suggestions">→</button><button @click="searchQuery = ''; activeTab = 'on-demand'">Browse all →</button></div></header><div class="course-grid"><article v-for="item in featuredSuggestions" :key="item.key" class="course-card"><span class="course-status">{{ item.beta ? 'Beta guide' : 'On-demand' }}</span><h3>{{ item.title }}</h3><p>{{ item.description }}</p><button @click="previewSuggestion(item)">Explore training</button></article></div></section>
      </template>
      <template v-if="activeTab === 'on-demand' || activeTab === 'completed'">
        <h3>{{ activeTab === 'completed' ? 'Completed courses' : 'Courses & learning paths' }}</h3>
        <div class="course-grid"><article v-for="course in visibleCourses" :key="course.key" class="course-card">
          <span class="course-status">{{ course.status.replace('_', ' ') }}</span><h3>{{ course.title }}</h3><p>{{ course.description }}</p>
          <progress :value="course.progress" max="100" :aria-label="`${course.title} progress`"/><p>{{ course.progress }}% complete</p>
          <button @click="openCourse(course)">{{ course.status === 'completed' ? 'Review' : course.progress ? 'Continue' : 'Start course' }}</button>
        </article></div>
        <p v-if="!loading && !visibleCourses.length">{{ activeTab === 'completed' ? 'Your completed courses will appear here.' : 'No additional courses match your search. You can practice with the guides above.' }}</p>
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
]);
const featuredSuggestions = computed(() => Array.from({ length: Math.min(3, suggestions.value.length) }, (_, i) => suggestions.value[(suggestionOffset.value + i) % suggestions.value.length]));
function rotateSuggestions(direction) { if (suggestions.value.length) suggestionOffset.value = (suggestionOffset.value + direction * 3 + suggestions.value.length) % suggestions.value.length; }
function previewSuggestion(item) { if (item.guide) { searchQuery.value = item.title; activeTab.value = 'on-demand'; } else openCourse(item); }
const recentCompletions = computed(() => [
  ...guideCourses.value.flatMap(c => c.enrollments.filter(e => e.status === 'completed').map(e => ({ key: `guide-${e.id}`, title: c.title, completedAt: e.completed_at }))),
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
const sectionDescriptions = {
  assigned: 'An overview of your assigned work and learning history, including onboarding training.',
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
  if (p.status === 'in_progress') return 50;
  return 0;
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
    status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started'
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
    estimatedMinutes: modulesIn.reduce((s, m) => s + (Number(m.estimated_time_minutes) || 0), 0) || null
  };
}

const allCourses = computed(() => {
  const list = [];
  for (const f of assignedFocuses.value) list.push(normalizeFocus(f, 'assigned'));
  for (const t of trainingTasks.value.filter(t => t.reference_id && (!t.reference_type || t.reference_type === 'module'))) list.push(normalizeModule({ id: t.reference_id, title: t.title, description: t.description }, 'assigned'));
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
.my-learning{width:100%;min-width:0;box-sizing:border-box;padding:clamp(12px,2vw,28px);font-family:var(--font-ptco),sans-serif;color:#253e35;background:#f7f8f4;--primary:#294f40}.onboarding-link,.on-demand-preview header button,.recent-completions button{font:inherit;border:1px solid #b8cabf;background:#f8faf6;color:#294f40;border-radius:10px;padding:12px 16px;cursor:pointer;margin:0 8px 16px 0}.on-demand-preview,.recent-completions{border-top:1px solid #dce3d9;margin-top:28px;padding-top:24px}.learning-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px;background:#eef3eb;border-radius:12px;margin-bottom:22px}.learning-summary button{font:inherit;border:0;background:transparent;color:#294f40;cursor:pointer}.learning-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.learning-tabs button,.course-card button{font:inherit;cursor:pointer;border:1px solid #b9cbbf;border-radius:10px;padding:13px 20px;background:white;color:#294f40;min-height:46px}.learning-tabs [aria-pressed=true],.course-card button{background:#294f40;color:white}.learning-content{background:white;border:1px solid #dbe2d9;border-radius:16px;padding:clamp(16px,2vw,28px);min-width:0}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:20px}.section-heading h2{font:600 24px/1.4 var(--font-ptco);color:#253e35;margin:0}.section-heading h2 span{font-size:11px;vertical-align:middle;border-radius:12px;background:#f4e3d7;padding:5px 9px;color:#77432e}.section-heading p,.course-card p{font-size:14px;line-height:1.7}.search-wrap{flex:0 1 400px}.search-wrap input{box-sizing:border-box;width:100%;border:1px solid #bfcfc2;border-radius:10px;padding:14px;font:inherit}.course-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:18px}.course-card{border:1px solid #d8e2d8;border-radius:12px;padding:24px;background:#fafaf7;min-width:0}.course-card h3{font-size:19px;line-height:1.5}.course-status{text-transform:capitalize;font-size:12px;color:#566b5c}.course-card progress{width:100%;accent-color:#294f40}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.my-learning :deep(.container){max-width:none;width:100%;padding:0}.my-learning :deep(.guide-catalog){margin:16px 0;padding:0;background:transparent;border:0}.my-learning :deep(.training-focus-tab){font-family:var(--font-ptco)}button:focus-visible,input:focus-visible{outline:3px solid #b87961;outline-offset:3px}
.my-learning :deep(.training-focus-tab .empty-state){padding:18px 0;text-align:left}.on-demand-preview .course-grid{grid-template-columns:repeat(3,minmax(0,1fr))}@media(max-width:800px){.on-demand-preview .course-grid{grid-template-columns:1fr}}
</style>
