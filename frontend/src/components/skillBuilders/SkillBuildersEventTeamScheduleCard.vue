<template>
  <div class="sbets-card sbep-portal-card">
    <div class="sbets-head">
      <h2 class="sbets-title">Team schedules</h2>
      <p class="sbets-desc muted">
        View or edit availability: program session time plus additional blocks must total 6+ hrs/week.
      </p>
    </div>
    <div class="sbets-row">
      <label class="sbets-label" for="sbets-provider">Provider</label>
      <select id="sbets-provider" v-model.number="selectedId" class="input sbets-select" @change="load">
        <option :value="0">Select a provider…</option>
        <option v-for="p in providers" :key="p.id" :value="p.id">
          {{ p.firstName }} {{ p.lastName }}
        </option>
      </select>
    </div>
    <div v-if="loadError" class="error-box">{{ loadError }}</div>
    <div v-else-if="loading" class="muted">Loading schedule…</div>
    <template v-else-if="selectedId">
      <div class="sbets-preview">
        <SkillBuildersWorkSchedulePanel
          :agency-id="agencyId"
          :week-start="weekStart"
          :inline-data="previewBundle"
          :hide-upcoming-open="true"
          mode="coordinator"
        />
      </div>
      <details class="sbets-edit">
        <summary class="sbets-summary">Edit availability blocks</summary>
        <div v-if="editError" class="error-box">{{ editError }}</div>
        <div class="slots">
          <div v-for="(b, idx) in blocks" :key="idx" class="slot-row">
            <select class="select" v-model="b.dayOfWeek">
              <option v-for="d in dayNames" :key="d" :value="d">{{ d }}</option>
            </select>
            <select class="select" v-model="b.blockType">
              <option value="AFTER_SCHOOL">After school</option>
              <option value="WEEKEND">Weekend</option>
              <option value="CUSTOM">Custom</option>
            </select>
            <template v-if="b.blockType === 'CUSTOM'">
              <input class="input" v-model="b.startTime" placeholder="HH:MM" />
              <input class="input" v-model="b.endTime" placeholder="HH:MM" />
            </template>
            <input class="input" v-model="b.departFrom" placeholder="Departing from" />
            <input class="input" v-model="b.departTime" type="time" />
            <label class="chk">
              <input type="checkbox" v-model="b.isBooked" />
              <span class="muted">Booked</span>
            </label>
            <button type="button" class="btn btn-secondary btn-sm" @click="removeBlock(idx)" :disabled="saving">Remove</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="addBlock" :disabled="saving">Add block</button>
        </div>
        <p v-if="validationError" class="error-box">{{ validationError }}</p>
        <div class="sbets-save-row">
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving || !!validationError" @click="save">
            {{ saving ? 'Saving…' : 'Save availability' }}
          </button>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import SkillBuildersWorkSchedulePanel from '../availability/SkillBuildersWorkSchedulePanel.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  providers: { type: Array, default: () => [] }
});

const emit = defineEmits(['updated']);

const selectedId = ref(0);
const loading = ref(false);
const loadError = ref('');
const saving = ref(false);
const editError = ref('');
const previewBundle = ref(null);
const weekStart = ref('');
/** Minutes/week from all Skill Builders programs the provider is rostered on (server-computed). */
const programCreditMinutes = ref(0);

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const blocks = ref([
  {
    dayOfWeek: 'Monday',
    blockType: 'AFTER_SCHOOL',
    startTime: '',
    endTime: '',
    departFrom: '',
    departTime: '',
    isBooked: false
  }
]);

const minutesForSkillBlock = (b) => {
  const t = String(b?.blockType || '').toUpperCase();
  if (t === 'AFTER_SCHOOL') return 90;
  if (t === 'WEEKEND') return 180;
  const st = String(b?.startTime || '').trim();
  const et = String(b?.endTime || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(st) || !/^\d{1,2}:\d{2}$/.test(et)) return 0;
  const [sh, sm] = st.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = et.split(':').map((x) => parseInt(x, 10));
  const a = sh * 60 + sm;
  const c = eh * 60 + em;
  return c > a ? c - a : 0;
};

const validationError = computed(() => {
  const blockMins = (blocks.value || []).reduce((sum, b) => sum + minutesForSkillBlock(b), 0);
  if (blockMins + programCreditMinutes.value < 360) {
    return 'Program time plus blocks must be at least 6 hours/week.';
  }
  if (blockMins > 0) {
    const missingDepartFrom = (blocks.value || []).some((b) => !String(b?.departFrom || '').trim());
    if (missingDepartFrom) return 'Every block needs “Departing from”.';
  }
  return '';
});

function addBlock() {
  blocks.value.push({
    dayOfWeek: 'Monday',
    blockType: 'AFTER_SCHOOL',
    startTime: '',
    endTime: '',
    departFrom: '',
    departTime: '',
    isBooked: false
  });
}

function removeBlock(idx) {
  blocks.value.splice(idx, 1);
}

function mapBlocksFromApi(skillBuilderBlocks) {
  const list = Array.isArray(skillBuilderBlocks) ? skillBuilderBlocks : [];
  if (!list.length) {
    return [
      {
        dayOfWeek: 'Monday',
        blockType: 'AFTER_SCHOOL',
        startTime: '',
        endTime: '',
        departFrom: '',
        departTime: '',
        isBooked: false
      }
    ];
  }
  return list.map((b) => ({
    dayOfWeek: b.dayOfWeek,
    blockType: b.blockType,
    startTime: b.startTime || '',
    endTime: b.endTime || '',
    departFrom: b.departFrom || '',
    departTime: b.departTime || '',
    isBooked: !!b.isBooked
  }));
}

async function load() {
  loadError.value = '';
  previewBundle.value = null;
  editError.value = '';
  if (!props.agencyId || !props.eventId || !selectedId.value) return;
  loading.value = true;
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/providers/${selectedId.value}/work-schedule`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const d = res.data || {};
    weekStart.value = d.weekStart || '';
    programCreditMinutes.value = Number(d.programCreditMinutesPerWeek || 0);
    previewBundle.value = {
      skillBuilderBlocks: d.skillBuilderBlocks || [],
      meetings: d.meetings || [],
      assignedEvents: d.assignedEvents || [],
      upcomingOpenEvents: d.upcomingOpenEvents || [],
      programCreditHoursPerWeek: Number(d.programCreditHoursPerWeek || 0),
      programCreditItems: Array.isArray(d.programCreditItems) ? d.programCreditItems : []
    };
    blocks.value = mapBlocksFromApi(d.skillBuilderBlocks);
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    previewBundle.value = null;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (validationError.value || !selectedId.value) return;
  saving.value = true;
  editError.value = '';
  try {
    await api.put(
      `/skill-builders/events/${props.eventId}/providers/${selectedId.value}/work-schedule`,
      {
        agencyId: props.agencyId,
        blocks: blocks.value,
        weekStart: weekStart.value || undefined
      },
      { skipGlobalLoading: true }
    );
    await load();
    emit('updated');
  } catch (e) {
    editError.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.agencyId, props.eventId],
  () => {
    selectedId.value = 0;
    previewBundle.value = null;
    programCreditMinutes.value = 0;
  }
);
</script>

<style scoped>
.sbets-card {
  padding: 18px;
}
.sbets-head {
  margin-bottom: 14px;
}
.sbets-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbets-desc {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
}
.sbets-row {
  margin-bottom: 12px;
}
.sbets-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.sbets-select {
  max-width: 360px;
  width: 100%;
}
.sbets-preview {
  margin-top: 8px;
}
.sbets-edit {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-alt, #f8fafc);
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
}
.sbets-summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--primary, #0f766e);
}
.slots {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.slot-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.select {
  min-width: 120px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}
.sbets-save-row {
  margin-top: 12px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error-box {
  color: #b91c1c;
  padding: 10px;
  background: #fef2f2;
  border-radius: 8px;
  margin-top: 8px;
  font-size: 0.88rem;
}
</style>
