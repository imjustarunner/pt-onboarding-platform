/**
 * School coverage intents — admin / super_admin / support only.
 */
import { localDateParts } from '../helpers.js';
import { setSession } from '../reply.js';
import {
  findSchoolByName,
  formatSchoolDetailReply,
  formatSchoolRosterReply,
  listProvidersAtSchoolsToday,
  listProvidersForSchoolDay
} from '../queries/schools.js';

function extractSchoolName(text) {
  const s = String(text || '').trim();

  // Prefer trailing "for/at <SchoolName>" (… for Carter / … at Carter Elementary)
  const tail = s.match(
    /\b(?:for|at)\s+([A-Za-z][A-Za-z0-9'’-]*(?:\s+(?:Elementary|Middle|High|School|Academy|Charter))?(?:\s+School)?)\s*[?.!]*$/i
  );
  if (tail?.[1]) {
    const name = tail[1].trim();
    if (!/^(today|tomorrow|school|schools|what|who|which|day)$/i.test(name) && !/^what\b/i.test(name)) {
      return name;
    }
  }

  const patterns = [
    /\bproviders?\s+(?:at|for)\s+([A-Za-z][A-Za-z0-9 .'-]{1,60}?)(?:\s+today\b|[?.!]|$)/i,
    /\bwho\s+(?:is|are)\s+at\s+([A-Za-z][A-Za-z0-9 .'-]{1,60}?)(?:\s+today\b|[?.!]|$)/i,
    /\b(?:school)\s+([A-Za-z][A-Za-z0-9 .'-]{1,40})/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m?.[1]) continue;
    const name = String(m[1]).trim().replace(/[?.!,;:]+$/, '');
    if (!name) continue;
    if (/^(today|tomorrow|school|schools|what|who|which|day)$/i.test(name)) continue;
    if (/^what\b/i.test(name)) continue;
    return name;
  }
  return null;
}

function isSchoolIntent(text) {
  const s = String(text || '').toLowerCase();
  if (/\boffice\b|\boffices\b/.test(s)) return false;
  return (
    /\b(school|schools|elementary)\b/.test(s) ||
    /\bwho\s+is\s+at\s+what\s+school\b/.test(s) ||
    /\bproviders?\s+at\b/.test(s) ||
    /\bwho\s+(?:is|are)\s+at\b/.test(s)
  );
}

async function handleSchoolQuery(ctx, matchResult = {}) {
  const { agency, user, text, isPrivileged } = ctx;
  if (!isPrivileged) {
    return {
      text: 'School coverage questions are limited to admin, super admin, and support for this organization.',
      clearSession: true
    };
  }

  const tz = agency?.timezone || 'America/Denver';
  const parts = localDateParts(new Date(), tz);
  const schoolName = matchResult.schoolName || extractSchoolName(text);

  if (schoolName) {
    const found = await findSchoolByName(agency.id, schoolName);
    if (found?.ambiguous) {
      const names = found.matches.map((m) => `• ${m.schoolName}`).join('\n');
      await setSession(agency.id, user.id, 'school_status', { awaiting: 'school_name', weekday: parts.weekday });
      return {
        text: `I found more than one school matching "${schoolName}". Which one?\n\n${names}\n\nReply with the school name.`,
        clearSession: false
      };
    }
    if (!found?.schoolId) {
      await setSession(agency.id, user.id, 'school_status', { awaiting: 'school_name', weekday: parts.weekday });
      return {
        text: `I could not find a school matching "${schoolName}". Reply with the school name (e.g. Carter Elementary).`,
        clearSession: false
      };
    }
    const { school, providers } = await listProvidersForSchoolDay(agency.id, found.schoolId, parts.weekday);
    return {
      text: formatSchoolDetailReply({
        weekday: parts.weekday,
        dateYmd: parts.ymd,
        schoolName: school?.schoolName || found.schoolName,
        providers
      }),
      clearSession: true
    };
  }

  // All schools for today
  const rows = await listProvidersAtSchoolsToday(agency.id, parts.weekday);
  return {
    text: formatSchoolRosterReply({ weekday: parts.weekday, dateYmd: parts.ymd, rows }),
    clearSession: true
  };
}

export const schoolIntents = [
  {
    key: 'school_status',
    label: 'School provider coverage',
    roles: 'privileged',
    examples: [
      'Who is at what school today?',
      'Send me a list of who providers at what day for Carter',
      'Who is at Carter Elementary today?',
      'Providers at Carter today'
    ],
    match: (text) => {
      if (!isSchoolIntent(text)) return null;
      const schoolName = extractSchoolName(text);
      return schoolName ? { schoolName } : {};
    },
    handle: handleSchoolQuery
  }
];
