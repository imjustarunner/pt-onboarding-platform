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

  const localNarrative = computed(() => {
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
    error.value = '';
    step.value = 1;
  }

  function openWizard({ appointmentId: id, context: ctx = {} } = {}) {
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
    if (n === 1) return !!facts.eventType;
    if (n === 2) {
      if (facts.eventType === 'void') return true;
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
    if (step.value === 1 || step.value === 2) {
      await refreshPreview();
    }
    if (step.value === 2) {
      await refreshPreview();
    }
    if (step.value < 4) step.value += 1;
    if (step.value === 3 || step.value === 4) {
      await refreshPreview();
    }
  }

  function goBack() {
    error.value = '';
    if (step.value > 1) step.value -= 1;
  }

  async function complete() {
    if (!appointmentId.value) return null;
    saving.value = true;
    error.value = '';
    try {
      const r = await api.post(
        `/appointments/${appointmentId.value}/change/complete`,
        buildPayload(),
        { skipGlobalLoading: true }
      );
      return r.data;
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to complete';
      return null;
    } finally {
      saving.value = false;
    }
  }

  return {
    open,
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
