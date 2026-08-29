import pool from '../config/database.js';

export const DEFAULT_LIBRARY_CATEGORIES = [
  { slug: 'guides_resources', name: 'Guides & Resources', sortOrder: 10 },
  { slug: 'templates', name: 'Templates', sortOrder: 20 },
  { slug: 'forms_assessments', name: 'Forms & Assessments', sortOrder: 30 },
  { slug: 'care_documents', name: 'Care Documents', sortOrder: 40 },
  { slug: 'policies_procedures', name: 'Policies & Procedures', sortOrder: 50 },
  { slug: 'community_external', name: 'Community & External Resources', sortOrder: 60 }
];

function parseJson(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    slug: row.slug,
    name: row.name,
    description: row.description || null,
    sortOrder: row.sort_order,
    isDefault: !!row.is_default,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    parentFolderId: row.parent_folder_id,
    name: row.name,
    description: row.description || null,
    ownerUserId: row.owner_user_id,
    scope: row.scope || 'organization',
    isMine: row.is_mine != null ? !!row.is_mine : undefined,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerName: row.owner_name || null,
    shareCount: row.share_count != null ? Number(row.share_count) : undefined
  };
}

function mapTag(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    createdAt: row.created_at
  };
}

function mapResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || null,
    resourceType: row.resource_type,
    fileType: row.file_type || null,
    mimeType: row.mime_type || null,
    originalFilename: row.original_filename || null,
    filePath: row.file_path || null,
    externalUrl: row.external_url || null,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    categoryId: row.category_id,
    folderId: row.folder_id,
    ownerUserId: row.owner_user_id,
    scope: row.scope || 'organization',
    isMine: row.is_mine != null ? !!row.is_mine : undefined,
    visibility: row.visibility,
    audience: parseJson(row.audience_json, []),
    featured: !!row.featured,
    clientShareable: !!row.client_shareable,
    status: row.status,
    reviewDate: row.review_date || null,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
    categoryName: row.category_name || null,
    categorySlug: row.category_slug || null,
    folderName: row.folder_name || null,
    ownerName: row.owner_name || null,
    createdByName: row.created_by_name || null,
    tags: row.tags_json ? parseJson(row.tags_json, []) : row.tags || [],
    isFavorite: row.is_favorite != null ? !!row.is_favorite : undefined
  };
}

class Library {
  static async ensureDefaultCategories(agencyId) {
    const aid = Number(agencyId);
    if (!aid) return [];
    const existing = await this.listCategories(aid, { includeArchived: false });
    if (existing.length) return existing;

    for (const cat of DEFAULT_LIBRARY_CATEGORIES) {
      await pool.execute(
        `INSERT INTO library_categories (agency_id, slug, name, sort_order, is_default)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)`,
        [aid, cat.slug, cat.name, cat.sortOrder]
      );
    }
    return this.listCategories(aid, { includeArchived: false });
  }

  static async listCategories(agencyId, { includeArchived = false } = {}) {
    const params = [Number(agencyId)];
    let sql = `SELECT * FROM library_categories WHERE agency_id = ?`;
    if (!includeArchived) sql += ' AND archived_at IS NULL';
    sql += ' ORDER BY sort_order ASC, name ASC';
    const [rows] = await pool.execute(sql, params);
    return rows.map(mapCategory);
  }

  static async updateCategory(id, agencyId, data) {
    const fields = [];
    const params = [];
    if (data.name != null) {
      fields.push('name = ?');
      params.push(String(data.name).trim());
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      params.push(data.description || null);
    }
    if (data.sortOrder != null) {
      fields.push('sort_order = ?');
      params.push(Number(data.sortOrder));
    }
    if (data.archived === true) {
      fields.push('archived_at = CURRENT_TIMESTAMP');
    }
    if (data.archived === false) {
      fields.push('archived_at = NULL');
    }
    if (!fields.length) return this.findCategory(id, agencyId);
    params.push(Number(id), Number(agencyId));
    await pool.execute(
      `UPDATE library_categories SET ${fields.join(', ')} WHERE id = ? AND agency_id = ?`,
      params
    );
    return this.findCategory(id, agencyId);
  }

  static async findCategory(id, agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM library_categories WHERE id = ? AND agency_id = ? LIMIT 1`,
      [Number(id), Number(agencyId)]
    );
    return mapCategory(rows[0]);
  }

  static async listFolders(agencyId, { parentFolderId = undefined, includeArchived = false, userId = null } = {}) {
    const params = [Number(agencyId)];
    let sql = `
      SELECT f.*,
        TRIM(CONCAT(COALESCE(ou.first_name, ''), ' ', COALESCE(ou.last_name, ''))) AS owner_name,
        (
          SELECT COUNT(*) FROM library_permissions p
          WHERE p.folder_id = f.id AND p.grantee_type = 'user'
        ) AS share_count
      FROM library_folders f
      LEFT JOIN users ou ON ou.id = f.owner_user_id
      WHERE f.agency_id = ?
    `;
    if (!includeArchived) sql += ' AND f.archived_at IS NULL';
    if (parentFolderId === null) {
      sql += ' AND f.parent_folder_id IS NULL';
    } else if (parentFolderId !== undefined) {
      sql += ' AND f.parent_folder_id = ?';
      params.push(Number(parentFolderId));
    }
    if (userId) {
      const uid = Number(userId);
      sql = sql.replace(
        'SELECT f.*,',
        `SELECT f.*, (f.owner_user_id = ${uid}) AS is_mine,`
      );
      sql += ` AND (
        COALESCE(f.scope, 'organization') = 'organization'
        OR f.owner_user_id = ?
        OR EXISTS (
          SELECT 1 FROM library_permissions p
          WHERE p.folder_id = f.id
            AND p.grantee_type = 'user'
            AND p.grantee_value = ?
        )
      )`;
      params.push(uid, String(uid));
    }
    sql += ' ORDER BY COALESCE(f.scope, \'organization\') ASC, f.sort_order ASC, f.name ASC';
    const [rows] = await pool.execute(sql, params);
    return rows.map(mapFolder);
  }

  static async findFolder(id, agencyId, { userId = null } = {}) {
    const params = [];
    let mine = '';
    if (userId) {
      mine = `, (f.owner_user_id = ?) AS is_mine`;
      params.push(Number(userId));
    }
    params.push(Number(id), Number(agencyId));
    const [rows] = await pool.execute(
      `SELECT f.*,
        TRIM(CONCAT(COALESCE(ou.first_name, ''), ' ', COALESCE(ou.last_name, ''))) AS owner_name
        ${mine}
       FROM library_folders f
       LEFT JOIN users ou ON ou.id = f.owner_user_id
       WHERE f.id = ? AND f.agency_id = ?
       LIMIT 1`,
      params
    );
    return mapFolder(rows[0]);
  }

  static async createFolder(data) {
    const scope = data.scope === 'personal' ? 'personal' : 'organization';
    const [result] = await pool.execute(
      `INSERT INTO library_folders
        (agency_id, parent_folder_id, name, description, owner_user_id, scope, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(data.agencyId),
        data.parentFolderId != null ? Number(data.parentFolderId) : null,
        String(data.name || '').trim(),
        data.description || null,
        data.ownerUserId != null ? Number(data.ownerUserId) : null,
        scope,
        data.sortOrder != null ? Number(data.sortOrder) : 0,
        data.createdBy != null ? Number(data.createdBy) : null
      ]
    );
    return this.findFolder(result.insertId, data.agencyId, { userId: data.ownerUserId });
  }

  static async updateFolder(id, agencyId, data) {
    const fields = [];
    const params = [];
    if (data.name != null) {
      fields.push('name = ?');
      params.push(String(data.name).trim());
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      params.push(data.description || null);
    }
    if (data.parentFolderId !== undefined) {
      fields.push('parent_folder_id = ?');
      params.push(data.parentFolderId != null ? Number(data.parentFolderId) : null);
    }
    if (data.archived === true) fields.push('archived_at = CURRENT_TIMESTAMP');
    if (data.archived === false) fields.push('archived_at = NULL');
    if (!fields.length) return this.findFolder(id, agencyId);
    params.push(Number(id), Number(agencyId));
    await pool.execute(
      `UPDATE library_folders SET ${fields.join(', ')} WHERE id = ? AND agency_id = ?`,
      params
    );
    return this.findFolder(id, agencyId);
  }

  static async listTags(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM library_tags WHERE agency_id = ? ORDER BY name ASC`,
      [Number(agencyId)]
    );
    return rows.map(mapTag);
  }

  static async findOrCreateTag(agencyId, name) {
    const n = String(name || '').trim();
    if (!n) return null;
    const [existing] = await pool.execute(
      `SELECT * FROM library_tags WHERE agency_id = ? AND name = ? LIMIT 1`,
      [Number(agencyId), n]
    );
    if (existing[0]) return mapTag(existing[0]);
    const [result] = await pool.execute(
      `INSERT INTO library_tags (agency_id, name) VALUES (?, ?)`,
      [Number(agencyId), n]
    );
    const [rows] = await pool.execute(`SELECT * FROM library_tags WHERE id = ?`, [result.insertId]);
    return mapTag(rows[0]);
  }

  static async setResourceTags(resourceId, agencyId, tagNames = []) {
    const names = [...new Set((tagNames || []).map((t) => String(t || '').trim()).filter(Boolean))];
    const tagIds = [];
    for (const name of names) {
      const tag = await this.findOrCreateTag(agencyId, name);
      if (tag) tagIds.push(tag.id);
    }
    await pool.execute(`DELETE FROM library_resource_tags WHERE resource_id = ?`, [Number(resourceId)]);
    for (const tagId of tagIds) {
      await pool.execute(
        `INSERT INTO library_resource_tags (resource_id, tag_id) VALUES (?, ?)`,
        [Number(resourceId), tagId]
      );
    }
  }

  static async findResource(id, agencyId, { userId = null } = {}) {
    const params = [Number(id), Number(agencyId)];
    let favSelect = '';
    if (userId) {
      favSelect = `, EXISTS(
        SELECT 1 FROM library_favorites fv
        WHERE fv.resource_id = r.id AND fv.user_id = ?
      ) AS is_favorite`;
      params.unshift(Number(userId));
    }
    const sql = `
      SELECT r.*,
        c.name AS category_name,
        c.slug AS category_slug,
        f.name AS folder_name,
        TRIM(CONCAT(COALESCE(ou.first_name, ''), ' ', COALESCE(ou.last_name, ''))) AS owner_name,
        TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))) AS created_by_name,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
          FROM library_resource_tags rt
          JOIN library_tags t ON t.id = rt.tag_id
          WHERE rt.resource_id = r.id
        ) AS tags_json
        ${favSelect}
      FROM library_resources r
      LEFT JOIN library_categories c ON c.id = r.category_id
      LEFT JOIN library_folders f ON f.id = r.folder_id
      LEFT JOIN users ou ON ou.id = r.owner_user_id
      LEFT JOIN users cu ON cu.id = r.created_by
      WHERE r.id = ? AND r.agency_id = ?
      LIMIT 1
    `;
    const [rows] = await pool.execute(sql, params);
    return mapResource(rows[0]);
  }

  static async listResources(agencyId, opts = {}) {
    const {
      q = null,
      categoryId = null,
      folderId = undefined,
      resourceType = null,
      tag = null,
      featured = null,
      includeArchived = false,
      sort = 'updated',
      userId = null,
      favoritesOnly = false,
      limit = 100,
      offset = 0
    } = opts;

    const conditions = ['r.agency_id = ?'];
    const params = [Number(agencyId)];

    if (!includeArchived) conditions.push('r.archived_at IS NULL');
    if (categoryId) {
      conditions.push('r.category_id = ?');
      params.push(Number(categoryId));
    }
    if (folderId === null) {
      conditions.push('r.folder_id IS NULL');
    } else if (folderId !== undefined && folderId !== '' && folderId !== 'all') {
      conditions.push('r.folder_id = ?');
      params.push(Number(folderId));
    }
    if (resourceType) {
      conditions.push('r.resource_type = ?');
      params.push(String(resourceType));
    }
    if (featured === true || featured === '1' || featured === 'true') {
      conditions.push('r.featured = 1');
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      conditions.push(`(
        r.name LIKE ? OR r.description LIKE ? OR r.original_filename LIKE ?
        OR c.name LIKE ? OR EXISTS (
          SELECT 1 FROM library_resource_tags rt2
          JOIN library_tags t2 ON t2.id = rt2.tag_id
          WHERE rt2.resource_id = r.id AND t2.name LIKE ?
        )
      )`);
      params.push(like, like, like, like, like);
    }
    if (tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM library_resource_tags rt3
        JOIN library_tags t3 ON t3.id = rt3.tag_id
        WHERE rt3.resource_id = r.id AND t3.name = ?
      )`);
      params.push(String(tag));
    }
    if (favoritesOnly && userId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM library_favorites fv WHERE fv.resource_id = r.id AND fv.user_id = ?
      )`);
      params.push(Number(userId));
    }

    if (userId) {
      const uid = Number(userId);
      conditions.push(`(
        COALESCE(r.scope, 'organization') = 'organization'
        OR r.owner_user_id = ?
        OR EXISTS (
          SELECT 1 FROM library_permissions p
          WHERE p.resource_id = r.id AND p.grantee_type = 'user' AND p.grantee_value = ?
        )
        OR (
          r.folder_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM library_permissions p
            WHERE p.folder_id = r.folder_id AND p.grantee_type = 'user' AND p.grantee_value = ?
          )
        )
      )`);
      params.push(uid, String(uid), String(uid));
    }

    let orderBy = 'r.updated_at DESC, r.name ASC';
    if (sort === 'name') orderBy = 'r.name ASC';
    else if (sort === 'added') orderBy = 'r.created_at DESC';
    else if (sort === 'updated') orderBy = 'r.updated_at DESC';

    const uidNum = userId ? Number(userId) : null;
    const favSelect = uidNum
      ? `, EXISTS(SELECT 1 FROM library_favorites fv WHERE fv.resource_id = r.id AND fv.user_id = ${uidNum}) AS is_favorite
         , (r.owner_user_id = ${uidNum} AND COALESCE(r.scope, 'organization') = 'personal') AS is_mine`
      : '';

    const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const off = Math.max(Number(offset) || 0, 0);

    const sql = `
      SELECT r.*,
        c.name AS category_name,
        c.slug AS category_slug,
        f.name AS folder_name,
        TRIM(CONCAT(COALESCE(ou.first_name, ''), ' ', COALESCE(ou.last_name, ''))) AS owner_name,
        TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))) AS created_by_name,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
          FROM library_resource_tags rt
          JOIN library_tags t ON t.id = rt.tag_id
          WHERE rt.resource_id = r.id
        ) AS tags_json
        ${favSelect}
      FROM library_resources r
      LEFT JOIN library_categories c ON c.id = r.category_id
      LEFT JOIN library_folders f ON f.id = r.folder_id
      LEFT JOIN users ou ON ou.id = r.owner_user_id
      LEFT JOIN users cu ON cu.id = r.created_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${lim} OFFSET ${off}
    `;

    const [rows] = await pool.execute(sql, params);
    return rows.map(mapResource);
  }

  static async createResource(data) {
    const scope = data.scope === 'personal' ? 'personal' : 'organization';
    const [result] = await pool.execute(
      `INSERT INTO library_resources
        (agency_id, organization_id, name, description, resource_type, file_type, mime_type,
         original_filename, file_path, external_url, file_size_bytes, category_id, folder_id,
         owner_user_id, scope, visibility, audience_json, featured, client_shareable, status,
         review_date, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(data.agencyId),
        data.organizationId != null ? Number(data.organizationId) : null,
        String(data.name || '').trim(),
        data.description || null,
        data.resourceType || 'file',
        data.fileType || null,
        data.mimeType || null,
        data.originalFilename || null,
        data.filePath || null,
        data.externalUrl || null,
        data.fileSizeBytes != null ? Number(data.fileSizeBytes) : null,
        data.categoryId != null ? Number(data.categoryId) : null,
        data.folderId != null ? Number(data.folderId) : null,
        data.ownerUserId != null ? Number(data.ownerUserId) : null,
        scope,
        data.visibility || 'internal',
        data.audience ? JSON.stringify(data.audience) : null,
        data.featured ? 1 : 0,
        data.clientShareable ? 1 : 0,
        data.status || 'current',
        data.reviewDate || null,
        data.createdBy != null ? Number(data.createdBy) : null,
        data.updatedBy != null ? Number(data.updatedBy) : data.createdBy != null ? Number(data.createdBy) : null
      ]
    );
    if (data.tags?.length) {
      await this.setResourceTags(result.insertId, data.agencyId, data.tags);
    }
    return this.findResource(result.insertId, data.agencyId, { userId: data.createdBy });
  }

  static async updateResource(id, agencyId, data) {
    const fields = [];
    const params = [];
    const map = {
      name: 'name',
      description: 'description',
      categoryId: 'category_id',
      folderId: 'folder_id',
      visibility: 'visibility',
      featured: 'featured',
      clientShareable: 'client_shareable',
      status: 'status',
      reviewDate: 'review_date',
      externalUrl: 'external_url',
      filePath: 'file_path',
      fileType: 'file_type',
      mimeType: 'mime_type',
      originalFilename: 'original_filename',
      fileSizeBytes: 'file_size_bytes',
      resourceType: 'resource_type',
      ownerUserId: 'owner_user_id',
      organizationId: 'organization_id',
      updatedBy: 'updated_by'
    };

    for (const [key, col] of Object.entries(map)) {
      if (data[key] === undefined) continue;
      if (key === 'featured' || key === 'clientShareable') {
        fields.push(`${col} = ?`);
        params.push(data[key] ? 1 : 0);
      } else if (['categoryId', 'folderId', 'ownerUserId', 'organizationId', 'updatedBy', 'fileSizeBytes'].includes(key)) {
        fields.push(`${col} = ?`);
        params.push(data[key] != null && data[key] !== '' ? Number(data[key]) : null);
      } else if (key === 'name') {
        fields.push(`${col} = ?`);
        params.push(String(data[key]).trim());
      } else {
        fields.push(`${col} = ?`);
        params.push(data[key] ?? null);
      }
    }

    if (data.audience !== undefined) {
      fields.push('audience_json = ?');
      params.push(data.audience ? JSON.stringify(data.audience) : null);
    }
    if (data.archived === true) {
      fields.push('archived_at = CURRENT_TIMESTAMP');
      fields.push(`status = 'archived'`);
    }
    if (data.archived === false) {
      fields.push('archived_at = NULL');
      if (data.status === undefined) fields.push(`status = 'current'`);
    }

    if (fields.length) {
      params.push(Number(id), Number(agencyId));
      await pool.execute(
        `UPDATE library_resources SET ${fields.join(', ')} WHERE id = ? AND agency_id = ?`,
        params
      );
    }

    if (data.tags !== undefined) {
      await this.setResourceTags(id, agencyId, data.tags || []);
    }

    return this.findResource(id, agencyId, { userId: data.userId || null });
  }

  static async deleteResource(id, agencyId) {
    const resource = await this.findResource(id, agencyId);
    if (!resource) return null;
    await pool.execute(`DELETE FROM library_resources WHERE id = ? AND agency_id = ?`, [
      Number(id),
      Number(agencyId)
    ]);
    return resource;
  }

  static async addFavorite(userId, resourceId) {
    await pool.execute(
      `INSERT IGNORE INTO library_favorites (user_id, resource_id) VALUES (?, ?)`,
      [Number(userId), Number(resourceId)]
    );
  }

  static async removeFavorite(userId, resourceId) {
    await pool.execute(
      `DELETE FROM library_favorites WHERE user_id = ? AND resource_id = ?`,
      [Number(userId), Number(resourceId)]
    );
  }

  static async recordView(userId, resourceId) {
    await pool.execute(
      `INSERT INTO library_views (user_id, resource_id, viewed_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [Number(userId), Number(resourceId)]
    );
    // Keep last 50 views per user
    await pool.execute(
      `DELETE FROM library_views
       WHERE user_id = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM library_views WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 50
         ) keep_ids
       )`,
      [Number(userId), Number(userId)]
    );
  }

  static async recentlyViewed(agencyId, userId, limit = 12) {
    const lim = Math.min(Math.max(Number(limit) || 12, 1), 50);
    const [idRows] = await pool.execute(
      `SELECT v.resource_id, MAX(v.viewed_at) AS last_viewed_at
       FROM library_views v
       JOIN library_resources r ON r.id = v.resource_id
       WHERE v.user_id = ? AND r.agency_id = ? AND r.archived_at IS NULL
       GROUP BY v.resource_id
       ORDER BY last_viewed_at DESC
       LIMIT ${lim}`,
      [Number(userId), Number(agencyId)]
    );
    const out = [];
    for (const row of idRows || []) {
      const resource = await this.findResource(row.resource_id, agencyId, { userId });
      if (resource) out.push(resource);
    }
    return out;
  }

  static async recentlyUpdated(agencyId, limit = 8, userId = null) {
    return this.listResources(agencyId, { sort: 'updated', limit, userId });
  }

  static async listFolderShares(folderId, agencyId) {
    const [rows] = await pool.execute(
      `SELECT p.id, p.grantee_type, p.grantee_value, p.permission, p.created_at,
        u.id AS user_id,
        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
        u.email AS user_email
       FROM library_permissions p
       LEFT JOIN users u ON p.grantee_type = 'user' AND u.id = CAST(p.grantee_value AS UNSIGNED)
       WHERE p.folder_id = ? AND p.agency_id = ?
       ORDER BY p.created_at ASC`,
      [Number(folderId), Number(agencyId)]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      granteeType: r.grantee_type,
      granteeValue: r.grantee_value,
      permission: r.permission,
      userId: r.user_id,
      userName: r.user_name || null,
      userEmail: r.user_email || null,
      createdAt: r.created_at
    }));
  }

  static async setFolderShares(folderId, agencyId, userIds = [], permission = 'view') {
    await pool.execute(
      `DELETE FROM library_permissions WHERE folder_id = ? AND agency_id = ? AND grantee_type = 'user'`,
      [Number(folderId), Number(agencyId)]
    );
    const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((n) => n > 0))];
    for (const uid of ids) {
      await pool.execute(
        `INSERT INTO library_permissions
          (agency_id, folder_id, grantee_type, grantee_value, permission)
         VALUES (?, ?, 'user', ?, ?)`,
        [Number(agencyId), Number(folderId), String(uid), permission === 'edit' ? 'edit' : 'view']
      );
    }
    return this.listFolderShares(folderId, agencyId);
  }

  static async userCanEditResource(resource, userId, caps = {}) {
    if (!resource) return false;
    if (caps.canManageLibrary) return true;
    if (Number(resource.ownerUserId) === Number(userId)) return true;
    return false;
  }
}

export default Library;
