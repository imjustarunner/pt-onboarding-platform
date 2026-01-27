<template>
  <div class="container">
    <h1 data-tour="tasks-title">My Tasks</h1>
    <div data-tour="tasks-list">
      <TaskList />
    </div>
  </div>
</template>

<script setup>
import TaskList from '../components/tasks/TaskList.vue';
</script>

<style scoped>
h1 {
  margin-bottom: 30px;
  color: var(--text-primary);
}
</style>

