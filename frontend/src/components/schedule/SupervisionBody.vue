<template>
  <div class="supb" data-testid="supervision-body">
    <div v-if="showSessionTypePicker" class="supb-row">
      <label class="supb-label">Session type</label>
      <select
        class="supb-select"
        :value="sessionType"
        :disabled="disabled"
        @change="emit('update:sessionType', String($event.target.value || 'individual'))"
      >
        <option value="individual">Individual</option>
        <option value="triadic">Triadic</option>
        <option v-if="canBookGroup" value="group">Group</option>
      </select>
      <p v-if="!canBookGroup" class="supb-hint muted">Group supervision requires group supervision eligibility.</p>
    </div>
    <div v-else-if="sessionTypeLabel" class="supb-row">
      <label class="supb-label">Session type</label>
      <div class="supb-value">{{ sessionTypeLabel }}</div>
    </div>

    <div v-if="showInviteOptions" class="supb-row">
      <label class="supb-label">Named invites</label>
      <p class="supb-hint muted">Use the supervisee picker above for special invites. Leave open-audience boxes checked to also allow broader join access.</p>

      <label class="supb-label" style="margin-top: 8px;">Open audience</label>
      <div class="supb-scope-options">
        <label class="supb-check">
          <input
            type="checkbox"
            :checked="inviteAudienceAllSupervised"
            :disabled="disabled"
            @change="emit('update:inviteAudienceAllSupervised', !!$event.target.checked)"
          />
          <span>Everyone being supervised in this agency</span>
        </label>
        <label class="supb-check">
          <input
            type="checkbox"
            :checked="inviteAudienceGroupSupport"
            :disabled="disabled"
            @change="emit('update:inviteAudienceGroupSupport', !!$event.target.checked)"
          />
          <span>Everyone who needs group supervision hours</span>
        </label>
      </div>
      <p v-if="inviteAudienceAllSupervised && inviteAudienceGroupSupport" class="supb-hint muted">
        Both audiences are included — any prelicensed supervisee or anyone with a group-hour requirement may join.
      </p>
      <p v-else-if="inviteAudienceAllSupervised" class="supb-hint muted">
        Any prelicensed supervisee in this agency may join, in addition to anyone you name above.
      </p>
      <p v-else-if="inviteAudienceGroupSupport" class="supb-hint muted">
        Supervisees with group-hour requirements may join, in addition to anyone you name above.
      </p>
      <p v-else class="supb-hint muted">Only the supervisees you select in the picker are invited.</p>
    </div>

    <div v-if="showPresenterPicker" class="supb-row">
      <label class="supb-label">Presenter(s) <span class="supb-optional">optional</span></label>
      <select
        class="supb-select"
        multiple
        size="3"
        :value="presenterIds"
        :disabled="disabled"
        @change="onPresenterChange"
      >
        <option v-for="opt in presenterOptions" :key="`supb-presenter-${opt.id}`" :value="opt.id">
          {{ opt.label }}
        </option>
      </select>
      <p class="supb-hint muted">Schedule up to 2 presenters. Leave empty if no one is presenting this session.</p>
    </div>

    <div class="supb-row">
      <label class="supb-label">Virtual</label>
      <label class="supb-check">
        <input
          type="checkbox"
          :checked="isVirtual"
          :disabled="disabled"
          @change="emit('update:isVirtual', !!$event.target.checked)"
        />
        <span>Virtual supervision</span>
      </label>
    </div>

    <p class="supb-hint muted">
      After booking, use the <strong>Note</strong> tab for short notes, transcript, and summary,
      and the <strong>Supervisee</strong> tab for individual / group hour progress.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  isVirtual: { type: Boolean, default: true },
  inviteAudienceAllSupervised: { type: Boolean, default: false },
  inviteAudienceGroupSupport: { type: Boolean, default: false },
  sessionType: { type: String, default: 'individual' },
  canBookGroup: { type: Boolean, default: false },
  showSessionTypePicker: { type: Boolean, default: false },
  presenterIds: { type: Array, default: () => [] },
  presenterOptions: { type: Array, default: () => [] },
  sessionTypeLabel: { type: String, default: '' },
  showInviteOptions: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:isVirtual',
  'update:inviteAudienceAllSupervised',
  'update:inviteAudienceGroupSupport',
  'update:sessionType',
  'update:presenterIds'
]);

const showPresenterPicker = computed(() => props.showInviteOptions && (props.presenterOptions || []).length > 0);

function onPresenterChange(event) {
  const selected = Array.from(event?.target?.selectedOptions || [])
    .map((opt) => Number(opt.value || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 2);
  emit('update:presenterIds', selected);
}
</script>

<style scoped>
.supb { display: flex; flex-direction: column; gap: 12px; }
.supb-row { display: flex; flex-direction: column; gap: 6px; }
.supb-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.supb-value { font-size: 0.9rem; font-weight: 600; color: #0f172a; }
.supb-optional { font-weight: 500; text-transform: none; letter-spacing: 0; color: #94a3b8; }
.supb-check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: #0f172a; }
.supb-scope-options { display: flex; flex-direction: column; gap: 6px; }
.supb-select {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.supb-hint { margin: 0; font-size: 0.82rem; line-height: 1.4; }
.muted { color: #64748b; }
</style>
