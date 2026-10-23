import pool from '../config/database.js';
import { getExchangeAudit, parseAuditJson } from './clientExchangeAudit.service.js';
import { buildExchangeAuditReport } from '../utils/clientExchangeAuditReport.js';
import { renderExchangeAuditPdf } from './clientExchangeAuditPdf.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

/** Caller holds the listing lock. One report per listing per UTC day, for the enrolled pilot only. */
export async function sendExchangeAuditReport({listing,agency,identities}) {
  const config=parseAuditJson(agency?.feature_flags)?.clientExchangeAudit;
  if(config?.enabled!==true)return {skipped:true,reason:'pilot_disabled'};
  const [[pilot]]=await pool.execute('SELECT ordinal FROM client_exchange_audit_clients WHERE agency_id=? AND client_id=?',[listing.agencyId,listing.clientId]);
  if(!pilot)return {skipped:true,reason:'outside_first_50'};
  const reportKey=new Date().toISOString().slice(0,10);
  const [[previous]]=await pool.execute('SELECT status FROM client_exchange_audit_reports WHERE listing_id=? AND report_key=?',[listing.id,reportKey]);
  if(previous&&['sent','queued','sending','unknown','redirected'].includes(previous.status))return {skipped:true,reason:'already_attempted',status:previous.status};
  const support=identities.find(row=>row.identity_key==='support');
  const sender=identities.find(row=>row.identity_key==='client_exchange')||identities.find(row=>row.identity_key==='notifications');
  if(!support?.from_email||!sender?.id)throw Object.assign(new Error('Support audit sender or support address is missing'),{code:'EXCHANGE_AUDIT_MAILBOX_MISSING'});
  const audit=await getExchangeAudit(listing.id);
  const link=`${buildPublicAppUrl(agency,'client-exchange')}?listingId=${listing.id}&agencyId=${listing.agencyId}`;
  const {reportHtml,...content}=buildExchangeAuditReport({audit,listing,agencyName:agency.name,ordinal:pilot.ordinal,link});
  const pdf=await renderExchangeAuditPdf(reportHtml);
  content.attachments.unshift({filename:`exchange-${listing.id}-audit-report.pdf`,contentType:'application/pdf',contentBase64:pdf.toString('base64')});
  await pool.execute(`INSERT INTO client_exchange_audit_reports (listing_id,report_key,status) VALUES (?,?,'sending')
    ON DUPLICATE KEY UPDATE status='sending'`,[listing.id,reportKey]);
  try {
    const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to:support.from_email,
      cc:config.copyEmail?[config.copyEmail]:null,source:'auto',templateType:'client_exchange_audit',...content,linkUrl:link,
      replyToOverride:support.from_email,fromDisplayNameOverride:'Client Exchange Audit',
      internetMessageIdOverride:`<exchange-audit-${listing.id}-${reportKey}@auricwell.com>`});
    const status=result?.redirected?'redirected':result?.queued?'queued':result?.blocked||result?.failed?'failed':result?.skipped?'skipped':result?.id||result?.sent?'sent':'unknown';
    await pool.execute('UPDATE client_exchange_audit_reports SET status=?,communication_id=?,sent_at=IF(?=\'sent\',NOW(),NULL) WHERE listing_id=? AND report_key=?',[status,result?.communicationId||null,status,listing.id,reportKey]);
    return {status};
  }catch(error){await pool.execute("UPDATE client_exchange_audit_reports SET status='unknown' WHERE listing_id=? AND report_key=?",[listing.id,reportKey]);throw error;}
}
