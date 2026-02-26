import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';

export function useTicketingQueue() {
  const route = useRoute();
  const router = useRouter();
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();

  const myUserId = authStore.user?.id || null;
  const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
  const isSuperAdmin = computed(() => roleNorm.value === 'super_admin');
  const canAssignOthers = computed(
    () =>
      roleNorm.value === 'admin' ||
      roleNorm.value === 'support' ||
      roleNorm.value === 'super_admin' ||
      roleNorm.value === 'clinical_practice_assistant' ||
      roleNorm.value === 'provider_plus'
  );
  const claimLabel = computed(() =>
    roleNorm.value === 'school_staff' || roleNorm.value === 'staff' ? 'Assign to me' : 'Claim'
  );

  const tickets = ref([]);
  const loading = ref(false);
  const error = ref('');
  const ready = ref(false);

  const agencyIdInput = ref('');
  const schoolIdInput = ref('');
  const schoolFilterOptions = ref([]);
  const status = ref('');
  const sourceChannel = ref('');
  const draftState = ref('');
  const sentState = ref('');
  const viewMode = ref('all');
  const searchInput = ref('');

  const openAnswerId = ref(null);
  const answerText = ref('');
  const submitting = ref(false);
  const generatingResponse = ref(false);
  const reviewingDraftId = ref(null);
  const markingSentId = ref(null);
  const answerError = ref('');
  const claimingId = ref(null);
  const unclaimingId = ref(null);
  const convertingFaqId = ref(null);
  const assignees = ref([]);
  const assigneeByTicket = ref({});
  const assigningId = ref(null);
  const confirmOpen = ref(false);
  const confirmAction = ref('');
  const confirmTicket = ref(null);
  const confirmInput = ref('');
  const threadOpen = ref(false);
  const threadTicket = ref(null);
  const threadMessages = ref([]);
  const threadLoading = ref(false);
  const threadError = ref('');
  const threadBody = ref('');
  const threadSending = ref(false);
  const adminSelectedClient = ref(null);
  const adminClientLoading = ref(false);
  const clientLabelMode = ref('codes');
  const showAssignByTicketId = ref({});
  const autoClaimedTicketId = ref(null);

  const confirmWord = computed(() => {
    if (confirmAction.value === 'assign') return 'ASSIGN';
    if (confirmAction.value === 'join') return 'JOIN';
    if (confirmAction.value === 'close') return 'CLOSE';
    return 'CONFIRM';
  });
  const confirmTitle = computed(() => {
    if (confirmAction.value === 'assign') return 'Re-assign ticket';
    if (confirmAction.value === 'join') return 'Join ticket';
    if (confirmAction.value === 'close') return 'Close ticket';
    return 'Confirm';
  });
  const confirmMessage = computed(() => {
    if (confirmAction.value === 'assign') return 'This will re-assign the ticket. Continue?';
    if (confirmAction.value === 'join') return 'You are about to join a ticket claimed by another team member.';
    if (confirmAction.value === 'close') return 'This will close the ticket.';
    return 'Please confirm.';
  });
  const confirmReady = computed(
    () => String(confirmInput.value || '').trim().toUpperCase() === confirmWord.value
  );

  const agencyFilterOptions = computed(() => {
    const list = isSuperAdmin.value
      ? agencyStore.agencies?.value || agencyStore.agencies || []
      : agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
    return (Array.isArray(list) ? list : []).filter(
      (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
    );
  });

  const parseDraftMetadata = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return {};
    }
  };

  const fetchSchoolsForAgency = async (agencyId) => {
    const aid = Number(agencyId);
    if (!Number.isFinite(aid) || aid < 1) {
      schoolFilterOptions.value = [];
      return;
    }
    try {
      const r = await api.get(`/agencies/${aid}/schools`);
      schoolFilterOptions.value = Array.isArray(r.data) ? r.data : [];
    } catch {
      schoolFilterOptions.value = [];
    }
  };

  watch(agencyIdInput, async (val) => {
    if (val) {
      await fetchSchoolsForAgency(val);
      const sid = Number(schoolIdInput.value);
      if (Number.isFinite(sid) && sid > 0) {
        const inList = (schoolFilterOptions.value || []).some((s) => Number(s?.id) === sid);
        if (!inList) schoolIdInput.value = '';
      }
    } else {
      schoolFilterOptions.value = [];
      schoolIdInput.value = '';
    }
  });

  const syncFromQuery = () => {
    const qAgency = route.query?.agencyId;
    if (qAgency !== undefined && qAgency !== null && String(qAgency).trim() !== '') {
      const n = Number(qAgency);
      if (Number.isFinite(n) && n > 0) {
        agencyIdInput.value = String(n);
        fetchSchoolsForAgency(n);
      }
    }
    const qSchool = route.query?.schoolOrganizationId;
    if (qSchool !== undefined && qSchool !== null && String(qSchool).trim() !== '') {
      const n = Number(qSchool);
      if (Number.isFinite(n) && n > 0) schoolIdInput.value = String(n);
    }
    const qStatus = String(route.query?.status || '').trim().toLowerCase();
    if (qStatus === 'open' || qStatus === 'answered' || qStatus === 'closed') status.value = qStatus;
    const qSource = String(route.query?.sourceChannel || '').trim().toLowerCase();
    if (qSource === 'portal' || qSource === 'email') sourceChannel.value = qSource;
    const qDraftState = String(route.query?.draftState || '').trim().toLowerCase();
    if (['pending', 'accepted', 'edited', 'rejected', 'needs_review', 'none'].includes(qDraftState)) {
      draftState.value = qDraftState;
    }
    const qSentState = String(route.query?.sentState || '').trim().toLowerCase();
    if (qSentState === 'sent' || qSentState === 'unsent') sentState.value = qSentState;
    const qMine = String(route.query?.mine || '').trim().toLowerCase();
    viewMode.value = qMine === 'true' || qMine === '1' ? 'mine' : 'all';
    const qSearch = route.query?.q;
    if (qSearch !== undefined && qSearch !== null && String(qSearch).trim() !== '') {
      searchInput.value = String(qSearch).slice(0, 120);
    }
    const qTicketId = route.query?.ticketId;
    if (qTicketId !== undefined && qTicketId !== null && String(qTicketId).trim() !== '') {
      const n = Number(qTicketId);
      if (Number.isFinite(n) && n > 0) openAnswerId.value = n;
    }
  };

  const resolveAgencyId = () => {
    const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
    if (current?.id) return Number(current.id);
    const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
    return list?.[0]?.id ? Number(list[0].id) : null;
  };

  const loadAssignees = async () => {
    if (!canAssignOthers.value) return;
    try {
      await agencyStore.fetchUserAgencies();
      const agencyId = resolveAgencyId();
      if (!agencyId) return;
      const resp = await api.get('/support-tickets/assignees', { params: { agencyId } });
      assignees.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
    } catch {
      assignees.value = [];
    }
  };

  const pushQuery = () => {
    const q = { ...route.query };
    const aid = Number(agencyIdInput.value);
    if (Number.isFinite(aid) && aid > 0) q.agencyId = String(aid);
    else delete q.agencyId;
    const sid = Number(schoolIdInput.value);
    if (Number.isFinite(sid) && sid > 0) q.schoolOrganizationId = String(sid);
    else delete q.schoolOrganizationId;
    if (status.value) q.status = status.value;
    else delete q.status;
    if (sourceChannel.value) q.sourceChannel = sourceChannel.value;
    else delete q.sourceChannel;
    if (draftState.value) q.draftState = draftState.value;
    else delete q.draftState;
    if (sentState.value) q.sentState = sentState.value;
    else delete q.sentState;
    if (viewMode.value === 'mine') q.mine = 'true';
    else delete q.mine;
    if (searchInput.value && searchInput.value.trim()) q.q = searchInput.value.trim().slice(0, 120);
    else delete q.q;
    if (openAnswerId.value) q.ticketId = String(openAnswerId.value);
    else delete q.ticketId;
    router.replace({ query: q });
  };

  const load = async () => {
    try {
      loading.value = true;
      error.value = '';
      pushQuery();
      const params = {};
      const aid = Number(agencyIdInput.value);
      if (Number.isFinite(aid) && aid > 0) params.agencyId = aid;
      const sid = Number(schoolIdInput.value);
      if (Number.isFinite(sid) && sid > 0) params.schoolOrganizationId = sid;
      if (status.value) params.status = status.value;
      if (sourceChannel.value) params.sourceChannel = sourceChannel.value;
      if (draftState.value) params.draftState = draftState.value;
      if (sentState.value) params.sentState = sentState.value;
      if (viewMode.value === 'mine') params.mine = true;
      if (searchInput.value && searchInput.value.trim()) params.q = searchInput.value.trim().slice(0, 120);
      const r = await api.get('/support-tickets', { params });
      tickets.value = (Array.isArray(r.data) ? r.data : []).map((ticket) => ({
        ...ticket,
        _draftMeta: parseDraftMetadata(ticket?.ai_draft_metadata_json)
      }));
      const nextAssignees = {};
      for (const t of tickets.value) {
        if (t?.claimed_by_user_id) nextAssignees[t.id] = String(t.claimed_by_user_id);
      }
      assigneeByTicket.value = nextAssignees;
      if (openAnswerId.value && !(tickets.value || []).some((t) => Number(t?.id) === Number(openAnswerId.value))) {
        openAnswerId.value = null;
      }
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load support tickets';
      tickets.value = [];
    } finally {
      loading.value = false;
    }
  };

  const ticketClass = (t) => {
    const claimedId = Number(t?.claimed_by_user_id || 0);
    const me = Number(myUserId || 0);
    const ticketStatus = String(t?.status || '').toLowerCase();
    if (claimedId && claimedId === me) return 'ticket-assigned-me';
    if (claimedId && claimedId !== me) return 'ticket-assigned-other';
    if (ticketStatus === 'answered') return 'ticket-answered';
    if (ticketStatus === 'closed') return 'ticket-closed';
    return 'ticket-open';
  };

  const formatAssignee = (u) => {
    const name = [String(u.first_name || '').trim(), String(u.last_name || '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name || `User #${u.id}`;
  };
  const formatClaimedBy = (t) => {
    const fn = String(t?.claimed_by_first_name || '').trim();
    const ln = String(t?.claimed_by_last_name || '').trim();
    const name = [fn, ln].filter(Boolean).join(' ').trim();
    if (name) return name;
    return `User #${t.claimed_by_user_id}`;
  };
  const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
  const formatStatus = (s) => {
    const v = String(s || '').toLowerCase();
    if (v === 'answered') return 'Answered';
    if (v === 'closed') return 'Closed';
    return 'Open';
  };
  const formatEscalationReason = (value) => {
    const v = String(value || '').trim().replace(/_/g, ' ');
    if (!v) return '';
    return v.charAt(0).toUpperCase() + v.slice(1);
  };
  const formatCreatedBy = (t) => {
    const fn = String(t?.created_by_first_name || '').trim();
    const ln = String(t?.created_by_last_name || '').trim();
    const name = [fn, ln].filter(Boolean).join(' ').trim();
    if (name) return name;
    return t?.created_by_email || `User #${t?.created_by_user_id || '—'}`;
  };
  const formatThreadAuthor = (m) => {
    const fn = String(m?.author_first_name || '').trim();
    const ln = String(m?.author_last_name || '').trim();
    const name = [fn, ln].filter(Boolean).join(' ').trim();
    return name || `User #${m?.author_user_id || '—'}`;
  };
  const isStale = (t) => {
    if (!t?.claimed_by_user_id || Number(t.claimed_by_user_id) === Number(myUserId)) return false;
    if (String(t.status || '').toLowerCase() !== 'open') return false;
    const claimedAt = t.claimed_at ? new Date(t.claimed_at).getTime() : 0;
    if (!Number.isFinite(claimedAt) || claimedAt <= 0) return false;
    return (Date.now() - claimedAt) / (1000 * 60 * 60) >= 24;
  };
  const formatClientLabel = (t) => {
    const initials = String(t?.client_initials || '').replace(/\s+/g, '').toUpperCase();
    const code = String(t?.client_identifier_code || '').replace(/\s+/g, '').toUpperCase();
    if (clientLabelMode.value === 'initials') return initials || code || '—';
    return code || initials || '—';
  };
  const clientLabelTitle = (t) => {
    if (clientLabelMode.value !== 'codes') return '';
    const initials = String(t?.client_initials || '').replace(/\s+/g, '').toUpperCase();
    return initials || '';
  };

  const toggleAssignPicker = (t) => {
    if (!canAssignOthers.value || !t?.id) return;
    const key = String(t.id);
    showAssignByTicketId.value = {
      ...(showAssignByTicketId.value || {}),
      [key]: !showAssignByTicketId.value?.[key]
    };
  };

  const claimTicket = async (t) => {
    try {
      if (!t?.id) return;
      claimingId.value = t.id;
      await api.post(`/support-tickets/${t.id}/claim`);
      await load();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to claim ticket';
    } finally {
      claimingId.value = null;
    }
  };

  const unclaimTicket = async (t) => {
    try {
      if (!t?.id) return;
      unclaimingId.value = t.id;
      await api.post(`/support-tickets/${t.id}/unclaim`);
      await load();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to unclaim ticket';
    } finally {
      unclaimingId.value = null;
    }
  };

  const assignTicket = async (t) => {
    try {
      if (!t?.id) return;
      const assigneeUserId = Number(assigneeByTicket.value?.[t.id] || 0);
      if (!assigneeUserId) return;
      assigningId.value = t.id;
      await api.post(`/support-tickets/${t.id}/assign`, { assigneeUserId });
      await load();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to assign ticket';
    } finally {
      assigningId.value = null;
    }
  };

  const takeOverTicket = async (t) => {
    try {
      if (!t?.id || !myUserId) return;
      assigningId.value = t.id;
      await api.post(`/support-tickets/${t.id}/assign`, { assigneeUserId: myUserId });
      await load();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to take over ticket';
    } finally {
      assigningId.value = null;
    }
  };

  const closeTicket = async (t) => {
    try {
      if (!t?.id) return;
      assigningId.value = t.id;
      await api.post(`/support-tickets/${t.id}/close`);
      await load();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to close ticket';
    } finally {
      assigningId.value = null;
    }
  };

  const confirmAssign = (t) => {
    const current = Number(t?.claimed_by_user_id || 0);
    const next = Number(assigneeByTicket.value?.[t?.id] || 0);
    if (!t?.id || !next) return;
    if (current && current !== next) {
      confirmAction.value = 'assign';
      confirmTicket.value = t;
      confirmInput.value = '';
      confirmOpen.value = true;
      return;
    }
    assignTicket(t);
  };
  const confirmJoin = (t) => {
    if (!t?.id) return;
    confirmAction.value = 'join';
    confirmTicket.value = t;
    confirmInput.value = '';
    confirmOpen.value = true;
  };
  const confirmClose = (t) => {
    if (!t?.id) return;
    confirmAction.value = 'close';
    confirmTicket.value = t;
    confirmInput.value = '';
    confirmOpen.value = true;
  };
  const closeConfirm = () => {
    confirmOpen.value = false;
    confirmAction.value = '';
    confirmTicket.value = null;
    confirmInput.value = '';
  };
  const submitConfirm = async () => {
    if (!confirmReady.value) return;
    const t = confirmTicket.value;
    const action = confirmAction.value;
    closeConfirm();
    if (action === 'assign') return await assignTicket(t);
    if (action === 'join') return await openThread(t);
    if (action === 'close') return await closeTicket(t);
  };

  const openThread = async (t) => {
    try {
      threadOpen.value = true;
      threadTicket.value = t;
      threadLoading.value = true;
      threadError.value = '';
      const r = await api.get(`/support-tickets/${t.id}/messages`);
      threadMessages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    } catch (e) {
      threadError.value = e.response?.data?.error?.message || 'Failed to load thread';
      threadMessages.value = [];
    } finally {
      threadLoading.value = false;
    }
  };
  const closeThread = () => {
    threadOpen.value = false;
    threadTicket.value = null;
    threadMessages.value = [];
    threadError.value = '';
    threadBody.value = '';
  };
  const sendThreadMessage = async () => {
    try {
      if (!threadTicket.value?.id) return;
      threadSending.value = true;
      const r = await api.post(`/support-tickets/${threadTicket.value.id}/messages`, { body: threadBody.value });
      const msg = r.data?.message || null;
      if (msg) threadMessages.value = [...threadMessages.value, msg];
      threadBody.value = '';
    } catch (e) {
      threadError.value = e.response?.data?.error?.message || 'Failed to send message';
    } finally {
      threadSending.value = false;
    }
  };

  const toggleAnswer = async (ticketId) => {
    if (openAnswerId.value === ticketId) {
      openAnswerId.value = null;
      answerText.value = '';
      answerError.value = '';
      if (Number(autoClaimedTicketId.value) === Number(ticketId)) {
        const t = (tickets.value || []).find((row) => Number(row?.id) === Number(ticketId));
        if (t && Number(t.claimed_by_user_id) === Number(myUserId)) {
          await unclaimTicket(t);
        }
        autoClaimedTicketId.value = null;
      }
      return;
    }
    openAnswerId.value = ticketId;
    answerText.value = '';
    answerError.value = '';
    const t = (tickets.value || []).find((row) => Number(row?.id) === Number(ticketId));
    if (t && !t.claimed_by_user_id) {
      claimingId.value = t.id;
      try {
        await api.post(`/support-tickets/${t.id}/claim`);
        await load();
        autoClaimedTicketId.value = t.id;
      } catch (e) {
        error.value = e.response?.data?.error?.message || 'Failed to claim ticket';
      } finally {
        claimingId.value = null;
      }
    }
  };

  const submitAnswer = async (t, mode = 'answered') => {
    try {
      submitting.value = true;
      answerError.value = '';
      if (t?.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)) {
        answerError.value = `Ticket is claimed by ${formatClaimedBy(t)}.`;
        return;
      }
      const closeOnRead = mode === 'close_on_read';
      const draftText = String(t?.ai_draft_response || '').trim();
      const answerFinal = answerText.value.trim();
      let aiDraftDecision = null;
      if (draftText) aiDraftDecision = draftText === answerFinal ? 'accepted' : 'edited';
      await api.post(`/support-tickets/${t.id}/answer`, {
        answer: answerFinal,
        status: 'answered',
        closeOnRead,
        aiDraftDecision
      });
      autoClaimedTicketId.value = null;
      openAnswerId.value = null;
      answerText.value = '';
      await load();
    } catch (e) {
      answerError.value = e.response?.data?.error?.message || 'Failed to submit answer';
    } finally {
      submitting.value = false;
    }
  };

  const generateDraftResponse = async (t) => {
    try {
      if (!t?.id) return;
      answerError.value = '';
      if (t?.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)) {
        answerError.value = `Ticket is claimed by ${formatClaimedBy(t)}.`;
        return;
      }
      generatingResponse.value = true;
      const r = await api.post(`/support-tickets/${t.id}/generate-response`);
      const draft = String(r.data?.suggestedAnswer || '').trim();
      if (!draft) {
        answerError.value = 'No draft was generated.';
        return;
      }
      const existing = String(answerText.value || '').trim();
      answerText.value = existing ? `${existing}\n\n---\n\n${draft}` : draft;
    } catch (e) {
      answerError.value = e.response?.data?.error?.message || 'Failed to generate draft response';
    } finally {
      generatingResponse.value = false;
    }
  };

  const useAiDraft = (t) => {
    const draft = String(t?.ai_draft_response || '').trim();
    if (!draft) return;
    answerText.value = draft;
  };
  const copyAiDraft = async (t) => {
    const draft = String(t?.ai_draft_response || '').trim();
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      // ignore
    }
  };
  const markDraftReview = async (t, state) => {
    if (!t?.id) return;
    try {
      reviewingDraftId.value = t.id;
      await api.post(`/support-tickets/${t.id}/review-draft`, { state });
      await load();
    } catch (e) {
      answerError.value = e.response?.data?.error?.message || 'Failed to update draft review state';
    } finally {
      reviewingDraftId.value = null;
    }
  };
  const markDraftSent = async (t) => {
    if (!t?.id) return;
    try {
      markingSentId.value = t.id;
      await api.post(`/support-tickets/${t.id}/mark-sent`);
      await load();
    } catch (e) {
      answerError.value = e.response?.data?.error?.message || 'Failed to mark draft as sent';
    } finally {
      markingSentId.value = null;
    }
  };
  const convertToFaq = async (t) => {
    try {
      if (!t?.id) return;
      convertingFaqId.value = t.id;
      await api.post('/faqs/from-ticket', { ticketId: t.id });
      alert('Created a pending FAQ entry. You can edit/publish it under Admin → FAQ.');
    } catch (e) {
      alert(e.response?.data?.error?.message || 'Failed to create FAQ from ticket');
    } finally {
      convertingFaqId.value = null;
    }
  };

  const toggleClientLabelMode = () => {
    const next = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
    clientLabelMode.value = next;
    try {
      window.localStorage.setItem('adminTicketsClientLabelMode', next);
    } catch {
      // ignore
    }
  };
  const toggleViewMode = () => {
    viewMode.value = viewMode.value === 'mine' ? 'all' : 'mine';
    load();
  };

  const openAdminClientEditor = async (ticket) => {
    const clientId = Number(ticket?.client_id || 0);
    if (!clientId) return;
    adminClientLoading.value = true;
    try {
      const r = await api.get(`/clients/${clientId}`);
      adminSelectedClient.value = r.data || null;
    } catch (e) {
      alert(e.response?.data?.error?.message || e.message || 'Failed to open client editor');
      adminSelectedClient.value = null;
    } finally {
      adminClientLoading.value = false;
    }
  };
  const closeAdminClientEditor = () => {
    adminSelectedClient.value = null;
  };
  const handleAdminClientUpdated = (payload) => {
    if (payload?.client) adminSelectedClient.value = payload.client;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  onMounted(() => {
    try {
      const saved = window.localStorage.getItem('adminTicketsClientLabelMode');
      if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
    } catch {
      // ignore
    }
    syncFromQuery();
    // Never block first paint on agency bootstrap (admin users were seeing route lockups).
    ready.value = true;
    const run = async () => {
      try {
        await Promise.race([agencyStore.fetchUserAgencies(), sleep(2500)]);
      } catch {
        // best effort
      }
      try {
        if (isSuperAdmin.value) {
          const agencies = agencyStore.agencies?.value ?? agencyStore.agencies ?? [];
          if (!Array.isArray(agencies) || agencies.length === 0) await agencyStore.fetchAgencies();
        }
      } catch {
        // best effort
      }
      try {
        if (agencyIdInput.value) await fetchSchoolsForAgency(agencyIdInput.value);
      } catch {
        // best effort
      }
      try {
        await loadAssignees();
      } catch {
        // best effort
      }
      await load();
    };
    setTimeout(() => {
      void run();
    }, 0);
  });

  return {
    myUserId,
    canAssignOthers,
    claimLabel,
    tickets,
    loading,
    error,
    ready,
    agencyIdInput,
    schoolIdInput,
    schoolFilterOptions,
    status,
    sourceChannel,
    draftState,
    sentState,
    viewMode,
    searchInput,
    openAnswerId,
    answerText,
    submitting,
    generatingResponse,
    reviewingDraftId,
    markingSentId,
    answerError,
    claimingId,
    unclaimingId,
    convertingFaqId,
    assignees,
    assigneeByTicket,
    assigningId,
    confirmOpen,
    confirmInput,
    threadOpen,
    threadMessages,
    threadLoading,
    threadError,
    threadBody,
    threadSending,
    adminSelectedClient,
    adminClientLoading,
    clientLabelMode,
    showAssignByTicketId,
    confirmWord,
    confirmTitle,
    confirmMessage,
    confirmReady,
    agencyFilterOptions,
    formatAssignee,
    formatClaimedBy,
    formatDateTime,
    formatStatus,
    formatEscalationReason,
    formatCreatedBy,
    formatThreadAuthor,
    isStale,
    formatClientLabel,
    clientLabelTitle,
    ticketClass,
    fetchSchoolsForAgency,
    load,
    toggleAssignPicker,
    claimTicket,
    unclaimTicket,
    takeOverTicket,
    confirmAssign,
    confirmJoin,
    confirmClose,
    closeConfirm,
    submitConfirm,
    openThread,
    closeThread,
    sendThreadMessage,
    toggleAnswer,
    submitAnswer,
    generateDraftResponse,
    useAiDraft,
    copyAiDraft,
    markDraftReview,
    markDraftSent,
    convertToFaq,
    toggleClientLabelMode,
    toggleViewMode,
    openAdminClientEditor,
    closeAdminClientEditor,
    handleAdminClientUpdated
  };
}
