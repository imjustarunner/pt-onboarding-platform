import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../services/api';

/**
 * Bootstrap clinical session + navigate to Note Aid for a billing encounter row.
 */
export function useClientEncounterNote() {
  const router = useRouter();
  const openingId = ref(null);

  async function openClinicalNote({ agencyId, clientId, row }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    const encounterId = Number(row?.id || 0);
    if (!aid || !encounterId || !cid) return;

    if (Number(row?.clinical_note_id || 0) > 0) {
      const sessionId = Number(row?.clinical_session_id || 0);
      router.push({
        name: 'ClinicalNoteGenerator',
        query: {
          clinicalSessionId: sessionId ? String(sessionId) : undefined,
          clientId: String(cid),
          serviceCode: String(row?.service_code || '').trim(),
          noteType: 'PROGRESS_NOTE'
        }
      }).catch(() => {});
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
      const query = {
        clinicalSessionId: String(sessionId),
        clientId: String(cid),
        serviceCode: String(row?.service_code || '').trim(),
        noteType: 'PROGRESS_NOTE'
      };
      router.push({ name: 'ClinicalNoteGenerator', query }).catch(() => {
        router.push({ path: '/admin/clinical-note-generator', query }).catch(() => {});
      });
    } catch (e) {
      window.alert(e.response?.data?.error?.message || e.message || 'Failed to open clinical note');
    } finally {
      openingId.value = null;
    }
  }

  return { openingId, openClinicalNote };
}
