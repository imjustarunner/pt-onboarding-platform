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
    clientFacingReason: '',
    followUpAction: 'client_contact_support',
    followUpMessage: '',
    notificationMode: 'send',
    suppressionReason: '',
    offeredSlots: [],
    pendingOfficeRequests: [],
    offerDays: 2,
    outreach: [],
    reasonKnown: null,
    replacementAppointmentId: null,
    waiver: { action: 'no', reason: '', comment: '' },
    additionalComments: '',
    useSchoolSupportHour: false
  });
  const schoolSupport = ref(null);
  const schoolSupportLoading = ref(false);
  const schoolSupportError = ref('');
  let supportLoadVersion = 0;
  const preview = ref(null);
  const workflow = ref(null);
  const signatureConfirmed = ref(false);
  const draftLoaded = ref(false);
  const replacements = ref([]);
  const replacementOptions = ref(null);
  const optionsLoading = ref(false);
  const customOffer = reactive({localStart:'',modality:'',roomId:null,rooms:[],busy:false,error:'',requiresOfficeRequest:false});
  const retrospective = computed(() => replacementOptions.value?.retrospective === true);

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
    facts.clientFacingReason = '';
    facts.followUpAction = 'client_contact_support';
    facts.followUpMessage = '';
    facts.notificationMode = 'send'; facts.suppressionReason = ''; facts.offeredSlots = []; facts.pendingOfficeRequests = []; facts.offerDays = 2;
    replacementOptions.value = null; Object.assign(customOffer,{localStart:'',modality:'',roomId:null,rooms:[],busy:false,error:'',requiresOfficeRequest:false});
    facts.outreach = [];
    facts.reasonKnown = null;
    facts.replacementAppointmentId = null;
    facts.waiver = { action: 'no', reason: '', comment: '' };
    facts.additionalComments = '';
    facts.useSchoolSupportHour = false;
    supportLoadVersion += 1;
    schoolSupport.value = null;
    schoolSupportLoading.value = false;
    schoolSupportError.value = '';
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
        await refreshSchoolSupport();
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
      clientFacingReason: facts.clientFacingReason || null,
      followUpAction: retrospective.value ? 'none' : facts.followUpAction || 'client_contact_support',
      followUpMessage: facts.followUpMessage || null,
      notificationMode: retrospective.value ? 'none' : facts.notificationMode,
      suppressionReason: retrospective.value ? 'Retrospective record correction.' : facts.notificationMode === 'none' ? facts.suppressionReason : null,
      offeredSlots: facts.followUpAction === 'private_slots' ? facts.offeredSlots : [],
      offerDays: facts.offerDays, pendingOfficeRequests: facts.pendingOfficeRequests,
      outreach: [...facts.outreach],
      reasonKnown: facts.reasonKnown,
      clientId: context.clientId || null,
      replacementAppointmentId: facts.replacementAppointmentId || null,
      waiver,
      additionalComments: facts.additionalComments || null,
      useSchoolSupportHour: facts.useSchoolSupportHour === true
    };
  }

  async function refreshSchoolSupport() {
    const version = ++supportLoadVersion;
    const id = appointmentId.value;
    schoolSupportError.value = '';
    if (!id || !['canceled', 'no_show'].includes(facts.eventType)) {
      schoolSupport.value = null;
      schoolSupportLoading.value = false;
      facts.useSchoolSupportHour = false;
      return;
    }
    schoolSupportLoading.value = true;
    try {
      const {data} = await api.get(`/appointments/${id}/change/school-support`, {
        params: {eventType: facts.eventType, clientId: context.clientId || undefined}, skipGlobalLoading: true
      });
      if (version !== supportLoadVersion) return;
      schoolSupport.value = data;
    } catch {
      if (version !== supportLoadVersion) return;
      schoolSupport.value = null;
      schoolSupportError.value = 'Could not check your school support balance. Retry to use an hour, or continue without using one.';
    } finally {
      if (version === supportLoadVersion) schoolSupportLoading.value = false;
    }
  }

  function supportSelectionValid() {
    return !facts.useSchoolSupportHour || (!schoolSupportLoading.value && !schoolSupportError.value && schoolSupport.value?.canRequest);
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
      await refreshSchoolSupport();
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
      if (!retrospective.value && ['canceled', 'rescheduled'].includes(facts.eventType) && !String(facts.clientFacingReason || '').trim()) return false;
      if (facts.followUpAction === 'replacement_booked' && !Number(facts.replacementAppointmentId)) return false;
      if (!retrospective.value && facts.notificationMode === 'none' && !facts.suppressionReason.trim()) return false;
      if (!retrospective.value && ['private_slots', 'portal_booking'].includes(facts.followUpAction)) {
        if (facts.eventType !== 'canceled' || facts.notificationMode === 'none') return false;
        if (facts.followUpAction === 'private_slots' && (!facts.offeredSlots.length || facts.offeredSlots.length > 6)) return false;
        if (facts.followUpAction === 'portal_booking' && (!replacementOptions.value?.portalBookingEnabled || !replacementOptions.value?.slots?.length)) return false;
      }
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
      if (!supportSelectionValid()) return false;
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
    if (step.value === 3 && !supportSelectionValid()) {
      error.value = 'Your available support hours changed. Review the selection before signing.';
      return;
    }
    if (step.value < 4) step.value += 1;
    if (step.value === 2) { await loadReplacements(); await loadReplacementOptions(false); }
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
      await refreshSchoolSupport();
      return r.data;
    } catch (e) {
      await refreshSchoolSupport();
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
        && ['scheduled', 'confirmed', 'client_confirmed'].includes(a.status)).map((a) => {
        const raw = String(a.startAt || '');
        const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
        return { id: a.id, label: `${date.toLocaleString([], { timeZone: a.sourceTimezone || 'America/Denver', dateStyle: 'medium', timeStyle: 'short' })} — ${a.title || 'Session'}` };
      });
    } catch (e) { error.value = e.response?.data?.error?.message || 'Could not load replacement appointments.'; }
  }

  function toggleOfferSlot(slot) {
    const index=facts.offeredSlots.findIndex(s=>s.key===slot.key);
    if(index>=0) facts.offeredSlots.splice(index,1);
    else addOfferSlot(slot);
  }
  function addOfferSlot(slot) {
    const index=facts.offeredSlots.findIndex(s=>s.startAt===slot.startAt && s.endAt===slot.endAt);
    if(index>=0) facts.offeredSlots.splice(index,1,slot);
    else if(facts.offeredSlots.length<6) facts.offeredSlots.push(slot);
  }
  async function requestOfferOffice() {
    if(customOffer.busy)return;
    const room=customOffer.rooms.find(r=>r.id===Number(customOffer.roomId)&&r.needsRequest);
    if(!room)return;
    customOffer.busy=true;customOffer.error='';const id=appointmentId.value;
    try {
      const {data}=await api.post(`/appointments/${id}/change/replacement-options/office-request`,{localStart:customOffer.localStart,modality:customOffer.modality,roomId:room.id,confirmOneTime:true},{skipGlobalLoading:true});
      if(id!==appointmentId.value || !open.value)return;
      facts.pendingOfficeRequests.push({requestId:data.id,localStart:customOffer.localStart,modality:customOffer.modality,roomId:room.id,label:room.label,windowLabel:room.windowLabel});
      customOffer.requiresOfficeRequest=false;customOffer.roomId=null;customOffer.rooms=[];
      await saveDraft();
    }catch(e){if(id===appointmentId.value)customOffer.error=e.response?.data?.error?.message||'Could not submit the one-time room request.';}
    finally{customOffer.busy=false;}
  }
  async function addCustomOffer() {
    if(customOffer.busy || facts.offeredSlots.length>=6) return;
    if(!customOffer.modality) { customOffer.error='Choose in office, virtual, or both for this time.'; return; }
    customOffer.busy=true;customOffer.error='';const id=appointmentId.value;
    try {
      const {data}=await api.post(`/appointments/${id}/change/replacement-options/check`,{localStart:customOffer.localStart,roomId:customOffer.roomId,modality:customOffer.modality},{skipGlobalLoading:true});
      if(id!==appointmentId.value || !open.value) return;
      customOffer.rooms=data.rooms||[]; customOffer.requiresOfficeRequest=!!data.requiresOfficeRequest;
      if(data.slot) addOfferSlot(data.slot);
      if(!data.slot && !customOffer.rooms.length) customOffer.error='No available rooms cover this time. Choose another day or time.';
    }catch(e){if(id===appointmentId.value)customOffer.error=e.response?.data?.error?.message||'Could not check this time.';}
    finally{customOffer.busy=false;}
  }
  async function loadReplacementOptions(includeSlots = true) {
    if (!['canceled', 'rescheduled'].includes(facts.eventType)) return;
    const id = appointmentId.value;
    optionsLoading.value = true;
    try {
      const { data } = await api.get(`/appointments/${id}/change/replacement-options`, { params: { slots: String(includeSlots) }, skipGlobalLoading: true });
      if (appointmentId.value === id && open.value) replacementOptions.value = data;
    } catch (e) { error.value = e.response?.data?.error?.message || 'Could not check the next appointment and replacement openings.'; }
    finally { optionsLoading.value = false; }
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

  async function retryNotification(deliveryId) {
    saving.value = true; error.value = '';
    try {
      const { data } = await api.post(`/appointments/${appointmentId.value}/cancellation-notifications/${deliveryId}/retry`, {}, { skipGlobalLoading: true });
      if (workflow.value?.result) workflow.value.result.notificationDelivery = data.notificationDelivery;
    } catch (e) { error.value = e.response?.data?.error?.message || 'Could not retry this notification. Check its delivery record before contacting the client again.'; }
    finally { saving.value = false; }
  }

  return {
    open,
    schoolSupport, schoolSupportLoading, schoolSupportError, refreshSchoolSupport,
    workflow,
    replacements,
    replacementOptions, retrospective, customOffer, toggleOfferSlot, addCustomOffer, requestOfferOffice,
    optionsLoading,
    loadReplacementOptions,
    signatureConfirmed,
    saveDraft,
    retryNotification,
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
