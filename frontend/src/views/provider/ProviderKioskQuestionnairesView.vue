<template>
  <div class="pkq-root">
    <div class="pkq-container">
      <div class="pkq-page-header">
        <h1 class="pkq-page-header__title">Kiosk Questionnaires</h1>
        <p class="pkq-page-header__sub">
          Assign questionnaires to fire when your clients check in at the kiosk. Rules can apply to all your appointments, specific days, or specific time windows. Results are tracked by day and time — never by client identity on the kiosk.
        </p>
      </div>

      <!-- Tabs -->
      <div class="pkq-tabs">
        <button
          class="pkq-tab"
          :class="{ 'pkq-tab--active': activeTab === 'rules' }"
          @click="activeTab = 'rules'"
        >
          My Rules
        </button>
        <button
          class="pkq-tab"
          :class="{ 'pkq-tab--active': activeTab === 'results' }"
          @click="activeTab = 'results'"
        >
          Results &amp; Trends
        </button>
      </div>

      <!-- ── Rules tab ────────────────────────────── -->
      <div v-if="activeTab === 'rules'" class="pkq-section">
        <div class="pkq-section-top">
          <h2 class="pkq-section__title">Active Rules</h2>
          <button class="pkq-btn pkq-btn--primary" @click="showNewRuleForm = !showNewRuleForm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Rule
          </button>
        </div>

        <!-- New rule form -->
        <div v-if="showNewRuleForm" class="pkq-rule-form">
          <h3 class="pkq-rule-form__title">New Rule</h3>
          <div class="pkq-form-grid">
            <div class="pkq-form-field">
              <label class="pkq-label">Location <span class="pkq-required">*</span></label>
              <select v-model="newRule.officeLocationId" class="pkq-input">
                <option :value="null" disabled>Select location…</option>
                <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
              </select>
            </div>
            <div class="pkq-form-field">
              <label class="pkq-label">Questionnaire <span class="pkq-required">*</span></label>
              <select v-model="newRule.questSource" class="pkq-input">
                <option :value="null" disabled>Select questionnaire…</option>
                <optgroup v-if="modules.length" label="Training Modules">
                  <option v-for="m in modules" :key="`m-${m.id}`" :value="`m:${m.id}`">{{ m.title }}</option>
                </optgroup>
                <optgroup v-if="intakeLinks.length" label="Intake Forms">
                  <option v-for="il in intakeLinks" :key="`il-${il.id}`" :value="`il:${il.id}`">{{ il.title }}</option>
                </optgroup>
              </select>
            </div>
            <div class="pkq-form-field">
              <label class="pkq-label">Day of week</label>
              <select v-model="newRule.dayOfWeek" class="pkq-input">
                <option :value="null">All days</option>
                <option v-for="d in dayOptions" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </div>
            <div class="pkq-form-field">
              <label class="pkq-label">Hour start</label>
              <select v-model="newRule.hourStart" class="pkq-input">
                <option :value="null">Any time</option>
                <option v-for="h in hourOptions" :key="h.value" :value="h.value">{{ h.label }}</option>
              </select>
            </div>
            <div class="pkq-form-field">
              <label class="pkq-label">Hour end</label>
              <select v-model="newRule.hourEnd" class="pkq-input">
                <option :value="null">Same as start</option>
                <option v-for="h in hourOptions" :key="h.value" :value="h.value">{{ h.label }}</option>
              </select>
            </div>
          </div>
          <div v-if="createError" class="pkq-error">{{ createError }}</div>
          <div class="pkq-form-actions">
            <button class="pkq-btn pkq-btn--secondary" @click="cancelNewRule">Cancel</button>
            <button class="pkq-btn pkq-btn--primary" :disabled="creating" @click="createRule">
              <span v-if="creating">Saving…</span>
              <span v-else>Save Rule</span>
            </button>
          </div>
        </div>

        <!-- Rules list -->
        <div v-if="loadingRules" class="pkq-loading">
          <div class="pkq-spinner" />
          <span>Loading rules…</span>
        </div>
        <div v-else-if="rules.length === 0 && !showNewRuleForm" class="pkq-empty">
          No rules yet. Click <strong>Add Rule</strong> to create your first questionnaire assignment.
        </div>
        <div v-else class="pkq-rules-list">
          <div v-for="rule in rules" :key="rule.id" class="pkq-rule-row">
            <div class="pkq-rule-row__info">
              <div class="pkq-rule-row__title">{{ rule.module_title || rule.intake_link_title || 'Questionnaire' }}</div>
              <div class="pkq-rule-row__meta">
                <span>{{ rule.location_name }}</span>
                <span v-if="rule.room_name">· {{ rule.room_name }}</span>
                <span v-if="rule.day_of_week != null">· {{ dayOptions.find(d => d.value === rule.day_of_week)?.label }}</span>
                <span v-if="rule.hour_start != null">· {{ formatHour(rule.hour_start) }}<span v-if="rule.hour_end != null && rule.hour_end !== rule.hour_start">–{{ formatHour(rule.hour_end) }}</span></span>
                <span v-else>· All times</span>
              </div>
            </div>
            <div class="pkq-rule-row__actions">
              <span class="pkq-rule-status" :class="rule.is_active ? 'pkq-rule-status--active' : 'pkq-rule-status--off'">
                {{ rule.is_active ? 'Active' : 'Inactive' }}
              </span>
              <button class="pkq-icon-btn pkq-icon-btn--danger" title="Delete rule" @click="deleteRule(rule.id)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Results tab ──────────────────────────── -->
      <div v-if="activeTab === 'results'" class="pkq-section">
        <div class="pkq-results-filter">
          <label class="pkq-label">Filter by location:</label>
          <select v-model="resultsLocationId" class="pkq-input" style="max-width: 260px;">
            <option :value="null">All locations</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
          </select>
        </div>
        <KioskQuestionnaireResults :location-id="resultsLocationId" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '../../services/api';
import KioskQuestionnaireResults from '../../components/kiosk/KioskQuestionnaireResults.vue';

const activeTab = ref('rules');

// Rules
const rules = ref([]);
const loadingRules = ref(true);
const showNewRuleForm = ref(false);
const creating = ref(false);
const createError = ref('');

const newRule = ref({
  officeLocationId: null,
  questSource: null,
  dayOfWeek: null,
  hourStart: null,
  hourEnd: null
});

// Options
const locations = ref([]);
const modules = ref([]);
const intakeLinks = ref([]);
const resultsLocationId = ref(null);

const dayOptions = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];

const hourOptions = Array.from({ length: 18 }, (_, i) => {
  const h = i + 6;
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return { value: h, label: d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).replace(':00', '') };
});

function formatHour(h) {
  if (h == null) return '';
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).replace(':00', '');
}

async function loadRules() {
  loadingRules.value = true;
  try {
    const res = await api.get('/kiosk/questionnaire-rules');
    rules.value = res.data?.rules || [];
  } catch {
    rules.value = [];
  } finally {
    loadingRules.value = false;
  }
}

async function loadOptions() {
  try {
    const [locRes, modRes, ilRes] = await Promise.all([
      api.get('/office-schedule/locations').catch(() => ({ data: [] })),
      api.get('/modules').catch(() => ({ data: [] })),
      api.get('/intake-links').catch(() => ({ data: [] }))
    ]);
    locations.value = locRes.data?.locations || locRes.data || [];
    modules.value = modRes.data?.modules || modRes.data || [];
    intakeLinks.value = ilRes.data?.intakeLinks || ilRes.data || [];
  } catch {
    // ignore
  }
}

function cancelNewRule() {
  showNewRuleForm.value = false;
  createError.value = '';
  newRule.value = { officeLocationId: null, questSource: null, dayOfWeek: null, hourStart: null, hourEnd: null };
}

async function createRule() {
  createError.value = '';
  if (!newRule.value.officeLocationId) { createError.value = 'Please select a location.'; return; }
  if (!newRule.value.questSource) { createError.value = 'Please select a questionnaire.'; return; }

  const src = newRule.value.questSource;
  const moduleId = src.startsWith('m:') ? parseInt(src.slice(2)) : null;
  const intakeLinkId = src.startsWith('il:') ? parseInt(src.slice(3)) : null;

  creating.value = true;
  try {
    await api.post('/kiosk/questionnaire-rules', {
      officeLocationId: newRule.value.officeLocationId,
      dayOfWeek: newRule.value.dayOfWeek,
      hourStart: newRule.value.hourStart,
      hourEnd: newRule.value.hourEnd,
      moduleId,
      intakeLinkId
    });
    cancelNewRule();
    await loadRules();
  } catch (e) {
    createError.value = e?.response?.data?.error?.message || 'Failed to save rule.';
  } finally {
    creating.value = false;
  }
}

async function deleteRule(ruleId) {
  if (!confirm('Delete this questionnaire rule?')) return;
  try {
    await api.delete(`/kiosk/questionnaire-rules/${ruleId}`);
    rules.value = rules.value.filter((r) => r.id !== ruleId);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to delete rule.');
  }
}

onMounted(() => {
  loadRules();
  loadOptions();
});
</script>

<style scoped>
.pkq-root {
  min-height: 100dvh;
  background: #f5f8fa;
  font-family: 'Segoe UI', Arial, sans-serif;
  padding: 32px 20px 60px;
}
.pkq-container {
  max-width: 900px;
  margin: 0 auto;
}

/* Page header */
.pkq-page-header { margin-bottom: 28px; }
.pkq-page-header__title {
  font-size: 26px;
  font-weight: 900;
  color: #1a2f3a;
  margin: 0 0 6px;
}
.pkq-page-header__sub {
  font-size: 14px;
  color: #5a7585;
  line-height: 1.5;
  margin: 0;
  max-width: 640px;
}

/* Tabs */
.pkq-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e2ecf0;
  margin-bottom: 28px;
}
.pkq-tab {
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 700;
  color: #6b8494;
  background: none;
  border: none;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: color 0.1s, border-color 0.1s;
}
.pkq-tab--active { color: #1e3a4a; border-bottom-color: #1e3a4a; }
.pkq-tab:hover:not(.pkq-tab--active) { color: #1e3a4a; }

/* Section */
.pkq-section { background: #fff; border-radius: 16px; border: 1.5px solid #e2ecf0; padding: 24px; }
.pkq-section-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.pkq-section__title {
  font-size: 18px;
  font-weight: 800;
  color: #1a2f3a;
  margin: 0;
}

/* Rule form */
.pkq-rule-form {
  background: #f5f8fa;
  border: 1.5px solid #dde6eb;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}
.pkq-rule-form__title {
  font-size: 15px;
  font-weight: 800;
  color: #1e3a4a;
  margin: 0 0 16px;
}
.pkq-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.pkq-form-field { display: flex; flex-direction: column; gap: 5px; }
.pkq-label {
  font-size: 12px;
  font-weight: 700;
  color: #4a6070;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.pkq-required { color: #c0392b; }
.pkq-input {
  padding: 9px 12px;
  border: 1.5px solid #dde6eb;
  border-radius: 9px;
  font-size: 14px;
  color: #1a2f3a;
  background: #fff;
  outline: none;
  transition: border-color 0.12s;
}
.pkq-input:focus { border-color: #3a6b7a; }
.pkq-form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* Rules list */
.pkq-rules-list { display: flex; flex-direction: column; gap: 10px; }
.pkq-rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1.5px solid #e8edf2;
  border-radius: 12px;
  background: #fafcfd;
  gap: 12px;
}
.pkq-rule-row__info { flex: 1; min-width: 0; }
.pkq-rule-row__title {
  font-size: 14px;
  font-weight: 700;
  color: #1a2f3a;
  margin-bottom: 3px;
}
.pkq-rule-row__meta {
  font-size: 12px;
  color: #7a9aaa;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pkq-rule-row__actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.pkq-rule-status {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  background: #f0f4f6;
  color: #8aa3b0;
}
.pkq-rule-status--active { background: #eef6f3; color: #2e7055; }
.pkq-rule-status--off { background: #f9f0f0; color: #c0392b; }

/* Results filter */
.pkq-results-filter { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }

/* Buttons */
.pkq-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: opacity 0.12s, background 0.12s;
}
.pkq-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pkq-btn--primary { background: #1e3a4a; color: #fff; }
.pkq-btn--primary:hover:not(:disabled) { background: #2d5265; }
.pkq-btn--secondary { background: #e8edf2; color: #2a4a5a; }
.pkq-btn--secondary:hover:not(:disabled) { background: #dae3ea; }

.pkq-icon-btn {
  background: none;
  border: 1.5px solid #e2ecf0;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  color: #8aa3b0;
  line-height: 1;
  transition: color 0.1s, border-color 0.1s, background 0.1s;
}
.pkq-icon-btn--danger:hover { color: #c0392b; border-color: #e6b0aa; background: #fdf0ee; }

/* Misc */
.pkq-loading, .pkq-empty {
  padding: 32px 0;
  text-align: center;
  color: #7a9aaa;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.pkq-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #dde6eb;
  border-top-color: #3a6b7a;
  border-radius: 50%;
  animation: pkq-spin 0.7s linear infinite;
}
@keyframes pkq-spin { to { transform: rotate(360deg); } }

.pkq-error {
  color: #c0392b;
  font-size: 13px;
  background: #fdf0ee;
  border-radius: 8px;
  padding: 8px 12px;
  margin-top: 4px;
}

@media (max-width: 640px) {
  .pkq-form-grid { grid-template-columns: 1fr; }
}
</style>
