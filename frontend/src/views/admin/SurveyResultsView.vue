<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Survey Results</h1>
        <p class="subtitle">{{ survey?.title || 'Survey' }}</p>
      </div>
      <div class="top-actions no-print">
        <button class="btn btn-secondary" type="button" @click="downloadCsv" :disabled="!responses.length">Export CSV</button>
        <button class="btn btn-secondary" type="button" @click="printResults" :disabled="!responses.length">Print</button>
        <router-link class="btn btn-secondary" :to="surveysPath">Back to surveys</router-link>
      </div>
    </div>

    <div v-if="loading" class="muted">Loading results...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <section class="section summary-grid">
        <div class="summary-card">
          <div class="summary-label">Total responses</div>
          <div class="summary-value">{{ responses.length }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Sent surveys</div>
          <div class="summary-value">{{ pushes.length }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Accepted</div>
          <div class="summary-value">{{ acceptedCount }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Dismissed</div>
          <div class="summary-value">{{ dismissedCount }}</div>
        </div>
      </section>

      <section class="section exec-summary no-screen">
        <div class="exec-head">
          <div>
            <h2>Executive Summary</h2>
            <div class="muted">Survey: {{ survey?.title || 'Survey' }}</div>
          </div>
          <div class="muted">Printed: {{ printDate }}</div>
        </div>
        <div class="exec-stats">
          <div class="exec-stat"><strong>{{ pushes.length }}</strong><span>Sent</span></div>
          <div class="exec-stat"><strong>{{ acceptedCount }}</strong><span>Accepted</span></div>
          <div class="exec-stat"><strong>{{ dismissedCount }}</strong><span>Dismissed</span></div>
          <div class="exec-stat"><strong>{{ responseRate }}%</strong><span>Response rate</span></div>
        </div>
        <div v-if="survey?.is_scored && scoreSeries.length" class="exec-score">
          <div class="exec-score-title">Score trend</div>
          <svg viewBox="0 0 300 60" class="exec-dot-chart" preserveAspectRatio="none">
            <line x1="0" y1="52" x2="300" y2="52" stroke="#cbd5e1" stroke-width="1" />
            <circle
              v-for="point in scoreDotPoints"
              :key="`score-dot-${point.x}-${point.y}`"
              :cx="point.x"
              :cy="point.y"
              r="2.8"
              fill="#2563eb"
            />
          </svg>
        </div>
        <div class="exec-table-wrap">
          <table class="table exec-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Type</th>
                <th>Key result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in execSummaryRows" :key="`exec-${row.id}`">
                <td>{{ row.label }}</td>
                <td>{{ row.type }}</td>
                <td>{{ row.summary }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

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
        <h3>Score Trend</h3>
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
          <div class="muted small">Min: {{ scoreMin }} · Max: {{ scoreMax }} · Avg: {{ scoreAverage }}</div>
        </div>
        <div v-else class="muted">No scored responses available yet.</div>
      </section>

      <section class="section">
        <h3>Question Analytics</h3>
        <div v-if="questionAnalytics.length" class="analytics-grid">
          <article v-for="qa in questionAnalytics" :key="qa.id" class="analytics-card">
            <div class="analytics-head">
              <div>
                <strong>{{ qa.label }}</strong>
                <div class="muted small">{{ qa.typeLabel }}</div>
              </div>
              <div class="analytics-controls no-print">
                <template v-if="qa.kind === 'numeric'">
                  <button
                    type="button"
                    class="mini-toggle"
                    :class="{ active: getChartMode(qa, 'bars') === 'bars' }"
                    @click="setChartMode(qa.id, 'bars')"
                  >
                    Bars
                  </button>
                  <button
                    type="button"
                    class="mini-toggle"
                    :class="{ active: getChartMode(qa, 'bars') === 'columns' }"
                    @click="setChartMode(qa.id, 'columns')"
                  >
                    Columns
                  </button>
                </template>
                <template v-else-if="qa.kind === 'choice'">
                  <button
                    type="button"
                    class="mini-toggle"
                    :class="{ active: getChartMode(qa, 'bars') === 'bars' }"
                    @click="setChartMode(qa.id, 'bars')"
                  >
                    Bars
                  </button>
                  <button
                    type="button"
                    class="mini-toggle"
                    :class="{ active: getChartMode(qa, 'bars') === 'pie' }"
                    @click="setChartMode(qa.id, 'pie')"
                  >
                    Pie
                  </button>
                </template>
              </div>
            </div>

            <template v-if="qa.kind === 'numeric'">
              <div class="stats-row">
                <span>Average: <strong>{{ qa.average }}</strong></span>
                <span>Min: <strong>{{ qa.min ?? '-' }}</strong></span>
                <span>Max: <strong>{{ qa.max ?? '-' }}</strong></span>
                <span>Responses: <strong>{{ qa.count }}</strong></span>
                <span>Std dev: <strong>{{ qa.stddev }}</strong></span>
              </div>
              <div v-if="getChartMode(qa, 'bars') === 'bars'" class="bars">
                <div v-for="bucket in qa.buckets" :key="`${qa.id}-${bucket.label}`" class="bar-row">
                  <span class="bar-label">{{ bucket.label }}</span>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: `${bucket.percent}%` }"></div>
                  </div>
                  <span class="bar-value">{{ bucket.count }}</span>
                </div>
              </div>
              <svg
                v-else
                viewBox="0 0 300 160"
                preserveAspectRatio="none"
                class="column-chart"
              >
                <line x1="24" y1="132" x2="294" y2="132" stroke="#cbd5e1" stroke-width="1" />
                <line x1="24" y1="12" x2="24" y2="132" stroke="#cbd5e1" stroke-width="1" />
                <line
                  :x1="24"
                  :x2="294"
                  :y1="numericColumnModel(qa).avgY"
                  :y2="numericColumnModel(qa).avgY"
                  stroke="#0f766e"
                  stroke-width="1"
                  stroke-dasharray="3 2"
                />
                <rect
                  v-for="bar in numericColumnModel(qa).bars"
                  :key="`col-${qa.id}-${bar.label}`"
                  :x="bar.x"
                  :y="bar.y"
                  :width="bar.width"
                  :height="bar.height"
                  rx="2"
                  fill="#60a5fa"
                />
                <text
                  v-for="bar in numericColumnModel(qa).bars"
                  :key="`col-label-${qa.id}-${bar.label}`"
                  :x="bar.x + (bar.width / 2)"
                  y="148"
                  text-anchor="middle"
                  class="svg-label"
                >
                  {{ bar.label }}
                </text>
              </svg>
            </template>

            <template v-else-if="qa.kind === 'choice'">
              <div v-if="getChartMode(qa, 'bars') === 'bars'" class="bars">
                <div v-for="item in qa.options" :key="`${qa.id}-${item.label}`" class="bar-row">
                  <span class="bar-label">{{ item.label }}</span>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: `${item.percent}%` }"></div>
                  </div>
                  <span class="bar-value">{{ item.count }} ({{ item.percent }}%)</span>
                </div>
              </div>
              <div v-else class="pie-wrap">
                <svg viewBox="0 0 300 160" preserveAspectRatio="none" class="pie-chart">
                  <g transform="translate(80,80)">
                    <circle cx="0" cy="0" r="46" fill="none" stroke="#e2e8f0" stroke-width="26" />
                    <circle
                      v-for="seg in choicePieSegments(qa)"
                      :key="`pie-${qa.id}-${seg.label}`"
                      cx="0"
                      cy="0"
                      r="46"
                      fill="none"
                      :stroke="seg.color"
                      stroke-width="26"
                      :stroke-dasharray="seg.dasharray"
                      :stroke-dashoffset="seg.dashoffset"
                      transform="rotate(-90)"
                    />
                  </g>
                </svg>
                <div class="pie-legend">
                  <div v-for="(item, idx) in qa.options" :key="`legend-${qa.id}-${item.label}`" class="pie-legend-item">
                    <span class="pie-swatch" :style="{ background: pieColorForIndex(idx) }"></span>
                    <span>{{ item.label }} — {{ item.count }} ({{ item.percent }}%)</span>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <div v-if="qa.responses.length" class="text-list">
                <div v-for="(item, idx) in qa.responses" :key="`${qa.id}-text-${idx}`" class="text-answer">
                  {{ item.answer }}<span v-if="item.quoteMe" class="quote-tag">quote me</span>
                </div>
              </div>
              <div v-else class="muted">No written responses yet.</div>
            </template>
          </article>
        </div>
        <div v-else class="muted">No question analytics yet.</div>
      </section>

      <section class="section">
        <div class="section-head">
          <h3>All Responses</h3>
          <button class="btn btn-secondary btn-sm no-print" type="button" @click="showAllResponses = !showAllResponses">
            {{ showAllResponses ? 'Hide all results' : 'Display all results' }}
          </button>
        </div>
        <div v-if="showAllResponses || printMode" class="table-wrap">
          <table class="table responses-table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Responder</th>
                <th>Total score</th>
                <th v-for="q in surveyQuestions" :key="`head-${q.id}`">{{ q.label || q.id }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in responses" :key="r.id">
                <td>{{ fmtDateTime(r.submitted_at || r.created_at) }}</td>
                <td>{{ responderLabel(r) }}</td>
                <td>{{ r.total_score ?? '-' }}</td>
                <td v-for="q in surveyQuestions" :key="`cell-${r.id}-${q.id}`">
                  {{ formatAnswer(answerForQuestion(r, q.id)) }}
                </td>
              </tr>
              <tr v-if="!responses.length">
                <td :colspan="3 + surveyQuestions.length" class="muted">No responses yet.</td>
              </tr>
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
const showAllResponses = ref(false);
const printMode = ref(false);
const chartModes = ref({});

const NUMERIC_TYPES = new Set(['slider', 'scale', 'rating', 'nps', 'likert']);
const CHOICE_TYPES = new Set(['select', 'radio', 'multiple_choice']);
const TEXT_TYPES = new Set(['text', 'textarea', 'written', 'open_ended']);

const surveyId = computed(() => Number(route.params.id || 0));
const surveysPath = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/surveys` : '/admin/surveys';
});

const parseJsonMaybe = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const fmtDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '-';
};

const formatAnswer = (value) => {
  if (value && typeof value === 'object' && 'answer' in value) {
    const quote = value.quoteMe ? ' (quote me)' : '';
    return `${value.answer ?? ''}${quote}`.trim();
  }
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value);
};

const baseAnswer = (value) => {
  if (value && typeof value === 'object' && 'answer' in value) return value.answer;
  return value;
};

const responderLabel = (r) => {
  const name = `${r.first_name || ''} ${r.last_name || ''}`.trim();
  if (name) return name;
  if (r.email) return r.email;
  return r.respondent_user_id ? `User ${r.respondent_user_id}` : 'Anonymous';
};

const surveyQuestions = computed(() => {
  const q = parseJsonMaybe(survey.value?.questions_json);
  return Array.isArray(q) ? q : [];
});

const answerForQuestion = (response, qid) => {
  const data = parseJsonMaybe(response?.response_data_json);
  if (!data || typeof data !== 'object') return '';
  return data[String(qid)] ?? data[Number(qid)] ?? '';
};

const scoreSeries = computed(() =>
  responses.value
    .map((r) => Number(r.total_score))
    .filter((n) => Number.isFinite(n))
);

const scoreMin = computed(() => scoreSeries.value.length ? Math.min(...scoreSeries.value) : 0);
const scoreMax = computed(() => scoreSeries.value.length ? Math.max(...scoreSeries.value) : 0);
const scoreAverage = computed(() => {
  if (!scoreSeries.value.length) return '-';
  const sum = scoreSeries.value.reduce((acc, n) => acc + n, 0);
  return (sum / scoreSeries.value.length).toFixed(2);
});
const printDate = computed(() => new Date().toLocaleString());
const responseRate = computed(() => {
  if (!pushes.value.length) return 0;
  return Math.round((responses.value.length / pushes.value.length) * 100);
});

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
const scoreDotPoints = computed(() => {
  const data = scoreSeries.value;
  if (!data.length) return [];
  const min = scoreMin.value;
  const max = scoreMax.value;
  const span = max - min || 1;
  return data.map((v, idx) => {
    const x = data.length === 1 ? 150 : 10 + ((idx / (data.length - 1)) * 280);
    const y = 52 - (((v - min) / span) * 40);
    return { x, y };
  });
});

const acceptedCount = computed(() => pushes.value.filter((p) => String(p.status || '') === 'accepted').length);
const dismissedCount = computed(() => pushes.value.filter((p) => String(p.status || '') === 'dismissed').length);

const roundPercent = (count, total) => {
  if (!total) return 0;
  return Math.round((count / total) * 100);
};

const questionAnalytics = computed(() => {
  return surveyQuestions.value.map((q) => {
    const type = String(q?.type || '').toLowerCase();
    const rawValues = responses.value.map((r) => answerForQuestion(r, q.id));

    if (NUMERIC_TYPES.has(type)) {
      const numbers = rawValues
        .map((v) => Number(baseAnswer(v)))
        .filter((n) => Number.isFinite(n));
      const count = numbers.length;
      const avg = count ? numbers.reduce((a, b) => a + b, 0) / count : null;
      const variance = count
        ? numbers.reduce((acc, n) => acc + ((n - avg) ** 2), 0) / count
        : null;
      const min = count ? Math.min(...numbers) : null;
      const max = count ? Math.max(...numbers) : null;

      const scaleMin = Number(q?.scale?.min);
      const scaleMax = Number(q?.scale?.max);
      const rangeMin = Number.isFinite(scaleMin) ? scaleMin : (min ?? 1);
      const rangeMax = Number.isFinite(scaleMax) ? scaleMax : (max ?? rangeMin);
      const span = Math.max(1, rangeMax - rangeMin);
      const useIntegerBuckets = span <= 20;
      const bins = useIntegerBuckets ? (span + 1) : 10;
      const counts = Array.from({ length: bins }, () => 0);

      numbers.forEach((n) => {
        if (useIntegerBuckets) {
          const index = Math.min(bins - 1, Math.max(0, Math.round(n - rangeMin)));
          counts[index] += 1;
        } else {
          const norm = (n - rangeMin) / span;
          const index = Math.min(bins - 1, Math.max(0, Math.floor(norm * bins)));
          counts[index] += 1;
        }
      });

      const buckets = counts.map((c, i) => {
        const label = useIntegerBuckets
          ? String(rangeMin + i)
          : `${(rangeMin + ((span / bins) * i)).toFixed(1)}-${(rangeMin + ((span / bins) * (i + 1))).toFixed(1)}`;
        return {
          label,
          count: c,
          percent: roundPercent(c, count)
        };
      });

      return {
        id: q.id,
        label: q.label || String(q.id),
        typeLabel: type || 'numeric',
        kind: 'numeric',
        average: avg == null ? '-' : avg.toFixed(2),
        stddev: variance == null ? '-' : Math.sqrt(variance).toFixed(2),
        min,
        max,
        count,
        buckets
      };
    }

    if (CHOICE_TYPES.has(type)) {
      const map = new Map();
      rawValues.forEach((v) => {
        const base = baseAnswer(v);
        const items = Array.isArray(base) ? base : [base];
        items.forEach((item) => {
          const key = String(item ?? '').trim();
          if (!key) return;
          map.set(key, (map.get(key) || 0) + 1);
        });
      });
      const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
      const options = Array.from(map.entries())
        .map(([label, count]) => ({ label, count, percent: roundPercent(count, total) }))
        .sort((a, b) => b.count - a.count);
      return {
        id: q.id,
        label: q.label || String(q.id),
        typeLabel: type || 'choice',
        kind: 'choice',
        options
      };
    }

    const textResponses = rawValues
      .map((v) => {
        if (v && typeof v === 'object' && 'answer' in v) {
          return { answer: String(v.answer ?? '').trim(), quoteMe: !!v.quoteMe };
        }
        return { answer: String(v ?? '').trim(), quoteMe: false };
      })
      .filter((v) => v.answer.length > 0);

    return {
      id: q.id,
      label: q.label || String(q.id),
      typeLabel: TEXT_TYPES.has(type) ? type : (type || 'text'),
      kind: 'text',
      responses: textResponses
    };
  });
});

const pieColorForIndex = (index) => {
  const colors = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e', '#f97316'];
  return colors[index % colors.length];
};

const getChartMode = (qa, fallback = 'bars') => {
  return chartModes.value[String(qa?.id || '')] || fallback;
};

const setChartMode = (qid, mode) => {
  chartModes.value[String(qid)] = mode;
};

const numericColumnModel = (qa) => {
  const buckets = Array.isArray(qa?.buckets) ? qa.buckets : [];
  if (!buckets.length) return { bars: [], avgY: 132 };
  const maxCount = Math.max(...buckets.map((b) => Number(b.count || 0)), 1);
  const slot = 270 / buckets.length;
  const barWidth = Math.max(6, slot - 6);
  const bars = buckets.map((b, idx) => {
    const h = (Number(b.count || 0) / maxCount) * 112;
    const x = 24 + (idx * slot) + ((slot - barWidth) / 2);
    const y = 132 - h;
    return { x, y, width: barWidth, height: Math.max(0, h), label: b.label };
  });
  const maxAxisValue = Math.max(...buckets.map((b) => Number(b.label) || 0), 1);
  const avgNum = Number(qa?.average || 0);
  const avgY = Number.isFinite(avgNum) ? (132 - ((avgNum / maxAxisValue) * 112)) : 132;
  return { bars, avgY: Math.max(12, Math.min(132, avgY)) };
};

const choicePieSegments = (qa) => {
  const opts = Array.isArray(qa?.options) ? qa.options : [];
  const total = opts.reduce((acc, o) => acc + Number(o.count || 0), 0);
  if (!total) return [];
  const circumference = 2 * Math.PI * 46;
  let offset = 0;
  return opts.map((opt, idx) => {
    const portion = Number(opt.count || 0) / total;
    const arc = portion * circumference;
    const seg = {
      label: opt.label,
      color: pieColorForIndex(idx),
      dasharray: `${arc} ${Math.max(0, circumference - arc)}`,
      dashoffset: -offset
    };
    offset += arc;
    return seg;
  });
};

const execSummaryRows = computed(() => {
  return questionAnalytics.value.map((qa) => {
    if (qa.kind === 'numeric') {
      return {
        id: qa.id,
        label: qa.label,
        type: qa.typeLabel,
        summary: `Average ${qa.average}, std dev ${qa.stddev}, min ${qa.min ?? '-'}, max ${qa.max ?? '-'} (n=${qa.count})`
      };
    }
    if (qa.kind === 'choice') {
      const top = Array.isArray(qa.options) && qa.options.length ? qa.options[0] : null;
      return {
        id: qa.id,
        label: qa.label,
        type: qa.typeLabel,
        summary: top ? `Top: ${top.label} (${top.percent}%, n=${top.count})` : 'No responses yet.'
      };
    }
    const samples = Array.isArray(qa.responses)
      ? qa.responses.slice(0, 3).map((x) => x.answer).filter(Boolean)
      : [];
    return {
      id: qa.id,
      label: qa.label,
      type: qa.typeLabel,
      summary: samples.length ? `Samples: ${samples.join(' | ')}` : 'No written responses yet.'
    };
  });
});

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (!text.includes('"') && !text.includes(',') && !text.includes('\n')) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = () => {
  const headers = ['Submitted', 'Responder', 'Total Score', ...surveyQuestions.value.map((q) => q.label || q.id)];
  const rows = responses.value.map((r) => {
    const base = [
      fmtDateTime(r.submitted_at || r.created_at),
      responderLabel(r),
      r.total_score ?? ''
    ];
    const answerCols = surveyQuestions.value.map((q) => formatAnswer(answerForQuestion(r, q.id)));
    return [...base, ...answerCols];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `survey-results-${surveyId.value}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const printResults = async () => {
  printMode.value = true;
  showAllResponses.value = true;
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  window.print();
  printMode.value = false;
};

const fetchData = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [respPushes, respResponses] = await Promise.all([
      api.get(`/surveys/${surveyId.value}/pushes`),
      api.get(`/surveys/${surveyId.value}/responses`)
    ]);
    pushes.value = Array.isArray(respPushes.data) ? respPushes.data : [];
    const surveyRaw = respResponses.data?.survey || null;
    survey.value = surveyRaw ? { ...surveyRaw, questions_json: parseJsonMaybe(surveyRaw.questions_json) || [] } : null;
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
.small { font-size: .85rem; }
.top-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.summary-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
}
.summary-label { color: #64748b; font-size: .84rem; }
.summary-value { font-size: 1.45rem; font-weight: 700; color: #0f172a; }
.chart-block { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 12px; background: #fff; }
.sparkline { width: 100%; height: 90px; background: #f8fafc; border-radius: 6px; }

.analytics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.analytics-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}
.analytics-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.analytics-controls {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.mini-toggle {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  font-size: .75rem;
  padding: 4px 8px;
  border-radius: 999px;
  cursor: pointer;
}
.mini-toggle.active {
  border-color: #2563eb;
  color: #1d4ed8;
  background: #eff6ff;
}
.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: .88rem;
  margin-bottom: 10px;
}
.bars { display: grid; gap: 7px; }
.bar-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 8px;
  align-items: center;
}
.bar-label {
  color: #334155;
  font-size: .84rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #38bdf8);
}
.bar-value { font-size: .82rem; color: #334155; }
.column-chart {
  width: 100%;
  height: 170px;
  background: #f8fafc;
  border-radius: 10px;
}
.svg-label {
  font-size: 8px;
  fill: #475569;
}
.pie-wrap {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  align-items: center;
}
.pie-chart {
  width: 100%;
  height: 160px;
}
.pie-legend {
  display: grid;
  gap: 6px;
}
.pie-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: .82rem;
  color: #334155;
}
.pie-swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}
.text-list {
  max-height: 180px;
  overflow: auto;
  display: grid;
  gap: 7px;
}
.text-answer {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  font-size: .9rem;
}
.quote-tag {
  margin-left: 8px;
  font-size: .75rem;
  background: #ecfeff;
  color: #0f766e;
  border: 1px solid #99f6e4;
  padding: 2px 6px;
  border-radius: 999px;
}
.responses-table th,
.responses-table td {
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exec-summary {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.exec-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}
.exec-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.exec-stat {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  display: grid;
  gap: 4px;
}
.exec-stat strong {
  font-size: 1.1rem;
}
.exec-stat span {
  color: #64748b;
  font-size: .82rem;
}
.exec-score {
  margin-bottom: 10px;
}
.exec-score-title {
  font-size: .88rem;
  color: #334155;
  margin-bottom: 4px;
}
.exec-dot-chart {
  width: 100%;
  height: 60px;
  background: #f8fafc;
  border-radius: 6px;
}
.exec-table-wrap {
  overflow: auto;
}
.chart-title {
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}

@media screen {
  .no-screen {
    display: none !important;
  }
}

@media print {
  .no-screen {
    display: block !important;
  }
  .no-print {
    display: none !important;
  }
  .section {
    break-inside: avoid;
  }
  .table-wrap {
    overflow: visible !important;
  }
  .responses-table th,
  .responses-table td {
    white-space: normal;
  }
}
</style>
