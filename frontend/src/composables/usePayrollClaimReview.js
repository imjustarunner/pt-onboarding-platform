import { reactive, ref } from 'vue';
import api from '../services/api';

const paths = { time: 'time-claims', mileage: 'mileage-claims', reimb: 'reimbursement-claims' };
export const claimKey = (kind, claim) => `${kind}-${claim.id}`;
const message = e => e?.response?.data?.error?.message || e?.message || 'Unable to save this decision.';

// Decisions update the visible queues only after a confirmed server response.
// Revision overlays prevent a list request already in flight from restoring a decided row.
export function usePayrollClaimReview({ agencyId, queues, onSaved = () => {}, onReview = () => {}, onChanged = () => {} }) {
  const selected = ref([]);
  const errors = reactive({});
  const busy = ref(false);
  const notice = ref('');
  const revision = ref(0);
  const changes = new Map();
  let scope = 0;
  const reset = () => { scope++; selected.value = []; notice.value = ''; changes.clear(); for (const key of Object.keys(errors)) delete errors[key]; };
  const reconcile = (kind, rows, since) => {
    const byId = new Map((rows || []).map(c => [Number(c.id), c]));
    for (const { kind: k, claim, version } of changes.values()) {
      if (k !== kind || version <= since) continue;
      if (claim.status === 'submitted') byId.set(Number(claim.id), claim);
      else byId.delete(Number(claim.id));
    }
    return [...byId.values()];
  };
  const reconcileApproved = (kind, rows, since) => {
    const byId = new Map((rows || []).map(c => [Number(c.id), c]));
    for (const { kind: k, claim, version } of changes.values()) {
      if (k === kind && version > since && claim.status === 'approved') byId.set(Number(claim.id), claim);
    }
    return [...byId.values()];
  };
  const apply = (kind, original, claim, action) => {
    const expected = { approve: 'approved', reject: 'rejected', return: 'deferred' }[action];
    if (!claim || Number(claim.id) !== Number(original.id) || claim.status !== expected ||
        (claim.agency_id != null && Number(claim.agency_id) !== Number(original.agency_id ?? agencyId()))) {
      throw new Error('The server did not confirm this decision. Refresh and check the claim.');
    }
    const saved = { ...original, ...claim, payload: claim.payload || original.payload };
    const key = claimKey(kind, original);
    changes.set(key, { kind, claim: saved, version: ++revision.value });
    queues[kind].value = queues[kind].value.filter(c => Number(c.id) !== Number(saved.id));
    selected.value = selected.value.filter(k => k !== key);
    delete errors[key];
    onSaved(kind, saved);
  };
  const setError = (kind, claim, text, reviewRequired, openReview = true) => {
    errors[claimKey(kind, claim)] = text;
    if (openReview && (reviewRequired?.type === 'event_travel' || /open the event travel report/i.test(text))) onReview(kind, claim);
  };
  const decide = async (kind, claim, body) => {
    if (busy.value) return false;
    const activeScope = scope;
    busy.value = true; notice.value = ''; delete errors[claimKey(kind, claim)];
    try {
      let response;
      try { response = await api.patch(`/payroll/${paths[kind]}/${claim.id}`, body); }
      catch (e) {
        const text = message(e);
        if (body.action === 'approve' && /deadline|cutoff|submitted after|cannot be added to an earlier pay period/i.test(text) &&
            window.confirm(`${text}\n\nApprove anyway with an admin override?`)) {
          response = await api.patch(`/payroll/${paths[kind]}/${claim.id}`, { ...body, overrideDeadline: true });
        } else throw e;
      }
      if (activeScope !== scope) return false;
      apply(kind, claim, response.data?.claim, body.action);
      notice.value = body.action === 'approve' ? 'Approved and removed from pending.' : 'Decision saved.';
      onChanged([kind]);
      return true;
    } catch (e) {
      if (activeScope === scope) setError(kind, claim, message(e), e?.response?.data?.reviewRequired);
      return false;
    } finally { busy.value = false; }
  };
  const bulk = async (items, action) => {
    if (busy.value || !items.length) return;
    const activeScope = scope;
    busy.value = true; notice.value = '';
    let succeeded = 0;
    const warnings = [];
    try {
      for (let offset = 0; offset < items.length; offset += 100) {
        if (activeScope !== scope) return;
        const chunk = items.slice(offset, offset + 100);
        chunk.forEach(({ kind, claim }) => delete errors[claimKey(kind, claim)]);
        const { data } = await api.post('/payroll/claims/batch', { agencyId: agencyId(), action,
          items: chunk.map(({ kind, claim, ...body }) => ({ ...body, kind: kind === 'reimb' ? 'reimbursement' : kind, id: claim.id })) });
        if (activeScope !== scope) return;
        const changedKinds = new Set();
        for (const item of chunk) {
          const result = data?.results?.find(r => Number(r.id) === Number(item.claim.id) && r.kind === (item.kind === 'reimb' ? 'reimbursement' : item.kind));
          if (result?.ok) { apply(item.kind, item.claim, result.claim, action); succeeded++; changedKinds.add(item.kind); }
          else setError(item.kind, item.claim, result?.error?.message || 'This decision was not saved. Refresh and try again.', result?.reviewRequired, false);
        }
        warnings.push(...(data.warnings || []).map(w => typeof w === 'string' ? w : w.message));
        if (changedKinds.size) onChanged([...changedKinds]);
      }
    } catch (e) {
      for (const item of items) if (selected.value.includes(claimKey(item.kind, item.claim))) errors[claimKey(item.kind, item.claim)] = message(e);
    } finally {
      if (activeScope === scope) notice.value = `${succeeded} of ${items.length} decisions saved.${succeeded < items.length ? ' Remaining claims need attention below.' : ''}${warnings.length ? ` ${warnings.join(' ')}` : ''}`;
      busy.value = false;
    }
  };
  const toggleAll = (kind, rows, checked) => {
    const keys = rows.map(c => claimKey(kind, c));
    selected.value = checked ? [...new Set([...selected.value, ...keys])] : selected.value.filter(k => !keys.includes(k));
  };
  return { selected, errors, busy, notice, revision, reset, reconcile, reconcileApproved, decide, bulk, toggleAll };
}
