<template>
  <section class="challenge-draft-report">
    <div class="cdr-head">
      <h2>Captain draft report</h2>
      <p v-if="previousSeason" class="hint cdr-prev">
        Previous season stats from <strong>{{ previousSeason.className }}</strong>. Manager notes are saved to the club and carry into future seasons until you change them.
      </p>
      <p v-else class="hint cdr-prev">Manager notes are saved to the club and carry into future seasons.</p>
    </div>

    <div v-if="loading" class="loading-inline">Loading draft report…</div>
    <template v-else>
      <div class="cdr-toolbar">
        <label class="cdr-search-label" for="cdr-filter">Find member</label>
        <input
          id="cdr-filter"
          v-model="filterQ"
          type="search"
          class="cdr-search"
          placeholder="Name or email"
          autocomplete="off"
        />
        <span class="cdr-count">{{ visibleParticipants.length }} / {{ participants.length }}</span>
      </div>

      <div class="cdr-list">
        <article
          v-for="p in displayedParticipants"
          :key="`draft-participant-${p.providerUserId}`"
          class="report-card"
          :class="{ 'report-card--club-note': p.draftNoteScope === 'club' && canEdit }"
        >
          <button
            type="button"
            class="report-card-toggle"
            :aria-expanded="expandedIds.has(p.providerUserId) ? 'true' : 'false'"
            @click="toggleCard(p.providerUserId)"
          >
            <span class="report-card-chevron" aria-hidden="true">{{ expandedIds.has(p.providerUserId) ? '▼' : '▶' }}</span>
            <span class="report-card-title">
              <strong>{{ p.firstName }} {{ p.lastName }}</strong>
              <span class="hint report-card-email">{{ p.email }}</span>
            </span>
            <span v-if="p.draftNoteScope === 'club'" class="cdr-scope-pill">Club-saved</span>
          </button>

          <div v-show="expandedIds.has(p.providerUserId)" class="report-card-body">
            <div class="previous-attrs">
              <template v-if="p.previousSeason">
                <span>{{ p.previousSeason.totalPoints }} pts</span>
                <span>{{ Number(p.previousSeason.totalMiles || 0).toFixed(1) }} mi</span>
                <span>{{ p.previousSeason.workoutCount }} workouts</span>
                <span v-if="p.previousSeason.teamName">Team: {{ p.previousSeason.teamName }}</span>
                <span v-if="p.previousSeason.wasEliminated" class="warn-pill">Previously eliminated</span>
              </template>
              <span v-else class="hint">No previous season stats</span>
            </div>
            <div class="note-row">
              <textarea
                v-model="drafts[p.providerUserId]"
                :readonly="!canEdit"
                rows="3"
                placeholder="Manager draft note (captains can view). Saved to this season and the club."
              />
              <button
                v-if="canEdit"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="savingByUser[p.providerUserId]"
                @click="saveNote(p.providerUserId)"
              >
                {{ savingByUser[p.providerUserId] ? 'Saving…' : 'Save note' }}
              </button>
            </div>
          </div>
        </article>
        <div v-if="!participants.length" class="empty-hint">No participating members found.</div>
      </div>

      <div v-if="showExpandToggle" class="cdr-expand-row">
        <button type="button" class="btn btn-secondary btn-sm" @click="setListExpanded(!listExpanded)">
          {{ listExpanded ? `Show fewer (first ${COLLAPSE_AT})` : `Show all ${visibleParticipants.length} people` }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  canEdit: { type: Boolean, default: false }
});

const COLLAPSE_AT = 10;
const LS_PREFIX = 'challenge_draft_report_expanded_v2:';

const loading = ref(false);
const participants = ref([]);
const previousSeason = ref(null);
const drafts = ref({});
const savingByUser = ref({});
const filterQ = ref('');
const listExpanded = ref(false);
const expandedIds = ref(new Set());

const storageKeyList = computed(() => `${LS_PREFIX}list:${props.challengeId}`);
const storageKeyOpen = computed(() => `${LS_PREFIX}open:${props.challengeId}`);

const loadExpandedFromStorage = () => {
  try {
    const raw = localStorage.getItem(storageKeyList.value);
    if (raw === '1') listExpanded.value = true;
    else if (raw === '0') listExpanded.value = false;
    const openRaw = localStorage.getItem(storageKeyOpen.value);
    if (openRaw) {
      const ids = JSON.parse(openRaw);
      if (Array.isArray(ids)) expandedIds.value = new Set(ids.map(Number).filter((n) => n > 0));
    }
  } catch {
    /* ignore */
  }
};

const persistListExpanded = () => {
  try {
    localStorage.setItem(storageKeyList.value, listExpanded.value ? '1' : '0');
  } catch {
    /* ignore */
  }
};

const persistOpenCards = () => {
  try {
    localStorage.setItem(storageKeyOpen.value, JSON.stringify([...expandedIds.value]));
  } catch {
    /* ignore */
  }
};

const setListExpanded = (v) => {
  listExpanded.value = v;
  persistListExpanded();
};

const toggleCard = (id) => {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
  persistOpenCards();
};

const visibleParticipants = computed(() => {
  const q = String(filterQ.value || '').trim().toLowerCase();
  const list = participants.value || [];
  if (!q) return list;
  return list.filter((p) => {
    const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
    const email = String(p.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });
});

const displayedParticipants = computed(() => {
  const v = visibleParticipants.value;
  if (listExpanded.value || v.length <= COLLAPSE_AT) return v;
  return v.slice(0, COLLAPSE_AT);
});

const showExpandToggle = computed(() => visibleParticipants.value.length > COLLAPSE_AT);

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/draft-report`, { skipGlobalLoading: true });
    participants.value = Array.isArray(r.data?.participants) ? r.data.participants : [];
    previousSeason.value = r.data?.previousSeason || null;
    const map = {};
    for (const p of participants.value) {
      map[p.providerUserId] = p.draftNote || '';
    }
    drafts.value = map;
    loadExpandedFromStorage();
    if (expandedIds.value.size === 0 && participants.value.length && participants.value.length <= 15) {
      expandedIds.value = new Set(participants.value.map((p) => p.providerUserId));
      persistOpenCards();
    }
  } catch {
    participants.value = [];
    previousSeason.value = null;
    drafts.value = {};
  } finally {
    loading.value = false;
  }
};

const saveNote = async (providerUserId) => {
  if (!props.challengeId || !providerUserId || !props.canEdit) return;
  savingByUser.value = { ...savingByUser.value, [providerUserId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/draft-report/${providerUserId}/note`, {
      noteText: drafts.value[providerUserId] || ''
    });
    await load();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save draft note');
  } finally {
    savingByUser.value = { ...savingByUser.value, [providerUserId]: false };
  }
};

watch(
  () => props.challengeId,
  (id, prev) => {
    if (prev !== undefined && String(id) !== String(prev)) {
      filterQ.value = '';
      expandedIds.value = new Set();
      listExpanded.value = false;
    }
    load();
  },
  { immediate: true }
);
</script>

<style scoped>
.challenge-draft-report h2 {
  margin: 0 0 6px 0;
  font-size: 1.08rem;
}
.cdr-head {
  margin-bottom: 12px;
}
.cdr-prev {
  margin: 0;
  max-width: 48rem;
  line-height: 1.4;
}

.cdr-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.cdr-search-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
}
.cdr-search {
  flex: 1;
  min-width: 160px;
  max-width: 320px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.9rem;
}
.cdr-count {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  font-weight: 600;
}

.cdr-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.report-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fafafa;
  overflow: hidden;
}
.report-card--club-note {
  border-color: #c7d2fe;
  background: #f8fafc;
}

.report-card-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.report-card-toggle:hover {
  background: rgba(0, 0, 0, 0.03);
}
.report-card-chevron {
  flex-shrink: 0;
  width: 1.25rem;
  color: #64748b;
  font-size: 0.75rem;
}
.report-card-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.report-card-email {
  font-size: 0.82rem;
}
.cdr-scope-pill {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 999px;
  padding: 2px 8px;
}

.report-card-body {
  padding: 0 12px 12px 2.25rem;
  border-top: 1px solid #eee;
  background: #fff;
}

.previous-attrs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.86rem;
  color: var(--text-muted, #666);
  margin: 10px 0 8px;
}
.previous-attrs span + span::before {
  content: '· ';
  margin-right: 6px;
}
.note-row {
  display: grid;
  gap: 8px;
}
.note-row textarea {
  width: 100%;
  min-height: 72px;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.9rem;
}
.warn-pill {
  border: 1px solid #ffcdd2;
  background: #ffebee;
  color: #b71c1c;
  border-radius: 999px;
  padding: 1px 8px;
}
.empty-hint,
.loading-inline {
  color: var(--text-muted, #666);
  padding: 10px 0;
}

.cdr-expand-row {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
</style>
