/**
 * Claim.MD clearinghouse adapter (https://api.claim.md/).
 * AccountKey is required on every call. Responses are passthrough JSON/text.
 */

const CLAIM_MD_BASE = String(process.env.CLAIM_MD_API_BASE || 'https://svc.claim.md/services').replace(/\/$/, '');

async function postForm(path, fields = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    body.append(k, String(v));
  }
  const resp = await fetch(`${CLAIM_MD_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }
  if (!resp.ok) {
    const err = new Error(json?.error || json?.message || `Claim.MD HTTP ${resp.status}`);
    err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    err.details = json || text.slice(0, 2000);
    throw err;
  }
  return json != null ? json : { raw: text };
}

/**
 * Upload a claim file (JSON/CSV/837P content as string).
 */
export async function uploadClaims({ accountKey, fileContents, filename = 'claims.json' }) {
  return postForm('/upload/', {
    AccountKey: accountKey,
    Filename: filename,
    File: fileContents
  });
}

/** Incremental response download — ResponseID=0 for first pull. */
export async function fetchResponses({ accountKey, responseId = '0' }) {
  return postForm('/response/', {
    AccountKey: accountKey,
    ResponseID: String(responseId)
  });
}

export async function fetchEraList({ accountKey, page = '1' }) {
  return postForm('/eralist/', {
    AccountKey: accountKey,
    Page: String(page)
  });
}

export async function requestEligibilityJson({ accountKey, payload }) {
  return postForm('/eligdata/', {
    AccountKey: accountKey,
    ...(payload && typeof payload === 'object' ? payload : {})
  });
}

/**
 * Build a minimal Claim.MD-oriented JSON claim payload from our domain claim.
 * Field names follow common Claim.MD JSON upload conventions; adjust with vendor mapping as needed.
 */
export function buildClaimMdJsonClaim(claim, lines = []) {
  return {
    claim_id: claim.id,
    claim_number: claim.claim_number || `LOCAL-${claim.id}`,
    patient_control_number: claim.claim_number || String(claim.id),
    payer_name: claim.payer_name || '',
    member_id: claim.member_id || '',
    billing_npi: claim.billing_npi || '',
    rendering_npi: claim.rendering_npi || '',
    taxonomy: claim.taxonomy_code || '',
    place_of_service: claim.place_of_service || '',
    date_of_service: claim.date_of_service || null,
    diagnosis_codes: claim.diagnosis_codes_json || [],
    total_charge_cents: claim.amount_cents || 0,
    lines: (lines || []).map((l) => ({
      line: l.line_number,
      procedure_code: l.procedure_code,
      modifiers: l.modifiers_json || [],
      units: Number(l.units || 1),
      charge_cents: l.charge_cents || 0,
      diagnosis_pointers: l.diagnosis_pointers || '1',
      service_date: l.service_date || claim.date_of_service || null
    }))
  };
}
