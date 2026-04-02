<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Survey Results</h1>
        <p class="subtitle">{{ survey?.title || 'Survey' }}</p>
      </div>
      <router-link class="btn btn-secondary" :to="surveysPath">Back to surveys</router-link>
    </div>

    <div v-if="loading" class="muted">Loading results...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <section class="section">
        <h3>Delivery Status</h3>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Seen</th>
                <th>Responded</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in pushes" :key="p.id">
                <td>{{ `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || `User ${p.user_id}` }}</td>
                <td>{{ p.role || '-' }}</td>
                <td>{{ p.status }}</td>
                <td>{{ fmtDateTime(p.seen_at) }}</td>
                <td>{{ fmtDateTime(p.responded_at) }}</td>
              </tr>
              <tr v-if="!pushes.length"><td colspan="5" class="muted">No push records yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h3>Responses</h3>
        <div v-if="survey?.is_scored && scoreSeries.length" class="chart-block">
          <div class="chart-title">Total score trend</div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" class="sparkline">
            <polyline
              fill="none"
              stroke="#2563eb"
              stroke-width="1.5"
              :points="sparklinePoints"
            />
          </svg>
          <div class="muted small">Min: {{ scoreMin }} · Max: {{ scoreMax }}</div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Responder</th>
                <th>Total score</th>
                <th>Answers</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in responses" :key="r.id">
                <td>{{ fmtDateTime(r.submitted_at || r.created_at) }}</td>
                <td>{{ responderLabel(r) }}</td>
                <td>{{ r.total_score ?? '-' }}</td>
                <td>
                  <details>
                    <summary>View</summary>
                    <div v-for="entry in answerEntries(r.response_data_json)" :key="entry.key" class="answer-row">
                      <strong>{{ questionLabel(entry.key) }}</strong>: {{ formatAnswer(entry.value) }}
                    </div>
                  </details>
                </td>
              </tr>
              <tr v-if="!responses.length"><td colspan="4" class="muted">No responses yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const survey = ref(null);
const pushes = ref([]);
const responses = ref([]);
const loading = ref(false);
const error = ref('');

const surveyId = computed(() => Number(route.params.id || 0));
const surveysPath = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/surveys` : '/admin/surveys';
});

const fmtDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '-';
};

const answerEntries = (obj) => (obj && typeof obj === 'object' ? Object.entries(obj) : []);

const formatAnswer = (value) => {
  if (value && typeof value === 'object' && 'answer' in value) {
    const quote = value.quoteMe ? ' (quote me)' : '';
    return `${value.answer ?? ''}${quote}`;
  }
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value);
};

const responderLabel = (r) => {
  const name = `${r.first_name || ''} ${r.last_name || ''}`.trim();
  if (name) return name;
  if (r.email) return r.email;
  return r.respondent_user_id ? `User ${r.respondent_user_id}` : 'Anonymous';
};

const questionLabel = (qid) => {
  const q = Array.isArray(survey.value?.questions_json)
    ? survey.value.questions_json.find((x) => String(x?.id || '') === String(qid))
    : null;
  return q?.label || String(qid);
};

const scoreSeries = computed(() =>
  responses.value
    .map((r) => Number(r.total_score))
    .filter((n) => Number.isFinite(n))
);

const scoreMin = computed(() => scoreSeries.value.length ? Math.min(...scoreSeries.value) : 0);
const scoreMax = computed(() => scoreSeries.value.length ? Math.max(...scoreSeries.value) : 0);

const sparklinePoints = computed(() => {
  const data = scoreSeries.value;
  if (!data.length) return '';
  if (data.length === 1) return '0,15 100,15';
  const min = scoreMin.value;
  const max = scoreMax.value;
  const span = max - min || 1;
  return data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 30 - (((v - min) / span) * 28 + 1);
    return `${x},${y}`;
  }).join(' ');
});

const fetchData = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [respPushes, respResponses] = await Promise.all([
      api.get(`/surveys/${surveyId.value}/pushes`),
      api.get(`/surveys/${surveyId.value}/responses`)
    ]);
    pushes.value = Array.isArray(respPushes.data) ? respPushes.data : [];
    survey.value = respResponses.data?.survey || null;
    responses.value = Array.isArray(respResponses.data?.responses) ? respResponses.data.responses : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load survey results';
  } finally {
    loading.value = false;
  }
};

onMounted(fetchData);
</script>

<style scoped>
.section { margin-bottom: 18px; }
.answer-row { margin: 6px 0; }
.chart-block { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
.sparkline { width: 100%; height: 80px; background: #f8fafc; border-radius: 6px; }
.small { font-size: .85rem; }
</style>
