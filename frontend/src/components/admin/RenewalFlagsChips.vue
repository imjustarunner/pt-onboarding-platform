<template>
  <div v-if="flags?.any" class="renewal-flags" :class="{ 'renewal-flags--compact': compact }">
    <span
      v-if="flags.expiredRoi"
      class="renewal-flag renewal-flag--expired"
      title="ROI expired or missing — push Smart School ROI"
    >Expired ROI</span>
    <span
      v-if="flags.schoolTransfer"
      class="renewal-flag renewal-flag--transfer"
      title="School changed year-over-year — needs new ROI and Disclosure"
    >School transfer</span>
    <span
      v-if="flags.staffRoiGap"
      class="renewal-flag renewal-flag--staff"
      title="School staff not covered by current ROI grants — push updated Smart School ROI"
    >Staff ROI gap</span>
    <span
      v-if="flags.paperPacketRoiSetup"
      class="renewal-flag renewal-flag--setup"
      title="Paper packet uploaded — set each staff member’s ROI access to match the signed form"
    >Set staff ROI</span>
    <span
      v-if="flags.paperPacketVisionReview"
      class="renewal-flag renewal-flag--vision"
      title="Packet Vision could not auto-confirm version/signatures/DENY — review School ROI"
    >Packet review</span>
    <span
      v-if="flags.reactivatedNeedsPacket"
      class="renewal-flag renewal-flag--packet"
      title="Returned from archive — needs full enrollment packet renewal"
    >Needs full packet</span>
  </div>
  <span v-else-if="showEmpty" class="renewal-flags-empty">—</span>
</template>

<script setup>
defineProps({
  flags: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  showEmpty: { type: Boolean, default: true }
});
</script>

<style scoped>
.renewal-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 220px;
}
.renewal-flags--compact {
  max-width: 100%;
}
.renewal-flag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  padding: 3px 7px;
  border-radius: 6px;
  white-space: nowrap;
}
.renewal-flag--expired {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.renewal-flag--transfer {
  background: #ffedd5;
  color: #9a3412;
  border: 1px solid #fed7aa;
}
.renewal-flag--staff {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.renewal-flag--setup {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}
.renewal-flag--vision {
  background: #fce7f3;
  color: #9d174d;
  border: 1px solid #fbcfe8;
}
.renewal-flag--packet {
  background: #e0e7ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
}
.renewal-flags-empty {
  color: #94a3b8;
  font-size: 13px;
}
</style>
