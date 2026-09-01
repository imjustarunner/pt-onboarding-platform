import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../services/api';
import { buildNoteAidQuery, navigateToNoteAid, toDateOfService } from '../utils/noteAidLaunch.js';

/**
 * Bootstrap clinical session + navigate to Note Aid for a medical-record row.
 */
export function useClientEncounterNote() {
  const router = useRouter();
  const route = useRoute();
  const openingId = ref(null);

  async function openClinicalNote({ agencyId, clientId, row }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return;

    const organizationSlug = typeof route.params?.organizationSlug === 'string'
      ? route.params.organizationSlug
      : '';
    const baseCtx = {
      clientId: cid,
      serviceCode: String(row?.service_code || '').trim(),
      noteType: 'PROGRESS_NOTE',
      templateVersion: 'v1',
      launchIntent: 'progress_note',
      dateOfService: toDateOfService(row?.service_date || row?.date_of_service),
      officeEventId: Number(row?.office_event_id || 0) || undefined,
      clinicalSessionId: Number(row?.clinical_session_id || 0) || undefined
    };
    const rowKey = String(row?.record_key || row?.id || '');
    const encounterId = Number(
      row?.billing_encounter_id
      || (row?.source === 'billing' ? row?.id : 0)
      || 0
    );

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

    if (Number(row?.clinical_session_id || 0) > 0 || Number(row?.office_event_id || 0) > 0) {
      openingId.value = rowKey;
      try {
        await navigateToNoteAid(router, baseCtx, { organizationSlug });
      } catch (e) {
        window.alert(e.response?.data?.error?.message || e.message || 'Failed to open clinical note');
      } finally {
        openingId.value = null;
      }
      return;
    }

    if (!encounterId) {
      window.alert('This session is not ready to open in Note Aid yet.');
      return;
    }

    openingId.value = rowKey || encounterId;
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
