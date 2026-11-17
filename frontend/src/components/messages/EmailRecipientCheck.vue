<script setup>
import { onUnmounted, ref, watch } from 'vue';

const props = defineProps({ recipients: { type: Object, required: true }, check: { type: Function, required: true } });
const emit = defineEmits(['blocked', 'replace']);
const issues = ref([]), checking = ref(false), error = ref('');
let timer, generation = 0;

async function verify(current) {
  try {
    const result = await props.check({ ...props.recipients });
    if (current !== generation) return;
    if (!Array.isArray(result?.issues)) throw new Error('Recipient check unavailable');
    issues.value = result.issues;
    error.value = '';
    emit('blocked', issues.value.length > 0);
  } catch {
    if (current !== generation) return;
    error.value = 'Email addresses could not be checked. Try again before sending. Your draft can still be saved.';
    emit('blocked', true);
  } finally {
    if (current === generation) checking.value = false;
  }
}

function queueCheck() {
  const current = ++generation;
  clearTimeout(timer); issues.value = []; error.value = '';
  checking.value = ['to', 'cc', 'bcc'].some(field => String(props.recipients[field] || '').trim());
  emit('blocked', checking.value);
  if (checking.value) timer = setTimeout(() => verify(current), 350);
}
function retry() {
  clearTimeout(timer); checking.value = true; error.value = ''; emit('blocked', true);
  void verify(++generation);
}
watch(() => JSON.stringify(['to', 'cc', 'bcc'].map(field => props.recipients[field] || '')), queueCheck, { immediate: true });
onUnmounted(() => { ++generation; clearTimeout(timer); });
</script>

<template>
  <section v-if="checking || error || issues.length" class="recipient-check" aria-label="Email address check" :aria-busy="checking">
    <p v-if="checking" role="status">Checking email addresses…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="retry">Check again</button></p>
    <template v-else>
      <p role="alert">Correct these internal email addresses before sending. You can keep editing and save this draft.</p>
      <ul>
        <li v-for="issue in issues" :key="`${issue.field}:${issue.address}`">
          <span>{{ ({to:'To',cc:'Cc',bcc:'Bcc'})[issue.field] }}: <strong>{{ issue.address }}</strong> is not a recognized internal mailbox.</span>
          <span v-if="issue.suggestions?.length"> Did you mean
            <button v-for="suggestion in issue.suggestions" :key="suggestion" type="button" @click="emit('replace', {field:issue.field,address:issue.address,replacement:suggestion})">{{ suggestion }}</button>?
          </span>
          <span v-else> Check the spelling, choose a person from the directory, or ask Support to verify this address.</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.recipient-check{margin:8px 0 16px;padding:12px;border:1px solid #a5b9af;border-radius:6px;overflow-wrap:anywhere}
p{margin:0}ul{margin:8px 0 0;padding-left:20px}li+li{margin-top:8px}
button{font:inherit;color:var(--link-color,#0047b3);background:transparent;border:1px solid currentColor;border-radius:5px;padding:4px 8px;margin:3px;cursor:pointer}
</style>
