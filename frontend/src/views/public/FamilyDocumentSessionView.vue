<template>
  <main class="family-docs">
    <h1>Documents for your family</h1>
    <p v-if="loading">Loading the documents on this link.</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="session">
      <p v-if="session.status === 'completed'">These documents are finished. You can close this page.</p>
      <template v-else-if="currentChild">
        <h2>{{ currentChild.name }}</h2>
        <form v-if="session.current?.needsBirthday" @submit.prevent="confirmBirthday">
          <label>
            Date of birth
            <input v-model="birthday" type="date" required />
          </label>
          <button type="submit" :disabled="saving">Continue</button>
        </form>
        <template v-else>
          <article v-if="activeItem">
            <h3>{{ activeItem.label }}</h3>
            <template v-if="activeItem.kind === 'demographics'">
              <p>Review the information on file. Name, contact information, and home address are shared with the care and billing teams.</p>
              <GuardianClientDetails v-if="signedInGuardian" :client-id="currentChild.id" />
              <ul v-else class="review">
                <li v-for="field in currentChild.review" :key="field.label"><span>{{ field.label }}</span> {{ field.value || 'Not on file' }}</li>
              </ul>
              <label class="check">
                <input v-model="reviewed" type="checkbox" />
                I reviewed this information. It is correct, or I submitted the needed corrections.
              </label>
              <button type="button" :disabled="saving || !reviewed" @click="confirmDemographics">Confirm</button>
            </template>
            <template v-else>
              <p>Open this document, complete it, and then come back to this page for the next one.</p>
              <a v-if="activeItem.formUrl" class="open-doc" :href="activeItem.formUrl">Open {{ activeItem.label }}</a>
            </template>
          </article>
          <button type="button" class="next" :disabled="saving" @click="load">Next</button>
          <p v-if="stillWaiting">Finish this document before continuing.</p>
        </template>
      </template>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import GuardianClientDetails from '../../components/guardian/GuardianClientDetails.vue';

const route = useRoute();
const authStore = useAuthStore();
const signedInGuardian = computed(() => ['client_guardian', 'client'].includes(String(authStore.user?.role || '')));
const session = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const birthday = ref('');
const reviewed = ref(false);
const stillWaiting = ref(false);

const currentChild = computed(() => session.value?.children?.find((child) => child.id === session.value?.current?.clientId) || null);
const activeItem = computed(() => {
  const requested = Number(route.query.item || 0);
  const items = currentChild.value?.items || [];
  return items.find((item) => item.id === requested && item.status !== 'completed')
    || items.find((item) => item.status !== 'completed')
    || null;
});

async function load() {
  const previous = activeItem.value?.id;
  error.value = '';
  stillWaiting.value = false;
  try {
    const { data } = await api.get(`/public/family-documents/${route.params.token}`, { skipAuthRedirect: true });
    session.value = data;
    if (previous && data.current?.itemId === previous && data.current?.kind !== 'demographics') stillWaiting.value = true;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'This document link could not be opened.';
  } finally {
    loading.value = false;
  }
}

async function confirmBirthday() {
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/public/family-documents/${route.params.token}/birthday`, {
      clientId: session.value.current.clientId,
      dateOfBirth: birthday.value
    }, { skipAuthRedirect: true });
    session.value = data;
    birthday.value = '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'That date of birth could not be confirmed.';
  } finally {
    saving.value = false;
  }
}

async function confirmDemographics() {
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/public/family-documents/${route.params.token}/demographics`, {
      itemId: activeItem.value.id,
      confirmed: true
    }, { skipAuthRedirect: true });
    session.value = data;
    reviewed.value = false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'The confirmation could not be saved.';
  } finally {
    saving.value = false;
  }
}

function onFocus() { if (!loading.value) load(); }
onMounted(() => {
  window.addEventListener('focus', onFocus);
  load();
});
onUnmounted(() => window.removeEventListener('focus', onFocus));
</script>

<style scoped>
.family-docs { max-width: 640px; margin: 32px auto; padding: 0 16px; color: #17352c; }
h1 { font-size: 28px; }
label, .check { display: grid; gap: 8px; margin: 16px 0; }
input[type="date"] { padding: 10px; border: 1px solid #b7d0c6; border-radius: 8px; }
button, .open-doc { display: inline-block; margin-right: 8px; background: #176b50; color: white; border: 0; border-radius: 8px; padding: 10px 14px; text-decoration: none; }
button.next { background: #234166; }
.error { color: #8d1d1d; }
.review { list-style: none; padding: 0; }
.review li { margin: 8px 0; }
.review span { display: block; font-size: 13px; color: #4d655c; }
</style>
