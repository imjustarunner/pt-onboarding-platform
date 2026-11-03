<template>
  <section class="demo-documentation" data-analytics-area="documentation" aria-label="Fictional Note Workspace">
    <div class="demo-doc-intro">
      <div><p class="demo-doc-eyebrow">A clearer path from session to signed note</p><p>Drafts on the left. Your note in the center. Notes and supervisor reviews in <strong>My Work</strong>.</p></div>
      <div class="demo-doc-actions">
        <button type="button" data-analytics-id="demo-note-open-draft" @click="openExample('draft')">Explore a draft</button>
        <button type="button" data-analytics-id="demo-note-open-cosign" @click="openExample('cosign')">Try supervisor review</button>
      </div>
    </div>
    <div class="demo-doc-context"><span>Fictional records</span><p>Write your own notes or choose optional AI assistance. A consented session transcript can become a draft for clinician review. Recording, generation and signatures are simulated here.</p></div>
    <div class="demo-doc-workspace" @click.capture="interceptAction" @submit.capture.prevent="showDemoNotice">
      <ClinicalNoteGeneratorView :key="workspaceKey" :demo-presentation="presentation" />
    </div>
    <footer class="demo-doc-footer">
      <p><strong>Explore the full workflow.</strong> Open drafts, compare treatment objective ratings and review Milo’s notes with supervisor Dr. Tessa Brooks.</p>
      <button type="button" data-analytics-id="demo-note-simulate-sign-next" @click="simulateSignNext">Sign and open next (demo)</button>
    </footer>
  </section>
</template>

<script setup>
import { nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClinicalNoteGeneratorView from '../../views/admin/ClinicalNoteGeneratorView.vue';
import { DEMO_COSIGN_IDS, DEMO_DRAFT_IDS, DEMO_NOTE_NOTICE, demoNoteAction } from './notes';
import { drafts as demoDrafts } from './fixtures';

const route = useRoute(), router = useRouter();
const workspaceKey = ref(0);
const presentation = Object.freeze({
  heading: 'Please choose a draft or a note from your My Work.',
  description: 'Resume a draft from the Note Library on the left, or select a note or co-sign review from My Work on the right.',
  keepSidebarsOpen: true
});
function showDemoNotice() {
  window.dispatchEvent(new CustomEvent('aw-demo-notice', { detail: DEMO_NOTE_NOTICE }));
}
async function openExample(kind, advance = false) {
  const cosign = kind === 'cosign';
  const ids = cosign ? DEMO_COSIGN_IDS : DEMO_DRAFT_IDS;
  // The shared workspace consumes draftId after opening a My Work item. Its
  // remaining client context still identifies the seeded draft being viewed.
  const selectedDraft = demoDrafts.find(draft => Number(draft.client_id) === Number(route.query.clientId));
  const current = Number(cosign ? route.query.noteId : route.query.draftId || selectedDraft?.id);
  const index = advance ? (Math.max(-1, ids.indexOf(current)) + 1) % ids.length : 0;
  // Remove the previous client's launch context before opening the next example.
  const query = { agencyId: '990101', ...(cosign ? { noteId: String(ids[index]), launchIntent: 'cosign' } : { draftId: String(ids[index]) }) };
  await router.replace({ path: route.path, query });
  workspaceKey.value++;
}
async function simulateSignNext() {
  await openExample(route.query.launchIntent === 'cosign' ? 'cosign' : 'draft', true);
  await nextTick();
  showDemoNotice();
}
function interceptAction(event) {
  const button = event.target?.closest?.('button');
  if (!button || button.disabled) return;
  const action = demoNoteAction(button);
  if (!action) return;
  // Stop before the shared component's handler: the API adapter also rejects writes.
  event.preventDefault();
  event.stopImmediatePropagation();
  if (action === 'sign-next') void simulateSignNext();
  else showDemoNotice();
}
</script>

<style scoped>
.demo-documentation{min-width:0;--na-teal:#2165a3;--na-teal-dark:#194f81}
.demo-doc-intro{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px}.demo-doc-intro p{margin:3px 0;color:#62748b;font-size:.88rem;line-height:1.5}.demo-doc-intro .demo-doc-eyebrow{font-size:.75rem;font-weight:750;text-transform:uppercase;letter-spacing:.07em;color:#375b7c}.demo-doc-actions{display:flex;gap:8px;flex-shrink:0}.demo-doc-actions button,.demo-doc-footer button{border:1px solid #b9cfe3;border-radius:9px;background:#fff;color:#235b8c;font:inherit;font-size:.82rem;font-weight:650;padding:10px 13px;cursor:pointer}.demo-doc-actions button:hover,.demo-doc-footer button:hover{background:#edf5ff}.demo-doc-actions button:focus-visible,.demo-doc-footer button:focus-visible{outline:3px solid #4588c7;outline-offset:3px}
.demo-doc-context{display:flex;align-items:flex-start;gap:14px;padding:12px 15px;margin-bottom:15px;border:1px solid #d6e5f2;border-radius:10px;background:#f3f8fd;color:#506983}.demo-doc-context span{flex-shrink:0;border-radius:5px;padding:3px 7px;background:#e0ecfa;color:#315b89;font-size:.7rem;font-weight:750;line-height:1.5}.demo-doc-context p{margin:0;font-size:.8rem;line-height:1.6}.demo-doc-workspace{min-width:0;border:1px solid #d7e2ed;border-radius:15px;background:#fff;overflow:hidden;box-shadow:0 12px 35px #1d41620a}
.demo-doc-workspace :deep(.clinical-workspace__header){display:none}.demo-doc-workspace :deep(.na-app){border-radius:0;box-shadow:none}.demo-doc-workspace :deep(.na-start){min-height:360px;justify-content:center;padding:38px 22px}.demo-doc-workspace :deep(.na-start-icon),.demo-doc-workspace :deep(.na-start-actions),.demo-doc-workspace :deep(.na-start-ways){display:none}.demo-doc-workspace :deep(.na-start-hero h1){font-size:1.5rem;color:#243f5b;line-height:1.35;max-width:380px}.demo-doc-workspace :deep(.na-start-hero p){font-size:.9rem;max-width:360px}.demo-doc-workspace :deep(.na-nav-link){display:none}.demo-doc-workspace :deep(.na-brand-title){font-size:1rem}.demo-doc-workspace :deep(.na-topbar){flex-wrap:wrap;gap:12px}.demo-doc-workspace :deep(.na-topbar-actions){flex-wrap:wrap}.demo-doc-workspace :deep(.na-tagline){display:none}.demo-doc-workspace :deep(.na-shell){min-width:0}.demo-doc-workspace :deep(.na-shell--note-focused){grid-template-columns:260px minmax(0,1fr) 280px}.demo-doc-workspace :deep(.na-main){min-width:0}.demo-doc-workspace :deep(.na-workspace-title){min-width:0}.demo-doc-workspace :deep(.na-workspace-title h2){overflow-wrap:anywhere}.demo-doc-workspace :deep(.na-write-main > .na-input-panel){order:2}.demo-doc-workspace :deep(.na-write-main > .na-output){order:1}.demo-doc-workspace :deep(.na-aid-bar-copy > p),.demo-doc-workspace :deep(.na-attendance-hint){display:none}.demo-doc-footer{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:15px 0}.demo-doc-footer p{font-size:.8rem;line-height:1.6;color:#62748b;max-width:650px;margin:0}.demo-doc-footer button{flex-shrink:0}
@media(max-width:1200px){.demo-doc-workspace :deep(.na-shell--note-focused){grid-template-columns:220px minmax(0,1fr)}.demo-doc-workspace :deep(.na-wq){grid-column:1/-1;width:100%}.demo-doc-workspace :deep(.na-wq-list){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.demo-doc-intro{align-items:flex-start;flex-direction:column}.demo-doc-workspace :deep(.na-shell--supervisor-review){grid-template-columns:minmax(0,1fr)}}
@media(max-width:700px){.demo-doc-actions{flex-wrap:wrap;flex-shrink:1}.demo-doc-actions button{padding:9px 11px}.demo-doc-context{flex-direction:column;gap:6px}.demo-doc-workspace :deep(.na-shell--note-focused){display:flex;flex-direction:column}.demo-doc-workspace :deep(.cnl),.demo-doc-workspace :deep(.na-wq){width:100%;max-width:100%}.demo-doc-workspace :deep(.na-start){min-height:240px;padding:26px 15px}.demo-doc-workspace :deep(.na-start-hero h1){font-size:1.22rem}.demo-doc-workspace :deep(.na-wq-list){grid-template-columns:1fr}.demo-doc-workspace :deep(.na-topbar-actions){gap:5px}.demo-doc-workspace :deep(.na-archive-btn){font-size:.72rem;padding:6px 7px}.demo-doc-footer{flex-direction:column;align-items:stretch}.demo-doc-footer button{width:100%}}
</style>
