export const TRANSITION_INBOX = 'transitions@auricwell.com';
export const TRANSITION_AUTOMATION = 'auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com';
export const TRANSITION_LIVE_SCHEDULE = [
 ['2026-11-25T11:00:00-07:00','2026-11-25T12:30:00-07:00'],
 ['2026-11-25T14:00:00-07:00','2026-11-25T15:30:00-07:00'],
 ['2026-11-27T12:00:00-07:00','2026-11-27T13:30:00-07:00'],
 ['2026-11-27T16:00:00-07:00','2026-11-27T17:30:00-07:00']
].map(([startAt,endAt])=>({startAt,endAt,modality:'video'}));
