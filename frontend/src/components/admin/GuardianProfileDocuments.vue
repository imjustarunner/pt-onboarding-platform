<template>
  <section class="guardian-documents" aria-label="Guardian documents">
    <header>
      <h2>Documents</h2>
      <p>Choose who the document belongs to and what the guardian needs to complete.</p>
    </header>
    <div class="document-destinations">
      <section class="document-destination">
        <h3>Linked client</h3>
        <p>Share a form, request enrollment information, or send a document for this guardian to sign for a client.</p>
        <label v-if="clients.length">Client
          <select v-model.number="selectedId">
            <option v-for="client in clients" :key="client.client_id" :value="client.client_id">
              {{ client.full_name || client.initials || 'Client' }}{{ client.agency_name ? ' · ' + client.agency_name : '' }}
            </option>
          </select>
        </label>
        <p v-else-if="!loading">Link a client to use their portal documents.</p>
        <button v-if="client" type="button" class="btn btn-primary" @click="requestOpen = true">Assign or request documents</button>
      </section>
      <section class="document-destination">
        <h3>Guardian’s account</h3>
        <p>Manage forms that this guardian reviews or signs for themselves.</p>
        <button v-if="accountDocumentsAllowed" class="btn btn-secondary" type="button" :aria-expanded="accountOpen" @click="accountOpen = !accountOpen">
          {{ accountOpen ? 'Hide account documents' : 'Manage account documents' }}
        </button>
        <p v-else>Account document assignments require document-management access.</p>
      </section>
    </div>
    <p v-if="loading" role="status">Loading linked clients…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <UserDocumentsTab v-if="accountOpen && accountDocumentsAllowed"
      :user-id="guardianId" :user-display-name="guardianName" user-role-label="Guardian" guardian-account />
    <ClientUpdateModal v-if="requestOpen && client"
      open :client-id="client.client_id" :agency-id="client.agency_id"
      :client-name="client.full_name || client.initials" :agency-name="client.agency_name"
      :guardian-name="guardianName" :recipient-guardian-id="guardianId" :clinical-mode="clinicalMode"
      @close="requestOpen = false" @sent="requestOpen = false" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import UserDocumentsTab from './UserDocumentsTab.vue';
import ClientUpdateModal from './ClientUpdateModal.vue';

const props = defineProps({
  guardianId: { type: Number, required: true },
  guardianName: String,
  clients: { type: Array, default: () => [] },
  loading: Boolean,
  error: String,
  accountDocumentsAllowed: Boolean,
  clinicalMode: String
});

const selectedId = ref(0);
const accountOpen = ref(false);
const requestOpen = ref(false);
const client = computed(() => props.clients.find(row => Number(row.client_id) === Number(selectedId.value)));
watch(() => props.clients, () => {
  if (!client.value) selectedId.value = Number(props.clients[0]?.client_id || 0);
}, { immediate: true });
watch(() => [props.guardianId, selectedId.value], () => { requestOpen.value = false; });
</script>

<style scoped>
.guardian-documents { max-width: 72rem; margin: 0 auto; }
.guardian-documents header { margin-bottom: 16px; }
.guardian-documents h2, .document-destination h3 { margin: 0 0 6px; color: var(--text-primary, #19334d); }
.guardian-documents p { margin: 0 0 14px; color: var(--text-secondary, #53677d); line-height: 1.5; }
.document-destinations { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 16px; margin-bottom: 20px; }
.document-destination { padding: 18px; border: 1px solid var(--border, #d8e2ed); border-radius: 12px; background: var(--bg-card, #fff); }
.document-destination label { display: grid; gap: 5px; margin-bottom: 12px; font-weight: 600; }
.document-destination select { min-width: 0; padding: 8px; font: inherit; color: inherit; background: var(--bg-card, #fff); border: 1px solid var(--border, #d8e2ed); border-radius: 6px; }
</style>
