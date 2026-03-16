/**
 * ClubStoreProduct model
 * Products in a club's store. Club = organization_type affiliation.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ClubStoreProduct {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM club_store_products WHERE id = ? LIMIT 1`,
      [toInt(id)]
    );
    return rows?.[0] || null;
  }

  static async listByOrganization(organizationId, { activeOnly = true } = {}) {
    const orgId = toInt(organizationId);
    if (!orgId) return [];
    const activeClause = activeOnly ? ' AND is_active = 1' : '';
    const [rows] = await pool.execute(
      `SELECT * FROM club_store_products WHERE organization_id = ?${activeClause}
       ORDER BY sort_order ASC, name ASC, id ASC`,
      [orgId]
    );
    return rows || [];
  }

  static async create({ organizationId, name, description = null, pricePoints = null, priceCents = null, imagePath = null, isActive = true, sortOrder = 0 }) {
    const orgId = toInt(organizationId);
    const productName = String(name || '').trim();
    if (!orgId || !productName) return null;
    const [result] = await pool.execute(
      `INSERT INTO club_store_products (organization_id, name, description, price_points, price_cents, image_path, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        productName,
        description ? String(description).trim() : null,
        pricePoints != null ? toInt(pricePoints) : null,
        priceCents != null ? toInt(priceCents) : null,
        imagePath ? String(imagePath).trim() : null,
        isActive ? 1 : 0,
        toInt(sortOrder) || 0
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch) {
    const productId = toInt(id);
    if (!productId) return null;
    const mapping = {
      name: 'name',
      description: 'description',
      pricePoints: 'price_points',
      priceCents: 'price_cents',
      imagePath: 'image_path',
      isActive: 'is_active',
      sortOrder: 'sort_order'
    };
    const setParts = [];
    const values = [];
    for (const [k, col] of Object.entries(mapping)) {
      if (patch[k] === undefined) continue;
      if (k === 'isActive') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? 1 : 0);
        continue;
      }
      if (k === 'pricePoints' || k === 'priceCents' || k === 'sortOrder') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] != null ? toInt(patch[k]) : null);
        continue;
      }
      setParts.push(`${col} = ?`);
      values.push(patch[k] != null ? String(patch[k]).trim() : null);
    }
    if (!setParts.length) return this.findById(productId);
    values.push(productId);
    await pool.execute(`UPDATE club_store_products SET ${setParts.join(', ')} WHERE id = ?`, values);
    return this.findById(productId);
  }

  static async delete(id) {
    const productId = toInt(id);
    if (!productId) return false;
    const [result] = await pool.execute(`DELETE FROM club_store_products WHERE id = ?`, [productId]);
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default ClubStoreProduct;
