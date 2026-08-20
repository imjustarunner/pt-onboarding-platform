<template>
  <div class="pay-hcbs-panel" :class="{ 'pay-hcbs-panel--compact': compact }">
    <div v-if="loading" class="pay-hcbs-muted">Loading classification…</div>
    <div v-else-if="!displayRows.length" class="pay-hcbs-muted">No classification available.</div>
    <div v-else class="pay-hcbs-rows">
      <div v-for="row in displayRows" :key="row.agencyId || 'default'" class="pay-hcbs-row">
        <div v-if="showAgencyName && row.agencyName" class="pay-hcbs-agency">{{ row.agencyName }}</div>

        <div class="pay-hcbs-axis">
          <span class="pay-hcbs-axis-label">Payroll Category</span>
          <span class="pay-hcbs-badge pay-hcbs-badge--pay" :title="row.payCategoryReason || ''">
            {{ row.payCategory ? `Cat ${row.payCategory}` : 'Unknown' }}
          </span>
          <span class="pay-hcbs-axis-detail">{{ row.payCategoryLabel || 'Could not derive from credential/role' }}</span>
        </div>

        <div class="pay-hcbs-axis">
          <span class="pay-hcbs-axis-label">HCBS Category</span>
          <span class="pay-hcbs-badge pay-hcbs-badge--hcbs" :title="row.hcbsCategoryReason || ''">
            {{ row.hcbsCategory ? `Cat ${row.hcbsCategory}` : 'Unknown' }}
          </span>
          <span class="pay-hcbs-axis-detail">{{ row.hcbsCategoryLabel || 'Could not derive from credential/role' }}</span>
        </div>

        <div v-if="row.licenseStatus" class="pay-hcbs-axis pay-hcbs-axis--license">
          <span class="pay-hcbs-axis-label">License Status</span>
          <span
            class="pay-hcbs-license"
            :class="`pay-hcbs-license--${row.licenseStatus}`"
          >
            {{ licenseStatusLabel(row) }}
          </span>
          <span v-if="row.licenseStatusReason" class="pay-hcbs-axis-detail">{{ row.licenseStatusReason }}</span>
        </div>

        <div v-if="flagFor(row)" class="pay-hcbs-flag-wrap">
          <span
            class="pay-hcbs-flag"
            :class="flagFor(row).kind === 'conflict' ? 'pay-hcbs-flag--conflict' : 'pay-hcbs-flag--unknown'"
            :title="flagFor(row).detail"
          >
            {{ flagFor(row).label }}
          </span>
          <p v-if="flagFor(row).detail && !compact" class="pay-hcbs-flag-detail">{{ flagFor(row).detail }}</p>
        </div>

        <p v-if="showNote && !compact" class="pay-hcbs-note">
          Derived from credential, title, role, and hourly-worker settings. H0032 Cat1/Cat2 billing mode is separate.
          Edit credential on Account or Prelicensed toggle under Agency Assignments.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  results: { type: Array, default: () => [] },
  agencyId: { type: [Number, String], default: null },
  loading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showAgencyName: { type: Boolean, default: true },
  showNote: { type: Boolean, default: true },
});

const displayRows = computed(() => {
  const list = Array.isArray(props.results) ? props.results : [];
  const aid = Number(props.agencyId || 0);
  if (aid > 0) {
    const match = list.filter((r) => Number(r.agencyId) === aid);
    return match.length ? match : list.slice(0, 1);
  }
  return list;
});

function flagFor(row) {
  if (!row) return null;
  if (row.conflictReason) {
    return { kind: 'conflict', label: 'Classification conflict', detail: row.conflictReason };
  }
  if (row.classifiedAs === 'unknown') {
    return {
      kind: 'unknown',
      label: 'Unclassified',
      detail: row.conflictReason || 'Could not auto-classify — verify Prelicensed toggle manually',
    };
  }
  return null;
}

function licenseStatusLabel(row) {
  if (!row) return 'Unknown';
  if (row.classifiedAs === 'intern' || /intern/i.test(String(row.licenseStatusReason || ''))) {
    return 'Intern (pre-licensure track)';
  }
  if (row.licenseStatus === 'licensed') return 'Licensed';
  if (row.licenseStatus === 'prelicensed') return 'Prelicensed';
  if (row.licenseStatus === 'unlicensed') return 'Unlicensed';
  return 'Unknown';
}
</script>

<style scoped>
.pay-hcbs-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pay-hcbs-panel--compact .pay-hcbs-row {
  gap: 6px;
}

.pay-hcbs-muted {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}

.pay-hcbs-rows {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pay-hcbs-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pay-hcbs-agency {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}

.pay-hcbs-axis {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.pay-hcbs-axis-label {
  min-width: 118px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}

.pay-hcbs-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}

.pay-hcbs-badge--hcbs {
  background: #ede9fe;
  color: #5b21b6;
  border-color: #c4b5fd;
}

.pay-hcbs-axis-detail {
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  line-height: 1.4;
}

.pay-hcbs-license {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.pay-hcbs-license--licensed {
  background: #dcfce7;
  color: #166534;
  border-color: #86efac;
}

.pay-hcbs-license--prelicensed {
  background: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
}

.pay-hcbs-license--unlicensed {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}

.pay-hcbs-flag-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pay-hcbs-flag {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: default;
}

.pay-hcbs-flag--conflict {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.pay-hcbs-flag--unknown {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.pay-hcbs-flag-detail {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #78350f;
}

.pay-hcbs-note {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary, #64748b);
}
</style>
