<template>
  <div class="tasks-filters-bar">
    <div class="filters-left">
      <select v-model="local.status" class="filter-select" @change="emitChange">
        <option value="">Status</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
      <select v-model="local.urgency" class="filter-select" @change="emitChange">
        <option value="">Priority</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select v-model="local.due" class="filter-select" @change="emitChange">
        <option value="">Due Date</option>
        <option value="overdue">Overdue</option>
        <option value="today">Today</option>
        <option value="week">This week</option>
      </select>
      <select v-model="local.taskType" class="filter-select" @change="emitChange">
        <option value="">Type</option>
        <option value="custom">Custom</option>
        <option value="document">Document</option>
        <option value="training">Training</option>
        <option value="hiring">Hiring</option>
        <option value="escalation">Escalation</option>
        <option value="meeting_action">Meeting action</option>
      </select>
      <select
        v-if="departments.length"
        v-model="local.departmentId"
        class="filter-select"
        @change="emitChange"
      >
        <option value="">Department</option>
        <option v-for="d in departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
      </select>
    </div>
    <div class="filters-right">
      <select v-model="local.sort" class="filter-select" @change="emitChange">
        <option value="due_asc">Sort: Due Date (Soonest)</option>
        <option value="urgency">Sort: Priority</option>
        <option value="created">Sort: Recently created</option>
        <option v-if="teamView" value="shared_list">Sort: Shared list</option>
      </select>
      <button type="button" class="btn btn-ghost btn-sm" @click="clear">Clear</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  departments: { type: Array, default: () => [] },
  /** Team Tasks tab: show shared-list sort option */
  teamView: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

const local = reactive({
  status: '',
  urgency: '',
  due: '',
  taskType: '',
  departmentId: '',
  sort: 'due_asc'
});

watch(
  () => props.modelValue,
  (v) => {
    Object.assign(local, {
      status: v.status || '',
      urgency: v.urgency || '',
      due: v.due || '',
      taskType: v.taskType || '',
      departmentId: v.departmentId ? String(v.departmentId) : '',
      sort: v.sort || 'due_asc'
    });
  },
  { immediate: true, deep: true }
);

function emitChange() {
  emit('update:modelValue', { ...local });
}

function clear() {
  Object.assign(local, {
    status: '',
    urgency: '',
    due: '',
    taskType: '',
    departmentId: '',
    sort: 'due_asc'
  });
  emitChange();
}
</script>

<style scoped>
.tasks-filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.filters-left,
.filters-right {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.filter-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12px;
}
</style>
