<template>
  <div class="detail-section cc-clinical-tab">
    <div v-if="clinicalLoading" class="loading">Loading clinical chart…</div>
    <div v-else-if="clinicalError" class="error">{{ clinicalError }}</div>

    <template v-else>
      <div class="cc-clinical-toolbar">
        <div class="cc-clinical-toolbar__meta muted">
          <span v-if="clinicalCapturedAt">
            Intake completed {{ formatDate(clinicalCapturedAt) }}.
          </span>
          <span v-else-if="clinicalTemplateMode">
            {{ isLearningClient ? 'Student profile template.' : 'Clinical profile template.' }}
          </span>
          <span v-if="clinicalTotalFieldCount">
            {{ clinicalTotalFieldCount }} responses across {{ clinicalSections.length }} sections.
          </span>
        </div>
        <div v-if="canEditClinicalResponses" class="form-actions" style="margin: 0;">
          <button v-if="!clinicalEditing" type="button" class="cc-btn-soft" @click="startClinicalEdit">
            Edit clinical info
          </button>
          <template v-else>
            <button type="button" class="cc-btn-primary" :disabled="clinicalSaving" @click="saveClinicalResponses">
              {{ clinicalSaving ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" class="cc-btn-soft" :disabled="clinicalSaving" @click="cancelClinicalEdit">
              Cancel
            </button>
          </template>
        </div>
      </div>

      <div
        v-if="!clinicalSections.length && clinicalEncryptionKeyMissing"
        class="empty-state cc-clinical-empty"
      >
        <p><strong>Clinical answers are stored but can't be displayed right now.</strong></p>
        <p class="muted small">
          Set <code>INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64</code> on the backend to decrypt stored intake responses.
        </p>
        <button
          v-if="isSuperAdmin"
          type="button"
          class="cc-btn-soft"
          :disabled="clinicalDebugLoading"
          @click="loadClinicalDebug"
        >
          {{ clinicalDebugLoading ? 'Investigating…' : 'Show diagnostics' }}
        </button>
        <pre v-if="clinicalDebug" class="cc-clinical-debug">{{ clinicalDebug }}</pre>
      </div>

      <div
        v-else-if="!clinicalSections.length && !billingDiagnoses.length"
        class="empty-state cc-clinical-empty"
      >
        <p>No clinical responses on file yet.</p>
        <p class="muted small">
          PSC-17, trauma indicators, goals, and intake clinical fields appear here when captured.
        </p>
        <button
          v-if="isSuperAdmin"
          type="button"
          class="cc-btn-soft"
          :disabled="clinicalDebugLoading"
          @click="loadClinicalDebug"
        >
          {{ clinicalDebugLoading ? 'Investigating…' : 'Why is this empty?' }}
        </button>
        <pre v-if="clinicalDebug" class="cc-clinical-debug">{{ clinicalDebug }}</pre>
      </div>

      <div v-else class="cc-clinical-layout">
        <aside class="cc-clinical-col cc-clinical-col--left">
          <section class="cc-card cc-clinical-card">
            <h4 class="cc-clinical-card__title">
              {{ isLearningClient ? 'Areas of concern' : 'Clinical snapshot' }}
            </h4>
            <div v-if="billingDiagnosesLoading && !isLearningClient" class="muted small">Loading…</div>
            <div v-else-if="billingDiagnosesError && !isLearningClient" class="error small">{{ billingDiagnosesError }}</div>
            <div v-else-if="displayConcerns.length" class="cc-clinical-dx-list">
              <div v-for="dx in displayConcerns" :key="dx.id || dx.icd10_code || dx.code" class="cc-clinical-dx">
                <div class="cc-clinical-dx-head">
                  <strong v-if="!isLearningClient || showConcernCode(dx)" class="mono">
                    {{ dx.icd10_code || dx.code }}
                  </strong>
                  <strong v-else>{{ dx.description || 'Area of concern' }}</strong>
                  <span v-if="dx.is_primary || dx.isPrimary" class="cc-dx-primary">
                    {{ isLearningClient ? 'Primary' : 'Primary' }}
                  </span>
                </div>
                <span v-if="isLearningClient && showConcernCode(dx)" class="small">{{ dx.description || '' }}</span>
                <span v-else-if="!isLearningClient" class="small">{{ dx.description || '' }}</span>
                <details v-if="dx.justification" class="cc-dx-just">
                  <summary>{{ isLearningClient ? 'Notes' : 'Justification' }}</summary>
                  <p>{{ dx.justification }}</p>
                </details>
              </div>
            </div>
            <div v-else-if="!isLearningClient && billingDiagnoses.length" class="cc-clinical-dx-list">
              <div v-for="dx in billingDiagnoses" :key="dx.code" class="cc-clinical-dx">
                <strong class="mono">{{ dx.code }}</strong>
                <span class="muted small">
                  {{ dx.sessionCount }} session{{ dx.sessionCount === 1 ? '' : 's' }}
                  <template v-if="dx.lastSeen"> · last {{ formatBillingDate(dx.lastSeen) }}</template>
                </span>
              </div>
            </div>
            <p v-else class="muted small">
              {{ isLearningClient ? 'No areas of concern on file yet.' : 'No diagnoses on file yet.' }}
            </p>

            <form
              v-if="isLearningClient"
              class="cc-concern-form"
              @submit.prevent="saveLearningConcern"
            >
              <label class="cc-concern-label" for="cc-concern-desc">Add area of concern</label>
              <input
                id="cc-concern-desc"
                v-model="concernDraft.description"
                type="text"
                class="cc-concern-input"
                placeholder="e.g. Reading fluency, executive function"
                maxlength="500"
                required
              />
              <label class="cc-concern-check">
                <input v-model="concernDraft.isPrimary" type="checkbox" />
                Mark as primary concern
              </label>
              <button type="submit" class="cc-btn-soft" :disabled="concernSaving || !concernDraft.description.trim()">
                {{ concernSaving ? 'Saving…' : 'Add concern' }}
              </button>
              <p v-if="concernError" class="error small">{{ concernError }}</p>
            </form>

            <button
              v-if="!isLearningClient"
              type="button"
              class="cc-clinical-link"
              @click="$emit('navigate', 'history')"
            >
              View diagnostic history →
            </button>
          </section>

          <section class="cc-card cc-clinical-card">
            <h4 class="cc-clinical-card__title">Key information</h4>
            <div v-if="keyInfoItems.length" class="cc-clinical-kv-list">
              <div v-for="item in keyInfoItems" :key="item.label" class="cc-clinical-kv">
                <div class="cc-clinical-kv__label">{{ item.label }}</div>
                <div class="cc-clinical-kv__value">{{ item.value }}</div>
              </div>
            </div>
            <p v-else class="muted small">No allergies, medications, or pharmacy on file.</p>
            <button
              v-if="canViewMedicalRecord"
              type="button"
              class="cc-clinical-link"
              @click="$emit('navigate', 'medical-record')"
            >
              View medical record →
            </button>
          </section>

          <section v-if="goalsPreview.length" class="cc-card cc-clinical-card">
            <h4 class="cc-clinical-card__title">Active goals</h4>
            <ul class="cc-clinical-goals">
              <li v-for="g in goalsPreview" :key="g.label">{{ g.value }}</li>
            </ul>
          </section>
        </aside>

        <div class="cc-clinical-col cc-clinical-col--main">
          <section class="cc-card cc-clinical-card cc-clinical-summary">
            <h4 class="cc-clinical-card__title">{{ isLearningClient ? 'Student summary' : 'Clinical summary' }}</h4>
            <p v-if="clinicalSummaryText" class="cc-clinical-summary__text">{{ clinicalSummaryText }}</p>
            <p v-else class="muted small">
              {{
                isLearningClient
                  ? 'No student summary narrative on file yet.'
                  : 'No narrative clinical summary on file yet.'
              }}
            </p>
            <div class="cc-clinical-status-grid">
              <div
                v-if="!isLearningClient || riskLevelLabel !== '—'"
                class="cc-clinical-status"
                :class="riskLevelLabel === 'Elevated' ? 'is-elevated' : ''"
              >
                <span class="cc-clinical-status__label">Risk level</span>
                <strong>{{ riskLevelLabel }}</strong>
              </div>
              <div v-if="!isLearningClient || psc17Summary" class="cc-clinical-status">
                <span class="cc-clinical-status__label">PSC-17</span>
                <strong>{{ psc17Summary ? `${psc17Summary.total} / ${psc17Summary.totalMax}` : '—' }}</strong>
              </div>
              <div class="cc-clinical-status">
                <span class="cc-clinical-status__label">{{ isLearningClient ? 'Goals on file' : 'Goals on file' }}</span>
                <strong>{{ goalsSection?.fields?.length || 0 }}</strong>
              </div>
              <div class="cc-clinical-status">
                <span class="cc-clinical-status__label">Sections</span>
                <strong>{{ clinicalSections.length }}</strong>
              </div>
            </div>
          </section>

          <section
            v-if="traumaSection && (!isLearningClient || traumaSectionHasValues)"
            class="ov-card cc-clinical-section"
            :class="clinicalSectionCardClass(traumaSection)"
          >
            <header class="ov-card-header">
              <h3>{{ traumaSection.title }}</h3>
            </header>
            <div class="ov-card-body">
              <div v-for="field in traumaSection.fields" :key="field.key" class="ov-row">
                <div class="ov-row-label">{{ field.label }}</div>
                <div class="ov-row-value">{{ field.value || '—' }}</div>
              </div>
            </div>
          </section>

          <div class="ov-sections cc-clinical-sections">
            <section
              v-for="section in detailSections"
              :key="section.title"
              class="ov-card cc-clinical-section"
              :class="clinicalSectionCardClass(section)"
            >
              <header class="ov-card-header">
                <h3>{{ section.title }}</h3>
                <span class="muted small">{{ section.fields.length }} items</span>
              </header>

              <div v-if="isPscSection(section)" class="ov-card-body">
                <div v-if="psc17Summary" class="psc-summary">
                  <div class="psc-total-row">
                    <div>
                      <div class="psc-total-label">Total score</div>
                      <div class="psc-total-value">
                        {{ psc17Summary.total }}<span class="psc-out-of"> / {{ psc17Summary.totalMax }}</span>
                      </div>
                    </div>
                    <span
                      class="psc-flag"
                      :class="psc17Summary.totalElevated ? 'psc-flag--elevated' : 'psc-flag--normal'"
                    >
                      {{ psc17Summary.totalElevated ? 'Elevated' : 'Within normal range' }}
                    </span>
                  </div>
                  <div class="psc-subscale-grid">
                    <div
                      v-for="sub in psc17Summary.subscales"
                      :key="sub.id"
                      class="psc-subscale"
                      :class="sub.elevated ? 'is-elevated' : 'is-normal'"
                    >
                      <div class="psc-subscale-header">
                        <span class="psc-subscale-name">{{ sub.label }}</span>
                        <span class="psc-subscale-flag">{{ sub.elevated ? 'Elevated' : 'Normal' }}</span>
                      </div>
                      <div class="psc-subscale-score">
                        {{ sub.score }}<span class="psc-out-of"> / {{ sub.max }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="psc-interpretation">
                    <div class="psc-interpretation-title">Clinical interpretation</div>
                    <p
                      v-for="(para, idx) in psc17InterpretationParagraphs"
                      :key="idx"
                      class="psc-interpretation-body"
                    >{{ para }}</p>
                  </div>
                </div>
                <button type="button" class="psc-expand-btn" @click="pscExpanded = !pscExpanded">
                  <span>{{ pscExpanded ? 'Hide' : 'Show' }} all {{ section.fields.length }} item responses</span>
                  <span class="psc-expand-caret" :class="{ 'is-open': pscExpanded }">▾</span>
                </button>
                <div v-if="pscExpanded" class="psc-items">
                  <div
                    v-for="item in psc17ItemsOrdered(section)"
                    :key="item.key"
                    class="ov-row psc-item-row"
                    :class="item.scoreClass"
                  >
                    <div class="ov-row-label">
                      <span class="psc-item-num">{{ item.itemNumber || '?' }}</span>
                      {{ item.label }}
                    </div>
                    <div class="ov-row-value">
                      <span class="psc-item-value">{{ item.scoreLabel }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="ov-card-body">
                <div v-for="field in section.fields" :key="field.key" class="ov-row">
                  <div class="ov-row-label">{{ field.label }}</div>
                  <div class="ov-row-value" style="white-space: pre-wrap;">
                    <button
                      v-if="isInsuranceCardField(field) && !clinicalEditing"
                      type="button"
                      class="cc-btn-soft"
                      style="width: auto;"
                      @click="viewInsuranceCard(clientId, insuranceSlotFromFieldKey(field.key))"
                    >
                      View card
                    </button>
                    <textarea
                      v-else-if="clinicalEditing && canEditClinicalField(field)"
                      v-model="clinicalEditForm[field.key]"
                      class="inline-input"
                      rows="3"
                      style="width: 100%;"
                      :placeholder="field.label"
                    />
                    <span v-else>{{ field.value || '—' }}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <aside class="cc-clinical-col cc-clinical-col--right">
          <section class="cc-card cc-clinical-card">
            <h4 class="cc-clinical-card__title">{{ isLearningClient ? 'Learning tools' : 'Clinical tools' }}</h4>
            <div class="cc-clinical-tools">
              <button
                v-if="canViewMedicalRecord"
                type="button"
                class="cc-clinical-tool"
                @click="$emit('navigate', 'medical-record')"
              >
                <span>Start / view clinical note</span>
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" class="cc-clinical-tool" @click="$emit('navigate', 'assessments')">
                <span>Outcome measures</span>
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" class="cc-clinical-tool" @click="$emit('navigate', 'phi')">
                <span>Clinical forms &amp; documents</span>
                <span aria-hidden="true">›</span>
              </button>
              <button
                v-if="traumaSection"
                type="button"
                class="cc-clinical-tool"
                @click="scrollToTrauma"
              >
                <span>Safety / trauma history</span>
                <span aria-hidden="true">›</span>
              </button>
              <button
                v-if="goalsSection"
                type="button"
                class="cc-clinical-tool"
                @click="$emit('navigate', 'clinical')"
              >
                <span>Treatment goals</span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          <section class="cc-card cc-clinical-card">
            <h4 class="cc-clinical-card__title">Recent clinical activity</h4>
            <div v-if="encountersLoading" class="muted small">Loading sessions…</div>
            <div v-else-if="!recentEncounters.length" class="muted small">No imported sessions yet.</div>
            <div v-else class="cc-clinical-activity">
              <button
                v-for="row in recentEncounters"
                :key="row.id"
                type="button"
                class="cc-clinical-activity__item"
                @click="$emit('navigate', 'medical-record')"
              >
                <strong>{{ formatDate(row.service_date) }}</strong>
                <span>{{ row.service_code || 'Session' }} · {{ noteStatusLabel(row) }}</span>
              </button>
            </div>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, toRef, watch } from 'vue';
import { useClientClinicalResponses } from '../../../composables/useClientClinicalResponses.js';
import { useClientEncounters } from '../../../composables/useClientEncounters.js';
import api from '../../../services/api.js';

const props = defineProps({
  client: { type: Object, required: true },
  billingDiagnoses: { type: Array, default: () => [] },
  billingDiagnosesLoading: { type: Boolean, default: false },
  billingDiagnosesError: { type: String, default: '' },
  chartDiagnoses: { type: Array, default: () => [] },
  isSuperAdmin: { type: Boolean, default: false },
  isClinicalLikeClientType: { type: Boolean, default: true },
  isBackofficeRole: { type: Boolean, default: false },
  hasAgencyAccess: { type: Boolean, default: true },
  canViewMedicalRecord: { type: Boolean, default: false }
});

defineEmits(['navigate']);

const isLearningClient = computed(
  () => String(props.client?.client_type || '').toLowerCase() === 'learning'
);

const localChartDiagnoses = ref([]);
const chartDiagnoses = computed(() =>
  (props.chartDiagnoses?.length ? props.chartDiagnoses : localChartDiagnoses.value) || []
);

const displayConcerns = computed(() => {
  const rows = (chartDiagnoses.value || []).filter((d) => d && (d.is_active == null || Number(d.is_active) === 1));
  if (!isLearningClient.value) return rows;
  return rows.filter((d) => {
    const kind = String(d.concern_kind || d.concernKind || '').toLowerCase();
    if (kind === 'learning_concern') return true;
    if (kind === 'clinical') return false;
    // Legacy rows without concern_kind: treat LC-* / free-text as concerns
    const code = String(d.icd10_code || d.code || '').toUpperCase();
    return code.startsWith('LC-') || !!String(d.description || '').trim();
  });
});

const concernDraft = ref({ description: '', isPrimary: false });
const concernSaving = ref(false);
const concernError = ref('');

function showConcernCode(dx) {
  const code = String(dx?.icd10_code || dx?.code || '').trim().toUpperCase();
  if (!code) return false;
  if (code.startsWith('LC-')) return false;
  return true;
}

async function loadChartDiagnoses() {
  const cid = Number(props.client?.id || 0);
  const aid = Number(props.client?.agency_id || 0);
  if (!cid || !aid) {
    localChartDiagnoses.value = [];
    return;
  }
  try {
    const res = await api.get(`/medical-billing/clients/${cid}/chart`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    localChartDiagnoses.value = Array.isArray(res?.data?.diagnoses) ? res.data.diagnoses : [];
  } catch {
    localChartDiagnoses.value = [];
  }
}

async function saveLearningConcern() {
  const cid = Number(props.client?.id || 0);
  const aid = Number(props.client?.agency_id || 0);
  const description = String(concernDraft.value.description || '').trim();
  if (!cid || !aid || !description) return;
  concernSaving.value = true;
  concernError.value = '';
  try {
    await api.post('/medical-billing/diagnoses', {
      agencyId: aid,
      clientId: cid,
      description,
      concernKind: 'learning_concern',
      isPrimary: !!concernDraft.value.isPrimary
    }, { skipGlobalLoading: true });
    concernDraft.value = { description: '', isPrimary: false };
    await loadChartDiagnoses();
  } catch (e) {
    concernError.value = e?.response?.data?.error?.message || 'Could not save area of concern.';
  } finally {
    concernSaving.value = false;
  }
}

onMounted(loadChartDiagnoses);
watch(() => [props.client?.id, props.client?.agency_id, isLearningClient.value], loadChartDiagnoses);

const clientRef = toRef(props, 'client');
const clientId = computed(() => Number(props.client?.id || 0) || null);
const agencyId = computed(() => Number(props.client?.agency_id || 0) || null);

const clinical = useClientClinicalResponses(clientRef, {
  isClinicalLikeClientType: computed(() => props.isClinicalLikeClientType),
  isBackofficeRole: computed(() => props.isBackofficeRole),
  hasAgencyAccess: computed(() => props.hasAgencyAccess)
});

const {
  clinicalSections,
  clinicalCapturedAt,
  clinicalLoading,
  clinicalError,
  clinicalDebug,
  clinicalDebugLoading,
  clinicalTemplateMode,
  clinicalEditing,
  clinicalEditForm,
  clinicalSaving,
  clinicalEncryptionKeyMissing,
  pscExpanded,
  clinicalTotalFieldCount,
  canEditClinicalResponses,
  canEditClinicalField,
  startClinicalEdit,
  cancelClinicalEdit,
  saveClinicalResponses,
  loadClinicalDebug,
  isPscSection,
  clinicalSectionCardClass,
  psc17ItemsOrdered,
  psc17Summary,
  psc17InterpretationParagraphs,
  goalsSection,
  traumaSection,
  detailSections,
  keyInfoItems,
  goalsPreview,
  clinicalSummaryText,
  riskLevelLabel,
  viewInsuranceCard,
  insuranceSlotFromFieldKey,
  isInsuranceCardField
} = clinical;

const traumaSectionHasValues = computed(() => {
  const fields = traumaSection.value?.fields || [];
  return fields.some((f) => String(f?.value || '').trim() && String(f.value).trim() !== '—');
});

const { sortedEncounters, loading: encountersLoading } = useClientEncounters(agencyId, clientId, {
  medicalOnly: true,
  enabled: computed(() => props.canViewMedicalRecord && props.isClinicalLikeClientType)
});

const recentEncounters = computed(() => sortedEncounters.value.slice(0, 5));

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleDateString();
};

const formatBillingDate = formatDate;

const noteStatusLabel = (row) => {
  const s = String(row?.note_status || 'none');
  if (s === 'signed') return 'Signed';
  if (s === 'draft') return 'Draft';
  return 'No note';
};

const scrollToTrauma = () => {
  const el = document.querySelector('.cc-clinical-section.ov-card--clinical-trauma');
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
</script>

<style scoped>
@import '../../../styles/client-clinical-tab.css';
</style>
