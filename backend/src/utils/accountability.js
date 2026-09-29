export function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function text(value, max, label, required = true) {
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > max) throw invalid(`${label} is required and must be at most ${max} characters.`);
  return result;
}
function number(value, min, max, label) {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) throw invalid(`Enter a valid ${label} (${min}–${max}).`);
  return Number(value);
}
export function monthValue(value) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(value))) throw invalid('Select a valid month.');
  return value;
}
function dateValue(value, month) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !String(value).startsWith(`${month}-`) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid('Every date must be a valid day in the selected month.');
  return value;
}
export function validateSettings(input) {
  if (!input || typeof input !== 'object') throw invalid('Plan parameters are required.');
  const recipient = text(input.recipient, 254, 'Recipient');
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) throw invalid('Enter one valid recipient email address.');
  if (!Array.isArray(input.categories) || !input.categories.length || input.categories.length > 20) throw invalid('Configure 1–20 expense categories.');
  const seen = new Set();
  const categories = input.categories.map((c) => {
    const key = text(c.key, 40, 'Category key');
    if (!/^[a-z][a-z0-9_]*$/.test(key) || seen.has(key)) throw invalid('Category keys must be unique lowercase identifiers.');
    seen.add(key);
    return { key, label: text(c.label, 80, 'Category name'), percent: number(c.percent, 0, 100, 'business allocation percentage') };
  });
  return {
    recipient, officeAddress: text(input.officeAddress, 300, 'Approved office address'),
    policy: text(input.policy, 6000, 'Plan parameters'),
    attestation: text(input.attestation, 3000, 'Attestation'),
    mileageRate: number(input.mileageRate, 0, 10, 'mileage rate'), categories
  };
}
export function validateReport(input, month, settings, { final = false, receipts = [] } = {}) {
  monthValue(month);
  if (!input || typeof input !== 'object') throw invalid('Report entries are required.');
  if (!Array.isArray(input.expenses) || !Array.isArray(input.mileage) || input.expenses.length > 100 || input.mileage.length > 500) throw invalid('Use at most 100 expenses and 500 mileage entries per month.');
  const ids = new Set();
  const id = (value) => {
    if (!/^[a-zA-Z0-9-]{1,36}$/.test(String(value)) || ids.has(value)) throw invalid('Entry identifiers must be unique.');
    ids.add(value); return value;
  };
  const expenses = input.expenses.map((e) => {
    const category = settings.categories.find((c) => c.key === e.category);
    if (!category) throw invalid('An expense category is no longer enabled. Update the expense before saving.');
    const result = { id: id(e.id), category: category.key, date: !final && !e.date ? '' : dateValue(e.date, month), vendor: text(e.vendor, 160, 'Vendor', final), amount: !final && (e.amount === '' || e.amount == null) ? null : number(e.amount, 0.01, 1000000, 'expense amount'), notes: text(e.notes, 500, 'Expense notes', false) };
    if (Math.abs(result.amount * 100 - Math.round(result.amount * 100)) > 0.000001) throw invalid('Expense amounts must use at most two decimal places.');
    if (final && !receipts.some((r) => r.expense_id === result.id)) throw invalid(`Attach a receipt for ${result.vendor}.`);
    return result;
  });
  const mileage = input.mileage.map((m) => ({
    id: id(m.id), date: !final && !m.date ? '' : dateValue(m.date, month), start: text(m.start, 200, 'Starting location', final), end: text(m.end, 200, 'Destination', final),
    purpose: text(m.purpose, 500, 'Business purpose', final), miles: !final && (m.miles === '' || m.miles == null) ? null : number(m.miles, 0.01, 10000, 'business miles'), notes: text(m.notes, 500, 'Mileage notes', false)
  }));
  if (final && !expenses.length && !mileage.length) throw invalid('Add an expense or business trip before signing.');
  return { expenses, mileage };
}
export function reportTotals(data, settings) {
  const expenses = data.expenses.map((e) => ({ ...e, percent: settings.categories.find((c) => c.key === e.category)?.percent || 0 }));
  const expenseCents = expenses.reduce((sum, e) => sum + Math.round(e.amount * e.percent), 0);
  const miles = data.mileage.reduce((sum, m) => sum + m.miles, 0);
  const mileageCents = data.mileage.reduce((sum, m) => sum + Math.round(m.miles * settings.mileageRate * 100), 0);
  return { expenseCents, miles, mileageCents, totalCents: expenseCents + mileageCents };
}
