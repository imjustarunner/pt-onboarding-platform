import Agency from '../models/Agency.model.js';
import Notification from '../models/Notification.model.js';
import pool from '../config/database.js';
import { extractReceiptData } from '../services/receiptOcr.service.js';
import StorageService from '../services/storage.service.js';
import { getMultiLegDistanceMeters, metersToMiles } from '../services/googleDistance.service.js';
import { callGeminiText } from '../services/geminiText.service.js';

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Jul 1 - Jun 30 fiscal year. */
function fiscalYearForYear(year) {
  const y = Number(year) || new Date().getFullYear();
  return {
    start: `${y}-07-01`,
    end: `${y + 1}-06-30`
  };
}

/**
 * Check assistant_admin permission for an agency. Admin/super_admin always allowed.
 * Returns true if allowed, false otherwise.
 */
async function checkAssistantAdminPermission(userId, userRole, agencyId, permission) {
  if (userRole === 'admin' || userRole === 'super_admin') return true;
  if (userRole !== 'assistant_admin') return false;
  const [rows] = await pool.execute(
    'SELECT assistant_admin_permissions_json FROM user_agencies WHERE user_id = ? AND agency_id = ? AND has_department_access = 1',
    [userId, agencyId]
  );
  const raw = rows?.[0]?.assistant_admin_permissions_json;
  let perms = {};
  try {
    perms = typeof raw === 'object' && raw ? raw : (typeof raw === 'string' && raw ? JSON.parse(raw) : {});
  } catch {
    perms = {};
  }
  return perms[permission] === true;
}

/**
 * Check Budget Management feature is enabled for an agency.
 * Use this for all budget-related endpoints.
 */
export async function isBudgetManagementEnabled(agencyId) {
  try {
    const agency = await Agency.findById(agencyId);
    const flags = parseFeatureFlags(agency?.feature_flags);
    const val = flags?.budgetManagementEnabled;
    return val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

/**
 * GET /api/budget/status
 * Returns whether Budget Management is enabled for the current agency.
 * Used by frontend to verify feature access.
 */
export async function getBudgetStatus(req, res) {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const enabled = await isBudgetManagementEnabled(agencyId);
    res.json({ enabled });
  } catch (err) {
    console.error('[budget.controller] getBudgetStatus:', err);
    res.status(500).json({ error: { message: 'Failed to get budget status' } });
  }
}

/**
 * GET /api/budget/agencies/:agencyId/fiscal-years
 */
export async function listFiscalYears(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      'SELECT id, agency_id, fiscal_year_start, fiscal_year_end, total_operating_budget, created_at, updated_at FROM agency_fiscal_years WHERE agency_id = ? ORDER BY fiscal_year_start DESC',
      [agencyId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] listFiscalYears:', err);
    res.status(500).json({ error: { message: 'Failed to list fiscal years' } });
  }
}

/**
 * POST /api/budget/agencies/:agencyId/fiscal-years
 */
export async function createFiscalYear(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetAllocation');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { year, totalOperatingBudget } = req.body || {};
    const y = year ? parseInt(String(year), 10) : new Date().getFullYear();
    if (!Number.isFinite(y)) return res.status(400).json({ error: { message: 'Invalid year' } });
    const { start, end } = fiscalYearForYear(y);
    const budget = Number(totalOperatingBudget) || 0;
    const [result] = await pool.execute(
      'INSERT INTO agency_fiscal_years (agency_id, fiscal_year_start, fiscal_year_end, total_operating_budget) VALUES (?, ?, ?, ?)',
      [agencyId, start, end, budget]
    );
    const [rows] = await pool.execute(
      'SELECT id, agency_id, fiscal_year_start, fiscal_year_end, total_operating_budget, created_at, updated_at FROM agency_fiscal_years WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0] || {});
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'Fiscal year already exists' } });
    }
    console.error('[budget.controller] createFiscalYear:', err);
    res.status(500).json({ error: { message: 'Failed to create fiscal year' } });
  }
}

/**
 * PUT /api/budget/agencies/:agencyId/fiscal-years/:id
 */
export async function updateFiscalYear(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetAllocation');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const { totalOperatingBudget } = req.body || {};
    if (totalOperatingBudget !== undefined) {
      const budget = Number(totalOperatingBudget);
      if (!Number.isFinite(budget) || budget < 0) {
        return res.status(400).json({ error: { message: 'Invalid total operating budget' } });
      }
      await pool.execute(
        'UPDATE agency_fiscal_years SET total_operating_budget = ? WHERE id = ? AND agency_id = ?',
        [budget, id, agencyId]
      );
    }
    const [rows] = await pool.execute(
      'SELECT id, agency_id, fiscal_year_start, fiscal_year_end, total_operating_budget, created_at, updated_at FROM agency_fiscal_years WHERE id = ? AND agency_id = ?',
      [id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Fiscal year not found' } });
    res.json(rows[0]);
  } catch (err) {
    console.error('[budget.controller] updateFiscalYear:', err);
    res.status(500).json({ error: { message: 'Failed to update fiscal year' } });
  }
}

/**
 * GET /api/budget/fiscal-years/:fiscalYearId/allocations
 * Returns all agency departments with allocated_amount, spent_amount (approved expenses in fiscal year), and remaining_amount.
 */
export async function listBudgetAllocations(req, res) {
  try {
    const fiscalYearId = parseInt(req.params.fiscalYearId, 10);
    if (!fiscalYearId) return res.status(400).json({ error: { message: 'Invalid fiscalYearId' } });
    const [fyRows] = await pool.execute(
      'SELECT agency_id, fiscal_year_start, fiscal_year_end FROM agency_fiscal_years WHERE id = ?',
      [fiscalYearId]
    );
    const fy = fyRows?.[0];
    const fyStart = fy?.fiscal_year_start;
    const fyEnd = fy?.fiscal_year_end;
    const agencyId = fy?.agency_id;
    if (!fyStart || !fyEnd || !agencyId) return res.status(404).json({ error: { message: 'Fiscal year not found' } });

    const [rows] = await pool.execute(
      `SELECT ad.id AS department_id, ad.name AS department_name, ad.slug AS department_slug,
              COALESCE(dba.allocated_amount, 0) AS allocated_amount,
              COALESCE(spent.spent_amount, 0) AS spent_amount,
              GREATEST(0, (COALESCE(dba.allocated_amount, 0) - COALESCE(spent.spent_amount, 0))) AS remaining_amount,
              dba.id AS allocation_id, dba.fiscal_year_id, dba.created_at, dba.updated_at
       FROM agency_departments ad
       LEFT JOIN department_budget_allocations dba ON dba.department_id = ad.id AND dba.fiscal_year_id = ?
       LEFT JOIN (
         SELECT department_id, SUM(amount) AS spent_amount
         FROM budget_expenses
         WHERE agency_id = ? AND status = 'approved'
           AND expense_date >= ? AND expense_date <= ?
         GROUP BY department_id
       ) spent ON spent.department_id = ad.id
       WHERE ad.agency_id = ?
       ORDER BY ad.display_order ASC, ad.name ASC`,
      [fiscalYearId, agencyId, fyStart, fyEnd, agencyId]
    );
    const items = (rows || []).map((r) => ({
      ...r,
      spent_amount: Number(r.spent_amount) || 0,
      remaining_amount: Number(r.remaining_amount) ?? Math.max(0, (Number(r.allocated_amount) || 0) - (Number(r.spent_amount) || 0))
    }));
    res.json(items);
  } catch (err) {
    console.error('[budget.controller] listBudgetAllocations:', err);
    res.status(500).json({ error: { message: 'Failed to list allocations' } });
  }
}

/**
 * PUT /api/budget/fiscal-years/:fiscalYearId/allocations
 * Body: { allocations: [{ departmentId, allocatedAmount }] }
 */
export async function upsertBudgetAllocations(req, res) {
  try {
    const fiscalYearId = parseInt(req.params.fiscalYearId, 10);
    if (!fiscalYearId) return res.status(400).json({ error: { message: 'Invalid fiscalYearId' } });
    const { allocations } = req.body || {};
    if (!Array.isArray(allocations)) return res.status(400).json({ error: { message: 'allocations array required' } });

    const [fyRows] = await pool.execute(
      'SELECT id, agency_id, total_operating_budget FROM agency_fiscal_years WHERE id = ?',
      [fiscalYearId]
    );
    if (!fyRows.length) return res.status(404).json({ error: { message: 'Fiscal year not found' } });
    const totalBudget = Number(fyRows[0].total_operating_budget) || 0;
    const agencyId = fyRows[0].agency_id;

    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetAllocation');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });

    const sum = allocations.reduce((s, a) => s + (Number(a.allocatedAmount) || 0), 0);
    if (sum > totalBudget) {
      return res.status(400).json({ error: { message: `Total allocations (${sum}) cannot exceed total budget (${totalBudget})` } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const a of allocations) {
        const deptId = parseInt(a.departmentId, 10);
        const amount = Number(a.allocatedAmount) || 0;
        if (!deptId || !Number.isFinite(amount)) continue;
        const [deptRows] = await conn.execute(
          'SELECT id FROM agency_departments WHERE id = ? AND agency_id = ?',
          [deptId, agencyId]
        );
        if (!deptRows.length) continue;
        await conn.execute(
          `INSERT INTO department_budget_allocations (department_id, fiscal_year_id, allocated_amount)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE allocated_amount = VALUES(allocated_amount)`,
          [deptId, fiscalYearId, amount]
        );
      }
      await conn.commit();
    } finally {
      conn.release();
    }

    const [fyRows2] = await pool.execute(
      'SELECT agency_id, fiscal_year_start, fiscal_year_end FROM agency_fiscal_years WHERE id = ?',
      [fiscalYearId]
    );
    const fy2 = fyRows2?.[0];
    const fyStart = fy2?.fiscal_year_start;
    const fyEnd = fy2?.fiscal_year_end;
    const [rows] = await pool.execute(
      `SELECT ad.id AS department_id, ad.name AS department_name, ad.slug AS department_slug,
              COALESCE(dba.allocated_amount, 0) AS allocated_amount,
              COALESCE(spent.spent_amount, 0) AS spent_amount,
              GREATEST(0, (COALESCE(dba.allocated_amount, 0) - COALESCE(spent.spent_amount, 0))) AS remaining_amount,
              dba.id AS allocation_id, dba.fiscal_year_id, dba.created_at, dba.updated_at
       FROM agency_departments ad
       LEFT JOIN department_budget_allocations dba ON dba.department_id = ad.id AND dba.fiscal_year_id = ?
       LEFT JOIN (
         SELECT department_id, SUM(amount) AS spent_amount
         FROM budget_expenses
         WHERE agency_id = ? AND status = 'approved'
           AND expense_date >= ? AND expense_date <= ?
         GROUP BY department_id
       ) spent ON spent.department_id = ad.id
       WHERE ad.agency_id = ?
       ORDER BY ad.display_order ASC, ad.name ASC`,
      [fiscalYearId, agencyId, fyStart, fyEnd, agencyId]
    );
    const items = (rows || []).map((r) => ({
      ...r,
      spent_amount: Number(r.spent_amount) || 0,
      remaining_amount: Number(r.remaining_amount) ?? Math.max(0, (Number(r.allocated_amount) || 0) - (Number(r.spent_amount) || 0))
    }));
    res.json(items);
  } catch (err) {
    console.error('[budget.controller] upsertBudgetAllocations:', err);
    res.status(500).json({ error: { message: 'Failed to update allocations' } });
  }
}

function slugify(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- Expense categories ---
export async function listExpenseCategories(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, display_order, is_active, created_at, updated_at FROM agency_expense_categories WHERE agency_id = ? ORDER BY display_order ASC, name ASC',
      [agencyId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] listExpenseCategories:', err);
    res.status(500).json({ error: { message: 'Failed to list categories' } });
  }
}

export async function createExpenseCategory(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { name, displayOrder = 0 } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: { message: 'Name is required' } });
    const slug = slugify(name) || 'other';
    const [result] = await pool.execute(
      'INSERT INTO agency_expense_categories (agency_id, name, slug, display_order, is_active) VALUES (?, ?, ?, ?, 1)',
      [agencyId, String(name).trim(), slug, Number(displayOrder) || 0]
    );
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, display_order, is_active, created_at, updated_at FROM agency_expense_categories WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0] || {});
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { message: 'Category already exists' } });
    console.error('[budget.controller] createExpenseCategory:', err);
    res.status(500).json({ error: { message: 'Failed to create category' } });
  }
}

export async function updateExpenseCategory(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { name, displayOrder, isActive } = req.body || {};
    const updates = [];
    const values = [];
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: { message: 'Name cannot be empty' } });
      updates.push('name = ?', 'slug = ?');
      values.push(trimmed, slugify(name) || 'other');
    }
    if (displayOrder !== undefined) {
      updates.push('display_order = ?');
      values.push(Number(displayOrder) || 0);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (updates.length) {
      values.push(id, agencyId);
      await pool.execute(`UPDATE agency_expense_categories SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`, values);
    }
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, display_order, is_active, created_at, updated_at FROM agency_expense_categories WHERE id = ? AND agency_id = ?',
      [id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { message: 'Category already exists' } });
    console.error('[budget.controller] updateExpenseCategory:', err);
    res.status(500).json({ error: { message: 'Failed to update' } });
  }
}

export async function deleteExpenseCategory(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const [result] = await pool.execute('DELETE FROM agency_expense_categories WHERE id = ? AND agency_id = ?', [id, agencyId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: { message: 'Not found' } });
    res.status(204).send();
  } catch (err) {
    console.error('[budget.controller] deleteExpenseCategory:', err);
    res.status(500).json({ error: { message: 'Failed to delete' } });
  }
}

// --- Department accounts ---
export async function listDepartmentAccounts(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId, 10);
    if (!departmentId) return res.status(400).json({ error: { message: 'Invalid departmentId' } });
    const [deptRows] = await pool.execute('SELECT agency_id FROM agency_departments WHERE id = ?', [departmentId]);
    if (!deptRows.length) return res.status(404).json({ error: { message: 'Department not found' } });
    const enabled = await isBudgetManagementEnabled(deptRows[0].agency_id);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      'SELECT id, department_id, account_number, label, is_active, created_at, updated_at FROM department_accounts WHERE department_id = ? ORDER BY account_number ASC',
      [departmentId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] listDepartmentAccounts:', err);
    res.status(500).json({ error: { message: 'Failed to list accounts' } });
  }
}

export async function createDepartmentAccount(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId, 10);
    if (!departmentId) return res.status(400).json({ error: { message: 'Invalid departmentId' } });
    const [deptRows] = await pool.execute('SELECT agency_id FROM agency_departments WHERE id = ?', [departmentId]);
    if (!deptRows.length) return res.status(404).json({ error: { message: 'Department not found' } });
    const agencyId = deptRows[0].agency_id;
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { accountNumber, label } = req.body || {};
    if (!accountNumber || !String(accountNumber).trim()) return res.status(400).json({ error: { message: 'Account number is required' } });
    if (!label || !String(label).trim()) return res.status(400).json({ error: { message: 'Label is required' } });
    const [result] = await pool.execute(
      'INSERT INTO department_accounts (department_id, account_number, label, is_active) VALUES (?, ?, ?, 1)',
      [departmentId, String(accountNumber).trim(), String(label).trim()]
    );
    const [rows] = await pool.execute(
      'SELECT id, department_id, account_number, label, is_active, created_at, updated_at FROM department_accounts WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0] || {});
  } catch (err) {
    console.error('[budget.controller] createDepartmentAccount:', err);
    res.status(500).json({ error: { message: 'Failed to create' } });
  }
}

export async function updateDepartmentAccount(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId, 10);
    const id = parseInt(req.params.id, 10);
    if (!departmentId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const [deptRows] = await pool.execute('SELECT agency_id FROM agency_departments WHERE id = ?', [departmentId]);
    if (!deptRows.length) return res.status(404).json({ error: { message: 'Department not found' } });
    const agencyId = deptRows[0].agency_id;
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { accountNumber, label, isActive } = req.body || {};
    const updates = [];
    const values = [];
    if (accountNumber !== undefined) {
      const v = String(accountNumber).trim();
      if (!v) return res.status(400).json({ error: { message: 'Account number cannot be empty' } });
      updates.push('account_number = ?');
      values.push(v);
    }
    if (label !== undefined) {
      const v = String(label).trim();
      if (!v) return res.status(400).json({ error: { message: 'Label cannot be empty' } });
      updates.push('label = ?');
      values.push(v);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (updates.length) {
      values.push(id, departmentId);
      await pool.execute(`UPDATE department_accounts SET ${updates.join(', ')} WHERE id = ? AND department_id = ?`, values);
    }
    const [rows] = await pool.execute(
      'SELECT id, department_id, account_number, label, is_active, created_at, updated_at FROM department_accounts WHERE id = ? AND department_id = ?',
      [id, departmentId]
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(rows[0]);
  } catch (err) {
    console.error('[budget.controller] updateDepartmentAccount:', err);
    res.status(500).json({ error: { message: 'Failed to update' } });
  }
}

export async function deleteDepartmentAccount(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId, 10);
    const id = parseInt(req.params.id, 10);
    if (!departmentId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const [deptRows] = await pool.execute('SELECT agency_id FROM agency_departments WHERE id = ?', [departmentId]);
    if (!deptRows.length) return res.status(404).json({ error: { message: 'Department not found' } });
    const agencyId = deptRows[0].agency_id;
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const [result] = await pool.execute('DELETE FROM department_accounts WHERE id = ? AND department_id = ?', [id, departmentId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: { message: 'Not found' } });
    res.status(204).send();
  } catch (err) {
    console.error('[budget.controller] deleteDepartmentAccount:', err);
    res.status(500).json({ error: { message: 'Failed to delete' } });
  }
}

// --- Budget events ---
export async function listBudgetEvents(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, description, settings_json, is_active, created_at, updated_at FROM budget_events WHERE agency_id = ? ORDER BY name ASC',
      [agencyId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] listBudgetEvents:', err);
    res.status(500).json({ error: { message: 'Failed to list events' } });
  }
}

export async function createBudgetEvent(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: { message: 'Name is required' } });
    const slug = slugify(name) || 'event';
    const [result] = await pool.execute(
      'INSERT INTO budget_events (agency_id, name, slug, description, is_active) VALUES (?, ?, ?, ?, 1)',
      [agencyId, String(name).trim(), slug, description ? String(description).trim() : null]
    );
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, description, settings_json, is_active, created_at, updated_at FROM budget_events WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0] || {});
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { message: 'Event already exists' } });
    console.error('[budget.controller] createBudgetEvent:', err);
    res.status(500).json({ error: { message: 'Failed to create' } });
  }
}

export async function updateBudgetEvent(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { name, description, isActive, settings } = req.body || {};
    const updates = [];
    const values = [];
    if (name !== undefined) {
      const v = String(name).trim();
      if (!v) return res.status(400).json({ error: { message: 'Name cannot be empty' } });
      updates.push('name = ?', 'slug = ?');
      values.push(v, slugify(name) || 'event');
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description ? String(description).trim() : null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (settings !== undefined) {
      updates.push('settings_json = ?');
      values.push(settings ? JSON.stringify(settings) : null);
    }
    if (updates.length) {
      values.push(id, agencyId);
      await pool.execute(`UPDATE budget_events SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`, values);
    }
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, description, settings_json, is_active, created_at, updated_at FROM budget_events WHERE id = ? AND agency_id = ?',
      [id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { message: 'Event already exists' } });
    console.error('[budget.controller] updateBudgetEvent:', err);
    res.status(500).json({ error: { message: 'Failed to update' } });
  }
}

export async function getBudgetEventBySlug(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const eventSlug = String(req.params.eventSlug || '').trim();
    if (!agencyId || !eventSlug) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, description, settings_json, is_active, created_at, updated_at FROM budget_events WHERE agency_id = ? AND slug = ? AND is_active = 1',
      [agencyId, eventSlug]
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Event not found' } });
    const event = rows[0];
    const settings = typeof event.settings_json === 'string' ? (() => { try { return JSON.parse(event.settings_json); } catch { return {}; } })() : (event.settings_json || {});
    res.json({ ...event, settings, portalEnabled: !!settings.portalEnabled });
  } catch (err) {
    console.error('[budget.controller] getBudgetEventBySlug:', err);
    res.status(500).json({ error: { message: 'Failed to get event' } });
  }
}

export async function listBudgetEventExpenses(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const eventId = parseInt(req.params.eventId, 10);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid params' } });
    const [eventRows] = await pool.execute('SELECT agency_id FROM budget_events WHERE id = ? AND agency_id = ?', [eventId, agencyId]);
    if (!eventRows.length) return res.status(404).json({ error: { message: 'Event not found' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      `SELECT be.id, be.amount, be.expense_date, be.vendor, be.place, be.status,
              ad.name AS department_name, aec.name AS category_name, abp.name AS business_purpose_name
       FROM budget_expenses be
       JOIN agency_departments ad ON ad.id = be.department_id
       JOIN agency_expense_categories aec ON aec.id = be.expense_category_id
       LEFT JOIN agency_business_purposes abp ON abp.id = be.business_purpose_id
       WHERE be.agency_id = ? AND be.business_purpose_id IN (SELECT id FROM agency_business_purposes WHERE event_id = ?)
       ORDER BY be.expense_date DESC
       LIMIT 200`,
      [agencyId, eventId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] listBudgetEventExpenses:', err);
    res.status(500).json({ error: { message: 'Failed to list' } });
  }
}

export async function deleteBudgetEvent(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const [result] = await pool.execute('DELETE FROM budget_events WHERE id = ? AND agency_id = ?', [id, agencyId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: { message: 'Not found' } });
    res.status(204).send();
  } catch (err) {
    console.error('[budget.controller] deleteBudgetEvent:', err);
    res.status(500).json({ error: { message: 'Failed to delete' } });
  }
}

// --- Business purposes ---
export async function listBusinessPurposes(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const [rows] = await pool.execute(
      `SELECT abp.id, abp.agency_id, abp.name, abp.event_id, abp.is_active, abp.created_at, abp.updated_at,
              be.name AS event_name, be.slug AS event_slug
       FROM agency_business_purposes abp
       LEFT JOIN budget_events be ON be.id = abp.event_id
       WHERE abp.agency_id = ?
       ORDER BY abp.name ASC`,
      [agencyId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] listBusinessPurposes:', err);
    res.status(500).json({ error: { message: 'Failed to list' } });
  }
}

export async function createBusinessPurpose(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { name, eventId } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: { message: 'Name is required' } });
    const eventIdNum = eventId ? parseInt(eventId, 10) : null;
    const [result] = await pool.execute(
      'INSERT INTO agency_business_purposes (agency_id, name, event_id, is_active) VALUES (?, ?, ?, 1)',
      [agencyId, String(name).trim(), eventIdNum]
    );
    const [rows] = await pool.execute(
      `SELECT abp.id, abp.agency_id, abp.name, abp.event_id, abp.is_active, abp.created_at, abp.updated_at,
              be.name AS event_name, be.slug AS event_slug
       FROM agency_business_purposes abp
       LEFT JOIN budget_events be ON be.id = abp.event_id
       WHERE abp.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0] || {});
  } catch (err) {
    console.error('[budget.controller] createBusinessPurpose:', err);
    res.status(500).json({ error: { message: 'Failed to create' } });
  }
}

export async function updateBusinessPurpose(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const { name, eventId, isActive } = req.body || {};
    const updates = [];
    const values = [];
    if (name !== undefined) {
      const v = String(name).trim();
      if (!v) return res.status(400).json({ error: { message: 'Name cannot be empty' } });
      updates.push('name = ?');
      values.push(v);
    }
    if (eventId !== undefined) {
      updates.push('event_id = ?');
      values.push(eventId ? parseInt(eventId, 10) : null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (updates.length) {
      values.push(id, agencyId);
      await pool.execute(`UPDATE agency_business_purposes SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`, values);
    }
    const [rows] = await pool.execute(
      `SELECT abp.id, abp.agency_id, abp.name, abp.event_id, abp.is_active, abp.created_at, abp.updated_at,
              be.name AS event_name, be.slug AS event_slug
       FROM agency_business_purposes abp
       LEFT JOIN budget_events be ON be.id = abp.event_id
       WHERE abp.id = ? AND abp.agency_id = ?`,
      [id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(rows[0]);
  } catch (err) {
    console.error('[budget.controller] updateBusinessPurpose:', err);
    res.status(500).json({ error: { message: 'Failed to update' } });
  }
}

export async function deleteBusinessPurpose(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canManageBudgetSettings');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });
    const [result] = await pool.execute('DELETE FROM agency_business_purposes WHERE id = ? AND agency_id = ?', [id, agencyId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: { message: 'Not found' } });
    res.status(204).send();
  } catch (err) {
    console.error('[budget.controller] deleteBusinessPurpose:', err);
    res.status(500).json({ error: { message: 'Failed to delete' } });
  }
}

// --- Mileage calculate ---
export async function calculateMileage(req, res) {
  try {
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const origin = String(req.query.origin || '').trim();
    const destinationsRaw = req.query.destinations;
    const dests = Array.isArray(destinationsRaw)
      ? destinationsRaw.map((d) => String(d || '').trim()).filter(Boolean)
      : (typeof destinationsRaw === 'string' ? destinationsRaw.split(',').map((s) => s.trim()).filter(Boolean) : []);
    const roundTrip = /^(true|1|yes)$/i.test(String(req.query.roundTrip || ''));

    if (!origin) return res.status(400).json({ error: { message: 'origin is required' } });
    const legs = [origin, ...dests];
    if (legs.length < 2) return res.status(400).json({ error: { message: 'At least one destination required' } });

    let totalMeters = await getMultiLegDistanceMeters(legs);
    if (roundTrip) totalMeters *= 2;
    const miles = Math.round(metersToMiles(totalMeters) * 100) / 100;

    const [rateRows] = await pool.execute(
      'SELECT rate_per_mile FROM agency_mileage_rates WHERE agency_id = ? AND tier_level = 1 LIMIT 1',
      [agencyId]
    );
    const ratePerMile = rateRows.length ? Number(rateRows[0].rate_per_mile) || 0 : 0;
    const amount = Math.round(miles * ratePerMile * 100) / 100;

    const legsForAudit = roundTrip ? [...legs, ...legs.slice(1).reverse(), legs[0]] : legs;
    res.json({
      miles,
      amount,
      ratePerMile,
      legs: legsForAudit,
      roundTrip
    });
  } catch (err) {
    if (err.code === 'MAPS_KEY_MISSING' || err.code === 'MAPS_DISTANCE_FAILED') {
      return res.status(400).json({ error: { message: err.message || 'Distance lookup failed' } });
    }
    console.error('[budget.controller] calculateMileage:', err);
    res.status(500).json({ error: { message: 'Failed to calculate mileage' } });
  }
}

// --- Receipt OCR ---
export async function extractReceiptOcr(req, res) {
  try {
    const agencyId = parseInt(req.query.agencyId || req.body?.agencyId || '', 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const file = req.file;
    if (!file || !file.buffer) return res.status(400).json({ error: { message: 'No receipt file uploaded' } });
    const mimeType = file.mimetype || 'image/jpeg';
    const data = await extractReceiptData(file.buffer, mimeType);
    res.json(data);
  } catch (err) {
    console.error('[budget.controller] extractReceiptOcr:', err);
    res.status(500).json({ error: { message: 'Failed to extract receipt data' } });
  }
}

// --- Create budget expenses ---
export async function createBudgetExpenses(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const { expenses } = req.body || {};
    if (!Array.isArray(expenses) || !expenses.length) {
      return res.status(400).json({ error: { message: 'expenses array is required' } });
    }

    const created = [];
    for (const e of expenses) {
      const departmentId = parseInt(e.departmentId, 10);
      const accountId = parseInt(e.accountId, 10);
      const expenseCategoryId = parseInt(e.expenseCategoryId, 10);
      const businessPurposeId = e.businessPurposeId ? parseInt(e.businessPurposeId, 10) : null;
      const place = String(e.place || '').trim();
      let amount = Number(e.amount);
      const expenseDate = e.expenseDate || new Date().toISOString().slice(0, 10);
      const vendor = e.vendor ? String(e.vendor).trim() : null;
      const notes = e.notes ? String(e.notes).trim() : null;
      const receiptFile = e.receiptFile;
      const mileageLegs = Array.isArray(e.mileageLegs) ? e.mileageLegs : null;
      const mileageMiles = e.mileageMiles != null ? Number(e.mileageMiles) : null;
      const mileageRate = e.mileageRate != null ? Number(e.mileageRate) : null;

      if (!departmentId || !accountId || !expenseCategoryId || !place) {
        return res.status(400).json({ error: { message: 'departmentId, accountId, expenseCategoryId, and place are required' } });
      }
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: { message: 'amount must be a non-negative number' } });
      }
      const [deptRows] = await pool.execute('SELECT id FROM agency_departments WHERE id = ? AND agency_id = ?', [departmentId, agencyId]);
      if (!deptRows.length) return res.status(400).json({ error: { message: 'Invalid department' } });
      const [accRows] = await pool.execute('SELECT id FROM department_accounts da JOIN agency_departments ad ON ad.id = da.department_id WHERE da.id = ? AND ad.agency_id = ?', [accountId, agencyId]);
      if (!accRows.length) return res.status(400).json({ error: { message: 'Invalid account' } });
      const [catRows] = await pool.execute('SELECT id FROM agency_expense_categories WHERE id = ? AND agency_id = ?', [expenseCategoryId, agencyId]);
      if (!catRows.length) return res.status(400).json({ error: { message: 'Invalid expense category' } });
      if (businessPurposeId) {
        const [bpRows] = await pool.execute('SELECT id FROM agency_business_purposes WHERE id = ? AND agency_id = ?', [businessPurposeId, agencyId]);
        if (!bpRows.length) return res.status(400).json({ error: { message: 'Invalid business purpose' } });
      }

      let receiptPath = null;
      let receiptOriginalName = null;
      let receiptMimeType = null;
      let receiptSizeBytes = null;
      if (receiptFile?.base64 && receiptFile?.filename) {
        const buf = Buffer.from(receiptFile.base64, 'base64');
        const mime = receiptFile.mimeType || 'application/octet-stream';
        const storageResult = await StorageService.saveBudgetExpenseReceipt(buf, receiptFile.filename, mime);
        receiptPath = storageResult.path;
        receiptOriginalName = receiptFile.filename;
        receiptMimeType = mime;
        receiptSizeBytes = buf.length;
      }

      const mileageLegsJson = mileageLegs?.length ? JSON.stringify(mileageLegs) : null;
      const [result] = await pool.execute(
        `INSERT INTO budget_expenses (
          agency_id, user_id, department_id, account_id, expense_category_id, business_purpose_id,
          place, amount, expense_date, vendor, notes, status,
          receipt_file_path, receipt_original_name, receipt_mime_type, receipt_size_bytes,
          mileage_legs_json, mileage_miles, mileage_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?)`,
        [
          agencyId, userId, departmentId, accountId, expenseCategoryId, businessPurposeId,
          place, amount, expenseDate, vendor, notes,
          receiptPath, receiptOriginalName, receiptMimeType, receiptSizeBytes,
          mileageLegsJson, mileageMiles, mileageRate
        ]
      );
      const [rows] = await pool.execute(
        'SELECT id, agency_id, user_id, department_id, account_id, expense_category_id, business_purpose_id, place, amount, expense_date, vendor, notes, status, receipt_file_path, created_at FROM budget_expenses WHERE id = ?',
        [result.insertId]
      );
      const expenseRow = rows[0] || { id: result.insertId };
      created.push(expenseRow);

      // Notify department approvers (and admin/super_admin for agency)
      try {
        let approverIds = [];
        try {
          const [deptApproverRows] = await pool.execute(
            `SELECT user_id FROM user_department_assignments
             WHERE department_id = ? AND agency_id = ? AND (is_approver = 1 OR is_approver = true)`,
            [departmentId, agencyId]
          );
          approverIds = (deptApproverRows || []).map((r) => r.user_id).filter(Boolean);
        } catch (e) {
          if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
        const [adminRows] = await pool.execute(
          `SELECT u.id FROM users u
           JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
           WHERE LOWER(u.role) IN ('admin', 'super_admin') AND u.id != ?`,
          [agencyId, userId]
        );
        approverIds = [...new Set([...approverIds, ...(adminRows || []).map((r) => r.id).filter(Boolean)])];
        const approverIds = [...new Set((approverRows || []).map((r) => r.user_id).filter(Boolean))];
        const [submitterRows] = await pool.execute(
          'SELECT first_name, last_name FROM users WHERE id = ?',
          [userId]
        );
        const sub = submitterRows?.[0] || {};
        const submitterName = [sub.first_name, sub.last_name].filter(Boolean).join(' ').trim() || 'A user';
        const [deptRows] = await pool.execute('SELECT name FROM agency_departments WHERE id = ?', [departmentId]);
        const deptName = deptRows?.[0]?.name || 'Department';
        const amountStr = Number(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        for (const approverId of approverIds) {
          await Notification.create({
            type: 'budget_expense_pending_approval',
            severity: 'warning',
            title: 'Budget expense pending approval',
            message: `${submitterName} submitted ${amountStr} for ${place} (${deptName}).`,
            userId: approverId,
            agencyId,
            relatedEntityType: 'budget_expense',
            relatedEntityId: expenseRow.id,
            actorUserId: userId,
            actorSource: 'Budget Management'
          });
        }
      } catch (notifErr) {
        console.warn('[budget.controller] createBudgetExpenses: Failed to create approval notifications:', notifErr);
      }
    }
    res.status(201).json({ created });
  } catch (err) {
    console.error('[budget.controller] createBudgetExpenses:', err);
    res.status(500).json({ error: { message: 'Failed to create expenses' } });
  }
}

/**
 * PUT /api/budget/agencies/:agencyId/expenses/:id
 * Approve or reject a submitted expense. Requires canApproveExpenses or admin/super_admin.
 */
export async function updateBudgetExpenseStatus(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid params' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });

    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canApproveExpenses');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });

    const { status, rejectionNote } = req.body || {};
    const newStatus = String(status || '').trim().toLowerCase();
    if (newStatus !== 'approved' && newStatus !== 'rejected') {
      return res.status(400).json({ error: { message: 'status must be "approved" or "rejected"' } });
    }

    const [expRows] = await pool.execute(
      'SELECT id, agency_id, department_id, status FROM budget_expenses WHERE id = ? AND agency_id = ?',
      [id, agencyId]
    );
    if (!expRows.length) return res.status(404).json({ error: { message: 'Expense not found' } });
    const exp = expRows[0];
    if (exp.status !== 'submitted') {
      return res.status(400).json({ error: { message: 'Expense is not pending approval' } });
    }

    // For assistant_admin: verify they are approver for this department
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'assistant_admin') {
      const [approverRows] = await pool.execute(
        `SELECT 1 FROM user_department_assignments
         WHERE user_id = ? AND agency_id = ? AND department_id = ? AND (is_approver = 1 OR is_approver = true)`,
        [req.user.id, agencyId, exp.department_id]
      );
      if (!approverRows.length) {
        return res.status(403).json({ error: { message: 'You are not an approver for this department' } });
      }
    }

    const actorId = req.user?.id;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    try {
      if (newStatus === 'approved') {
        await pool.execute(
          'UPDATE budget_expenses SET status = ?, approved_by_user_id = ?, approved_at = ?, rejected_by_user_id = NULL, rejected_at = NULL, rejection_note = NULL WHERE id = ?',
          ['approved', actorId, now, id]
        );
      } else {
        await pool.execute(
          'UPDATE budget_expenses SET status = ?, rejected_by_user_id = ?, rejected_at = ?, rejection_note = ? WHERE id = ?',
          ['rejected', actorId, now, rejectionNote ? String(rejectionNote).trim().slice(0, 1000) : null, id]
        );
      }
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        await pool.execute('UPDATE budget_expenses SET status = ? WHERE id = ?', [newStatus, id]);
      } else throw e;
    }

    try {
      await Notification.markAsResolvedByRelatedEntity(agencyId, 'budget_expense', id);
    } catch {
      // non-blocking
    }

    const [updated] = await pool.execute(
      'SELECT id, agency_id, user_id, department_id, status, approved_by_user_id, approved_at, rejected_by_user_id, rejected_at, rejection_note FROM budget_expenses WHERE id = ?',
      [id]
    );
    res.json(updated[0] || {});
  } catch (err) {
    console.error('[budget.controller] updateBudgetExpenseStatus:', err);
    res.status(500).json({ error: { message: 'Failed to update expense status' } });
  }
}

// --- My departments (for department-scoped users) ---
export async function getMyDepartments(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'super_admin' || role === 'admin') {
      const [rows] = await pool.execute(
        'SELECT id, name, slug, display_order FROM agency_departments WHERE agency_id = ? AND is_active = 1 ORDER BY display_order, name',
        [agencyId]
      );
      return res.json(rows || []);
    }
    const [assignRows] = await pool.execute(
      'SELECT department_id FROM user_department_assignments WHERE user_id = ? AND agency_id = ?',
      [userId, agencyId]
    );
    const deptIds = (assignRows || []).map((r) => r.department_id).filter(Boolean);
    if (!deptIds.length) return res.json([]);
    const placeholders = deptIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, name, slug, display_order FROM agency_departments WHERE id IN (${placeholders}) AND is_active = 1 ORDER BY display_order, name`,
      deptIds
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[budget.controller] getMyDepartments:', err);
    res.status(500).json({ error: { message: 'Failed to get departments' } });
  }
}

// --- Expense report (breakdowns by category, event, business purpose) ---
export async function getBudgetExpenseReport(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canViewReports');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });

    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId, 10) : null;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : null;
    const statusParam = req.query.status ? String(req.query.status).trim().toLowerCase() : 'approved';
    const status = statusParam === 'all' ? null : (statusParam || 'approved');

    let sql = `
      SELECT be.amount, ad.name AS department_name, aec.name AS category_name,
             abp.name AS business_purpose_name, bev.name AS event_name
      FROM budget_expenses be
      JOIN agency_departments ad ON ad.id = be.department_id
      JOIN agency_expense_categories aec ON aec.id = be.expense_category_id
      LEFT JOIN agency_business_purposes abp ON abp.id = be.business_purpose_id
      LEFT JOIN budget_events bev ON bev.id = abp.event_id
      WHERE be.agency_id = ?
    `;
    const params = [agencyId];
    if (departmentId) { sql += ' AND be.department_id = ?'; params.push(departmentId); }
    if (categoryId) { sql += ' AND be.expense_category_id = ?'; params.push(categoryId); }
    if (dateFrom) { sql += ' AND be.expense_date >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND be.expense_date <= ?'; params.push(dateTo); }
    if (status) { sql += ' AND be.status = ?'; params.push(status); }

    const [rows] = await pool.execute(sql, params);
    const byCategory = {};
    const byDepartment = {};
    const byBusinessPurpose = {};
    const byEvent = {};
    let total = 0;
    for (const r of rows || []) {
      const amt = Number(r.amount) || 0;
      total += amt;
      const cat = r.category_name || 'Uncategorized';
      const dept = r.department_name || 'Unknown';
      const bp = r.business_purpose_name || 'No business purpose';
      const evt = r.event_name || 'No event';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
      byDepartment[dept] = (byDepartment[dept] || 0) + amt;
      byBusinessPurpose[bp] = (byBusinessPurpose[bp] || 0) + amt;
      byEvent[evt] = (byEvent[evt] || 0) + amt;
    }
    res.json({
      total,
      count: rows?.length || 0,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
      byDepartment: Object.entries(byDepartment).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
      byBusinessPurpose: Object.entries(byBusinessPurpose).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
      byEvent: Object.entries(byEvent).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }))
    });
  } catch (err) {
    console.error('[budget.controller] getBudgetExpenseReport:', err);
    res.status(500).json({ error: { message: 'Failed to load report' } });
  }
}

// --- List and export budget expenses ---
export async function listBudgetExpenses(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });

    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId, 10) : null;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : null;
    const businessPurposeId = req.query.businessPurposeId ? parseInt(req.query.businessPurposeId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : null;
    const place = req.query.place ? String(req.query.place).trim() : null;
    const status = req.query.status ? String(req.query.status).trim() : null;
    const q = req.query.q ? String(req.query.q).trim() : '';
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let sql = `
      SELECT be.id, be.agency_id, be.user_id, be.department_id, be.account_id, be.expense_category_id, be.business_purpose_id,
             be.place, be.amount, be.expense_date, be.vendor, be.notes, be.status, be.receipt_file_path, be.mileage_legs_json, be.mileage_miles, be.created_at,
             ad.name AS department_name, da.account_number, da.label AS account_label,
             aec.name AS category_name, abp.name AS business_purpose_name,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM budget_expenses be
      JOIN agency_departments ad ON ad.id = be.department_id
      JOIN department_accounts da ON da.id = be.account_id
      JOIN agency_expense_categories aec ON aec.id = be.expense_category_id
      LEFT JOIN agency_business_purposes abp ON abp.id = be.business_purpose_id
      LEFT JOIN users u ON u.id = be.user_id
      WHERE be.agency_id = ?
    `;
    const params = [agencyId];
    if (departmentId) { sql += ' AND be.department_id = ?'; params.push(departmentId); }
    if (categoryId) { sql += ' AND be.expense_category_id = ?'; params.push(categoryId); }
    if (businessPurposeId) { sql += ' AND be.business_purpose_id = ?'; params.push(businessPurposeId); }
    if (userId) { sql += ' AND be.user_id = ?'; params.push(userId); }
    if (dateFrom) { sql += ' AND be.expense_date >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND be.expense_date <= ?'; params.push(dateTo); }
    if (place) { sql += ' AND be.place LIKE ?'; params.push(`%${place}%`); }
    if (status) { sql += ' AND be.status = ?'; params.push(status); }
    sql += ' ORDER BY be.expense_date DESC, be.id DESC LIMIT 2000';

    const [rows] = await pool.execute(sql, params);
    let items = rows || [];
    if (q) {
      const lower = q.toLowerCase();
      items = items.filter((r) =>
        [r.vendor, r.place, r.notes, r.business_purpose_name, r.account_label].some((v) =>
          String(v || '').toLowerCase().includes(lower)
        )
      );
    }
    const total = items.length;
    const paged = items.slice(offset, offset + limit);
    res.json({ total, items: paged });
  } catch (err) {
    console.error('[budget.controller] listBudgetExpenses:', err);
    res.status(500).json({ error: { message: 'Failed to list expenses' } });
  }
}

export async function exportBudgetExpensesCsv(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canViewReports');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });

    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId, 10) : null;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : null;
    const q = req.query.q ? String(req.query.q).trim() : '';

    let sql = `
      SELECT be.id, be.place, be.amount, be.expense_date, be.vendor, be.notes, be.status, be.mileage_miles, be.created_at,
             ad.name AS department_name, da.account_number, da.label AS account_label,
             aec.name AS category_name, abp.name AS business_purpose_name,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM budget_expenses be
      JOIN agency_departments ad ON ad.id = be.department_id
      JOIN department_accounts da ON da.id = be.account_id
      JOIN agency_expense_categories aec ON aec.id = be.expense_category_id
      LEFT JOIN agency_business_purposes abp ON abp.id = be.business_purpose_id
      LEFT JOIN users u ON u.id = be.user_id
      WHERE be.agency_id = ?
    `;
    const params = [agencyId];
    if (departmentId) { sql += ' AND be.department_id = ?'; params.push(departmentId); }
    if (categoryId) { sql += ' AND be.expense_category_id = ?'; params.push(categoryId); }
    if (dateFrom) { sql += ' AND be.expense_date >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND be.expense_date <= ?'; params.push(dateTo); }
    sql += ' ORDER BY be.expense_date DESC, be.id DESC LIMIT 2000';

    const [rows] = await pool.execute(sql, params);
    let items = rows || [];
    if (q) {
      const lower = q.toLowerCase();
      items = items.filter((r) =>
        [r.vendor, r.place, r.notes, r.business_purpose_name, r.account_label].some((v) =>
          String(v || '').toLowerCase().includes(lower)
        )
      );
    }

    const headers = ['id', 'expense_date', 'amount', 'department_name', 'account_number', 'account_label', 'category_name', 'business_purpose_name', 'place', 'vendor', 'notes', 'mileage_miles', 'status', 'user_email', 'user_first_name', 'user_last_name', 'created_at'];
    const escape = (v) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(',')];
    for (const r of items) {
      lines.push(headers.map((h) => escape(r[h])).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="budget-expenses-${agencyId}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[budget.controller] exportBudgetExpensesCsv:', err);
    res.status(500).json({ error: { message: 'Failed to export' } });
  }
}

export async function analyzeBudgetExpenses(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) return res.status(403).json({ error: { message: 'Budget Management is not enabled' } });
    const allowed = await checkAssistantAdminPermission(req.user?.id, req.user?.role, agencyId, 'canViewReports');
    if (!allowed) return res.status(403).json({ error: { message: 'Permission denied' } });

    const [rows] = await pool.execute(
      `SELECT be.amount, be.expense_date, be.vendor, be.place, ad.name AS department_name, aec.name AS category_name, abp.name AS business_purpose_name
       FROM budget_expenses be
       JOIN agency_departments ad ON ad.id = be.department_id
       JOIN agency_expense_categories aec ON aec.id = be.expense_category_id
       LEFT JOIN agency_business_purposes abp ON abp.id = be.business_purpose_id
       WHERE be.agency_id = ? AND be.expense_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       ORDER BY be.expense_date DESC
       LIMIT 500`,
      [agencyId]
    );
    const byDept = {};
    const byCat = {};
    let total = 0;
    for (const r of rows || []) {
      const amt = Number(r.amount) || 0;
      total += amt;
      byDept[r.department_name] = (byDept[r.department_name] || 0) + amt;
      byCat[r.category_name] = (byCat[r.category_name] || 0) + amt;
    }
    const summary = {
      totalExpenses: total,
      count: rows?.length || 0,
      byDepartment: byDept,
      byCategory: byCat,
      sampleExpenses: (rows || []).slice(0, 30).map((r) => ({
        amount: r.amount,
        date: r.expense_date,
        vendor: r.vendor,
        place: r.place,
        department: r.department_name,
        category: r.category_name,
        businessPurpose: r.business_purpose_name
      }))
    };

    const prompt = `You are a budget analyst. Based on the following expense summary, provide 3-5 concise, actionable suggestions for cost reduction or budget optimization. Be specific and reference departments/categories when relevant. Format as a JSON array of strings, e.g. ["Suggestion 1", "Suggestion 2"].

Expense summary (last 12 months):
- Total: $${summary.totalExpenses.toFixed(2)} across ${summary.count} expenses
- By department: ${JSON.stringify(summary.byDepartment)}
- By category: ${JSON.stringify(summary.byCategory)}
- Sample expenses: ${JSON.stringify(summary.sampleExpenses)}

Return ONLY a valid JSON array of suggestion strings, no other text.`;
    const { text } = await callGeminiText({ prompt, temperature: 0.3, maxOutputTokens: 600 });
    let suggestions = [];
    try {
      const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      suggestions = JSON.parse(cleaned);
      if (!Array.isArray(suggestions)) suggestions = [String(suggestions)];
    } catch {
      suggestions = [String(text || 'Unable to parse suggestions.').trim()];
    }
    res.json({ suggestions, summary: { totalExpenses: summary.totalExpenses, count: summary.count } });
  } catch (err) {
    console.error('[budget.controller] analyzeBudgetExpenses:', err);
    res.status(500).json({ error: { message: 'Failed to analyze' } });
  }
}
