import pool from '../config/database.js';

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getExecutiveSnapshot(req, res, next) {
  try {
    // ---- Agencies ----
    const [agencyCountRows] = await pool.execute(
      `SELECT COUNT(*) AS agency_count
       FROM agencies a
       WHERE LOWER(COALESCE(a.organization_type, 'agency')) = 'agency'`
    );
    const agenciesManaged = n(agencyCountRows?.[0]?.agency_count);

    // ---- Providers (network) ----
    const [providerRows] = await pool.execute(
      `SELECT
        COUNT(*) AS provider_count,
        SUM(CASE WHEN UPPER(COALESCE(u.status, '')) = 'ACTIVE_EMPLOYEE' OR LOWER(COALESCE(u.status,'')) = 'active' THEN 1 ELSE 0 END) AS provider_active_count
       FROM users u
       WHERE LOWER(COALESCE(u.role,'')) = 'provider'`
    );
    const providersTotal = n(providerRows?.[0]?.provider_count);
    const providersActive = n(providerRows?.[0]?.provider_active_count);

    // ---- Platform Revenue (latest upload) ----
    const [latestUploadRows] = await pool.execute(
      `SELECT id, report_date, report_label, created_at
       FROM platform_revenue_report_uploads
       ORDER BY report_date DESC, created_at DESC, id DESC
       LIMIT 1`
    );
    const revenueUpload = latestUploadRows?.[0] || null;

    let revenueTotals = null;
    if (revenueUpload?.id) {
      const [revTotalsRows] = await pool.execute(
        `SELECT
          SUM(r.managed_total) AS managed_total,
          SUM(r.collected_total) AS collected_total,
          SUM(r.outstanding_total) AS outstanding_total,
          SUM(r.gross_charges_total) AS gross_charges_total,
          COUNT(*) AS row_count
         FROM platform_revenue_report_rows r
         WHERE r.upload_id = ?`,
        [Number(revenueUpload.id)]
      );
      revenueTotals = revTotalsRows?.[0] || null;
    }

    // ---- Receivables (A/R outstanding from receivables rows) ----
    // NOTE: This is agency-level A/R from receivables ingestion (not necessarily the same as platform revenue outstanding).
    const [arTotalsRows] = await pool.execute(
      `SELECT
        SUM(CASE WHEN rr.patient_outstanding_amount > 0 THEN rr.patient_outstanding_amount ELSE 0 END) AS outstanding_total,
        SUM(CASE WHEN rr.patient_outstanding_amount > 0 AND rr.service_date IS NOT NULL AND DATEDIFF(CURDATE(), rr.service_date) >= 60 THEN rr.patient_outstanding_amount ELSE 0 END) AS outstanding_60_plus_total,
        SUM(CASE WHEN rr.patient_outstanding_amount > 0 AND rr.service_date IS NOT NULL AND DATEDIFF(CURDATE(), rr.service_date) BETWEEN 14 AND 59 THEN rr.patient_outstanding_amount ELSE 0 END) AS outstanding_14_59_total,
        COUNT(*) AS total_rows
       FROM agency_receivables_report_rows rr`
    );
    const receivablesAr = arTotalsRows?.[0] || null;

    res.json({
      agencies_managed: agenciesManaged,
      providers_total: providersTotal,
      providers_active: providersActive,
      revenue_latest_upload: revenueUpload,
      revenue_latest_totals: revenueTotals,
      receivables_ar_totals: receivablesAr
    });
  } catch (e) {
    next(e);
  }
}

export async function getExecutiveRevenueTimeseries(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(200, parseInt(req.query?.limit, 10) || 30));
    const [rows] = await pool.execute(
      `SELECT
        u.id AS upload_id,
        u.report_date,
        u.report_label,
        u.created_at,
        SUM(r.managed_total) AS managed_total,
        SUM(r.collected_total) AS collected_total,
        SUM(r.outstanding_total) AS outstanding_total,
        SUM(r.gross_charges_total) AS gross_charges_total
       FROM platform_revenue_report_uploads u
       LEFT JOIN platform_revenue_report_rows r ON r.upload_id = u.id
       GROUP BY u.id, u.report_date, u.report_label, u.created_at
       ORDER BY u.report_date ASC, u.created_at ASC, u.id ASC`
    );
    const series = (rows || []).slice(Math.max(0, (rows || []).length - limit));
    res.json({ series });
  } catch (e) {
    next(e);
  }
}

