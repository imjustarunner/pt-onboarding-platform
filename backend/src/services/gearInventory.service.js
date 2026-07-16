import pool from '../config/database.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';

/** Clear equipment checklist mappings only — set on gear_item_types.lifecycle_item_key. */
export const CLEAR_EQUIPMENT_LIFECYCLE_KEYS = Object.freeze([
  'company_card_issued',
  'company_computer_issued',
  'company_phone_issued',
  'company_vehicle_assigned',
  'keys_badge_issued',
]);

const parseSizeOptions = (raw) => {
  if (Array.isArray(raw)) return raw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s || '').trim()).filter(Boolean);
    } catch { /* ignore */ }
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const mapType = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    category: row.category,
    trackingMode: row.tracking_mode,
    sizeOptions: parseSizeOptions(row.size_options_json),
    lifecycleItemKey: row.lifecycle_item_key || null,
    lowStockThreshold: Number(row.low_stock_threshold ?? 2),
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

async function resolveAgencyId(raw) {
  const n = Number(raw || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function logMovement({
  agencyId,
  gearItemTypeId,
  sizeLabel = null,
  uniqueAssetId = null,
  userId = null,
  assignmentId = null,
  movementType,
  quantityDelta = 0,
  reason = null,
  createdByUserId = null,
}) {
  await pool.execute(
    `INSERT INTO gear_stock_movements
       (agency_id, gear_item_type_id, size_label, unique_asset_id, user_id, assignment_id,
        movement_type, quantity_delta, reason, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agencyId,
      gearItemTypeId,
      sizeLabel,
      uniqueAssetId,
      userId,
      assignmentId,
      movementType,
      quantityDelta,
      reason,
      createdByUserId,
    ]
  );
}

async function maybeAutoCompleteLifecycle({ userId, lifecycleItemKey }) {
  const key = String(lifecycleItemKey || '').trim();
  if (!userId || !key) return;
  // Only auto-complete unambiguous equipment item_keys configured on the catalog type.
  if (!CLEAR_EQUIPMENT_LIFECYCLE_KEYS.includes(key)) return;
  try {
    const defs = await LifecycleChecklistDefinition.findAll();
    const def = (defs || []).find((d) => String(d.item_key || '') === key);
    if (!def?.id) return;
    await UserLifecycleChecklistItem.autoComplete(userId, def.id, true, new Date());
  } catch (e) {
    console.warn('[gearInventory] lifecycle auto-complete failed:', e?.message || e);
  }
}

export async function getSummary(agencyId) {
  const aid = await resolveAgencyId(agencyId);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });

  const [[typeRow]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM gear_item_types WHERE agency_id = ? AND is_active = 1`,
    [aid]
  );
  const [[stockRows]] = await pool.execute(
    `SELECT
       COUNT(*) AS low_count
     FROM gear_stock_levels s
     JOIN gear_item_types t ON t.id = s.gear_item_type_id
     WHERE s.agency_id = ? AND t.is_active = 1 AND t.tracking_mode = 'SIZED_STOCK'
       AND s.quantity_on_hand <= t.low_stock_threshold`,
    [aid]
  );
  const [[assetRows]] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available_count,
       SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) AS issued_count
     FROM gear_unique_assets WHERE agency_id = ? AND status != 'RETIRED'`,
    [aid]
  );
  const [[assignRow]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM gear_assignments WHERE agency_id = ? AND returned_at IS NULL`,
    [aid]
  );

  return {
    activeTypes: Number(typeRow?.c || 0),
    lowStockCount: Number(stockRows?.low_count || 0),
    assetsAvailable: Number(assetRows?.available_count || 0),
    assetsIssued: Number(assetRows?.issued_count || 0),
    activeAssignments: Number(assignRow?.c || 0),
  };
}

export async function listTypes(agencyId, { includeInactive = false } = {}) {
  const aid = await resolveAgencyId(agencyId);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });
  const [rows] = await pool.execute(
    `SELECT * FROM gear_item_types
     WHERE agency_id = ?
       ${includeInactive ? '' : 'AND is_active = 1'}
     ORDER BY category ASC, name ASC`,
    [aid]
  );
  return (rows || []).map(mapType);
}

export async function createType(agencyId, body, actorUserId) {
  const aid = await resolveAgencyId(agencyId);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });
  const name = String(body?.name || '').trim();
  if (!name) throw Object.assign(new Error('Name is required'), { status: 400 });
  const trackingMode = String(body?.trackingMode || 'SIZED_STOCK').toUpperCase();
  if (!['SIZED_STOCK', 'UNIQUE_ASSET'].includes(trackingMode)) {
    throw Object.assign(new Error('Invalid tracking mode'), { status: 400 });
  }
  const category = String(body?.category || 'general').trim().slice(0, 64) || 'general';
  const sizeOptions = trackingMode === 'SIZED_STOCK'
    ? (parseSizeOptions(body?.sizeOptions).length
      ? parseSizeOptions(body.sizeOptions)
      : ['XS', 'S', 'M', 'L', 'XL'])
    : [];
  const lifecycleItemKey = body?.lifecycleItemKey ? String(body.lifecycleItemKey).trim().slice(0, 64) : null;
  if (lifecycleItemKey && !CLEAR_EQUIPMENT_LIFECYCLE_KEYS.includes(lifecycleItemKey)) {
    throw Object.assign(new Error('Invalid lifecycle item key'), { status: 400 });
  }
  const lowStockThreshold = Math.max(0, Number(body?.lowStockThreshold ?? 2));

  const [result] = await pool.execute(
    `INSERT INTO gear_item_types
       (agency_id, name, category, tracking_mode, size_options_json, lifecycle_item_key, low_stock_threshold)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [aid, name, category, trackingMode, JSON.stringify(sizeOptions), lifecycleItemKey, lowStockThreshold]
  );
  const typeId = result.insertId;

  if (trackingMode === 'SIZED_STOCK') {
    for (const size of sizeOptions) {
      await pool.execute(
        `INSERT INTO gear_stock_levels (agency_id, gear_item_type_id, size_label, quantity_on_hand)
         VALUES (?, ?, ?, 0)`,
        [aid, typeId, size]
      );
    }
  }

  void actorUserId;
  return mapType((await pool.execute(`SELECT * FROM gear_item_types WHERE id = ?`, [typeId]))[0][0]);
}

export async function updateType(agencyId, typeId, body) {
  const aid = await resolveAgencyId(agencyId);
  const tid = Number(typeId || 0);
  if (!aid || !tid) throw Object.assign(new Error('Invalid ids'), { status: 400 });

  const [[existing]] = await pool.execute(
    `SELECT * FROM gear_item_types WHERE id = ? AND agency_id = ?`,
    [tid, aid]
  );
  if (!existing) throw Object.assign(new Error('Gear type not found'), { status: 404 });

  const updates = [];
  const values = [];
  if (body?.name !== undefined) {
    updates.push('name = ?');
    values.push(String(body.name || '').trim().slice(0, 255));
  }
  if (body?.category !== undefined) {
    updates.push('category = ?');
    values.push(String(body.category || 'general').trim().slice(0, 64));
  }
  if (body?.lifecycleItemKey !== undefined) {
    const key = body.lifecycleItemKey ? String(body.lifecycleItemKey).trim().slice(0, 64) : null;
    if (key && !CLEAR_EQUIPMENT_LIFECYCLE_KEYS.includes(key)) {
      throw Object.assign(new Error('Invalid lifecycle item key'), { status: 400 });
    }
    updates.push('lifecycle_item_key = ?');
    values.push(key);
  }
  if (body?.lowStockThreshold !== undefined) {
    updates.push('low_stock_threshold = ?');
    values.push(Math.max(0, Number(body.lowStockThreshold || 0)));
  }
  if (body?.isActive !== undefined) {
    updates.push('is_active = ?');
    values.push(body.isActive ? 1 : 0);
  }
  if (body?.sizeOptions !== undefined && existing.tracking_mode === 'SIZED_STOCK') {
    const sizeOptions = parseSizeOptions(body.sizeOptions);
    updates.push('size_options_json = ?');
    values.push(JSON.stringify(sizeOptions));
    for (const size of sizeOptions) {
      await pool.execute(
        `INSERT IGNORE INTO gear_stock_levels (agency_id, gear_item_type_id, size_label, quantity_on_hand)
         VALUES (?, ?, ?, 0)`,
        [aid, tid, size]
      );
    }
  }

  if (updates.length) {
    values.push(tid, aid);
    await pool.execute(
      `UPDATE gear_item_types SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`,
      values
    );
  }

  const [[row]] = await pool.execute(`SELECT * FROM gear_item_types WHERE id = ?`, [tid]);
  return mapType(row);
}

export async function listStock(agencyId) {
  const aid = await resolveAgencyId(agencyId);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });
  const [rows] = await pool.execute(
    `SELECT s.*, t.name AS type_name, t.category, t.low_stock_threshold, t.tracking_mode
     FROM gear_stock_levels s
     JOIN gear_item_types t ON t.id = s.gear_item_type_id
     WHERE s.agency_id = ? AND t.tracking_mode = 'SIZED_STOCK' AND t.is_active = 1
     ORDER BY t.category, t.name, s.size_label`,
    [aid]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    agencyId: r.agency_id,
    gearItemTypeId: r.gear_item_type_id,
    typeName: r.type_name,
    category: r.category,
    sizeLabel: r.size_label,
    quantityOnHand: Number(r.quantity_on_hand || 0),
    lowStockThreshold: Number(r.low_stock_threshold ?? 2),
    isLow: Number(r.quantity_on_hand || 0) <= Number(r.low_stock_threshold ?? 2),
  }));
}

export async function adjustStock(agencyId, { gearItemTypeId, sizeLabel, quantityOnHand, delta, reason }, actorUserId) {
  const aid = await resolveAgencyId(agencyId);
  const tid = Number(gearItemTypeId || 0);
  const size = String(sizeLabel || '').trim();
  if (!aid || !tid || !size) throw Object.assign(new Error('Type and size are required'), { status: 400 });

  const [[typeRow]] = await pool.execute(
    `SELECT * FROM gear_item_types WHERE id = ? AND agency_id = ? AND tracking_mode = 'SIZED_STOCK'`,
    [tid, aid]
  );
  if (!typeRow) throw Object.assign(new Error('Sized gear type not found'), { status: 404 });

  const [[stock]] = await pool.execute(
    `SELECT * FROM gear_stock_levels WHERE agency_id = ? AND gear_item_type_id = ? AND size_label = ?`,
    [aid, tid, size]
  );

  let nextQty;
  let qtyDelta;
  if (quantityOnHand !== undefined && quantityOnHand !== null) {
    nextQty = Math.max(0, Number(quantityOnHand));
    qtyDelta = nextQty - Number(stock?.quantity_on_hand || 0);
  } else {
    qtyDelta = Number(delta || 0);
    nextQty = Math.max(0, Number(stock?.quantity_on_hand || 0) + qtyDelta);
  }

  if (!stock) {
    await pool.execute(
      `INSERT INTO gear_stock_levels (agency_id, gear_item_type_id, size_label, quantity_on_hand)
       VALUES (?, ?, ?, ?)`,
      [aid, tid, size, nextQty]
    );
  } else {
    await pool.execute(
      `UPDATE gear_stock_levels SET quantity_on_hand = ? WHERE id = ?`,
      [nextQty, stock.id]
    );
  }

  await logMovement({
    agencyId: aid,
    gearItemTypeId: tid,
    sizeLabel: size,
    movementType: 'ADJUST',
    quantityDelta: qtyDelta,
    reason: reason || 'Stock adjustment',
    createdByUserId: actorUserId,
  });

  return { gearItemTypeId: tid, sizeLabel: size, quantityOnHand: nextQty };
}

export async function listAssets(agencyId, { gearItemTypeId = null, status = null } = {}) {
  const aid = await resolveAgencyId(agencyId);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });
  const params = [aid];
  let where = 'a.agency_id = ?';
  if (gearItemTypeId) {
    where += ' AND a.gear_item_type_id = ?';
    params.push(Number(gearItemTypeId));
  }
  if (status) {
    where += ' AND a.status = ?';
    params.push(String(status).toUpperCase());
  }
  const [rows] = await pool.execute(
    `SELECT a.*, t.name AS type_name, t.category,
            u.id AS holder_user_id, u.first_name AS holder_first_name, u.last_name AS holder_last_name
     FROM gear_unique_assets a
     JOIN gear_item_types t ON t.id = a.gear_item_type_id
     LEFT JOIN gear_assignments ga
       ON ga.unique_asset_id = a.id AND ga.returned_at IS NULL
     LEFT JOIN users u ON u.id = ga.user_id
     WHERE ${where}
     ORDER BY t.name, a.asset_code`,
    params
  );
  return (rows || []).map((r) => ({
    id: r.id,
    agencyId: r.agency_id,
    gearItemTypeId: r.gear_item_type_id,
    typeName: r.type_name,
    category: r.category,
    assetCode: r.asset_code,
    status: r.status,
    notes: r.notes,
    holder: r.holder_user_id
      ? {
          userId: r.holder_user_id,
          name: `${r.holder_first_name || ''} ${r.holder_last_name || ''}`.trim(),
        }
      : null,
  }));
}

export async function createAsset(agencyId, { gearItemTypeId, assetCode, notes }, actorUserId) {
  const aid = await resolveAgencyId(agencyId);
  const tid = Number(gearItemTypeId || 0);
  const code = String(assetCode || '').trim().slice(0, 64);
  if (!aid || !tid || !code) throw Object.assign(new Error('Type and asset code are required'), { status: 400 });

  const [[typeRow]] = await pool.execute(
    `SELECT * FROM gear_item_types WHERE id = ? AND agency_id = ? AND tracking_mode = 'UNIQUE_ASSET'`,
    [tid, aid]
  );
  if (!typeRow) throw Object.assign(new Error('Unique asset gear type not found'), { status: 404 });

  try {
    const [result] = await pool.execute(
      `INSERT INTO gear_unique_assets (agency_id, gear_item_type_id, asset_code, notes, status)
       VALUES (?, ?, ?, ?, 'AVAILABLE')`,
      [aid, tid, code, notes ? String(notes).trim() : null]
    );
    await logMovement({
      agencyId: aid,
      gearItemTypeId: tid,
      uniqueAssetId: result.insertId,
      movementType: 'CREATE_ASSET',
      reason: `Created asset ${code}`,
      createdByUserId: actorUserId,
    });
    const [[row]] = await pool.execute(`SELECT * FROM gear_unique_assets WHERE id = ?`, [result.insertId]);
    return {
      id: row.id,
      assetCode: row.asset_code,
      status: row.status,
      gearItemTypeId: row.gear_item_type_id,
      notes: row.notes,
    };
  } catch (e) {
    if (String(e?.code || '') === 'ER_DUP_ENTRY') {
      throw Object.assign(new Error('Asset code already exists for this agency'), { status: 409 });
    }
    throw e;
  }
}

export async function updateAsset(agencyId, assetId, body) {
  const aid = await resolveAgencyId(agencyId);
  const id = Number(assetId || 0);
  if (!aid || !id) throw Object.assign(new Error('Invalid ids'), { status: 400 });
  const [[existing]] = await pool.execute(
    `SELECT * FROM gear_unique_assets WHERE id = ? AND agency_id = ?`,
    [id, aid]
  );
  if (!existing) throw Object.assign(new Error('Asset not found'), { status: 404 });

  const updates = [];
  const values = [];
  if (body?.notes !== undefined) {
    updates.push('notes = ?');
    values.push(body.notes ? String(body.notes).trim() : null);
  }
  if (body?.status !== undefined) {
    const st = String(body.status).toUpperCase();
    if (!['AVAILABLE', 'ISSUED', 'RETIRED'].includes(st)) {
      throw Object.assign(new Error('Invalid status'), { status: 400 });
    }
    if (st === 'AVAILABLE' && existing.status === 'ISSUED') {
      throw Object.assign(new Error('Return the assignment first to free this asset'), { status: 400 });
    }
    updates.push('status = ?');
    values.push(st);
  }
  if (!updates.length) return existing;
  values.push(id, aid);
  await pool.execute(
    `UPDATE gear_unique_assets SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`,
    values
  );
  const [[row]] = await pool.execute(`SELECT * FROM gear_unique_assets WHERE id = ?`, [id]);
  return row;
}

export async function listMovements(agencyId, { limit = 50 } = {}) {
  const aid = await resolveAgencyId(agencyId);
  if (!aid) throw Object.assign(new Error('Agency ID required'), { status: 400 });
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const [rows] = await pool.execute(
    `SELECT m.*, t.name AS type_name, a.asset_code,
            u.first_name, u.last_name
     FROM gear_stock_movements m
     JOIN gear_item_types t ON t.id = m.gear_item_type_id
     LEFT JOIN gear_unique_assets a ON a.id = m.unique_asset_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.agency_id = ?
     ORDER BY m.created_at DESC
     LIMIT ${lim}`,
    [aid]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    movementType: r.movement_type,
    typeName: r.type_name,
    sizeLabel: r.size_label,
    assetCode: r.asset_code,
    quantityDelta: Number(r.quantity_delta || 0),
    reason: r.reason,
    userName: r.first_name || r.last_name
      ? `${r.first_name || ''} ${r.last_name || ''}`.trim()
      : null,
    createdAt: r.created_at,
  }));
}

export async function listUserAssignments(agencyId, userId, { activeOnly = true } = {}) {
  const aid = await resolveAgencyId(agencyId);
  const uid = Number(userId || 0);
  if (!aid || !uid) throw Object.assign(new Error('Agency and user are required'), { status: 400 });
  const [rows] = await pool.execute(
    `SELECT ga.*, t.name AS type_name, t.category, t.tracking_mode, t.lifecycle_item_key,
            a.asset_code
     FROM gear_assignments ga
     JOIN gear_item_types t ON t.id = ga.gear_item_type_id
     LEFT JOIN gear_unique_assets a ON a.id = ga.unique_asset_id
     WHERE ga.agency_id = ? AND ga.user_id = ?
       ${activeOnly ? 'AND ga.returned_at IS NULL' : ''}
     ORDER BY ga.issued_at DESC`,
    [aid, uid]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    gearItemTypeId: r.gear_item_type_id,
    typeName: r.type_name,
    category: r.category,
    trackingMode: r.tracking_mode,
    sizeLabel: r.size_label,
    uniqueAssetId: r.unique_asset_id,
    assetCode: r.asset_code,
    issuedAt: r.issued_at,
    returnedAt: r.returned_at,
    notes: r.notes,
  }));
}

export async function issueGear(agencyId, {
  userId,
  gearItemTypeId,
  sizeLabel = null,
  uniqueAssetId = null,
  notes = null,
}, actorUserId) {
  const aid = await resolveAgencyId(agencyId);
  const uid = Number(userId || 0);
  const tid = Number(gearItemTypeId || 0);
  if (!aid || !uid || !tid) throw Object.assign(new Error('Agency, user, and type are required'), { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[typeRow]] = await conn.execute(
      `SELECT * FROM gear_item_types WHERE id = ? AND agency_id = ? AND is_active = 1 FOR UPDATE`,
      [tid, aid]
    );
    if (!typeRow) throw Object.assign(new Error('Gear type not found'), { status: 404 });

    let size = null;
    let assetId = null;

    if (typeRow.tracking_mode === 'SIZED_STOCK') {
      size = String(sizeLabel || '').trim();
      if (!size) throw Object.assign(new Error('Size is required'), { status: 400 });
      const [[stock]] = await conn.execute(
        `SELECT * FROM gear_stock_levels
         WHERE agency_id = ? AND gear_item_type_id = ? AND size_label = ?
         FOR UPDATE`,
        [aid, tid, size]
      );
      if (!stock || Number(stock.quantity_on_hand) < 1) {
        throw Object.assign(new Error(`No stock available for size ${size}`), { status: 400 });
      }
      await conn.execute(
        `UPDATE gear_stock_levels SET quantity_on_hand = quantity_on_hand - 1 WHERE id = ?`,
        [stock.id]
      );
    } else {
      assetId = Number(uniqueAssetId || 0);
      if (!assetId) throw Object.assign(new Error('Asset is required'), { status: 400 });
      const [[asset]] = await conn.execute(
        `SELECT * FROM gear_unique_assets
         WHERE id = ? AND agency_id = ? AND gear_item_type_id = ?
         FOR UPDATE`,
        [assetId, aid, tid]
      );
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (asset.status !== 'AVAILABLE') {
        throw Object.assign(new Error('Asset is not available'), { status: 400 });
      }
      await conn.execute(
        `UPDATE gear_unique_assets SET status = 'ISSUED' WHERE id = ?`,
        [assetId]
      );
    }

    const [assignResult] = await conn.execute(
      `INSERT INTO gear_assignments
         (agency_id, user_id, gear_item_type_id, size_label, unique_asset_id, issued_by_user_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [aid, uid, tid, size, assetId, actorUserId || null, notes ? String(notes).trim() : null]
    );
    const assignmentId = assignResult.insertId;

    await conn.execute(
      `INSERT INTO gear_stock_movements
         (agency_id, gear_item_type_id, size_label, unique_asset_id, user_id, assignment_id,
          movement_type, quantity_delta, reason, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'ISSUE', ?, ?, ?)`,
      [
        aid,
        tid,
        size,
        assetId,
        uid,
        assignmentId,
        typeRow.tracking_mode === 'SIZED_STOCK' ? -1 : 0,
        `Issued to user #${uid}`,
        actorUserId || null,
      ]
    );

    await conn.commit();

    await maybeAutoCompleteLifecycle({
      userId: uid,
      lifecycleItemKey: typeRow.lifecycle_item_key,
    });

    const list = await listUserAssignments(aid, uid, { activeOnly: true });
    return list.find((a) => a.id === assignmentId) || { id: assignmentId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function returnGear(agencyId, assignmentId, actorUserId, { notes = null } = {}) {
  const aid = await resolveAgencyId(agencyId);
  const id = Number(assignmentId || 0);
  if (!aid || !id) throw Object.assign(new Error('Invalid ids'), { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[assignment]] = await conn.execute(
      `SELECT ga.*, t.tracking_mode
       FROM gear_assignments ga
       JOIN gear_item_types t ON t.id = ga.gear_item_type_id
       WHERE ga.id = ? AND ga.agency_id = ?
       FOR UPDATE`,
      [id, aid]
    );
    if (!assignment) throw Object.assign(new Error('Assignment not found'), { status: 404 });
    if (assignment.returned_at) throw Object.assign(new Error('Already returned'), { status: 400 });

    await conn.execute(
      `UPDATE gear_assignments
       SET returned_at = NOW(), returned_by_user_id = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
      [actorUserId || null, notes ? String(notes).trim() : null, id]
    );

    if (assignment.tracking_mode === 'SIZED_STOCK' && assignment.size_label) {
      await conn.execute(
        `UPDATE gear_stock_levels
         SET quantity_on_hand = quantity_on_hand + 1
         WHERE agency_id = ? AND gear_item_type_id = ? AND size_label = ?`,
        [aid, assignment.gear_item_type_id, assignment.size_label]
      );
    } else if (assignment.unique_asset_id) {
      await conn.execute(
        `UPDATE gear_unique_assets SET status = 'AVAILABLE' WHERE id = ? AND agency_id = ?`,
        [assignment.unique_asset_id, aid]
      );
    }

    await conn.execute(
      `INSERT INTO gear_stock_movements
         (agency_id, gear_item_type_id, size_label, unique_asset_id, user_id, assignment_id,
          movement_type, quantity_delta, reason, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'RETURN', ?, ?, ?)`,
      [
        aid,
        assignment.gear_item_type_id,
        assignment.size_label,
        assignment.unique_asset_id,
        assignment.user_id,
        id,
        assignment.tracking_mode === 'SIZED_STOCK' ? 1 : 0,
        `Returned from user #${assignment.user_id}`,
        actorUserId || null,
      ]
    );

    await conn.commit();
    return { ok: true, id };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getUserPreferences(agencyId, userId) {
  const aid = await resolveAgencyId(agencyId);
  const uid = Number(userId || 0);
  if (!aid || !uid) throw Object.assign(new Error('Agency and user required'), { status: 400 });
  const [[row]] = await pool.execute(
    `SELECT * FROM user_gear_preferences WHERE agency_id = ? AND user_id = ?`,
    [aid, uid]
  );
  let prefs = {};
  if (row?.preferences_json) {
    try {
      prefs = typeof row.preferences_json === 'string'
        ? JSON.parse(row.preferences_json)
        : row.preferences_json;
    } catch { prefs = {}; }
  }
  return { preferences: prefs || {}, updatedAt: row?.updated_at || null };
}

export async function setUserPreferences(agencyId, userId, preferences, actorUserId) {
  const aid = await resolveAgencyId(agencyId);
  const uid = Number(userId || 0);
  if (!aid || !uid) throw Object.assign(new Error('Agency and user required'), { status: 400 });
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  await pool.execute(
    `INSERT INTO user_gear_preferences (agency_id, user_id, preferences_json, updated_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       preferences_json = VALUES(preferences_json),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [aid, uid, JSON.stringify(prefs), actorUserId || null]
  );
  return getUserPreferences(aid, uid);
}

export async function listIssuableStock(agencyId, gearItemTypeId) {
  const aid = await resolveAgencyId(agencyId);
  const tid = Number(gearItemTypeId || 0);
  if (!aid || !tid) throw Object.assign(new Error('Invalid ids'), { status: 400 });
  const [[typeRow]] = await pool.execute(
    `SELECT * FROM gear_item_types WHERE id = ? AND agency_id = ?`,
    [tid, aid]
  );
  if (!typeRow) throw Object.assign(new Error('Not found'), { status: 404 });
  if (typeRow.tracking_mode === 'SIZED_STOCK') {
    const [rows] = await pool.execute(
      `SELECT size_label, quantity_on_hand FROM gear_stock_levels
       WHERE agency_id = ? AND gear_item_type_id = ? AND quantity_on_hand > 0
       ORDER BY size_label`,
      [aid, tid]
    );
    return {
      trackingMode: 'SIZED_STOCK',
      sizes: (rows || []).map((r) => ({
        sizeLabel: r.size_label,
        quantityOnHand: Number(r.quantity_on_hand || 0),
      })),
    };
  }
  const assets = await listAssets(aid, { gearItemTypeId: tid, status: 'AVAILABLE' });
  return { trackingMode: 'UNIQUE_ASSET', assets };
}
