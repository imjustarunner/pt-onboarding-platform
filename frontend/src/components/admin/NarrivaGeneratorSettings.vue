<template>
  <section class="narriva-settings">
    <header><div><h2>Narriva generators</h2><p>Manage which writer each service uses, review its sources, and test fictional examples.</p></div><strong v-if="bundle">{{ bundle.model }} · version {{ bundle.version }}</strong></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <p v-if="loading">Loading generators…</p>
    <template v-else-if="bundle">
      <p v-if="!bundle.schemaReady" class="error">Platform settings need migration 1847 before changes and feedback can be saved. The existing writer remains available.</p>
      <section><h3>Services and their writers</h3><p>Services without a matching writer require a mapping before automatic generation.</p><label class="inline"><input v-model="unmappedOnly" type="checkbox" /> Show only unmapped services ({{ unmappedCount }})</label>
        <div class="service-table"><table><thead><tr><th>Service</th><th>Description</th><th>Generator</th></tr></thead><tbody>
          <tr v-for="service in shownServices" :key="service.code"><td>{{ service.code }}</td><td>{{ service.description || '—' }}</td><td><select :value="effectiveMapping(service.code) || ''" :aria-label="`Generator for ${service.code}`" @change="configuration.mappings[service.code] = $event.target.value || null"><option value="">No generator linked</option><option v-for="tool in bundle.tools" :key="tool.id" :value="tool.id">{{ tool.name }}</option></select></td></tr>
        </tbody></table></div>
        <div class="inline"><label>Additional mapping (for example H2014:group)<input v-model="mappingCode" maxlength="32" /></label><label>Generator<select v-model="mappingTool"><option value="">Choose a generator</option><option v-for="tool in bundle.tools" :key="tool.id" :value="tool.id">{{ tool.name }}</option></select></label><button :disabled="!mappingCode || !mappingTool" @click="addMapping">Add mapping</button></div>
        <ul v-if="additionalMappings.length"><li v-for="[code, toolId] in additionalMappings" :key="code">{{ code }} → {{ toolName(toolId) }} <button @click="delete configuration.mappings[code]">Use default</button></li></ul>
      </section>
      <section><h3>Writing instructions and examples</h3><label>Generator<select v-model="selectedToolId" :disabled="testing"><option v-for="tool in bundle.tools" :key="tool.id" :value="tool.id">{{ tool.name }}</option></select></label>
        <template v-if="selectedTool"><p>Source: {{ selectedTool.source }}. Reference folders: {{ selectedTool.kbFolders.join(', ') || 'None' }}.</p><small>Source fingerprint: {{ selectedTool.sourceHash }}</small><details><summary>Review the base writer and required output</summary><pre>{{ selectedTool.systemPrompt }}

{{ selectedTool.outputInstructions }}</pre></details>
          <label>Additional writing instructions<textarea v-model="selectedGuidance.instructions" rows="6" maxlength="20000" placeholder="Describe the clinical phrasing, detail and organization you want." /></label>
          <p>Instructions shape writing style. Required sections, confirmed facts, privacy rules and clinical safeguards still apply.</p>
          <div v-for="(example, index) in selectedGuidance.examples" :key="index" class="example"><label>Fictional source facts<textarea v-model="example.input" rows="4" maxlength="12000" /></label><label>Preferred output<textarea v-model="example.output" rows="6" maxlength="20000" /></label><button @click="selectedGuidance.examples.splice(index, 1)">Remove example</button></div>
          <button :disabled="selectedGuidance.examples.length >= 8" @click="selectedGuidance.examples.push({ input: '', output: '' })">Add writing example</button>
          <label v-if="selectedGuidance.examples.length" class="inline"><input v-model="selectedGuidance.syntheticConfirmed" type="checkbox" /> These examples are fictional or deidentified.</label>
        </template>
        <label>Reason for this settings change<input v-model="changeReason" maxlength="2000" /></label><button :disabled="saving || !bundle.schemaReady || !changeReason.trim()" @click="save">{{ saving ? 'Saving…' : 'Save a new settings version' }}</button>
      </section>
      <section><h3>Generator tester</h3><p>Use fictional or deidentified facts. Test output is never saved to a client chart and cannot be signed. Save writing changes above before testing them.</p>
        <div class="inline"><label>Reference workspace<select v-model="testAgencyId"><option value="">Choose workspace</option><option v-for="agency in bundle.agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option></select></label><label>Service<select v-model="testServiceCode"><option value="">Choose service</option><option v-for="service in bundle.services" :key="service.code" :value="service.code">{{ service.code }} — {{ service.description }}</option></select></label></div>
        <label>Source facts<textarea v-model="testInput" rows="9" maxlength="60000" /></label><label class="inline"><input v-model="syntheticConfirmed" type="checkbox" /> This input is fictional or deidentified.</label>
        <button :disabled="testing || !testAgencyId || !testServiceCode || !testInput.trim() || !syntheticConfirmed" @click="runTest">{{ testing ? 'Generating test…' : 'Test this generator' }}</button>
        <template v-if="testResult"><p>{{ testResult.model }} · settings version {{ testResult.settingsVersion }} · {{ testResult.finishReason }} · no chart record created</p><label>Generated test output<textarea :value="testResult.outputText" readonly rows="16" /></label><small>Guidance fingerprint: {{ testResult.guidanceHash }}</small><label>Suggestions for the writer<textarea v-model="feedback" rows="4" maxlength="5000" /></label><button :disabled="savingFeedback || !feedback.trim() || !bundle.schemaReady || !syntheticConfirmed" @click="saveFeedback">Save feedback for review</button></template>
      </section>
      <section><h3>Recent changes and suggestions</h3><ul><li v-for="version in bundle.versions" :key="version.version">Version {{ version.version }} — {{ version.change_reason }}</li></ul><ul><li v-for="item in bundle.feedback" :key="item.id">{{ toolName(item.tool_id) }} · version {{ item.settings_version }}: {{ item.feedback_text }}</li></ul></section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
const bundle = ref(null), loading = ref(false), saving = ref(false), testing = ref(false), savingFeedback = ref(false), error = ref(''), message = ref('');
const configuration = ref({ mappings: {}, generators: {} }), selectedToolId = ref(''), changeReason = ref(''), unmappedOnly = ref(false), mappingCode = ref(''), mappingTool = ref('');
const testAgencyId = ref(''), testServiceCode = ref(''), testInput = ref(''), syntheticConfirmed = ref(false), testResult = ref(null), feedback = ref('');
watch(selectedToolId, () => { testResult.value = null; feedback.value = ''; });
const selectedTool = computed(() => bundle.value?.tools.find(tool => tool.id === selectedToolId.value));
const selectedGuidance = computed(() => {
  if (!selectedToolId.value) return { instructions: '', examples: [], syntheticConfirmed: false };
  return configuration.value.generators[selectedToolId.value] ||= { instructions: '', examples: [], syntheticConfirmed: false };
});
const effectiveMapping = code => Object.hasOwn(configuration.value.mappings, code) ? configuration.value.mappings[code] : bundle.value?.defaultMappings[code];
const unmappedCount = computed(() => bundle.value?.services.filter(service => !effectiveMapping(service.code)).length || 0);
const shownServices = computed(() => (bundle.value?.services || []).filter(service => !unmappedOnly.value || !effectiveMapping(service.code)));
const additionalMappings = computed(() => Object.entries(configuration.value.mappings).filter(([code]) => !bundle.value?.services.some(service => service.code === code)));
const toolName = id => bundle.value?.tools.find(tool => tool.id === id)?.name || id || 'No generator';
const reportError = err => { error.value = err.response?.data?.error?.message || 'The request could not be completed. Your entries remain here.'; };
async function load() { loading.value = true; error.value = ''; try { const { data } = await api.get('/note-aid/platform/generators'); bundle.value = data; configuration.value = { mappings: {}, generators: {}, ...JSON.parse(JSON.stringify(data.configuration)) }; selectedToolId.value ||= data.tools[0]?.id || ''; } catch (err) { reportError(err); } finally { loading.value = false; } }
function addMapping() { configuration.value.mappings[mappingCode.value.trim().toUpperCase().replace(/:(GROUP|INDIVIDUAL)$/, value => value.toLowerCase())] = mappingTool.value; mappingCode.value = ''; }
async function save() { saving.value = true; error.value = ''; try { await api.put('/note-aid/platform/generators', { expectedVersion: bundle.value.version, configuration: configuration.value, reason: changeReason.value }); changeReason.value = ''; await load(); message.value = 'A new settings version is active for generation and compliance review.'; } catch (err) { reportError(err); } finally { saving.value = false; } }
async function runTest() { testing.value = true; error.value = ''; try { testResult.value = (await api.post('/note-aid/platform/generators/test', { agencyId: Number(testAgencyId.value), toolId: selectedToolId.value, serviceCode: testServiceCode.value, inputText: testInput.value, syntheticConfirmed: syntheticConfirmed.value })).data; } catch (err) { reportError(err); } finally { testing.value = false; } }
async function saveFeedback() { savingFeedback.value = true; error.value = ''; try { await api.post('/note-aid/platform/generators/feedback', { toolId: testResult.value.toolId || selectedToolId.value, feedback: feedback.value, syntheticConfirmed: syntheticConfirmed.value }); feedback.value = ''; message.value = 'Feedback saved for review. It does not change the writer until you save revised instructions or examples.'; const { data } = await api.get('/note-aid/platform/generators'); bundle.value.feedback = data.feedback; } catch (err) { reportError(err); } finally { savingFeedback.value = false; } }
onMounted(load);
</script>

<style scoped>
.narriva-settings{max-width:1100px;color:var(--text-primary,#17324a)}header,.inline{display:flex;gap:16px;align-items:center;flex-wrap:wrap}header{justify-content:space-between}section section{padding:22px 0;border-top:1px solid #d8e2eb;margin-top:20px}label{display:flex;flex-direction:column;gap:6px;margin:14px 0;flex:1}label.inline{flex-direction:row;justify-content:flex-start}input,textarea,select{border:1px solid #bacbd9;border-radius:8px;padding:10px;font:inherit;color:inherit;background:var(--bg-primary,#fff)}textarea{width:100%;box-sizing:border-box;line-height:1.5}button{border:1px solid #2563a2;background:#eaf3fb;color:#164c80;border-radius:8px;padding:10px 14px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.service-table{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{border-bottom:1px solid #d8e2eb;padding:10px}td select{max-width:380px}.example{padding:16px;background:#f5f8fb;border-radius:12px;margin:16px 0}pre{white-space:pre-wrap;max-height:380px;overflow:auto;font:inherit;line-height:1.5;padding:12px;background:#f5f8fb}small{overflow-wrap:anywhere}.error{color:#a82222}
</style>
