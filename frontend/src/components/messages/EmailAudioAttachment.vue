<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ file: { type: Object, required: true }, conversationId: [Number, String] });
const mime = computed(() => {
  const type = props.file.content_type || props.file.contentType || '';
  if (type.startsWith('audio/')) return type;
  return ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac' })[String(props.file.filename || '').split('.').pop().toLowerCase()] || '';
});
const src = ref(''), busy = ref(false), error = ref('');
let generation = 0;
function clear() { generation++; if (src.value) URL.revokeObjectURL(src.value); src.value = ''; error.value = ''; busy.value = false; }
watch(() => [props.conversationId, props.file.id], clear);
onBeforeUnmount(clear);
async function load() {
  const current = ++generation; busy.value = true; error.value = '';
  try {
    const { data } = await api.get(props.file.downloadPath || `/communications/conversations/${props.conversationId}/attachments/${props.file.id}`, { responseType: 'blob', skipGlobalLoading: true });
    if (current !== generation) return;
    src.value = URL.createObjectURL(new Blob([data], { type: mime.value }));
  } catch { if (current === generation) error.value = 'Could not load this recording. Try again or download the attachment.'; }
  finally { if (current === generation) busy.value = false; }
}
</script>
<template>
  <div v-if="mime && conversationId" class="email-audio">
    <button v-if="!src" type="button" :disabled="busy" @click="load">{{ busy ? 'Loading recording…' : `Listen to ${file.filename}` }}</button>
    <audio v-else :src="src" controls preload="metadata" :aria-label="file.filename" @error="error = 'This recording could not be played. Download it to open in an audio player.'" />
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>.email-audio{margin:8px 0;width:100%}.email-audio audio{max-width:100%}.email-audio button{font:inherit;padding:8px 12px}.email-audio p{font-size:13px}</style>
