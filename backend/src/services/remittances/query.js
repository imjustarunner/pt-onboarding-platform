import { fail, serviceDate } from './normalize.js';

const columns = ['eraId','payerName','paymentType','trace','paidDate','receivedDate','importedAt','paidCents','claimCount','status'];
export function remittanceQuery(input = {}) {
  const page = Number(input.page || 1), sortBy = input.sortBy || 'importedAt', direction = input.direction || 'desc';
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw fail(400,'Invalid remittance page');
  if (!columns.includes(sortBy) || !['asc','desc'].includes(direction)) throw fail(400,'Invalid remittance sort');
  const result = { page, sortBy, direction, search: String(input.search || '').trim().toLowerCase().slice(0,200), status: String(input.status || ''), paymentType: String(input.paymentType || '').toLowerCase() };
  for (const key of ['paidFrom','paidThrough','receivedFrom','receivedThrough']) {
    const value = input[key] || '';
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || serviceDate(value) !== value)) throw fail(400,'Invalid remittance date filter');
    result[key] = value;
  }
  if (result.paidFrom > (result.paidThrough || '9999') || result.receivedFrom > (result.receivedThrough || '9999')) throw fail(400,'Remittance date range is reversed');
  return result;
}

function receiptDate(value) {
  const text = String(value || '');
  const us = text.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s|$)/);
  return serviceDate(us ? `${us[3]}-${us[1]}-${us[2]}` : text.slice(0,10));
}

export function remittanceSummary(record, snapshot) {
  const { era, raw = {} } = snapshot, directory = snapshot.directory || {};
  return { id: Number(record.id), eraId: era.eraId, payerName: era.payerName, payerId: era.payerId,
    paymentType: String(raw.check_type || directory.check_type || '').toLowerCase() || null,
    trace: era.trace || String(directory.check_number || '') || null,
    paidDate: era.paidDate, receivedDate: receiptDate(raw.received_time || directory.received_time),
    importedAt: record.imported_at instanceof Date ? record.imported_at.toISOString() : record.imported_at || null,
    paidCents: era.paidCents, status: record.status, claimCount: era.items.length };
}

export function remittanceMatches(row, era, query) {
  if (query.status && row.status !== query.status || query.paymentType && row.paymentType !== query.paymentType) return false;
  for (const [field, from, through] of [['paidDate',query.paidFrom,query.paidThrough],['receivedDate',query.receivedFrom,query.receivedThrough]]) {
    if ((from || through) && (!row[field] || from && row[field] < from || through && row[field] > through)) return false;
  }
  if (!query.search) return true;
  const values = [row.eraId,row.payerName,row.payerId,row.paymentType,row.trace,row.paidDate,row.receivedDate,row.status,(row.paidCents/100).toFixed(2)];
  for (const item of era.items) {
    values.push(item.patientName,item.pcn,item.payerControlNumber);
    for (const line of item.lines || []) {
      values.push(line.code,line.date,...(line.modifiers || []),...(line.remarkCodes || []));
      for (const adjustment of line.adjustments || []) values.push(`${adjustment.group}-${adjustment.code}`);
    }
    for (const adjustment of item.claimAdjustments || []) values.push(`${adjustment.group}-${adjustment.code}`);
  }
  // Searchable claim data stays in memory and never becomes a plaintext search index.
  return query.search.split(/\s+/).every(term => values.some(value => String(value || '').toLowerCase().includes(term)));
}

export function sortRemittances(rows, query) {
  return rows.sort((a,b) => {
    const av=a[query.sortBy], bv=b[query.sortBy];
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    const result = ['paidCents','claimCount'].includes(query.sortBy) ? Number(av)-Number(bv) : String(av || '').localeCompare(String(bv || ''),undefined,{numeric:true,sensitivity:'base'});
    return result * (query.direction === 'asc' ? 1 : -1) || b.id-a.id;
  });
}
