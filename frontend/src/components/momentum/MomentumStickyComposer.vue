<template>
  <span class="sticky-composer">
    <button v-if="!open" type="button" class="link-btn" @click="show">{{ label }}</button>
    <form v-else class="sticky-form" @submit.prevent="save">
      <label>Sticky title <input ref="titleInput" v-model.trim="title" maxlength="120" required /></label>
      <button type="submit" :disabled="saving || !title">{{ saving ? 'Saving…' : 'Save sticky' }}</button>
      <button type="button" :disabled="saving" @click="open=false">Cancel</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <span v-if="notice" role="status">{{ notice }}</span>
  </span>
</template>

<script setup>
import { nextTick, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useMomentumStickiesStore } from '../../store/momentumStickies';

defineProps({ label: { type: String, default: 'Add a sticky' } });
const auth = useAuthStore();
const open = ref(false), title = ref(''), titleInput = ref(null), saving = ref(false), error = ref(''), notice = ref('');

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
