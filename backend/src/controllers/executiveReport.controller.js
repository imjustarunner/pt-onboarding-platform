import pool from '../config/database.js';
import { getRevenueAggregates } from '../services/billingReportIngest.service.js';

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

    // ---- Revenue from canonical billing lines ----
    let revenueTotals = null;
    let revenueUpload = null;
    try {
      const rev = await getRevenueAggregates({});
      revenueTotals = {
        managed_total: rev.totals?.managed_total || 0,
        collected_total: rev.totals?.collected_total || 0,
        outstanding_total: rev.totals?.outstanding_total || 0,
        patient_outstanding_total: rev.totals?.patient_outstanding_total || 0,
        insurance_outstanding_total: rev.totals?.insurance_outstanding_total || 0,
        gross_charges_total: rev.totals?.gross_charges_total || 0,
        row_count: rev.totals?.line_count || 0
      };
      const [latest] = await pool.execute(
        `SELECT id, created_at, report_label, min_service_date, max_service_date
         FROM billing_report_uploads
         WHERE status = 'completed'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      );
      if (latest?.[0]) {
        revenueUpload = {
          id: latest[0].id,
          report_date: latest[0].max_service_date || latest[0].created_at,
          report_label: latest[0].report_label || 'Billing report ingest',
          created_at: latest[0].created_at
        };
      }
    } catch {
      revenueTotals = null;
    }

    // ---- Receivables (patient + insurance outstanding) ----
    const [arTotalsRows] = await pool.execute(
      `SELECT
        SUM(CASE WHEN rr.patient_outstanding_amount > 0 THEN rr.patient_outstanding_amount ELSE 0 END) AS patient_outstanding_total,
        SUM(CASE WHEN COALESCE(rr.insurance_outstanding_amount, 0) > 0 THEN rr.insurance_outstanding_amount ELSE 0 END) AS insurance_outstanding_total,
        SUM(
          CASE WHEN rr.patient_outstanding_amount > 0 THEN rr.patient_outstanding_amount ELSE 0 END
          + CASE WHEN COALESCE(rr.insurance_outstanding_amount, 0) > 0 THEN rr.insurance_outstanding_amount ELSE 0 END
        ) AS outstanding_total,
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
        COALESCE(u.max_service_date, DATE(u.created_at)) AS report_date,
        u.report_label,
        u.created_at,
        u.lines_inserted + u.lines_updated AS line_count
       FROM billing_report_uploads u
       WHERE u.status = 'completed'
       ORDER BY COALESCE(u.max_service_date, DATE(u.created_at)) ASC, u.created_at ASC, u.id ASC`
    );

    // Approximate per-upload revenue by re-querying lines for each upload (bounded).
    const series = [];
    const slice = (rows || []).slice(Math.max(0, (rows || []).length - limit));
    for (const u of slice) {
      const [agg] = await pool.execute(
        `SELECT
           SUM(charge_rate) AS gross_charges_total,
           SUM(patient_amount + insurance_amount_paid) AS collected_total,
           SUM(patient_balance + insurance_outstanding) AS outstanding_total,
           SUM(charge_rate) AS managed_total
         FROM billing_report_lines
         WHERE upload_id = ?`,
        [u.upload_id]
      );
      const a = agg?.[0] || {};
      series.push({
        upload_id: u.upload_id,
        report_date: u.report_date,
        report_label: u.report_label,
        created_at: u.created_at,
        managed_total: n(a.managed_total),
        collected_total: n(a.collected_total),
        outstanding_total: n(a.outstanding_total),
        gross_charges_total: n(a.gross_charges_total)
      });
    }
    res.json({ series });
  } catch (e) {
    next(e);
  }
}

