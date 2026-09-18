/**
 * Seed per-tenant forms@ identities, support@ mailboxes, website URLs, email chrome, and quotes.
 * Mental Range is a public entity only — no agency, no forms mailbox.
 *
 * Usage: node backend/scripts/seed-tenant-email-profiles.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';
import Agency from '../src/models/Agency.model.js';
import EmailSenderIdentity from '../src/models/EmailSenderIdentity.model.js';
import Storage from '../src/services/storage.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TENANTS = [
  {
    match: { id: 2 },
    name: 'ITSCO',
    websiteUrl: 'https://itsco.health',
    formsEmail: 'forms@itsco.health',
    formsDisplay: 'ITSCO Forms',
    supportEmail: 'support@itsco.health',
    supportDisplay: 'ITSCO Support',
    chrome: { header: '/email-branding/itsco/email-header.png', footer: '/email-branding/itsco/email-footer.png' },
    tagline: null,
    keepItscoTagline: true
  },
  {
    match: { id: 1 },
    name: 'PlotTwistCo',
    websiteUrl: 'https://plottwistco.com',
    formsEmail: 'forms@plottwistco.com',
    formsDisplay: 'PlotTwistCo Forms',
    supportEmail: 'Support@plottwistco.com',
    supportDisplay: 'PlotTwistCo Support',
    chrome: { header: '/email-branding/plottwistco/email-header.png', footer: '/email-branding/plottwistco/email-footer.png' },
    tagline: null
  },
  {
    match: { id: 6 },
    name: 'Next Level Up',
    websiteUrl: 'https://nextleveluplcc.com',
    formsEmail: 'forms@nextleveluplcc.com',
    formsDisplay: 'NLU Forms',
    supportEmail: 'support@nextleveluplcc.com',
    supportDisplay: 'NLU Support',
    chrome: { header: '/email-branding/nlu/email-header.png', footer: '/email-branding/nlu/email-footer.png' },
    tagline: 'Small steps. Big possibilities.'
  },
  {
    match: { id: 377 },
    name: 'The Inner Strength Institute',
    websiteUrl: 'https://theinnerstrengthinstitute.com',
    formsEmail: 'forms@innerstrengthin.com',
    formsDisplay: 'TISI Forms',
    supportEmail: 'Support@innerstrengthin.com',
    supportDisplay: 'TISI Support',
    chrome: { header: '/email-branding/innerstrength/email-header.png', footer: '/email-branding/innerstrength/email-footer.png' },
    tagline: 'STRONGER PEOPLE. BRIGHTER TOMORROWS.'
  }
];

const MH4KIDZ = {
  name: 'MH4kidz',
  officialName: 'MH4kidz',
  slug: 'mh4kidz',
  portalUrl: 'mh4kidz',
  websiteUrl: 'https://mh4kidz.org',
  customDomain: 'mh4kidz.org',
  logoUrl: '/assets/mh4kidz/logo.png',
  colorPalette: { primary: '#317e32', secondary: '#08263e' },
  formsEmail: 'forms@mh4kidz.org',
  formsDisplay: 'MH4kidz Forms',
  supportEmail: 'support@mh4kidz.org',
  supportDisplay: 'MH4kidz Support',
  chrome: { header: '/email-branding/mh4kidz/email-header.png', footer: '/email-branding/mh4kidz/email-footer.png' },
  tagline: 'Stronger kids. Brighter tomorrows.'
};

async function ensureWebsiteUrl(agencyId, websiteUrl) {
  await pool.execute(`UPDATE agencies SET website_url = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`, [
    websiteUrl,
    agencyId
  ]);
}

async function ensureChromeAndTagline(agencyId, chrome, tagline, { keepExistingTagline = false } = {}) {
  const [rows] = await pool.execute(
    `SELECT agency_id, html_email_header_url, html_email_footer_url, signature_tagline
     FROM agency_email_settings WHERE agency_id = ? LIMIT 1`,
    [agencyId]
  );
  const row = rows?.[0] || null;
  const header = row?.html_email_header_url || chrome.header;
  const footer = row?.html_email_footer_url || chrome.footer;
  const nextTagline = keepExistingTagline
    ? row?.signature_tagline ?? null
    : tagline;
  if (!row) {
    await pool.execute(
      `INSERT INTO agency_email_settings
        (agency_id, notifications_enabled, html_email_header_url, html_email_footer_url, signature_tagline)
       VALUES (?, 1, ?, ?, ?)`,
      [agencyId, header, footer, nextTagline]
    );
    return;
  }
  await pool.execute(
    `UPDATE agency_email_settings
     SET html_email_header_url = ?, html_email_footer_url = ?, signature_tagline = ?
     WHERE agency_id = ?`,
    [header, footer, nextTagline, agencyId]
  );
}

async function ensureFormsIdentity(agencyId, { fromEmail, displayName, replyTo }) {
  const supportReply = replyTo || fromEmail;
  const existing = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'forms');
  if (existing) {
    const updates = {};
    if (!String(existing.from_email || '').includes('@')) updates.fromEmail = fromEmail;
    if (/itsco/i.test(String(existing.display_name || '')) && !/itsco/i.test(displayName)) {
      updates.displayName = displayName;
    }
    if (String(existing.reply_to || '').toLowerCase() !== String(supportReply).toLowerCase()) {
      updates.replyTo = supportReply;
    }
    if (Object.keys(updates).length) await EmailSenderIdentity.update(existing.id, updates);
    return existing.id;
  }
  const created = await EmailSenderIdentity.create({
    agencyId,
    identityKey: 'forms',
    displayName,
    fromEmail,
    replyTo: supportReply,
    inboundAddresses: [fromEmail],
    isActive: true
  });
  return created.id;
}

async function ensureSupportIdentity(agencyId, { fromEmail, displayName }) {
  const existing = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'support');
  if (existing) {
    const updates = {};
    if (!String(existing.from_email || '').includes('@')) updates.fromEmail = fromEmail;
    if (String(existing.reply_to || '').toLowerCase() !== String(fromEmail).toLowerCase()) {
      updates.replyTo = fromEmail;
    }
    if (Object.keys(updates).length) await EmailSenderIdentity.update(existing.id, updates);
    return existing.id;
  }
  const created = await EmailSenderIdentity.create({
    agencyId,
    identityKey: 'support',
    displayName,
    fromEmail,
    replyTo: fromEmail,
    inboundAddresses: [fromEmail],
    isActive: true
  });
  return created.id;
}

async function ensureSupportTeamEmail(agencyId, supportEmail) {
  await pool.execute(`UPDATE agencies SET support_team_email = ? WHERE id = ?`, [supportEmail, agencyId]);
}

async function stripCopiedItscoSocials(agencyId, agencyName) {
  if (/itsco/i.test(agencyName)) return;
  const [rows] = await pool.execute(
    `SELECT id, platform, url FROM agency_social_links WHERE agency_id = ?`,
    [agencyId]
  );
  for (const row of rows || []) {
    const url = String(row.url || '').toLowerCase();
    if (url.includes('itsco') || url.includes('intheschoolcounselor')) {
      await pool.execute(`DELETE FROM agency_social_links WHERE id = ?`, [row.id]);
      console.log(`  removed ITSCO social copy ${row.platform} from agency ${agencyId}`);
    }
  }
}

async function ensureMh4kidz() {
  const [existing] = await pool.execute(
    `SELECT id, name, slug, portal_url FROM agencies
     WHERE slug = 'mh4kidz' OR portal_url = 'mh4kidz' OR name LIKE 'MH4kidz%'
     LIMIT 1`
  );
  let agency = existing?.[0] || null;
  if (!agency) {
    agency = await Agency.create({
      name: MH4KIDZ.name,
      slug: MH4KIDZ.slug,
      officialName: MH4KIDZ.officialName,
      logoUrl: MH4KIDZ.logoUrl,
      colorPalette: MH4KIDZ.colorPalette,
      isActive: true,
      portalUrl: MH4KIDZ.portalUrl,
      customDomain: MH4KIDZ.customDomain,
      websiteUrl: MH4KIDZ.websiteUrl,
      organizationType: 'agency',
      onboardingTeamEmail: MH4KIDZ.supportEmail,
      supportTeamEmail: MH4KIDZ.supportEmail
    });
    console.log(`created MH4kidz agency id=${agency.id}`);
  } else {
    console.log(`MH4kidz already exists id=${agency.id}`);
    await pool.execute(
      `UPDATE agencies
       SET website_url = COALESCE(NULLIF(website_url, ''), ?),
           logo_url = COALESCE(NULLIF(logo_url, ''), ?),
           color_palette = COALESCE(color_palette, ?)
       WHERE id = ?`,
      [MH4KIDZ.websiteUrl, MH4KIDZ.logoUrl, JSON.stringify(MH4KIDZ.colorPalette), agency.id]
    );
  }
  await ensureWebsiteUrl(agency.id, MH4KIDZ.websiteUrl);
  await ensureChromeAndTagline(agency.id, MH4KIDZ.chrome, MH4KIDZ.tagline);
  await ensureSupportIdentity(agency.id, {
    fromEmail: MH4KIDZ.supportEmail,
    displayName: MH4KIDZ.supportDisplay
  });
  await ensureFormsIdentity(agency.id, {
    fromEmail: MH4KIDZ.formsEmail,
    displayName: MH4KIDZ.formsDisplay,
    replyTo: MH4KIDZ.supportEmail
  });
  await ensureSupportTeamEmail(agency.id, MH4KIDZ.supportEmail);
  await seedMh4kidzLogo();
  await seedChromeUploads(agency.id, 'mh4kidz');
  await pool.execute(
    `UPDATE agencies
     SET onboarding_team_email = ?
     WHERE id = ? AND (onboarding_team_email IS NULL OR onboarding_team_email = '' OR LOWER(onboarding_team_email) LIKE 'forms@%')`,
    [MH4KIDZ.supportEmail, agency.id]
  );
  await pool.execute(
    `UPDATE public_website_support_sites
     SET support_agency_id = ?, logo_url = COALESCE(NULLIF(logo_url, ''), ?)
     WHERE slug = 'mh4kidz'`,
    [agency.id, MH4KIDZ.logoUrl]
  );
  return agency.id;
}

async function seedPlotTwistCoPhoenixLogo() {
  const logoPath = path.join(__dirname, '../../frontend/public/assets/ptco/logo.png');
  const markPath = path.join(__dirname, '../../frontend/public/email-signatures/staff-html/plottwistco-mark.png');
  try {
    const logoBuf = fs.readFileSync(logoPath);
    const saved = await Storage.saveLogo(logoBuf, `plottwistco-phoenix-${Date.now()}.png`, 'image/png');
    await pool.execute(`UPDATE agencies SET logo_path = ?, logo_url = ? WHERE id = 1`, [
      saved.path,
      '/assets/ptco/logo.png'
    ]);
  if (fs.existsSync(markPath)) {
    const markBuf = fs.readFileSync(markPath);
    await Storage.saveLogo(markBuf, 'plottwistco-email-mark.png', 'image/png');
  }
  const iconsDir = path.join(__dirname, '../../frontend/public/email-signatures/staff-html');
  for (const name of ['icon-email-white.png', 'icon-phone-white.png', 'icon-web-white.png']) {
    const iconPath = path.join(iconsDir, name);
    if (fs.existsSync(iconPath)) {
      await Storage.saveLogo(fs.readFileSync(iconPath), name, 'image/png');
    }
  }
    console.log(`  PlotTwistCo red phoenix logo ${saved.path}`);
  } catch (e) {
    console.warn('  PlotTwistCo GCS logo upload failed:', e?.message || e);
    await pool.execute(`UPDATE agencies SET logo_url = ? WHERE id = 1`, ['/assets/ptco/logo.png']);
  }
  await pool.execute(
    `UPDATE public_website_support_sites SET logo_url = ? WHERE slug IN ('ptco', 'plottwistco')`,
    ['/assets/ptco/logo.png']
  );
}

async function seedMh4kidzLogo() {
  const candidates = [
    path.join(__dirname, '../../assets/mh4kidzlogo.png'),
    path.join(__dirname, '../../assets/mh4kidzlogo.PNG'),
    path.join(__dirname, '../../assets/mh4kidzwebsiteassets/mh4kidzlogo.png'),
    '/tmp/mh4kidz-logo-email.png',
    path.join(__dirname, '../../frontend/public/assets/mh4kidz/logo.png')
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn('  MH4kidz logo file not found');
    return;
  }
  const saved = await Storage.saveLogo(fs.readFileSync(src), `mh4kidz-logo-${Date.now()}.png`, 'image/png');
  await pool.execute(`UPDATE agencies SET logo_path = ?, logo_url = ? WHERE id = 434`, [
    saved.path,
    '/assets/mh4kidz/logo.png'
  ]);
  await pool.execute(`UPDATE public_website_support_sites SET logo_url = ? WHERE slug = 'mh4kidz'`, [
    '/assets/mh4kidz/logo.png'
  ]);
  console.log(`  MH4kidz logo ${src} -> ${saved.path}`);
}

async function seedChromeUploads(agencyId, slug) {
  const dir = path.join(__dirname, `../../frontend/public/email-branding/${slug}`);
  const headerFile = path.join(dir, 'email-header.png');
  const footerFile = path.join(dir, 'email-footer.png');
  if (!fs.existsSync(headerFile) || !fs.existsSync(footerFile)) {
    console.warn(`  chrome files missing for ${slug}`);
    return;
  }
  const header = await Storage.saveLogo(fs.readFileSync(headerFile), `${slug}-email-header.png`, 'image/png');
  const footer = await Storage.saveLogo(fs.readFileSync(footerFile), `${slug}-email-footer.png`, 'image/png');
  await pool.execute(
    `INSERT INTO agency_email_settings (agency_id, notifications_enabled, html_email_header_url, html_email_footer_url)
     VALUES (?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE html_email_header_url = VALUES(html_email_header_url), html_email_footer_url = VALUES(html_email_footer_url)`,
    [agencyId, header.path, footer.path]
  );
  console.log(`  chrome ${slug} ${header.path}`);
}

async function seedRangeLogo() {
  await pool.execute(
    `UPDATE public_website_support_sites
     SET logo_url = COALESCE(NULLIF(logo_url, ''), ?)
     WHERE slug = 'range'`,
    ['/assets/range/logo.svg']
  );
}

try {
  for (const tenant of TENANTS) {
    const [rows] = await pool.execute(
      `SELECT id, name, official_name, website_url FROM agencies WHERE id = ? LIMIT 1`,
      [tenant.match.id]
    );
    const agency = rows?.[0];
    if (!agency) {
      console.log(`skip missing agency ${tenant.name} id=${tenant.match.id}`);
      continue;
    }
    console.log(`seeding ${agency.name} (${agency.id})`);
    await ensureWebsiteUrl(agency.id, tenant.websiteUrl);
    await ensureChromeAndTagline(agency.id, tenant.chrome, tenant.tagline, {
      keepExistingTagline: Boolean(tenant.keepItscoTagline)
    });
    await ensureFormsIdentity(agency.id, {
      fromEmail: tenant.formsEmail,
      displayName: tenant.formsDisplay,
      replyTo: tenant.supportEmail
    });
    await ensureSupportIdentity(agency.id, {
      fromEmail: tenant.supportEmail,
      displayName: tenant.supportDisplay
    });
    await ensureSupportTeamEmail(agency.id, tenant.supportEmail);
    const chromeSlug = String(tenant.chrome?.header || '').split('/')[2] || null;
    if (chromeSlug) await seedChromeUploads(agency.id, chromeSlug);
    await stripCopiedItscoSocials(agency.id, agency.name);
    if (agency.id === 6) {
      await pool.execute(`DELETE FROM agency_social_links WHERE agency_id = 6`);
      console.log('  cleared guessed Next Level Up social placeholders');
    }
  }

  await seedPlotTwistCoPhoenixLogo();
  const mhId = await ensureMh4kidz();
  await seedRangeLogo();

  const [identities] = await pool.execute(
    `SELECT i.id, i.agency_id, a.name, i.identity_key, i.display_name, i.from_email, i.reply_to
     FROM email_sender_identities i
     JOIN agencies a ON a.id = i.agency_id
     WHERE i.identity_key IN ('forms', 'support')
       AND i.agency_id IN (1, 2, 6, 377, ?)
     ORDER BY i.agency_id, i.identity_key`,
    [mhId]
  );
  console.log('forms/support identities', identities);

  const [socials] = await pool.execute(
    `SELECT agency_id, platform, url FROM agency_social_links
     WHERE agency_id IN (1, 2, 6, 377, ?)
     ORDER BY agency_id, sort_order`,
    [mhId]
  );
  console.log('socials', socials);
} finally {
  await pool.end();
}
