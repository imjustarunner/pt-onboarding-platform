/**
 * Email App Assistant — extensible intent registry for app@tenant inbound mail.
 *
 * To add a capability: create an intent module under ./intents and register it here.
 * Cursor rule: .cursor/rules/email-app-assistant.mdc
 */

import { officeIntents } from './intents/offices.js';
import { schoolIntents } from './intents/schools.js';
import { taskIntents } from './intents/tasks.js';
import { helpIntents } from './intents/help.js';
import { presenceIntents } from './intents/presence.js';

/** @typedef {'any_member'|'privileged'} AppEmailRoleGate */

/**
 * @typedef {object} AppEmailIntent
 * @property {string} key
 * @property {string} label
 * @property {AppEmailRoleGate} roles
 * @property {string[]} examples
 * @property {(text: string, ctx: object) => boolean|object|null} match
 * @property {(ctx: object, matchResult?: object) => Promise<{ text: string, clearSession?: boolean, session?: object|null }>} handle
 */

/** @type {AppEmailIntent[]} */
export const APP_EMAIL_INTENTS = [
  ...helpIntents,
  ...officeIntents,
  ...schoolIntents,
  ...taskIntents,
  ...presenceIntents
];

export function listIntentsForRole(isPrivileged) {
  return APP_EMAIL_INTENTS.filter((i) => i.roles === 'any_member' || isPrivileged);
}

export function matchIntent(text, ctx = {}) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  for (const intent of APP_EMAIL_INTENTS) {
    const hit = intent.match(normalized, ctx);
    if (hit) {
      return { intent, matchResult: hit === true ? {} : hit };
    }
  }
  return null;
}
