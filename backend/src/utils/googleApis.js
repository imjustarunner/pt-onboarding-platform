// Load only the Workspace APIs this app uses. The googleapis root eagerly loads
// hundreds of unrelated API definitions on every new backend instance.
import { auth, calendar } from 'googleapis/build/src/apis/calendar/index.js';
import { gmail } from 'googleapis/build/src/apis/gmail/index.js';
import { drive } from 'googleapis/build/src/apis/drive/index.js';
import { admin } from 'googleapis/build/src/apis/admin/index.js';
import { groupssettings } from 'googleapis/build/src/apis/groupssettings/index.js';
import { meet } from 'googleapis/build/src/apis/meet/index.js';

// Preserve the factories' shared context and the same AuthPlus implementation.
export const google = { auth, calendar, gmail, drive, admin, groupssettings, meet, _options: {} };
