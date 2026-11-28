<script>
let microphoneOwner = null;
</script>

<script setup>
import { Mic } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { meetingAudioWav } from '../../utils/meetingAudio';

const props = defineProps({
  agencyId: [Number, String],
  transport: Object,
  endpoint: { type: String, default: '/clinical-notes/dictation' },
  disabled: Boolean,
  compact: Boolean,
  limit: { type: Number, default: 12000 }
});
const text = defineModel({ type: String, default: '' });
const supported = typeof MediaRecorder !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia;
const state = ref('idle');
const error = ref('');
const review = ref('');
const owner = Symbol('dictation');
let recorder, stream, timeout, request;
let generation = 0;

function clearCapture() {
  clearTimeout(timeout);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  recorder = null;
  if (microphoneOwner === owner) microphoneOwner = null;
}

function discard() {
  generation++;
  request?.abort();
  if (recorder?.state === 'recording') recorder.stop();
  clearCapture();
  review.value = '';
  state.value = 'idle';
}

async function transcribe(audio, task) {
  if (!audio.size || audio.size > 10 * 1024 * 1024) throw new Error('Please record a shorter dictation and try again.');
  state.value = 'transcribing';
  const form = new FormData();
  const wav = await meetingAudioWav(audio);
  if (task !== generation) return;
  form.append('audio', wav, 'dictation.wav');
  form.append('agencyId', String(props.agencyId));
  request = new AbortController();
  const transport = props.transport || (await import('../../services/api')).default;
  if (task !== generation) return;
  const { data } = await transport.post(props.endpoint, form, {
    signal: request.signal, skipGlobalLoading: true, timeout: 120000
  });
  if (task !== generation) return;
  review.value = String(data.text || '').trim();
  if (!review.value) throw new Error('No dictation was detected. Try again.');
  state.value = 'review';
}

async function start() {
  error.value = '';
  if (!supported || props.disabled || state.value !== 'idle' || !Number(props.agencyId)) return;
  if (microphoneOwner) { error.value = 'Finish the other dictation first.'; return; }
  microphoneOwner = owner;
  const task = ++generation;
  state.value = 'starting';
  try {
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (task !== generation) {
      microphone.getTracks().forEach(track => track.stop());
      return;
    }
    stream = microphone;
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(mime => MediaRecorder.isTypeSupported(mime));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const parts = [];
    recorder.ondataavailable = event => { if (event.data?.size) parts.push(event.data); };
    const capture = recorder;
    capture.onerror = () => {
      if (task !== generation) return;
      discard();
      error.value = 'The microphone stopped. Start a new dictation.';
    };
    capture.onstop = async () => {
      if (task !== generation) return;
      clearCapture();
      try {
        await transcribe(new Blob(parts, { type: capture.mimeType || type }), task);
      } catch (exception) {
        if (task !== generation) return;
        error.value = exception.response?.data?.error?.message || (exception.response ? 'Dictation could not be transcribed.' : exception.message);
        state.value = 'idle';
      }
    };
    recorder.start();
    state.value = 'recording';
    timeout = setTimeout(stop, 120000);
  } catch {
    if (task !== generation) return;
    discard();
    error.value = 'Could not open the microphone. Check this app’s microphone permission.';
  }
}

function stop() {
  if (recorder?.state !== 'recording') return;
  state.value = 'transcribing';
  recorder.stop();
}

function apply() {
  const updated = [text.value, review.value.trim()].filter(Boolean).join('\n\n');
  if (updated.length > props.limit) {
    error.value = 'Trim the dictation to fit this field.';
    return;
  }
  text.value = updated;
  discard();
  error.value = '';
}

function onVisibility() {
  if (document.hidden && ['starting', 'recording'].includes(state.value)) discard();
}

watch(() => [props.agencyId, props.disabled], discard);
onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  discard();
});
</script>

<template>
  <div v-if="Number(agencyId)" class="dictation">
    <button v-if="state === 'idle'" type="button" class="dictation-launch" :class="{ compact }"
      :disabled="disabled || !supported" @click="start">
      <Mic :size="compact ? 16 : 23" aria-hidden="true" />
      <span><strong>Talk My Note</strong><small v-if="!compact">Dictate your own note</small></span>
    </button>
    <button v-if="state === 'recording'" type="button" class="dictation-launch" @click="stop">Stop dictation</button>
    <p v-if="state === 'recording'" role="status">Microphone on. Speak your own note when you’re alone.</p>
    <p v-if="state === 'starting' || state === 'transcribing'" role="status">{{ state === 'starting' ? 'Opening microphone…' : 'Transcribing dictation…' }}</p>
    <div v-if="state === 'review'">
      <label>Review dictation<textarea v-model="review" rows="4" /></label>
      <button type="button" class="btn btn-primary" @click="apply">Add to note</button>
    </div>
    <button v-if="state !== 'idle'" type="button" class="btn btn-secondary" @click="discard">Discard dictation</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!supported" class="dictation-hint">Use a microphone-enabled app or browser for dictation.</p>
  </div>
</template>

<style scoped>
.dictation { margin: .4rem 0 .7rem; }
.dictation .dictation-launch {
  display: inline-flex; gap: .65rem; align-items: center; padding: .55rem .9rem;
  background: linear-gradient(130deg, #154d92, #0b254e); color: #fff;
  border: 1px solid #2d5b9a; border-left: 3px solid #efbe55; border-radius: 10px; text-align: start;
}
.dictation-launch.compact { padding: .4rem .6rem; font-size: .84rem; }
.dictation-launch small { display: block; color: #e0e9f8; }
.dictation textarea { display: block; width: 100%; }
.dictation-hint, .dictation p { margin: .3rem 0; font-size: .85rem; }
</style>
