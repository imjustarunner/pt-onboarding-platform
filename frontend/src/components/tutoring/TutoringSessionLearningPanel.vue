<template>
  <div class="tsl-panel">
    <div class="tsl-head">
      <h3>Learning session</h3>
      <select v-model="studentSubjectId" class="tsl-select">
        <option :value="null">Select subject track</option>
        <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.subject_label }} ({{ s.status }})</option>
      </select>
    </div>

    <p v-if="error" class="tsl-error">{{ error }}</p>
    <p v-if="successMsg" class="tsl-ok">{{ successMsg }}</p>

    <section v-if="brief" class="tsl-card">
      <div class="tsl-card-head">
        <strong>Session brief</strong>
        <span class="tsl-badge">{{ brief.status }}</span>
      </div>
      <p v-if="brief.prior_session_recap" class="tsl-muted"><em>Prior:</em> {{ brief.prior_session_recap }}</p>
      <ul>
        <li v-for="(a, i) in brief.planned_activities_json || []" :key="i">
          <label class="tsl-check">
            <input type="checkbox" v-model="plannedDone[i]" />
            {{ a.title || a.suggestedFocus }}
          </label>
        </li>
      </ul>
      <p v-if="brief.tutor_prep_notes">{{ brief.tutor_prep_notes }}</p>
      <div class="tsl-actions">
        <button type="button" class="tsl-btn" :disabled="saving" @click="acceptBrief">Accept</button>
        <button type="button" class="tsl-btn" :disabled="saving" @click="markTutorOwn">Tutor’s own plan</button>
        <button type="button" class="tsl-btn" :disabled="saving" @click="regenBrief">Generate another</button>
      </div>
      <textarea
        v-if="brief.status === 'tutor_own' || brief.status === 'modified'"
        v-model="tutorOwnNotes"
        rows="2"
        placeholder="Describe your own plan for this session…"
        @change="saveTutorOwnNotes"
      />
    </section>
    <button v-else-if="studentSubjectId" type="button" class="tsl-btn primary" :disabled="saving" @click="regenBrief">
      Generate session brief
    </button>

    <section class="tsl-card">
      <strong>Quick session note</strong>
      <label class="tsl-check">
        <input type="checkbox" v-model="note.generalSupport" />
        General / homework support (goal link optional)
      </label>

      <div class="tsl-how">
        <span class="tsl-label">How it went</span>
        <label v-for="opt in howItWentOptions" :key="opt" class="tsl-radio">
          <input type="radio" v-model="note.howItWent" :value="opt" />
          {{ opt }}
        </label>
      </div>

      <textarea v-model="note.summary" rows="2" placeholder="Summary" />
      <textarea v-model="note.strengthsObserved" rows="2" placeholder="Strengths observed" />
      <textarea v-model="note.challengesObserved" rows="2" placeholder="Challenges observed" />
      <textarea v-model="note.nextSteps" rows="2" placeholder="Next steps" />
      <textarea v-model="note.homework" rows="2" placeholder="Homework / practice" />
      <label class="tsl-check">
        <input type="checkbox" v-model="assignPractice" />
        Assign practice for parents until next session
      </label>

      <div v-if="goals.length" class="tsl-evidence">
        <h4>Evidence chips</h4>
        <div v-for="g in goals" :key="g.id" class="tsl-chip-row">
          <span>{{ g.title }}</span>
          <select v-model="ratings[g.id]">
            <option value="">—</option>
            <option v-for="r in ratingOptions" :key="r.key" :value="r.key">{{ r.label }}</option>
          </select>
        </div>
      </div>

      <button type="button" class="tsl-btn primary" :disabled="saving || !studentSubjectId" @click="saveNote">
        Save note &amp; update progress
      </button>
    </section>

    <section v-if="lastSave" class="tsl-card tsl-after">
      <strong>After save</strong>
      <p v-if="lastSave.note?.parent_update_draft" class="tsl-parent">
        <em>Parent update draft:</em> {{ lastSave.note.parent_update_draft }}
      </p>
      <div v-if="lastSave.mastery?.length">
        <p class="tsl-label">Deterministic mastery</p>
        <ul>
          <li v-for="(m, i) in lastSave.mastery" :key="i">
            Goal #{{ m.planGoalId }} → {{ m.recommendedStatus || '—' }}:
            {{ m.reason }}
          </li>
        </ul>
      </div>
      <p v-if="lastSave.report" class="tsl-muted">
        After-session report draft #{{ lastSave.report.id }} created for families.
      </p>
      <p v-if="lastSave.practiceAssignment" class="tsl-ok">
        Practice assigned: {{ lastSave.practiceAssignment.title }}
      </p>
      <p v-if="lastSave.nextBrief" class="tsl-muted">
        Next session suggestion ready ({{ (lastSave.nextBrief.planned_activities_json || []).length }} activities).
      </p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { GOAL_RATING_OPTIONS } from '@/constants/tutoringLearningOs';
import * as los from '@/services/tutoringLearningOs';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  sessionId: { type: [Number, String], default: null },
  sessionType: { type: String, default: 'virtual' },
  initialSubjectId: { type: [Number, String], default: null }
});

const emit = defineEmits(['saved']);

const subjects = ref([]);
const studentSubjectId = ref(props.initialSubjectId ? Number(props.initialSubjectId) : null);
const brief = ref(null);
const goals = ref([]);
const ratings = reactive({});
const plannedDone = reactive({});
const saving = ref(false);
const error = ref('');
const successMsg = ref('');
const lastSave = ref(null);
const tutorOwnNotes = ref('');
const assignPractice = ref(true);
const ratingOptions = GOAL_RATING_OPTIONS;
const howItWentOptions = ['Exceeded', 'Met', 'Partially Met', 'Not Yet'];

const note = reactive({
  generalSupport: false,
  howItWent: 'Met',
  summary: '',
  strengthsObserved: '',
  challengesObserved: '',
  nextSteps: '',
  homework: ''
});

async function loadSubjects() {
  const data = await los.fetchLearningOverview(props.clientId);
  subjects.value = (data.subjects || []).map((r) => r.subject);
  if (!studentSubjectId.value && subjects.value.length) {
    const active = subjects.value.find((s) => s.status === 'active_tutoring') || subjects.value[0];
    studentSubjectId.value = active.id;
  }
}

async function loadBriefAndGoals() {
  if (!studentSubjectId.value) return;
  error.value = '';
  try {
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
        note.generalSupport = !!existingNote.note.general_support;
        note.howItWent = existingNote.note.how_it_went_json?.rating || 'Met';
      }
    }
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
    if (brief.value?.planned_activities_json) {
      brief.value.planned_activities_json.forEach((_, i) => {
        if (plannedDone[i] == null) plannedDone[i] = false;
      });
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
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

async function markTutorOwn() {
  if (!brief.value?.id) return;
  saving.value = true;
  try {
    const { brief: b } = await los.updateSessionBrief(brief.value.id, {
      status: 'tutor_own',
      generatedBy: 'tutor',
      tutorPrepNotes: tutorOwnNotes.value || brief.value.tutor_prep_notes
    });
    brief.value = b;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    saving.value = false;
  }
}

async function saveTutorOwnNotes() {
  if (!brief.value?.id) return;
  try {
    const { brief: b } = await los.updateSessionBrief(brief.value.id, {
      status: brief.value.status === 'accepted' ? 'modified' : brief.value.status,
      tutorPrepNotes: tutorOwnNotes.value
    });
    brief.value = b;
  } catch {
    // non-blocking
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
      generalSupport: note.generalSupport,
      howItWent: { rating: note.howItWent, plannedActivities },
      summary: note.summary,
      strengthsObserved: note.strengthsObserved,
      challengesObserved: note.challengesObserved,
      nextSteps: note.nextSteps,
      homework: note.homework,
      assignPractice: assignPractice.value,
      evidenceChips
    });

    // Bridge to in-person plan when applicable
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
    successMsg.value = 'Note saved. Progress and mastery updated.';
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
  loadBriefAndGoals();
});

onMounted(async () => {
  await loadSubjects();
  await loadBriefAndGoals();
});
</script>

<style scoped>
.tsl-panel { display: flex; flex-direction: column; gap: 0.75rem; }
.tsl-head { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }
.tsl-head h3 { margin: 0; font-size: 1rem; }
.tsl-select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.35rem 0.55rem; }
.tsl-card {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem;
  display: flex; flex-direction: column; gap: 0.45rem; background: #fff;
}
.tsl-card-head { display: flex; justify-content: space-between; align-items: center; }
.tsl-badge { font-size: 0.72rem; background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 0.1rem 0.45rem; }
.tsl-muted { color: #64748b; font-size: 0.86rem; margin: 0; }
.tsl-error { color: #b91c1c; font-size: 0.88rem; }
.tsl-ok { color: #15803d; font-size: 0.88rem; }
.tsl-btn {
  align-self: flex-start; border: 1px solid #cbd5e1; background: #fff;
  border-radius: 8px; padding: 0.4rem 0.7rem; font-size: 0.85rem; cursor: pointer;
}
.tsl-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.tsl-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.tsl-panel textarea {
  width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.45rem 0.6rem; font: inherit;
}
.tsl-check { display: flex; gap: 0.4rem; align-items: flex-start; font-size: 0.88rem; }
.tsl-chip-row { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; font-size: 0.88rem; }
.tsl-chip-row select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.25rem; }
.tsl-how { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
.tsl-label { font-size: 0.8rem; font-weight: 600; color: #475569; }
.tsl-radio { display: inline-flex; gap: 0.25rem; align-items: center; font-size: 0.82rem; }
.tsl-parent { font-size: 0.88rem; margin: 0; }
.tsl-after { background: #f8fafc; }
</style>
