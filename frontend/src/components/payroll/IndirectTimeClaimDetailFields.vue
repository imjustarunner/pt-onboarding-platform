<template>
  <div class="itcdf">
    <div class="itcdf-grid">
      <div class="field"><label>Entry method</label><div>{{ payload?.entryMethod || '—' }}</div></div>
      <div class="field"><label>Pay bucket</label><div>{{ bucketLabel }}</div></div>
      <div class="field"><label>Start</label><div>{{ payload?.startTime || '—' }}</div></div>
      <div class="field"><label>End</label><div>{{ payload?.endTime || '—' }}</div></div>
      <div class="field"><label>Total Minutes</label><div>{{ payload?.totalMinutes ?? '—' }}</div></div>
      <div v-if="payload?.allocationMode" class="field">
        <label>Allocation mode</label>
        <div>{{ allocationModeLabel }}</div>
      </div>
    </div>

    <div v-if="allocationRows.length" class="itcdf-activities card">
      <h4>Activities</h4>
      <div v-for="row in allocationRows" :key="row.key" class="itcdf-activity">
        <div class="itcdf-activity-head">
          <strong>{{ row.label }}</strong>
          <span class="itcdf-mins">{{ row.minutes }} min</span>
        </div>
        <div v-if="row.startTime || row.endTime" class="itcdf-times muted">
          {{ row.startTime || '—' }} – {{ row.endTime || '—' }}
        </div>
        <div v-if="row.note" class="itcdf-note">{{ row.note }}</div>
      </div>
    </div>

    <div v-if="payload?.noteAidUsedDuringSession" class="field">
      <label>Note Aid</label>
      <div>Used during this session</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { logTimeAllocationRows, logTimeBucketLabel } from '../../utils/logTimeClaimDetails';

const props = defineProps({
  payload: { type: Object, default: null },
  bucket: { type: String, default: '' }
});

const bucketLabel = computed(() => logTimeBucketLabel(props.bucket || props.payload?.bucket));
const allocationRows = computed(() => logTimeAllocationRows(props.payload));
const allocationModeLabel = computed(() => {
  const mode = String(props.payload?.allocationMode || '').trim().toLowerCase();
  if (mode === 'start_end') return 'Start / end times';
  if (mode === 'percent') return 'Percent split';
  if (mode === 'duration') return 'Duration';
  return props.payload?.allocationMode || '—';
});
</script>

<style scoped>
.itcdf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.itcdf-activities {
  margin-top: 4px;
  padding: 12px;
}
.itcdf-activities h4 {
  margin: 0 0 10px;
  font-size: 14px;
}
.itcdf-activity + .itcdf-activity {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}
.itcdf-activity-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.itcdf-mins {
  font-size: 13px;
  color: #555;
  white-space: nowrap;
}
.itcdf-times {
  font-size: 12px;
  margin-top: 2px;
}
.itcdf-note {
  margin-top: 6px;
  white-space: pre-wrap;
  font-size: 13px;
  color: #333;
}
.muted {
  color: #6b7280;
}
</style>
