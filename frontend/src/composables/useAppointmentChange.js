import { computed, reactive, ref } from 'vue';
import api from '../services/api.js';
import { assembleLocalNarrative } from '../utils/appointmentChangeNarrative.js';

export function useAppointmentChange() {
  const open = ref(false);
  const step = ref(1);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  const appointmentId = ref(null);
  const context = reactive({
    clientName: '',
    clientId: null,
    clientCode: '',
    serviceLabel: '',
    whenLabel: '',
    providerName: '',
    payerLabel: ''
  });
  const facts = reactive({
    eventType: '',
    initiator: '',
    reasons: [],
    reasonOther: '',
    outreach: [],
    reasonKnown: null,
    replacementAppointmentId: null,
    waiver: { action: 'no', reason: '', comment: '' },
    additionalComments: ''
  });
  const preview = ref(null);
  const workflow = ref(null);
  const signatureConfirmed = ref(false);
  const draftLoaded = ref(false);
  const replacements = ref([]);

  const localNarrative = computed(() => {
    if (workflow.value?.status === 'completed') return workflow.value.narrative;
    if (preview.value?.narrative) return preview.value.narrative;
    return assembleLocalNarrative({
      eventType: facts.eventType,
      initiator: facts.initiator,
      reasons: facts.reasons,
      reasonOther: facts.reasonOther,
      outreach: facts.outreach,
      classification: preview.value?.classification,
      nextAppointment: preview.value?.nextAppointment,
      consequence: preview.value?.consequence,
      strike: preview.value?.strike,
      waiver: facts.waiver?.action && facts.waiver.action !== 'no' ? facts.waiver : null,
      additionalComments: facts.additionalComments
    });
  });

  function resetFacts() {
    facts.eventType = '';
    facts.initiator = '';
    facts.reasons = [];
    facts.reasonOther = '';
    facts.outreach = [];
    facts.reasonKnown = null;
    facts.replacementAppointmentId = null;
    facts.waiver = { action: 'no', reason: '', comment: '' };
    facts.additionalComments = '';
    preview.value = null;
    workflow.value = null;
    signatureConfirmed.value = false;
    draftLoaded.value = false;
    replacements.value = [];
    error.value = '';
    step.value = 1;
  }

  async function openWizard({ appointmentId: id, context: ctx = {} } = {}) {
    appointmentId.value = Number(id || 0) || null;
    Object.assign(context, {
      clientName: ctx.clientName || '',
      clientId: ctx.clientId || null,
      clientCode: ctx.clientCode || '',
      serviceLabel: ctx.serviceLabel || '',
      whenLabel: ctx.whenLabel || '',
      providerName: ctx.providerName || '',
      payerLabel: ctx.payerLabel || ''
    });
    resetFacts();
    open.value = true;
    loading.value = true;
    try {
      const r = await api.get(`/appointments/${appointmentId.value}/change`, { skipGlobalLoading: true });
      workflow.value = r.data?.workflow || null;
      draftLoaded.value = true;
      if (workflow.value) {
        Object.assign(facts, workflow.value.facts);
        if (!facts.waiver) facts.waiver = { action: 'no', reason: '', comment: '' };
        if (workflow.value.facts?.clientId) context.clientId = workflow.value.facts.clientId;
        preview.value = workflow.value.preview;
        step.value = workflow.value.status === 'draft' ? 1 : 4;
      }
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Could not load the saved appointment change. Reopen to try again.';
    } finally { loading.value = false; }
  }

  function closeWizard() {
    open.value = false;
    resetFacts();
    appointmentId.value = null;
  }

  function toggleReason(id) {
    const i = facts.reasons.indexOf(id);
    if (i >= 0) facts.reasons.splice(i, 1);
    else facts.reasons.push(id);
  }

  function toggleOutreach(id) {
    if (id === 'not_required') {
      facts.outreach = facts.outreach.includes('not_required') ? [] : ['not_required'];
      return;
    }
    facts.outreach = facts.outreach.filter((x) => x !== 'not_required');
    const i = facts.outreach.indexOf(id);
    if (i >= 0) facts.outreach.splice(i, 1);
    else facts.outreach.push(id);
  }

  function buildPayload() {
    const waiver =
      facts.waiver?.action && facts.waiver.action !== 'no'
        ? {
            action: facts.waiver.action,
            reason: facts.waiver.reason || null,
            comment: facts.waiver.comment || null
          }
        : null;
    return {
      eventType: facts.eventType,
      initiator: facts.initiator || null,
      reasons: [...facts.reasons],
      reasonOther: facts.reasonOther || null,
      outreach: [...facts.outreach],
      reasonKnown: facts.reasonKnown,
      clientId: context.clientId || null,
      replacementAppointmentId: facts.replacementAppointmentId || null,
      waiver,
      additionalComments: facts.additionalComments || null
    };
  }

  async function refreshPreview() {
    if (!appointmentId.value || !facts.eventType) return null;
    loading.value = true;
    error.value = '';
    try {
      const r = await api.post(
        `/appointments/${appointmentId.value}/change/preview`,
        buildPayload(),
        { skipGlobalLoading: true }
      );
      preview.value = r.data?.preview || null;
      if (preview.value?.appointment) {
        if (!context.whenLabel && preview.value.appointment.displayWhen) {
          context.whenLabel = preview.value.appointment.displayWhen;
        }
        if (!context.providerName && preview.value.appointment.providerName) {
          context.providerName = preview.value.appointment.providerName;
        }
        if (!context.clientId && preview.value.appointment.clientId) {
          context.clientId = preview.value.appointment.clientId;
        }
        if (!context.payerLabel && preview.value.payer?.insuranceType) {
          context.payerLabel = preview.value.payer.insuranceType;
        }
      }
      return preview.value;
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to preview';
      return null;
    } finally {
      loading.value = false;
    }
  }

  function canContinueFromStep(n) {
    if (!draftLoaded.value) return false;
    if (n === 1) return !!facts.eventType;
    if (n === 2) {
      if (facts.eventType === 'void') return !!String(facts.reasonOther || '').trim();
      if (facts.eventType === 'rescheduled' && !Number(facts.replacementAppointmentId)) return false;
      if (facts.eventType === 'no_show') {
        if (!facts.outreach.length) return false;
        if (facts.reasonKnown === true && !facts.reasons.length) return false;
        if (facts.reasons.includes('other') && !String(facts.reasonOther || '').trim()) return false;
        return facts.reasonKnown === true || facts.reasonKnown === false;
      }
      if (!facts.initiator) return false;
      if (!facts.reasons.length) return false;
      if (facts.reasons.includes('other') && !String(facts.reasonOther || '').trim()) return false;
      return true;
    }
    if (n === 3) {
      const w = facts.waiver?.action;
      if (w === 'recommend' || w === 'waive' || w === 'recommend_waive_termination') {
        return !!facts.waiver.reason;
      }
      return true;
    }
    return true;
  }

  async function goNext() {
    if (!canContinueFromStep(step.value)) {
      error.value = 'Please complete the required selections.';
      return;
    }
    error.value = '';
    if (!(await refreshPreview())) return;
    if (step.value < 4) step.value += 1;
    if (step.value === 2) await loadReplacements();
  }

  function goBack() {
    error.value = '';
    if (step.value > 1) step.value -= 1;
  }

  async function complete() {
    if (!appointmentId.value || !draftLoaded.value || !signatureConfirmed.value) return null;
    saving.value = true;
    error.value = '';
    try {
      const r = await api.post(
        `/appointments/${appointmentId.value}/change/complete`,
        { ...buildPayload(), signatureConfirmed: signatureConfirmed.value },
        { skipGlobalLoading: true }
      );
      return r.data;
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to complete';
      // A failed response may follow a persisted signature. Resume those exact facts.
      try {
        const saved = await api.get(`/appointments/${appointmentId.value}/change`, { skipGlobalLoading: true });
        if (saved.data?.workflow && saved.data.workflow.status !== 'draft') {
          workflow.value = saved.data.workflow;
          Object.assign(facts, workflow.value.facts);
          if (!facts.waiver) facts.waiver = { action: 'no', reason: '', comment: '' };
          preview.value = workflow.value.preview;
          signatureConfirmed.value = false;
        }
      } catch { /* Keep the original completion error visible. */ }
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function loadReplacements() {
    const appointment = preview.value?.appointment;
    if (!appointment?.agencyId || !context.clientId || !['canceled', 'rescheduled'].includes(facts.eventType)) return;
    try {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() + 1);
      const response = await api.get('/appointments', { params: { agencyId: appointment.agencyId, clientId: context.clientId,
        windowStart: start, windowEnd: end.toISOString().slice(0, 10) }, skipGlobalLoading: true });
      replacements.value = (response.data?.appointments || []).filter((a) => Number(a.id) !== appointmentId.value
        && ['scheduled', 'confirmed', 'client_confirmed', 'draft'].includes(a.status)).map((a) => {
        const raw = String(a.startAt || '');
        const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
        return { id: a.id, label: `${date.toLocaleString([], { timeZone: a.sourceTimezone || 'America/Denver', dateStyle: 'medium', timeStyle: 'short' })} — ${a.title || 'Session'}` };
      });
    } catch (e) { error.value = e.response?.data?.error?.message || 'Could not load replacement appointments.'; }
  }

  async function saveDraft() {
    if (!appointmentId.value || !draftLoaded.value) return false;
    saving.value = true;
    error.value = '';
    try {
      await api.put(`/appointments/${appointmentId.value}/change/draft`, buildPayload(), { skipGlobalLoading: true });
      return true;
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Could not save the draft';
      return false;
    } finally { saving.value = false; }
  }

  return {
    open,
    workflow,
    replacements,
    signatureConfirmed,
    saveDraft,
    step,
    loading,
    saving,
    error,
    appointmentId,
    context,
    facts,
    preview,
    localNarrative,
    openWizard,
    closeWizard,
    toggleReason,
    toggleOutreach,
    refreshPreview,
    canContinueFromStep,
    goNext,
    goBack,
    complete
  };
}
