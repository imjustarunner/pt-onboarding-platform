import { assertCoachCanAccessClient, listForClient, listClientAssessments } from './assessmentDeliverable.service.js';
import { ensureClientAccess, chartCommunicationThreads } from './chartCommunicationExport.service.js';
import { communicationPrintDocument } from './communicationPrint.service.js';
import { clinicalValueHtml } from './clinicalRecordPdf.service.js';

export async function collectRecordSupplement({ user, agencyId, client, inRange }) {
  const pages = [], manifest = [];
  const clientId = Number(client.id);
  try {
    await assertCoachCanAccessClient({user, clientId});
    const [reports, assessments] = await Promise.all([listForClient({clientId, agencyId}), listClientAssessments({clientId, agencyId})]);
    const events = assessments.filter(row => inRange(row.completedAt || row.updatedAt || row.createdAt)).map(row => ({
      assessment: row.title, status: row.status, completed: row.completedAt, updated: row.updatedAt
    }));
    if (events.length) pages.push({ name:'assessment-history.pdf', html:'<h1>Assessment history</h1>' + clinicalValueHtml(events) });
    for (const report of reports) {
      if (!inRange(report.updatedAt || report.createdAt)) continue;
      // Embedded reports use the same isolated renderer as other chart artifacts.
      if (report.htmlBody) pages.push({name:'assessment-report-' + report.id + '.pdf', html:report.htmlBody});
      else manifest.push({name:report.title || 'Assessment report',disposition:'Separate download',reason:'The original report is available through Assessments.'});
    }
  } catch (error) {
    if (error.status !== 403) throw error;
    manifest.push({name:'Assessments',disposition:'Restricted',reason:'Assessment access is required.'});
  }
  const access = await ensureClientAccess({userId:user.id, role:user.role, clientId});
  if (access.ok && Number(access.client.agency_id) === Number(agencyId)) {
    const threads = await chartCommunicationThreads(clientId, user.id, {singleClientOnly:true});
    const selected = threads.map(thread => ({...thread,
      messages:thread.messages.filter(m => inRange(m.sent_at || m.sentAt || m.created_at)),
      documentation:(thread.documentation || []).filter(d => inRange(d.createdAt))
    })).filter(row => row.messages.length || row.documentation.length);
    if (selected.length) pages.push({name:'chart-communications.pdf',html:communicationPrintDocument('Chart communications',selected)});
  } else {
    manifest.push({name:'Chart communications',disposition:'Restricted',reason:'Communications are available in their authorized agency workspace.'});
  }
  return {pages,manifest};
}
