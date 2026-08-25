import pool from '../config/database.js';
import { issueGear, getUserPreferences } from './gearInventory.service.js';

// Lazy import catalog helpers to avoid circular init hangs
async function catalogApi() {
  return import('./gearCatalog.service.js');
}

async function assertAgencyAccess(actor, agencyId) {
  const api = await catalogApi();
  return api.assertAgencyAccess(actor, agencyId);
}

async function actorCanManagePlatformGear(actor) {
  const api = await catalogApi();
  return api.actorCanManagePlatformGear(actor);
}

async function accessibleAgencyIds(actor) {
  const api = await catalogApi();
  return api.accessibleAgencyIds(actor);
}

async function getCatalogItem(actor, catalogItemId) {
  const api = await catalogApi();
  return api.getCatalogItem(actor, catalogItemId);
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || null;
}

function mapPackage(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    agencyName: row.agency_name || null,
    name: row.name,
    slug: row.slug,
    packageType: row.package_type,
    description: row.description || '',
    isDefault: !!row.is_default,
    isActive: row.is_active !== 0,
    itemCount: Number(row.item_count || 0),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPackageItem(row) {
  return {
    id: row.id,
    packageId: row.package_id,
    catalogItemId: row.catalog_item_id,
    catalogName: row.catalog_name || row.name || null,
    category: row.category || null,
    stockMode: row.stock_mode || null,
    trackingMode: row.tracking_mode || null,
    isGendered: !!row.is_gendered,
    sizeOptions: (() => {
      try {
        const raw = row.size_options_json;
        if (!raw) return [];
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        return [];
      }
    })(),
    primaryImageUrl: row.primary_image_path
      ? (String(row.primary_image_path).startsWith('http')
        ? row.primary_image_path
        : `/${String(row.primary_image_path).replace(/^\//, '')}`)
      : null,
    defaultQuantity: Number(row.default_quantity || 1),
    sizeMode: row.size_mode || 'FROM_PREFS',
    fixedSizeLabel: row.fixed_size_label || null,
    fixedGender: row.fixed_gender || null,
    prefKey: row.pref_key || null,
    sortOrder: Number(row.sort_order || 0),
    isRequired: row.is_required !== 0,
  };
}

async function assertPackageAccess(actor, packageRow) {
  if (!packageRow) throw Object.assign(new Error('Package not found'), { status: 404 });
  if (packageRow.agency_id) {
    await assertAgencyAccess(actor, packageRow.agency_id);
  } else if (!(await actorCanManagePlatformGear(actor))) {
    // Shared packages: readable by anyone with catalog access; mutations need platform gear or membership
    // Read is allowed; write checked at call sites for shared packages
  }
  return packageRow;
}

async function loadPackageItems(packageId) {
  const [rows] = await pool.execute(
    `SELECT
       pi.*,
       c.name AS catalog_name,
       c.category,
       c.stock_mode,
       c.tracking_mode,
       c.is_gendered,
       c.size_options_json,
       (
         SELECT img.file_path
         FROM gear_catalog_images img
         WHERE img.catalog_item_id = c.id
         ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC
         LIMIT 1
       ) AS primary_image_path
     FROM gear_package_items pi
     JOIN gear_catalog_items c ON c.id = pi.catalog_item_id
     WHERE pi.package_id = ?
     ORDER BY pi.sort_order ASC, pi.id ASC`,
    [Number(packageId)]
  );
  return (rows || []).map(mapPackageItem);
}

export async function listPackages(actor, { agencyId = null, packageType = null } = {}) {
  const ids = await accessibleAgencyIds(actor);
  if (!ids.length && !(await actorCanManagePlatformGear(actor))) return [];

  const params = [];
  let where = 'p.is_active = 1 AND (p.agency_id IS NULL';
  if (ids.length) {
    where += ` OR p.agency_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  where += ')';

  if (agencyId) {
    const aid = Number(agencyId);
    await assertAgencyAccess(actor, aid);
    where += ' AND (p.agency_id IS NULL OR p.agency_id = ?)';
    params.push(aid);
  }
  if (packageType) {
    where += ' AND p.package_type = ?';
    params.push(String(packageType));
  }

  const [rows] = await pool.execute(
    `SELECT
       p.*,
       a.name AS agency_name,
       (SELECT COUNT(*) FROM gear_package_items pi WHERE pi.package_id = p.id) AS item_count
     FROM gear_packages p
     LEFT JOIN agencies a ON a.id = p.agency_id
     WHERE ${where}
     ORDER BY p.is_default DESC, p.name ASC`,
    params
  );
  return (rows || []).map(mapPackage);
}

export async function getPackage(actor, packageId) {
  const [[row]] = await pool.execute(
    `SELECT p.*, a.name AS agency_name,
       (SELECT COUNT(*) FROM gear_package_items pi WHERE pi.package_id = p.id) AS item_count
     FROM gear_packages p
     LEFT JOIN agencies a ON a.id = p.agency_id
     WHERE p.id = ?
     LIMIT 1`,
    [Number(packageId)]
  );
  await assertPackageAccess(actor, row);
  const pkg = mapPackage(row);
  pkg.items = await loadPackageItems(packageId);
  return pkg;
}

export async function createPackage(actor, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw Object.assign(new Error('Package name is required'), { status: 400 });

  let agencyId = body.agencyId != null && body.agencyId !== '' ? Number(body.agencyId) : null;
  if (agencyId) await assertAgencyAccess(actor, agencyId);

  const packageType = String(body.packageType || 'new_hire').trim() || 'new_hire';
  const isDefault = !!body.isDefault;

  if (isDefault) {
    await pool.execute(
      `UPDATE gear_packages SET is_default = 0
       WHERE package_type = ? AND (agency_id <=> ?)`,
      [packageType, agencyId]
    );
  }

  const [result] = await pool.execute(
    `INSERT INTO gear_packages
       (agency_id, name, slug, package_type, description, is_default, is_active, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      agencyId,
      name,
      body.slug ? String(body.slug).trim() : slugify(name),
      packageType,
      body.description ? String(body.description).trim() : null,
      isDefault ? 1 : 0,
      actor?.id || null,
    ]
  );

  const id = result.insertId;
  if (Array.isArray(body.items) && body.items.length) {
    await replacePackageItems(actor, id, body.items);
  }
  return getPackage(actor, id);
}

export async function updatePackage(actor, packageId, body = {}) {
  const pkg = await getPackage(actor, packageId);
  if (pkg.agencyId) await assertAgencyAccess(actor, pkg.agencyId);

  const sets = [];
  const params = [];
  const set = (col, val) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (body.name !== undefined) set('name', String(body.name || '').trim());
  if (body.description !== undefined) set('description', body.description ? String(body.description).trim() : null);
  if (body.packageType !== undefined) set('package_type', String(body.packageType || 'custom').trim());
  if (body.slug !== undefined) set('slug', body.slug ? String(body.slug).trim() : null);
  if (body.isActive !== undefined) set('is_active', body.isActive ? 1 : 0);
  if (body.agencyId !== undefined) {
    const aid = body.agencyId != null && body.agencyId !== '' ? Number(body.agencyId) : null;
    if (aid) await assertAgencyAccess(actor, aid);
    set('agency_id', aid);
  }
  if (body.isDefault !== undefined) {
    if (body.isDefault) {
      const type = body.packageType || pkg.packageType;
      const aid = body.agencyId !== undefined
        ? (body.agencyId != null && body.agencyId !== '' ? Number(body.agencyId) : null)
        : pkg.agencyId;
      await pool.execute(
        `UPDATE gear_packages SET is_default = 0
         WHERE package_type = ? AND (agency_id <=> ?) AND id <> ?`,
        [type, aid, Number(packageId)]
      );
    }
    set('is_default', body.isDefault ? 1 : 0);
  }

  if (sets.length) {
    params.push(Number(packageId));
    await pool.execute(`UPDATE gear_packages SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  if (Array.isArray(body.items)) {
    await replacePackageItems(actor, packageId, body.items);
  }

  return getPackage(actor, packageId);
}

export async function replacePackageItems(actor, packageId, items = []) {
  await getPackage(actor, packageId);
  await pool.execute(`DELETE FROM gear_package_items WHERE package_id = ?`, [Number(packageId)]);

  let order = 0;
  for (const raw of items || []) {
    const catalogItemId = Number(raw.catalogItemId || raw.catalog_item_id || 0);
    if (!catalogItemId) continue;
    // Validate catalog exists and is accessible
    await getCatalogItem(actor, catalogItemId);

    await pool.execute(
      `INSERT INTO gear_package_items
         (package_id, catalog_item_id, default_quantity, size_mode, fixed_size_label,
          fixed_gender, pref_key, sort_order, is_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(packageId),
        catalogItemId,
        Math.max(1, Number(raw.defaultQuantity || raw.default_quantity || 1)),
        String(raw.sizeMode || raw.size_mode || 'FROM_PREFS'),
        raw.fixedSizeLabel || raw.fixed_size_label || null,
        raw.fixedGender || raw.fixed_gender || null,
        raw.prefKey || raw.pref_key || null,
        Number(raw.sortOrder ?? raw.sort_order ?? order),
        raw.isRequired === false || raw.is_required === 0 ? 0 : 1,
      ]
    );
    order += 1;
  }
  return loadPackageItems(packageId);
}

export async function deletePackage(actor, packageId) {
  await getPackage(actor, packageId);
  await pool.execute(`UPDATE gear_packages SET is_active = 0 WHERE id = ?`, [Number(packageId)]);
  return { ok: true };
}

/**
 * Resolve size/gender for a package line from prefs + overrides.
 */
function resolveLineSize({ item, prefs = {}, override = null }) {
  if (override?.sizeLabel) {
    return {
      sizeLabel: override.sizeLabel,
      gender: override.gender || '',
      quantity: Math.max(1, Number(override.quantity || item.defaultQuantity || 1)),
    };
  }

  const mode = item.sizeMode || 'FROM_PREFS';
  const qty = Math.max(1, Number(item.defaultQuantity || 1));

  if (mode === 'NONE' || item.trackingMode === 'UNIQUE_ASSET') {
    return { sizeLabel: null, gender: '', quantity: qty, uniqueAssetId: override?.uniqueAssetId || null };
  }
  if (mode === 'FIXED') {
    return {
      sizeLabel: item.fixedSizeLabel,
      gender: item.fixedGender || '',
      quantity: qty,
    };
  }
  if (mode === 'FROM_PREFS') {
    const key = item.prefKey || guessPrefKey(item);
    const sizeLabel = key ? prefs[key] || prefs[`${key}_size`] || null : null;
    const gender = prefs[`${key}_gender`] || prefs.shirt_gender || '';
    return { sizeLabel, gender, quantity: qty };
  }
  // CHOOSE_AT_ISSUE — must be provided in override
  return { sizeLabel: null, gender: '', quantity: qty, needsChoice: true };
}

function guessPrefKey(item) {
  const name = String(item.catalogName || '').toLowerCase();
  if (/hoodie|sweater|quarter.?zip|fleece/.test(name)) return 'hoodie';
  if (/pant|trouser/.test(name)) return 'pants';
  if (/polo|shirt|tee|t-shirt|sweater/.test(name)) return 'shirt';
  return item.prefKey || 'shirt';
}

/**
 * Preview issue: resolve sizes for a user without deducting stock.
 */
export async function previewPackageIssue(actor, packageId, { agencyId, userId } = {}) {
  const aid = await assertAgencyAccess(actor, agencyId);
  const pkg = await getPackage(actor, packageId);
  const prefsRes = await getUserPreferences(aid, userId);
  const prefs = prefsRes?.preferences || prefsRes || {};

  const lines = [];
  for (const item of pkg.items || []) {
    // Resolve agency-specific gear_item_type_id
    const catalog = await getCatalogItem(actor, item.catalogItemId);
    const enroll = (catalog.agencies || []).find((a) => Number(a.agencyId) === Number(aid));
    const resolved = resolveLineSize({ item, prefs });
    lines.push({
      packageItemId: item.id,
      catalogItemId: item.catalogItemId,
      catalogName: item.catalogName,
      category: item.category,
      trackingMode: item.trackingMode || catalog.trackingMode,
      stockMode: item.stockMode || catalog.stockMode,
      isGendered: item.isGendered || catalog.isGendered,
      gearItemTypeId: enroll?.gearItemTypeId || null,
      enrolled: !!enroll,
      sizeMode: item.sizeMode,
      prefKey: item.prefKey || guessPrefKey(item),
      preferredSize: prefs[item.prefKey || guessPrefKey(item)] || null,
      ...resolved,
      ready:
        !!enroll?.gearItemTypeId &&
        (item.trackingMode === 'UNIQUE_ASSET'
          ? !!resolved.uniqueAssetId
          : item.stockMode === 'MANUAL_LOW' || item.trackingMode === 'NONE'
            ? true
            : !!resolved.sizeLabel && !resolved.needsChoice),
    });
  }

  return {
    package: { id: pkg.id, name: pkg.name, packageType: pkg.packageType },
    agencyId: aid,
    userId: Number(userId),
    preferences: prefs,
    lines,
  };
}

/**
 * Issue all package lines to a user — deducts inventory via issueGear.
 */
export async function issuePackage(actor, packageId, body = {}) {
  const aid = await assertAgencyAccess(actor, body.agencyId);
  const uid = Number(body.userId || 0);
  if (!uid) throw Object.assign(new Error('userId is required'), { status: 400 });

  const pkg = await getPackage(actor, packageId);
  const prefsRes = await getUserPreferences(aid, uid);
  const prefs = prefsRes?.preferences || prefsRes || {};
  const overridesByItem = body.overrides || {};

  const [issueResult] = await pool.execute(
    `INSERT INTO gear_package_issues
       (package_id, agency_id, user_id, issued_by_user_id, status, notes)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [Number(packageId), aid, uid, actor?.id || null, body.notes || null]
  );
  const issueId = issueResult.insertId;

  const lineResults = [];
  let okCount = 0;
  let failCount = 0;

  for (const item of pkg.items || []) {
    const catalog = await getCatalogItem(actor, item.catalogItemId);
    const enroll = (catalog.agencies || []).find((a) => Number(a.agencyId) === Number(aid));
    const override = overridesByItem[item.id] || overridesByItem[String(item.id)] || overridesByItem[item.catalogItemId] || null;
    const resolved = resolveLineSize({ item, prefs, override });

    if (!enroll?.gearItemTypeId) {
      failCount += 1;
      await pool.execute(
        `INSERT INTO gear_package_issue_lines
           (package_issue_id, package_item_id, catalog_item_id, size_label, gender, quantity, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`,
        [issueId, item.id, item.catalogItemId, resolved.sizeLabel, resolved.gender || '', resolved.quantity, 'Item not enrolled for this agency']
      );
      lineResults.push({ catalogItemId: item.catalogItemId, status: 'failed', error: 'Not enrolled' });
      continue;
    }

    if (catalog.stockMode === 'MANUAL_LOW' || catalog.trackingMode === 'NONE') {
      // Materials: log as skipped issue (no sized stock) — optional future: mark sent
      await pool.execute(
        `INSERT INTO gear_package_issue_lines
           (package_issue_id, package_item_id, catalog_item_id, quantity, status, error_message)
         VALUES (?, ?, ?, ?, 'skipped', ?)`,
        [issueId, item.id, item.catalogItemId, resolved.quantity, 'Manual/materials item — record fulfillment separately']
      );
      lineResults.push({ catalogItemId: item.catalogItemId, status: 'skipped' });
      continue;
    }

    if (catalog.trackingMode === 'SIZED_STOCK' && !resolved.sizeLabel) {
      failCount += 1;
      await pool.execute(
        `INSERT INTO gear_package_issue_lines
           (package_issue_id, package_item_id, catalog_item_id, quantity, status, error_message)
         VALUES (?, ?, ?, ?, 'failed', ?)`,
        [issueId, item.id, item.catalogItemId, resolved.quantity, 'Size required — set provider preference or choose at issue']
      );
      lineResults.push({ catalogItemId: item.catalogItemId, status: 'failed', error: 'Size required' });
      continue;
    }

    try {
      const qty = Math.max(1, Number(resolved.quantity || 1));
      let lastAssignment = null;
      for (let i = 0; i < qty; i += 1) {
        lastAssignment = await issueGear(
          aid,
          {
            userId: uid,
            gearItemTypeId: enroll.gearItemTypeId,
            sizeLabel: resolved.sizeLabel,
            gender: resolved.gender || '',
            uniqueAssetId: resolved.uniqueAssetId || override?.uniqueAssetId || null,
            notes: body.notes || `Package: ${pkg.name}`,
          },
          actor?.id
        );
      }
      okCount += 1;
      await pool.execute(
        `INSERT INTO gear_package_issue_lines
           (package_issue_id, package_item_id, catalog_item_id, gear_assignment_id,
            size_label, gender, quantity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')`,
        [
          issueId,
          item.id,
          item.catalogItemId,
          lastAssignment?.id || null,
          resolved.sizeLabel,
          resolved.gender || '',
          qty,
        ]
      );
      lineResults.push({
        catalogItemId: item.catalogItemId,
        status: 'ok',
        assignmentId: lastAssignment?.id || null,
        sizeLabel: resolved.sizeLabel,
        quantity: qty,
      });
    } catch (err) {
      failCount += 1;
      await pool.execute(
        `INSERT INTO gear_package_issue_lines
           (package_issue_id, package_item_id, catalog_item_id, size_label, gender, quantity, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`,
        [
          issueId,
          item.id,
          item.catalogItemId,
          resolved.sizeLabel,
          resolved.gender || '',
          resolved.quantity,
          err?.message || 'Issue failed',
        ]
      );
      lineResults.push({
        catalogItemId: item.catalogItemId,
        status: 'failed',
        error: err?.message || 'Issue failed',
      });
    }
  }

  const status = failCount === 0 ? 'complete' : okCount === 0 ? 'failed' : 'partial';
  await pool.execute(`UPDATE gear_package_issues SET status = ? WHERE id = ?`, [status, issueId]);

  return {
    issueId,
    status,
    lines: lineResults,
    okCount,
    failCount,
  };
}
