<template>
  <div class="gwv-f">
    <div class="gwv-notice">
      <p>This form provides your facilitating partner the necessary medical information for your participating child/dependent.</p>
      <p>We do not administer any medication and special instructions or plans will need to be put in place for you to administer, or provide an alternative individual permission to administer any medications during the sessions and activities. Please detail below if you require special accommodations to schedule time to administer medications.</p>
      <p>We do not have a nurse on staff, though we will have first aid kits available for minor incidents.</p>
    </div>

    <!--
      Parent feedback: "if none is desired, it should be a checkbox that fills in NONE."
      When guardians have no medical info to report we let them toggle one box
      that stamps "None" into all three fields (allergies, approved snacks, notes).
      Un-checking restores whatever they had typed before (if anything).
    -->
    <label class="gwv-none-row" :class="{ 'gwv-none-row--active': local.applyNone }">
      <input
        type="checkbox"
        :checked="local.applyNone"
        :disabled="disabled"
        @change="toggleApplyNone"
      />
      <span>
        <strong>No medical info to report</strong>
        <span class="gwv-sub">— fill every field below with "None"</span>
      </span>
    </label>

    <label class="gwv-l" :class="{ 'gwv-l--error': fieldError('allergies') }">Allergies / medical notes</label>
    <textarea
      v-model="local.allergies"
      class="input"
      :class="{ 'input-error': fieldError('allergies') }"
      rows="3"
      :disabled="disabled || local.applyNone"
      @input="onFieldInput"
      placeholder="List any known allergies, dietary restrictions, or medical conditions staff should be aware of."
    />
    <div v-if="fieldError('allergies')" class="gwv-inline-error">{{ fieldError('allergies') }}</div>

    <!-- Snack approval — dynamic checkboxes when the event has specific options -->
    <div class="gwv-snack-block">
      <label class="gwv-l" :class="{ 'gwv-l--error': fieldError('approvedSnacks') }">
        Approved snacks
        <span v-if="hasSnackOptions" class="gwv-sub">Select all snacks you approve for your child</span>
      </label>

      <!-- Event has specific snack options: show checkboxes -->
      <template v-if="hasSnackOptions">
        <div class="gwv-checkbox-list">
          <label v-for="opt in snackOptions" :key="opt" class="gwv-checkbox-row">
            <input
              type="checkbox"
              :value="opt"
              :checked="local.approvedSnacksList.includes(opt)"
              :disabled="disabled"
              @change="toggleSnack(opt)"
            />
            <span>{{ opt }}</span>
          </label>
          <label class="gwv-checkbox-row gwv-checkbox-row--all">
            <input
              type="checkbox"
              :checked="allSnacksSelected"
              :disabled="disabled"
              @change="toggleAllSnacks"
            />
            <span><strong>All of the above</strong></span>
          </label>
          <label class="gwv-checkbox-row">
            <input
              type="checkbox"
              :checked="local.noSnacks"
              :disabled="disabled"
              @change="toggleNoSnacks"
            />
            <span>My child should <strong>not</strong> have any snacks / please hold</span>
          </label>
        </div>
        <div v-if="local.approvedSnacksList.length || local.noSnacks" class="gwv-snack-summary muted small">
          <template v-if="local.noSnacks">No snacks approved.</template>
          <template v-else-if="allSnacksSelected">All listed snacks approved.</template>
          <template v-else>Approved: {{ local.approvedSnacksList.join(', ') }}</template>
        </div>
        <label class="gwv-l" style="margin-top: 8px;">Additional snack notes or restrictions (optional)</label>
        <textarea
          v-model="local.approvedSnacks"
          class="input"
          rows="2"
          :disabled="disabled || local.applyNone"
          @input="onFieldInput"
          placeholder="Any other snack notes, e.g. nut-free only, no red dye…"
        />
      </template>

      <!-- No specific options: free-text field -->
      <template v-else>
        <textarea
          v-model="local.approvedSnacks"
          class="input"
          :class="{ 'input-error': fieldError('approvedSnacks') }"
          rows="2"
          :disabled="disabled || local.applyNone"
          @input="onFieldInput"
          placeholder="List snacks your child may have, or write 'none' if no snacks."
        />
      </template>
      <div v-if="fieldError('approvedSnacks')" class="gwv-inline-error">{{ fieldError('approvedSnacks') }}</div>
    </div>

    <label class="gwv-l" :class="{ 'gwv-l--error': fieldError('notes') }">Other medical notes</label>
    <textarea
      v-model="local.notes"
      class="input"
      :class="{ 'input-error': fieldError('notes') }"
      rows="2"
      :disabled="disabled || local.applyNone"
      @input="onFieldInput"
      placeholder="Any additional information staff should know."
    />
    <div v-if="fieldError('notes')" class="gwv-inline-error">{{ fieldError('notes') }}</div>
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  snackOptions: { type: Array, default: () => [] },
  /**
   * Per-field validation errors from the parent step, keyed by one of:
   *   'allergies' | 'approvedSnacks' | 'notes' | '*'
   * Falsy entries are ignored. A '*' entry is shown on the first missing
   * field so the guardian knows what to fix without scrolling back to the
   * top-of-page banner.
   */
  validationError: { type: [String, Object], default: '' }
});
const emit = defineEmits(['update:modelValue']);

const hasSnackOptions = computed(() => Array.isArray(props.snackOptions) && props.snackOptions.length > 0);

const local = reactive({
  allergies: props.modelValue.allergies || '',
  approvedSnacks: props.modelValue.approvedSnacks || '',
  approvedSnacksList: Array.isArray(props.modelValue.approvedSnacksList) ? [...props.modelValue.approvedSnacksList] : [],
  noSnacks: !!props.modelValue.noSnacks,
  notes: props.modelValue.notes || '',
  // Mirror whether the incoming modelValue already looks like an all-"None"
  // dataset so re-entering the step doesn't silently un-tick the box.
  applyNone: isAllNone(props.modelValue)
});

function isAllNone(v) {
  const matches = (x) => String(x ?? '').trim().toLowerCase() === 'none';
  return matches(v?.allergies) && matches(v?.approvedSnacks) && matches(v?.notes);
}

const allSnacksSelected = computed(() =>
  hasSnackOptions.value
  && props.snackOptions.every((o) => local.approvedSnacksList.includes(o))
);

const errorMap = computed(() => {
  if (!props.validationError) return {};
  if (typeof props.validationError === 'string') return { '*': props.validationError };
  if (typeof props.validationError === 'object') return props.validationError;
  return {};
});

function fieldError(key) {
  const map = errorMap.value;
  if (map[key]) return map[key];
  // If a catch-all error is provided, show it on the first empty required field
  if (map['*']) {
    const firstEmpty = ['allergies', 'approvedSnacks', 'notes'].find(
      (k) => String(local[k] ?? '').trim().length === 0
    );
    if (firstEmpty === key) return map['*'];
  }
  return '';
}

watch(
  () => props.modelValue,
  (v) => {
    local.allergies = v.allergies || '';
    local.approvedSnacks = v.approvedSnacks || '';
    local.approvedSnacksList = Array.isArray(v.approvedSnacksList) ? [...v.approvedSnacksList] : [];
    local.noSnacks = !!v.noSnacks;
    local.notes = v.notes || '';
    if (isAllNone(v)) local.applyNone = true;
  },
  { deep: true }
);

function toggleSnack(opt) {
  if (local.noSnacks) local.noSnacks = false;
  const idx = local.approvedSnacksList.indexOf(opt);
  if (idx === -1) local.approvedSnacksList.push(opt);
  else local.approvedSnacksList.splice(idx, 1);
  push();
}

function toggleAllSnacks() {
  local.noSnacks = false;
  if (allSnacksSelected.value) {
    local.approvedSnacksList = [];
  } else {
    local.approvedSnacksList = [...props.snackOptions];
  }
  push();
}

function toggleNoSnacks() {
  local.noSnacks = !local.noSnacks;
  if (local.noSnacks) local.approvedSnacksList = [];
  push();
}

function onFieldInput() {
  // If a guardian starts typing real content, un-tick the "apply None" box so
  // what they entered is preserved instead of being overwritten back to "None".
  if (local.applyNone) {
    const typed = [local.allergies, local.approvedSnacks, local.notes]
      .some((v) => String(v ?? '').trim().toLowerCase() && String(v ?? '').trim().toLowerCase() !== 'none');
    if (typed) local.applyNone = false;
  }
  push();
}

function toggleApplyNone(ev) {
  const checked = !!ev?.target?.checked;
  local.applyNone = checked;
  if (checked) {
    local.allergies = 'None';
    local.approvedSnacks = 'None';
    local.notes = 'None';
  } else {
    // Clearing goes back to empty fields so the guardian can type real info.
    if (String(local.allergies).trim().toLowerCase() === 'none') local.allergies = '';
    if (String(local.approvedSnacks).trim().toLowerCase() === 'none') local.approvedSnacks = '';
    if (String(local.notes).trim().toLowerCase() === 'none') local.notes = '';
  }
  push();
}

function push() {
  emit('update:modelValue', {
    ...props.modelValue,
    allergies: local.allergies,
    approvedSnacks: local.approvedSnacks,
    approvedSnacksList: local.approvedSnacksList,
    noSnacks: local.noSnacks,
    notes: local.notes
  });
}
</script>

<style scoped>
.gwv-f {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gwv-notice {
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary, #475569);
  margin-bottom: 4px;
}
.gwv-notice p { margin: 0 0 8px; }
.gwv-notice p:last-child { margin-bottom: 0; }
.gwv-l {
  font-size: 13px;
  font-weight: 600;
}
.gwv-l--error {
  color: #b91c1c;
}
.gwv-sub {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin-left: 6px;
}
.input {
  width: 100%;
  resize: vertical;
}
.input-error {
  border-color: #dc2626 !important;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.08);
}
.gwv-inline-error {
  color: #b91c1c;
  font-size: 12.5px;
  margin: -2px 0 6px;
  line-height: 1.35;
}
.gwv-none-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 13.5px;
  cursor: pointer;
  margin: 2px 0 4px;
}
.gwv-none-row--active {
  background: #ecfdf5;
  border-color: #86efac;
  border-style: solid;
}
.gwv-snack-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gwv-checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}
.gwv-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.gwv-checkbox-row--all {
  border-top: 1px solid var(--border, #e2e8f0);
  padding-top: 6px;
  margin-top: 2px;
}
.gwv-snack-summary {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin-top: 2px;
}
.muted { color: var(--text-secondary, #64748b); }
.small { font-size: 12px; }
</style>
