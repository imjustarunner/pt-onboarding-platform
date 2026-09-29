const aliases = {
  date: ['date', 'trip date', 'drive date'], start: ['start', 'from', 'start location', 'starting location', 'origin'],
  end: ['end', 'to', 'end location', 'destination'], purpose: ['purpose', 'business purpose', 'trip purpose'],
  miles: ['miles', 'distance', 'business miles', 'distance (mi)'], notes: ['notes', 'note']
};
// Handles quoted CSV fields, escaped quotes, CRLF, and pasted spreadsheet tabs.
export function parseMileagePaste(value, month) {
  if (value.length > 250000) throw new Error('Paste at most 500 trips at a time.');
  const delimiter = value.split(/\r?\n/)[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') {
      if (quoted && value[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === delimiter || char === '\n')) {
      row.push(cell.trim()); cell = '';
      if (char === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (char !== '\r') cell += char;
  }
  if (quoted) throw new Error('A quoted field is missing its closing quote.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  const header = (rows.shift() || []).map((v) => v.toLowerCase().replace(/^\uFEFF/, ''));
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, header.findIndex((h) => names.includes(h))]));
  for (const key of ['date', 'start', 'end', 'purpose', 'miles']) if (columns[key] < 0) throw new Error(`Include a ${key} column in the first row. Expected: Date, From, To, Purpose, Miles, Notes.`);
  if (!rows.length || rows.length > 500) throw new Error('Include between 1 and 500 trip rows.');
  return rows.map((cells, index) => {
    const get = (key) => cells[columns[key]] || '';
    let date = get('date');
    const us = date.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
    if (us) date = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    const parsed = new Date(`${date}T12:00:00Z`);
    const miles = Number(get('miles'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || !date.startsWith(`${month}-`)) throw new Error(`Row ${index + 2}: enter a valid date in ${month} (YYYY-MM-DD or M/D/YYYY).`);
    if (!get('start') || !get('end') || !get('purpose') || !Number.isFinite(miles) || miles <= 0 || miles > 10000) throw new Error(`Row ${index + 2}: start, destination, business purpose, and positive miles are required.`);
    return { date, start: get('start'), end: get('end'), purpose: get('purpose'), miles, notes: get('notes') };
  });
}
export function mileageKey(row) {
  return [row.date, row.start.trim().toLowerCase(), row.end.trim().toLowerCase(), row.purpose.trim().toLowerCase(), Number(row.miles)].join('|');
}
export function mergeMileage(existing, incoming, createId = () => crypto.randomUUID()) {
  const seen = new Set(existing.map(mileageKey));
  const added = [];
  for (const row of incoming) {
    const key = mileageKey(row);
    if (seen.has(key)) continue;
    seen.add(key); added.push({ ...row, id: createId() });
  }
  return { rows: [...existing, ...added], skipped: incoming.length - added.length, added: added.length };
}
