-- Migration 1280: ITSCO contract clause library (seed via sync script)
-- Full clause text + configs are applied by:
--   node backend/src/seeds/syncItscoContractLibrary.js
-- Safe to re-run; upserts by agency_id + clause_key / slug.

SELECT 1;
