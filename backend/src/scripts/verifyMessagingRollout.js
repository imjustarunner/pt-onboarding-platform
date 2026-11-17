import pool from '../config/database.js';
import { verifyMessagingRollout } from '../services/messagingRolloutReadiness.service.js';
try { console.log(JSON.stringify(await verifyMessagingRollout(pool))); }
catch (error) { console.error(JSON.stringify({ actorSource:'messaging_rollout_audit',code:error.code || 'MESSAGING_AUDIT_FAILED' }));process.exitCode=1; }
finally { await pool.end(); }
