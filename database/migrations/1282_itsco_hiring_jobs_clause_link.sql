-- Migration 1282: ITSCO hiring jobs linked to per-JD contract clauses (text sections, not PDF)
-- Data seeded via: node backend/src/seeds/syncItscoHiringJobsAndClauses.js
-- Only JD ids 15, 16, 17 remain active; all batch postings stored as structured text.

SELECT 1;
