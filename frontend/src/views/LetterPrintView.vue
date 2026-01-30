<template>
  <div class="print-shell">
    <div class="print-toolbar">
      <div class="title">
        <strong>Print Preview</strong>
        <span class="sub">Task #{{ taskId }}</span>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" @click="reload" :disabled="loading">Reload</button>
        <button class="btn btn-primary" @click="print" :disabled="loading || !html">Print</button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="frame-wrap">
      <iframe ref="frameRef" class="frame" :srcdoc="html || '<p>Loading…</p>'" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const taskId = route.params.taskId;

const loading = ref(false);
const error = ref('');
const html = ref('');
const frameRef = ref(null);

const fetchHtml = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get(`/tasks/${taskId}/render`, {
      responseType: 'text',
      skipGlobalLoading: true
    });
    html.value = res.data || '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load print preview';
    html.value = '';
  } finally {
    loading.value = false;
  }
};

const reload = async () => {
  await fetchHtml();
};

const print = () => {
  try {
    const win = frameRef.value?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  } catch (e) {
    // no-op
  }
};

onMounted(async () => {
  await fetchHtml();
});
</script>

<style scoped>
.print-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f4f5f7;
}

.print-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid var(--border, #ddd);
}

.title {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.sub {
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 10px;
}

.frame-wrap {
  flex: 1;
  padding: 12px;
}

.frame {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border, #ddd);
  border-radius: 10px;
  background: white;
}

.error {
  margin: 12px 16px 0;
  padding: 10px 12px;
  background: #f8d7da;
  color: #842029;
  border-radius: 8px;
}
</style>

