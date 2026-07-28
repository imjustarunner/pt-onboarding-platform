<template>
  <div class="supb" data-testid="supervision-body">
    <div v-if="showControls" class="supb-card">
      <div v-if="sessionTypeLabel" class="supb-row">
        <label class="supb-label">Session type</label>
        <div class="supb-value">{{ sessionTypeLabel }}</div>
      </div>

      <div v-if="canBookGroup" class="supb-row supb-switch-row">
        <div class="supb-switch-copy">
          <span class="supb-switch-title">Group supervision</span>
          <p class="supb-hint muted">
            Off = your assigned supervisees only (individual or triadic).
            On = agency-wide roster, practice groups, facilitator, and optional co-facilitator.
          </p>
        </div>
        <label class="supb-switch" :class="{ disabled: disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="groupMode"
            :disabled="disabled"
            :aria-checked="String(!!groupMode)"
            @change="emit('update:groupMode', !!$event.target.checked)"
          />
          <span class="supb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>

      <div v-if="groupMode && canBookGroup" class="supb-row supb-switch-row">
        <div class="supb-switch-copy">
          <span class="supb-switch-title">Tenant signup session</span>
          <p class="supb-hint muted">
            Open to everyone in the agency. Appears on all schedules with a signup countdown.
            Signup closes 1 hour before start; cancels automatically if no one signs up.
          </p>
        </div>
        <label class="supb-switch" :class="{ disabled: disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="signupOnly"
            :disabled="disabled"
            :aria-checked="String(!!signupOnly)"
            @change="emit('update:signupOnly', !!$event.target.checked)"
          />
          <span class="supb-switch-slider supb-switch-slider--signup" aria-hidden="true"></span>
        </label>
      </div>

      <div class="supb-row supb-switch-row">
        <div class="supb-switch-copy">
          <span class="supb-switch-title">Virtual</span>
          <p class="supb-hint muted">Schedule as a virtual supervision session with video / Meet link support.</p>
        </div>
        <label class="supb-switch" :class="{ disabled: disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="isVirtual"
            :disabled="disabled"
            :aria-checked="String(!!isVirtual)"
            @change="emit('update:isVirtual', !!$event.target.checked)"
          />
          <span class="supb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>

      <div v-if="isVirtual" class="supb-row supb-switch-row">
        <div class="supb-switch-copy">
          <span class="supb-switch-title">Waiting room</span>
          <p class="supb-hint muted">
            On by default. Participants wait until the host admits them. Hosts always enter the main room.
          </p>
        </div>
        <label class="supb-switch" :class="{ disabled: disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="waitingRoomEnabled"
            :disabled="disabled"
            :aria-checked="String(!!waitingRoomEnabled)"
            @change="emit('update:waitingRoomEnabled', !!$event.target.checked)"
          />
          <span class="supb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>
    </div>

    <template v-if="showDetails">
      <template v-if="groupMode && canBookGroup && !signupOnly">
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

      <p class="supb-hint muted">
        After booking, use the <strong>Note</strong> tab for short notes, transcript, and summary,
        and the <strong>Supervisee</strong> tab for individual / group hour progress.
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  isVirtual: { type: Boolean, default: true },
  waitingRoomEnabled: { type: Boolean, default: true },
  groupMode: { type: Boolean, default: false },
  signupOnly: { type: Boolean, default: false },
  canBookGroup: { type: Boolean, default: false },
  facilitatorUserId: { type: Number, default: 0 },
  coFacilitatorUserId: { type: Number, default: 0 },
  facilitatorOptions: { type: Array, default: () => [] },
  inviteAudienceAllSupervised: { type: Boolean, default: false },
  inviteAudienceGroupSupport: { type: Boolean, default: false },
  presenterIds: { type: Array, default: () => [] },
  presenterOptions: { type: Array, default: () => [] },
  sessionTypeLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** controls = session type + switches; details = facilitator/open join; all = everything */
  section: { type: String, default: 'all' }
});

const emit = defineEmits([
  'update:isVirtual',
  'update:waitingRoomEnabled',
  'update:groupMode',
  'update:signupOnly',
  'update:facilitatorUserId',
  'update:coFacilitatorUserId',
  'update:inviteAudienceAllSupervised',
  'update:inviteAudienceGroupSupport',
  'update:presenterIds'
]);

const showControls = computed(() => props.section === 'all' || props.section === 'controls');
const showDetails = computed(() => props.section === 'all' || props.section === 'details');

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
.supb-card {
  border: 1px solid #d7e3f0;
  border-radius: 12px;
  background: #eef4fa;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
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
.supb-switch-row {
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.supb-switch-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.supb-switch-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.supb-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}
.supb-switch.disabled { opacity: 0.55; cursor: not-allowed; }
.supb-switch input { opacity: 0; width: 0; height: 0; }
.supb-switch-slider {
  position: absolute;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.2s;
}
.supb-switch input:checked + .supb-switch-slider { background: #7c3aed; }
.supb-switch input:checked + .supb-switch-slider--signup { background: #0d9488; }
.supb-switch-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
}
.supb-switch input:checked + .supb-switch-slider::before { transform: translateX(20px); }
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
