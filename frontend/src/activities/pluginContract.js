/**
 * ActivityPlugin contract (Phase 1 — first-party Vue adapters).
 * See docs/COUNSELING_SESSION_ACTIVITY_SYSTEM_SPEC.md
 */

/**
 * @typedef {Object} ActivityManifest
 * @property {string} id
 * @property {string} displayName
 * @property {string} status
 * @property {string[]} platforms
 * @property {string} launchMode
 */

/**
 * @typedef {Object} ActivityContext
 * @property {string|number} sessionId
 * @property {string|number} [organizationId]
 * @property {'provider'|'client'} role
 * @property {'mobile'|'web'} platform
 * @property {object} [accessibility]
 * @property {Function} publishSharedState
 * @property {Function} onComplete
 * @property {Function} onPause
 * @property {Function} onExit
 */

export const ACTIVITY_PLUGIN_METHODS = [
  'initialize',
  'start',
  'pause',
  'resume',
  'getSharedState',
  'createCheckpoint',
  'restoreCheckpoint',
  'complete',
  'teardown'
];

export function createPluginStub(manifest) {
  let state = {};
  return {
    manifest,
    async initialize() {},
    async start(initial) {
      state = { ...(initial || {}) };
    },
    async pause() {},
    async resume() {},
    getSharedState() {
      return state;
    },
    async createCheckpoint() {
      return { ...state };
    },
    async restoreCheckpoint(checkpoint) {
      state = { ...(checkpoint || {}) };
    },
    async complete() {},
    async teardown() {
      state = {};
    }
  };
}
