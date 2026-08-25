import pool from '../config/database.js';
import User from '../models/User.model.js';
import StorageService from './storage.service.js';
import * as gearInventory from './gearInventory.service.js';
import { maybeSendLowStockAlert, checkCountedStockAndAlert } from './gearLowStockAlert.service.js';

const CATALOG_CATEGORIES = Object.freeze([
  'gear',
  'equipment',
  'materials',
  'promotional',
  'outreach'
]);

const normalizeCategory = (raw) => {
  const v = String(raw || 'gear').trim().toLowerCase();
  return CATALOG_CATEGORIES.includes(v) ? v : 'gear';
};

const normalizeStockMode = (raw, category) => {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'MANUAL_LOW' || v === 'COUNTED') return v;
  if (['materials', 'promotional', 'outreach'].includes(String(category || '').toLowerCase())) {
    return 'MANUAL_LOW';
  }
  return 'COUNTED';
};

const normalizeTrackingMode = (raw, stockMode) => {
  if (stockMode === 'MANUAL_LOW') return 'NONE';
  const v = String(raw || 'SIZED_STOCK').trim().toUpperCase();
  if (v === 'UNIQUE_ASSET' || v === 'SIZED_STOCK') return v;
  return 'SIZED_STOCK';
};

const mapImage = (row) => ({
  id: row.id,
  catalogItemId: row.catalog_item_id,
  filePath: row.file_path,
  url: row.file_path?.startsWith('http') ? row.file_path : `/${String(row.file_path || '').replace(/^\//, '')}`,
  sortOrder: Number(row.sort_order || 0),
  isPrimary: !!row.is_primary
});

const mapOwner = (row) => {
  if (!row?.responsible_user_id) return null;
  return {
    id: row.responsible_user_id,
    firstName: row.owner_first_name || null,
    lastName: row.owner_last_name || null,
    email: row.owner_email || null,
    phone: row.owner_phone || null,
    name: [row.owner_first_name, row.owner_last_name].filter(Boolean).join(' ').trim() || null
  };
};

/** Tenant agencies eligible for Gear / Materials management. */
const TENANT_AGENCY_SQL = `
  LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(is_archived, 0) = 0
  AND LOWER(TRIM(name)) NOT LIKE '%(archived)%'
`;

/** Tenant agencies only (exclude schools / programs / archived / inactive). */
async function listTenantAgencyIds() {
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE ${TENANT_AGENCY_SQL}
     ORDER BY name ASC`
  );
  return (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
}

function isTruthyFlag(v) {
  return v === true || v === 1 || v === '1';
}

export async function actorCanManagePlatformGear(actor) {
  const role = String(actor?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const caps = actor?.capabilities || {};
  if (caps.canManagePlatformGear === true) return true;
  if (isTruthyFlag(actor?.has_platform_gear_access) || isTruthyFlag(actor?.hasPlatformGearAccess)) {
    return true;
  }
  // JWT req.user often lacks preference flags — load from DB.
  const uid = Number(actor?.id || 0);
  if (!uid) return false;
  try {
    const user = await User.findById(uid);
    return isTruthyFlag(user?.has_platform_gear_access);
  } catch {
    return false;
  }
}

export async function accessibleAgencyIds(actor) {
  const tenants = await listTenantAgencyIds();
  if (await actorCanManagePlatformGear(actor)) return tenants;

  const agencies = await User.getAgencies(actor?.id);
  const memberIds = new Set(
    (agencies || []).map((a) => Number(a.id)).filter((n) => n > 0)
  );
  // Membership ∩ tenant agencies only (no schools/sub-orgs in Gear).
  return tenants.filter((id) => memberIds.has(id));
}

export async function assertAgencyAccess(actor, agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });
  const ids = await accessibleAgencyIds(actor);
  if (!ids.includes(aid)) {
    throw Object.assign(new Error('You do not have Gear access to this tenant agency'), { status: 403 });
  }
  return aid;
}

async function loadImages(catalogItemIds) {
  const ids = [...new Set((catalogItemIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT * FROM gear_catalog_images
     WHERE catalog_item_id IN (${placeholders})
     ORDER BY is_primary DESC, sort_order ASC, id ASC`,
    ids
  );
  const map = new Map();
  for (const row of rows || []) {
    const cid = Number(row.catalog_item_id);
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(mapImage(row));
  }
  return map;
}

async function ensureAgencyTypeRow(catalog, agencyId, actorUserId) {
  const aid = Number(agencyId);
  const [[existing]] = await pool.execute(
    `SELECT gear_item_type_id FROM gear_catalog_agency
     WHERE catalog_item_id = ? AND agency_id = ? LIMIT 1`,
    [catalog.id, aid]
  );
  if (existing?.gear_item_type_id) return Number(existing.gear_item_type_id);

  if (catalog.stock_mode === 'MANUAL_LOW' || catalog.tracking_mode === 'NONE') {
    // Still create a lightweight type row so movements can reference it
    const trackingMode = 'SIZED_STOCK';
    const [result] = await pool.execute(
      `INSERT INTO gear_item_types
         (agency_id, catalog_item_id, name, category, tracking_mode, size_options_json,
          is_gendered, lifecycle_item_key, low_stock_threshold, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        aid,
        catalog.id,
        catalog.name,
        catalog.category,
        trackingMode,
        JSON.stringify([]),
        0,
        catalog.lifecycle_item_key || null,
        catalog.default_low_stock_threshold ?? 2
      ]
    );
    const typeId = result.insertId;
    await pool.execute(
      `UPDATE gear_catalog_agency SET gear_item_type_id = ? WHERE catalog_item_id = ? AND agency_id = ?`,
      [typeId, catalog.id, aid]
    );
    return typeId;
  }

  const created = await gearInventory.createType(
    aid,
    {
      name: catalog.name,
      category: catalog.category,
      trackingMode: catalog.tracking_mode === 'UNIQUE_ASSET' ? 'UNIQUE_ASSET' : 'SIZED_STOCK',
      isGendered: !!catalog.is_gendered,
      sizeOptions: catalog.sizeOptions || [],
      sizeOptionsByGender: catalog.sizeOptionsByGender || {},
      lifecycleItemKey: catalog.lifecycle_item_key || null,
      lowStockThreshold: catalog.default_low_stock_threshold ?? 2
    },
    actorUserId
  );

  await pool.execute(
    `UPDATE gear_item_types SET catalog_item_id = ? WHERE id = ?`,
    [catalog.id, created.id]
  );
  await pool.execute(
    `UPDATE gear_catalog_agency SET gear_item_type_id = ? WHERE catalog_item_id = ? AND agency_id = ?`,
    [created.id, catalog.id, aid]
  );
  return created.id;
}

const parseSizeOptionsJson = (raw, isGendered) => {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  }
  if (isGendered && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { sizeOptions: [], sizeOptionsByGender: parsed };
  }
  const arr = Array.isArray(parsed) ? parsed.map(String) : [];
  return { sizeOptions: arr, sizeOptionsByGender: {} };
};

async function fetchCatalogRow(id) {
  const [[row]] = await pool.execute(`SELECT * FROM gear_catalog_items WHERE id = ? LIMIT 1`, [Number(id)]);
  return row || null;
}

function parseStringListJson(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((s) => String(s || '').trim()).filter(Boolean);
}

function mapCatalogBase(row) {
  if (!row) return null;
  const isGendered = !!row.is_gendered;
  const sizes = parseSizeOptionsJson(row.size_options_json, isGendered);
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    sku: row.sku || null,
    unit: row.unit || 'Each',
    category: row.category,
    stockMode: row.stock_mode,
    trackingMode: row.tracking_mode,
    isGendered,
    sizeOptions: sizes.sizeOptions,
    sizeOptionsByGender: sizes.sizeOptionsByGender,
    variantColors: parseStringListJson(row.variant_colors_json),
    variantDecorations: parseStringListJson(row.variant_decorations_json),
    lifecycleItemKey: row.lifecycle_item_key || null,
    defaultLowStockThreshold: Number(row.default_low_stock_threshold ?? 2),
    allowManualLow: row.allow_manual_low !== 0,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function agencyStatusForEnrollment(enroll, catalog) {
  const threshold = enroll.low_stock_threshold != null
    ? Number(enroll.low_stock_threshold)
    : Number(catalog.default_low_stock_threshold ?? 2);

  let available = null;
  let status = 'healthy';

  if (catalog.stock_mode === 'MANUAL_LOW' || catalog.tracking_mode === 'NONE') {
    available = enroll.manual_is_low ? 'Manual Low' : 'OK';
    status = enroll.manual_is_low ? 'reorder' : 'healthy';
  } else if (enroll.gear_item_type_id) {
    const [[stock]] = await pool.execute(
      `SELECT COALESCE(SUM(quantity_on_hand), 0) AS qty
       FROM gear_stock_levels WHERE agency_id = ? AND gear_item_type_id = ?`,
      [enroll.agency_id, enroll.gear_item_type_id]
    );
    const [[assets]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM gear_unique_assets
       WHERE agency_id = ? AND gear_item_type_id = ? AND status = 'AVAILABLE'`,
      [enroll.agency_id, enroll.gear_item_type_id]
    );
    available = Number(stock?.qty || 0) + Number(assets?.c || 0);
    if (enroll.manual_is_low) status = 'reorder';
    else if (available <= threshold) status = available <= Math.max(0, threshold - 1) ? 'reorder' : 'low';
    else status = 'healthy';
  }

  return { available, status, threshold };
}

export async function getCatalogSummary(actor) {
  const agencyIds = await accessibleAgencyIds(actor);
  if (!agencyIds.length) {
    return {
      totalItemTypes: 0,
      totalInventory: 0,
      issuedSent30d: 0,
      lowStock: 0,
      agenciesManaged: 0
    };
  }
  const ph = agencyIds.map(() => '?').join(',');

  const [[types]] = await pool.execute(
    `SELECT COUNT(DISTINCT c.id) AS c
     FROM gear_catalog_items c
     JOIN gear_catalog_agency ca ON ca.catalog_item_id = c.id
     WHERE c.is_active = 1 AND ca.is_active = 1 AND ca.agency_id IN (${ph})`,
    agencyIds
  );

  const [[inv]] = await pool.execute(
    `SELECT COALESCE(SUM(s.quantity_on_hand), 0) AS qty
     FROM gear_stock_levels s
     WHERE s.agency_id IN (${ph})`,
    agencyIds
  );
  const [[assets]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM gear_unique_assets
     WHERE agency_id IN (${ph}) AND status = 'AVAILABLE'`,
    agencyIds
  );

  const [[moves]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM gear_stock_movements
     WHERE agency_id IN (${ph})
       AND movement_type IN ('ISSUE', 'SENT')
       AND created_at >= (NOW() - INTERVAL 30 DAY)`,
    agencyIds
  );

  const [[lowManual]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM gear_catalog_agency
     WHERE agency_id IN (${ph}) AND is_active = 1 AND manual_is_low = 1`,
    agencyIds
  );
  const [[lowCounted]] = await pool.execute(
    `SELECT COUNT(DISTINCT ca.id) AS c
     FROM gear_catalog_agency ca
     JOIN gear_catalog_items c ON c.id = ca.catalog_item_id
     LEFT JOIN (
       SELECT gear_item_type_id, agency_id, SUM(quantity_on_hand) AS qty
       FROM gear_stock_levels
       GROUP BY gear_item_type_id, agency_id
     ) s ON s.gear_item_type_id = ca.gear_item_type_id AND s.agency_id = ca.agency_id
     LEFT JOIN (
       SELECT gear_item_type_id, agency_id, COUNT(*) AS c
       FROM gear_unique_assets WHERE status = 'AVAILABLE'
       GROUP BY gear_item_type_id, agency_id
     ) a ON a.gear_item_type_id = ca.gear_item_type_id AND a.agency_id = ca.agency_id
     WHERE ca.agency_id IN (${ph}) AND ca.is_active = 1 AND ca.manual_is_low = 0
       AND c.stock_mode = 'COUNTED'
       AND (COALESCE(s.qty, 0) + COALESCE(a.c, 0))
           <= COALESCE(ca.low_stock_threshold, c.default_low_stock_threshold, 2)`,
    agencyIds
  );

  return {
    totalItemTypes: Number(types?.c || 0),
    totalInventory: Number(inv?.qty || 0) + Number(assets?.c || 0),
    issuedSent30d: Number(moves?.c || 0),
    lowStock: Number(lowManual?.c || 0) + Number(lowCounted?.c || 0),
    agenciesManaged: agencyIds.length
  };
}

/**
 * Merge active catalog items that share the same normalized name into one shared type.
 * Idempotent — safe to call on catalog list load.
 */
export async function mergeDuplicateCatalogItemsByName() {
  const [groups] = await pool.execute(
    `SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id, GROUP_CONCAT(id ORDER BY id) AS ids
     FROM gear_catalog_items
     WHERE is_active = 1
     GROUP BY LOWER(TRIM(name))
     HAVING COUNT(*) > 1`
  );
  if (!(groups || []).length) return { merged: 0 };

  let merged = 0;
  for (const g of groups) {
    const keepId = Number(g.keep_id);
    const ids = String(g.ids || '')
      .split(',')
      .map((x) => Number(x))
      .filter((id) => id > 0 && id !== keepId);

    for (const loseId of ids) {
      const [enrolls] = await pool.execute(
        `SELECT * FROM gear_catalog_agency WHERE catalog_item_id = ?`,
        [loseId]
      );
      for (const e of enrolls || []) {
        const [[existing]] = await pool.execute(
          `SELECT id FROM gear_catalog_agency
           WHERE catalog_item_id = ? AND agency_id = ? LIMIT 1`,
          [keepId, e.agency_id]
        );
        if (existing?.id) {
          await pool.execute(
            `UPDATE gear_catalog_agency SET
               gear_item_type_id = COALESCE(gear_item_type_id, ?),
               responsible_user_id = COALESCE(responsible_user_id, ?),
               manual_is_low = GREATEST(COALESCE(manual_is_low, 0), ?),
               is_active = GREATEST(COALESCE(is_active, 0), ?),
               low_stock_threshold = COALESCE(low_stock_threshold, ?)
             WHERE id = ?`,
            [
              e.gear_item_type_id,
              e.responsible_user_id,
              e.manual_is_low ? 1 : 0,
              e.is_active ? 1 : 0,
              e.low_stock_threshold,
              existing.id
            ]
          );
          await pool.execute(`DELETE FROM gear_catalog_agency WHERE id = ?`, [e.id]);
        } else {
          await pool.execute(
            `UPDATE gear_catalog_agency SET catalog_item_id = ? WHERE id = ?`,
            [keepId, e.id]
          );
        }
      }

      await pool.execute(
        `UPDATE gear_item_types SET catalog_item_id = ? WHERE catalog_item_id = ?`,
        [keepId, loseId]
      );
      await pool.execute(
        `UPDATE gear_catalog_images SET catalog_item_id = ? WHERE catalog_item_id = ?`,
        [keepId, loseId]
      );
      await pool.execute(
        `UPDATE gear_catalog_items SET is_active = 0 WHERE id = ?`,
        [loseId]
      );
      merged += 1;
    }
  }
  return { merged };
}

export async function listCatalog(actor, {
  agencyId = null,
  category = null,
  status = null,
  search = null,
  sort = 'type',
  includeInactive = false
} = {}) {
  try {
    await mergeDuplicateCatalogItemsByName();
  } catch (err) {
    console.warn('[gearCatalog] merge duplicates failed:', err?.message || err);
  }

  const agencyIds = await accessibleAgencyIds(actor);
  if (!agencyIds.length) return [];

  let filterAgencyIds = agencyIds;
  if (agencyId) {
    const aid = await assertAgencyAccess(actor, agencyId);
    filterAgencyIds = [aid];
  }
  const ph = filterAgencyIds.map(() => '?').join(',');
  const params = [...filterAgencyIds];

  let where = `ca.agency_id IN (${ph})`;
  if (!includeInactive) where += ' AND c.is_active = 1 AND ca.is_active = 1';
  if (category && category !== 'all') {
    where += ' AND c.category = ?';
    params.push(normalizeCategory(category));
  }
  if (search) {
    where += ' AND (c.name LIKE ? OR c.sku LIKE ? OR c.description LIKE ?)';
    const q = `%${String(search).trim()}%`;
    params.push(q, q, q);
  }

  const [rows] = await pool.execute(
    `SELECT
       c.*,
       ca.id AS enrollment_id,
       ca.agency_id,
       ca.gear_item_type_id,
       ca.responsible_user_id,
       ca.manual_is_low,
       ca.low_stock_threshold AS agency_low_stock_threshold,
       ca.last_low_alert_at,
       a.name AS agency_name,
       u.first_name AS owner_first_name,
       u.last_name AS owner_last_name,
       u.email AS owner_email,
       COALESCE(u.work_phone, u.personal_phone, u.system_phone_number) AS owner_phone
     FROM gear_catalog_items c
     JOIN gear_catalog_agency ca ON ca.catalog_item_id = c.id
     JOIN agencies a ON a.id = ca.agency_id
     LEFT JOIN users u ON u.id = ca.responsible_user_id
     WHERE ${where}
     ORDER BY c.name ASC, a.name ASC`,
    params
  );

  const byCatalog = new Map();
  for (const row of rows || []) {
    const cid = Number(row.id);
    if (!byCatalog.has(cid)) {
      byCatalog.set(cid, {
        ...mapCatalogBase(row),
        agencies: [],
        enrollmentRows: []
      });
    }
    const item = byCatalog.get(cid);
    item.enrollmentRows.push(row);
    item.agencies.push({
      enrollmentId: row.enrollment_id,
      agencyId: row.agency_id,
      agencyName: row.agency_name,
      gearItemTypeId: row.gear_item_type_id,
      responsibleUserId: row.responsible_user_id,
      owner: mapOwner(row),
      manualIsLow: !!row.manual_is_low,
      lowStockThreshold: row.agency_low_stock_threshold != null
        ? Number(row.agency_low_stock_threshold)
        : null,
      lastLowAlertAt: row.last_low_alert_at
    });
  }

  const imagesMap = await loadImages([...byCatalog.keys()]);
  const items = [];

  for (const item of byCatalog.values()) {
    const agenciesDetailed = [];
    let worstStatus = 'healthy';
    let totalAvailable = 0;
    let hasManual = item.stockMode === 'MANUAL_LOW';
    const owners = [];

    for (const enroll of item.agencies) {
      const st = await agencyStatusForEnrollment(
        {
          agency_id: enroll.agencyId,
          gear_item_type_id: enroll.gearItemTypeId,
          manual_is_low: enroll.manualIsLow,
          low_stock_threshold: enroll.lowStockThreshold
        },
        {
          stock_mode: item.stockMode,
          tracking_mode: item.trackingMode,
          default_low_stock_threshold: item.defaultLowStockThreshold
        }
      );
      agenciesDetailed.push({ ...enroll, ...st });
      if (st.status === 'reorder') worstStatus = 'reorder';
      else if (st.status === 'low' && worstStatus === 'healthy') worstStatus = 'low';
      if (typeof st.available === 'number') totalAvailable += st.available;
      if (enroll.owner) owners.push(enroll.owner);
    }

    const uniqueOwners = [];
    const seenOwners = new Set();
    for (const o of owners) {
      if (!o?.id || seenOwners.has(o.id)) continue;
      seenOwners.add(o.id);
      uniqueOwners.push(o);
    }

    const images = imagesMap.get(item.id) || [];
    const primaryImage = images.find((i) => i.isPrimary) || images[0] || null;

    const out = {
      ...item,
      agencies: agenciesDetailed,
      agencyCount: agenciesDetailed.length,
      images,
      primaryImage,
      status: worstStatus,
      availableDisplay: hasManual
        ? (worstStatus === 'reorder' || worstStatus === 'low' ? 'Manual Low' : '—')
        : totalAvailable,
      ownerDisplay: uniqueOwners.length === 0
        ? null
        : uniqueOwners.length === 1
          ? uniqueOwners[0]
          : { name: `${uniqueOwners.length} owners`, multiple: true, owners: uniqueOwners },
      stockModeLabel: item.stockMode === 'MANUAL_LOW' ? 'Manual Low' : 'Counted'
    };
    delete out.enrollmentRows;

    if (status && status !== 'all') {
      if (String(status).toLowerCase() !== out.status) continue;
    }
    items.push(out);
  }

  const sortKey = String(sort || 'type').toLowerCase();
  items.sort((a, b) => {
    if (sortKey === 'agency') return (b.agencyCount || 0) - (a.agencyCount || 0) || a.name.localeCompare(b.name);
    if (sortKey === 'status') {
      const rank = { reorder: 0, low: 1, healthy: 2 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name) || a.category.localeCompare(b.category);
  });

  return items;
}

export async function getCatalogItem(actor, catalogItemId) {
  const list = await listCatalog(actor, { includeInactive: true });
  const item = list.find((i) => Number(i.id) === Number(catalogItemId));
  if (!item) throw Object.assign(new Error('Catalog item not found'), { status: 404 });

  const agencyIds = item.agencies.map((a) => a.agencyId);
  let recentActivity = [];
  if (agencyIds.length) {
    const ph = agencyIds.map(() => '?').join(',');
    const typeIds = item.agencies.map((a) => a.gearItemTypeId).filter(Boolean);
    if (typeIds.length) {
      const tph = typeIds.map(() => '?').join(',');
      const [moves] = await pool.execute(
        `SELECT m.*, t.name AS item_name, a.name AS agency_name,
                u.first_name AS actor_first_name, u.last_name AS actor_last_name,
                tu.first_name AS target_first_name, tu.last_name AS target_last_name
         FROM gear_stock_movements m
         JOIN gear_item_types t ON t.id = m.gear_item_type_id
         JOIN agencies a ON a.id = m.agency_id
         LEFT JOIN users u ON u.id = m.created_by_user_id
         LEFT JOIN users tu ON tu.id = m.user_id
         WHERE m.agency_id IN (${ph}) AND m.gear_item_type_id IN (${tph})
         ORDER BY m.created_at DESC
         LIMIT 40`,
        [...agencyIds, ...typeIds]
      );
      recentActivity = (moves || []).map((m) => ({
        id: m.id,
        agencyId: m.agency_id,
        agencyName: m.agency_name,
        itemName: m.item_name,
        movementType: m.movement_type,
        quantityDelta: m.quantity_delta,
        reason: m.reason,
        destinationLabel: m.destination_label || null,
        activityType: m.activity_type || null,
        createdAt: m.created_at,
        sentBy: [m.actor_first_name, m.actor_last_name].filter(Boolean).join(' ').trim() || null,
        sentTo: [m.target_first_name, m.target_last_name].filter(Boolean).join(' ').trim() || m.destination_label || null
      }));
    }
  }

  return { ...item, recentActivity };
}

export async function createCatalogItem(actor, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw Object.assign(new Error('Name is required'), { status: 400 });

  const category = normalizeCategory(body.category);
  const stockMode = normalizeStockMode(body.stockMode, category);
  const trackingMode = normalizeTrackingMode(body.trackingMode, stockMode);
  const isGendered = !!body.isGendered && stockMode === 'COUNTED' && trackingMode === 'SIZED_STOCK';
  const sizeOptionsJson = isGendered
    ? JSON.stringify(body.sizeOptionsByGender || {})
    : JSON.stringify(Array.isArray(body.sizeOptions) ? body.sizeOptions : []);

  // Same item type across agencies: reuse existing catalog row by normalized name
  const [[existingByName]] = await pool.execute(
    `SELECT id FROM gear_catalog_items
     WHERE is_active = 1 AND LOWER(TRIM(name)) = LOWER(TRIM(?))
     ORDER BY id ASC
     LIMIT 1`,
    [name]
  );

  let catalogId = existingByName?.id ? Number(existingByName.id) : null;

  if (!catalogId) {
    const [result] = await pool.execute(
      `INSERT INTO gear_catalog_items
         (name, description, sku, unit, category, stock_mode, tracking_mode, size_options_json,
          variant_colors_json, variant_decorations_json,
          is_gendered, lifecycle_item_key, default_low_stock_threshold, allow_manual_low,
          is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        name,
        body.description ? String(body.description).trim() : null,
        body.sku ? String(body.sku).trim().slice(0, 64) : null,
        body.unit ? String(body.unit).trim().slice(0, 32) : 'Each',
        category,
        stockMode,
        trackingMode,
        sizeOptionsJson,
        JSON.stringify(Array.isArray(body.variantColors) ? body.variantColors : []),
        JSON.stringify(
          Array.isArray(body.variantDecorations) && body.variantDecorations.length
            ? body.variantDecorations
            : ['Embroidered', 'Screened', 'Plain']
        ),
        isGendered ? 1 : 0,
        body.lifecycleItemKey ? String(body.lifecycleItemKey).trim() : null,
        Number(body.defaultLowStockThreshold ?? 2),
        body.allowManualLow === false ? 0 : 1,
        actor?.id || null
      ]
    );
    catalogId = result.insertId;
  } else if (body.description || body.sku || body.unit || body.category || body.stockMode) {
    // Lightly refresh shared metadata when reusing
    await pool.execute(
      `UPDATE gear_catalog_items
       SET description = COALESCE(?, description),
           sku = COALESCE(?, sku),
           unit = COALESCE(?, unit),
           category = ?,
           stock_mode = ?,
           tracking_mode = ?,
           default_low_stock_threshold = COALESCE(?, default_low_stock_threshold)
       WHERE id = ?`,
      [
        body.description ? String(body.description).trim() : null,
        body.sku ? String(body.sku).trim().slice(0, 64) : null,
        body.unit ? String(body.unit).trim().slice(0, 32) : null,
        category,
        stockMode,
        trackingMode,
        body.defaultLowStockThreshold != null ? Number(body.defaultLowStockThreshold) : null,
        catalogId
      ]
    );
  }

  const agencyIds = Array.isArray(body.agencyIds) ? body.agencyIds.map(Number).filter((n) => n > 0) : [];
  const catalog = await fetchCatalogRow(catalogId);
  const mapped = mapCatalogBase(catalog);
  const catalogForType = {
    ...catalog,
    sizeOptions: mapped.sizeOptions,
    sizeOptionsByGender: mapped.sizeOptionsByGender
  };

  for (const aid of agencyIds) {
    await assertAgencyAccess(actor, aid);
    await pool.execute(
      `INSERT INTO gear_catalog_agency (catalog_item_id, agency_id, is_active)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_active = 1`,
      [catalogId, aid]
    );
    await ensureAgencyTypeRow(catalogForType, aid, actor?.id);
  }

  return getCatalogItem(actor, catalogId);
}

export async function updateCatalogItem(actor, catalogItemId, body = {}) {
  const catalog = await fetchCatalogRow(catalogItemId);
  if (!catalog) throw Object.assign(new Error('Catalog item not found'), { status: 404 });

  const fields = [];
  const values = [];
  const set = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

  if (body.name !== undefined) set('name', String(body.name || '').trim());
  if (body.description !== undefined) set('description', body.description ? String(body.description).trim() : null);
  if (body.sku !== undefined) set('sku', body.sku ? String(body.sku).trim().slice(0, 64) : null);
  if (body.unit !== undefined) set('unit', body.unit ? String(body.unit).trim().slice(0, 32) : 'Each');
  if (body.category !== undefined) set('category', normalizeCategory(body.category));
  if (body.stockMode !== undefined || body.category !== undefined) {
    const cat = body.category !== undefined ? normalizeCategory(body.category) : catalog.category;
    const mode = normalizeStockMode(body.stockMode ?? catalog.stock_mode, cat);
    set('stock_mode', mode);
    set('tracking_mode', normalizeTrackingMode(body.trackingMode ?? catalog.tracking_mode, mode));
  } else if (body.trackingMode !== undefined) {
    set('tracking_mode', normalizeTrackingMode(body.trackingMode, catalog.stock_mode));
  }
  if (body.isGendered !== undefined) set('is_gendered', body.isGendered ? 1 : 0);
  if (body.sizeOptions !== undefined || body.sizeOptionsByGender !== undefined) {
    const gendered = body.isGendered !== undefined ? !!body.isGendered : !!catalog.is_gendered;
    set(
      'size_options_json',
      gendered
        ? JSON.stringify(body.sizeOptionsByGender || {})
        : JSON.stringify(Array.isArray(body.sizeOptions) ? body.sizeOptions : [])
    );
  }
  if (body.lifecycleItemKey !== undefined) {
    set('lifecycle_item_key', body.lifecycleItemKey ? String(body.lifecycleItemKey).trim() : null);
  }
  if (body.defaultLowStockThreshold !== undefined) {
    set('default_low_stock_threshold', Number(body.defaultLowStockThreshold));
  }
  if (body.allowManualLow !== undefined) set('allow_manual_low', body.allowManualLow ? 1 : 0);
  if (body.isActive !== undefined) set('is_active', body.isActive ? 1 : 0);
  if (body.variantColors !== undefined) {
    set('variant_colors_json', JSON.stringify(Array.isArray(body.variantColors) ? body.variantColors : []));
  }
  if (body.variantDecorations !== undefined) {
    set(
      'variant_decorations_json',
      JSON.stringify(Array.isArray(body.variantDecorations) ? body.variantDecorations : [])
    );
  }

  if (fields.length) {
    values.push(Number(catalogItemId));
    await pool.execute(
      `UPDATE gear_catalog_items SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  // Keep linked type names/categories roughly in sync
  if (body.name !== undefined || body.category !== undefined || body.defaultLowStockThreshold !== undefined) {
    const updated = await fetchCatalogRow(catalogItemId);
    await pool.execute(
      `UPDATE gear_item_types
       SET name = ?, category = ?, low_stock_threshold = ?
       WHERE catalog_item_id = ?`,
      [
        updated.name,
        updated.category,
        updated.default_low_stock_threshold,
        Number(catalogItemId)
      ]
    );
  }

  return getCatalogItem(actor, catalogItemId);
}

export async function upsertCatalogAgencies(actor, catalogItemId, agencies = []) {
  const catalog = await fetchCatalogRow(catalogItemId);
  if (!catalog) throw Object.assign(new Error('Catalog item not found'), { status: 404 });
  const mapped = mapCatalogBase(catalog);
  const catalogForType = {
    id: catalog.id,
    name: catalog.name,
    category: catalog.category,
    stock_mode: catalog.stock_mode,
    tracking_mode: catalog.tracking_mode,
    is_gendered: catalog.is_gendered,
    sizeOptions: mapped.sizeOptions,
    sizeOptionsByGender: mapped.sizeOptionsByGender,
    lifecycle_item_key: catalog.lifecycle_item_key,
    default_low_stock_threshold: catalog.default_low_stock_threshold
  };

  const keepAgencyIds = new Set();
  for (const entry of agencies || []) {
    const aid = await assertAgencyAccess(actor, entry.agencyId);
    keepAgencyIds.add(aid);
    const active = entry.isActive === false ? 0 : 1;
    await pool.execute(
      `INSERT INTO gear_catalog_agency
         (catalog_item_id, agency_id, responsible_user_id, manual_is_low, low_stock_threshold, is_active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         responsible_user_id = VALUES(responsible_user_id),
         manual_is_low = VALUES(manual_is_low),
         low_stock_threshold = VALUES(low_stock_threshold),
         is_active = VALUES(is_active)`,
      [
        Number(catalogItemId),
        aid,
        entry.responsibleUserId ? Number(entry.responsibleUserId) : null,
        entry.manualIsLow ? 1 : 0,
        entry.lowStockThreshold != null ? Number(entry.lowStockThreshold) : null,
        active
      ]
    );
    if (active) {
      await ensureAgencyTypeRow(catalogForType, aid, actor?.id);
    }
  }

  // Soft-deactivate enrollments the actor can access that were omitted from the payload
  const accessible = await accessibleAgencyIds(actor);
  for (const aid of accessible) {
    if (keepAgencyIds.has(aid)) continue;
    await pool.execute(
      `UPDATE gear_catalog_agency SET is_active = 0
       WHERE catalog_item_id = ? AND agency_id = ?`,
      [Number(catalogItemId), aid]
    );
  }

  return getCatalogItem(actor, catalogItemId);
}

export async function uploadCatalogImage(actor, catalogItemId, file, { isPrimary = false } = {}) {
  const catalog = await fetchCatalogRow(catalogItemId);
  if (!catalog) throw Object.assign(new Error('Catalog item not found'), { status: 404 });
  if (!file?.buffer) throw Object.assign(new Error('Image file required'), { status: 400 });

  // Ensure actor can see at least one enrolled agency (or is creating images for new item)
  const agencyIds = await accessibleAgencyIds(actor);
  if (!agencyIds.length && String(actor?.role || '').toLowerCase() !== 'super_admin') {
    throw Object.assign(new Error('No agency access'), { status: 403 });
  }

  const stored = await StorageService.saveGearCatalogImage(
    catalogItemId,
    file.buffer,
    file.originalname || 'photo.jpg',
    file.mimetype || 'image/jpeg'
  );

  if (isPrimary) {
    await pool.execute(
      `UPDATE gear_catalog_images SET is_primary = 0 WHERE catalog_item_id = ?`,
      [Number(catalogItemId)]
    );
  }

  const [[maxSort]] = await pool.execute(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM gear_catalog_images WHERE catalog_item_id = ?`,
    [Number(catalogItemId)]
  );

  const [result] = await pool.execute(
    `INSERT INTO gear_catalog_images (catalog_item_id, file_path, sort_order, is_primary)
     VALUES (?, ?, ?, ?)`,
    [Number(catalogItemId), stored.relativePath, Number(maxSort?.m || -1) + 1, isPrimary ? 1 : 0]
  );

  const [[row]] = await pool.execute(`SELECT * FROM gear_catalog_images WHERE id = ?`, [result.insertId]);
  return mapImage(row);
}

export async function deleteCatalogImage(actor, catalogItemId, imageId) {
  await pool.execute(
    `DELETE FROM gear_catalog_images WHERE id = ? AND catalog_item_id = ?`,
    [Number(imageId), Number(catalogItemId)]
  );
  return { ok: true };
}

export async function markAgencyLow(actor, catalogItemId, agencyId, { low = true, reason = null } = {}) {
  await assertAgencyAccess(actor, agencyId);
  const catalog = await fetchCatalogRow(catalogItemId);
  if (!catalog) throw Object.assign(new Error('Catalog item not found'), { status: 404 });

  const [[enroll]] = await pool.execute(
    `SELECT * FROM gear_catalog_agency WHERE catalog_item_id = ? AND agency_id = ? LIMIT 1`,
    [Number(catalogItemId), Number(agencyId)]
  );
  if (!enroll) throw Object.assign(new Error('Agency not enrolled for this item'), { status: 404 });

  if (!catalog.allow_manual_low && low && String(catalog.stock_mode) === 'MANUAL_LOW') {
    throw Object.assign(new Error('Manual low stock is not enabled for this item'), { status: 400 });
  }

  await pool.execute(
    `UPDATE gear_catalog_agency SET manual_is_low = ? WHERE id = ?`,
    [low ? 1 : 0, enroll.id]
  );

  let typeId = enroll.gear_item_type_id;
  if (!typeId) {
    typeId = await ensureAgencyTypeRow(catalog, agencyId, actor?.id);
  }

  await pool.execute(
    `INSERT INTO gear_stock_movements
       (agency_id, gear_item_type_id, movement_type, quantity_delta, reason, created_by_user_id)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [
      Number(agencyId),
      typeId,
      low ? 'MARK_LOW' : 'CLEAR_LOW',
      reason || (low ? 'Manually marked low stock' : 'Cleared manual low stock'),
      actor?.id || null
    ]
  );

  let alert = null;
  if (low) {
    // Clear debounce so mark-low always notifies
    await pool.execute(
      `UPDATE gear_catalog_agency SET last_low_alert_at = NULL WHERE id = ?`,
      [enroll.id]
    );
    alert = await maybeSendLowStockAlert({
      catalogItemId,
      agencyId,
      actorUserId: actor?.id,
      force: true,
      reason: reason || 'Manually marked low stock'
    });
  }

  return { ok: true, manualIsLow: !!low, alert };
}

export async function sendCatalogItem(actor, catalogItemId, body = {}) {
  const agencyId = await assertAgencyAccess(actor, body.agencyId);
  const catalog = await fetchCatalogRow(catalogItemId);
  if (!catalog) throw Object.assign(new Error('Catalog item not found'), { status: 404 });

  const [[enroll]] = await pool.execute(
    `SELECT * FROM gear_catalog_agency WHERE catalog_item_id = ? AND agency_id = ? LIMIT 1`,
    [Number(catalogItemId), agencyId]
  );
  if (!enroll) throw Object.assign(new Error('Agency not enrolled for this item'), { status: 404 });

  let typeId = enroll.gear_item_type_id;
  if (!typeId) {
    typeId = await ensureAgencyTypeRow(catalog, agencyId, actor?.id);
  }

  const qty = Math.max(0, Number(body.quantity || 1));
  const activityType = String(body.activityType || 'sent_to_event').trim().slice(0, 64);
  const destinationLabel = body.destinationLabel ? String(body.destinationLabel).trim().slice(0, 255) : null;
  const targetUserId = body.userId ? Number(body.userId) : null;

  // Counted sized stock: optionally decrement
  if (
    catalog.stock_mode === 'COUNTED' &&
    catalog.tracking_mode === 'SIZED_STOCK' &&
    body.decrementStock !== false &&
    body.sizeLabel
  ) {
    await gearInventory.adjustStock(
      agencyId,
      {
        gearItemTypeId: typeId,
        sizeLabel: body.sizeLabel,
        gender: body.gender || '',
        delta: -qty,
        reason: `Sent: ${destinationLabel || activityType}`
      },
      actor?.id
    );
    await checkCountedStockAndAlert({
      catalogItemId,
      agencyId,
      gearItemTypeId: typeId,
      actorUserId: actor?.id
    });
  }

  await pool.execute(
    `INSERT INTO gear_stock_movements
       (agency_id, gear_item_type_id, size_label, user_id, movement_type, quantity_delta,
        reason, destination_label, activity_type, created_by_user_id)
     VALUES (?, ?, ?, ?, 'SENT', ?, ?, ?, ?, ?)`,
    [
      agencyId,
      typeId,
      body.sizeLabel ? String(body.sizeLabel).trim() : null,
      targetUserId,
      catalog.stock_mode === 'MANUAL_LOW' ? 0 : -qty,
      body.reason || 'Sent / issued materials',
      destinationLabel,
      activityType,
      actor?.id || null
    ]
  );

  return { ok: true };
}

export async function listActivity(actor, {
  agencyId = null,
  catalogItemId = null,
  limit = 80
} = {}) {
  const agencyIds = await accessibleAgencyIds(actor);
  if (!agencyIds.length) return [];
  let filter = agencyIds;
  if (agencyId) {
    const aid = await assertAgencyAccess(actor, agencyId);
    filter = [aid];
  }
  const ph = filter.map(() => '?').join(',');
  const params = [...filter];
  let extra = '';
  if (catalogItemId) {
    extra += ' AND t.catalog_item_id = ?';
    params.push(Number(catalogItemId));
  }
  params.push(Math.min(200, Math.max(1, Number(limit) || 80)));

  const lim = params.pop();
  const [rows] = await pool.execute(
    `SELECT m.*, t.name AS item_name, t.category, t.catalog_item_id,
            a.name AS agency_name,
            u.first_name AS actor_first_name, u.last_name AS actor_last_name,
            tu.first_name AS target_first_name, tu.last_name AS target_last_name,
            img.file_path AS primary_image_path
     FROM gear_stock_movements m
     JOIN gear_item_types t ON t.id = m.gear_item_type_id
     JOIN agencies a ON a.id = m.agency_id
     LEFT JOIN users u ON u.id = m.created_by_user_id
     LEFT JOIN users tu ON tu.id = m.user_id
     LEFT JOIN gear_catalog_images img
       ON img.catalog_item_id = t.catalog_item_id AND img.is_primary = 1
     WHERE m.agency_id IN (${ph})
       AND m.movement_type IN ('ISSUE', 'SENT', 'RETURN', 'MARK_LOW', 'CLEAR_LOW', 'REORDER_ALERT', 'ADJUST')
       ${extra}
     ORDER BY m.created_at DESC
     LIMIT ${lim}`,
    params
  );

  return (rows || []).map((m) => ({
    id: m.id,
    date: m.created_at,
    catalogItemId: m.catalog_item_id,
    itemName: m.item_name,
    category: m.category,
    imageUrl: m.primary_image_path
      ? (m.primary_image_path.startsWith('http') ? m.primary_image_path : `/${String(m.primary_image_path).replace(/^\//, '')}`)
      : null,
    movementType: m.movement_type,
    activityType: m.activity_type || null,
    typeLabel:
      m.movement_type === 'SENT'
        ? (m.activity_type === 'issued_to_person' ? 'Issued to Person' : 'Sent to Event')
        : m.movement_type === 'ISSUE'
          ? 'Issued to Person'
          : m.movement_type,
    sentTo: m.destination_label
      || [m.target_first_name, m.target_last_name].filter(Boolean).join(' ').trim()
      || null,
    agencyId: m.agency_id,
    agencyName: m.agency_name,
    quantity: Math.abs(Number(m.quantity_delta || 0)) || null,
    sentBy: [m.actor_first_name, m.actor_last_name].filter(Boolean).join(' ').trim() || null,
    reason: m.reason
  }));
}

export async function listAccessibleAgencies(actor) {
  const ids = await accessibleAgencyIds(actor);
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type
     FROM agencies
     WHERE id IN (${ph})
       AND ${TENANT_AGENCY_SQL}
     ORDER BY name ASC`,
    ids
  );
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug || r.portal_url || null,
    organizationType: r.organization_type || 'agency'
  }));
}

export async function listAgencyUsersForPicker(actor, agencyId) {
  const aid = await assertAgencyAccess(actor, agencyId);
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email,
            COALESCE(u.work_phone, u.personal_phone, u.system_phone_number) AS phone,
            u.role
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND (u.is_active = 1 OR u.is_active IS NULL)
       AND (u.is_archived = 0 OR u.is_archived IS NULL OR u.is_archived = FALSE)
       AND (u.status IS NULL OR u.status NOT IN ('terminated', 'archived', 'inactive'))
       AND u.terminated_at IS NULL
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT 500`,
    [aid]
  );
  return (rows || []).map((u) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    first_name: u.first_name,
    last_name: u.last_name,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
    email: u.email,
    phone: u.phone || null,
    role: u.role
  }));
}

function assertSuperAdmin(actor) {
  const role = String(actor?.role || '').toLowerCase();
  if (role !== 'super_admin') {
    throw Object.assign(new Error('Superadmin access required'), { status: 403 });
  }
}

/**
 * Users with explicit platform gear access (not counting role-based superadmins).
 */
export async function listPlatformGearManagers(actor) {
  assertSuperAdmin(actor);
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.has_platform_gear_access
     FROM users u
     WHERE u.has_platform_gear_access = 1
       AND (u.is_active = 1 OR u.is_active IS NULL)
       AND (u.is_archived = 0 OR u.is_archived IS NULL OR u.is_archived = FALSE)
       AND u.terminated_at IS NULL
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT 200`
  );
  return (rows || []).map((u) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    first_name: u.first_name,
    last_name: u.last_name,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
    email: u.email,
    role: u.role,
    hasPlatformGearAccess: true,
  }));
}

/**
 * Search active users to grant platform gear access.
 */
export async function searchUsersForPlatformGearGrant(actor, { q = '', limit = 25 } = {}) {
  assertSuperAdmin(actor);
  const query = String(q || '').trim();
  if (query.length < 2) return [];

  const like = `%${query.replace(/[%_]/g, '')}%`;
  const lim = Math.min(50, Math.max(1, Number(limit) || 25));
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
            COALESCE(u.has_platform_gear_access, 0) AS has_platform_gear_access
     FROM users u
     WHERE (u.is_active = 1 OR u.is_active IS NULL)
       AND (u.is_archived = 0 OR u.is_archived IS NULL OR u.is_archived = FALSE)
       AND u.terminated_at IS NULL
       AND (u.status IS NULL OR u.status NOT IN ('terminated', 'archived', 'inactive'))
       AND (
         u.email LIKE ?
         OR u.first_name LIKE ?
         OR u.last_name LIKE ?
         OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
       )
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT ${lim}`,
    [like, like, like, like]
  );
  return (rows || []).map((u) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    first_name: u.first_name,
    last_name: u.last_name,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
    email: u.email,
    role: u.role,
    hasPlatformGearAccess: !!u.has_platform_gear_access,
    alreadyHasRoleAccess: ['super_admin', 'admin'].includes(String(u.role || '').toLowerCase()),
  }));
}

export async function setPlatformGearAccess(actor, userId, enabled) {
  assertSuperAdmin(actor);
  const uid = Number(userId || 0);
  if (!uid) throw Object.assign(new Error('userId is required'), { status: 400 });

  const [[user]] = await pool.execute(
    `SELECT id, first_name, last_name, email, role, has_platform_gear_access
     FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  await pool.execute(
    `UPDATE users SET has_platform_gear_access = ? WHERE id = ?`,
    [enabled ? 1 : 0, uid]
  );

  return {
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
    email: user.email,
    role: user.role,
    hasPlatformGearAccess: !!enabled,
  };
}

export { checkCountedStockAndAlert };
