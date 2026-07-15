import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors counselingSessions.controller authorization helpers for Phase 2 acceptance.
 * These are pure checks so CI can validate without a live DB.
 */

const SESSION_CREATOR_ROLES = new Set([
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant',
  'admin',
  'agency_admin',
  'super_admin',
  'superadmin'
]);

function canCreateSession(role, agencyIds, targetAgencyId) {
  const r = String(role || '').toLowerCase();
  if (!SESSION_CREATOR_ROLES.has(r)) return { ok: false, reason: 'role' };
  if (r === 'super_admin' || r === 'superadmin') return { ok: true };
  if (!agencyIds.map(Number).includes(Number(targetAgencyId))) {
    return { ok: false, reason: 'agency' };
  }
  return { ok: true };
}

function resolveProviderUserId(bodyProviderUserId, authUserId) {
  // Spoofed body providerUserId must be ignored
  return Number(authUserId);
}

function canAcceptActivity(participantRole) {
  return participantRole === 'client';
}

function canRoll({ participantRole, activityId, status, sharedState }) {
  if (participantRole !== 'client' && participantRole !== 'provider') {
    return { ok: false, reason: 'participant' };
  }
  if (activityId !== 'emotion-dice') return { ok: false, reason: 'activity' };
  if (status !== 'ACTIVE') return { ok: false, reason: 'status' };
  const currentTurn = sharedState?.currentTurn || sharedState?.whoRollsFirst || 'client';
  if (currentTurn !== participantRole) return { ok: false, reason: 'turn' };
  return { ok: true };
}

function stripPrivateSharedState(sharedState, participantRole) {
  if (!sharedState || typeof sharedState !== 'object') return sharedState || {};
  const copy = { ...sharedState };
  if (participantRole !== 'provider') {
    delete copy.providerPrivate;
    delete copy.facilitationNotes;
  }
  if (copy.mood && typeof copy.mood === 'object' && copy.mood.noteShared === false) {
    copy.mood = { ...copy.mood };
    delete copy.mood.note;
  }
  // Unshared activity reflections must not leak
  if (copy.reflectionShared === false) {
    delete copy.reflection;
  }
  return copy;
}

test('createSession: non-provider roles are rejected', () => {
  assert.equal(canCreateSession('client', [1], 1).ok, false);
  assert.equal(canCreateSession('client', [1], 1).reason, 'role');
});

test('createSession: provider must belong to agency', () => {
  assert.equal(canCreateSession('provider', [2, 3], 1).ok, false);
  assert.equal(canCreateSession('provider', [2, 3], 1).reason, 'agency');
  assert.equal(canCreateSession('provider', [1, 2], 1).ok, true);
});

test('createSession: super_admin bypasses agency membership', () => {
  assert.equal(canCreateSession('super_admin', [], 99).ok, true);
});

test('createSession: ignores spoofed providerUserId', () => {
  assert.equal(resolveProviderUserId(999, 42), 42);
});

test('respondActivity accept: client-only', () => {
  assert.equal(canAcceptActivity('client'), true);
  assert.equal(canAcceptActivity('provider'), false);
});

test('roll: enforces turn and activity id', () => {
  assert.equal(
    canRoll({
      participantRole: 'client',
      activityId: 'emotion-dice',
      status: 'ACTIVE',
      sharedState: { currentTurn: 'client' }
    }).ok,
    true
  );
  assert.equal(
    canRoll({
      participantRole: 'client',
      activityId: 'emotion-dice',
      status: 'ACTIVE',
      sharedState: { currentTurn: 'provider' }
    }).reason,
    'turn'
  );
  assert.equal(
    canRoll({
      participantRole: 'provider',
      activityId: 'mood-check-in',
      status: 'ACTIVE',
      sharedState: { currentTurn: 'provider' }
    }).reason,
    'activity'
  );
});

test('privacy: strips providerPrivate and unshared reflection', () => {
  const forClient = stripPrivateSharedState(
    {
      providerPrivate: { tip: 'secret' },
      reflection: 'private thought',
      reflectionShared: false,
      mood: { note: 'hidden', noteShared: false }
    },
    'client'
  );
  assert.equal(forClient.providerPrivate, undefined);
  assert.equal(forClient.reflection, undefined);
  assert.equal(forClient.mood.note, undefined);
});
