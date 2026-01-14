<template>
  <div class="container">
    <div v-if="loading" class="loading">Loading document...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <DocumentReviewWorkflow v-else-if="task?.document_action_type === 'review'" />
    <AcroformI9Workflow v-else-if="task?.document_action_type === 'acroform'" />
    <DocumentSigningWorkflow v-else-if="task" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import DocumentSigningWorkflow from '../components/documents/DocumentSigningWorkflow.vue';
import DocumentReviewWorkflow from '../components/documents/DocumentReviewWorkflow.vue';
import AcroformI9Workflow from '../components/documents/AcroformI9Workflow.vue';

const route = useRoute();
const taskId = route.params.taskId;
const task = ref(null);
const loading = ref(true);
const error = ref('');

const loadTask = async () => {
  try {
    loading.value = true;
    error.value = '';
    const response = await api.get(`/tasks/${taskId}`);
    task.value = response.data;
  } catch (err) {
    console.error('Failed to load task:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load document task';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadTask();
});
</script>

