<template>
  <Teleport to="body">
    <div v-if="show" class="scp-overlay" @click.self="emitClose">
      <div class="scp-modal" role="dialog" aria-labelledby="scp-title">
        <header class="scp-header">
          <div>
            <h2 id="scp-title" class="scp-title">Staff Client Comfort Preferences</h2>
            <p class="scp-sub">Select the types of clients you feel comfortable working with.</p>
          </div>
          <button type="button" class="scp-close" aria-label="Close" @click="emitClose">×</button>
        </header>

        <div class="scp-body">
          <section class="scp-section">
            <h3><span class="scp-num">1</span> Academic Subjects</h3>
            <div class="scp-grid">
              <label v-for="opt in academicSubjects" :key="opt.key" class="scp-check">
                <input type="checkbox" :checked="form.academicSubjects.includes(opt.key)" @change="toggle('academicSubjects', opt.key)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="scp-section">
            <h3><span class="scp-num">2</span> Emotional &amp; Behavioral Challenges</h3>
            <div class="scp-grid">
              <label v-for="opt in emotionalBehavioral" :key="opt.key" class="scp-check">
                <input type="checkbox" :checked="form.emotionalBehavioral.includes(opt.key)" @change="toggle('emotionalBehavioral', opt.key)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="scp-section">
            <h3><span class="scp-num">3</span> Age Range</h3>
            <div class="scp-row">
              <label v-for="opt in ageRanges" :key="opt.key" class="scp-chip">
                <input type="checkbox" :checked="form.ageRanges.includes(opt.key)" @change="toggle('ageRanges', opt.key)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="scp-section">
            <h3><span class="scp-num">4</span> Grade Levels</h3>
            <div class="scp-row">
              <label v-for="opt in gradeLevels" :key="opt.key" class="scp-chip">
                <input type="checkbox" :checked="form.gradeLevels.includes(opt.key)" @change="toggle('gradeLevels', opt.key)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="scp-section">
            <h3><span class="scp-num">5</span> Service Types</h3>
            <div class="scp-row">
              <label v-for="opt in serviceTypes" :key="opt.key" class="scp-chip">
                <input type="checkbox" :checked="form.serviceTypes.includes(opt.key)" @change="toggle('serviceTypes', opt.key)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="scp-section">
            <h3><span class="scp-num">6</span> Assessments you can administer</h3>
            <div class="scp-grid">
              <label v-for="opt in assessmentTools" :key="opt.key" class="scp-check">
                <input type="checkbox" :checked="form.assessmentTools.includes(opt.key)" @change="toggle('assessmentTools', opt.key)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="scp-section">
            <h3>Additional Notes</h3>
            <textarea
              v-model="form.additionalNotes"
              rows="3"
              placeholder="Anything else we should know about the clients you feel most comfortable working with?"
            />
          </section>

          <p v-if="error" class="scp-error">{{ error }}</p>
        </div>

        <footer class="scp-footer">
          <button type="button" class="scp-btn scp-btn-ghost" :disabled="saving" @click="emitClose">Cancel</button>
          <button type="button" class="scp-btn scp-btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save Preferences' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import {
  ACADEMIC_SUBJECT_OPTIONS,
  EMOTIONAL_BEHAVIORAL_OPTIONS,
  AGE_RANGE_OPTIONS,
  GRADE_LEVEL_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  ASSESSMENT_TOOL_OPTIONS
} from '@/constants/tutoringLearningOs';
import {
  saveComfort,
  saveComfortDraft,
  getComfortDraft,
  fetchComfort
} from '@/services/tutoringLearningOs';

const props = defineProps({
  show: { type: Boolean, default: false },
  agencyId: { type: [Number, String], required: true },
  /** When set, saves to staff user preferences and syncs tutoring profile */
  userId: { type: [Number, String], default: null },
  /** When set (hiring), saves draft against hiring profile */
  hiringProfileId: { type: [Number, String], default: null },
  /** Alternate: resolve hiring profile from candidate user id */
  candidateUserId: { type: [Number, String], default: null },
  initial: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

const academicSubjects = ACADEMIC_SUBJECT_OPTIONS;
const emotionalBehavioral = EMOTIONAL_BEHAVIORAL_OPTIONS;
const ageRanges = AGE_RANGE_OPTIONS;
const gradeLevels = GRADE_LEVEL_OPTIONS;
const serviceTypes = SERVICE_TYPE_OPTIONS;
const assessmentTools = ASSESSMENT_TOOL_OPTIONS;

const form = reactive({
  academicSubjects: [],
  emotionalBehavioral: [],
  ageRanges: [],
  gradeLevels: [],
  serviceTypes: [],
  assessmentTools: [],
  additionalNotes: ''
});

const saving = ref(false);
const error = ref('');

function applyPayload(p) {
  if (!p) return;
  form.academicSubjects = [...(p.academic_subjects_json || p.academicSubjects || [])];
  form.emotionalBehavioral = [...(p.emotional_behavioral_json || p.emotionalBehavioral || [])];
  form.ageRanges = [...(p.age_ranges_json || p.ageRanges || [])];
  form.gradeLevels = [...(p.grade_levels_json || p.gradeLevels || [])];
  form.serviceTypes = [...(p.service_types_json || p.serviceTypes || [])];
  form.assessmentTools = [...(p.assessment_tools_json || p.assessmentTools || [])];
  form.additionalNotes = p.additional_notes || p.additionalNotes || '';
}

function toggle(field, key) {
  const arr = form[field];
  const idx = arr.indexOf(key);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(key);
}

function emitClose() {
  emit('close');
}

async function load() {
  error.value = '';
  applyPayload(props.initial);
  try {
    if (props.userId && props.agencyId) {
      const data = await fetchComfort(props.agencyId, props.userId);
      if (data.preferences) applyPayload(data.preferences);
    } else if (props.hiringProfileId) {
      const data = await getComfortDraft(props.hiringProfileId);
      if (data.draft) applyPayload(data.draft);
    }
  } catch {
    // empty form ok
  }
}

watch(
  () => props.show,
  (v) => {
    if (v) load();
  }
);

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      agencyId: Number(props.agencyId),
      academicSubjects: [...form.academicSubjects],
      emotionalBehavioral: [...form.emotionalBehavioral],
      ageRanges: [...form.ageRanges],
      gradeLevels: [...form.gradeLevels],
      serviceTypes: [...form.serviceTypes],
      assessmentTools: [...form.assessmentTools],
      additionalNotes: form.additionalNotes || null
    };
    let result;
    if (props.userId) {
      result = await saveComfort(props.agencyId, props.userId, payload);
    } else if (props.hiringProfileId || props.candidateUserId) {
      result = await saveComfortDraft({
        ...payload,
        hiringProfileId: props.hiringProfileId ? Number(props.hiringProfileId) : null,
        candidateUserId: props.candidateUserId ? Number(props.candidateUserId) : null
      });
    } else {
      throw new Error('userId or hiringProfileId/candidateUserId required');
    }
    emit('saved', result);
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save preferences';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.scp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  padding: 1rem;
}
.scp-modal {
  background: #fff;
  width: min(720px, 100%);
  max-height: min(90vh, 900px);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.scp-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}
.scp-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}
.scp-sub {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}
.scp-close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.scp-body {
  padding: 1rem 1.25rem;
  overflow: auto;
}
.scp-section {
  margin-bottom: 1.15rem;
}
.scp-section h3 {
  margin: 0 0 0.55rem;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: #1e293b;
}
.scp-num {
  display: inline-flex;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  background: #2563eb;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}
.scp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 0.35rem 0.75rem;
}
.scp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.scp-check,
.scp-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  color: #334155;
  cursor: pointer;
}
.scp-chip {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  background: #f8fafc;
}
.scp-chip:has(input:checked) {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}
.scp-section textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  resize: vertical;
}
.scp-error {
  color: #b91c1c;
  font-size: 0.9rem;
}
.scp-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem 1.1rem;
  border-top: 1px solid #e5e7eb;
}
.scp-btn {
  border-radius: 8px;
  padding: 0.5rem 0.95rem;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}
.scp-btn-ghost {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: #334155;
}
.scp-btn-primary {
  background: #2563eb;
  border: 1px solid #2563eb;
  color: #fff;
}
.scp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
