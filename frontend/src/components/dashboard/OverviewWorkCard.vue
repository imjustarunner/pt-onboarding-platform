<template>
  <NoteAidWorkQueuePanel class="overview-work" :items="items" :loading="loading" :error="error"
    :allow-add="auth.user?.role === 'super_admin'" openable @open-work="openWorkspace" :collapsible="false" :allow-remove="false" :show-cosign-mode="isSupervisor" :cosign-items="cosigns"
    @select="open" @select-cosign="openCosign" @add-todo="openWorkspace" @refresh-cosign="load" />
</template>
<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import NoteAidWorkQueuePanel from '../clinical/NoteAidWorkQueuePanel.vue';
import { useNoteAidWorkQueue } from '../../composables/useNoteAidWorkQueue.js';
import { fetchWorkQueueFromApi } from '../../utils/noteAidWorkQueue.js';
import { normalizeCosignQueueItems } from '../../utils/noteAidCosignQueue.js';
import { navigateToNoteAid } from '../../utils/noteAidLaunch.js';
const auth = useAuthStore(), router = useRouter(), route = useRoute();
const items = useNoteAidWorkQueue(() => auth.user?.id);
const loading = ref(false), error = ref(''), cosigns = ref([]), isSupervisor = ref(false);
async function load() {
  if (!auth.user?.id) return;
  loading.value = true; error.value = '';
  try {
    const [, response] = await Promise.all([fetchWorkQueueFromApi(auth.user.id), api.get('/me/notes-to-sign', { skipGlobalLoading: true })]);
    cosigns.value = normalizeCosignQueueItems(response.data?.notes);
    isSupervisor.value = !!response.data?.isSupervisor || cosigns.value.length > 0;
  } catch { error.value = 'Could not load all work. Open Note Workspace to retry.'; }
  finally { loading.value = false; }
}
function launch(query = {}) { return navigateToNoteAid(router, query, { organizationSlug: route.params.organizationSlug }); }
function open(item) { return launch({ workQueueId: item.id, agencyId: item.agencyId, launchIntent: 'work_queue' }); }
function openCosign(item) { return launch({ noteId: item.clinicalNoteId, agencyId: item.agencyId, launchIntent: 'cosign' }); }
function openWorkspace() { return launch({ launchIntent: 'work_queue' }); }
onMounted(load);
watch(() => auth.user?.id, load);
</script>
<style scoped>
.overview-work { width: 100%; min-width: 0; height: auto; overflow: hidden; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; }
.overview-work :deep(.na-wq-list) { flex: 0 1 auto; max-height: 370px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.overview-work :deep(.na-wq-item-btn) { min-height: 64px; }
</style>
