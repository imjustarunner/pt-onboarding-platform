<template>
  <div class="los-panel">
    <div class="los-header">
      <div>
        <h3 class="los-title">Learning</h3>
        <p class="los-sub">Subject tracks, skill map, evaluations, plans, evidence, and family reports.</p>
      </div>
      <div class="los-tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="los-tab"
          :class="{ active: tab === t.id }"
          @click="onTab(t.id)"
        >{{ t.label }}</button>
      </div>
    </div>

    <p v-if="loading" class="los-muted">Loading learning record…</p>
    <p v-else-if="error" class="los-error">{{ error }}</p>

    <template v-else>
      <!-- Overview -->
      <div v-if="tab === 'overview'" class="los-section">
        <div v-if="!overview.length" class="los-empty">
          No subject tracks yet. Enroll a subject to start the learning record.
        </div>
        <div v-for="row in overview" :key="row.subject.id" class="los-card">
          <div class="los-card-head">
            <strong>{{ row.subject.subject_label }}</strong>
            <span class="los-badge">{{ statusLabel(row.subject.status) }}</span>
          </div>
          <div class="los-progress-row">
            <div class="los-progress-track">
              <div class="los-progress-fill" :style="{ width: `${row.progressPct || 0}%` }" />
            </div>
            <span class="los-muted">{{ row.progressPct || 0 }}%</span>
          </div>
          <p class="los-muted">
            Grade: {{ row.subject.school_grade || '—' }}
            · Goals: {{ row.goals?.length || 0 }}
            · Evidence: {{ row.recentEvidence?.length || 0 }}
          </p>
          <p v-if="row.currentFocus" class="los-muted">
            Current focus: {{ row.currentFocus.title }} ({{ statusLabel(row.currentFocus.status) }})
          </p>
          <p v-if="row.activePlan" class="los-muted">Active plan: {{ row.activePlan.title }}</p>
          <div v-if="row.openAlerts?.length" class="los-alerts">
            <div v-for="a in row.openAlerts" :key="a.id" class="los-alert">
              <strong>{{ a.title }}</strong>
              <button type="button" class="los-link" @click="ackAlert(a.id)">Acknowledge</button>
            </div>
          </div>
          <div class="los-actions">
            <button type="button" class="los-btn primary" @click="openWorkspace(row.subject)">Open workspace</button>
            <button type="button" class="los-btn" @click="selectSubject(row.subject); tab = 'plan'">Plan</button>
          </div>
        </div>
      </div>

      <!-- Subjects / enroll -->
      <div v-if="tab === 'subjects'" class="los-section">
        <form class="los-form" @submit.prevent="doEnroll">
          <h4>Enroll subject</h4>
          <div class="los-form-row">
            <select v-model="enroll.subjectKey" required>
              <option disabled value="">Subject</option>
              <option v-for="s in subjectKeys" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
            <input v-model="enroll.schoolGrade" placeholder="School grade" />
            <input v-model="enroll.reasonForTutoring" placeholder="Reason for tutoring" />
            <button class="los-btn primary" type="submit" :disabled="saving">Enroll</button>
          </div>
        </form>
        <div v-for="row in overview" :key="'s-' + row.subject.id" class="los-card">
          <div class="los-card-head">
            <strong>{{ row.subject.subject_label }}</strong>
            <span class="los-badge">{{ statusLabel(row.subject.status) }}</span>
          </div>
          <button type="button" class="los-link" @click="openWorkspace(row.subject)">Open workspace</button>
        </div>
      </div>

      <!-- Subject Workspace -->
      <div v-if="tab === 'workspace'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject from Overview or Subjects.</p>
        <template v-else-if="workspace">
          <div class="los-card los-workspace-hero">
            <div class="los-card-head">
              <div>
                <h4 class="los-h4">{{ workspace.subject.subject_label }} workspace</h4>
                <p class="los-muted">
                  Grade {{ workspace.subject.school_grade || '—' }}
                  · {{ statusLabel(workspace.subject.status) }}
                  · Plan: {{ workspace.activePlan?.title || 'None active' }}
                </p>
              </div>
              <span class="los-pct">{{ workspace.progressPct || 0 }}%</span>
            </div>
            <div class="los-progress-track tall">
              <div class="los-progress-fill" :style="{ width: `${workspace.progressPct || 0}%` }" />
            </div>
            <p v-if="workspace.nextRecommendation" class="los-next">
              <strong>Next recommendation:</strong>
              {{ workspace.nextRecommendation.suggestedFocus }}
            </p>
            <div class="los-actions">
              <button type="button" class="los-btn" @click="loadWorkspace">Refresh</button>
              <button type="button" class="los-btn" @click="tab = 'evaluations'">Evaluate</button>
              <button type="button" class="los-btn primary" @click="tab = 'plan'">Learning plan</button>
            </div>
          </div>

          <h4 class="los-h4">Skill map</h4>
          <div class="los-skill-map">
            <div
              v-for="sk in workspace.skillMap || []"
              :key="sk.goalId"
              class="los-skill"
              :class="'status-' + (sk.status || 'not_assessed')"
              @click="selectedSkillId = sk.goalId"
            >
              <div class="los-skill-title">{{ sk.title }}</div>
              <div class="los-skill-status">{{ statusLabel(sk.status) }}</div>
              <div class="los-muted">{{ sk.evidenceCount }} evidence · {{ masteryLabel(sk.goalId) }}</div>
            </div>
            <p v-if="!(workspace.skillMap || []).length" class="los-muted">No goals yet — complete a baseline or approve a plan.</p>
          </div>

          <div v-if="selectedSkillDetail" class="los-card">
            <h4 class="los-h4">{{ selectedSkillDetail.title }}</h4>
            <p class="los-muted">{{ selectedSkillDetail.successCriteria || 'No success criteria set.' }}</p>
            <p v-if="workspace.masteryByGoal?.[selectedSkillDetail.goalId]" class="los-mastery">
              {{ workspace.masteryByGoal[selectedSkillDetail.goalId].reason }}
              <em>(confidence: {{ workspace.masteryByGoal[selectedSkillDetail.goalId].confidence }})</em>
            </p>
            <button type="button" class="los-btn" :disabled="saving" @click="recomputeMastery(selectedSkillDetail.goalId)">
              Recompute mastery
            </button>
            <button type="button" class="los-btn primary" :disabled="saving" @click="assignPractice(selectedSkillDetail.goalId)">
              Assign practice
            </button>
          </div>

          <h4 class="los-h4">Learning timeline</h4>
          <div class="los-timeline">
            <div v-for="(ev, i) in workspace.timeline || []" :key="i" class="los-timeline-item">
              <span class="los-tl-type">{{ ev.type }}</span>
              <strong>{{ ev.title }}</strong>
              <span class="los-muted">{{ formatDate(ev.at) }} · {{ statusLabel(ev.status) }}</span>
            </div>
          </div>
        </template>
        <p v-else-if="workspaceLoading" class="los-muted">Loading workspace…</p>
      </div>

      <!-- Evaluations + Plan review -->
      <div v-if="tab === 'evaluations'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first.</p>
        <template v-else>
          <div class="los-actions">
            <button type="button" class="los-btn" @click="showBaseline = !showBaseline">Manual baseline</button>
            <button type="button" class="los-btn primary" @click="startQuickEval" :disabled="saving">Start evaluation player</button>
            <button type="button" class="los-btn" @click="tab = 'builder'">Assessment builder</button>
            <button type="button" class="los-btn" @click="runAiDraft" :disabled="saving">AI plan draft</button>
          </div>

          <form v-if="showBaseline" class="los-form" @submit.prevent="doBaseline">
            <h4>Manual baseline — {{ selectedSubject.subject_label }}</h4>
            <input v-model="baseline.strengthsText" placeholder="Strengths (comma-separated)" />
            <input v-model="baseline.needsText" placeholder="Priority needs (comma-separated)" />
            <textarea v-model="baseline.narrativeSummary" rows="3" placeholder="Narrative summary" />
            <input v-model="baseline.goalTitle" placeholder="First goal title" />
            <button class="los-btn primary" type="submit" :disabled="saving">Save baseline &amp; draft plan</button>
          </form>

          <!-- Evaluation player -->
          <div v-if="quickItems.length" class="los-eval-player">
            <div class="los-eval-progress">
              Item {{ Math.min(evalIndex + 1, quickItems.length) }} of {{ quickItems.length }}
            </div>
            <div v-if="currentEvalItem" class="los-card los-eval-card">
              <p class="los-eval-prompt">{{ currentEvalItem.prompt_text }}</p>
              <p class="los-muted">Skill: {{ currentEvalItem.skill_label || currentEvalItem.skill_key }}</p>
              <template v-if="currentEvalItem.item_type === 'multiple_choice'">
                <label
                  v-for="c in currentEvalItem.choices_json || []"
                  :key="c"
                  class="los-choice"
                  :class="{ selected: quickAnswers[currentEvalItem.id] === c }"
                >
                  <input type="radio" :name="'item-' + currentEvalItem.id" :value="c" v-model="quickAnswers[currentEvalItem.id]" />
                  {{ c }}
                </label>
              </template>
              <textarea
                v-else
                v-model="quickAnswers[currentEvalItem.id]"
                rows="3"
                placeholder="Student response / tutor observation"
              />
              <div class="los-actions">
                <button type="button" class="los-btn" :disabled="evalIndex === 0" @click="evalIndex -= 1">Back</button>
                <button
                  v-if="evalIndex < quickItems.length - 1"
                  type="button"
                  class="los-btn primary"
                  @click="evalIndex += 1"
                >Next</button>
                <button
                  v-else
                  type="button"
                  class="los-btn primary"
                  :disabled="saving"
                  @click="submitQuickEval"
                >Submit &amp; review plan</button>
              </div>
            </div>
          </div>

          <!-- Results + AI plan review split -->
          <div v-if="evalResults || aiDraft" class="los-split">
            <div class="los-card">
              <h4 class="los-h4">Evaluation results</h4>
              <template v-if="evalResults">
                <p class="los-muted">{{ evalResults.summary?.narrative_summary }}</p>
                <ul>
                  <li v-for="(sk, key) in skillMapFromEval" :key="key">
                    <strong>{{ sk.skillLabel || key }}</strong> — {{ statusLabel(sk.rating) }}
                    <span v-if="sk.correct === true" class="los-ok"> ✓</span>
                    <span v-else-if="sk.correct === false" class="los-bad"> ✗</span>
                  </li>
                </ul>
                <p v-if="evalResults.summary?.strengths_json?.length" class="los-muted">
                  Strengths: {{ (evalResults.summary.strengths_json || []).join(', ') }}
                </p>
                <p v-if="evalResults.summary?.needs_json?.length" class="los-muted">
                  Needs: {{ (evalResults.summary.needs_json || []).join(', ') }}
                </p>
              </template>
              <p v-else class="los-muted">Run an evaluation to see results here.</p>
            </div>
            <div class="los-card">
              <h4 class="los-h4">Proposed learning plan</h4>
              <p class="los-muted">AI draft only — tutor must approve before it becomes official.</p>
              <template v-if="aiDraft?.draft">
                <p><strong>{{ aiDraft.draft.title }}</strong></p>
                <p class="los-muted">{{ aiDraft.draft.parentSummary }}</p>
                <ul>
                  <li v-for="(g, i) in aiDraft.draft.goals || []" :key="i">{{ g.title }}</li>
                </ul>
                <div class="los-actions">
                  <button type="button" class="los-btn primary" :disabled="saving" @click="approveAndApplyAi">
                    Approve &amp; apply
                  </button>
                  <button type="button" class="los-btn" @click="aiDraft = null; evalResults = null">Dismiss</button>
                </div>
              </template>
              <p v-else class="los-muted">No plan draft yet.</p>
            </div>
          </div>
        </template>
      </div>

      <!-- Learning Plan -->
      <div v-if="tab === 'plan'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first.</p>
        <template v-else>
          <div class="los-actions">
            <button type="button" class="los-btn" @click="loadPlans">Refresh plans</button>
          </div>
          <div v-for="p in plans" :key="p.id" class="los-card">
            <div class="los-card-head">
              <strong>{{ p.title }}</strong>
              <span class="los-badge">{{ p.status }}</span>
            </div>
            <button v-if="p.status !== 'active'" type="button" class="los-btn primary" :disabled="saving" @click="doApprove(p.id)">
              Approve plan
            </button>
            <button type="button" class="los-link" @click="openPlanBundle(p.id)">View goals</button>
          </div>
          <div v-if="planBundle" class="los-card">
            <h4>{{ planBundle.plan.title }}</h4>
            <ul>
              <li v-for="g in planBundle.goals" :key="g.id">
                {{ g.title }} — <em>{{ statusLabel(g.status) }}</em>
              </li>
            </ul>
            <p v-if="planBundle.plan.parent_summary" class="los-muted">{{ planBundle.plan.parent_summary }}</p>
          </div>
        </template>
      </div>

      <!-- Evidence history -->
      <div v-if="tab === 'progress'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first.</p>
        <template v-else>
          <div class="los-actions">
            <button type="button" class="los-btn" @click="loadEvidence">Refresh evidence</button>
            <button type="button" class="los-btn" @click="openWorkspace(selectedSubject)">Skill map</button>
          </div>
          <div class="los-card" v-if="evidenceChart.length">
            <h4 class="los-h4">Progress by day</h4>
            <ul>
              <li v-for="(c, i) in evidenceChart" :key="i">{{ c.day }} — {{ statusLabel(c.rating) }} ({{ c.cnt }})</li>
            </ul>
          </div>
          <h4 class="los-h4">Evidence history</h4>
          <div v-for="e in evidence" :key="e.id" class="los-card los-evidence-row">
            <div class="los-card-head">
              <strong>{{ e.skill_label || e.skill_key || 'Evidence' }}</strong>
              <span class="los-badge">{{ statusLabel(e.rating) }}</span>
            </div>
            <p class="los-muted">
              {{ e.evidence_type }} · {{ formatDate(e.observed_at) }}
              <template v-if="e.session_id"> · Session #{{ e.session_id }}</template>
            </p>
            <p v-if="e.notes">{{ e.notes }}</p>
          </div>
          <p v-if="!evidence.length" class="los-muted">No evidence recorded yet.</p>
        </template>
      </div>

      <!-- Reports + parent preview -->
      <div v-if="tab === 'reports'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first.</p>
        <template v-else>
          <div class="los-actions">
            <button type="button" class="los-btn primary" :disabled="saving" @click="buildMultiReport">Build multi-session report</button>
            <button type="button" class="los-btn" @click="loadReports">Refresh</button>
          </div>
          <div v-for="r in reports" :key="r.id" class="los-card">
            <div class="los-card-head">
              <strong>{{ r.title }}</strong>
              <span class="los-badge">{{ r.status }} · {{ r.report_type }}</span>
            </div>
            <div class="los-actions">
              <button type="button" class="los-btn" :disabled="saving" @click="showPreview(r.id)">Parent preview</button>
              <button v-if="r.status === 'draft'" type="button" class="los-btn primary" :disabled="saving" @click="doPublish(r.id)">Publish</button>
            </div>
          </div>
          <div v-if="reportPreviewHtml" class="los-card los-preview">
            <div class="los-card-head">
              <h4 class="los-h4">Parent progress report preview</h4>
              <button type="button" class="los-link" @click="reportPreviewHtml = ''">Close</button>
            </div>
            <div class="los-preview-body" v-html="reportPreviewHtml" />
          </div>
        </template>
      </div>

      <!-- CAS / CDE standards browser -->
      <div v-if="tab === 'standards'" class="los-section">
        <form class="los-form" @submit.prevent="searchStandards">
          <h4>CAS / CDE standards browser</h4>
          <p class="los-muted">Search seeded Colorado Academic Standards. Full CDE Knowledge Service import comes later.</p>
          <div class="los-form-row">
            <select v-model="casQuery.subjectKey">
              <option value="">All subjects</option>
              <option v-for="s in subjectKeys" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
            <select v-model="casQuery.gradeBand">
              <option value="">All grades</option>
              <option value="K-2">K–2</option>
              <option value="3-5">3–5</option>
              <option value="6-8">6–8</option>
              <option value="9-12">9–12</option>
            </select>
            <input v-model="casQuery.q" placeholder="Search code or wording" />
            <button class="los-btn primary" type="submit" :disabled="saving">Search</button>
          </div>
        </form>
        <div v-for="st in casStandards" :key="st.id" class="los-card">
          <div class="los-card-head">
            <strong>{{ st.standard_code || 'Standard' }}</strong>
            <span class="los-badge">{{ st.subject_key }} · {{ st.grade_band || '—' }}</span>
          </div>
          <p>{{ st.title }}</p>
          <p v-if="st.description" class="los-muted">{{ st.description }}</p>
        </div>
        <p v-if="casSearched && !casStandards.length" class="los-muted">No standards matched.</p>
      </div>

      <!-- Assessment builder -->
      <div v-if="tab === 'builder'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first (Overview → Open workspace).</p>
        <template v-else>
          <form class="los-form" @submit.prevent="buildBlueprint">
            <h4>Assessment builder — {{ selectedSubject.subject_label }}</h4>
            <p class="los-muted">Pick skills, item types, and count. Builds a blueprint from the item bank and can schedule a probe milestone.</p>
            <input v-model="builder.title" placeholder="Assessment title" />
            <div class="los-form-row">
              <select v-model="builder.evaluationPath">
                <option value="quick">Quick</option>
                <option value="full">Full</option>
                <option value="probe">Progress probe</option>
              </select>
              <input v-model.number="builder.itemCount" type="number" min="1" max="20" placeholder="Item count" />
              <input v-model="builder.skillKeysText" placeholder="Skill keys (comma-separated, optional)" />
            </div>
            <div class="los-form-row">
              <label class="los-choice"><input type="checkbox" value="multiple_choice" v-model="builder.itemTypes" /> Multiple choice</label>
              <label class="los-choice"><input type="checkbox" value="short_response" v-model="builder.itemTypes" /> Short response</label>
              <label class="los-choice"><input type="checkbox" value="oral" v-model="builder.itemTypes" /> Oral</label>
            </div>
            <button class="los-btn primary" type="submit" :disabled="saving">Build blueprint</button>
          </form>
          <div v-if="lastBlueprint" class="los-card">
            <div class="los-card-head">
              <strong>{{ lastBlueprint.blueprint?.title }}</strong>
              <span class="los-badge">{{ lastBlueprint.blueprint?.status }} · {{ (lastBlueprint.items || []).length }} items</span>
            </div>
            <ul>
              <li v-for="it in lastBlueprint.items || []" :key="it.id">
                {{ it.skill_label || it.skill_key }} — {{ it.item_type }}
              </li>
            </ul>
            <button type="button" class="los-btn primary" :disabled="!lastBlueprint.items?.length" @click="startFromBlueprint">
              Run in evaluation player
            </button>
          </div>
        </template>
      </div>

      <!-- Practice assignments -->
      <div v-if="tab === 'practice'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first.</p>
        <template v-else>
          <div class="los-actions">
            <button type="button" class="los-btn primary" :disabled="saving" @click="assignPractice()">
              Assign practice (AI draft)
            </button>
            <button type="button" class="los-btn" @click="loadPractice">Refresh</button>
          </div>
          <div v-for="a in practiceList" :key="a.id" class="los-card">
            <div class="los-card-head">
              <strong>{{ a.title }}</strong>
              <span class="los-badge">{{ a.status }}</span>
            </div>
            <p v-if="a.instructions" class="los-muted">{{ a.instructions }}</p>
            <ol>
              <li v-for="(item, idx) in (a.practiceItems || a.practice_items_json || [])" :key="idx">
                {{ item.prompt || item }}
                <span v-if="item.hint" class="los-muted"> — hint: {{ item.hint }}</span>
              </li>
            </ol>
            <button
              v-if="a.status !== 'completed'"
              type="button"
              class="los-btn"
              :disabled="saving"
              @click="markPracticeDone(a.id)"
            >Mark completed</button>
          </div>
          <p v-if="!practiceList.length" class="los-muted">No practice assignments yet.</p>
        </template>
      </div>

      <!-- Advanced -->
      <div v-if="tab === 'advanced'" class="los-section">
        <p v-if="!selectedSubject" class="los-muted">Select a subject first.</p>
        <template v-else>
          <form class="los-form" @submit.prevent="saveOralProbe">
            <h4>Oral reading probe (tutor verify required)</h4>
            <input v-model="oral.passageTitle" placeholder="Passage title" />
            <input v-model.number="oral.wordsCorrect" type="number" placeholder="Words correct" />
            <input v-model.number="oral.wordsTotal" type="number" placeholder="Words total" />
            <input v-model.number="oral.wpm" type="number" step="0.1" placeholder="WPM (STT draft ok)" />
            <textarea v-model="oral.sttTranscript" rows="2" placeholder="STT transcript (draft — tutor must verify)" />
            <button class="los-btn primary" type="submit" :disabled="saving">Save probe</button>
          </form>
          <button v-if="lastProbeId" type="button" class="los-btn" :disabled="saving" @click="verifyProbe">Tutor verify last probe</button>

          <form class="los-form" @submit.prevent="saveDocExtract">
            <h4>Document extraction (confirm before official use)</h4>
            <select v-model="doc.sourceLabel">
              <option value="report_card">Report card</option>
              <option value="map">MAP</option>
              <option value="i_ready">i-Ready</option>
              <option value="cmas">CMAS</option>
              <option value="other">Other</option>
            </select>
            <textarea v-model="doc.rawTextExcerpt" rows="3" placeholder="Paste excerpt" />
            <button class="los-btn primary" type="submit" :disabled="saving">Create pending extraction</button>
          </form>
          <button v-if="lastExtractionId" type="button" class="los-btn" :disabled="saving" @click="confirmExtract">Confirm extraction</button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { STUDENT_SUBJECT_KEYS } from '@/constants/tutoringLearningOs';
import * as los from '@/services/tutoringLearningOs';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'evaluations', label: 'Evaluations' },
  { id: 'builder', label: 'Assess builder' },
  { id: 'standards', label: 'Standards' },
  { id: 'plan', label: 'Learning Plan' },
  { id: 'practice', label: 'Practice' },
  { id: 'progress', label: 'Evidence' },
  { id: 'reports', label: 'Reports' },
  { id: 'advanced', label: 'Advanced' }
];

const tab = ref('overview');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const overview = ref([]);
const selectedSubject = ref(null);
const subjectKeys = STUDENT_SUBJECT_KEYS;
const showBaseline = ref(false);
const plans = ref([]);
const planBundle = ref(null);
const evidence = ref([]);
const evidenceChart = ref([]);
const reports = ref([]);
const quickItems = ref([]);
const quickAnswers = reactive({});
const evalIndex = ref(0);
const evalResults = ref(null);
const aiDraft = ref(null);
const lastProbeId = ref(null);
const lastExtractionId = ref(null);
const workspace = ref(null);
const workspaceLoading = ref(false);
const selectedSkillId = ref(null);
const reportPreviewHtml = ref('');
const casStandards = ref([]);
const casSearched = ref(false);
const practiceList = ref([]);
const lastBlueprint = ref(null);

const enroll = reactive({ subjectKey: '', schoolGrade: '', reasonForTutoring: '' });
const baseline = reactive({ strengthsText: '', needsText: '', narrativeSummary: '', goalTitle: '' });
const oral = reactive({ passageTitle: '', wordsCorrect: null, wordsTotal: null, wpm: null, sttTranscript: '' });
const doc = reactive({ sourceLabel: 'report_card', rawTextExcerpt: '' });
const casQuery = reactive({ subjectKey: '', gradeBand: '', q: '' });
const builder = reactive({
  title: '',
  evaluationPath: 'quick',
  itemCount: 5,
  skillKeysText: '',
  itemTypes: ['multiple_choice', 'short_response']
});

const currentEvalItem = computed(() => quickItems.value[evalIndex.value] || null);
const selectedSkillDetail = computed(() =>
  (workspace.value?.skillMap || []).find((s) => s.goalId === selectedSkillId.value) || null
);
const skillMapFromEval = computed(() => {
  const map = evalResults.value?.summary?.skill_map_json || {};
  const { misconceptions, ...skills } = map;
  return skills;
});

function statusLabel(s) {
  return String(s || '').replace(/_/g, ' ');
}
function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}
function selectSubject(s) {
  selectedSubject.value = s;
}
function masteryLabel(goalId) {
  const m = workspace.value?.masteryByGoal?.[goalId];
  if (!m?.recommendedStatus) return 'no mastery yet';
  return `${statusLabel(m.recommendedStatus)} (${m.confidence})`;
}
function onTab(id) {
  tab.value = id;
  if (id === 'workspace' && selectedSubject.value) loadWorkspace();
  if (id === 'progress' && selectedSubject.value) loadEvidence();
  if (id === 'reports' && selectedSubject.value) loadReports();
  if (id === 'plan' && selectedSubject.value) loadPlans();
  if (id === 'practice' && selectedSubject.value) loadPractice();
  if (id === 'standards' && !casSearched.value) searchStandards();
}

async function openWorkspace(subject) {
  selectSubject(subject);
  tab.value = 'workspace';
  await loadWorkspace();
}

async function loadWorkspace() {
  if (!selectedSubject.value) return;
  workspaceLoading.value = true;
  try {
    workspace.value = await los.fetchSubjectWorkspace(selectedSubject.value.id);
    if (!selectedSkillId.value && workspace.value.skillMap?.[0]) {
      selectedSkillId.value = workspace.value.skillMap[0].goalId;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    workspaceLoading.value = false;
  }
}

async function recomputeMastery(goalId) {
  saving.value = true;
  try {
    await los.recomputeGoalMastery(goalId);
    await loadWorkspace();
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await los.fetchLearningOverview(props.clientId);
    overview.value = data.subjects || [];
    if (selectedSubject.value) {
      const match = overview.value.find((r) => r.subject.id === selectedSubject.value.id);
      if (match) selectedSubject.value = match.subject;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function doEnroll() {
  saving.value = true;
  try {
    await los.enrollSubject({
      clientId: Number(props.clientId),
      agencyId: props.agencyId ? Number(props.agencyId) : undefined,
      subjectKey: enroll.subjectKey,
      schoolGrade: enroll.schoolGrade || null,
      reasonForTutoring: enroll.reasonForTutoring || null
    });
    enroll.subjectKey = '';
    enroll.schoolGrade = '';
    enroll.reasonForTutoring = '';
    await refresh();
    tab.value = 'overview';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function doBaseline() {
  if (!selectedSubject.value) return;
  saving.value = true;
  try {
    const strengths = baseline.strengthsText.split(',').map((s) => s.trim()).filter(Boolean);
    const needs = baseline.needsText.split(',').map((s) => s.trim()).filter(Boolean);
    await los.saveBaseline({
      studentSubjectId: selectedSubject.value.id,
      strengths,
      needs,
      narrativeSummary: baseline.narrativeSummary || null,
      goals: baseline.goalTitle
        ? [{ title: baseline.goalTitle, baselineText: strengths.join('; ') || null, successCriteria: 'Secure across 2 sessions' }]
        : needs.map((n) => ({ title: n, successCriteria: 'Secure across 2 sessions' }))
    });
    showBaseline.value = false;
    await refresh();
    tab.value = 'plan';
    await loadPlans();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function loadPlans() {
  if (!selectedSubject.value) return;
  const data = await los.listSubjectPlans(selectedSubject.value.id);
  plans.value = data.plans || [];
}

async function openPlanBundle(planId) {
  planBundle.value = await los.getLearningPlan(planId);
}

async function doApprove(planId) {
  saving.value = true;
  try {
    planBundle.value = await los.approveLearningPlan(planId);
    await loadPlans();
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function loadEvidence() {
  if (!selectedSubject.value) return;
  const data = await los.fetchEvidence(selectedSubject.value.id);
  evidence.value = data.evidence || [];
  evidenceChart.value = data.chart || [];
}

async function loadReports() {
  if (!selectedSubject.value) return;
  const data = await los.listReports(selectedSubject.value.id);
  reports.value = data.reports || [];
}

async function buildMultiReport() {
  saving.value = true;
  try {
    await los.createProgressReport({
      studentSubjectId: selectedSubject.value.id,
      reportType: 'multi_session'
    });
    await loadReports();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function doPublish(id) {
  saving.value = true;
  try {
    await los.publishReport(id);
    await loadReports();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function showPreview(reportId) {
  saving.value = true;
  try {
    const data = await los.previewProgressReport(reportId);
    reportPreviewHtml.value = data.html || data.report?.content_html || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function startQuickEval() {
  if (!selectedSubject.value) return;
  const data = await los.listEvaluationItems({ subjectKey: selectedSubject.value.subject_key });
  quickItems.value = data.items || [];
  evalIndex.value = 0;
  evalResults.value = null;
  for (const item of quickItems.value) quickAnswers[item.id] = '';
}

async function searchStandards() {
  saving.value = true;
  try {
    const data = await los.searchCasStandards({
      subjectKey: casQuery.subjectKey || undefined,
      gradeBand: casQuery.gradeBand || undefined,
      q: casQuery.q || undefined
    });
    casStandards.value = data.standards || [];
    casSearched.value = true;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function buildBlueprint() {
  if (!selectedSubject.value) return;
  saving.value = true;
  try {
    const skillKeys = builder.skillKeysText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    lastBlueprint.value = await los.createAssessmentBlueprint({
      agencyId: props.agencyId ? Number(props.agencyId) : undefined,
      studentSubjectId: selectedSubject.value.id,
      title: builder.title || `${selectedSubject.value.subject_label} assessment`,
      subjectKey: selectedSubject.value.subject_key,
      evaluationPath: builder.evaluationPath,
      itemCount: builder.itemCount || 5,
      skillKeys,
      itemTypes: builder.itemTypes || []
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

function startFromBlueprint() {
  const items = lastBlueprint.value?.items || [];
  if (!items.length) return;
  quickItems.value = items;
  evalIndex.value = 0;
  evalResults.value = null;
  for (const item of items) quickAnswers[item.id] = '';
  tab.value = 'evaluations';
}

async function loadPractice() {
  if (!selectedSubject.value) return;
  try {
    const data = await los.listSubjectPractice(selectedSubject.value.id);
    practiceList.value = data.assignments || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  }
}

async function assignPractice(planGoalId = null) {
  if (!selectedSubject.value) return;
  saving.value = true;
  try {
    await los.createPracticeAssignment({
      studentSubjectId: selectedSubject.value.id,
      planGoalId: planGoalId || selectedSkillId.value || null,
      itemCount: 5
    });
    tab.value = 'practice';
    await loadPractice();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function markPracticeDone(id) {
  saving.value = true;
  try {
    await los.completePracticeAssignment(id);
    await loadPractice();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function submitQuickEval() {
  saving.value = true;
  try {
    const responses = quickItems.value.map((item) => ({
      itemId: item.id,
      answer: quickAnswers[item.id],
      rating: item.item_type === 'multiple_choice' ? undefined : 'developing'
    }));
    const result = await los.runQuickEvaluation({
      studentSubjectId: selectedSubject.value.id,
      responses
    });
    evalResults.value = result;
    aiDraft.value = {
      artifact: result.planDraftArtifact,
      draft: result.planDraftArtifact?.draft_content_json
    };
    quickItems.value = [];
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function runAiDraft() {
  saving.value = true;
  try {
    aiDraft.value = await los.draftPlanAi({ studentSubjectId: selectedSubject.value.id });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function approveAndApplyAi() {
  if (!aiDraft.value?.artifact?.id) return;
  saving.value = true;
  try {
    await los.approveAiArtifact(aiDraft.value.artifact.id);
    planBundle.value = await los.applyAiPlanDraft(aiDraft.value.artifact.id);
    aiDraft.value = null;
    evalResults.value = null;
    tab.value = 'plan';
    await loadPlans();
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function ackAlert(id) {
  await los.acknowledgeAlert(id);
  await refresh();
}

async function saveOralProbe() {
  saving.value = true;
  try {
    const { probe } = await los.createOralReadingProbe({
      studentSubjectId: selectedSubject.value.id,
      ...oral
    });
    lastProbeId.value = probe.id;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function verifyProbe() {
  if (!lastProbeId.value) return;
  saving.value = true;
  try {
    await los.verifyOralReadingProbe(lastProbeId.value, {});
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function saveDocExtract() {
  saving.value = true;
  try {
    const { extraction } = await los.createDocumentExtraction({
      clientId: Number(props.clientId),
      agencyId: props.agencyId ? Number(props.agencyId) : undefined,
      studentSubjectId: selectedSubject.value.id,
      sourceLabel: doc.sourceLabel,
      rawTextExcerpt: doc.rawTextExcerpt,
      extracted: { excerpt: doc.rawTextExcerpt }
    });
    lastExtractionId.value = extraction.id;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function confirmExtract() {
  if (!lastExtractionId.value) return;
  saving.value = true;
  try {
    await los.confirmDocumentExtraction(lastExtractionId.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped>
.los-panel { display: flex; flex-direction: column; gap: 0.75rem; }
.los-header { display: flex; flex-direction: column; gap: 0.65rem; }
.los-title { margin: 0; font-size: 1.05rem; }
.los-sub { margin: 0.15rem 0 0; color: #64748b; font-size: 0.88rem; }
.los-tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.los-tab {
  border: 1px solid #cbd5e1; background: #fff; border-radius: 999px;
  padding: 0.3rem 0.7rem; font-size: 0.82rem; cursor: pointer;
}
.los-tab.active { background: #2563eb; border-color: #2563eb; color: #fff; }
.los-section { display: flex; flex-direction: column; gap: 0.65rem; }
.los-card {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem 0.9rem;
  background: #fff; display: flex; flex-direction: column; gap: 0.35rem;
}
.los-card-head { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; }
.los-badge {
  font-size: 0.72rem; text-transform: capitalize; background: #eff6ff; color: #1d4ed8;
  border-radius: 999px; padding: 0.15rem 0.5rem; white-space: nowrap;
}
.los-muted { color: #64748b; font-size: 0.86rem; margin: 0; }
.los-error { color: #b91c1c; }
.los-empty { color: #64748b; padding: 1rem 0; }
.los-btn {
  align-self: flex-start; border: 1px solid #cbd5e1; background: #fff;
  border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.85rem; cursor: pointer;
}
.los-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.los-link { border: none; background: none; color: #2563eb; cursor: pointer; font-size: 0.85rem; padding: 0; }
.los-form { display: flex; flex-direction: column; gap: 0.5rem; border: 1px dashed #cbd5e1; padding: 0.75rem; border-radius: 10px; }
.los-form-row { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.los-form input, .los-form select, .los-form textarea,
.los-eval-card textarea {
  border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.45rem 0.6rem; font: inherit;
}
.los-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.los-alerts { display: flex; flex-direction: column; gap: 0.35rem; }
.los-alert {
  background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 0.45rem 0.6rem;
  font-size: 0.85rem; display: flex; justify-content: space-between; gap: 0.5rem;
}
.los-h4 { margin: 0.25rem 0; font-size: 0.95rem; }
.los-progress-row { display: flex; align-items: center; gap: 0.5rem; }
.los-progress-track {
  flex: 1; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden;
}
.los-progress-track.tall { height: 12px; margin: 0.35rem 0; }
.los-progress-fill { height: 100%; background: #2563eb; border-radius: 999px; }
.los-pct { font-weight: 700; color: #1d4ed8; font-size: 1.1rem; }
.los-next { margin: 0.35rem 0 0; font-size: 0.9rem; }
.los-skill-map {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem;
}
.los-skill {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.65rem; cursor: pointer; background: #fff;
}
.los-skill:hover { border-color: #93c5fd; }
.los-skill-title { font-weight: 600; font-size: 0.88rem; }
.los-skill-status { font-size: 0.75rem; text-transform: capitalize; margin: 0.2rem 0; }
.los-skill.status-mastered, .los-skill.status-secure, .los-skill.status-generalized { border-color: #86efac; background: #f0fdf4; }
.los-skill.status-developing, .los-skill.status-nearly_secure { border-color: #fcd34d; background: #fffbeb; }
.los-skill.status-emerging, .los-skill.status-needs_review { border-color: #fca5a5; background: #fef2f2; }
.los-mastery { font-size: 0.88rem; }
.los-timeline { display: flex; flex-direction: column; gap: 0.4rem; }
.los-timeline-item {
  display: grid; grid-template-columns: 100px 1fr auto; gap: 0.5rem; align-items: start;
  border-bottom: 1px solid #f1f5f9; padding-bottom: 0.35rem; font-size: 0.85rem;
}
.los-tl-type { text-transform: uppercase; font-size: 0.7rem; color: #64748b; letter-spacing: 0.04em; }
.los-eval-player { display: flex; flex-direction: column; gap: 0.5rem; }
.los-eval-progress { font-size: 0.82rem; color: #64748b; }
.los-eval-prompt { font-size: 1rem; font-weight: 600; margin: 0; }
.los-choice {
  display: flex; gap: 0.45rem; align-items: center; padding: 0.45rem 0.6rem;
  border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;
}
.los-choice.selected { border-color: #2563eb; background: #eff6ff; }
.los-split {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;
}
@media (max-width: 800px) { .los-split { grid-template-columns: 1fr; } .los-timeline-item { grid-template-columns: 1fr; } }
.los-ok { color: #16a34a; }
.los-bad { color: #dc2626; }
.los-preview-body {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem; background: #f8fafc;
  font-size: 0.9rem; max-height: 420px; overflow: auto;
}
.los-preview-body :deep(h1) { font-size: 1.1rem; margin: 0 0 0.35rem; }
.los-preview-body :deep(h2) { font-size: 0.95rem; margin: 0.75rem 0 0.25rem; }
.los-preview-body :deep(.disclaimer) { color: #64748b; font-size: 0.8rem; margin-top: 1rem; }
</style>
