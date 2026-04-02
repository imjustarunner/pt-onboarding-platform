<template>
  <div v-if="pending.length" :class="{ 'survey-splash-overlay': splash }">
  <section class="survey-prompt-card" :class="{ 'survey-prompt-splash': splash }">
    <div class="head">
      <div>
        <strong>Survey waiting</strong>
        <div class="muted">{{ current?.survey_title }}</div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="dismissCurrent" :disabled="saving">Remind me later</button>
        <button v-if="!splash" class="btn btn-primary btn-sm" type="button" @click="open = !open">{{ open ? 'Hide' : 'Start' }}</button>
      </div>
    </div>
    <p v-if="current?.survey_description" class="muted" style="margin-top:6px;">{{ current.survey_description }}</p>
    <div v-if="showThanks" class="thanks-bubble-wrap">
      <div class="thanks-bubble" :class="{ leaving: thanksLeaving }">
        <div class="thanks-icon" aria-hidden="true">✨</div>
        <div class="thanks-title">Thank you for helping us so much!</div>
        <div class="thanks-sub muted">Your response has been saved.</div>
      </div>
    </div>
    <div v-else-if="open || splash" class="body">
      <div v-if="splash && activeQuestion" class="q">
        <div class="muted" style="margin-bottom:4px;">Question {{ splashIndex + 1 }} of {{ totalQuestions }}</div>
        <label>{{ activeQuestion.label }}</label>
        <input v-if="isText(activeQuestion.type)" v-model="answers[activeQuestion.id].answer" type="text" @input="splashError = ''" />
        <textarea v-else-if="isTextArea(activeQuestion.type)" v-model="answers[activeQuestion.id].answer" rows="3" @input="splashError = ''"></textarea>
        <div v-else-if="isLikert(activeQuestion.type)" class="likert-row">
          <button
            v-for="opt in optionsFor(activeQuestion)"
            :key="`likert-${activeQuestion.id}-${String(opt.value)}`"
            type="button"
            class="likert-btn"
            :class="{ selected: String(answers[activeQuestion.id].answer || '') === String(opt.value) }"
            @click="selectAndAdvance(activeQuestion, String(opt.value))"
          >
            {{ opt.label }}
          </button>
        </div>
        <select
          v-else-if="isSelect(activeQuestion.type)"
          v-model="answers[activeQuestion.id].answer"
          @change="selectAndAdvance(activeQuestion, answers[activeQuestion.id].answer)"
        >
          <option value="">Select…</option>
          <option v-for="opt in optionsFor(activeQuestion)" :key="String(opt.value)" :value="String(opt.value)">
            {{ opt.label }}
          </option>
        </select>
        <div v-else-if="activeQuestion.type === 'multiple_choice'" class="multi">
          <label v-for="opt in optionsFor(activeQuestion)" :key="String(opt.value)">
            <input
              type="checkbox"
              :checked="Array.isArray(answers[activeQuestion.id].answer) && answers[activeQuestion.id].answer.includes(String(opt.value))"
              @change="toggleMulti(activeQuestion.id, String(opt.value)); splashError = ''"
            />
            {{ opt.label }}
          </label>
        </div>
        <template v-else-if="activeQuestion.type === 'slider' || activeQuestion.type === 'scale'">
          <input
            v-model.number="answers[activeQuestion.id].answer"
            type="range"
            :min="Number(activeQuestion.scale?.min || 1)"
            :max="Number(activeQuestion.scale?.max || 10)"
            @change="onSliderChange(activeQuestion)"
          />
          <div class="slider-scale-row">
            <span
              v-for="n in sliderTicks(activeQuestion)"
              :key="`tick-${activeQuestion.id}-${n}`"
              class="slider-scale-tick"
            >
              {{ n }}
            </span>
          </div>
        </template>
        <input v-else v-model="answers[activeQuestion.id].answer" type="text" @input="splashError = ''" />
        <label v-if="activeQuestion.allowQuoteMe" class="quote">
          <input type="checkbox" v-model="answers[activeQuestion.id].quoteMe" /> Quote me
        </label>
        <div v-if="splashError" class="error-inline">{{ splashError }}</div>
      </div>
      <template v-else>
      <div v-for="q in (current?.survey_questions_json || [])" :key="q.id" class="q">
        <label>{{ q.label }}</label>
        <input v-if="isText(q.type)" v-model="answers[q.id].answer" type="text" />
        <textarea v-else-if="isTextArea(q.type)" v-model="answers[q.id].answer" rows="3"></textarea>
        <div v-else-if="isLikert(q.type)" class="likert-row">
          <button
            v-for="opt in optionsFor(q)"
            :key="`likert-${q.id}-${String(opt.value)}`"
            type="button"
            class="likert-btn"
            :class="{ selected: String(answers[q.id].answer || '') === String(opt.value) }"
            @click="answers[q.id].answer = String(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
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
      </template>
      <div class="actions">
        <template v-if="splash">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="splashIndex === 0 || saving" @click="splashIndex -= 1">
            Back
          </button>
          <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="nextSplashStep">
            {{ saving ? 'Submitting…' : (isLastSplashQuestion ? 'Finish survey' : 'Next question') }}
          </button>
        </template>
        <template v-else>
          <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="submitCurrent">
            {{ saving ? 'Submitting…' : 'Submit survey' }}
          </button>
        </template>
      </div>
    </div>
  </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  splash: { type: Boolean, default: false }
});

const pending = ref([]);
const current = ref(null);
const answers = ref({});
const open = ref(false);
const saving = ref(false);
const splashIndex = ref(0);
const splashError = ref('');
const showThanks = ref(false);
const thanksLeaving = ref(false);

const isText = (t) => ['text'].includes(String(t || ''));
const isTextArea = (t) => ['textarea', 'written'].includes(String(t || ''));
const isLikert = (t) => ['likert'].includes(String(t || ''));
const isSelect = (t) => ['select', 'radio', 'nps', 'rating'].includes(String(t || ''));

const optionsFor = (q) => {
  const options = Array.isArray(q?.options) ? q.options : [];
  return options.map((o) => (typeof o === 'object'
    ? { label: String(o.label || o.value || ''), value: String(o.value || o.label || '') }
    : { label: String(o || ''), value: String(o || '') }));
};

const hydrateCurrent = () => {
  current.value = pending.value[0] || null;
  answers.value = {};
  splashIndex.value = 0;
  splashError.value = '';
  if (!current.value) return;
  for (const q of (current.value.survey_questions_json || [])) {
    answers.value[q.id] = { answer: '', quoteMe: false, touched: false };
  }
};

const totalQuestions = computed(() => (current.value?.survey_questions_json || []).length);
const activeQuestion = computed(() => {
  const list = current.value?.survey_questions_json || [];
  return list[splashIndex.value] || null;
});
const isLastSplashQuestion = computed(() => splashIndex.value >= Math.max(0, totalQuestions.value - 1));

const hasAnswer = (q, entry) => {
  if (!q) return false;
  if (q.type === 'multiple_choice') return Array.isArray(entry?.answer) && entry.answer.length > 0;
  if (q.type === 'slider' || q.type === 'scale') return !!entry?.touched;
  return String(entry?.answer ?? '').trim().length > 0;
};

const isAutoAdvanceType = (q) => {
  const t = String(q?.type || '').toLowerCase();
  return ['likert', 'select', 'radio', 'nps', 'rating', 'slider', 'scale'].includes(t);
};

const sliderTicks = (q) => {
  const min = Number(q?.scale?.min || 1);
  const max = Number(q?.scale?.max || 10);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const start = Math.min(min, max);
  const end = Math.max(min, max);
  const span = end - start;
  if (span > 20) {
    return [start, end];
  }
  const out = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
};

const load = async () => {
  const r = await api.get('/surveys/my-pending');
  pending.value = Array.isArray(r.data) ? r.data : [];
  hydrateCurrent();
  if (props.splash && pending.value.length) {
    open.value = true;
  }
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
    // Hide for current view/session; backend keeps it for next-login reminder.
    pending.value = pending.value.filter((p) => Number(p?.id) !== Number(current.value?.id));
    hydrateCurrent();
    if (!pending.value.length) open.value = false;
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
    showThanks.value = true;
    thanksLeaving.value = false;
    await new Promise((resolve) => setTimeout(resolve, 1700));
    thanksLeaving.value = true;
    await new Promise((resolve) => setTimeout(resolve, 800));
    showThanks.value = false;
    open.value = false;
    await load();
  } finally {
    saving.value = false;
  }
};

const maybeAdvanceAfterAnswer = async (q) => {
  if (!props.splash || !q || !isAutoAdvanceType(q)) return;
  const entry = answers.value[q.id] || {};
  if (q.required && !hasAnswer(q, entry)) return;
  if (isLastSplashQuestion.value) {
    await submitCurrent();
    return;
  }
  splashError.value = '';
  splashIndex.value += 1;
};

const selectAndAdvance = async (q, value) => {
  if (!q?.id) return;
  if (!answers.value[q.id]) answers.value[q.id] = { answer: '', quoteMe: false, touched: false };
  answers.value[q.id].answer = String(value ?? '');
  if (q.type === 'slider' || q.type === 'scale') {
    answers.value[q.id].touched = true;
  }
  splashError.value = '';
  await maybeAdvanceAfterAnswer(q);
};

const onSliderChange = async (q) => {
  if (!q?.id) return;
  if (!answers.value[q.id]) answers.value[q.id] = { answer: '', quoteMe: false, touched: false };
  answers.value[q.id].touched = true;
  splashError.value = '';
  await maybeAdvanceAfterAnswer(q);
};

const nextSplashStep = async () => {
  if (!activeQuestion.value) return;
  const q = activeQuestion.value;
  const entry = answers.value[q.id] || {};
  if (q.required && !hasAnswer(q, entry)) {
    splashError.value = 'Please answer this required question before continuing.';
    return;
  }
  splashError.value = '';
  if (isLastSplashQuestion.value) {
    await submitCurrent();
    return;
  }
  splashIndex.value += 1;
};

onMounted(load);
</script>

<style scoped>
.survey-prompt-card { border: 1px solid #dbe3ef; border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 14px; }
.survey-splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: rgba(2, 6, 23, 0.56);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.survey-prompt-splash {
  width: min(720px, 95vw);
  max-height: calc(100vh - 40px);
  overflow: auto;
  margin: 0;
  box-shadow: 0 22px 56px rgba(2, 6, 23, 0.45);
}
.head { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.q { margin: 10px 0; display: grid; gap: 6px; }
.q input[type="text"], .q textarea, .q select { width: 100%; }
.multi { display: grid; gap: 6px; }
.quote { font-size: .9rem; color: #475569; display: flex; align-items: center; gap: 6px; }
.muted { color: #64748b; font-size: .9rem; }
.error-inline { color: #b91c1c; font-size: .86rem; margin-top: 4px; }
.likert-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}
.likert-btn {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #1f2937;
  font-weight: 600;
  font-size: 14px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: center;
}
.likert-btn.selected {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
}
.slider-scale-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  color: #64748b;
  font-size: 12px;
  user-select: none;
}
.slider-scale-tick {
  min-width: 12px;
  text-align: center;
}
.thanks-bubble-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 230px;
  padding: 10px;
}
.thanks-bubble {
  max-width: 460px;
  width: min(92vw, 460px);
  border-radius: 999px;
  border: 1px solid #93c5fd;
  background: linear-gradient(135deg, #ecfeff 0%, #e0f2fe 100%);
  color: #0f172a;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.2);
  padding: 18px 24px;
  text-align: center;
  animation: bubble-pop 260ms ease-out;
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.thanks-bubble.leaving {
  opacity: 0;
  transform: scale(1.15);
}
.thanks-icon {
  font-size: 1.4rem;
  line-height: 1;
  margin-bottom: 6px;
}
.thanks-title {
  font-weight: 700;
  font-size: 1.06rem;
}
.thanks-sub {
  margin-top: 4px;
}
@keyframes bubble-pop {
  0% { transform: scale(0.94); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
