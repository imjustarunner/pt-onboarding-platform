<template>
  <div class="my-learning">
    <header class="ml-top">
      <div class="search-wrap">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search for courses, topics or skills…"
          class="search-input"
        />
      </div>
    </header>

    <div class="ml-layout">
      <main class="ml-main">
        <div class="ml-heading">
          <div>
            <h1>My Learning</h1>
            <p class="muted">Continue education, on-demand courses, and your progress at a glance.</p>
          </div>
          <div class="metric-cards">
            <div class="metric">
              <div class="metric-value">{{ overallPct }}%</div>
              <div class="metric-label">Overall progress</div>
              <div class="mini-bar"><div :style="{ width: overallPct + '%' }" /></div>
              <div class="muted tiny">{{ completedCount }} / {{ totalCount }} completed</div>
            </div>
            <div class="metric">
              <div class="metric-value cert">{{ certificateCount }}</div>
              <div class="metric-label">Certificates earned</div>
              <button type="button" class="linkish" @click="activeTab = 'completed'">View all</button>
            </div>
            <div v-if="overdueCourses.length" class="metric alert">
              <div class="metric-value">{{ overdueCourses.length }}</div>
              <div class="metric-label">Overdue</div>
              <button type="button" class="linkish" @click="activeTab = 'overdue'">Review now</button>
            </div>
          </div>
        </div>

        <div class="toolbar">
          <div class="tabs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
              <span v-if="tab.id === 'overdue' && overdueCourses.length" class="tab-count">{{ overdueCourses.length }}</span>
            </button>
          </div>
          <div class="filters">
            <select v-model="categoryFilter">
              <option value="">All categories</option>
              <option value="on_demand">On-demand</option>
              <option value="assigned">Assigned</option>
              <option value="agency_focus">Learning paths</option>
            </select>
            <select v-model="typeFilter">
              <option value="">All types</option>
              <option value="module">Lessons</option>
              <option value="focus">Courses</option>
            </select>
            <select v-model="sortBy">
              <option value="recent">Recently accessed</option>
              <option value="title">Title A–Z</option>
              <option value="progress">Progress</option>
            </select>
            <div class="view-toggle" role="group" aria-label="View mode">
              <button type="button" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">Grid</button>
              <button type="button" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">List</button>
            </div>
          </div>
        </div>

        <div v-if="loading" class="state">Loading your learning library…</div>
        <div v-else-if="error" class="state error">{{ error }}</div>

        <template v-else>
          <section v-if="showSection('overdue') && overdueCourses.length" class="section">
            <h2>Overdue</h2>
            <div :class="['course-grid', viewMode === 'list' ? 'wide' : '']">
              <article
                v-for="course in filteredSorted(overdueCourses)"
                :key="course.key"
                :class="['course-card', viewMode === 'list' ? 'horizontal' : 'vertical']"
              >
                <div class="thumb" :style="thumbStyle(course)" />
                <div class="body">
                  <span class="badge danger">Overdue</span>
                  <h3>{{ course.title }}</h3>
                  <p class="muted">Due {{ formatDate(course.dueDate) }}</p>
                  <div class="card-actions">
                    <button type="button" class="btn btn-primary btn-sm" @click="openCourse(course)">Resume</button>
                    <button type="button" class="btn btn-secondary btn-sm" @click="toggleSave(course)">
                      {{ isSaved(course) ? 'Saved' : 'Save' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="showSection('in_progress') && inProgressCourses.length" class="section">
            <h2>In Progress</h2>
            <div :class="['course-grid', viewMode === 'list' || activeTab === 'all' ? 'wide' : '']">
              <article
                v-for="course in filteredSorted(inProgressCourses)"
                :key="course.key"
                class="course-card horizontal"
              >
                <div class="thumb" :style="thumbStyle(course)" />
                <div class="body">
                  <span class="badge">In progress</span>
                  <h3>{{ course.title }}</h3>
                  <p class="muted">{{ course.description || 'Continue where you left off' }}</p>
                  <div class="progress-row">
                    <div class="mini-bar"><div :style="{ width: (course.progress || 0) + '%' }" /></div>
                    <span>{{ course.progress || 0 }}%</span>
                  </div>
                  <div class="meta muted">
                    <span v-if="course.lessonsTotal">{{ course.lessonsDone || 0 }} of {{ course.lessonsTotal }} lessons</span>
                    <span v-if="course.minutesLeft">{{ course.minutesLeft }} min left</span>
                  </div>
                  <div class="card-actions">
                    <button type="button" class="btn btn-primary btn-sm" @click="openCourse(course)">Resume</button>
                    <button type="button" class="ghost-save" @click="toggleSave(course)">
                      {{ isSaved(course) ? '★ Saved' : '☆ Save' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="showSection('continue') && continueCourses.length" class="section">
            <div class="section-head">
              <h2>Continue Learning</h2>
            </div>
            <div class="course-rail">
              <article v-for="course in filteredSorted(continueCourses)" :key="course.key" class="course-card vertical compact-card">
                <div class="icon-badge">{{ (course.title || '?').slice(0, 1) }}</div>
                <h3>{{ course.title }}</h3>
                <p class="muted clamp">{{ course.description || 'Ready when you are' }}</p>
                <div class="meta muted">
                  <span>{{ course.lessonsTotal || 0 }} lessons</span>
                  <span>Not started</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="openCourse(course)">Start Course</button>
              </article>
            </div>
          </section>

          <section v-if="showSection('recommended') && recommendedCourses.length" class="section">
            <h2>Recommended for You</h2>
            <div class="course-grid compact">
              <article v-for="course in filteredSorted(recommendedCourses)" :key="course.key" class="course-card compact-row">
                <div class="thumb small" :style="thumbStyle(course)" />
                <div class="body grow">
                  <h3>{{ course.title }}</h3>
                  <p class="muted tiny">Course · {{ course.estimatedMinutes || '—' }} min</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" @click="openCourse(course)">Start Course</button>
              </article>
            </div>
          </section>

          <section v-if="activeTab === 'completed' && completedCourses.length" class="section">
            <h2>Completed</h2>
            <div class="course-grid">
              <article v-for="course in filteredSorted(completedCourses)" :key="course.key" class="course-card vertical">
                <span class="badge success">Completed</span>
                <h3>{{ course.title }}</h3>
                <button type="button" class="btn btn-secondary btn-sm" @click="openCourse(course)">Review</button>
              </article>
            </div>
          </section>

          <section v-if="activeTab === 'saved'" class="section">
            <h2>Saved</h2>
            <div v-if="!savedCourses.length" class="empty-inline">
              <p class="muted">Save courses you’re interested in for later.</p>
            </div>
            <div v-else class="course-grid">
              <article v-for="course in filteredSorted(savedCourses)" :key="course.key" class="course-card vertical">
                <h3>{{ course.title }}</h3>
                <div class="meta muted">
                  <span>{{ course.status.replace('_', ' ') }}</span>
                  <span v-if="course.estimatedMinutes">{{ course.estimatedMinutes }} min</span>
                </div>
                <div class="card-actions">
                  <button type="button" class="btn btn-primary btn-sm" @click="openCourse(course)">Open</button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="toggleSave(course)">Remove</button>
                </div>
              </article>
            </div>
          </section>

          <div v-if="!visibleAny" class="empty">
            <h3>No courses match your filters</h3>
            <p class="muted">Try another tab or clear your search.</p>
            <router-link class="btn btn-secondary" :to="assignedTrainingLink">Go to assigned training</router-link>
          </div>
        </template>
      </main>

      <aside class="ml-aside">
        <div class="aside-card highlight">
          <h3>Assigned training</h3>
          <p class="muted">Onboarding and required paths live on your dashboard Training tab.</p>
          <router-link class="btn btn-primary btn-sm" :to="assignedTrainingLink">Open assigned training</router-link>
        </div>

        <div class="aside-card">
          <h3>Certificates</h3>
          <p class="muted">{{ certificateCount }} earned</p>
          <button type="button" class="linkish" @click="activeTab = 'completed'">Browse completed</button>
        </div>

        <div v-if="recentAchievements.length" class="aside-card">
          <h3>Recent achievements</h3>
          <ul class="achievements">
            <li v-for="a in recentAchievements" :key="a.id">
              <span class="ach-dot" :style="{ background: a.color }" />
              <div>
                <strong>{{ a.title }}</strong>
                <p class="muted tiny">{{ a.subtitle }}</p>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { getDashboardRoute } from '../utils/router';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const searchQuery = ref('');
const activeTab = ref('all');
const sortBy = ref('recent');
const categoryFilter = ref('');
const typeFilter = ref('');
const viewMode = ref('grid');
const modules = ref([]);
const agencyFocuses = ref([]);
const assignedFocuses = ref([]);
const progressRows = ref([]);
const certificates = ref([]);
const trainingTasks = ref([]);
const savedItems = ref([]);

const tabs = [
  { id: 'all', label: 'All Courses' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'saved', label: 'Saved' }
];

const assignedTrainingLink = computed(() => {
  const org = route.params.organizationSlug;
  const base = org ? `/${org}/dashboard` : getDashboardRoute();
  const sep = String(base).includes('?') ? '&' : '?';
  return `${base}${sep}tab=training`;
});

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

const savedSet = computed(() => {
  const set = new Set();
  for (const s of savedItems.value) {
    set.add(`${s.itemType}:${s.itemId}`);
  }
  return set;
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
  const progress = f.progress_percentage != null
    ? Number(f.progress_percentage)
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
  for (const f of agencyFocuses.value) list.push(normalizeFocus(f, 'agency_focus'));
  for (const f of assignedFocuses.value) list.push(normalizeFocus(f, 'assigned'));
  for (const m of modules.value) list.push(normalizeModule(m));
  const seen = new Set();
  return list.filter((c) => {
    const k = `${c.type}-${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
});

const inProgressCourses = computed(() => allCourses.value.filter((c) => c.status === 'in_progress'));
const completedCourses = computed(() => allCourses.value.filter((c) => c.status === 'completed'));
const overdueCourses = computed(() => allCourses.value.filter((c) => c.isOverdue));
const continueCourses = computed(() =>
  allCourses.value.filter((c) => c.status === 'not_started' && c.source !== 'assigned').slice(0, 8)
);
const recommendedCourses = computed(() =>
  allCourses.value.filter((c) => c.status === 'not_started').slice(0, 6)
);
const savedCourses = computed(() =>
  allCourses.value.filter((c) => savedSet.value.has(`${c.type === 'focus' ? 'focus' : 'module'}:${c.id}`))
);

const totalCount = computed(() => allCourses.value.length);
const completedCount = computed(() => completedCourses.value.length);
const overallPct = computed(() =>
  totalCount.value ? Math.round((completedCount.value / totalCount.value) * 100) : 0
);
const certificateCount = computed(() => certificates.value.length || completedCount.value);

const recentAchievements = computed(() =>
  completedCourses.value.slice(0, 5).map((c, i) => ({
    id: c.key,
    title: c.title,
    subtitle: 'Course completed',
    color: ['var(--primary)', 'var(--success)', 'var(--accent)'][i % 3]
  }))
);

function showSection(name) {
  if (activeTab.value === 'all') return name !== 'overdue' || overdueCourses.value.length > 0;
  if (activeTab.value === 'in_progress') return name === 'in_progress';
  if (activeTab.value === 'completed') return false;
  if (activeTab.value === 'overdue') return name === 'overdue';
  if (activeTab.value === 'saved') return false;
  return true;
}

const visibleAny = computed(() => {
  if (activeTab.value === 'completed') return completedCourses.value.length > 0;
  if (activeTab.value === 'in_progress') return inProgressCourses.value.length > 0;
  if (activeTab.value === 'overdue') return overdueCourses.value.length > 0;
  if (activeTab.value === 'saved') return savedCourses.value.length > 0;
  return allCourses.value.length > 0;
});

function matchesFilters(course) {
  const q = searchQuery.value.trim().toLowerCase();
  if (q && !`${course.title} ${course.description || ''}`.toLowerCase().includes(q)) return false;
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

function thumbStyle(course) {
  const hue = (Number(course.id) * 47) % 360;
  return {
    background: `linear-gradient(145deg, hsl(${hue} 42% 46%), hsl(${(hue + 48) % 360} 34% 26%))`
  };
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

function isSaved(course) {
  return savedSet.value.has(`${course.type === 'focus' ? 'focus' : 'module'}:${course.id}`);
}

async function toggleSave(course) {
  const itemType = course.type === 'focus' ? 'focus' : 'module';
  try {
    if (isSaved(course)) {
      await api.delete(`/training-saved/${itemType}/${course.id}`);
      savedItems.value = savedItems.value.filter(
        (s) => !(s.itemType === itemType && Number(s.itemId) === Number(course.id))
      );
    } else {
      const res = await api.post('/training-saved', { itemType, itemId: course.id });
      savedItems.value = res.data?.items || [
        ...savedItems.value,
        { itemType, itemId: course.id }
      ];
    }
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Could not update saved courses');
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

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const userId = authStore.user?.id;
    const tasks = [
      api.get('/on-demand-training/modules').catch(() => ({ data: [] })),
      api.get('/on-demand-training/training-focuses').catch(() => ({ data: [] })),
      api.get('/progress').catch(() => ({ data: [] })),
      api.get('/certificates').catch(() => ({ data: [] })),
      api.get('/tasks', { params: { taskType: 'training' } }).catch(() => ({ data: [] })),
      api.get('/training-saved').catch(() => ({ data: [] }))
    ];
    if (userId) {
      tasks.push(api.get(`/users/${userId}/training-focuses`).catch(() => ({ data: [] })));
    }
    const [modRes, focusRes, progRes, certRes, taskRes, savedRes, assignedRes] = await Promise.all(tasks);
    modules.value = modRes.data || [];
    agencyFocuses.value = focusRes.data || [];
    progressRows.value = progRes.data || [];
    certificates.value = Array.isArray(certRes.data) ? certRes.data : (certRes.data?.certificates || []);
    trainingTasks.value = Array.isArray(taskRes.data) ? taskRes.data : [];
    savedItems.value = Array.isArray(savedRes.data) ? savedRes.data : [];
    assignedFocuses.value = assignedRes?.data || [];
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load learning library';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.my-learning {
  min-height: calc(100vh - 64px);
  background:
    radial-gradient(1200px 420px at 10% -10%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%),
    linear-gradient(180deg, var(--bg-alt), var(--bg) 320px);
  padding-bottom: 48px;
}
.ml-top {
  padding: 22px 24px 10px;
  display: flex;
  justify-content: center;
}
.search-wrap { width: min(720px, 100%); }
.search-input {
  width: 100%;
  padding: 13px 18px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font: inherit;
  box-shadow: var(--shadow);
}
.ml-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 24px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 8px 24px 24px;
}
.ml-heading {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.ml-heading h1 { margin: 0 0 6px; font-family: var(--font-header); font-size: clamp(1.7rem, 2.4vw, 2.2rem); }
.metric-cards { display: flex; gap: 12px; flex-wrap: wrap; }
.metric {
  min-width: 148px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: var(--shadow);
}
.metric.alert {
  border-color: color-mix(in srgb, var(--danger, #c0392b) 40%, var(--border));
  background: color-mix(in srgb, var(--danger, #c0392b) 6%, white);
}
.metric-value { font-size: 1.7rem; font-weight: 700; color: var(--secondary); line-height: 1.1; }
.metric-value.cert { color: var(--success); }
.metric-label { font-size: 12px; color: var(--text-secondary); margin: 4px 0 6px; }
.mini-bar {
  height: 6px;
  background: var(--bg-alt);
  border-radius: 999px;
  overflow: hidden;
  margin: 6px 0;
}
.mini-bar > div { height: 100%; background: var(--primary); }
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tabs button {
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tabs button.active {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  color: var(--secondary);
}
.tab-count {
  background: var(--danger, #c0392b);
  color: #fff;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 11px;
}
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.filters select {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
}
.view-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.view-toggle button {
  border: none;
  background: var(--bg);
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.view-toggle button.active {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--secondary);
}
.section { margin-bottom: 30px; }
.section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.section h2 { margin: 0 0 12px; font-size: 1.15rem; font-family: var(--font-header); }
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.course-grid.wide { grid-template-columns: 1fr; }
.course-grid.compact { grid-template-columns: 1fr; gap: 10px; }
.course-rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(200px, 240px);
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}
.course-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--shadow);
}
.course-card.horizontal { display: grid; grid-template-columns: 168px 1fr; gap: 14px; padding: 0; overflow: hidden; }
.course-card.horizontal .body { padding: 16px 16px 16px 0; }
.course-card.compact-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.course-card h3 { margin: 6px 0; font-size: 1.02rem; }
.thumb { min-height: 128px; }
.thumb.small { width: 68px; height: 52px; border-radius: 10px; flex-shrink: 0; min-height: 52px; }
.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  color: var(--secondary);
}
.badge.success { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
.badge.danger { background: color-mix(in srgb, var(--danger, #c0392b) 16%, transparent); color: var(--danger, #c0392b); }
.progress-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.progress-row .mini-bar { flex: 1; }
.meta { display: flex; gap: 12px; font-size: 12px; margin: 8px 0 12px; flex-wrap: wrap; }
.card-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ghost-save {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.icon-badge {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.6em; }
.grow { flex: 1; min-width: 0; }
.ml-aside { display: flex; flex-direction: column; gap: 12px; }
.aside-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  box-shadow: var(--shadow);
}
.aside-card.highlight {
  background: color-mix(in srgb, var(--primary) 8%, white);
  border-color: color-mix(in srgb, var(--primary) 28%, var(--border));
}
.aside-card h3 { margin: 0 0 8px; font-size: 0.95rem; }
.achievements { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.achievements li { display: flex; gap: 10px; align-items: flex-start; }
.ach-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.muted { color: var(--text-secondary); }
.tiny { font-size: 12px; }
.linkish { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; padding: 0; font-weight: 600; }
.state, .empty { text-align: center; padding: 40px 16px; }
.empty-inline { padding: 12px 0; }
.state.error { color: var(--error); }
@media (max-width: 960px) {
  .ml-layout { grid-template-columns: 1fr; }
  .course-card.horizontal { grid-template-columns: 1fr; }
  .course-card.horizontal .body { padding: 14px; }
  .thumb { min-height: 100px; }
}
</style>
