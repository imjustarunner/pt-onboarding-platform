/**
 * Unified materials request board: aggregates school onboarding, collaborative
 * year update, and provider fall-update materials into one fulfillment queue.
 * Inventory-backed items (carts, shirts/polos, canvas bags) issue via gear inventory.
 */
import pool from '../config/database.js';
import { currentSchoolYear } from './schoolReinit.service.js';
import {
  issueGear,
  listTypes as listGearTypes,
  listIssuableStock,
} from './gearInventory.service.js';

const YEAR_EQ = `school_year COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

const WELCOME_LABELS = {
  trifolds: 'Trifold brochures',
  stress_balls: 'Stress balls',
  pens: 'Pens',
  other: 'Other materials',
};

const INVENTORY_KEYS = new Set(['school_cart', 'shirt', 'canvas_bag']);

function parseJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function truthy(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes';
}

function yesNo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === '1') return 'yes';
  if (s === 'no' || s === 'false' || s === '0') return 'no';
  return null;
}

function shirtDetail(m) {
  const g = String(m.shirt_gender || m.polo_sex || '').trim();
  const size = String(m.shirt_size || m.polo_size || '').trim();
  const alt = String(m.shirt_size_secondary || m.polo_size_secondary || '').trim();
  return [g, size, alt ? `alt ${alt}` : ''].filter(Boolean).join(' · ') || null;
}

function matchesGearKey(type, itemKey) {
  const hay = `${type?.name || ''} ${type?.category || ''}`.toLowerCase();
  if (itemKey === 'school_cart') return /cart/.test(hay);
  if (itemKey === 'shirt') return /shirt|polo|t-?shirt/.test(hay);
  if (itemKey === 'canvas_bag') return /bag|canvas/.test(hay);
  return false;
}

function emptyFulfillment() {
  return {
    id: null,
    status: 'pending',
    assignedToUserId: null,
    assignedToName: null,
    notes: null,
    gearAssignmentId: null,
    uniqueAssetId: null,
    gearItemTypeId: null,
    fulfilledByUserId: null,
    fulfilledAt: null,
  };
}

function applyFulfillment(item, map) {
  const key = `${item.sourceType}:${item.sourceId}:${item.itemKey}`;
  const f = map.get(key);
  if (!f) {
    item.fulfillment = emptyFulfillment();
    return item;
  }
  item.fulfillment = {
    id: f.id,
    status: f.status,
    assignedToUserId: f.assigned_to_user_id ? Number(f.assigned_to_user_id) : null,
    assignedToName: [f.assigned_first_name, f.assigned_last_name].filter(Boolean).join(' ').trim() || null,
    notes: f.notes || null,
    gearAssignmentId: f.gear_assignment_id ? Number(f.gear_assignment_id) : null,
    uniqueAssetId: f.unique_asset_id ? Number(f.unique_asset_id) : null,
    gearItemTypeId: f.gear_item_type_id ? Number(f.gear_item_type_id) : null,
    fulfilledByUserId: f.fulfilled_by_user_id ? Number(f.fulfilled_by_user_id) : null,
    fulfilledAt: f.fulfilled_at || null,
  };
  return item;
}

function groupKey(item) {
  if (item.organizationId) return `school:${item.organizationId}`;
  if (item.userId) return `provider:${item.userId}`;
  return `${item.sourceType}:${item.sourceId}`;
}

async function loadFulfillmentMap(agencyId) {
  const [rows] = await pool.execute(
    `SELECT f.*,
            au.first_name AS assigned_first_name,
            au.last_name AS assigned_last_name
     FROM materials_request_fulfillments f
     LEFT JOIN users au ON au.id = f.assigned_to_user_id
     WHERE f.agency_id = ?`,
    [agencyId]
  );
  const map = new Map();
  for (const r of rows || []) {
    map.set(`${r.source_type}:${r.source_id}:${r.item_key}`, r);
  }
  return map;
}

function pushOnboardingItems(invite, items) {
  const payload = parseJson(invite.step_payload);
  const wm = payload.welcome_materials || {};
  const materials = Array.isArray(wm.materials) ? wm.materials : [];
  const other = String(wm.materialsOther || '').trim();
  const contact = [invite.contact_first_name, invite.contact_last_name].filter(Boolean).join(' ').trim();
  const base = {
    sourceType: 'school_onboarding',
    sourceId: Number(invite.id),
    sourceLabel: 'School onboarding',
    schoolYear: null,
    organizationId: invite.school_organization_id ? Number(invite.school_organization_id) : null,
    userId: null,
    subjectName: invite.school_name || 'New school',
    subjectKind: 'school',
    contactName: contact || null,
    contactEmail: invite.contact_email || null,
    updatedAt: invite.updated_at || invite.submitted_at || invite.created_at,
  };

  if (wm.requestPaperPackets === true) {
    items.push({
      ...base,
      itemKey: 'paper_packets',
      itemLabel: 'Paper packets',
      inventoryBacked: false,
      detail: null,
    });
  }
  for (const key of materials) {
    const k = String(key || '').trim();
    if (!WELCOME_LABELS[k]) continue;
    items.push({
      ...base,
      itemKey: k,
      itemLabel: WELCOME_LABELS[k],
      inventoryBacked: false,
      detail: k === 'other' ? other || null : null,
    });
  }
}

function pushReinitItems(row, items) {
  const data = parseJson(row.data_json);
  const notes = String(data.materials_notes || data.materialsNotes || '').trim();
  const base = {
    sourceType: 'school_reinit',
    sourceId: Number(row.cycle_id),
    sourceLabel: 'Collaborative year update',
    schoolYear: row.school_year,
    organizationId: Number(row.school_organization_id),
    userId: null,
    subjectName: row.school_name || `School ${row.school_organization_id}`,
    subjectKind: 'school',
    contactName: null,
    contactEmail: null,
    notes,
    updatedAt: row.reviewed_at || row.cycle_updated_at,
  };
  if (truthy(data.need_paper_packets || data.needPaperPackets)) {
    items.push({ ...base, itemKey: 'paper_packets', itemLabel: 'Paper packets', inventoryBacked: false, detail: notes || null });
  }
  if (truthy(data.need_trifolds || data.needTrifolds)) {
    items.push({ ...base, itemKey: 'trifolds', itemLabel: 'Trifold brochures', inventoryBacked: false, detail: notes || null });
  }
  if (truthy(data.materials_delivery_required || data.materialsDeliveryRequired)) {
    items.push({ ...base, itemKey: 'delivery', itemLabel: 'Delivery needed', inventoryBacked: false, detail: notes || null });
  }
  if (
    notes &&
    !truthy(data.need_paper_packets || data.needPaperPackets) &&
    !truthy(data.need_trifolds || data.needTrifolds) &&
    !truthy(data.materials_delivery_required || data.materialsDeliveryRequired)
  ) {
    items.push({ ...base, itemKey: 'materials_notes', itemLabel: 'Materials notes', inventoryBacked: false, detail: notes });
  }
}

function pushPyuItems(row, items) {
  const m = parseJson(row.data_json);
  const notes = String(m.materials_notes || m.materialsNotes || '').trim();
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `Provider ${row.provider_user_id}`;
  const base = {
    sourceType: 'provider_year_update',
    sourceId: Number(row.cycle_id),
    sourceLabel: 'Provider fall update',
    schoolYear: row.school_year,
    organizationId: null,
    userId: Number(row.provider_user_id),
    subjectName: name,
    subjectKind: 'provider',
    contactName: name,
    contactEmail: row.email || null,
    notes,
    updatedAt: row.reviewed_at || row.cycle_updated_at,
  };

  const add = (itemKey, itemLabel, requested, detail = null, inventoryBacked = false) => {
    if (!requested) return;
    items.push({ ...base, itemKey, itemLabel, inventoryBacked, detail: detail || notes || null });
  };

  add(
    'school_cart',
    'School cart',
    m.school_cart === 'need' || truthy(m.need_school_cart),
    'Requested via fall update',
    true
  );
  add('office_key', 'Office key', yesNo(m.has_office_key) === 'no');
  add('shirt', 'ITSCO shirt / polo', yesNo(m.has_shirt) === 'no' || truthy(m.itsco_polo), shirtDetail(m), true);
  add(
    'itsco_name_tag',
    'ITSCO name tag',
    yesNo(m.has_itsco_name_tag) === 'no' || (yesNo(m.has_itsco_name_tag) == null && truthy(m.itsco_name_tag)),
    [m.itsco_name_tag_name, m.itsco_name_tag_title].filter(Boolean).join(' · ') || null
  );
  add(
    'office_nametag',
    'Office nametag',
    yesNo(m.has_office_nametag) === 'no' || (yesNo(m.has_office_nametag) == null && truthy(m.office_nametag)),
    m.office_nametag_name || null
  );
  add(
    'itsco_lanyard',
    'ITSCO lanyard',
    yesNo(m.has_itsco_lanyard) === 'no' || (yesNo(m.has_itsco_lanyard) == null && truthy(m.itsco_lanyard))
  );
  add(
    'business_cards',
    'Business cards',
    yesNo(m.has_business_cards) === 'no' || (yesNo(m.has_business_cards) == null && truthy(m.business_cards))
  );
  add(
    'canvas_bag',
    'ITSCO canvas bag',
    yesNo(m.has_canvas_bag) === 'no' || (yesNo(m.has_canvas_bag) == null && truthy(m.itsco_canvas_bag)),
    null,
    true
  );
}

export async function listMaterialsRequestBoard(agencyId, { schoolYear } = {}) {
  const aid = Number(agencyId);
  if (!aid) throw Object.assign(new Error('agencyId is required'), { status: 400 });
  const year = schoolYear || currentSchoolYear();

  const [onboardingRows] = await pool.execute(
    `SELECT id, school_name, school_organization_id, contact_first_name, contact_last_name,
            contact_email, step_payload, status, submitted_at, created_at, updated_at
     FROM school_onboarding_invites
     WHERE agency_id = ?
       AND status IN ('invited', 'in_progress', 'submitted')`,
    [aid]
  );

  const [reinitRows] = await pool.execute(
    `SELECT c.id AS cycle_id, c.school_organization_id, c.school_year, c.updated_at AS cycle_updated_at,
            a.name AS school_name, p.data_json, p.reviewed_at
     FROM school_reinit_cycles c
     INNER JOIN agencies a ON a.id = c.school_organization_id
     LEFT JOIN school_reinit_section_progress p
       ON p.cycle_id = c.id AND p.section_key = 'materials'
     WHERE c.agency_id = ? AND ${YEAR_EQ}`,
    [aid, year]
  );

  const [pyuRows] = await pool.execute(
    `SELECT c.id AS cycle_id, c.provider_user_id, c.school_year, c.updated_at AS cycle_updated_at,
            u.first_name, u.last_name, u.email, p.data_json, p.reviewed_at
     FROM provider_year_update_cycles c
     INNER JOIN users u ON u.id = c.provider_user_id
     LEFT JOIN provider_year_update_section_progress p
       ON p.cycle_id = c.id AND p.section_key = 'materials'
     WHERE c.agency_id = ? AND ${YEAR_EQ}`,
    [aid, year]
  );

  const items = [];
  for (const row of onboardingRows || []) pushOnboardingItems(row, items);
  for (const row of reinitRows || []) pushReinitItems(row, items);
  for (const row of pyuRows || []) pushPyuItems(row, items);

  const fmap = await loadFulfillmentMap(aid);
  for (const item of items) applyFulfillment(item, fmap);

  const groupsMap = new Map();
  for (const item of items) {
    const gk = groupKey(item);
    if (!groupsMap.has(gk)) {
      groupsMap.set(gk, {
        key: gk,
        subjectKind: item.subjectKind,
        subjectName: item.subjectName,
        organizationId: item.organizationId,
        userId: item.userId,
        contactName: item.contactName,
        contactEmail: item.contactEmail,
        sources: new Set(),
        schoolYear: item.schoolYear,
        items: [],
        updatedAt: item.updatedAt,
      });
    }
    const g = groupsMap.get(gk);
    g.items.push(item);
    g.sources.add(item.sourceLabel);
    const t = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    const cur = g.updatedAt ? new Date(g.updatedAt).getTime() : 0;
    if (t > cur) g.updatedAt = item.updatedAt;
  }

  const groups = [...groupsMap.values()].map((g) => {
    const itemList = g.items;
    const pending = itemList.filter((i) => i.fulfillment.status !== 'fulfilled').length;
    const fulfilled = itemList.filter((i) => i.fulfillment.status === 'fulfilled').length;
    const delivery = itemList.some((i) => i.itemKey === 'delivery' && i.fulfillment.status !== 'fulfilled');
    const paper = itemList.some((i) => i.itemKey === 'paper_packets');
    const trifolds = itemList.some((i) => i.itemKey === 'trifolds');
    const businessCards = itemList.some((i) => i.itemKey === 'business_cards');
    const followUp = itemList.some((i) => i.fulfillment.status === 'assigned')
      ? 'pending'
      : pending === 0
        ? 'complete'
        : pending < itemList.length
          ? 'in_progress'
          : 'none';
    return {
      key: g.key,
      subjectKind: g.subjectKind,
      subjectName: g.subjectName,
      organizationId: g.organizationId,
      userId: g.userId,
      contactName: g.contactName,
      contactEmail: g.contactEmail,
      sources: [...g.sources],
      schoolYear: g.schoolYear,
      updatedAt: g.updatedAt,
      pendingCount: pending,
      fulfilledCount: fulfilled,
      itemCount: itemList.length,
      needPaperPackets: paper,
      needTrifolds: trifolds,
      needBusinessCards: businessCards,
      deliveryNeeded: delivery,
      followUp,
      notes: itemList.map((i) => i.detail).filter(Boolean)[0] || itemList[0]?.notes || null,
      items: itemList,
    };
  }).sort((a, b) => String(a.subjectName).localeCompare(String(b.subjectName)));

  const allItems = items;
  const summary = {
    totalGroups: groups.length,
    groupsWithRequests: groups.filter((g) => g.itemCount > 0).length,
    needingDelivery: groups.filter((g) => g.deliveryNeeded).length,
    paperPacketRequests: allItems.filter((i) => i.itemKey === 'paper_packets' && i.fulfillment.status !== 'fulfilled').length,
    trifoldRequests: allItems.filter((i) => i.itemKey === 'trifolds' && i.fulfillment.status !== 'fulfilled').length,
    pendingFollowUps: allItems.filter((i) => i.fulfillment.status === 'assigned').length,
    pendingItems: allItems.filter((i) => i.fulfillment.status !== 'fulfilled').length,
    cartRequests: allItems.filter((i) => i.itemKey === 'school_cart' && i.fulfillment.status !== 'fulfilled').length,
    shirtRequests: allItems.filter((i) => i.itemKey === 'shirt' && i.fulfillment.status !== 'fulfilled').length,
    bagRequests: allItems.filter((i) => i.itemKey === 'canvas_bag' && i.fulfillment.status !== 'fulfilled').length,
    businessCardRequests: allItems.filter((i) => i.itemKey === 'business_cards' && i.fulfillment.status !== 'fulfilled').length,
  };

  return { agencyId: aid, schoolYear: year, summary, groups };
}

export async function listAssignees(agencyId) {
  const aid = Number(agencyId);
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role
     FROM user_agencies ua
     INNER JOIN users u ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND LOWER(COALESCE(u.role, '')) IN (
         'admin', 'super_admin', 'staff', 'support',
         'clinical_practice_assistant', 'provider_plus', 'provider+', 'provider'
       )
     ORDER BY u.first_name, u.last_name`,
    [aid]
  );
  return (rows || []).map((u) => ({
    id: Number(u.id),
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email,
    email: u.email,
    role: u.role,
  }));
}

export async function getInventoryOptions(agencyId, itemKey) {
  const aid = Number(agencyId);
  const key = String(itemKey || '').trim();
  if (!INVENTORY_KEYS.has(key)) {
    return { inventoryBacked: false, types: [] };
  }
  const types = await listGearTypes(aid, { includeInactive: false });
  const matched = (types || []).filter((t) => matchesGearKey(t, key) && t.isActive !== false);
  const out = [];
  for (const t of matched) {
    const issuable = await listIssuableStock(aid, t.id);
    out.push({
      id: t.id,
      name: t.name,
      trackingMode: t.trackingMode || t.tracking_mode,
      isGendered: !!(t.isGendered ?? t.is_gendered),
      ...issuable,
    });
  }
  return { inventoryBacked: true, itemKey: key, types: out };
}

async function upsertFulfillment({
  agencyId,
  sourceType,
  sourceId,
  itemKey,
  patch,
}) {
  const aid = Number(agencyId);
  const sid = Number(sourceId);
  const st = String(sourceType || '');
  const ik = String(itemKey || '');
  if (!aid || !sid || !st || !ik) {
    throw Object.assign(new Error('agencyId, sourceType, sourceId, and itemKey are required'), { status: 400 });
  }

  const [[existing]] = await pool.execute(
    `SELECT * FROM materials_request_fulfillments
     WHERE agency_id = ? AND source_type = ? AND source_id = ? AND item_key = ?
     LIMIT 1`,
    [aid, st, sid, ik]
  );

  if (!existing) {
    await pool.execute(
      `INSERT INTO materials_request_fulfillments
        (agency_id, source_type, source_id, item_key, status, assigned_to_user_id, notes,
         gear_assignment_id, unique_asset_id, gear_item_type_id, fulfilled_by_user_id, fulfilled_at,
         updated_by_user_id, extra_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        aid,
        st,
        sid,
        ik,
        patch.status || 'pending',
        patch.assigned_to_user_id ?? null,
        patch.notes ?? null,
        patch.gear_assignment_id ?? null,
        patch.unique_asset_id ?? null,
        patch.gear_item_type_id ?? null,
        patch.fulfilled_by_user_id ?? null,
        patch.fulfilled_at ?? null,
        patch.updated_by_user_id ?? null,
        patch.extra_json ? JSON.stringify(patch.extra_json) : null,
      ]
    );
  } else {
    await pool.execute(
      `UPDATE materials_request_fulfillments
       SET status = ?,
           assigned_to_user_id = ?,
           notes = ?,
           gear_assignment_id = ?,
           unique_asset_id = ?,
           gear_item_type_id = ?,
           fulfilled_by_user_id = ?,
           fulfilled_at = ?,
           updated_by_user_id = ?,
           extra_json = ?
       WHERE id = ?`,
      [
        patch.status ?? existing.status,
        patch.assigned_to_user_id !== undefined ? patch.assigned_to_user_id : existing.assigned_to_user_id,
        patch.notes !== undefined ? patch.notes : existing.notes,
        patch.gear_assignment_id !== undefined ? patch.gear_assignment_id : existing.gear_assignment_id,
        patch.unique_asset_id !== undefined ? patch.unique_asset_id : existing.unique_asset_id,
        patch.gear_item_type_id !== undefined ? patch.gear_item_type_id : existing.gear_item_type_id,
        patch.fulfilled_by_user_id !== undefined ? patch.fulfilled_by_user_id : existing.fulfilled_by_user_id,
        patch.fulfilled_at !== undefined ? patch.fulfilled_at : existing.fulfilled_at,
        patch.updated_by_user_id ?? existing.updated_by_user_id,
        patch.extra_json !== undefined
          ? (patch.extra_json ? JSON.stringify(patch.extra_json) : existing.extra_json)
          : existing.extra_json,
        existing.id,
      ]
    );
  }

  const [[row]] = await pool.execute(
    `SELECT f.*, au.first_name AS assigned_first_name, au.last_name AS assigned_last_name
     FROM materials_request_fulfillments f
     LEFT JOIN users au ON au.id = f.assigned_to_user_id
     WHERE f.agency_id = ? AND f.source_type = ? AND f.source_id = ? AND f.item_key = ?
     LIMIT 1`,
    [aid, st, sid, ik]
  );
  return row;
}

export async function assignMaterialsItem({
  agencyId,
  sourceType,
  sourceId,
  itemKey,
  assignedToUserId,
  notes,
  actorUserId,
}) {
  const assignee = assignedToUserId ? Number(assignedToUserId) : null;
  const row = await upsertFulfillment({
    agencyId,
    sourceType,
    sourceId,
    itemKey,
    patch: {
      status: assignee ? 'assigned' : 'pending',
      assigned_to_user_id: assignee,
      notes: notes !== undefined ? notes : undefined,
      updated_by_user_id: actorUserId || null,
    },
  });
  return row;
}

export async function fulfillMaterialsItem({
  agencyId,
  sourceType,
  sourceId,
  itemKey,
  actorUserId,
  notes,
  gearItemTypeId,
  uniqueAssetId,
  sizeLabel,
  gender,
  issueToUserId,
  skipInventory = false,
}) {
  const key = String(itemKey || '');
  let assignment = null;

  if (INVENTORY_KEYS.has(key) && !skipInventory) {
    const uid = Number(issueToUserId || 0);
    if (!uid) {
      throw Object.assign(new Error('This item must be issued to a provider. Missing issueToUserId.'), { status: 400 });
    }
    const tid = Number(gearItemTypeId || 0);
    if (!tid) {
      throw Object.assign(new Error('Select an inventory item (cart, shirt, or bag) to issue.'), { status: 400 });
    }
    assignment = await issueGear(agencyId, {
      userId: uid,
      gearItemTypeId: tid,
      sizeLabel: sizeLabel || null,
      gender: gender || '',
      uniqueAssetId: uniqueAssetId || null,
      notes: notes || `Issued from materials request (${sourceType} #${sourceId})`,
    }, actorUserId);
  }

  const row = await upsertFulfillment({
    agencyId,
    sourceType,
    sourceId,
    itemKey,
    patch: {
      status: 'fulfilled',
      notes: notes !== undefined ? notes : undefined,
      gear_assignment_id: assignment?.id || null,
      unique_asset_id: uniqueAssetId ? Number(uniqueAssetId) : (assignment?.uniqueAssetId || assignment?.unique_asset_id || null),
      gear_item_type_id: gearItemTypeId ? Number(gearItemTypeId) : null,
      fulfilled_by_user_id: actorUserId || null,
      fulfilled_at: new Date(),
      updated_by_user_id: actorUserId || null,
      extra_json: {
        sizeLabel: sizeLabel || null,
        gender: gender || null,
      },
    },
  });
  return { fulfillment: row, assignment };
}

export async function reopenMaterialsItem({
  agencyId,
  sourceType,
  sourceId,
  itemKey,
  actorUserId,
}) {
  const [[existing]] = await pool.execute(
    `SELECT * FROM materials_request_fulfillments
     WHERE agency_id = ? AND source_type = ? AND source_id = ? AND item_key = ?
     LIMIT 1`,
    [Number(agencyId), String(sourceType), Number(sourceId), String(itemKey)]
  );
  if (!existing) {
    throw Object.assign(new Error('Fulfillment record not found'), { status: 404 });
  }
  if (existing.gear_assignment_id) {
    throw Object.assign(
      new Error('This item was issued from inventory. Return the gear in Gear Inventory before reopening.'),
      { status: 400 }
    );
  }
  const row = await upsertFulfillment({
    agencyId,
    sourceType,
    sourceId,
    itemKey,
    patch: {
      status: existing.assigned_to_user_id ? 'assigned' : 'pending',
      fulfilled_by_user_id: null,
      fulfilled_at: null,
      gear_assignment_id: null,
      unique_asset_id: null,
      gear_item_type_id: null,
      updated_by_user_id: actorUserId || null,
    },
  });
  return row;
}
