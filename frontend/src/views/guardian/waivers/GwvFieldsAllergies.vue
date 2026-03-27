<template>
  <div class="gwv-f">
    <div class="gwv-notice">
      <p>This form provides your facilitating partner the necessary medical information for your participating child/dependent.</p>
      <p>We do not administer any medication and special instructions or plans will need to be put in place for you to administer, or provide an alternative individual permission to administer any medications during the sessions and activities. Please detail below if you require special accommodations to schedule time to administer medications.</p>
      <p>We do not have a nurse on staff, though we will have first aid kits available for minor incidents.</p>
    </div>

    <label class="gwv-l">Allergies / medical notes</label>
    <textarea v-model="local.allergies" class="input" rows="3" :disabled="disabled" @input="push" placeholder="List any known allergies, dietary restrictions, or medical conditions staff should be aware of." />

    <!-- Snack approval — dynamic checkboxes when the event has specific options -->
    <div class="gwv-snack-block">
      <label class="gwv-l">
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
        <textarea v-model="local.approvedSnacks" class="input" rows="2" :disabled="disabled" @input="push" placeholder="Any other snack notes, e.g. nut-free only, no red dye…" />
      </template>

      <!-- No specific options: free-text field -->
      <template v-else>
        <textarea v-model="local.approvedSnacks" class="input" rows="2" :disabled="disabled" @input="push" placeholder="List snacks your child may have, or write 'none' if no snacks." />
      </template>
    </div>

    <label class="gwv-l">Other medical notes</label>
    <textarea v-model="local.notes" class="input" rows="2" :disabled="disabled" @input="push" placeholder="Any additional information staff should know." />
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  snackOptions: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue']);

const hasSnackOptions = computed(() => Array.isArray(props.snackOptions) && props.snackOptions.length > 0);

const local = reactive({
  allergies: props.modelValue.allergies || '',
  approvedSnacks: props.modelValue.approvedSnacks || '',
  approvedSnacksList: Array.isArray(props.modelValue.approvedSnacksList) ? [...props.modelValue.approvedSnacksList] : [],
  noSnacks: !!props.modelValue.noSnacks,
  notes: props.modelValue.notes || ''
});

const allSnacksSelected = computed(() =>
  hasSnackOptions.value
  && props.snackOptions.every((o) => local.approvedSnacksList.includes(o))
);

watch(
  () => props.modelValue,
  (v) => {
    local.allergies = v.allergies || '';
    local.approvedSnacks = v.approvedSnacks || '';
    local.approvedSnacksList = Array.isArray(v.approvedSnacksList) ? [...v.approvedSnacksList] : [];
    local.noSnacks = !!v.noSnacks;
    local.notes = v.notes || '';
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
