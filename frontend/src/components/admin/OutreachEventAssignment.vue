<template>
  <fieldset class="outreach-assignment" :disabled="!canAssign">
    <legend>Outreach Event</legend>
    <p v-if="!canAssign">An admin or outreach staff coordinator must assign this trip as an Outreach Event.</p>
    <label class="assignment-check" title="Assign this school outreach trip to employees. Actual work and travel use the event attendance and travel submission process."><input type="checkbox" :checked="modelValue.enabled" @change="update({ enabled: $event.target.checked })" />Assign as Outreach Event</label>
    <template v-if="modelValue.enabled">
      <label>Assign to<input v-model="search" type="search" placeholder="Find an employee" /></label>
      <div class="assignment-people" role="group" aria-label="Outreach Event assignees">
        <label v-for="user in filteredUsers" :key="user.id" class="assignment-check"><input type="checkbox" :checked="modelValue.assigneeUserIds.includes(Number(user.id))" @change="toggle(user.id, $event.target.checked)" />{{ name(user) }}</label>
      </div>
      <p>{{ modelValue.assigneeUserIds.length }} employee{{ modelValue.assigneeUserIds.length === 1 ? '' : 's' }} assigned</p>
      <div class="assignment-times"><label>Starts<input type="time" :value="modelValue.startTime" required @input="update({ startTime: $event.target.value })" /></label><label>Ends<input type="time" :value="modelValue.endTime" required @input="update({ endTime: $event.target.value })" /></label></div>
      <p>Times use {{ modelValue.timezone }} and the trip date above. All school stops are included. Assignees record actual outreach work and submit travel separately; saving a planned trip does not submit pay.</p>
    </template>
  </fieldset>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ modelValue: { type: Object, required: true }, users: { type: Array, default: () => [] }, canAssign: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
const search = ref('');
const name = user => `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || user.email || `Employee #${user.id}`;
const filteredUsers = computed(() => props.users.filter(user => name(user).toLowerCase().includes(search.value.trim().toLowerCase())));
const update = patch => emit('update:modelValue', { ...props.modelValue, ...patch });
function toggle(id, checked) {
  const ids = new Set(props.modelValue.assigneeUserIds);
  if (checked) ids.add(Number(id)); else ids.delete(Number(id));
  update({ assigneeUserIds: [...ids] });
}
</script>
<style scoped>
.outreach-assignment { min-width: 0; border: 1px solid #cbd5e1; border-radius: 10px; margin: 16px 0; padding: 12px; }
legend { font-weight: 700; } label { display: grid; gap: 6px; margin-bottom: 10px; } input { box-sizing: border-box; width: 100%; min-width: 0; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
.assignment-check { display: flex; align-items: start; gap: 8px; } .assignment-check input { width: 18px; height: 18px; flex-shrink: 0; margin: 0; }
.assignment-people { max-height: 200px; overflow-y: auto; padding: 8px 0; } .assignment-times { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } p { color: #475569; font-size: 13px; line-height: 1.5; }
</style>
