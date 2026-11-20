<template>
  <details ref="panel" @toggle="onOpen">
    <summary>Session activity &amp; skill ratings</summary>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Loading session activity…</p>
    <template v-if="record"
      ><small>{{ record.strokes }} ink strokes saved</small>
      <p v-if="!record.items.length">No materials or questions shared yet.</p>
      <article v-for="item in record.items" :key="item.id">
        <strong>{{ item.title }}</strong
        ><small>{{
          [
            item.skill,
            item.grade ? 'Grade ' + item.grade : '',
            item.responses ? item.responses + ' submitted responses' : ''
          ]
            .filter(Boolean)
            .join(' · ')
        }}</small>
        <small v-if="item.strokes">{{ item.strokes }} ink strokes</small>
        <details v-if="item.submissions?.length">
          <summary>Submitted answers</summary>
          <ol>
            <li v-for="s in item.submissions" :key="s.id">{{ s.answers.join(' / ') }}</li>
          </ol>
        </details>
        <span v-if="item.rating">{{ labels[item.rating] }}</span>
        <label v-else-if="!signed"
          >Tutor observation<select :disabled="saving" :value="''" @change="review(item, $event)">
            <option value="">Choose a rating</option>
            <option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option>
          </select></label
        ><small v-else>Unrated</small>
      </article>
      <section v-if="record.progress?.length">
        <h3>Recent skill progress</h3>
        <p>
          Based on the latest 100 observations for this subject. Repeated practice counts once per
          session, using the least independent response.
        </p>
        <article v-for="g in record.progress" :key="JSON.stringify([g.skill, g.grade, g.goalId])">
          <strong>{{ g.skill }} {{ g.grade ? '· Grade ' + g.grade : '' }}</strong
          ><span>{{ g.independent }} of {{ g.sessions }} sessions independent</span
          ><small>{{ g.previous ? labels[g.previous] + ' → ' : '' }}{{ labels[g.latest] }}</small>
        </article>
      </section></template
    ><button type="button" :disabled="loading || saving" @click="load">Refresh activity</button>
  </details>
</template>
<script setup>
import { ref, onBeforeUnmount } from 'vue';
const props = defineProps({ request: { type: Function, required: true }, signed: Boolean });
const record = ref(null),
  error = ref(''),
  loading = ref(false),
  saving = ref(false);
const labels = {
  not_observed: 'Not assessed',
  needs_review: 'Needs more practice',
  developing: 'Solved with support',
  secure: 'Solved independently'
};
const panel = ref(null);
function openForReview() {
  if (!panel.value) return;
  panel.value.open = true;
  panel.value.querySelector('summary')?.focus();
  panel.value.scrollIntoView?.({ block: 'nearest' });
}
defineExpose({ openForReview });
let generation = 0;
function onOpen(e) {
  if (e.target === panel.value && e.target.open) load();
}
async function load() {
  const own = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const data = await props.request('/lesson-record');
    if (own === generation) record.value = data;
  } catch (e) {
    if (own === generation)
      error.value = e.response?.data?.error?.message || 'Could not load the activity record.';
  } finally {
    if (own === generation) loading.value = false;
  }
}
async function review(item, e) {
  const rating = e.target.value;
  if (!rating || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await props.request('/lesson-review', 'post', {
      targetId: item.id,
      rating,
      requestId: crypto.randomUUID()
    });
    await load();
  } catch (cause) {
    error.value = cause.response?.data?.error?.message || 'Rating could not be saved.';
    e.target.value = '';
  } finally {
    saving.value = false;
  }
}
onBeforeUnmount(() => generation++);
</script>
<style scoped>
details {
  padding: 10px 12px;
  background: #f5f8fa;
  border-radius: 8px;
}
summary {
  font-weight: 650;
  cursor: pointer;
}
article {
  display: grid;
  gap: 5px;
  padding: 10px 0;
  border-bottom: 1px solid #cfdae2;
}
small {
  color: #536a7b;
}
select {
  max-width: 100%;
}
</style>
