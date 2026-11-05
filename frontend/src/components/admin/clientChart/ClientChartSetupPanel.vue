<template>
  <section v-if="visible" class="chart-setup" aria-label="Chart setup">
    <header v-if="!showWorkspaceUpdater" class="chart-setup__head">
      <div>
        <h3>{{ heading }}</h3>
        <p>{{ intro }}</p>
      </div>
    </header>

    <p v-if="loadError" class="chart-setup__error">{{ loadError }}</p>
    <p v-else-if="status?.packetReadPending" class="chart-setup__note">
      Reading the uploaded paper packet for demographic fields. You can paste now, or refresh in a moment.
    </p>

    <ClientEhrBringUpToDatePanel
      v-if="showWorkspaceUpdater"
      embedded
      open
      :client-id="clientId"
      :agency-id="agencyId || 0"
      :client-label="client?.full_name || client?.fullName || ''"
      :record-status="workspaceStatus"
      @imported="onWorkspaceImported"
      @done="onWorkspaceImported"
    />

    <article v-if="showSection('demographics')" class="chart-setup__block">
      <h4>Demographics</h4>
      <p>Paste the demographic page, or use the packet read when one is available. Choose what to keep before it is saved.</p>
      <div class="chart-setup__actions">
        <button
          v-if="hasPacketCandidate"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="usePacketCandidate"
        >
          Use packet read
        </button>
      </div>
      <label class="chart-setup__label">
        Paste demographics
        <textarea v-model="demoPaste" rows="6" placeholder="Dependent's Name&#10;Date of Birth&#10;Address&#10;Phone&#10;Email" />
      </label>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="parsing || !demoPaste.trim()" @click="parsePaste">
        {{ parsing ? 'Reading…' : 'Review paste' }}
      </button>
      <DemographicMergeFields
        v-if="mergeRows.length"
        :rows="mergeRows"
        :saving="saving"
        :error="saveError"
        @toggle="setUseIncoming"
        @save="saveMerge"
      />
    </article>

    <article v-if="showUpdater && !showSection('demographics')" class="chart-setup__block">
      <h4>Update demographics</h4>
      <p>
        Paste the demographic page, or use the packet read.
        Each field keeps the file until you check it to use the pasted value.
        An empty field starts on whichever side has content.
      </p>
      <button v-if="!updaterOpen" type="button" class="btn btn-primary btn-sm" @click="openUpdater">
        Update demographics
      </button>
      <template v-else>
        <div class="chart-setup__actions">
          <button
            v-if="hasPacketCandidate"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="usePacketCandidate"
          >
            Use packet read
          </button>
        </div>
        <label class="chart-setup__label">
          Paste demographics
          <textarea v-model="demoPaste" rows="6" placeholder="Dependent's Name&#10;Date of Birth&#10;Address&#10;Phone&#10;Email" />
        </label>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="parsing || !demoPaste.trim()" @click="parsePaste">
          {{ parsing ? 'Reading…' : 'Review paste' }}
        </button>
        <DemographicMergeFields
          v-if="mergeRows.length"
          :rows="mergeRows"
          :saving="saving"
          :error="saveError"
          @toggle="setUseIncoming"
          @save="saveMerge"
        />
      </template>
    </article>

    <article v-if="showSection('intake')" class="chart-setup__block">
      <h4>Intake</h4>
      <p>Paste the intake note. It is reviewed before it is saved to the chart.</p>
      <label class="chart-setup__label">
        Paste intake
        <textarea v-model="intakePaste" rows="5" placeholder="Paste intake note…" />
      </label>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!intakePaste.trim()" @click="intakeOpen = true">
        Review and import intake
      </button>
    </article>

    <article v-if="showSection('plan')" class="chart-setup__block">
      <h4>Treatment plan</h4>
      <p>Paste the treatment plan. Goals and scales are reviewed before they are saved.</p>
      <label class="chart-setup__label">
        Paste treatment plan
        <textarea v-model="planPaste" rows="5" placeholder="Paste treatment plan…" />
      </label>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!planPaste.trim() || !agencyId" @click="planOpen = true">
        Review and import treatment plan
      </button>
    </article>

    <NoteAidIntakeImportReview
      v-if="clientId"
      :open="intakeOpen"
      :client-id="clientId"
      :initial-text="intakePaste"
      @close="intakeOpen = false"
      @finalized="onIntakeFinalized"
    />
    <NoteAidTreatmentPlanImportReview
      v-if="clientId && agencyId"
      :open="planOpen"
      :agency-id="agencyId"
      :client-id="clientId"
      :initial-text="planPaste"
      mode="import"
      @close="planOpen = false"
      @saved="onPlanSaved"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
import NoteAidIntakeImportReview from '../../clinical/NoteAidIntakeImportReview.vue';
import NoteAidTreatmentPlanImportReview from '../../clinical/NoteAidTreatmentPlanImportReview.vue';
import DemographicMergeFields from './DemographicMergeFields.vue';
import ClientEhrBringUpToDatePanel from './ClientEhrBringUpToDatePanel.vue';
import {
  buildDemographicMergeRows,
  currentDemographicsFromClient,
  incomingDemographicsFromParsed,
  mergedDemographicsPayload
} from '../../../utils/demographicFieldMerge.js';

const props = defineProps({
  client: { type: Object, default: null },
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  scope: { type: String, default: 'all' }
});

const emit = defineEmits(['updated']);

const status = ref(null);
const loadError = ref('');
const demoPaste = ref('');
const intakePaste = ref('');
const planPaste = ref('');
const mergeRows = ref([]);
const parsing = ref(false);
const saving = ref(false);
const saveError = ref('');
const updaterOpen = ref(false);
const intakeOpen = ref(false);
const planOpen = ref(false);
let loadSeq = 0;

const scope = computed(() => String(props.scope || 'all'));
const schoolClient = computed(() => {
  if (status.value?.schoolClient) return true;
  const type = String(props.client?.client_type || '').toLowerCase();
  const org = String(props.client?.organization_type || '').toLowerCase();
  return type === 'school' || org === 'school';
});
const showSection = (id) => {
  if (!status.value) return false;
  if (id === 'demographics' && schoolClient.value) return false;
  const missing = {
    demographics: !status.value.demographicsOnFile,
    intake: !status.value.intakeOnFile,
    plan: !status.value.planOnFile
  }[id];
  if (!missing) return false;
  if (scope.value === 'all' && !schoolClient.value) return false;
  return scope.value === 'all' || scope.value === id;
};
const showWorkspaceUpdater = computed(() =>
  scope.value === 'all'
  && !!status.value
  && !schoolClient.value
  && !status.value.setupComplete
);
const workspaceStatus = computed(() => ({
  demographics: status.value?.demographicsOnFile ? 'done' : 'missing',
  intake: status.value?.intakeOnFile ? 'done' : 'missing',
  plan: status.value?.planOnFile ? 'done' : 'missing'
}));
const showUpdater = computed(() =>
  !!status.value?.paperPacket
  && (scope.value === 'all' || scope.value === 'demographics')
);
const visible = computed(() => {
  if (loadError.value) return true;
  if (!status.value) return false;
  return showWorkspaceUpdater.value || showSection('demographics') || showSection('intake') || showSection('plan') || showUpdater.value;
});
const hasPacketCandidate = computed(() => {
  const candidate = status.value?.packetCandidate;
  return !!(candidate && typeof candidate === 'object' && (
    candidate.fullName || candidate.dateOfBirth || candidate.contactPhone || candidate.email
    || candidate.addressStreet || candidate.administrativeSex || candidate.grade
  ));
});
const heading = computed(() => {
  if (showWorkspaceUpdater.value) return 'Bring up to date';
  if (scope.value === 'demographics') return showUpdater.value && !showSection('demographics') ? 'Demographics' : 'Demographics needed';
  if (scope.value === 'intake') return 'Intake needed';
  if (scope.value === 'plan') return 'Treatment plan needed';
  return 'Finish chart setup';
});
const intro = computed(() => {
  if (showWorkspaceUpdater.value) {
    return 'Paste the records that are still missing. This is the same chart update used in the workspace, and it stays until demographics, intake, and the treatment plan are on the chart.';
  }
  if (scope.value === 'all' && schoolClient.value && (showSection('intake') || showSection('plan'))) {
    return 'Intake and the treatment plan still need to be on the chart. Demographics from school registration or a paper packet stay on the file and are not marked as a chart update.';
  }
  if (showUpdater.value && schoolClient.value && !showSection('intake') && !showSection('plan')) {
    return 'Compare the paper packet with the file. School registration answers stay as they are until you switch a field.';
  }
  return 'Save this section to the chart. The prompt leaves once chart setup is complete.';
});

async function onWorkspaceImported() {
  emit('updated');
  await loadStatus();
}

function quietConfig() {
  return { skipGlobalLoading: true };
}

async function loadStatus() {
  const id = Number(props.clientId || 0);
  if (!id) {
    status.value = null;
    return;
  }
  const seq = ++loadSeq;
  loadError.value = '';
  try {
    const res = await api.get(`/clients/${id}/chart-setup`, quietConfig());
    if (seq !== loadSeq) return;
    status.value = res.data || null;
  } catch (error) {
    if (seq !== loadSeq) return;
    status.value = null;
    loadError.value = error.response?.data?.error?.message || 'Chart setup could not be loaded.';
  }
}

function openUpdater() {
  updaterOpen.value = true;
  mergeRows.value = [];
  saveError.value = '';
}

function setUseIncoming(key, checked) {
  const row = mergeRows.value.find((item) => item.key === key);
  if (row) row.useIncoming = checked;
}

function applyIncoming(parsed) {
  mergeRows.value = buildDemographicMergeRows(
    currentDemographicsFromClient(props.client),
    incomingDemographicsFromParsed(parsed)
  );
  saveError.value = mergeRows.value.length ? '' : 'No demographic values were found to compare.';
}

function usePacketCandidate() {
  const candidate = status.value?.packetCandidate;
  if (!candidate) return;
  updaterOpen.value = true;
  applyIncoming(candidate);
}

async function parsePaste() {
  parsing.value = true;
  saveError.value = '';
  try {
    const res = await api.post(
      `/clients/${props.clientId}/demographics/parse`,
      { text: demoPaste.value },
      quietConfig()
    );
    applyIncoming(res?.data?.parsed || {});
  } catch (error) {
    saveError.value = error.response?.data?.error?.message || 'The paste could not be read.';
  } finally {
    parsing.value = false;
  }
}

async function saveMerge() {
  const payload = mergedDemographicsPayload(mergeRows.value);
  const hasContent = Object.values(payload).some((value) => String(value || '').trim());
  if (!hasContent) {
    saveError.value = 'Choose at least one field with a value.';
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    const res = await api.post(
      `/clients/${props.clientId}/demographics/import`,
      { demographics: payload },
      quietConfig()
    );
    mergeRows.value = [];
    demoPaste.value = '';
    updaterOpen.value = false;
    emit('updated', res?.data?.client || null);
    await loadStatus();
  } catch (error) {
    saveError.value = error.response?.data?.error?.message || 'Demographics could not be saved.';
  } finally {
    saving.value = false;
  }
}

async function onIntakeFinalized() {
  intakeOpen.value = false;
  intakePaste.value = '';
  emit('updated');
  await loadStatus();
}

async function onPlanSaved() {
  planOpen.value = false;
  planPaste.value = '';
  emit('updated');
  await loadStatus();
}

watch(() => props.clientId, () => {
  mergeRows.value = [];
  updaterOpen.value = false;
  loadStatus();
}, { immediate: true });
</script>

<style scoped>
.chart-setup {
  margin: 0 0 16px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--primary, #166534) 35%, #e5e7eb);
  border-left: 4px solid var(--primary, #166534);
  border-radius: 12px;
  background: #fff;
}
.chart-setup__head h3 { margin: 0 0 4px; font-size: 1.05rem; }
.chart-setup__head p,
.chart-setup__block p,
.chart-setup__note { margin: 0 0 10px; color: #475569; font-size: 0.92rem; }
.chart-setup__block { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
.chart-setup__block h4 { margin: 0 0 4px; }
.chart-setup__label { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; font-weight: 700; margin: 8px 0; }
.chart-setup__label textarea {
  font: inherit;
  font-weight: 400;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
}
.chart-setup__actions { display: flex; gap: 8px; margin-bottom: 8px; }
.chart-setup__error { color: #b91c1c; font-size: 0.88rem; }
.chart-setup__merge { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.chart-setup__merge-lead { margin: 0; color: #475569; font-size: 0.88rem; }
.chart-setup__row { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
.chart-setup__row-label { font-weight: 700; margin-bottom: 6px; }
.chart-setup__values { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.chart-setup__values span { display: block; color: #64748b; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
.chart-setup__values strong { font-weight: 650; }
.chart-setup__switch { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-weight: 650; }
.chart-setup__same { margin: 8px 0 0; color: #64748b; font-size: 0.85rem; }
</style>
