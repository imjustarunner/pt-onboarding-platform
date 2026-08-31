/**
 * Office intents — available to every approved tenant member.
 */
import { extractClockTime, localDateParts } from '../helpers.js';
import {
  formatOfficeRosterReply,
  getAvailableOfficeSlots,
  getOfficeRoster
} from '../queries/offices.js';

function isOfficeIntent(text) {
  const s = String(text || '').toLowerCase();
  if (!/\boffice\b|\boffices\b/.test(s) && !/\bin\s+office\b/.test(s)) return false;
  return (
    /\b(who|what|which|any|list|show|available|booked|assigned|open|free|unassigned)\b/.test(s) ||
    /\bin\s+office\b/.test(s) ||
    /\boffice\s+(today|booked|available|assigned)\b/.test(s)
  );
}

function wantsAvailable(text) {
  const s = String(text || '').toLowerCase();
  return /\b(available|open|free|unassigned|empty)\b/.test(s) && !/\bbooked\b/.test(s) && !/\bwho\b/.test(s);
}

function wantsBooked(text) {
  const s = String(text || '').toLowerCase();
  return (
    /\b(booked|assigned|who\s+is\s+in|who'?s\s+in|who\s+has)\b/.test(s) ||
    /\bin\s+office\b/.test(s)
  );
}

async function handleOfficeQuery(ctx) {
  const { agency, text } = ctx;
  const tz = agency?.timezone || 'America/Denver';
  const parts = localDateParts(new Date(), tz);
  const atTime = extractClockTime(text);
  const availableOnly = wantsAvailable(text) && !wantsBooked(text);
  const bookedOnly = wantsBooked(text) && !wantsAvailable(text);

  const rosterRows = availableOnly
    ? []
    : await getOfficeRoster({ agencyId: agency.id, dateYmd: parts.ymd });
  const availableRows = bookedOnly && !atTime
    ? []
    : await getAvailableOfficeSlots({
        agencyId: agency.id,
        dateYmd: parts.ymd,
        atTime
      });

  // If they asked for available at a time, still show booked overlapping that time lightly
  let rosterForReply = rosterRows;
  if (atTime && rosterRows.length) {
    const targetMin = atTime.hour * 60 + (atTime.min || 0);
    rosterForReply = rosterRows.filter((row) => {
      const sm = String(row.start_at).match(/(\d{2}):(\d{2})/);
      const em = String(row.end_at).match(/(\d{2}):(\d{2})/);
      if (!sm || !em) return true;
      const sMin = Number(sm[1]) * 60 + Number(sm[2]);
      const eMin = Number(em[1]) * 60 + Number(em[2]);
      return targetMin >= sMin && targetMin < eMin;
    });
  }

  const textOut = formatOfficeRosterReply({
    dateYmd: parts.ymd,
    weekday: parts.weekday,
    rosterRows: availableOnly ? [] : rosterForReply,
    availableRows: bookedOnly && !atTime ? [] : availableRows,
    atTime,
    timeZone: tz
  });

  return { text: textOut, clearSession: true };
}

export const officeIntents = [
  {
    key: 'office_status',
    label: 'Office booked / available',
    roles: 'any_member',
    examples: [
      'Who is in office today?',
      'What offices are booked today?',
      'What offices are available today?',
      'What office is available at 12pm today?',
      'Which offices have assigned or booked?'
    ],
    match: (text) => (isOfficeIntent(text) ? {} : null),
    handle: handleOfficeQuery
  }
];
