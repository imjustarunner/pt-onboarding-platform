import crypto from 'node:crypto';

export const MANAGEMENT_SERVICE_CATEGORIES = [
  { key: 'platforms', label: 'Core platforms' },
  { key: 'operations', label: 'Business operations & marketing' },
  { key: 'clinical', label: 'Clinical & credentialing' },
  { key: 'incorporation', label: 'Incorporation & setup' },
  { key: 'management', label: 'Management' },
  { key: 'space', label: 'Space / sublease — separate agreement' }
];
const all = ['coaching', 'consulting', 'tutoring', 'counseling'];
const service = (id, name, category, amountCents, cadence = 'monthly', extra = {}) => ({
  id, name, category, amountCents, cadence, rateBps: 0, discountEligible: true,
  businessTypes: all, includedInManagement: false, notes: '', ...extra
});

// Owner-authorized starting rates: approximately 75% of supplied range midpoints.
// The managed discount is applied once, to these starting rates.
export const DEFAULT_MANAGEMENT_SERVICE_CATALOG = {
  managedDiscountBps: 2000,
  services: [
    service('organization-platform', 'Organization Platform', 'platforms', 9300, 'monthly', { includedInManagement: true, notes: 'Availability, calendar, scheduling, sessions, client portal and basic CRM.' }),
    service('people-operations-platform', 'People Operations Platform', 'platforms', 7800, 'monthly', { notes: 'Onboarding, offboarding, contractors/employees and compliance documents.' }),
    service('ehr-platform', 'EHR / Clinical Platform', 'platforms', 12300, 'monthly', { businessTypes: ['counseling'], notes: 'Clinical notes, treatment plans and clinical records; separate from coaching.' }),
    service('website-marketing-hub', 'Website + Marketing Hub', 'platforms', 14925, 'monthly', { notes: 'Hosting, ongoing edits, updates, materials and booking embed; separately elected.' }),
    service('marketing-management', 'Marketing management', 'operations', 45000, 'monthly', { includedInManagement: true, notes: 'Content and lead-generation support. Advertising spend requires separate approval.' }),
    service('bookkeeping', 'Bookkeeping / basic financial tracking', 'operations', 22500, 'monthly', { includedInManagement: true }),
    service('people-ops-support', 'Onboarding / offboarding & people ops support', 'operations', 16875, 'monthly', { includedInManagement: true }),
    service('compliance-support', 'Compliance calendar & reminders', 'operations', 22500, 'monthly', { includedInManagement: true, notes: 'Operational support; clinical/HIPAA scope is agreed separately when applicable.' }),
    service('credentialing-initial', 'Initial credentialing — per payer / provider', 'clinical', 18750, 'once', { businessTypes: ['counseling'] }),
    service('credentialing-maintenance', 'Credentialing maintenance — per provider', 'clinical', 9375, 'annual', { businessTypes: ['counseling'] }),
    service('medical-billing', 'Medical billing', 'clinical', 0, 'collections_percent', { rateBps: 525, businessTypes: ['counseling'], notes: 'Percentage of collected clinical revenue; not coaching package revenue.' }),
    service('incorporation', 'Incorporation / business setup', 'incorporation', 52425, 'once', { managedBaseAmountCents: 22425, notes: 'Managed setup starts from the supplied $299 tier at 75%, then receives the 20% managed discount. Government filing and third-party fees are separate.' }),
    service('full-management', 'Full management package', 'management', 37500, 'monthly', { notes: 'Organization Platform, bookkeeping, marketing management, compliance calendar and people-ops support. Replaced by the agreed revenue share when that exceeds the discounted fixed monthly fee.' }),
    service('management-revenue-share', 'Management revenue replacement', 'management', 0, 'revenue_percent', { rateBps: 1000, discountEligible: false, notes: '10% replaces the fixed management fee once it is higher; never stacked on that fee.' }),
    service('space-sublease', 'Space / sublease', 'space', 0, 'session_revenue_percent', { rateBps: 800, discountEligible: false, notes: '8% of in-building session revenue, or separately agreed hourly pricing. Always a separate agreement.' })
  ]
};

export function catalogServicePrice(catalog, item, managed = false) {
  const discounted = managed && item.discountEligible !== false;
  const factor = discounted ? (10000 - catalog.managedDiscountBps) / 10000 : 1;
  const base = managed && item.managedBaseAmountCents != null ? item.managedBaseAmountCents : item.amountCents;
  return { amountCents: Math.round(base * factor), rateBps: Math.round(item.rateBps * factor) };
}

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const integer = (value, max, field) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(400, `Check ${field}.`);
  return value;
};
export function validateManagementServiceCatalog(input) {
  if (!input || !Array.isArray(input.services) || input.services.length > 100) fail(400, 'Provide a service catalog with at most 100 services.');
  const managedDiscountBps = integer(input.managedDiscountBps, 10000, 'managed discount');
  const services = input.services.map(raw => {
    if (!raw || typeof raw !== 'object') fail(400, 'Check service details.');
    const text = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : fail(400, 'Check service text.');
    if (!Array.isArray(raw.businessTypes)) fail(400, 'Choose valid business types.');
    const item = {
      id: text(raw.id, 80), name: text(raw.name, 160), category: raw.category,
      amountCents: integer(raw.amountCents, 100000000, 'service price'), rateBps: integer(raw.rateBps, 10000, 'service percentage'),
      cadence: raw.cadence, discountEligible: raw.discountEligible === true,
      includedInManagement: raw.includedInManagement === true, notes: text(raw.notes, 1500),
      businessTypes: [...new Set(raw.businessTypes || [])]
    };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id) || !item.name || !MANAGEMENT_SERVICE_CATEGORIES.some(c => c.key === item.category)) fail(400, 'Choose a service name, identifier and category.');
    if (!['monthly', 'once', 'annual', 'collections_percent', 'revenue_percent', 'session_revenue_percent'].includes(item.cadence)) fail(400, 'Choose a valid billing frequency.');
    if (!item.businessTypes.length || item.businessTypes.some(t => !all.includes(t))) fail(400, 'Choose valid business types.');
    if (item.cadence.endsWith('_percent') && item.amountCents !== 0) fail(400, 'Percentage services must have a zero fixed price.');
    if (!item.cadence.endsWith('_percent') && item.rateBps !== 0) fail(400, 'Fixed-price services must have a zero percentage.');
    if (raw.managedBaseAmountCents != null) item.managedBaseAmountCents = integer(raw.managedBaseAmountCents, 100000000, 'managed starting price');
    return item;
  });
  if (new Set(services.map(s => s.id)).size !== services.length) fail(400, 'Service identifiers must be unique.');
  return { managedDiscountBps, services };
}

export async function canManageServiceCatalog(db, user) {
  if (user?.role === 'super_admin') return true;
  if (!user?.id) return false;
  const [[membership]] = await db.execute(`SELECT ua.user_id FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
    WHERE ua.user_id=? AND a.slug='plottwistco' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND ua.is_active=1
    AND (ua.agency_role='admin' OR ?='admin') LIMIT 1`, [user.id, user.role]);
  return !!membership;
}

export function createManagementServiceCatalog(db) {
  const read = async connection => {
    const [[row]] = await connection.execute('SELECT catalog_json,revision FROM management_service_catalog WHERE id=1');
    return { catalog: row ? (typeof row.catalog_json === 'string' ? JSON.parse(row.catalog_json) : row.catalog_json) : structuredClone(DEFAULT_MANAGEMENT_SERVICE_CATALOG), revision: row?.revision || 0 };
  };
  return {
    async get(user) { return { ...await read(db), categories: MANAGEMENT_SERVICE_CATEGORIES, canEdit: await canManageServiceCatalog(db, user) }; },
    async save(input, user) {
      if (!await canManageServiceCatalog(db, user)) fail(403, 'PlotTwistCo administrator access is required to edit service prices.');
      const catalog = validateManagementServiceCatalog(input.catalog);
      integer(input.revision, 100000000, 'catalog revision');
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        // The singleton row is installed by migration, including when no custom catalog exists yet.
        const [[row]] = await connection.execute('SELECT revision FROM management_service_catalog WHERE id=1 FOR UPDATE');
        if ((row?.revision || 0) !== input.revision) fail(409, 'Service prices changed. Reload before saving your edits.');
        const revision = input.revision + 1;
        await connection.execute('INSERT INTO management_service_catalog (id,catalog_json,revision,updated_by) VALUES (1,?,?,?) ON DUPLICATE KEY UPDATE catalog_json=VALUES(catalog_json),revision=VALUES(revision),updated_by=VALUES(updated_by)', [JSON.stringify(catalog), revision, user.id]);
        await connection.execute('INSERT INTO management_service_catalog_events (id,revision,actor_user_id,catalog_json) VALUES (?,?,?,?)', [crypto.randomUUID(), revision, user.id, JSON.stringify(catalog)]);
        await connection.commit();
        return { catalog, revision, categories: MANAGEMENT_SERVICE_CATEGORIES, canEdit: true };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }
  };
}
