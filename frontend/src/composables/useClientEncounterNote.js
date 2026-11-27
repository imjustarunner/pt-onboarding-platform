import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { buildNoteAidQuery, navigateToNoteAid, toDateOfService } from '../utils/noteAidLaunch.js';

/**
 * Bootstrap clinical session + navigate to Note Workspace for a medical-record row.
 */
export function useClientEncounterNote() {
  const router = useRouter();
  const route = useRoute();
  const auth = useAuthStore();
  const openingId = ref(null);

  async function openClinicalNote({ agencyId, clientId, row, verifyAppointment = false }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return;

    const organizationSlug = typeof route.params?.organizationSlug === 'string'
      ? route.params.organizationSlug
      : '';
    const baseCtx = {
      agencyId: aid,
      clientId: cid,
      serviceCode: String(row?.service_code || '').trim(),
      noteType: 'PROGRESS_NOTE',
      templateVersion: 'v1',
      launchIntent: 'progress_note',
      dateOfService: toDateOfService(row?.service_date || row?.date_of_service),
      officeEventId: Number(row?.office_event_id || 0) || undefined,
      appointmentId: Number(row?.appointment_id) || undefined,
      billingEncounterId: Number(row?.billing_encounter_id) || undefined,
      clinicalSessionId: Number(row?.clinical_session_id || 0) || undefined
    };
    const rowKey = String(row?.record_key || (row?.id != null ? `id:${row.id}` : ''));
    const encounterId = Number(
      row?.billing_encounter_id
      || (row?.source === 'billing' ? row?.id : 0)
      || 0
    );

    if (row?.note_kind === 'h0002_screening' && row.note_status !== 'signed') {
      await navigateToNoteAid(router, { agencyId: aid, clinicalSessionId: row.clinical_session_id, launchIntent: 'h0002_review' }, { organizationSlug });
      return;
    }

    if (row?.draft_id && row.note_status !== 'signed') {
      return navigateToNoteAid(router, { ...baseCtx, draftId: row.draft_id }, { organizationSlug });
    }

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

    if (verifyAppointment && (baseCtx.clinicalSessionId || baseCtx.appointmentId || baseCtx.officeEventId)) {
      openingId.value = rowKey;
      try {
        const { data } = await api.get('/clinical-data/documentation-queue', {
          params: { agencyId: aid, clientId: cid, providerUserId: auth.user?.id, clinicalSessionId: baseCtx.clinicalSessionId,
            fromDos: baseCtx.clinicalSessionId ? undefined : baseCtx.dateOfService,
            toDos: baseCtx.clinicalSessionId ? undefined : baseCtx.dateOfService,
            actualSessionsOnly: 1, noteStatus: 'all' },
          skipGlobalLoading: true
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        const found = items.find(item =>
          Number(item.clientId) === cid && Number(item.clinicalSessionId) > 0
          && (!baseCtx.clinicalSessionId || Number(item.clinicalSessionId) === baseCtx.clinicalSessionId)
          && (!baseCtx.appointmentId || Number(item.appointmentId) === baseCtx.appointmentId)
          && (!baseCtx.officeEventId || Number(item.officeEventId) === baseCtx.officeEventId));
        if (!found) throw new Error('This appointment could not be verified for documentation. Open the assigned appointment from the schedule.');
        return await navigateToNoteAid(router, {
          ...baseCtx, agencyId: aid, clinicalSessionId: found.clinicalSessionId,
          draftId: found.noteStatus === 'signed' ? undefined : found.draftId || undefined,
          noteId: found.noteStatus === 'signed' ? found.clinicalNoteId || undefined : undefined
        }, { organizationSlug });
      } finally {
        openingId.value = null;
      }
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
      if (verifyAppointment) throw new Error('Open the assigned appointment from the schedule to document this visit.');
      window.alert('This session is not ready to open in Note Workspace yet.');
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
      if (verifyAppointment) throw e;
      window.alert(e.response?.data?.error?.message || e.message || 'Failed to open clinical note');
    } finally {
      openingId.value = null;
    }
  }

  return { openingId, openClinicalNote, buildNoteAidQuery };
}
