import { onScopeDispose, ref, watch } from 'vue';
import api from '../services/api';

export function useMedicalRecordHistory(clientId, agencyId) {
  const entries = ref([]), unavailable = ref([]), loading = ref(false);
  let generation = 0;
  async function load() {
    const id = clientId.value, agency = agencyId.value, own = ++generation;
    entries.value = []; unavailable.value = []; loading.value = false;
    if (!id || !agency) return;
    loading.value = true;
    const config = {params:{agencyId:agency}, headers:{'X-Agency-Id':String(agency)}, skipGlobalLoading:true};
    const entry = (kind, key, date, title, tab, action = '', detail = {}) => ({
      record_key:kind + ':' + key, historyKind:kind, sourceId:key, service_date:date, title, tab, action, ...detail
    });
    const sources = [
      ['Clinical forms','/clinical-forms/filed',data=>(data.forms||[]).map(form=>
        entry(form.category,form.id+':'+(form.version||form.source),form.signedAt,form.title,'medical-record',form.source==='request-file'?'request-file':'clinical-form',
          {sourceId:form.id,version:form.version,respondent:form.respondent,recordStatus:form.revoked?'Revoked':form.reviewStatus==='pending'?'Awaiting review':'Signed'}))],
      ['Documents', '/phi-documents/clients/' + id + '/chart-artifacts', data => (data.artifacts || []).filter(d => !d.missing && d.viewKey)
        .map(d => entry(({smart_roi:'School release of information',disclosure:'Provider disclosure',clinical_summary:'Clinical summary',intake_responses:'Enrollment responses',packet:'Enrollment packet',session_material:'Session material',questionnaire_responses:'Questionnaire answers'})[d.kind]||'Document', d.viewKey, d.signedAt || d.uploadedAt, d.title, 'documents','document'))],
      ['Treatment plans','/medical-billing/clients/' + id + '/chart', data => (data.plans || [])
        .map(p => entry('Treatment plan', p.id, p.effective_date || p.created_at, p.title || 'Treatment plan', 'treatment-plans','plan'))],
      ['Assessments','/assessment-deliverables/clients/' + id, data => [
        ...(data.assessments || []).map(a => entry('Assessment', a.family + '-' + a.id, a.completedAt || a.createdAt, a.title, 'assessments')),
        ...(data.deliverables || []).map(d => entry('Assessment report', d.id, d.updatedAt || d.createdAt, d.title, 'assessments','assessment'))]],
      ['Communications','/clients/' + id + '/communications', data => [
        ...(data.conversations || []).map(c => entry('Conversation', c.id, c.last_message_at, c.subject || 'Care conversation', 'communications','conversation')),
        ...(data.items || []).filter(m => Number(m.clientId) === Number(id) && (m.source !== 'notification' || m.linkedChartRecipient))
          .map(m => entry(m.channel === 'sms' ? 'Text' : 'Email', m.channel === 'sms' ? m.id : 'email-' + m.id, m.sentAt,
            m.subject || (m.channel === 'sms' ? 'Text message' : 'Email notification'), 'communications','message'))]]
    ];
    await Promise.all(sources.map(async ([label, path, map]) => {
      try {
        const {data} = await api.get(path,config);
        if (own === generation) entries.value.push(...map(data));
      } catch {
        if (own === generation) unavailable.value.push(label);
      }
    }));
    if (own === generation) loading.value = false;
  }
  watch([clientId, agencyId], load, {immediate:true});
  onScopeDispose(() => {generation++;});
  return {entries,unavailable,loading,load};
}
