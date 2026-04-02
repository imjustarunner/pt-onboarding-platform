<template>
  <section v-if="pending.length" class="survey-prompt-card">
    <div class="head">
      <div>
        <strong>Survey waiting</strong>
        <div class="muted">{{ current?.survey_title }}</div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="dismissCurrent" :disabled="saving">Remind me later</button>
        <button class="btn btn-primary btn-sm" type="button" @click="open = !open">{{ open ? 'Hide' : 'Start' }}</button>
      </div>
    </div>
    <p v-if="current?.survey_description" class="muted" style="margin-top:6px;">{{ current.survey_description }}</p>
    <div v-if="open" class="body">
      <div v-for="q in (current?.survey_questions_json || [])" :key="q.id" class="q">
        <label>{{ q.label }}</label>
        <input v-if="isText(q.type)" v-model="answers[q.id].answer" type="text" />
        <textarea v-else-if="isTextArea(q.type)" v-model="answers[q.id].answer" rows="3"></textarea>
        <select v-else-if="isSelect(q.type)" v-model="answers[q.id].answer">
          <option value="">Select…</option>
          <option v-for="opt in optionsFor(q)" :key="String(opt.value)" :value="String(opt.value)">
            {{ opt.label }}
          </option>
        </select>
        <div v-else-if="q.type === 'multiple_choice'" class="multi">
          <label v-for="opt in optionsFor(q)" :key="String(opt.value)">
            <input
              type="checkbox"
              :checked="Array.isArray(answers[q.id].answer) && answers[q.id].answer.includes(String(opt.value))"
              @change="toggleMulti(q.id, String(opt.value))"
            />
            {{ opt.label }}
          </label>
        </div>
        <input
          v-else-if="q.type === 'slider' || q.type === 'scale'"
          v-model.number="answers[q.id].answer"
          type="range"
          :min="Number(q.scale?.min || 1)"
          :max="Number(q.scale?.max || 10)"
        />
        <input v-else v-model="answers[q.id].answer" type="text" />
        <label v-if="q.allowQuoteMe" class="quote">
          <input type="checkbox" v-model="answers[q.id].quoteMe" /> Quote me
        </label>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="submitCurrent">
          {{ saving ? 'Submitting…' : 'Submit survey' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const pending = ref([]);
const current = ref(null);
const answers = ref({});
const open = ref(false);
const saving = ref(false);

const isText = (t) => ['text'].includes(String(t || ''));
const isTextArea = (t) => ['textarea', 'written'].includes(String(t || ''));
const isSelect = (t) => ['select', 'radio', 'likert', 'nps', 'rating'].includes(String(t || ''));

const optionsFor = (q) => {
  const options = Array.isArray(q?.options) ? q.options : [];
  return options.map((o) => (typeof o === 'object'
    ? { label: String(o.label || o.value || ''), value: String(o.value || o.label || '') }
    : { label: String(o || ''), value: String(o || '') }));
};

const hydrateCurrent = () => {
  current.value = pending.value[0] || null;
  answers.value = {};
  if (!current.value) return;
  for (const q of (current.value.survey_questions_json || [])) {
    answers.value[q.id] = { answer: '', quoteMe: false };
  }
};

const load = async () => {
  const r = await api.get('/surveys/my-pending');
  pending.value = Array.isArray(r.data) ? r.data : [];
  hydrateCurrent();
};

const toggleMulti = (qid, value) => {
  const cur = Array.isArray(answers.value[qid]?.answer) ? [...answers.value[qid].answer] : [];
  const idx = cur.indexOf(value);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(value);
  answers.value[qid].answer = cur;
};

const dismissCurrent = async () => {
  if (!current.value?.id) return;
  saving.value = true;
  try {
    await api.post(`/surveys/pushes/${current.value.id}/dismiss`);
    await load();
  } finally {
    saving.value = false;
  }
};

const submitCurrent = async () => {
  if (!current.value?.survey_id) return;
  saving.value = true;
  try {
    const responseData = {};
    for (const q of (current.value.survey_questions_json || [])) {
      const entry = answers.value[q.id] || { answer: '' };
      responseData[q.id] = q.allowQuoteMe
        ? { answer: entry.answer, quoteMe: !!entry.quoteMe }
        : entry.answer;
    }
    await api.post(`/surveys/${current.value.survey_id}/respond`, {
      surveyPushId: current.value.id,
      responseData
    });
    open.value = false;
    await load();
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.survey-prompt-card { border: 1px solid #dbe3ef; border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 14px; }
.head { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.q { margin: 10px 0; display: grid; gap: 6px; }
.q input[type="text"], .q textarea, .q select { width: 100%; }
.multi { display: grid; gap: 6px; }
.quote { font-size: .9rem; color: #475569; display: flex; align-items: center; gap: 6px; }
.muted { color: #64748b; font-size: .9rem; }
</style>
