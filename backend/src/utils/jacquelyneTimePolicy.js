export const JACQUELYNE_TIME_START = '2026-10-29';
export const isJacquelyneTimeUser = (agencyId, userId) => Number(agencyId) === 2 && Number(userId) === 485;
export const isJacquelyneActivity = key => String(key || '').startsWith('jacquelyne_');
export const isJacquelyneHuddle = (event, userId) => isJacquelyneTimeUser(event?.agency_id, userId) && event?.kind === 'HUDDLE';
