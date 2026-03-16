/**
 * ClubStoreOrder model
 * Orders in a club's store.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ClubStoreOrder {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT o.*, u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email
       FROM club_store_orders o
       INNER JOIN users u ON u.id = o.user_id
       WHERE o.id = ? LIMIT 1`,
      [toInt(id)]
    );
    return rows?.[0] || null;
  }

  static async listByOrganization(organizationId, { status = null, limit = 50, offset = 0 } = {}) {
    const orgId = toInt(organizationId);
    if (!orgId) return [];
    let sql = `SELECT o.*, u.first_name AS user_first_name, u.last_name AS user_last_name
              FROM club_store_orders o
              INNER JOIN users u ON u.id = o.user_id
              WHERE o.organization_id = ?`;
    const params = [orgId];
    if (status) {
      sql += ` AND o.status = ?`;
      params.push(String(status));
    }
    sql += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const [rows] = await pool.execute(sql, params);
    return rows || [];
  }

  static async listByUser(userId, organizationId = null) {
    const uId = toInt(userId);
    if (!uId) return [];
    let sql = `SELECT o.*, a.name AS club_name
               FROM club_store_orders o
               INNER JOIN agencies a ON a.id = o.organization_id
               WHERE o.user_id = ?`;
    const params = [uId];
    if (organizationId) {
      sql += ` AND o.organization_id = ?`;
      params.push(toInt(organizationId));
    }
    sql += ` ORDER BY o.created_at DESC LIMIT 50`;
    const [rows] = await pool.execute(sql, params);
    return rows || [];
  }

  static async create({ organizationId, userId, totalPoints = null, totalCents = null, notes = null, items = [] }) {
    const orgId = toInt(organizationId);
    const uId = toInt(userId);
    if (!orgId || !uId) return null;
    const [result] = await pool.execute(
      `INSERT INTO club_store_orders (organization_id, user_id, status, total_points, total_cents, notes)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [orgId, uId, totalPoints != null ? toInt(totalPoints) : null, totalCents != null ? toInt(totalCents) : null, notes ? String(notes).trim() : null]
    );
    const orderId = result.insertId;
    for (const item of items || []) {
      const productId = toInt(item.productId);
      const qty = toInt(item.quantity) || 1;
      if (!productId || qty < 1) continue;
      await pool.execute(
        `INSERT INTO club_store_order_items (order_id, product_id, quantity, price_points, price_cents)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, productId, qty, item.pricePoints != null ? toInt(item.pricePoints) : null, item.priceCents != null ? toInt(item.priceCents) : null]
      );
    }
    return this.findById(orderId);
  }

  static async updateStatus(id, status) {
    const orderId = toInt(id);
    if (!orderId) return null;
    const valid = ['pending', 'paid', 'fulfilled', 'cancelled'];
    if (!valid.includes(String(status))) return null;
    await pool.execute(`UPDATE club_store_orders SET status = ? WHERE id = ?`, [status, orderId]);
    return this.findById(orderId);
  }

  static async listItems(orderId) {
    const oId = toInt(orderId);
    if (!oId) return [];
    const [rows] = await pool.execute(
      `SELECT i.*, p.name AS product_name, p.description AS product_description
       FROM club_store_order_items i
       INNER JOIN club_store_products p ON p.id = i.product_id
       WHERE i.order_id = ?
       ORDER BY i.id ASC`,
      [oId]
    );
    return rows || [];
  }
}

export default ClubStoreOrder;
