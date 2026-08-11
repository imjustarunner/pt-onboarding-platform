<template>
  <div class="caw">
    <div class="caw-subnav" role="tablist">
      <button type="button" class="caw-subtab" :class="{ active: panel === 'resume' }" @click="panel = 'resume'">Resume</button>
      <button type="button" class="caw-subtab" :class="{ active: panel === 'summary' }" @click="panel = 'summary'">AI Summary</button>
      <button type="button" class="caw-subtab" :class="{ active: panel === 'prescreen' }" @click="panel = 'prescreen'">Pre-Screen</button>
    </div>

    <!-- Resume -->
    <div v-show="panel === 'resume'" class="caw-panel">
      <CandidateResumeWorkspace
        :resumes="resumes"
        :loading="loading"
        :uploading="uploading"
        :pasting="pasting"
        :error="error"
        :notes="notes"
        :tasks="tasks"
        :summary-bullets="summaryBullets"
        :summary-error="summaryError"
        :summary-generating="summaryGenerating"
        :re-extracting="reExtracting"
        :resolve-viewer-url="resolveViewerUrl"
        @upload="$emit('upload', $event)"
        @paste="$emit('paste', $event)"
        @delete="$emit('delete', $event)"
        @goto-tab="onGotoTab"
        @generate-summary="onGenerateSummary"
        @re-extract="$emit('re-extract', $event)"
      />
    </div>

    <!-- AI Summary -->
    <div v-show="panel === 'summary'" class="caw-panel">
      <div class="info-banner">
        <strong>Internal-only.</strong> AI-structured summary from resume text. Verify against the source resume.
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="panel = 'resume'">Back to resume</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="summaryGenerating" @click="$emit('generate-summary')">
          {{ summaryGenerating ? 'Generating…' : (resumeSummary ? 'Regenerate summary' : 'Generate summary') }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="panel = 'prescreen'">Open pre-screen</button>
      </div>
      <div v-if="summaryError" class="error-banner">{{ summaryError }}</div>
      <div v-if="summaryLoading" class="loading">Loading summary…</div>
      <div v-else-if="!resumeSummary" class="empty">
        No resume summary yet. Upload or paste a text-based resume — summary generates automatically — or click Generate.
      </div>
      <div v-else class="summary-grid">
        <div class="summary-card" v-if="bioHighlights.length">
          <div class="summary-title">Bio highlights</div>
          <ul class="summary-bullets">
            <li v-for="(b, i) in bioHighlights" :key="`bio_${i}`">{{ b }}</li>
          </ul>
        </div>
        <div class="summary-card summary-snapshot">
          <div class="summary-title">Resume snapshot</div>
          <ul v-if="summaryBullets.length" class="summary-bullets">
            <li v-for="(bullet, idx) in summaryBullets" :key="`snap_${idx}`">{{ bullet }}</li>
          </ul>
          <div v-else class="empty">No quick snapshot available yet.</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Skills analysis</div>
          <div class="small">{{ (structured.skills || []).join(', ') || '—' }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Experience analysis</div>
          <div v-if="!(structured.workHistory || []).length" class="empty">No work history extracted.</div>
          <div v-else class="summary-list">
            <div v-for="(w, idx) in structured.workHistory" :key="idx" class="summary-item">
              <div class="name">{{ w.title || 'Role' }} <span class="muted small">at</span> {{ w.employer || '—' }}</div>
              <div class="muted small">{{ [w.startDate, w.endDate].filter(Boolean).join(' – ') || '—' }} <span v-if="w.location">• {{ w.location }}</span></div>
              <div v-if="w.summary" class="small">{{ w.summary }}</div>
            </div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Strengths</div>
          <ul v-if="strengths.length" class="summary-bullets">
            <li v-for="(s, i) in strengths" :key="`st_${i}`">{{ s }}</li>
          </ul>
          <div v-else class="muted small">Derived from skills, credentials, and role history once summary is ready.</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Gaps / concerns</div>
          <ul v-if="gaps.length" class="summary-bullets">
            <li v-for="(g, i) in gaps" :key="`gap_${i}`">{{ g }}</li>
          </ul>
          <div v-else class="muted small">No major gaps flagged from the resume alone.</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Job-requirement alignment</div>
          <div class="small">{{ jobAlignment }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Credentialing hints</div>
          <div class="kv"><div class="k">Likely status</div><div class="v">{{ structured.credentialingHints?.likelyLicensureStatus || 'unknown' }}</div></div>
          <div class="kv"><div class="k">States</div><div class="v">{{ (structured.credentialingHints?.statesMentioned || []).join(', ') || '—' }}</div></div>
          <div class="kv">
            <div class="k">Needs supervision</div>
            <div class="v">
              {{ structured.credentialingHints?.needsSupervision == null
                ? '—'
                : (structured.credentialingHints.needsSupervision ? 'Yes' : 'No') }}
            </div>
          </div>
          <div v-if="structured.credentialingHints?.notesForCredentialingTeam" class="muted small" style="margin-top:6px;">
            {{ structured.credentialingHints.notesForCredentialingTeam }}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Education</div>
          <div v-if="!(structured.education || []).length" class="empty">No education extracted.</div>
          <div v-else class="summary-list">
            <div v-for="(ed, idx) in structured.education" :key="idx" class="summary-item">
              <div class="name">{{ ed.school || '—' }}</div>
              <div class="muted small">{{ [ed.degree, ed.field].filter(Boolean).join(' • ') || '—' }}</div>
            </div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Licenses & certifications</div>
          <div v-if="!(structured.licensesAndCertifications || []).length" class="empty">None extracted.</div>
          <div v-else class="summary-list">
            <div v-for="(lic, idx) in structured.licensesAndCertifications" :key="idx" class="summary-item">
              <div class="name">{{ lic.name || '—' }}</div>
              <div class="muted small">{{ [lic.state, lic.status].filter(Boolean).join(' • ') || '—' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pre-Screen -->
    <div v-show="panel === 'prescreen'" class="caw-panel">
      <div class="info-banner">
        <strong>AI-Generated Pre-Screen.</strong> Information may be inaccurate. Verify manually. Includes public Psychology Today search when relevant.
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="panel = 'summary'">Back to summary</button>
        <button type="button" class="btn btn-primary" :disabled="prescreenGenerating" @click="$emit('generate-prescreen')">
          {{ prescreenGenerating ? 'Generating…' : (latestPreScreen ? 'Re-run pre-screen report' : 'Generate pre-screen report') }}
        </button>
      </div>
      <div class="prescreen-form">
        <label class="small">LinkedIn URL</label>
        <input :value="linkedInUrl" class="input" placeholder="https://www.linkedin.com/in/..." @input="$emit('update:linkedInUrl', $event.target.value)" />
        <label class="small">City / State</label>
        <input :value="location" class="input" placeholder="e.g., Denver, CO" @input="$emit('update:location', $event.target.value)" />
        <label class="small">Psychology Today URL</label>
        <input :value="psychologyTodayUrl" class="input" placeholder="https://www.psychologytoday.com/us/therapists/..." @input="$emit('update:psychologyTodayUrl', $event.target.value)" />
        <p class="muted small">Optional. If blank, the report will try to find a matching public Psychology Today profile.</p>
      </div>
      <div class="kv">
        <div class="k">Latest status</div>
        <div class="v">{{ latestPreScreen?.status || '—' }}</div>
      </div>
      <div class="kv">
        <div class="k">Created</div>
        <div class="v">{{ latestPreScreen?.created_at ? formatWhen(latestPreScreen.created_at) : '—' }}</div>
      </div>
      <div v-if="searchSuggestionsHtml" class="search-suggestions">
        <div class="muted small" style="margin-bottom:6px;">Search suggestions:</div>
        <div v-html="searchSuggestionsHtml"></div>
      </div>
      <div class="research-box">
        <div v-if="prescreenHtml" class="markdown" v-html="prescreenHtml"></div>
        <div v-else class="muted small">
          No pre-screen report yet. It can run automatically after the first resume summary, or click Generate / Re-run above (add LinkedIn or Psychology Today if helpful).
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import CandidateResumeWorkspace from './CandidateResumeWorkspace.vue';

const props = defineProps({
  resumes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  pasting: { type: Boolean, default: false },
  error: { type: String, default: '' },
  notes: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  summaryBullets: { type: Array, default: () => [] },
  summaryError: { type: String, default: '' },
  summaryGenerating: { type: Boolean, default: false },
  reExtracting: { type: Boolean, default: false },
  summaryLoading: { type: Boolean, default: false },
  resumeSummary: { type: Object, default: null },
  jobTitle: { type: String, default: '' },
  latestPreScreen: { type: Object, default: null },
  prescreenGenerating: { type: Boolean, default: false },
  prescreenHtml: { type: String, default: '' },
  searchSuggestionsHtml: { type: String, default: '' },
  linkedInUrl: { type: String, default: '' },
  psychologyTodayUrl: { type: String, default: '' },
  location: { type: String, default: '' },
  initialPanel: { type: String, default: 'resume' },
  resolveViewerUrl: { type: Function, required: true }
});

const emit = defineEmits([
  'upload',
  'paste',
  'delete',
  'goto-tab',
  'generate-summary',
  'generate-prescreen',
  're-extract',
  'update:linkedInUrl',
  'update:psychologyTodayUrl',
  'update:location',
  'panel-change'
]);

const panel = ref(['resume', 'summary', 'prescreen'].includes(props.initialPanel) ? props.initialPanel : 'resume');

watch(
  () => props.initialPanel,
  (v) => {
    if (['resume', 'summary', 'prescreen'].includes(v)) panel.value = v;
  }
);

watch(panel, (v) => emit('panel-change', v));

const structured = computed(() => props.resumeSummary?.summary || {});

const bioHighlights = computed(() => {
  const raw = structured.value.bioHighlights || structured.value.bio_highlights || [];
  if (Array.isArray(raw) && raw.length) return raw.filter(Boolean).slice(0, 8);
  // Fallback: role summaries as bio-style highlights
  return (structured.value.workHistory || [])
    .map((w) => w.summary)
    .filter(Boolean)
    .slice(0, 4);
});

const strengths = computed(() => {
  const out = [];
  const skills = structured.value.skills || [];
  if (skills.length) out.push(`Relevant skills: ${skills.slice(0, 8).join(', ')}`);
  const certs = structured.value.licensesAndCertifications || [];
  if (certs.length) out.push(`Credentials listed: ${certs.map((c) => c.name).filter(Boolean).slice(0, 4).join(', ')}`);
  const edu = structured.value.education || [];
  if (edu.length) out.push(`Education: ${[edu[0]?.degree, edu[0]?.field, edu[0]?.school].filter(Boolean).join(' · ')}`);
  return out;
});

const gaps = computed(() => {
  const out = [];
  const hints = structured.value.credentialingHints || {};
  if (hints.needsSupervision === true) out.push('Resume suggests supervision may be required');
  if (hints.likelyLicensureStatus === 'intern' || hints.likelyLicensureStatus === 'associate') {
    out.push(`Licensure stage appears to be ${hints.likelyLicensureStatus}`);
  }
  if (!(structured.value.workHistory || []).length) out.push('No work history extracted from resume text');
  if (!(structured.value.skills || []).length) out.push('Few or no skills extracted');
  return out;
});

const jobAlignment = computed(() => {
  const job = String(props.jobTitle || '').trim();
  if (!job) return 'No job description linked — alignment is generic until a role is set.';
  const titles = (structured.value.workHistory || []).map((w) => String(w.title || '').toLowerCase());
  const skills = (structured.value.skills || []).map((s) => String(s).toLowerCase());
  const jobL = job.toLowerCase();
  const titleHit = titles.some((t) => t && (jobL.includes(t) || t.includes('mental') || t.includes('therap') || t.includes('social')));
  const skillHit = skills.some((s) => /crisis|therapy|counsel|clinical|mental|assessment/.test(s));
  if (titleHit || skillHit) {
    return `Signals align with “${job}” based on titles/skills in the resume. Confirm in interview and against the job description.`;
  }
  return `Limited automatic alignment to “${job}” from extracted titles/skills. Review experience details and pre-screen evidence.`;
});

function onGotoTab(t) {
  if (t === 'resumeSummary' || t === 'summary') {
    panel.value = 'summary';
    return;
  }
  if (t === 'prescreen') {
    panel.value = 'prescreen';
    return;
  }
  if (t === 'resume') {
    panel.value = 'resume';
    return;
  }
  emit('goto-tab', t);
}

function onGenerateSummary() {
  panel.value = 'summary';
  emit('generate-summary');
}

function formatWhen(v) {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v || '—');
  }
}

defineExpose({ setPanel: (p) => { if (['resume', 'summary', 'prescreen'].includes(p)) panel.value = p; } });
</script>

<style scoped>
.caw { display: flex; flex-direction: column; gap: 12px; }
.caw-subnav {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 8px;
}
.caw-subtab {
  border: 0;
  background: #f1f5f9;
  color: #475569;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.caw-subtab.active {
  background: #312e81;
  color: #fff;
}
.row-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.info-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a8a;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.summary-title { font-weight: 700; margin-bottom: 8px; }
.summary-bullets { margin: 0; padding-left: 18px; font-size: 13px; }
.summary-list { display: flex; flex-direction: column; gap: 8px; }
.summary-item .name { font-weight: 600; font-size: 13px; }
.prescreen-form {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  max-width: 640px;
}
.kv { display: grid; grid-template-columns: 140px 1fr; gap: 8px; margin: 6px 0; font-size: 13px; }
.k { color: #64748b; }
.research-box {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fafafa;
  margin-top: 10px;
}
.muted { color: #64748b; }
.small { font-size: 13px; }
.empty { color: #94a3b8; font-size: 13px; }
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) { margin: 0.8em 0 0.35em; font-size: 1rem; }
.markdown :deep(p),
.markdown :deep(li) { font-size: 13px; line-height: 1.45; }
.markdown :deep(ul) { padding-left: 1.2rem; }
@media (max-width: 900px) {
  .summary-grid { grid-template-columns: 1fr; }
}
</style>
