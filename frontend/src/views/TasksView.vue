<template>
  <div class="container">
    <h1>My Tasks</h1>
    <TaskList />
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

