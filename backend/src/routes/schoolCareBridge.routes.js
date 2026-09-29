import express from 'express';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { sharedLoginLimiter } from '../middleware/loginProtection.middleware.js';
import { assertSchoolPortalAccess } from '../controllers/schoolPortalIntakeLinks.controller.js';
import { consumeRoutingHint, schoolCareBridgeDeployment } from '../services/schoolCareBridgeRouting.service.js';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const object = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const publicSchool = school => ({ id: school.id, slug: school.portal_url || school.slug, name: school.name, logoUrl: school.logo_url || school.logo_path || school.icon_file_path || null });
const available = school => school && school.organization_type === 'school' && !!school.is_active && !school.is_archived;

router.get('/schools/:slug', sharedLoginLimiter({ identify: true }), wrap(async (req, res) => {
  const school = await Agency.findByPortalUrl(req.params.slug);
  if (!available(school)) return res.status(404).json({ error: { message: 'This school portal is unavailable.' } });
  const [agencies] = await pool.execute(`SELECT DISTINCT a.id, a.name, a.slug, a.logo_url, a.logo_path
    FROM agencies a JOIN organization_affiliations oa ON oa.agency_id = a.id
    WHERE oa.organization_id = ? AND oa.is_active = TRUE AND a.is_active = TRUE
      AND COALESCE(a.is_archived, 0) = 0 ORDER BY a.name, a.id`, [school.id]);
  const theme = object(school.theme_settings);
  res.json({ school: { ...publicSchool(school), colors: object(school.color_palette),
    backgroundUrl: theme.schoolCareBridge?.loginBackground || theme.loginBackground || null,
    tagline: theme.schoolCareBridge?.tagline || '',
    agencies: agencies.map(publicSchool) } });
}));

router.get('/access/:slug', authenticate, wrap(async (req, res) => {
  const school = await Agency.findByPortalUrl(req.params.slug);
  if (!available(school)) return res.status(404).json({ error: { message: 'This school portal is unavailable.' } });
  await assertSchoolPortalAccess(req, school.id);
  res.set('Cache-Control', 'no-store').json({ school: publicSchool(school) });
}));

router.get('/my-schools', authenticate, wrap(async (req, res) => {
  const [candidates] = await pool.execute("SELECT id, name, slug, portal_url, logo_url, logo_path FROM agencies WHERE organization_type = 'school' AND is_active = TRUE AND COALESCE(is_archived, 0) = 0 ORDER BY name");
  const schools = [];
  // Use the same server permission evaluator as existing school workflows.
  // Do not infer access from the public affiliation strip.
  for (const school of candidates) {
    try { await assertSchoolPortalAccess(req, school.id); schools.push(publicSchool(school)); }
    catch (error) { if (error.statusCode !== 403) throw error; }
  }
  res.set('Cache-Control', 'no-store').json({ schools });
}));

router.post('/routing-hint/consume', sharedLoginLimiter({ identify: true }), wrap(async (req, res) => {
  const destination = String(req.body?.destination || '');
  let target;
  try { target = new URL(destination); } catch { return res.status(400).json({ error: { message: 'Invalid destination.' } }); }
  // A caller cannot redeem a hint for a different browser origin.
  if (req.get('origin') !== target.origin) return res.status(403).json({ error: { message: 'Destination mismatch.' } });
  const username = await consumeRoutingHint(pool, { token: req.body?.token, destination });
  res.set('Cache-Control', 'no-store');
  if (!username) return res.status(410).json({ error: { message: 'This sign-in link has expired. Enter your email to continue.' } });
  res.json({ username });
}));

async function billingConfiguration() {
  const [[row]] = await pool.execute('SELECT * FROM schoolcarebridge_program_config WHERE id = 1');
  const operator = row?.operator_agency_id ? await Agency.findById(row.operator_agency_id) : null;
  const account = operator ? await AgencyBillingAccount.getByAgencyId(operator.id) : null;
  return { operatorAgencyId: operator?.id || null, operatorName: 'MH4Kidz', revenueRecipient: 'MH4Kidz', invoiceIssuer: 'Plot Twist Co',
    billingAccountReady: !!account, setupComplete: !!operator && !!account, chargesEnabled: false, invoiceIssuanceEnabled: false,
    deployment: schoolCareBridgeDeployment() };
}
router.get('/program-config', authenticate, requireSuperAdmin, wrap(async (req, res) => res.json(await billingConfiguration())));
router.put('/program-config', authenticate, requireSuperAdmin, wrap(async (req, res) => {
  const id = Number(req.body?.operatorAgencyId);
  const operator = Number.isSafeInteger(id) && id > 0 ? await Agency.findById(id) : null;
  if (!operator || operator.slug !== 'mh4kidz' || operator.organization_type !== 'agency' || !operator.is_active) return res.status(400).json({ error: { message: 'Select the active MH4Kidz agency record.' } });
  await pool.execute('UPDATE schoolcarebridge_program_config SET operator_agency_id = ? WHERE id = 1', [id]);
  res.json(await billingConfiguration());
}));
export default router;
