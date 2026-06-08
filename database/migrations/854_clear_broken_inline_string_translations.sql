-- Migration 854: clear broken inline_string translation cache
--
-- The translateStrings endpoint passed sourceId=0 for all inline form-question
-- strings, but getOrCreateTranslation rejected sourceId <= 0 and returned the
-- original English text without calling the AI. Those English copies were
-- cached as valid translations. This deletes all inline_string cache rows so
-- they are re-generated correctly (in Spanish) on next request.

DELETE FROM translations WHERE source_type = 'inline_string';
