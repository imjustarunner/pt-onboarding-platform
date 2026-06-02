<template>
  <div v-if="open" class="ek-obs-overlay ek-obs-overlay--fullscreen">
    <div class="ek-obs-card ek-obs-card--fullscreen">
      <header class="ek-obs-hdr">
        <div>
          <div class="ek-obs-title">Log session observation</div>
          <div class="muted small">{{ clientLabel }}</div>
        </div>
        <button type="button" class="btn btn-text" @click="$emit('close')">Close</button>
      </header>

      <div v-if="loading" class="muted small ek-obs-pad">Loading…</div>
      <div v-else-if="loadError" class="error-box ek-obs-pad">{{ loadError }}</div>

      <template v-else-if="submitted">
        <div class="ek-obs-success">
          <strong>Observation saved.</strong>
          <p class="muted small">This log is private and only visible to staff in the event portal.</p>
        </div>
        <footer class="ek-obs-footer">
          <button type="button" class="btn btn-primary" @click="$emit('close')">Done</button>
        </footer>
      </template>

      <template v-else>
        <div class="ek-obs-progress">
          <div
            v-for="(s, i) in steps"
            :key="s.id"
            class="ek-obs-progress-seg"
            :class="{ done: i < stepIndex, active: i === stepIndex }"
          />
        </div>
        <p class="muted small ek-obs-step-lbl">Step {{ stepIndex + 1 }} of {{ steps.length }} — {{ currentStep.title }}</p>

        <!-- Step: Staff identity -->
        <section v-if="currentStep.id === 'staff'" class="ek-obs-step">
          <h4 class="ek-obs-h4">Who is logging this?</h4>
          <p class="muted small">Select a checked-in staff member assigned to this event.</p>
          <ul v-if="checkedInStaff.length" class="ek-obs-staff-list">
            <li
              v-for="s in checkedInStaff"
              :key="s.id"
              class="ek-obs-staff-opt"
              :class="{ 'ek-obs-staff-opt--sel': authorUserId === s.id }"
              @click="selectStaff(s.id)"
            >
              <strong>{{ s.displayName }}</strong>
              <span v-if="authorUserId === s.id" class="ek-obs-tick">✓</span>
            </li>
          </ul>
          <p v-else class="muted small">No employees checked in. Check in under Employee Check-In first.</p>
        </section>

        <!-- Step: Overall -->
        <section v-else-if="currentStep.id === 'overall'" class="ek-obs-step">
          <h4 class="ek-obs-h4">How is {{ clientLabel }} doing today?</h4>
          <div class="ek-obs-chips">
            <button
              v-for="opt in presets.overallStatus"
              :key="opt.id"
              type="button"
              class="ek-obs-chip"
              :class="{ 'ek-obs-chip--sel': draft.overallStatus === opt.id }"
              @click="selectOverall(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
        </section>

        <!-- Step: Activities -->
        <section v-else-if="currentStep.id === 'activity'" class="ek-obs-step">
          <h4 class="ek-obs-h4">What activity or skill work?</h4>
          <p class="muted small">Tap a listed activity, type one below, or skip if none apply.</p>
          <div v-if="activityOptions.length" class="ek-obs-chips">
            <button
              v-for="opt in activityOptions"
              :key="opt.id"
              type="button"
              class="ek-obs-chip"
              :class="{ 'ek-obs-chip--sel': draft.activityIds.includes(Number(opt.id)) }"
              @click="selectActivity(Number(opt.id))"
            >
              {{ opt.label }}
            </button>
          </div>
          <div class="ek-obs-type-row">
            <input
              v-model="draft.activityOther"
              class="input"
              type="text"
              placeholder="Type activity name"
              @keyup.enter="confirmTypedActivity"
            />
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!draft.activityOther.trim()"
              @click="confirmTypedActivity"
            >
              Continue
            </button>
          </div>
          <button type="button" class="ek-obs-chip ek-obs-chip--skip" @click="skipStep">Skip — no activity</button>
        </section>

        <!-- Step: Behaviors -->
        <section v-else-if="currentStep.id === 'behaviors'" class="ek-obs-step">
          <h4 class="ek-obs-h4">Behaviors observed</h4>
          <template v-if="!draft.behaviorValence">
            <p class="muted small">Tap the tone that fits, then pick a behavior.</p>
            <div class="ek-obs-chips ek-obs-chips--row">
              <button
                v-for="opt in presets.behaviorValence"
                :key="opt.id"
                type="button"
                class="ek-obs-chip"
                @click="selectBehaviorValence(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
          </template>
          <template v-else>
            <p class="muted small">
              {{ behaviorValenceLabel }} — tap one behavior, or skip.
            </p>
            <div class="ek-obs-chips">
              <button
                v-for="opt in behaviorPresetList"
                :key="opt.id"
                type="button"
                class="ek-obs-chip"
                :class="{ 'ek-obs-chip--sel': draft.behaviors.includes(opt.id) }"
                @click="selectBehavior(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
            <button type="button" class="ek-obs-chip ek-obs-chip--skip" @click="skipStep">Skip — no behavior noted</button>
          </template>
        </section>

        <!-- Step: Strengths -->
        <section v-else-if="currentStep.id === 'strengths'" class="ek-obs-step">
          <h4 class="ek-obs-h4">Doing well at</h4>
          <p class="muted small">Tap one strength, or skip.</p>
          <div class="ek-obs-chips">
            <button
              v-for="opt in presets.strengths"
              :key="opt.id"
              type="button"
              class="ek-obs-chip"
              :class="{ 'ek-obs-chip--sel': draft.strengths.includes(opt.id) }"
              @click="selectStrength(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
          <button type="button" class="ek-obs-chip ek-obs-chip--skip" @click="skipStep">Skip</button>
        </section>

        <!-- Step: Struggles -->
        <section v-else-if="currentStep.id === 'struggles'" class="ek-obs-step">
          <h4 class="ek-obs-h4">Struggling with</h4>
          <p class="muted small">Tap one struggle, or skip.</p>
          <div class="ek-obs-chips">
            <button
              v-for="opt in presets.struggles"
              :key="opt.id"
              type="button"
              class="ek-obs-chip"
              :class="{ 'ek-obs-chip--sel': draft.struggles.includes(opt.id) }"
              @click="selectStruggle(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
          <button type="button" class="ek-obs-chip ek-obs-chip--skip" @click="skipStep">Skip</button>
        </section>

        <!-- Step: Peer interaction -->
        <section v-else-if="currentStep.id === 'peer'" class="ek-obs-step">
          <h4 class="ek-obs-h4">Peer interaction</h4>
          <div class="ek-obs-chips">
            <button
              v-for="opt in presets.peerInteraction"
              :key="opt.id"
              type="button"
              class="ek-obs-chip"
              :class="{ 'ek-obs-chip--sel': draft.peerInteraction === opt.id }"
              @click="selectPeer(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
        </section>

        <!-- Step: Brief note -->
        <section v-else-if="currentStep.id === 'note'" class="ek-obs-step">
          <h4 class="ek-obs-h4">Anything else? (optional)</h4>
          <textarea v-model="draft.briefNote" class="input" rows="3" placeholder="One-line note for staff" />
          <button type="button" class="ek-obs-chip ek-obs-chip--skip ek-obs-skip-block" @click="submit">
            Skip note — submit now
          </button>
        </section>

        <div v-if="saveError" class="error-box ek-obs-err">{{ saveError }}</div>

        <footer class="ek-obs-footer">
          <button v-if="stepIndex > 0" type="button" class="btn btn-secondary" @click="goBack">Back</button>
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button
            v-if="isLastStep"
            type="button"
            class="btn btn-primary"
            :disabled="saving"
            @click="submit"
          >
            {{ saving ? 'Saving…' : 'Submit observation' }}
          </button>
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  client: { type: Object, default: null },
  checkedInStaff: { type: Array, default: () => [] },
  configUrl: { type: String, required: true },
  saveUrl: { type: String, required: true },
  authHeaders: { type: Function, default: () => ({}) },
  displayName: { type: Function, default: (c) => c?.fullName || c?.kioskDisplayName || 'Client' }
});

defineEmits(['close', 'saved']);

const steps = [
  { id: 'staff', title: 'Staff member' },
  { id: 'overall', title: 'Overall today' },
  { id: 'activity', title: 'Activity' },
  { id: 'behaviors', title: 'Behaviors' },
  { id: 'strengths', title: 'Strengths' },
  { id: 'struggles', title: 'Struggles' },
  { id: 'peer', title: 'Peer interaction' },
  { id: 'note', title: 'Optional note' }
];

const loading = ref(false);
const loadError = ref('');
const presets = ref({
  overallStatus: [],
  behaviorValence: [],
  behaviorsPositive: [],
  behaviorsConcerning: [],
  strengths: [],
  struggles: [],
  peerInteraction: []
});
const activityOptions = ref([]);
const sessionDate = ref('');

const stepIndex = ref(0);
const authorUserId = ref(null);
const draft = ref(emptyDraft());
const saving = ref(false);
const saveError = ref('');
const submitted = ref(false);

const clientLabel = computed(() => props.displayName(props.client));
const currentStep = computed(() => steps[stepIndex.value] || steps[0]);
const isLastStep = computed(() => stepIndex.value >= steps.length - 1);

const behaviorPresetList = computed(() => {
  if (draft.value.behaviorValence === 'concerning') return presets.value.behaviorsConcerning || [];
  if (draft.value.behaviorValence === 'mixed') {
    return [...(presets.value.behaviorsPositive || []), ...(presets.value.behaviorsConcerning || [])];
  }
  return presets.value.behaviorsPositive || [];
});

const behaviorValenceLabel = computed(() => {
  const id = draft.value.behaviorValence;
  const hit = (presets.value.behaviorValence || []).find((p) => p.id === id);
  return hit?.label || '';
});

function goNext() {
  if (stepIndex.value < steps.length - 1) stepIndex.value += 1;
}

function goBack() {
  if (currentStep.value.id === 'behaviors' && draft.value.behaviorValence) {
    draft.value.behaviorValence = '';
    draft.value.behaviors = [];
    draft.value.behaviorsOther = '';
    return;
  }
  if (stepIndex.value > 0) stepIndex.value -= 1;
}

function selectStaff(id) {
  authorUserId.value = id;
  goNext();
}

function selectOverall(id) {
  draft.value.overallStatus = id;
  goNext();
}

function selectActivity(id) {
  draft.value.activityIds = [id];
  draft.value.activityOther = '';
  goNext();
}

function confirmTypedActivity() {
  const text = String(draft.value.activityOther || '').trim();
  if (!text) return;
  draft.value.activityIds = [];
  draft.value.activityOther = text;
  goNext();
}

function selectBehaviorValence(id) {
  draft.value.behaviorValence = id;
  draft.value.behaviors = [];
  draft.value.behaviorsOther = '';
}

function selectBehavior(id) {
  draft.value.behaviors = [id];
  draft.value.behaviorsOther = '';
  goNext();
}

function selectStrength(id) {
  draft.value.strengths = [id];
  draft.value.strengthsOther = '';
  goNext();
}

function selectStruggle(id) {
  draft.value.struggles = [id];
  draft.value.strugglesOther = '';
  goNext();
}

function selectPeer(id) {
  draft.value.peerInteraction = id;
  goNext();
}

function skipStep() {
  goNext();
}

function emptyDraft() {
  return {
    overallStatus: '',
    activityIds: [],
    activityOther: '',
    behaviorValence: '',
    behaviors: [],
    behaviorsOther: '',
    strengths: [],
    strengthsOther: '',
    struggles: [],
    strugglesOther: '',
    peerInteraction: '',
    briefNote: ''
  };
}

function resetWizard() {
  stepIndex.value = 0;
  authorUserId.value = null;
  draft.value = emptyDraft();
  saving.value = false;
  saveError.value = '';
  submitted.value = false;
}

async function loadConfig() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(props.configUrl, {
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    presets.value = res.data?.presets || presets.value;
    activityOptions.value = res.data?.activityOptions || [];
    sessionDate.value = res.data?.sessionDate || '';
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Could not load observation form';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!props.client?.id || !authorUserId.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    await api.post(
      props.saveUrl,
      {
        clientId: props.client.id,
        authorUserId: authorUserId.value,
        sessionDate: sessionDate.value || undefined,
        payload: draft.value
      },
      {
        headers: props.authHeaders(),
        skipGlobalLoading: true,
        skipAuthRedirect: true
      }
    );
    submitted.value = true;
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Could not save observation';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      resetWizard();
      loadConfig();
    }
  }
);
</script>

<style scoped>
.ek-obs-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.ek-obs-overlay--fullscreen {
  background: #fff;
  padding:
    max(16px, env(safe-area-inset-top, 0px))
    max(24px, env(safe-area-inset-right, 0px))
    max(16px, env(safe-area-inset-bottom, 0px))
    max(24px, env(safe-area-inset-left, 0px));
  justify-content: center;
  align-items: stretch;
}
.ek-obs-card {
  background: #fff;
  border-radius: 14px;
  width: min(520px, 100%);
  max-height: min(92vh, 780px);
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}
.ek-obs-card--fullscreen {
  width: min(600px, 100%);
  max-width: 600px;
  height: 100%;
  max-height: none;
  margin: 0 auto;
  border-radius: 0;
  box-shadow: none;
  -webkit-overflow-scrolling: touch;
}
.ek-obs-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 18px 8px;
  border-bottom: 1px solid #e2e8f0;
}
.ek-obs-title {
  font-size: 1.15rem;
  font-weight: 800;
}
.ek-obs-pad { padding: 20px 18px; }
.ek-obs-progress {
  display: flex;
  gap: 4px;
  padding: 12px 18px 0;
}
.ek-obs-progress-seg {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
}
.ek-obs-progress-seg.done { background: #86efac; }
.ek-obs-progress-seg.active { background: #16a34a; }
.ek-obs-step-lbl { padding: 8px 18px 0; margin: 0; }
.ek-obs-step { padding: 12px 18px; }
.ek-obs-h4 { margin: 0 0 8px; color: #166534; font-size: 1rem; }
.ek-obs-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.ek-obs-chips--row { margin-bottom: 12px; }
.ek-obs-chip {
  border: 2px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.92rem;
  cursor: pointer;
  min-height: 44px;
}
.ek-obs-chip--sel {
  border-color: #16a34a;
  background: #ecfdf5;
  color: #14532d;
  font-weight: 600;
}
.ek-obs-chip--check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.ek-obs-chip--check input { margin: 0; }
.ek-obs-chip--skip {
  border-style: dashed;
  color: #64748b;
  background: #fff;
}
.ek-obs-skip-block {
  margin-top: 10px;
  width: 100%;
  justify-content: center;
}
.ek-obs-type-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 10px 0;
}
.ek-obs-type-row .input {
  flex: 1;
  min-height: 44px;
}
.ek-obs-staff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ek-obs-staff-opt {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
}
.ek-obs-staff-opt--sel {
  border-color: #16a34a;
  background: #ecfdf5;
}
.ek-obs-tick { color: #16a34a; font-weight: 800; }
.ek-obs-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
  padding: 12px 18px 18px;
  border-top: 1px solid #e2e8f0;
}
.ek-obs-err { margin: 0 18px 8px; }
.ek-obs-success {
  padding: 24px 18px;
  text-align: center;
}
</style>
