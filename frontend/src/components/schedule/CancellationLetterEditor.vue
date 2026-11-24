<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { prepareEmailPreview } from '../../utils/emailPreview';

const props = defineProps({ message: { type: Object, required: true }, label: { type: String, default: 'Email' },
  baseUrl: { type: String, required: true }, agencyId: Number, audience: String, disabled: Boolean, readOnly: Boolean });
const emit = defineEmits(['update:text', 'busy']);
const working = ref(false), error = ref(''), previewOpen = ref(false), preview = ref(null), previewSource = ref('');
const tones = [['warmer', 'Warmer'], ['formal', 'More formal'], ['shorter', 'Fewer words'], ['longer', 'More words'], ['regenerate', 'Rewrite']];
const source = computed(() => JSON.stringify([props.agencyId, props.message.subject, props.message.text]));
const previewCurrent = computed(() => previewSource.value === source.value);
watch(source, () => { error.value = ''; });

async function rewrite(tone) {
  if (working.value || props.disabled || props.readOnly || !props.message.text) return;
  working.value = true; emit('busy', true); error.value = '';
  const before = source.value;
  try {
    const { data } = await api.post(`${props.baseUrl}/rewrite`, { agencyId: props.agencyId, text: props.message.text, tone, audience: props.audience }, { skipGlobalLoading: true });
    if (before !== source.value) return;
    if (typeof data?.text !== 'string' || !data.text.trim() || /\[object Object\]/.test(data.text)) throw new Error('The rewrite did not return a usable email. Your wording has been kept.');
    emit('update:text', data.text);
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'The email could not be rewritten. Your wording has been kept.'; }
  finally { working.value = false; emit('busy', false); }
}
async function showPreview() {
  if (working.value || props.disabled) return;
  if (previewOpen.value && previewCurrent.value) { previewOpen.value = false; return; }
  previewOpen.value = true; working.value = true; emit('busy', true); error.value = '';
  const before = source.value;
  try {
    const { data } = await api.post(`${props.baseUrl}/email-preview`, { agencyId: props.agencyId, subject: props.message.subject, text: props.message.text }, { skipGlobalLoading: true });
    if (before !== source.value) return;
    if (typeof data?.html !== 'string') throw new Error('The example email could not be loaded. Your draft is unchanged.');
    preview.value = prepareEmailPreview(data.html); previewSource.value = before;
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'The example email could not be loaded.'; }
  finally { working.value = false; emit('busy', false); }
}
</script>

<template>
  <section class="cancellation-letter" :aria-label="label">
    <label v-if="!readOnly" class="letter-field">{{ label }}<textarea :value="message.text" rows="5" maxlength="6000" :disabled="disabled || working" @input="emit('update:text', $event.target.value)" /></label>
    <template v-else><strong>{{ label }}</strong><p class="letter-text">{{ message.text }}</p></template>
    <div class="letter-actions">
      <template v-if="!readOnly"><button v-for="[tone, title] in tones" :key="tone" type="button" :disabled="disabled || working || !message.text" @click="rewrite(tone)">{{ title }}</button></template>
      <button type="button" class="letter-preview-button" :disabled="disabled || working || !message.text" :aria-expanded="previewOpen" @click="showPreview">{{ previewOpen ? previewCurrent ? 'Hide HTML preview' : 'Refresh HTML preview' : 'Preview HTML email' }}</button>
    </div>
    <p v-if="working" role="status">Preparing {{ previewOpen ? 'email' : 'rewrite' }}…</p>
    <p v-if="error" role="alert" class="letter-error">{{ error }}</p>
    <div v-if="previewOpen" class="letter-preview">
      <p>Example email layout using this draft. Nothing is sent. Actual appointment and receipt links are added when sending; links and external images are disabled here.</p>
      <template v-if="preview && previewCurrent"><strong>Subject: {{ message.subject }}</strong><iframe v-if="preview.html" :srcdoc="preview.html" :title="`${label} HTML preview`" sandbox="" referrerpolicy="no-referrer" /></template>
      <p v-else-if="!working">Refresh the preview to see your latest wording.</p>
    </div>
  </section>
</template>

<style scoped>.letter-text{white-space:pre-wrap;line-height:1.5}</style>

<style scoped>
.cancellation-letter{margin-top:12px}.letter-field{display:grid;gap:7px}.letter-field textarea{font:inherit;line-height:1.5;resize:vertical;padding:10px;border:1px solid #bdcadd;border-radius:8px;width:100%;box-sizing:border-box}.letter-actions{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}.letter-actions button{font:inherit;font-size:13px;min-height:34px;padding:6px 12px;border:1px solid #d7dfeb;border-radius:8px;background:#fff;color:#263b55;cursor:pointer}.letter-actions .letter-preview-button{background:#edf5fc;border-color:#adc5df;color:#16457c}.letter-actions button:disabled{opacity:.55;cursor:wait}.letter-error{color:#a82a2a}.letter-preview{background:#f4f6f9;padding:12px;border:1px solid #d7dfeb;border-radius:10px}.letter-preview p{font-size:13px;line-height:1.5}.letter-preview iframe{display:block;width:100%;height:520px;border:0;margin-top:10px;background:white}
</style>
