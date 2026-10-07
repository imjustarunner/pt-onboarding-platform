// Configuration and simulation only. Saving this workflow cannot activate a
// carrier route, place a call, collect a payment, or start a recording.
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
function text(value, max, field) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(`${field} must be text of at most ${max} characters.`);
  return value.trim();
}
export function normalizeWorkflowPhone(value, optional = false) {
  const raw = String(value ?? '').trim();
  if (!raw && optional) return '';
  if (!/^[+\d\s().-]+$/.test(raw)) fail('Use a US or Canadian phone number without an extension.');
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (!/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) fail('Use a complete US or Canadian phone number, including area code.');
  return `+${digits}`;
}
export function defaultPhoneWorkflow(name = 'our team') {
  const labels = ['Support', 'Scheduling', 'Billing', 'Provider assistance'];
  return {
    version: 1, mainNumber: '', greeting: `Thank you for calling ${name}.`,
    timeZone: 'America/Denver', businessHoursEnabled: true,
    hours: Array.from({length: 7}, (_, day) => ({ day, open: day > 0 && day < 6, start: '09:00', end: '17:00' })),
    afterHours: 'voicemail', holdMusicId: '',
    voicemailGreeting: 'Our team is unavailable. Please leave your name, callback number, and a brief message after the tone.',
    menu: Array.from({length: 10}, (_, key) => ({ key: String(key), enabled: key < 4, label: labels[key] || `Option ${key}`, ringMode: 'sequential', ringSeconds: 20, targets: [], ticketTopic: key === 2 ? 'billing' : 'general', fallback: key === 0 ? 'voicemail' : 'support' }))
  };
}
export function normalizePhoneWorkflow(value) {
  if (!object(value)) fail('Phone workflow is required.');
  if (value.live === true || value.status === 'active') fail('Live phone routing cannot be enabled from this setup screen.');
  const mainNumber = normalizeWorkflowPhone(value.mainNumber, true);
  const greeting = text(value.greeting, 1000, 'Greeting');
  const voicemailGreeting = text(value.voicemailGreeting, 1000, 'Voicemail greeting');
  if (!greeting || !voicemailGreeting) fail('Add both a greeting and a voicemail greeting.');
  const timeZone = text(value.timeZone, 80, 'Time zone');
  try { new Intl.DateTimeFormat('en-US', {timeZone}).format(); } catch { fail('Choose a valid time zone.'); }
  if (typeof value.businessHoursEnabled !== 'boolean') fail('Choose whether business hours apply.');
  if (!['support', 'voicemail'].includes(value.afterHours)) fail('Choose an after-hours destination.');
  if (!Array.isArray(value.hours) || value.hours.length !== 7) fail('Provide hours for each day of the week.');
  const hours = value.hours.map((h, day) => {
    if (!object(h) || h.day !== day || typeof h.open !== 'boolean') fail('Provide each day once, Sunday through Saturday.');
    const validTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    if (!validTime(h.start) || !validTime(h.end) || h.start >= h.end) fail('Hours must end after they start. Split overnight coverage across days.');
    return {day, open: h.open, start: h.start, end: h.end};
  });
  const holdMusicId = text(value.holdMusicId ?? '', 240, 'Hold music');
  if (!Array.isArray(value.menu) || value.menu.length !== 10) fail('Provide one menu option for each digit 0–9.');
  const menu = value.menu.map((item, index) => {
    if (!object(item) || item.key !== String(index) || typeof item.enabled !== 'boolean') fail('Provide menu digits 0–9 in order, without duplicates.');
    if (index === 0 && !item.enabled) fail('Keep 0 enabled for support.');
    const label = index === 0 ? 'Support' : text(item.label, 60, `Option ${index} label`);
    if (!label) fail(`Add a label for option ${index}.`);
    if (!['sequential','simultaneous'].includes(item.ringMode)) fail(`Choose a ring mode for option ${index}.`);
    if (!Number.isInteger(item.ringSeconds) || item.ringSeconds < 10 || item.ringSeconds > 45) fail('Ring duration must be 10–45 seconds.');
    if (!['support','voicemail'].includes(item.fallback) || (index === 0 && item.fallback !== 'voicemail')) fail('Support must end in voicemail, without looping back to itself.');
    if (!Array.isArray(item.targets) || item.targets.length > 5) fail('Each option supports up to five destinations.');
    const seen = new Set();
    const targets = item.targets.map((target) => {
      if (!object(target)) fail('Invalid destination.');
      const phone = normalizeWorkflowPhone(target.phone);
      if (phone === mainNumber) fail('A destination cannot be the public main number; that would create a call loop.');
      if (seen.has(phone)) fail(`Remove the duplicate destination in option ${index}.`);
      seen.add(phone);
      const label = text(target.label, 80, 'Destination name');
      if (!label) fail('Give each destination a name.');
      return {label, phone};
    });
    const ticketTopic = item.ticketTopic ?? (index === 2 ? 'billing' : 'general');
    if (!['billing','general'].includes(ticketTopic)) fail('Choose Billing or General support for follow-up tickets.');
    return {ticketTopic, key: String(index), enabled: item.enabled, label, ringMode: item.ringMode, ringSeconds: item.ringSeconds, targets, fallback: item.fallback};
  });
  return {version: 1, mainNumber, greeting, timeZone, businessHoursEnabled: value.businessHoursEnabled, hours, afterHours: value.afterHours, holdMusicId, voicemailGreeting, menu};
}
export function phoneWorkflowIssues(config) {
  const issues = [];
  if (!config.mainNumber) issues.push('Choose the intended public main number. Saving it here does not port or change that number.');
  for (const option of config.menu.filter((o) => o.enabled)) {
    if (!option.targets.length) issues.push(`Option ${option.key} (${option.label}) has no destinations and will use its fallback.`);
  }
  if (config.businessHoursEnabled && !config.hours.some((h) => h.open)) issues.push('All days are closed; only the after-hours route will be used.');
  return issues;
}
export function isPhoneWorkflowOpen(config, at = new Date()) {
  if (!config.businessHoursEnabled) return true;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: config.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(at).map((p) => [p.type,p.value]));
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const h = config.hours[day];
  const time = `${parts.hour}:${parts.minute}`;
  return !!h?.open && time >= h.start && time < h.end;
}
export function phoneMenuPrompt(config) {
  return `${config.greeting} ${config.menu.filter((o) => o.enabled).map((o) => `For ${o.label}, press ${o.key}.`).join(' ')}`;
}
export function previewPhoneWorkflow(config, {digit = '0', hours = 'current', at = new Date()} = {}) {
  if (!['current','open','closed'].includes(hours)) fail('Invalid preview hours.');
  if (typeof digit !== 'string' || !/^(\d|invalid|none)$/.test(digit)) fail('Choose a menu digit, no input, or invalid input.');
  const open = hours === 'current' ? isPhoneWorkflowOpen(config, at) : hours === 'open';
  const selectedOption = open ? config.menu.find((o) => o.key === digit && o.enabled) : null;
  const ticketTopic = selectedOption?.ticketTopic ?? (selectedOption?.key === '2' ? 'billing' : config.menu[0]?.ticketTopic || 'general');
  const followUp = {topic:ticketTopic,status:'open',autoCloseOnAnswer:false,destination:ticketTopic==='billing'?'Ticket Desk → Billing':'Ticket Desk → General support'};
  const steps = [];
  const voicemail = () => steps.push({type: 'voicemail', text: config.voicemailGreeting, destination: followUp.destination, ticketTopic,
    recordingNotice: 'Your voicemail will be recorded and transcribed for our team to review.',
    transcription: {requested:true,status:'not_connected',retainAudio:true,reviewAgainstAudio:true,notificationIncludesTranscript:false}
  });
  function group(option, isFallback = false) {
    if (option.targets.length) steps.push({type: 'ring', key: option.key, label: option.label, mode: option.ringMode, seconds: option.ringSeconds, targets: option.targets, onAnswer: 'Staff presses 1 to accept; connect only the first accepting person and stop other ringing.', isFallback});
    if (option.key !== '0' && option.fallback === 'support') {
      steps.push({type:'fallback', text: 'If no one accepts, try support.'});
      group(config.menu[0], true);
    } else voicemail();
  }
  if (!open) {
    steps.push({type:'notice', text:'Outside the configured business hours.'});
    if (config.afterHours === 'support') group(config.menu[0]); else voicemail();
  } else {
    steps.push({type:'greeting', text: phoneMenuPrompt(config)});
    const option = config.menu.find((o) => o.key === digit && o.enabled);
    if (!option) steps.push({type:'notice', text:'No selection or an unavailable option: route to support.'});
    group(option || config.menu[0]);
  }
  return {simulation: true, callsPlaced: false, followUp, open, holdMusicId: config.holdMusicId, steps};
}
