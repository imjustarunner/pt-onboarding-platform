import { createGooglePublication } from '../services/calendarPublication.service.js';
import { familyCalendarView } from '../services/familyCalendarView.service.js';
import express from 'express';
import { getFamilyPocket, addFamilyPocketItems } from '../services/familyEmail.service.js';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { getMyWeather } from '../controllers/weather.controller.js';
import { familyCookieOptions, familyHash, requireFamilySession, startFamilySession, unlockFamily, assertFamilyBenefit } from '../services/familyAuth.service.js';
import { familyError, familyEnabled } from '../services/familyPolicy.js';
import { requireHousehold } from '../services/familyAuth.service.js';
import { getHomeTools, saveHomePreferences, addFamilyPhoto, getFamilyPhoto, removeFamilyPhoto, chooseDecision, chooseFamilyTakeout, generateFamilyRecipe, saveFamilyRecipe, addRecipeIngredients } from '../services/familyHomeTools.service.js';
import { listFamilyCalendars, connectFamilyCalendar, previewFamilyCalendar, importFamilyCalendarEvent, disconnectFamilyCalendar } from '../services/familyCalendar.service.js';
import { createHousehold, householdDashboard, addChild, updateMember, createInvite, joinHousehold, saveFamilyEntry, actOnEntry, familyTransaction } from '../services/family.service.js';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: { message: 'Too many attempts. Please wait 15 minutes before trying again.' } } });
// A family cookie is isolated from workplace authentication and is never accepted by workplace APIs.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: { message: 'Open the family dashboard to make changes.' } });
  next();
});
router.get('/tenant', wrap(async (req, res) => {
  const agencyId = Number(req.query.agencyId) || 0;
  const slug = String(req.query.organization || 'mentalrange').trim().toLowerCase();
  const agency = agencyId ? await Agency.findById(agencyId) :
    (await Agency.findByPortalUrl(slug) || await Agency.findBySlug(slug) || (slug === 'mentalrange' ? await Agency.findByCustomDomain('app.mentalrange.org') : null));
  if (!agency || !agency.is_active || !familyEnabled(agency.feature_flags)) throw familyError('Family Command Center is not enabled for this organization. Ask your organization administrator to enable it.', 403);
  res.json({ id: agency.id, name: agency.name });
}));
router.post('/unlock', loginLimiter, wrap(async (req, res) => {
  const token = await unlockFamily(req.body || {});
  res.cookie('fcc_session', token, familyCookieOptions).json({ ok: true });
}));
router.post('/launch', authenticate, wrap(async (req, res) => {
  const agencyId = Number(req.body.agencyId);
  await assertFamilyBenefit(req.user.id, agencyId);
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.execute('INSERT INTO family_launch_tokens (token_hash,user_id,agency_id,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 2 MINUTE))', [familyHash(token), req.user.id, agencyId]);
  const origin = process.env.FAMILY_COMMAND_CENTER_ORIGIN || 'https://qv.app.mentalrange.org';
  res.json({ url: `${origin}/family#launch=${token}` });
}));
router.post('/exchange', loginLimiter, wrap(async (req, res) => {
  const launch = await familyTransaction(async db => {
    const [rows] = await db.execute('SELECT * FROM family_launch_tokens WHERE token_hash=? AND expires_at>NOW() AND consumed_at IS NULL FOR UPDATE', [familyHash(req.body.token)]);
    if (!rows[0]) throw familyError('This launch link has expired. Open Family Command Center again.', 401);
    await db.execute('UPDATE family_launch_tokens SET consumed_at=NOW() WHERE token_hash=?', [familyHash(req.body.token)]);
    return rows[0];
  });
  const token = await startFamilySession(launch.user_id, launch.agency_id);
  res.cookie('fcc_session', token, familyCookieOptions).json({ ok: true });
}));
router.get('/schedule-details', authenticate, wrap(async (req, res) => {
  // Only one's own schedule projection reveals private household details in the workplace UI.
  const [rows] = await pool.execute(`SELECT l.schedule_event_id,e.title,e.metadata FROM family_schedule_links l
    JOIN provider_schedule_events p ON p.id=l.schedule_event_id AND p.provider_id=? AND p.status='ACTIVE'
    JOIN family_entries e ON e.id=l.entry_id JOIN family_members m ON m.household_id=e.household_id AND m.user_id=?
    JOIN family_households h ON h.id=e.household_id JOIN agencies a ON a.id=h.agency_id
    WHERE p.end_at>=DATE_SUB(NOW(),INTERVAL 1 YEAR) AND JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.familyCommandCenterEnabled')) IN ('true','1') LIMIT 2000`, [req.user.id, req.user.id]);
  res.json(rows);
}));
router.post('/logout', wrap(async (req, res) => {
  if (req.cookies?.fcc_session) await pool.execute('UPDATE family_device_sessions SET revoked_at=NOW() WHERE token_hash=?', [familyHash(req.cookies.fcc_session)]);
  res.clearCookie('fcc_session', { ...familyCookieOptions, maxAge: undefined }).json({ ok: true });
}));
router.use(requireFamilySession);
router.get('/households/:id/calendar-view', wrap(async(req,res)=>res.json(await familyCalendarView(req.family,req.params.id,req.query))));
router.get('/households/:id/pocket', wrap(async(req,res)=>res.json(await getFamilyPocket(req.family,req.params.id))));
router.post('/households/:id/pocket/items', wrap(async(req,res)=>res.status(201).json(await addFamilyPocketItems(req.family,req.params.id,req.body))));
router.get('/households/:id/google/calendars', wrap(async(req,res)=>res.json(await listFamilyCalendars(req.family,req.params.id))));
router.post('/households/:id/google/connect', wrap(async(req,res)=>res.json(await connectFamilyCalendar(req.family,req.params.id,req.body))));
router.get('/households/:id/google/events', wrap(async(req,res)=>res.json(await previewFamilyCalendar(req.family,req.params.id))));
router.post('/households/:id/google/import', wrap(async(req,res)=>res.status(201).json(await importFamilyCalendarEvent(req.family,req.params.id,req.body))));
router.delete('/households/:id/google', wrap(async(req,res)=>{await disconnectFamilyCalendar(req.family,req.params.id);res.json({ok:true});}));
const recipeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyGenerator: req => String(req.family.userId), standardHeaders: true, legacyHeaders: false, message: { error: { message: 'You’ve tried 20 meal ideas this hour. Come back for more shortly.' } } });
router.get('/households/:id/tools', wrap(async (req,res) => res.json(await getHomeTools(req.family,req.params.id))));
router.put('/households/:id/preferences', wrap(async (req,res) => res.json(await saveHomePreferences(req.family,req.params.id,req.body))));
router.post('/households/:id/photos', wrap(async (req,res) => res.status(201).json(await addFamilyPhoto(req.family,req.params.id,req.body))));
router.get('/households/:id/photos/:photoId', wrap(async (req,res) => { const photo = await getFamilyPhoto(req.family,req.params.id,req.params.photoId); res.type(photo.type).send(photo.bytes); }));
router.delete('/households/:id/photos/:photoId', wrap(async (req,res) => { await removeFamilyPhoto(req.family,req.params.id,req.params.photoId); res.json({ok:true}); }));
router.post('/households/:id/decide', wrap(async (req,res) => { await requireHousehold(req.family,req.params.id); res.json({choice:chooseDecision(req.body.options)}); }));
router.post('/households/:id/takeout/choose', wrap(async (req,res) => res.json(await chooseFamilyTakeout(req.family,req.params.id,req.body))));
router.post('/households/:id/recipes/generate', recipeLimiter, wrap(async (req,res) => res.json(await generateFamilyRecipe(req.family,req.params.id,req.body))));
router.post('/households/:id/recipes', wrap(async (req,res) => res.status(201).json(await saveFamilyRecipe(req.family,req.params.id,req.body))));
router.post('/households/:id/recipes/:entryId/ingredients', wrap(async (req,res) => res.json(await addRecipeIngredients(req.family,req.params.id,req.params.entryId,req.body))));
router.get('/me', wrap(async (req, res) => {
  const [households] = await pool.execute('SELECT h.id,h.name,m.role FROM family_households h JOIN family_members m ON m.household_id=h.id WHERE h.agency_id=? AND m.user_id=?', [req.family.agencyId, req.family.userId]);
  res.json({ ...req.family, households });
}));
router.get('/weather', (req, res, next) => { req.user = { id: req.family.userId }; return getMyWeather(req, res, next); });
router.post('/households', wrap(async (req, res) => {
  const household=await createHousehold(req.family,req.body);
  try { await createGooglePublication(req.family,household.id); }
  catch { household.calendarWarning='Your household is ready. Open Calendar to finish Google sharing when Workspace access is available.'; }
  res.status(201).json(household);
}));
router.post('/join', wrap(async (req, res) => res.json(await joinHousehold(req.family, req.body))));
router.get('/households/:id', wrap(async (req, res) => res.json(await householdDashboard(req.family, req.params.id))));
router.post('/households/:id/members', wrap(async (req, res) => res.status(201).json(await addChild(req.family, req.params.id, req.body))));
router.patch('/households/:id/members/:userId', wrap(async (req, res) => { await updateMember(req.family, req.params.id, req.params.userId, req.body); res.json({ ok: true }); }));
router.post('/households/:id/invites', wrap(async (req, res) => res.json(await createInvite(req.family, req.params.id, req.body))));
router.post('/households/:id/entries', wrap(async (req, res) => res.status(201).json(await saveFamilyEntry(req.family, req.params.id, req.body))));
router.put('/households/:id/entries/:entryId', wrap(async (req, res) => res.json(await saveFamilyEntry(req.family, req.params.id, req.body, Number(req.params.entryId)))));
router.post('/households/:id/entries/:entryId/actions', wrap(async (req, res) => res.json(await actOnEntry(req.family, req.params.id, req.params.entryId, req.body))));
export default router;
