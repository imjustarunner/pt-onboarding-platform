import {
  resolveMisdirectedReportToken,
  submitMisdirectedEmailReport
} from '../services/misdirectedEmailReport.service.js';

export async function getMisdirectedEmailReportPreview(req, res, next) {
  try {
    const row = await resolveMisdirectedReportToken(req.params.token);
    if (!row) {
      return res.status(404).json({ error: { message: 'This report link is invalid.' } });
    }
    if (row.expired) {
      return res.status(400).json({
        error: {
          message:
            row.reason === 'already_used'
              ? 'This report was already submitted.'
              : 'This report link has expired.'
        },
        code: row.reason
      });
    }
    res.json({
      ok: true,
      agencyName: row.agency_name || null,
      agencyId: row.agency_id || null,
      subject: row.subject || null,
      toEmailMasked: row.to_email
        ? String(row.to_email).replace(/(^.).*(@.*$)/, (_, a, b) => `${a}***${b}`)
        : null
    });
  } catch (e) {
    next(e);
  }
}

export async function postMisdirectedEmailReport(req, res, next) {
  try {
    const result = await submitMisdirectedEmailReport({
      rawToken: req.params.token,
      reporterName: req.body?.name || null,
      reporterEmail: req.body?.email || null,
      details: req.body?.details || req.body?.message || null
    });
    res.json({ ok: true, ticketId: result.ticketId, agencyName: result.agencyName });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
}
