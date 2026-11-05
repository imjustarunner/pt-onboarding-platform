<template>
  <main class="reminder">
    <h1>Appointment reminders</h1>
    <p v-if="loading">Loading this reminder choice.</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else>
      <p>{{ page.providerName }} at {{ page.schoolName }} can send appointment reminders and provider reminders.</p>
      <p v-if="page.remindersOn">Appointment reminders are on.</p>
      <button v-else type="button" :disabled="saving" @click="optIn">Turn on texting reminders and provider reminders</button>
    </template>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const page = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

async function load() {
  try {
    const { data } = await api.get(`/public/family-introduction/reminders/${route.params.token}`, { skipAuthRedirect: true });
    page.value = data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'This reminder link could not be opened.';
  } finally {
    loading.value = false;
  }
}

async function optIn() {
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/public/family-introduction/reminders/${route.params.token}`, {}, { skipAuthRedirect: true });
    page.value = data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Reminders could not be turned on.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.reminder { max-width: 640px; margin: 32px auto; padding: 0 16px; color: #17352c; }
button { background: #176b50; color: white; border: 0; border-radius: 8px; padding: 12px 16px; }
.error { color: #8d1d1d; }
</style>
