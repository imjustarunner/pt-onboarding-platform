/* Migration 315: Reset pending access locks (DB-backed).
   NOTE: This is NOT related to the "Too many login attempts" rate limiter, which is in-memory.
*/

UPDATE users
SET pending_access_locked = FALSE
WHERE pending_access_locked = TRUE;

