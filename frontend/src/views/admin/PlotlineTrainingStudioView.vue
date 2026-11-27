<template>
  <main class="studio-home">
    <header class="studio-hero">
      <div>
        <p class="pl-eyebrow">Plotline · Training</p>
        <h1>{{ teamView ? 'Team training' : 'Training Studio' }}</h1>
        <p>{{ teamView ? 'Open a published lesson from your company.' : 'Build lessons your team can use on their first day and return to as they grow.' }}</p>
      </div>
      <button v-if="agency && !teamView && !showCreate" type="button" class="primary" @click="openCreate">New lesson</button>
    </header>

    <p v-if="error" class="pl-alert error" role="alert">{{ error }}</p>
    <form v-if="showCreate" class="pl-company-card create-lesson" @submit.prevent="create">
      <div>
        <h2>New lesson</h2>
        <label>Lesson name <input ref="titleInput" v-model.trim="title" required maxlength="255" placeholder="e.g. Your first week with us" /></label>
        <label>Description <textarea v-model="description" rows="2" maxlength="10000" placeholder="What should someone learn?" /></label>
      </div>
      <div>
        <fieldset>
          <legend>Start with</legend>
          <label v-for="starter in lessonStarters" :key="starter.id" class="pl-check starter-option">
            <input v-model="starterId" type="radio" :value="starter.id" />
            <span><strong>{{ starter.label }}</strong><small>{{ starter.description }}</small></span>
          </label>
        </fieldset>
        <div class="pl-actions">
          <button type="submit" class="primary" :disabled="creating || !title">{{ creating ? 'Creating…' : 'Create draft' }}</button>
          <button type="button" :disabled="creating" @click="showCreate = false">Cancel</button>
        </div>
      </div>
    </form>

    <section class="studio-library" aria-labelledby="lesson-library-heading">
      <div class="library-toolbar">
        <h2 id="lesson-library-heading">Lessons <span>{{ lessons.length }}</span></h2>
        <label v-if="lessons.length">Find a lesson <input v-model="query" type="search" placeholder="Search by title" /></label>
        <label v-if="lessons.length && !teamView">Status <select v-model="status"><option value="">All lessons</option><option value="draft">Draft</option><option value="published">Published</option></select></label>
      </div>
      <p v-if="loading" role="status">Loading lessons…</p>
      <div v-else-if="!error && !lessons.length && !showCreate" class="pl-company-card empty-library">
        <h3>{{ teamView ? 'No published lessons yet' : 'Build your first lesson' }}</h3>
        <p v-if="!teamView">Start with a welcome, a procedure, or a blank lesson. Add a knowledge check when you want learners to practice.</p>
        <button v-if="!teamView" type="button" @click="openCreate">Create a lesson</button>
      </div>
      <p v-else-if="lessons.length && !filtered.length">No lessons match those filters.</p>
      <ul v-else class="lesson-grid">
        <li v-for="lesson in filtered" :key="lesson.id" class="pl-company-card lesson-card">
          <div class="lesson-status"><span :class="stateOf(lesson)">{{ stateOf(lesson) === 'published' ? 'Published' : 'Draft' }}</span><span v-if="lesson.estimated_time_minutes">{{ lesson.estimated_time_minutes }} min</span></div>
          <h3>{{ lesson.title }}</h3>
          <p v-if="lesson.description">{{ lesson.description }}</p>
          <div class="lesson-links">
            <router-link v-if="!teamView" :to="builderLink(lesson.id)" :aria-label="'Edit ' + lesson.title">Edit lesson →</router-link>
            <router-link v-if="stateOf(lesson) === 'published'" :to="`/${route.params.organizationSlug}/module/${lesson.id}`" :aria-label="'View ' + lesson.title">{{ teamView ? 'Open lesson' : 'View lesson' }}</router-link>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { usePlotlineCompanyScope } from '../../composables/usePlotlineCompanyScope';
import { plotlineLessonStarters as lessonStarters } from '../../utils/plotlineLessonStarters';

const route = useRoute();
const router = useRouter();
const teamView = computed(() => !!route.meta?.plotlineTeamTraining);
const { company: agency, companyId } = usePlotlineCompanyScope(route, useAgencyStore());
const lessons = ref([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const status = ref('');
const showCreate = ref(false);
const creating = ref(false);
const title = ref('');
const description = ref('');
const starterId = ref('blank');
const titleInput = ref(null);
const stateOf = lesson => lesson.publish_status || (lesson.is_active ? 'published' : 'draft');
const filtered = computed(() => lessons.value.filter(lesson =>
  (!status.value || stateOf(lesson) === status.value) &&
  lesson.title.toLowerCase().includes(query.value.trim().toLowerCase())
));
const builderLink = id => `/${route.params.organizationSlug}/admin/modules/${id}/builder`;

async function openCreate() {
  showCreate.value = true;
  await nextTick();
  titleInput.value?.focus();
}

let request = 0;
watch([companyId, () => route.params.organizationSlug, teamView], async ([id]) => {
  const current = ++request;
  lessons.value = [];
  showCreate.value = false;
  creating.value = false;
  title.value = '';
  description.value = '';
  starterId.value = 'blank';
  status.value = '';
  query.value = '';
  error.value = '';
  loading.value = !!id;
  if (!id) return;
  try {
    const { data } = await api.get('/modules', { params: { agencyId: id } });
    if (current === request) lessons.value = data.filter(lesson => Number(lesson.agency_id) === id && (!teamView.value || stateOf(lesson) === 'published'));
  } catch (e) {
    if (current === request) error.value = e.response?.data?.error?.message || 'Lessons could not be loaded.';
  } finally {
    if (current === request) loading.value = false;
  }
}, { immediate: true });

async function create() {
  const id = companyId.value;
  if (!id || creating.value || !title.value) return;
  const current = request;
  creating.value = true;
  error.value = '';
  try {
    const { data } = await api.post('/modules', {
      title: title.value, description: description.value, agencyId: id,
      isStandalone: true, isActive: false, publishStatus: 'draft'
    });
    if (current !== request) return;
    await router.push({ path: builderLink(data.id), query: starterId.value === 'blank' ? {} : { starter: starterId.value } });
  } catch (e) {
    if (current === request) error.value = e.response?.data?.error?.message || 'The draft could not be created.';
  } finally {
    if (current === request) creating.value = false;
  }
}
</script>

<style scoped>
.studio-home { max-width: 1220px; margin: auto; padding: clamp(16px, 4vw, 48px); }
.studio-hero { display: flex; justify-content: space-between; align-items: end; flex-wrap: wrap; gap: 18px; padding: clamp(22px, 4vw, 42px); background: #eaf1e9; border-radius: var(--pl-company-radius); border: 1px solid #d6e4d7; }
.studio-hero h1 { font-size: clamp(2rem, 5vw, 3.3rem); margin: 8px 0; }
.studio-hero p, .create-lesson h2 { margin: 0; }
.create-lesson { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
legend { font-weight: 700; }
.starter-option { padding: 10px 14px; border: 1px solid #cedbd2; border-radius: 9px; margin: 8px 0; }
.starter-option:has(input:checked) { border-color: var(--pl-company-heading-color); background: #f1f6ee; }
.starter-option small { display: block; }
.library-toolbar { display: flex; align-items: end; gap: 16px; flex-wrap: wrap; margin: 26px 0 14px; }
.library-toolbar h2 { margin: 0 auto 9px 0; }
.library-toolbar h2 span { font: 600 .75em var(--pl-company-body); margin-left: 5px; }
.library-toolbar label { margin: 0; }
.lesson-grid { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr)); gap: 14px; }
.lesson-card { display: flex; flex-direction: column; align-items: start; gap: 10px; overflow-wrap: anywhere; }
.lesson-card h3, .lesson-card p { margin: 0; }
.lesson-links { display: flex; flex-wrap: wrap; gap: 14px; margin-top: auto; }
.lesson-links a { font-weight: 700; }
.lesson-status { display: flex; gap: 10px; align-items: center; font-size: .78rem; }
.lesson-status span:first-child { border-radius: 50px; padding: 2px 8px; background: #f6eee0; }
.lesson-status span.published { background: #e4f2e6; }
@media (max-width: 660px) { .create-lesson { grid-template-columns: 1fr; } }
</style>
