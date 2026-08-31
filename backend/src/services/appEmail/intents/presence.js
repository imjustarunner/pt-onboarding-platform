/**
 * Presence / planned-out intents — delegates to presenceEmailInbound parsers.
 * Available to approved members (presence handler enforces its own role set).
 */
import {
  parsePresenceEmailIntent,
  applyAvailableOffline,
  applyUnavailable,
  applyPlannedOut
} from '../../presenceEmailInbound.service.js';

function looksLikePresence(text) {
  const s = String(text || '').toLowerCase();
  return (
    /\bplanned\s+out\b/.test(s) ||
    /\bout\s+rest\s+of\b/.test(s) ||
    /\bunavailable\b/.test(s) ||
    /\bavailable\s+(logged\s+)?out\b/.test(s) ||
    /\bavailable\s+offline\b/.test(s) ||
    /\bout\s+for\s+the\s+day\b/.test(s) ||
    /\bmark\s+me\s+(as\s+)?(available|unavailable)\b/.test(s)
  );
}

async function resolveAgencyContext(userId, agency) {
  return {
    agencyId: agency.id,
    userId,
    timeZone: String(agency.timezone || agency.time_zone || '').trim() || 'America/Denver'
  };
}

export const presenceIntents = [
  {
    key: 'presence_status',
    label: 'Presence / planned out',
    roles: 'any_member',
    examples: [
      'Planned out rest of day',
      'Unavailable',
      'Available offline, reachable text'
    ],
    match: (text) => (looksLikePresence(text) ? {} : null),
    handle: async (ctx) => {
      const parsed = parsePresenceEmailIntent({ subject: ctx.subject, body: ctx.text });
      if (!parsed?.ok || parsed.needsClarification) {
        return {
          text: parsed?.message || 'I could not tell what status to set. Try: Planned out rest of day — or email time@plottwistco.com.',
          clearSession: true
        };
      }
      try {
        let confirmation;
        if (parsed.intent === 'available_offline') {
          confirmation = await applyAvailableOffline(ctx.user.id, parsed);
        } else if (parsed.intent === 'unavailable') {
          confirmation = await applyUnavailable(ctx.user.id, parsed);
        } else if (parsed.intent === 'planned_out') {
          confirmation = await applyPlannedOut(
            ctx.user.id,
            parsed,
            await resolveAgencyContext(ctx.user.id, ctx.agency)
          );
        } else {
          confirmation = 'Unsupported presence action.';
        }
        return { text: confirmation, clearSession: true };
      } catch (err) {
        return {
          text: `Could not update presence (${err.message || 'error'}). Try the Team Board in the app, or email time@plottwistco.com.`,
          clearSession: true
        };
      }
    }
  }
];
