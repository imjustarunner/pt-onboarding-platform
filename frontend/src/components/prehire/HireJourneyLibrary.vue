<template>
  <section v-if="record?.journey || error" class="hire-library">
    <h2>My hire & onboarding package</h2>
    <p>Your completed pre-hire documents, onboarding questionnaires, training record, and submitted time stay here.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="record?.journey">
      <details v-for="phase in ['prehire', 'onboarding']" :key="phase">
        <summary>{{ phase === 'prehire' ? 'Pre-hire' : 'Onboarding' }} · {{ record.journey[phase === 'prehire' ? 'prehireCompletedAt' : 'onboardingCompletedAt'] ? 'Completed' : 'In progress' }}</summary>
        <ul>
          <li v-for="task in record.journey[phase]?.tasks || []" :key="task.id">
            <button v-if="task.taskType === 'document' && task.status === 'completed'" type="button" @click="openTask(task)">{{ task.title }}</button>
            <span v-else>{{ task.title }}</span> · {{ task.status }}
          </li>
        </ul>
        <details v-for="form in record.journey[phase]?.questionnaires || []" :key="form.moduleId">
          <summary>{{ form.title }} · submitted answers</summary>
          <dl><template v-for="field in form.fields" :key="field.id"><dt>{{ field.label }}</dt><dd>{{ field.type === 'file' ? 'File retained in your profile' : field.value || 'Not provided' }}</dd></template></dl>
        </details>
      </details>
      <details>
        <summary>Documents & uploaded materials</summary>
        <ul>
          <li v-for="doc in record.uploadedMaterials || []" :key="doc.id"><button v-if="doc.fileUrl" @click="openFile(doc.fileUrl)">{{ doc.title }}</button><span v-else>{{ doc.title }}</span></li>
          <li v-for="doc in record.completedDocuments || []" :key="`task-${doc.id}`"><button @click="openTask(doc)">{{ doc.title }}</button></li>
        </ul>
      </details>
      <p>{{ Math.floor((record.journey.time?.seconds || 0) / 60) }} minutes of active onboarding recorded.</p>
      <p v-if="record.journey.onboardingCompletedAt">Recorded time was automatically submitted for payroll review.</p>
    </template>
    <div v-if="selected" class="hire-document" role="dialog" aria-modal="true" aria-label="Completed document">
      <div>
        <button type="button" @click="selected = null">Close</button>
        <h3>{{ selected.title }}</h3>
        <button v-if="selected.signedFileUrl" @click="openFile(selected.signedFileUrl)">Open retained signed PDF</button>
        <p v-if="selected.auditTrail?.signedAt">Signed {{ new Date(selected.auditTrail.signedAt).toLocaleString() }}</p>
        <div v-html="safePreview"></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
const record = ref(null);
const error = ref('');
const selected = ref(null);
const safePreview = computed(() => DOMPurify.sanitize(selected.value?.document?.htmlContent || ''));
async function openTask(task) {
  try { error.value = ''; selected.value = (await api.get(`/onboarding-packages/my-record/tasks/${task.id}`)).data; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not load document.'; }
}
async function openFile(url) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    error.value = '';
    const { data } = await api.get(url, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(data);
    if (tab) tab.location.href = objectUrl;
    else { const link = document.createElement('a'); link.href = objectUrl; link.download = 'hire-document.pdf'; link.click(); }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch { tab?.close(); error.value = 'Could not load the retained file. Please contact People Operations.'; }
}
onMounted(async () => {
  try { record.value = (await api.get('/onboarding-packages/my-record')).data; }
  catch { error.value = 'Could not load your hire package. Please refresh to try again.'; }
});
</script>

<style scoped>
.hire-library { border: 1px solid #cde2d8; background: #f5fbf8; border-radius: 14px; padding: 20px; margin: 20px 0; }
.hire-library h2 { margin: 0 0 8px; }
.hire-library p, .hire-library li { line-height: 1.6; }
.hire-library details { padding: 12px 0; border-bottom: 1px solid #dce9e3; }
.hire-library summary { cursor: pointer; font-weight: 600; }
.hire-library button { cursor: pointer; border: 0; background: transparent; color: #086345; text-decoration: underline; }
.hire-library dt { font-weight: 600; margin-top: 12px; }
.hire-library dd { margin-left: 0; white-space: pre-wrap; }
.hire-document { position: fixed; inset: 0; z-index: 1000; background: #14251dcc; display: grid; place-items: center; padding: 20px; }
.hire-document > div { background: white; padding: 24px; max-height: 85vh; overflow: auto; max-width: 850px; width: 100%; border-radius: 14px; }
</style>
