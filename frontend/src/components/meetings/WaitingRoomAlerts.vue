<template>
  <Teleport to="body">
    <section v-if="participants.length && !dismissed" class="waiting-alert" role="status" aria-live="polite" aria-label="Waiting room alert">
      <strong>{{ participants.length }} {{ participants.length === 1 ? 'person is' : 'people are' }} waiting for admission</strong>
      <ul>
        <li v-for="person in participants" :key="person.alertKey">
          <span>{{ person.displayName || 'Participant' }}{{ person.isGuest ? ' · Guest' : '' }}</span>
          <button type="button" :disabled="busy" @click="$emit('admit', person)">Admit</button>
        </li>
      </ul>
      <p v-if="!soundReady">Your browser may block sound until you enable it.</p>
      <button v-if="!soundReady" type="button" @click="chime.enable">Enable waiting-room sound</button>
      <button type="button" @click="dismissed = true">Dismiss notice</button>
    </section>
  </Teleport>
</template>
<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { createWaitingRoomChime } from '../../utils/waitingRoomChime';
const props = defineProps({ participants: { type: Array, default: () => [] }, meetingKey: String, busy: Boolean });
defineEmits(['admit']);
const dismissed = ref(false), soundReady = ref(false);
const chime = createWaitingRoomChime(ready => { soundReady.value = ready; });
let previous = new Set(), priorMeeting;
watch(() => [props.meetingKey, props.participants], () => {
  if (priorMeeting !== props.meetingKey) { previous = new Set(); priorMeeting = props.meetingKey; chime.cancelPending(); }
  const next = new Set(props.participants.map(p => p.alertKey));
  if ([...next].some(key => !previous.has(key))) { dismissed.value = false; chime.play(); }
  if (!next.size) { dismissed.value = false; chime.cancelPending(); }
  previous = next;
}, { immediate: true });
onMounted(() => {
  document.addEventListener('pointerdown', chime.enable, true);
  document.addEventListener('keydown', chime.enable, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', chime.enable, true);
  document.removeEventListener('keydown', chime.enable, true);
  chime.dispose();
});
</script>
<style scoped>
.waiting-alert { position:fixed; z-index:10050; bottom:20px; right:20px; width:min(360px, calc(100vw - 40px)); box-sizing:border-box; padding:16px; background:#102b25; color:#fff; border:2px solid #6ee7b7; border-radius:12px; box-shadow:0 6px 24px #0006; }
.waiting-alert ul { list-style:none; padding:0; max-height:180px; overflow:auto; }
.waiting-alert li { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:8px 0; }
.waiting-alert li span { overflow-wrap:anywhere; min-width:0; }
.waiting-alert button { padding:8px 10px; margin:3px; border:1px solid #6ee7b7; border-radius:6px; background:#fff; color:#102b25; cursor:pointer; }
.waiting-alert p { font-size:13px; }
</style>
