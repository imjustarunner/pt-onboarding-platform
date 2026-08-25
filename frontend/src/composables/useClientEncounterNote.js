import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../services/api';
import { buildNoteAidQuery, navigateToNoteAid, toDateOfService } from '../utils/noteAidLaunch.js';

/**
 * Bootstrap clinical session + navigate to Note Aid for a billing encounter row.
 */
export function useClientEncounterNote() {
  const router = useRouter();
  const route = useRoute();
  const openingId = ref(null);

  async function openClinicalNote({ agencyId, clientId, row }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    const encounterId = Number(row?.id || 0);
    if (!aid || !encounterId || !cid) return;

    const organizationSlug = typeof route.params?.organizationSlug === 'string'
      ? route.params.organizationSlug
      : '';
    const baseCtx = {
      clientId: cid,
      serviceCode: String(row?.service_code || '').trim(),
      noteType: 'PROGRESS_NOTE',
      templateVersion: 'v1',
      launchIntent: 'progress_note',
      dateOfService: toDateOfService(row?.service_date || row?.date_of_service)
    };

    if (Number(row?.clinical_note_id || 0) > 0) {
      const sessionId = Number(row?.clinical_session_id || 0);
      await navigateToNoteAid(
        router,
        {
          ...baseCtx,
          clinicalSessionId: sessionId || undefined,
          noteId: Number(row.clinical_note_id)
        },
        { organizationSlug }
      );
      return;
    }

    openingId.value = encounterId;
    try {
      let sessionId = Number(row?.clinical_session_id || 0);
      if (!sessionId) {
        const r = await api.post(`/billing-reports/encounters/${encounterId}/clinical-session`, {
          agencyId: aid
        });
        sessionId = Number(r.data?.clinicalSessionId || 0);
      }
      if (!sessionId) {
        window.alert('Unable to open clinical session for this billing line.');
        return;
      }
      await navigateToNoteAid(
        router,
        {
          ...baseCtx,
          clinicalSessionId: sessionId
        },
        { organizationSlug }
      );
    } catch (e) {
      window.alert(e.response?.data?.error?.message || e.message || 'Failed to open clinical note');
    } finally {
      openingId.value = null;
    }
  }

  return { openingId, openClinicalNote, buildNoteAidQuery };
}
