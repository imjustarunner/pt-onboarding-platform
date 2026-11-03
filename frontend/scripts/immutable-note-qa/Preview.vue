<template>
  <main class="qa-page"><header class="qa-banner"><strong>DEMO QA · Synthetic immutable-note workflow</strong><p>All records and signatures are in memory. No backend, claims, messages or real client data are connected.</p><label>QA scenario<select v-model="scenario" data-testid="qa-scenario"><option value="supervisor">Supervisor · saved legacy correction + next cosign</option><option value="provider">Original author · billing proposal signature</option><option value="billing">Billing · attributed proposal only</option><option value="conflict">Conflict · reject a stale revision</option></select></label></header>
    <ClinicalNoteGeneratorView v-if="scenario === 'supervisor'" :key="generation" ref="workspace" />
    <ClinicalNoteVersionHistory v-else :key="generation" :note-id="990071" :agency-id="990002" prefer-pending />
  </main>
</template>
<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import ClinicalNoteGeneratorView from '../../src/views/admin/ClinicalNoteGeneratorView.vue';
import ClinicalNoteVersionHistory from '../../src/components/clinical/ClinicalNoteVersionHistory.vue';
import { qa, resetScenario } from './api.js';
const scenario = ref('supervisor'), generation = ref(0), workspace = ref(null);
function queueRow(id) { return { id: `cosign_${id}`, clinicalNoteId: id, agencyId: 990002, clientName: `DEMO QA synthetic client ${id}`, providerName: 'DEMO QA Original Author', dateOfService: '2026-11-01', serviceCode: 'H0002' }; }
async function initialize() {
  await nextTick(); if (scenario.value !== 'supervisor' || !workspace.value) return;
  const state = workspace.value.$.setupState;
  state.canSuperviseCosign = true; state.cosignQueueItems = qa.queue.map(queueRow); state.cosignVisibleOrder = qa.queue.map(id => `cosign_${id}`);
  state.workQueueItems = [{ id: 'DEMO-QA-retained-draft', clientId: 990099, agencyId: 990002, status: 'started', clientName: 'DEMO QA retained author draft', clinicalSessionId: 990199 }];
  state.activateCosignQueueItem(queueRow(990071));
}
watch(scenario, async value => { resetScenario(value); generation.value++; await initialize(); });
onMounted(initialize);
window.__DEMO_QA__ = { state: qa, setSignatureDelay: milliseconds => { qa.delaySignature = milliseconds; }, inspect: () => ({ calls: qa.calls, completed: qa.completed, authorTasks: qa.authorTasks, revisions: qa.records[990071]?.revisions, selectedNoteId: workspace.value?.$?.setupState.supervisorReviewItem?.clinicalNoteId || null, retainedDraft: workspace.value?.$?.setupState.workQueueItems?.find(item => item.id === 'DEMO-QA-retained-draft') || null }) };
</script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#eef4f8;color:#203246}.qa-page{max-width:1500px;margin:auto;padding:14px}.qa-banner{background:#fff3c6;border:2px solid #a66b00;padding:14px;border-radius:8px;margin-bottom:12px}.qa-banner strong{font-size:1.05rem}.qa-banner p{margin:7px 0;font-size:.85rem}.qa-banner label{display:block;font-size:.8rem}.qa-banner select{display:block;max-width:100%;padding:8px;margin-top:5px;border:1px solid #956c20;border-radius:6px;background:white}.na-shell--supervisor-review .na-main{min-width:0}.na-supervisor-review{max-height:calc(100dvh - 220px)!important;min-height:300px!important}@media(max-width:600px){.qa-page{padding:6px}.qa-banner{padding:10px}.na-supervisor-review{max-height:calc(100dvh - 180px)!important}}
</style>
