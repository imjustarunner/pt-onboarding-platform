<template>
  <div class="sticky-composer">
    <button v-if="!open" type="button" class="link-btn" @click="show">{{ label }}</button>
    <form v-else class="sticky-form" @submit.prevent="save">
      <label>Sticky title <input ref="titleInput" v-model.trim="title" maxlength="120" required /></label>
      <button type="submit" :disabled="saving || !title">{{ saving ? 'Saving…' : 'Save sticky' }}</button>
      <button type="button" :disabled="saving" @click="open=false">Cancel</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <span v-if="notice" role="status">{{ notice }}</span>
    <details v-if="showSaved" @toggle="readSaved">
      <summary>My stickies</summary>
      <p v-if="listError" role="alert">{{ listError }} <button type="button" @click="loadSaved">Retry</button></p>
      <p v-else-if="listLoading" role="status">Loading your stickies…</p>
      <ul v-else-if="savedStickies.length"><li v-for="sticky in savedStickies" :key="sticky.id">{{ sticky.title }}</li></ul>
      <p v-else>No saved stickies.</p>
    </details>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useMomentumStickiesStore } from '../../store/momentumStickies';

const props = defineProps({ label: { type: String, default: 'Add a sticky' }, showSaved: Boolean });
const auth = useAuthStore();
const open = ref(false), title = ref(''), titleInput = ref(null), saving = ref(false), error = ref(''), notice = ref('');

const savedStickies = ref([]), listError = ref(''), listLoading = ref(false);
let listRequest = 0;
watch(() => auth.user?.id, () => {
  listRequest++;
  savedStickies.value = [];
  listError.value = '';
  listLoading.value = false;
});

function readSaved(event) {
  if (event.target.open) void loadSaved();
}

async function loadSaved() {
  const userId = Number(auth.user?.id);
  if (!props.showSaved || !userId) return;
  const request = ++listRequest;
  listLoading.value = true;
  listError.value = '';
  try {
    const { data } = await api.get(`/users/${userId}/momentum-stickies`, { skipGlobalLoading: true });
    if (request === listRequest && Number(auth.user?.id) === userId) savedStickies.value = Array.isArray(data) ? data : [];
  } catch {
    if (request === listRequest) listError.value = 'Your saved stickies could not be loaded.';
  } finally {
    if (request === listRequest) listLoading.value = false;
  }
}

async function show() {
  open.value = true;
  error.value = '';
  notice.value = '';
  await nextTick();
  titleInput.value?.focus();
}

async function save() {
  const userId = Number(auth.user?.id);
  if (!userId || !title.value || saving.value) return;
  const store = useMomentumStickiesStore();
  saving.value = true;
  error.value = '';
  try {
    const offset = 80 + store.stickies.length * 40;
    const { data } = await api.post(`/users/${userId}/momentum-stickies`,
      { title: title.value, position_x: offset, position_y: offset }, { skipGlobalLoading: true });
    if (Number(auth.user?.id) !== userId) return;
    store.setStickies([...store.stickies.filter(sticky => sticky.id !== data.id), data]);
    store.requestExpandOverlay();
    open.value = false;
    title.value = '';
    notice.value = 'Sticky saved.';
    if (props.showSaved) void loadSaved();
  } catch {
    error.value = 'The sticky could not be saved. Try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.sticky-composer { display: inline-block; max-width: 100%; }
.sticky-form { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.sticky-form label { display: grid; gap: 4px; }
.sticky-composer [role="status"] { display: block; }
</style>
