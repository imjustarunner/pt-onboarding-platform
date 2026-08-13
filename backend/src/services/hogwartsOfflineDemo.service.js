/**
 * Build an emailable offline Hogwarts school-portal demo zip.
 * Frozen API JSON + bundled SPA + uploads + a local Node server.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import Agency from '../models/Agency.model.js';
import {
  DEMO_SCHOOL_ADMIN_USER_ID,
  handleDemoPortalGet,
  getDemoSchoolMeta,
  resolveHogwartsCore
} from './schoolOnboardingDemoPortal.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TOKEN = 'public';
const KNOWN_DEMO_PROVIDER_IDS = [1007, 1008, 1009, 1010, 1017];

function templateDir() {
  const candidates = [
    path.join(process.cwd(), 'tools/hogwarts-offline-demo'),
    path.join(__dirname, '../../../tools/hogwarts-offline-demo')
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'server.mjs'))) || null;
}

function frontendDistDir() {
  const candidates = [
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), '../frontend/dist'),
    path.join(__dirname, '../../../frontend/dist')
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null;
}

function uploadsRoot() {
  const candidates = [
    path.join(process.cwd(), 'uploads'),
    path.join(__dirname, '../../uploads')
  ];
  return candidates.find((dir) => fs.existsSync(dir)) || null;
}

function setRoute(routes, method, urlPath, body) {
  const key = `${String(method || 'GET').toUpperCase()} ${urlPath}`;
  routes[key] = body;
}

async function portal(rest, query = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v != null && v !== '') q.set(k, String(v));
  }
  const qs = q.toString();
  const pathRest = String(rest || '').replace(/^\/+|\/+$/g, '');
  const urlPath = `/api/public/school-onboarding/demo/portal${pathRest ? `/${pathRest}` : ''}`;
  const data = await handleDemoPortalGet(TOKEN, pathRest, query);
  return { urlPath, qs, data };
}

function collectIds(value, into) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, into);
    return;
  }
  if (typeof value === 'object') {
    const pid = Number(value.provider_user_id || 0);
    if (pid > 0) into.add(pid);
    for (const v of Object.values(value)) collectIds(v, into);
  }
}

function collectTicketIds(value, into) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectTicketIds(item, into);
    return;
  }
  if (typeof value === 'object') {
    if (value.id && (value.subject || value.topic || value.ticket_id)) {
      into.add(Number(value.ticket_id || value.id));
    }
    if (Array.isArray(value.tickets)) collectTicketIds(value.tickets, into);
    for (const v of Object.values(value)) {
      if (v && typeof v === 'object') collectTicketIds(v, into);
    }
  }
}

function collectUploadRels(value, into) {
  if (!value) return;
  if (typeof value === 'string') {
    const m = value.match(/\/uploads\/([^?"'#]+)/i) || value.match(/^uploads\/([^?"'#]+)/i);
    if (m) into.add(decodeURIComponent(m[1]));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUploadRels(item, into);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectUploadRels(v, into);
  }
}

export async function collectHogwartsOfflineRoutes() {
  const routes = {};
  const addPortal = async (rest, query = {}) => {
    try {
      const { urlPath, qs, data } = await portal(rest, query);
      setRoute(routes, 'GET', urlPath, data);
      if (qs) setRoute(routes, 'GET', `${urlPath}?${qs}`, data);
      return data;
    } catch (err) {
      console.warn('[hogwartsOfflineDemo] skip', rest, err?.message || err);
      return null;
    }
  };

  const school = await getDemoSchoolMeta(TOKEN);
  const { demo } = await resolveHogwartsCore();
  setRoute(routes, 'GET', '/api/public/school-onboarding/demo/school', { school });
  setRoute(routes, 'GET', '/api/public/school-onboarding/demo', { demo });
  setRoute(routes, 'GET', '/api/auth/me', {
    id: DEMO_SCHOOL_ADMIN_USER_ID,
    first_name: 'Minerva',
    last_name: 'McGonagall',
    email: 'minerva.mcgonagall@hogwarts.edu',
    role: 'school_staff',
    isSchoolAdmin: true
  });

  try {
    const itsco = await Agency.findByPortalUrl('itsco');
    if (itsco) {
      const parse = (v) => {
        if (!v) return {};
        if (typeof v === 'object') return v;
        try { return JSON.parse(v); } catch { return {}; }
      };
      const theme = {
        brandingAgencyId: itsco.id,
        portalOrganizationId: itsco.id,
        colorPalette: parse(itsco.color_palette),
        logoUrl: itsco.logo_url || itsco.logo_path || null,
        iconUrl: itsco.icon_file_path || itsco.icon_path || null,
        themeSettings: parse(itsco.theme_settings),
        terminologySettings: parse(itsco.terminology_settings),
        agencyName: itsco.name
      };
      setRoute(routes, 'GET', '/api/agencies/portal/itsco/theme', theme);
    }
  } catch {
    // theme optional
  }

  await addPortal('');
  await addPortal('stats');
  await addPortal('days');
  const scheduling = await addPortal('providers/scheduling');
  await addPortal('clients');
  await addPortal('school-staff');
  await addPortal('affiliation');
  await addPortal('notifications/feed');
  await addPortal('announcements/banner');
  await addPortal('school-events');
  await addPortal('school-events/missing');
  await addPortal('faq');
  await addPortal('public-documents');
  await addPortal('intake-links');
  await addPortal('school-staff-waiver/status');
  await addPortal('client-assignment-search');
  await addPortal('my-roster');
  await addPortal('skill-builders-program');
  await addPortal('skills-groups');
  await addPortal('skills-group-meetings');
  await addPortal('psychotherapy-compliance/summary');
  const threads = await addPortal('chat/threads');
  const ticketsMine = await addPortal('support-tickets/mine');
  await addPortal('support-tickets');
  const clientTickets = await addPortal('support-tickets/client-tickets');
  await addPortal('client-tickets');
  await addPortal(`users/${DEMO_SCHOOL_ADMIN_USER_ID}/preferences`);

  const providerIds = new Set(KNOWN_DEMO_PROVIDER_IDS);
  collectIds(scheduling, providerIds);
  for (const day of WEEKDAYS) {
    const providers = await addPortal(`days/${day}/providers`);
    collectIds(providers, providerIds);
  }
  for (const pid of providerIds) {
    await addPortal(`providers/${pid}/profile`);
    await addPortal(`providers/${pid}/caseload-slots`);
    await addPortal(`providers/${pid}/assigned-clients`);
    for (const day of WEEKDAYS) {
      await addPortal(`providers/${pid}/assigned-clients`, { dayOfWeek: day });
      await addPortal(`days/${day}/providers/${pid}/soft-slots`);
    }
  }

  const threadList = Array.isArray(threads) ? threads : [];
  for (const t of threadList) {
    const id = t?.thread_id || t?.id;
    if (!id) continue;
    await addPortal(`chat/threads/${id}/messages`);
    await addPortal(`chat/threads/${id}/meta`);
  }

  const ticketIds = new Set();
  collectTicketIds(ticketsMine, ticketIds);
  collectTicketIds(clientTickets, ticketIds);
  for (const clientId of [1181, 1326, 1331]) {
    const packed = await addPortal('support-tickets/client-tickets', { clientId });
    collectTicketIds(packed, ticketIds);
  }
  for (const tid of ticketIds) {
    if (!tid) continue;
    await addPortal(`support-tickets/${tid}/messages`);
  }

  return routes;
}

function appendDir(archive, absDir, zipPrefix) {
  if (!absDir || !fs.existsSync(absDir)) return;
  archive.directory(absDir, zipPrefix);
}

export async function streamHogwartsOfflineDemoZip(res) {
  const templates = templateDir();
  if (!templates) {
    const err = new Error('Offline demo templates are missing from this server.');
    err.status = 500;
    throw err;
  }
  const routes = await collectHogwartsOfflineRoutes();
  const uploadRels = new Set();
  collectUploadRels(routes, uploadRels);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="hogwarts-school-portal-demo.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (e) => {
    if (!res.headersSent) {
      res.status(500).json({ error: { message: e.message || 'Failed to build zip' } });
    } else {
      res.end();
    }
  });
  archive.pipe(res);

  archive.file(path.join(templates, 'README.txt'), { name: 'README.txt' });
  archive.file(path.join(templates, 'server.mjs'), { name: 'server.mjs' });
  archive.file(path.join(templates, 'start.sh'), { name: 'start.sh', mode: 0o755 });
  archive.file(path.join(templates, 'start.command'), { name: 'start.command', mode: 0o755 });
  archive.file(path.join(templates, 'start.bat'), { name: 'start.bat' });
  archive.file(path.join(templates, 'preview.html'), { name: 'preview.html' });
  archive.append(JSON.stringify({
    generatedAt: new Date().toISOString(),
    demoPath: '/school-onboarding/demo',
    routeCount: Object.keys(routes).length,
    includesWebApp: !!frontendDistDir()
  }, null, 2), { name: 'MANIFEST.json' });
  archive.append(JSON.stringify(routes, null, 2), { name: 'api/routes.json' });

  const dist = frontendDistDir();
  if (dist) appendDir(archive, dist, 'web');

  const root = uploadsRoot();
  if (root) {
    for (const rel of uploadRels) {
      const abs = path.join(root, rel);
      if (abs.startsWith(root) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        archive.file(abs, { name: `uploads/${rel}` });
      }
    }
  }

  await archive.finalize();
}
