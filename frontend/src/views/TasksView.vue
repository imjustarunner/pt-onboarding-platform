<template>
  <div class="tasks-page">
    <TasksHub />
  </div>
</template>

<script setup>
import TasksHub from '../components/tasks/TasksHub.vue';
</script>

<style scoped>
.tasks-page {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 12px 20px 24px;
  box-sizing: border-box;
  min-height: calc(100vh - 72px);
  background: #f8fafc;
}
</style>
