const KINDS = new Set(['print_only', 'reference', 'acknowledgement', 'upload', 'company_document']);

function asObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

export function sanitizePrehireConfig(raw) {
  const parsed = asObject(raw) || {};
  const documents = (Array.isArray(parsed.documents) ? parsed.documents : [])
    .map((d, i) => {
      const kindRaw = String(d?.kind || d?.type || '').trim().toLowerCase();
      const kind = KINDS.has(kindRaw) ? kindRaw : 'acknowledgement';
      const title = String(d?.title || d?.name || '').trim().slice(0, 255);
      if (!title) return null;
      const templateId = Number(d?.templateId || d?.documentTemplateId || 0) || null;
      const filePath = String(d?.filePath || d?.file_path || '').trim().slice(0, 1000) || null;
      const fileName = String(d?.fileName || d?.file_name || d?.originalName || '').trim().slice(0, 255) || null;
      const mimeType = String(d?.mimeType || d?.mime_type || '').trim().slice(0, 120) || null;
      return {
        id: String(d?.id || `doc-${i + 1}`).trim().slice(0, 80),
        kind,
        title,
        instructions: String(d?.instructions || '').trim().slice(0, 4000),
        printInstructions: String(d?.printInstructions || d?.print_instructions || '').trim().slice(0, 8000),
        url: String(d?.url || '').trim().slice(0, 2000),
        filePath,
        fileName,
        mimeType,
        templateId,
        scheduledOn: String(d?.scheduledOn || d?.scheduled_on || '').trim().slice(0, 10) || null
      };
    })
    .filter(Boolean);

  const signerRoleIds = (Array.isArray(parsed.signerRoleIds) ? parsed.signerRoleIds : parsed.signer_role_ids || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  return { documents, signerRoleIds };
}

export function mergePrehireDocuments(jobConfig, agencyDefaults) {
  const job = sanitizePrehireConfig(jobConfig);
  const defaults = sanitizePrehireConfig(agencyDefaults);
  const seen = new Set(job.documents.map((d) => d.id));
  const merged = [...job.documents];
  for (const d of defaults.documents) {
    if (!seen.has(d.id)) merged.push(d);
  }
  return {
    documents: merged,
    signerRoleIds: job.signerRoleIds.length ? job.signerRoleIds : defaults.signerRoleIds
  };
}
