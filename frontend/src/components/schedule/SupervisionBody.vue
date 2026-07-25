<template>
  <div class="supb" data-testid="supervision-body">
    <div v-if="canBookGroup" class="supb-row">
      <label class="supb-check supb-check--emphasis">
        <input
          type="checkbox"
          :checked="groupMode"
          :disabled="disabled"
          @change="emit('update:groupMode', !!$event.target.checked)"
        />
        <span>Group supervision</span>
      </label>
      <p class="supb-hint muted">
        Off = your assigned supervisees only (individual or triadic).
        On = agency-wide roster, practice groups, facilitator, and optional co-facilitator.
      </p>
    </div>

    <div v-if="sessionTypeLabel" class="supb-row">
      <label class="supb-label">Session type</label>
      <div class="supb-value">{{ sessionTypeLabel }}</div>
    </div>

    <template v-if="groupMode && canBookGroup">
      <div class="supb-row">
        <label class="supb-label">Facilitator</label>
        <select
          class="supb-select"
          :value="facilitatorUserId || 0"
          :disabled="disabled || !facilitatorOptions.length"
          @change="emit('update:facilitatorUserId', Number($event.target.value || 0))"
        >
          <option :value="0">Select facilitator…</option>
          <option v-for="opt in facilitatorOptions" :key="`fac-${opt.id}`" :value="opt.id">
            {{ opt.label }}
          </option>
        </select>
        <p class="supb-hint muted">Group supervisor who facilitates this session (must have group supervision privileges, or be admin/CPA/support).</p>
      </div>

      <div class="supb-row">
        <label class="supb-label">Co-facilitator <span class="supb-optional">optional</span></label>
        <select
          class="supb-select"
          :value="coFacilitatorUserId || 0"
          :disabled="disabled || !coFacilitatorOptions.length"
          @change="emit('update:coFacilitatorUserId', Number($event.target.value || 0))"
        >
          <option :value="0">None</option>
          <option v-for="opt in coFacilitatorOptions" :key="`cofac-${opt.id}`" :value="opt.id">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="supb-row">
        <label class="supb-label">Open join (in addition to named invites)</label>
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
      </div>

      <div v-if="presenterOptions.length" class="supb-row">
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
        <p class="supb-hint muted">Schedule up to 2 presenters from invited participants. Leave empty if no one is presenting.</p>
      </div>
    </template>

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
  groupMode: { type: Boolean, default: false },
  canBookGroup: { type: Boolean, default: false },
  facilitatorUserId: { type: Number, default: 0 },
  coFacilitatorUserId: { type: Number, default: 0 },
  facilitatorOptions: { type: Array, default: () => [] },
  inviteAudienceAllSupervised: { type: Boolean, default: false },
  inviteAudienceGroupSupport: { type: Boolean, default: false },
  presenterIds: { type: Array, default: () => [] },
  presenterOptions: { type: Array, default: () => [] },
  sessionTypeLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:isVirtual',
  'update:groupMode',
  'update:facilitatorUserId',
  'update:coFacilitatorUserId',
  'update:inviteAudienceAllSupervised',
  'update:inviteAudienceGroupSupport',
  'update:presenterIds'
]);

const coFacilitatorOptions = computed(() => {
  const facId = Number(props.facilitatorUserId || 0);
  return (props.facilitatorOptions || []).filter((opt) => Number(opt?.id || 0) !== facId);
});

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
.supb-check--emphasis { font-weight: 700; }
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
