<template>
  <div class="tsg">
    <header class="tsg-header">
      <div class="tsg-header-main">
        <div class="tsg-kicker">Tutor Session Guide · Internal</div>
        <h2 class="tsg-title">
          {{ studentName || 'Student' }}
          <span class="tsg-meta">· {{ gradeLabel || 'Grade —' }} · {{ subjectLabel || 'Subject' }} · {{ sessionTypeLabel }}</span>
        </h2>
      </div>
      <div class="tsg-header-actions">
        <select v-model="studentSubjectId" class="tsg-select">
          <option :value="null">Subject track</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.subject_label }}</option>
        </select>
        <button type="button" class="tsg-btn" :disabled="saving" @click="regenBrief">Refresh brief</button>
      </div>
    </header>

    <p v-if="error" class="tsg-error">{{ error }}</p>
    <p v-if="successMsg" class="tsg-ok">{{ successMsg }}</p>
    <p v-if="loading" class="tsg-muted">Loading session guide…</p>

    <div v-else class="tsg-rails">
      <!-- Left: context -->
      <aside class="tsg-rail tsg-left">
        <section class="tsg-card">
          <h3>Student snapshot</h3>
          <p v-if="workspace?.currentFocus || workspace?.nextRecommendation">
            <strong>Current focus:</strong>
            {{ workspace.currentFocus?.title || workspace.nextRecommendation?.suggestedFocus || '—' }}
          </p>
          <p class="tsg-muted">
            {{ workspace?.subject?.reason_for_tutoring || 'Academic need from learning plan / enrollment.' }}
          </p>
          <div class="tsg-progress">
            <div class="tsg-progress-fill" :style="{ width: `${workspace?.progressPct || 0}%` }" />
          </div>
          <span class="tsg-muted">{{ workspace?.progressPct || 0 }}% subject progress</span>
        </section>

        <section class="tsg-card">
          <h3>Package balance</h3>
          <p v-if="packageTotals.activePackages">
            <strong>{{ packageTotals.sessionsRemaining }}</strong> remaining
            <span class="tsg-muted"> · {{ packageTotals.sessionsReserved }} reserved</span>
          </p>
          <ul class="tsg-list">
            <li v-for="e in packageEntitlements.slice(0, 3)" :key="e.id">
              {{ e.packageName || 'Package' }} — {{ e.sessionsRemaining }}/{{ e.sessionsPurchased }}
            </li>
          </ul>
          <p v-if="!packageTotals.activePackages" class="tsg-muted">No active prepaid package for this student.</p>
        </section>

        <section class="tsg-card">
          <h3>Session goals</h3>
          <ul class="tsg-list">
            <li v-for="g in goals" :key="g.id">{{ g.title }}</li>
            <li v-if="!goals.length" class="tsg-muted">No active goals yet.</li>
          </ul>
        </section>

        <section class="tsg-card">
          <h3>Materials</h3>
          <ul class="tsg-list">
            <li v-for="(m, i) in materialsList" :key="i">{{ typeof m === 'string' ? m : m.title || m.name || 'Material' }}</li>
            <li v-if="!materialsList.length" class="tsg-muted">Use whiteboard, manipulatives, and notebook as needed.</li>
          </ul>
        </section>

        <section class="tsg-card">
          <h3>Recent progress / prior notes</h3>
          <p class="tsg-muted">{{ brief?.prior_session_recap || 'No prior session recap yet.' }}</p>
        </section>
      </aside>

      <!-- Center: delivery -->
      <section class="tsg-rail tsg-center">
        <div class="tsg-card">
          <h3>Objective &amp; standards</h3>
          <p class="tsg-objective">{{ guide.objective || brief?.tutor_prep_notes || 'Generate a session brief to load today’s plan.' }}</p>
          <div class="tsg-standards">
            <span v-for="(st, i) in standardsAlignment" :key="i" class="tsg-chip">
              {{ st.code || st.standard_code }} — {{ st.title }}
            </span>
            <span v-if="!standardsAlignment.length" class="tsg-muted">No CAS alignment loaded yet.</span>
          </div>
        </div>

        <div class="tsg-card">
          <h3>Teaching sequence &amp; pacing</h3>
          <div class="tsg-sequence">
            <div v-for="(step, i) in teachingSequence" :key="i" class="tsg-seq-step">
              <strong>{{ step.label || step.title }}</strong>
              <span>{{ step.minutes != null ? `${step.minutes} min` : '' }}</span>
              <p>{{ step.focus || step.suggestedFocus || '' }}</p>
            </div>
          </div>
          <ul v-if="brief?.planned_activities_json?.length" class="tsg-list">
            <li v-for="(a, i) in brief.planned_activities_json" :key="i">
              <label class="tsg-check">
                <input type="checkbox" v-model="plannedDone[i]" />
                {{ a.title || a.suggestedFocus }}
              </label>
            </li>
          </ul>
          <div class="tsg-actions">
            <button type="button" class="tsg-btn" :disabled="saving || !brief" @click="acceptBrief">Accept plan</button>
            <button type="button" class="tsg-btn" :disabled="saving" @click="regenBrief">Generate another</button>
          </div>
        </div>

        <div class="tsg-card">
          <h3>Tutor prompts / what to say</h3>
          <ul class="tsg-list">
            <li v-for="(p, i) in (guide.tutorPrompts || [])" :key="i">{{ p }}</li>
            <li v-if="!(guide.tutorPrompts || []).length" class="tsg-muted">“What do you notice?” · “Show me your thinking.”</li>
          </ul>
          <p v-if="guide.workedExampleNotes"><strong>Worked example:</strong> {{ guide.workedExampleNotes }}</p>
        </div>

        <div class="tsg-card tsg-warn">
          <h3>Common misconceptions / watch-fors</h3>
          <ul class="tsg-list">
            <li v-for="(m, i) in (guide.misconceptions || [])" :key="i">{{ m }}</li>
            <li v-if="!(guide.misconceptions || []).length" class="tsg-muted">Watch for skipping steps or guessing without a model.</li>
          </ul>
        </div>

        <div class="tsg-card">
          <h3>Check-for-understanding</h3>
          <ul class="tsg-list">
            <li v-for="(q, i) in (guide.checkForUnderstanding || [])" :key="i">{{ q }}</li>
          </ul>
          <h3 class="tsg-subh">Intervention strategies</h3>
          <ul class="tsg-list">
            <li v-for="(s, i) in (guide.interventionStrategies || [])" :key="i">{{ s }}</li>
          </ul>
        </div>

        <div class="tsg-card">
          <h3>Session summary draft</h3>
          <textarea v-model="note.summary" rows="3" placeholder="Live takeaways for the session note…" />
        </div>
      </section>

      <!-- Right: live tools -->
      <aside class="tsg-rail tsg-right">
        <section class="tsg-card">
          <h3>Live observation notes</h3>
          <textarea v-model="note.strengthsObserved" rows="2" placeholder="Strengths observed" />
          <textarea v-model="note.challengesObserved" rows="2" placeholder="Challenges / watch-fors" />
          <textarea v-model="liveObservation" rows="2" placeholder="Quick observation…" />
        </section>

        <section class="tsg-card">
          <h3>Engagement / confidence</h3>
          <label class="tsg-scale">Engagement
            <input v-model.number="engagement.engagement" type="range" min="1" max="5" />
            <span>{{ engagement.engagement }}</span>
          </label>
          <label class="tsg-scale">Confidence
            <input v-model.number="engagement.confidence" type="range" min="1" max="5" />
            <span>{{ engagement.confidence }}</span>
          </label>
          <label class="tsg-scale">Participation
            <input v-model.number="engagement.participation" type="range" min="1" max="5" />
            <span>{{ engagement.participation }}</span>
          </label>
        </section>

        <section class="tsg-card">
          <h3>Mastery evidence tracker</h3>
          <div v-for="g in goals" :key="g.id" class="tsg-chip-row">
            <span>{{ g.title }}</span>
            <select v-model="ratings[g.id]">
              <option value="">—</option>
              <option v-for="r in ratingOptions" :key="r.key" :value="r.key">{{ r.label }}</option>
            </select>
          </div>
          <p v-if="!goals.length" class="tsg-muted">Enroll a subject and approve a learning plan first.</p>
        </section>

        <section class="tsg-card">
          <h3>AI assist</h3>
          <div class="tsg-actions">
            <button type="button" class="tsg-btn" :disabled="saving" @click="runAssist('explain')">Generate explanation</button>
            <button type="button" class="tsg-btn" :disabled="saving" @click="runAssist('intervene')">Suggest intervention</button>
            <button type="button" class="tsg-btn" :disabled="saving" @click="runAssist('recap')">Draft recap</button>
          </div>
          <p v-if="assistDraft?.coachText" class="tsg-assist">{{ assistDraft.coachText }}</p>
          <p v-if="assistDraft?.familyText" class="tsg-muted"><em>Family:</em> {{ assistDraft.familyText }}</p>
        </section>

        <section class="tsg-card">
          <h3>How it went</h3>
          <div class="tsg-how">
            <label v-for="opt in howItWentOptions" :key="opt" class="tsg-radio">
              <input type="radio" v-model="note.howItWent" :value="opt" />
              {{ opt }}
            </label>
          </div>
          <textarea v-model="note.nextSteps" rows="2" placeholder="Next steps" />
          <textarea v-model="note.homework" rows="2" placeholder="Homework notes (optional — practice can auto-assign)" />
          <label class="tsg-check">
            <input type="checkbox" v-model="assignPractice" />
            Assign practice for parents until next session
          </label>
        </section>
      </aside>
    </div>

    <footer class="tsg-footer">
      <button type="button" class="tsg-btn primary" :disabled="saving || !studentSubjectId" @click="saveNote">
        {{ saving ? 'Saving…' : 'Save session notes' }}
      </button>
      <button type="button" class="tsg-btn" :disabled="saving || !studentSubjectId" @click="draftFamilyRecap">
        Draft family recap
      </button>
      <button type="button" class="tsg-btn" :disabled="saving || !studentSubjectId" @click="saveNote">
        Complete &amp; assign practice
      </button>
      <a v-if="scheduleHref" class="tsg-btn" :href="scheduleHref">Schedule next session</a>
      <span v-if="lastSave?.practiceAssignment" class="tsg-ok">
        Practice assigned: {{ lastSave.practiceAssignment.title }}
        <template v-if="lastSave.practiceAssignment.due_at">
          · due {{ formatDate(lastSave.practiceAssignment.due_at) }}
        </template>
      </span>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { GOAL_RATING_OPTIONS } from '@/constants/tutoringLearningOs';
import * as los from '@/services/tutoringLearningOs';
import * as unifiedPackages from '@/services/unifiedPackages';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  sessionId: { type: [Number, String], default: null },
  sessionType: { type: String, default: 'virtual' },
  initialSubjectId: { type: [Number, String], default: null },
  studentName: { type: String, default: '' },
  gradeLabel: { type: String, default: '' },
  scheduleHref: { type: String, default: '' }
});

const emit = defineEmits(['saved']);

const subjects = ref([]);
const studentSubjectId = ref(props.initialSubjectId ? Number(props.initialSubjectId) : null);
const brief = ref(null);
const workspace = ref(null);
const goals = ref([]);
const ratings = reactive({});
const plannedDone = reactive({});
const saving = ref(false);
const loading = ref(true);
const error = ref('');
const successMsg = ref('');
const lastSave = ref(null);
const assistDraft = ref(null);
const liveObservation = ref('');
const assignPractice = ref(true);
const ratingOptions = GOAL_RATING_OPTIONS;
const howItWentOptions = ['Exceeded', 'Met', 'Partially Met', 'Not Yet'];
const casStandards = ref([]);
const packageEntitlements = ref([]);
const packageTotals = ref({
  sessionsRemaining: 0,
  sessionsReserved: 0,
  sessionsPurchased: 0,
  activePackages: 0
});

const note = reactive({
  howItWent: 'Met',
  summary: '',
  strengthsObserved: '',
  challengesObserved: '',
  nextSteps: '',
  homework: ''
});

const engagement = reactive({
  engagement: 3,
  confidence: 3,
  participation: 3
});

const guide = computed(() => brief.value?.guide_json || {});
const materialsList = computed(() => {
  const m = brief.value?.materials_json;
  return Array.isArray(m) ? m : [];
});
const teachingSequence = computed(() => {
  const seq = guide.value.teachingSequence;
  if (Array.isArray(seq) && seq.length) return seq;
  return (brief.value?.planned_activities_json || []).map((a) => ({
    label: a.title || 'Activity',
    focus: a.suggestedFocus || '',
    minutes: null
  }));
});
const standardsAlignment = computed(() => {
  const fromGuide = guide.value.standardsAlignment;
  if (Array.isArray(fromGuide) && fromGuide.length) return fromGuide;
  return casStandards.value.slice(0, 4).map((s) => ({
    code: s.standard_code,
    title: s.title
  }));
});
const subjectLabel = computed(() => {
  const s = subjects.value.find((x) => Number(x.id) === Number(studentSubjectId.value));
  return s?.subject_label || workspace.value?.subject?.subject_label || '';
});
const sessionTypeLabel = computed(() =>
  props.sessionType === 'in_person' ? 'In Person' : 'Virtual'
);
const gradeLabel = computed(
  () => props.gradeLabel || workspace.value?.subject?.school_grade || ''
);

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

async function loadSubjects() {
  const data = await los.fetchLearningOverview(props.clientId);
  subjects.value = (data.subjects || []).map((r) => r.subject);
  if (!studentSubjectId.value && subjects.value.length) {
    const active = subjects.value.find((s) => s.status === 'active_tutoring') || subjects.value[0];
    studentSubjectId.value = active.id;
  }
}

async function loadPackageBalance() {
  if (!props.clientId) return;
  try {
    const data = await unifiedPackages.listGuardianEntitlements(props.clientId, {
      businessType: 'tutoring'
    });
    packageEntitlements.value = data?.entitlements || [];
    packageTotals.value = data?.totals || {
      sessionsRemaining: 0,
      sessionsReserved: 0,
      sessionsPurchased: 0,
      activePackages: 0
    };
  } catch {
    packageEntitlements.value = [];
  }
}

async function loadAll() {
  if (!studentSubjectId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await loadPackageBalance();
    if (props.sessionId) {
      const existing = await los.getSessionBrief(props.sessionId);
      brief.value = existing.brief || null;
      const existingNote = await los.getSessionNote(props.sessionId);
      if (existingNote.note) {
        note.summary = existingNote.note.summary || '';
        note.strengthsObserved = existingNote.note.strengths_observed || '';
        note.challengesObserved = existingNote.note.challenges_observed || '';
        note.nextSteps = existingNote.note.next_steps || '';
        note.homework = existingNote.note.homework || '';
        note.howItWent = existingNote.note.how_it_went_json?.rating || 'Met';
        const eng = existingNote.note.how_it_went_json || {};
        if (eng.engagement) engagement.engagement = Number(eng.engagement) || 3;
        if (eng.confidence) engagement.confidence = Number(eng.confidence) || 3;
        if (eng.participation) engagement.participation = Number(eng.participation) || 3;
      }
    }
    workspace.value = await los.fetchSubjectWorkspace(studentSubjectId.value);
    const plans = await los.listSubjectPlans(studentSubjectId.value);
    const active = (plans.plans || []).find((p) => p.status === 'active') || plans.plans?.[0];
    if (active) {
      const bundle = await los.getLearningPlan(active.id);
      goals.value = bundle.goals || [];
      for (const g of goals.value) {
        if (ratings[g.id] == null) ratings[g.id] = '';
      }
    } else {
      goals.value = [];
    }
    const subj = subjects.value.find((s) => Number(s.id) === Number(studentSubjectId.value));
    const cas = await los.searchCasStandards({
      subjectKey: subj?.subject_key || workspace.value?.subject?.subject_key,
      gradeBand: undefined,
      q: goals.value[0]?.title || undefined
    });
    casStandards.value = cas.standards || [];
    if (!brief.value && studentSubjectId.value) {
      await regenBrief();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    loading.value = false;
  }
}

async function regenBrief() {
  if (!studentSubjectId.value) return;
  saving.value = true;
  try {
    const { brief: b } = await los.generateSessionBrief({
      studentSubjectId: studentSubjectId.value,
      sessionId: props.sessionId ? Number(props.sessionId) : null
    });
    brief.value = b;
    Object.keys(plannedDone).forEach((k) => delete plannedDone[k]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function acceptBrief() {
  if (!brief.value?.id) return;
  saving.value = true;
  try {
    const { brief: b } = await los.updateSessionBrief(brief.value.id, { status: 'accepted' });
    brief.value = b;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function runAssist(action) {
  if (!studentSubjectId.value) return;
  saving.value = true;
  try {
    const focusGoal = goals.value.find((g) => ratings[g.id]) || goals.value[0];
    const result = await los.tutorAssist({
      action,
      studentSubjectId: studentSubjectId.value,
      planGoalId: focusGoal?.id || null,
      observation: [liveObservation.value, note.challengesObserved, note.summary].filter(Boolean).join(' · ')
    });
    assistDraft.value = result.draft;
    if (action === 'recap' && result.draft?.familyText) {
      // Keep for save — parent update can use this
      note.nextSteps = note.nextSteps || result.draft.practiceBullets?.join('; ') || note.nextSteps;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function draftFamilyRecap() {
  await runAssist('recap');
  if (assistDraft.value?.familyText) {
    successMsg.value = 'Family recap drafted — save notes to attach the parent update.';
  }
}

async function saveNote() {
  if (!studentSubjectId.value) return;
  saving.value = true;
  error.value = '';
  successMsg.value = '';
  try {
    const evidenceChips = goals.value
      .filter((g) => ratings[g.id])
      .map((g) => ({
        planGoalId: g.id,
        skillKey: g.skill_key,
        skillLabel: g.skill_label || g.title,
        rating: ratings[g.id]
      }));

    const plannedActivities = (brief.value?.planned_activities_json || []).map((a, i) => ({
      ...a,
      completed: !!plannedDone[i]
    }));

    const result = await los.saveSessionNote({
      studentSubjectId: studentSubjectId.value,
      sessionId: props.sessionId ? Number(props.sessionId) : null,
      sessionBriefId: brief.value?.id || null,
      learningPlanId: brief.value?.learning_plan_id || null,
      sessionType: props.sessionType,
      attendanceStatus: 'present',
      generalSupport: false,
      assignPractice: assignPractice.value,
      howItWent: {
        rating: note.howItWent,
        plannedActivities,
        engagement: engagement.engagement,
        confidence: engagement.confidence,
        participation: engagement.participation,
        liveObservation: liveObservation.value || null
      },
      summary: note.summary,
      strengthsObserved: note.strengthsObserved,
      challengesObserved: note.challengesObserved,
      nextSteps: note.nextSteps,
      homework: note.homework,
      parentUpdateDraft: assistDraft.value?.familyText || undefined,
      evidenceChips
    });

    if (props.sessionType === 'in_person' && props.sessionId) {
      try {
        await los.linkInPersonPlan({
          sessionId: Number(props.sessionId),
          studentSubjectId: studentSubjectId.value,
          goalIds: evidenceChips.map((c) => c.planGoalId).filter(Boolean)
        });
      } catch {
        // non-blocking
      }
    }

    lastSave.value = result;
    successMsg.value = result.practiceAssignment
      ? `Saved. Practice assigned: ${result.practiceAssignment.title}`
      : 'Note saved. Progress updated.';
    emit('saved', result);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

watch(studentSubjectId, () => {
  brief.value = null;
  lastSave.value = null;
  loadAll();
});

onMounted(async () => {
  await loadSubjects();
  await loadAll();
});
</script>

<style scoped>
.tsg {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  color: #0f172a;
}
.tsg-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-end;
}
.tsg-kicker {
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.tsg-title { margin: 0.15rem 0 0; font-size: 1.15rem; }
.tsg-meta { font-weight: 500; color: #64748b; font-size: 0.92rem; }
.tsg-header-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }
.tsg-rails {
  display: grid;
  grid-template-columns: minmax(200px, 0.9fr) minmax(280px, 1.4fr) minmax(220px, 1fr);
  gap: 0.75rem;
  align-items: start;
}
@media (max-width: 1100px) {
  .tsg-rails { grid-template-columns: 1fr; }
}
.tsg-rail { display: flex; flex-direction: column; gap: 0.65rem; min-width: 0; }
.tsg-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.tsg-card h3 { margin: 0; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
.tsg-subh { margin-top: 0.5rem !important; }
.tsg-warn { border-color: #fcd34d; background: #fffbeb; }
.tsg-objective { margin: 0; font-weight: 600; }
.tsg-standards { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.tsg-chip {
  font-size: 0.75rem;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
}
.tsg-sequence { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.tsg-seq-step {
  flex: 1 1 110px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.45rem;
  font-size: 0.8rem;
}
.tsg-seq-step p { margin: 0.2rem 0 0; color: #64748b; }
.tsg-list { margin: 0; padding-left: 1.1rem; font-size: 0.88rem; }
.tsg-muted { color: #64748b; font-size: 0.84rem; margin: 0; }
.tsg-error { color: #b91c1c; }
.tsg-ok { color: #15803d; font-size: 0.88rem; }
.tsg-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  display: inline-flex;
  align-items: center;
}
.tsg-btn.primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.tsg-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.tsg-select, .tsg textarea, .tsg-chip-row select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font: inherit;
  width: 100%;
}
.tsg-check, .tsg-radio { display: flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; }
.tsg-how { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.tsg-scale { display: grid; grid-template-columns: 90px 1fr 24px; gap: 0.35rem; align-items: center; font-size: 0.82rem; }
.tsg-chip-row { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; font-size: 0.85rem; }
.tsg-chip-row select { width: auto; }
.tsg-progress { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
.tsg-progress-fill { height: 100%; background: #16a34a; }
.tsg-assist { font-size: 0.88rem; margin: 0; white-space: pre-wrap; }
.tsg-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.65rem 0 0.25rem;
  border-top: 1px solid #e2e8f0;
}
</style>
