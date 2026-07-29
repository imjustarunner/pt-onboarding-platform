<template>
  <div class="cc-enc-tab">
    <div class="cc-enc-toolbar">
      <div class="cc-enc-toolbar__meta">
        <h3>Medical Record</h3>
        <p>
          Imported billing sessions function as clinical encounters. Select a session to review details
          or open its clinical note in Note Aid.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="error" class="cc-enc-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading sessions…</p>
    <p v-else-if="!sortedEncounters.length" class="cc-enc-empty">
      No billing sessions on file for this client yet.
    </p>

    <div v-else class="cc-enc-master-detail">
      <aside class="cc-enc-list-panel">
        <div class="cc-enc-filters">
          <button
            v-for="f in filterOptions"
            :key="f.id"
            type="button"
            class="cc-enc-filter-pill"
            :class="{ 'cc-enc-filter-pill--active': listFilter === f.id }"
            @click="listFilter = f.id"
          >
            {{ f.label }}
          </button>
        </div>
        <input
          v-model="searchQuery"
          type="search"
          class="cc-enc-search"
          placeholder="Search code, provider, diagnosis…"
          aria-label="Search sessions"
        />
        <div class="cc-enc-list">
          <button
            v-for="row in filteredEncounters"
            :key="row.id"
            type="button"
            class="cc-enc-list-item"
            :class="{ 'cc-enc-list-item--active': Number(row.id) === selectedId }"
            @click="selectEncounter(row.id)"
          >
            <div class="cc-enc-list-item__row">
              <span class="cc-enc-list-item__date">{{ formatEncounterDate(row.service_date) }}</span>
              <span class="cc-enc-note-pill" :class="noteStatusClass(row)">
                {{ noteStatusLabel(row) }}
              </span>
            </div>
            <div class="cc-enc-list-item__meta">
              <span class="cc-enc-mono">{{ row.service_code || '—' }}</span>
              · {{ formatEncounterProvider(row) }}
            </div>
          </button>
          <p v-if="!filteredEncounters.length" class="muted tiny" style="padding: 8px 4px;">
            No sessions match this filter.
          </p>
        </div>
      </aside>

      <section v-if="selectedRow" class="cc-enc-detail-panel">
        <div class="cc-enc-detail-head">
          <div>
            <h4>
              {{ formatEncounterDate(selectedRow.service_date) }}
              <span v-if="selectedRow.service_code" class="cc-enc-mono"> · {{ selectedRow.service_code }}</span>
            </h4>
            <p class="muted tiny" style="margin: 0;">
              {{ formatEncounterProvider(selectedRow) }}
              · {{ formatPlaceOfService(selectedRow.place_of_service) }}
            </p>
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="openingId === selectedRow.id"
            @click="openNote(selectedRow)"
          >
            {{ openingId === selectedRow.id ? 'Opening…' : noteActionLabel(selectedRow) }}
          </button>
        </div>

        <div class="cc-enc-detail-subtabs" role="tablist">
          <button
            v-for="t in detailTabs"
            :key="t.id"
            type="button"
            class="cc-enc-detail-subtab"
            :class="{ 'cc-enc-detail-subtab--active': detailTab === t.id }"
            @click="detailTab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <div class="cc-enc-detail-body">
          <template v-if="detailTab === 'summary'">
            <div class="cc-enc-field-grid">
              <div>
                <div class="cc-enc-field__label">Note status</div>
                <div class="cc-enc-field__value">
                  <span class="cc-enc-note-pill" :class="noteStatusClass(selectedRow)">
                    {{ noteStatusLabel(selectedRow) }}
                  </span>
                </div>
              </div>
              <div>
                <div class="cc-enc-field__label">Diagnosis</div>
                <div class="cc-enc-field__value">{{ selectedRow.diagnosis_text || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Setting</div>
                <div class="cc-enc-field__value">{{ formatPlaceOfService(selectedRow.place_of_service) }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Provider</div>
                <div class="cc-enc-field__value">{{ formatEncounterProvider(selectedRow) }}</div>
              </div>
            </div>
            <p class="muted tiny" style="margin: 0;">
              Clinical notes are authored in Note Aid and linked to this imported billing line.
            </p>
          </template>

          <template v-else-if="detailTab === 'note'">
            <div class="cc-enc-field-grid">
              <div>
                <div class="cc-enc-field__label">Clinical session</div>
                <div class="cc-enc-field__value">
                  {{ Number(selectedRow.clinical_session_id || 0) > 0 ? `#${selectedRow.clinical_session_id}` : 'Not started' }}
                </div>
              </div>
              <div>
                <div class="cc-enc-field__label">Note ID</div>
                <div class="cc-enc-field__value">
                  {{ Number(selectedRow.clinical_note_id || 0) > 0 ? `#${selectedRow.clinical_note_id}` : '—' }}
                </div>
              </div>
            </div>
            <p class="muted tiny" style="margin: 0;">
              {{
                selectedRow.note_status === 'signed'
                  ? 'This note is signed. Open it in Note Aid to review.'
                  : selectedRow.note_status === 'draft'
                    ? 'A draft note exists. Continue editing in Note Aid.'
                    : 'No note has been started for this session yet.'
              }}
            </p>
            <div>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="openingId === selectedRow.id"
                @click="openNote(selectedRow)"
              >
                {{ openingId === selectedRow.id ? 'Opening…' : noteActionLabel(selectedRow) }}
              </button>
            </div>
          </template>

          <template v-else>
            <div class="cc-enc-field-grid">
              <div>
                <div class="cc-enc-field__label">Encounter ID</div>
                <div class="cc-enc-field__value cc-enc-mono">{{ selectedRow.id }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Service date</div>
                <div class="cc-enc-field__value">{{ formatEncounterDate(selectedRow.service_date) }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">CPT code</div>
                <div class="cc-enc-field__value cc-enc-mono">{{ selectedRow.service_code || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Place of service</div>
                <div class="cc-enc-field__value">{{ selectedRow.place_of_service || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Diagnosis</div>
                <div class="cc-enc-field__value">{{ selectedRow.diagnosis_text || '—' }}</div>
              </div>
              <div>
                <div class="cc-enc-field__label">Provider</div>
                <div class="cc-enc-field__value">{{ formatEncounterProvider(selectedRow) }}</div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section v-else class="cc-enc-detail-panel">
        <p class="muted">Select a session from the list to view details.</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useClientEncounters } from '../../composables/useClientEncounters.js';
import { useClientEncounterNote } from '../../composables/useClientEncounterNote.js';
import {
  formatEncounterDate,
  formatEncounterProvider,
  formatPlaceOfService,
  matchesEncounterSearch,
  noteActionLabel,
  noteStatusClass,
  noteStatusLabel
} from '../../utils/clientEncounterUtils.js';
import '../../styles/client-encounters-tab.css';

const props = defineProps({
  agencyId: { type: Number, default: null },
  clientId: { type: Number, default: null },
  initialEncounterId: { type: Number, default: null }
});

const emit = defineEmits(['encounter-change']);

const agencyRef = computed(() => props.agencyId);
const clientRef = computed(() => props.clientId);

const {
  sortedEncounters,
  loading,
  error,
  load
} = useClientEncounters(agencyRef, clientRef, { medicalOnly: true });

const { openingId, openClinicalNote } = useClientEncounterNote();

const listFilter = ref('all');
const searchQuery = ref('');
const detailTab = ref('summary');
const selectedId = ref(null);

const filterOptions = [
  { id: 'all', label: 'All' },
  { id: 'notes_needed', label: 'Notes needed' },
  { id: 'signed', label: 'Signed' }
];

const detailTabs = [
  { id: 'summary', label: 'Summary' },
  { id: 'note', label: 'Note' },
  { id: 'details', label: 'Details' }
];

const filteredEncounters = computed(() => {
  let rows = sortedEncounters.value;
  if (listFilter.value === 'notes_needed') {
    rows = rows.filter((row) => String(row?.note_status || 'none') !== 'signed');
  } else if (listFilter.value === 'signed') {
    rows = rows.filter((row) => String(row?.note_status || 'none') === 'signed');
  }
  const q = searchQuery.value;
  if (q) rows = rows.filter((row) => matchesEncounterSearch(row, q));
  return rows;
});

const selectedRow = computed(() =>
  sortedEncounters.value.find((row) => Number(row.id) === Number(selectedId.value)) || null
);

function selectEncounter(id) {
  const n = Number(id || 0);
  if (!n) return;
  selectedId.value = n;
  emit('encounter-change', n);
}

function openNote(row) {
  openClinicalNote({
    agencyId: props.agencyId,
    clientId: props.clientId,
    row
  });
}

function syncSelectionFromProps() {
  const initial = Number(props.initialEncounterId || 0);
  if (initial > 0 && sortedEncounters.value.some((row) => Number(row.id) === initial)) {
    selectedId.value = initial;
    return;
  }
  if (!selectedId.value && sortedEncounters.value.length) {
    selectedId.value = Number(sortedEncounters.value[0].id);
    emit('encounter-change', selectedId.value);
  }
}

watch(
  () => [props.initialEncounterId, sortedEncounters.value.length],
  () => syncSelectionFromProps(),
  { immediate: true }
);

watch(
  filteredEncounters,
  (rows) => {
    if (!rows.length) return;
    const current = Number(selectedId.value || 0);
    if (!rows.some((row) => Number(row.id) === current)) {
      selectEncounter(rows[0].id);
    }
  }
);
</script>

<style scoped>
.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }
</style>
