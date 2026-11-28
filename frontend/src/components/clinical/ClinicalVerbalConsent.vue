<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({ needsGuardian: Boolean, guardianId: [Number, String], busy: Boolean });
const emit = defineEmits(['save']);
const language = ref('en-US');
const permission = ref(false);
const verified = ref(false);
const affirmed = ref(false);
const status = ref('');
const error = ref('');
const clip = ref(null);
const evidenceUrl = ref('');
let stream, recorder, timer, generation = 0;
const canRecord = computed(() => permission.value && verified.value && (!props.needsGuardian || Number(props.guardianId)) && !props.busy);

function release() {
  clearTimeout(timer);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  recorder = null;
}

function discard() {
  generation++;
  if (recorder?.state === 'recording') recorder.stop();
  release();
  if (evidenceUrl.value) URL.revokeObjectURL(evidenceUrl.value);
  evidenceUrl.value = '';
  clip.value = null;
  affirmed.value = false;
  status.value = '';
}

async function start() {
  if (!canRecord.value || status.value) return;
  const task = ++generation;
  error.value = '';
  status.value = 'Opening microphone…';
  try {
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (task !== generation) {
      microphone.getTracks().forEach(track => track.stop());
      return;
    }
    stream = microphone;
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(mime => MediaRecorder.isTypeSupported(mime));
    const capture = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const parts = [];
    recorder = capture;
    capture.ondataavailable = event => { if (event.data?.size) parts.push(event.data); };
    capture.onerror = () => {
      discard();
      error.value = 'Could not record consent. Try again or use the signed waiver.';
    };
    capture.onstop = () => {
      if (task !== generation) return;
      release();
      clip.value = new Blob(parts, { type: capture.mimeType || type });
      evidenceUrl.value = URL.createObjectURL(clip.value);
      status.value = '';
    };
    capture.start();
    status.value = 'Recording the consent statement';
    timer = setTimeout(stop, 15000);
  } catch {
    if (task !== generation) return;
    discard();
    error.value = 'Could not open the microphone. Use the signed waiver if microphone access is unavailable.';
  }
}

function stop() {
  if (recorder?.state === 'recording') recorder.stop();
}

function onVisibility() {
  if (document.hidden && status.value) discard();
}
watch(() => props.guardianId, () => {
  discard();
  permission.value = false;
  verified.value = false;
});
onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  discard();
});
</script>

<template>
  <fieldset>
    <legend>Record spoken agreement</legend>
    <p>Show the waiver above. Before opening the microphone, ask whether the signer agrees to record this short consent statement.</p>
    <label class="check"><input v-model="permission" type="checkbox" :disabled="!!status || !!clip" /> They agreed to record their consent statement.</label>
    <label class="check"><input v-model="verified" type="checkbox" :disabled="!!status || !!clip" /> I verified the signer’s identity, consent authority, and review of the waiver.</label>
    <label>Spoken language
      <select v-model="language" :disabled="!!status || !!clip">
        <option value="en-US">English</option>
        <option value="es-US">Español</option>
      </select>
    </label>
    <p>Ask the signer to say “{{ language === 'es-US' ? 'Acepto que se grabe esta sesión' : 'I consent to recording this session' }}.”</p>
    <button v-if="!clip && !status" type="button" :disabled="!canRecord" @click="start">Record consent statement</button>
    <button v-if="status === 'Recording the consent statement'" type="button" @click="stop">Stop consent clip</button>
    <p v-if="status" role="status">{{ status }}</p>
    <template v-if="clip">
      <audio :src="evidenceUrl" controls preload="none" />
      <label class="check"><input v-model="affirmed" type="checkbox" /> I listened to the clip and verified that the actual signer agreed.</label>
      <button type="button" :disabled="busy || !affirmed || !canRecord" @click="emit('save', { audio: clip, language })">Save verbal consent</button>
      <button type="button" :disabled="busy" @click="discard">Discard clip</button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
fieldset { margin: 1rem 0; padding: 1rem; border: 1px solid #cbd9e7; border-radius: 10px; }
legend { font-weight: 700; }
.check { display: flex; gap: .45rem; align-items: baseline; margin: .5rem 0; }
audio { display: block; max-width: 100%; }
button { margin: .25rem; }
</style>
