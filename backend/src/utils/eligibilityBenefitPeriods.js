import {toDateOnlyString} from './mysqlDateTime.utils.js';

// Claim.MD's time-period codes distinguish calendar year (23), service year
// (22), contract (25), and remaining (29). Coverage effective/termination dates
// are not a deductible year. This projection never uses them as a reset date.
// https://www.claim.md/eligibility_code_reference.pdf
const periodLabels = {'22': 'Service year', '23': 'Calendar year', '24': 'Year to date', '25': 'Contract', '26': 'Episode', '29': 'Remaining', '32': 'Lifetime', '33': 'Lifetime remaining'};

function day(value) {
  if (value instanceof Date) value = toDateOnlyString(value);
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    && Number.isFinite(Date.parse(normalized))
    && new Date(normalized).toISOString().slice(0, 10) === normalized ? normalized : '';
}

function dates(value) {
  if (value == null || value === '') return {start: '', end: '', invalid: false};
  if (typeof value !== 'string') return {start: '', end: '', invalid: true};
  const raw = value.trim();
  if (!raw) return {start: '', end: '', invalid: false};
  const range = raw.match(/^(\d{8}|\d{4}-\d{2}-\d{2})\s*(?:\/|\s+-\s+|-)\s*(\d{8}|\d{4}-\d{2}-\d{2})$/);
  if (!range) return {start: day(raw), end: '', invalid: !day(raw)};
  const start = day(range[1]), end = day(range[2]);
  return {start, end, invalid: !start || !end || start > end};
}

function after(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  const result = value.toISOString().slice(0, 10);
  return day(result);
}

function benefitPeriod(row, serviceDate) {
  const begin = dates(row.beginDate), end = dates(row.endDate);
  const endDate = end.end || end.start || begin.end;
  const startDate = begin.start || (end.end ? end.start : '');
  const messages = [];
  const result = {
    id: row.id, memberIndex: row.memberIndex, serviceCode: row.serviceCode,
    serviceDescription: row.serviceDescription, network: row.network,
    levelCode: row.levelCode, levelDescription: row.levelDescription,
    periodCode: row.periodCode, periodLabel: periodLabels[row.periodCode] || row.periodDescription || 'Not provided',
    startDate, endDate, reportedStartDate:startDate, reportedEndDate:endDate,
    expectedResetDate: '', reviewOnDate: '', basis: 'not_provided',
    sourceBenefitIds: [row.id], messages
  };
  if (begin.invalid || end.invalid || (begin.end && endDate !== begin.end)
    || (end.end && begin.start && end.start !== begin.start)
    || (startDate && endDate && startDate > endDate)) {
    result.basis = 'conflicting';
    messages.push('Returned benefit dates are invalid or disagree. Confirm the deductible period with the payer.');
    return result;
  }
  const asOf = day(serviceDate);
  if (asOf && (startDate && asOf < startDate || endDate && asOf > endDate)) {
    result.basis = 'conflicting';
    messages.push('The returned benefit dates do not include this verification’s service date. Confirm the applicable period.');
    return result;
  }
  if (row.notes) messages.push('The payer included conditions or notes. Review them before using these benefits.');
  if (row.periodCode === '23') {
    if (!asOf) {
      messages.push('The payer reports a calendar-year deductible, but a valid service date is needed to identify the year.');
      return result;
    }
    const year = Number(asOf.slice(0, 4));
    if (year >= 9999) {
      result.basis = 'conflicting';
      messages.push('The service year is outside the supported date range. Confirm the reset date with the payer.');
      return result;
    }
    result.basis = 'calendar_year';
    result.startDate = `${year}-01-01`;
    result.endDate = `${year}-12-31`;
    // Derived from the payer's explicit period code and the checked date, not
    // from today's year, the plan's coverage start, or another service's limits.
    result.expectedResetDate = `${year + 1}-01-01`;
    result.reviewOnDate = result.expectedResetDate;
    if (endDate && endDate < result.endDate) {
      result.reviewOnDate = after(endDate);
      messages.push('Returned benefits end before the next calendar reset. Confirm continued coverage at that earlier boundary.');
    }
  } else if (row.periodCode === '22' && asOf && startDate && endDate
    && Number(startDate.slice(0, 4)) < 9999
    && day(`${Number(startDate.slice(0, 4)) + 1}${startDate.slice(4)}`) === after(endDate)) {
    result.basis = 'service_year';
    result.expectedResetDate = after(endDate);
    result.reviewOnDate = result.expectedResetDate;
  } else {
    result.basis = startDate || endDate ? 'reported_dates' : 'not_provided';
    if (endDate) result.reviewOnDate = after(endDate);
    messages.push('A deductible reset date was not explicitly established. Confirm the benefit year with the payer; returned dates may describe a shorter period.');
  }
  return result;
}

export function eligibilityDeductiblePeriods(benefits, {serviceDate} = {}) {
  const scopes = new Map();
  for (const row of benefits.filter(row => row.kind === 'C' && !row.otherPayerBenefit)) {
    const key = JSON.stringify([row.memberIndex, row.serviceCode, row.network, row.levelCode]);
    if (!scopes.has(key)) scopes.set(key, []);
    scopes.get(key).push(row);
  }
  const unique = new Map();
  for (const rows of scopes.values()) {
    const declared = rows.filter(row => !['24', '29'].includes(row.periodCode));
    const remaining = rows.filter(row => row.periodCode === '29');
    // Remaining and YTD values do not establish their own annual reset.
    const selected = declared.length ? declared : remaining.length ? remaining : rows;
    const results = selected.map(row => benefitPeriod(row, serviceDate));
    for (const result of results) {
      for (const row of rows.filter(row => ['24', '29'].includes(row.periodCode) && (row.beginDate || row.endDate))) {
        if (row.id === result.id) continue;
        const related = benefitPeriod(row, serviceDate);
        result.sourceBenefitIds.push(row.id);
        if (related.basis === 'conflicting') {
          result.expectedResetDate = '';
          result.reviewOnDate = '';
          result.basis = 'conflicting';
          const message = 'Remaining or year-to-date amounts carry conflicting benefit dates. Confirm the applicable deductible period.';
          if (!result.messages.includes(message)) result.messages.push(message);
        }
      }
    }
    // Compute all signatures before changing any result so order has no effect.
    const signatures = new Set(results.map(p => JSON.stringify([p.periodCode, p.startDate, p.endDate, p.expectedResetDate])));
    for (const result of results) {
      if (signatures.size > 1) {
        result.expectedResetDate = '';
        result.reviewOnDate = '';
        result.basis = 'conflicting';
        result.messages.push('Different deductible periods were returned for this same service, network and coverage level. Billing review is needed.');
      }
      const key = JSON.stringify([
        result.memberIndex, result.serviceCode, result.network, result.levelCode,
        result.periodCode, result.startDate, result.endDate, result.reportedStartDate, result.reportedEndDate,
        result.expectedResetDate, result.basis, result.messages
      ]);
      const previous = unique.get(key);
      if (previous) previous.sourceBenefitIds = [...new Set([...previous.sourceBenefitIds, ...result.sourceBenefitIds])];
      else unique.set(key, result);
    }
  }
  return [...unique.values()];
}
