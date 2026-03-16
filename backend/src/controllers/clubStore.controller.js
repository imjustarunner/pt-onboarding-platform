/**
 * Summit Stats Challenge: Club Store
 * Per-club store for merchandise/rewards. Club = organization_type affiliation.
 */
import pool from '../config/database.js';
import ClubStoreProduct from '../models/ClubStoreProduct.model.js';
import ClubStoreOrder from '../models/ClubStoreOrder.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const getUserAgencyContext = async (userId) => {
  const memberships = await User.getAgencies(userId);
  const allOrgIds = (memberships || []).map((m) => Number(m?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const agencyIds = (memberships || [])
    .filter((m) => String(m?.organization_type || '').toLowerCase() === 'agency')
    .map((m) => Number(m?.id || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { allOrgIds, agencyIds };
};

const canManageRole = (role) => {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(r);
};

const isSubCoordinator = (user) => {
  const r = String(user?.role || '').toLowerCase();
  return r === 'sub_coordinator';
};

/** Ensure org is a club (affiliation). */
const ensureClub = async (organizationId) => {
  const orgId = asInt(organizationId);
  if (!orgId) return { ok: false, status: 400, message: 'Invalid organization' };
  const [rows] = await pool.execute(
    `SELECT id, name, organization_type FROM agencies WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const org = rows?.[0];
  if (!org) return { ok: false, status: 404, message: 'Organization not found' };
  const orgType = String(org.organization_type || '').toLowerCase();
  if (orgType !== 'affiliation') return { ok: false, status: 400, message: 'Club store is only available for clubs (affiliation organizations)' };
  return { ok: true, org };
};

/** User can browse/buy from club store. */
const canAccessClubStore = async ({ user, organizationId }) => {
  if (String(user?.role || '').toLowerCase() === 'super_admin') return true;
  const ctx = await getUserAgencyContext(user.id);
  if (ctx.allOrgIds.includes(Number(organizationId))) return true;
  const affAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(organizationId);
  return !!affAgencyId && ctx.agencyIds.includes(Number(affAgencyId));
};

/** User can manage products (Program Manager). */
const canManageClubStore = async ({ user, organizationId }) => {
  const orgId = asInt(organizationId);
  if (!orgId) return false;
  const [rows] = await pool.execute(
    `SELECT organization_type FROM agencies WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const orgType = String(rows?.[0]?.organization_type || '').toLowerCase();
  if (orgType === 'agency') return String(user?.role || '').toLowerCase() === 'super_admin';
  return canManageRole(user?.role) || isSubCoordinator(user);
};

// --- Public (participant) endpoints ---

/** GET /api/agencies/:orgId/store/products - List products (active only for participants) */
export const listProducts = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid orgId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const allowed = await canAccessClubStore({ user: req.user, organizationId: orgId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied to this club store' } });
    const activeOnly = req.query.activeOnly !== 'false';
    const products = await ClubStoreProduct.listByOrganization(orgId, { activeOnly });
    const organizationName = clubCheck.org?.name || null;
    return res.json({ organizationId: orgId, organizationName, products });
  } catch (e) {
    next(e);
  }
};

/** GET /api/agencies/:orgId/store/products/:productId - Get single product */
export const getProduct = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    const productId = asInt(req.params.productId);
    if (!orgId || !productId) return res.status(400).json({ error: { message: 'Invalid orgId or productId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const allowed = await canAccessClubStore({ user: req.user, organizationId: orgId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied to this club store' } });
    const product = await ClubStoreProduct.findById(productId);
    if (!product || Number(product.organization_id) !== orgId) return res.status(404).json({ error: { message: 'Product not found' } });
    return res.json(product);
  } catch (e) {
    next(e);
  }
};

/** POST /api/agencies/:orgId/store/orders - Create order (participant checkout) */
export const createOrder = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid orgId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const allowed = await canAccessClubStore({ user: req.user, organizationId: orgId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied to this club store' } });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: { message: 'At least one item is required' } });
    // Resolve product prices
    const resolvedItems = [];
    let totalPoints = 0;
    let totalCents = 0;
    for (const item of items) {
      const productId = asInt(item.productId);
      const qty = asInt(item.quantity) || 1;
      if (!productId || qty < 1) continue;
      const product = await ClubStoreProduct.findById(productId);
      if (!product || Number(product.organization_id) !== orgId || !product.is_active) continue;
      const pp = product.price_points != null ? Number(product.price_points) : null;
      const pc = product.price_cents != null ? Number(product.price_cents) : null;
      resolvedItems.push({ productId, quantity: qty, pricePoints: pp, priceCents: pc });
      if (pp != null) totalPoints += pp * qty;
      if (pc != null) totalCents += pc * qty;
    }
    if (!resolvedItems.length) return res.status(400).json({ error: { message: 'No valid items in cart' } });
    const order = await ClubStoreOrder.create({
      organizationId: orgId,
      userId: req.user.id,
      totalPoints: totalPoints || null,
      totalCents: totalCents || null,
      notes: req.body.notes ? String(req.body.notes).trim() : null,
      items: resolvedItems
    });
    return res.status(201).json(order);
  } catch (e) {
    next(e);
  }
};

/** GET /api/agencies/:orgId/store/orders/my - List my orders */
export const listMyOrders = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid orgId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const allowed = await canAccessClubStore({ user: req.user, organizationId: orgId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied to this club store' } });
    const orders = await ClubStoreOrder.listByUser(req.user.id, orgId);
    return res.json({ organizationId: orgId, orders });
  } catch (e) {
    next(e);
  }
};

// --- Admin (Program Manager) endpoints ---

/** GET /api/agencies/:orgId/store/admin/products - List all products (including inactive) */
export const listAdminProducts = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid orgId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const products = await ClubStoreProduct.listByOrganization(orgId, { activeOnly: false });
    return res.json({ organizationId: orgId, products });
  } catch (e) {
    next(e);
  }
};

/** POST /api/agencies/:orgId/store/admin/products - Create product */
export const createProduct = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid orgId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: { message: 'Product name is required' } });
    const product = await ClubStoreProduct.create({
      organizationId: orgId,
      name,
      description: req.body.description ? String(req.body.description).trim() : null,
      pricePoints: req.body.pricePoints != null ? asInt(req.body.pricePoints) : null,
      priceCents: req.body.priceCents != null ? asInt(req.body.priceCents) : null,
      imagePath: req.body.imagePath ? String(req.body.imagePath).trim() : null,
      isActive: req.body.isActive !== false,
      sortOrder: req.body.sortOrder != null ? asInt(req.body.sortOrder) : 0
    });
    return res.status(201).json(product);
  } catch (e) {
    next(e);
  }
};

/** PUT /api/agencies/:orgId/store/admin/products/:productId - Update product */
export const updateProduct = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    const productId = asInt(req.params.productId);
    if (!orgId || !productId) return res.status(400).json({ error: { message: 'Invalid orgId or productId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const existing = await ClubStoreProduct.findById(productId);
    if (!existing || Number(existing.organization_id) !== orgId) return res.status(404).json({ error: { message: 'Product not found' } });
    const patch = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.description !== undefined) patch.description = req.body.description;
    if (req.body.pricePoints !== undefined) patch.pricePoints = req.body.pricePoints;
    if (req.body.priceCents !== undefined) patch.priceCents = req.body.priceCents;
    if (req.body.imagePath !== undefined) patch.imagePath = req.body.imagePath;
    if (req.body.isActive !== undefined) patch.isActive = req.body.isActive;
    if (req.body.sortOrder !== undefined) patch.sortOrder = req.body.sortOrder;
    const product = await ClubStoreProduct.update(productId, patch);
    return res.json(product);
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/agencies/:orgId/store/admin/products/:productId - Delete product */
export const deleteProduct = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    const productId = asInt(req.params.productId);
    if (!orgId || !productId) return res.status(400).json({ error: { message: 'Invalid orgId or productId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const existing = await ClubStoreProduct.findById(productId);
    if (!existing || Number(existing.organization_id) !== orgId) return res.status(404).json({ error: { message: 'Product not found' } });
    await ClubStoreProduct.delete(productId);
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
};

/** GET /api/agencies/:orgId/store/admin/orders - List orders (Program Manager) */
export const listAdminOrders = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid orgId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.min(asInt(req.query.limit) || 50, 100);
    const offset = asInt(req.query.offset) || 0;
    const orders = await ClubStoreOrder.listByOrganization(orgId, { status, limit, offset });
    return res.json({ organizationId: orgId, orders });
  } catch (e) {
    next(e);
  }
};

/** GET /api/agencies/:orgId/store/admin/orders/:orderId - Get order with items */
export const getAdminOrder = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    const orderId = asInt(req.params.orderId);
    if (!orgId || !orderId) return res.status(400).json({ error: { message: 'Invalid orgId or orderId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const order = await ClubStoreOrder.findById(orderId);
    if (!order || Number(order.organization_id) !== orgId) return res.status(404).json({ error: { message: 'Order not found' } });
    const items = await ClubStoreOrder.listItems(orderId);
    return res.json({ ...order, items });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/agencies/:orgId/store/admin/orders/:orderId/status - Update order status */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const orgId = asInt(req.params.orgId);
    const orderId = asInt(req.params.orderId);
    if (!orgId || !orderId) return res.status(400).json({ error: { message: 'Invalid orgId or orderId' } });
    const clubCheck = await ensureClub(orgId);
    if (!clubCheck.ok) return res.status(clubCheck.status).json({ error: { message: clubCheck.message } });
    const manageAllowed = await canManageClubStore({ user: req.user, organizationId: orgId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const order = await ClubStoreOrder.findById(orderId);
    if (!order || Number(order.organization_id) !== orgId) return res.status(404).json({ error: { message: 'Order not found' } });
    const status = String(req.body.status || '').toLowerCase();
    const valid = ['pending', 'paid', 'fulfilled', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: { message: `status must be one of: ${valid.join(', ')}` } });
    const updated = await ClubStoreOrder.updateStatus(orderId, status);
    return res.json(updated);
  } catch (e) {
    next(e);
  }
};
