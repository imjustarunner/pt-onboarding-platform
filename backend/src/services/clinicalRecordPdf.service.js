import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import crypto from 'node:crypto';
import DocumentSigningService from './documentSigning.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const parse = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value); } catch { return value; } };
const humanize = key => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());
const internal = /(?:^id$|(?:^|_)(?:agency|client|user|session|note|document|goal|objective)_id$|Id$|Ids$|path$|url$|uri$|token|receipt|hash|encrypted|_enc$|storage|quarantine|signature_image|signatureImage|signatureData|base64|dataUrl|imageData|fileData|source_tool|toolId|aidId|modelName|latency|fingerprint|privatePsychotherapy|restricted|requestEvidence|ipAddress|userAgent|generationSource)/i;
export function clinicalValueHtml(value, depth = 0) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return `<time datetime="${escape(value.toISOString())}">${escape(value.toISOString())}</time>`;
  if (typeof value === 'string' && /^data:(?:image|application)\/[\w.+-]+;base64,/i.test(value)) return '<em>File data is retained in the original supporting document.</em>';
  if (depth > 12) throw Object.assign(new Error('A clinical field is nested too deeply to export safely.'), { status: 422 });
  if (Array.isArray(value)) return `<ol>${value.map(item => `<li>${clinicalValueHtml(item, depth + 1)}</li>`).join('')}</ol>`;
  if (typeof value === 'object') return `<dl>${Object.entries(value).filter(([key]) => !internal.test(key)).map(([key, item]) => {
    const body = clinicalValueHtml(item, depth + 1);
    return body ? `<div class="field"><dt>${escape(humanize(key))}</dt><dd>${body}</dd></div>` : '';
  }).join('')}</dl>`;
  return `<span>${escape(typeof value === 'boolean' ? value ? 'Yes' : 'No' : value).replace(/\n/g, '<br/>')}</span>`;
}
export function clinicalPayloadHtml(payload) {
  const plain = maybeDecryptNotePayload(payload);
  const value = parse(plain);
  return clinicalValueHtml(value?.sections || value?.text || value);
}
function signatureHtml(note, names = {}) {
  const versionSignatures = note.clinical_version_signatures || [];
  const author = versionSignatures.find(signature => ['author_sign', 'initial_author_sign'].includes(signature.action));
  const supervisor = versionSignatures.find(signature => ['supervisor_sign', 'initial_supervisor_sign'].includes(signature.action));
  const revised = Number(note.clinical_version_number) > 1;
  const signed = revised ? author?.signedAt : note.provider_signed_at;
  const authorId = author?.actorUserId || note.provider_signed_by_user_id || note.created_by_user_id;
  return `<aside class="signatures"><strong>Signature record</strong><p>${signed ? `Provider electronically signed: ${escape(names[authorId] || `User ${authorId}`)} · ${escape(signed)}` : revised ? 'Provider signature is not present on this amendment; see the amendment approval below.' : 'Unsigned draft — provider signature not recorded.'}</p>${supervisor?.signedAt || note.supervisor_cosigned_at ? `<p>Clinical supervisor electronically signed: ${escape(names[supervisor?.actorUserId || note.supervisor_cosigned_by_user_id] || 'Authorized supervisor')} · ${escape(supervisor?.signedAt || note.supervisor_cosigned_at)}</p>` : ''}</aside>`;
}
export function buildClinicalRecordHtml({ client = {}, agency = {}, notes = [], plans = [], diagnoses = [], manifest = [], names = {}, exportedAt = new Date().toISOString(), recordTitle = 'Medical record', includeDrafts = false, singleDocument = false } = {}) {
  const clientName = client.full_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client';
  const body = notes.map(({ note, session = {}, addenda = [], revisions = [] }, index) => {
    const metadata = parse(note.metadata_json) || {}, chart = metadata.structuredChart || {}, encounter = metadata.sessionContext || {};
    const payload = parse(maybeDecryptNotePayload(note.note_payload));
    const draft = !note.provider_signed_at;
    const header = { dateOfService: metadata.dateOfService || metadata.date_of_service || encounter.dateOfService || session.scheduled_start_at,
      serviceCode: metadata.serviceCode || session.service_code, startTime: chart.startTime || encounter.startTimeLocal || session.scheduled_start_at,
      endTime: chart.endTime || encounter.endTimeLocal || session.scheduled_end_at, durationMinutes: chart.durationMinutes ?? encounter.durationMinutes ?? session.duration_minutes,
      timeZone: session.source_timezone || agency.timezone, participants: chart.participants || encounter.participants || metadata.participants,
      location: chart.locationLabel || encounter.locationLabel || metadata.locationLabel, placeOfService: chart.placeOfService || session.place_of_service,
      provider: names[note.provider_signed_by_user_id || note.created_by_user_id], diagnosis: note.diagnostic_justification ? { diagnosticJustification: note.diagnostic_justification } : null };
    const metadataLabels = { structuredChart: 'Structured clinical findings', sessionContext: 'Confirmed encounter details', narrivaContext: 'Provider-confirmed clinical context', narrivaPreflight: 'Clinical review exceptions', smartGuide: 'Clinician guided responses', smartNoteGuide: 'Clinician guided responses', termination: 'Termination details' };
    const repeatedHeaderFields = new Set(['durationMinutes', 'participants', 'locationLabel', 'startTime', 'endTime', 'startTimeLocal', 'endTimeLocal', 'placeOfService']);
    const clinicalMetadata = Object.fromEntries(['structuredChart', 'sessionContext', 'narrivaContext', 'narrivaPreflight', 'consentConfirmed', 'interactiveComplexity', 'interactiveComplexityReason', 'riskAssessment', 'mse', 'smartGuide', 'smartNoteGuide', 'questionnaireResponses', 'formAnswers', 'structuredResponses', 'treatmentGoals', 'goalRatings', 'termination'].filter(key => metadata[key] != null).map(key => {
      const value = ['structuredChart', 'sessionContext'].includes(key) && typeof metadata[key] === 'object' ? Object.fromEntries(Object.entries(metadata[key]).filter(([field]) => !repeatedHeaderFields.has(field))) : metadata[key];
      return [metadataLabels[key] || key, value];
    }));
    const entries = addenda.map(entry => `<section class="amendment"><h3>${escape(({ addendum: 'Addendum', correction: 'Amendment / correction', late_entry: 'Late entry' })[entry.entry_kind] || 'Historical entry')}</h3><p>Entered ${escape(entry.created_at)} by ${escape(names[entry.created_by_user_id] || `User ${entry.created_by_user_id}`)}${entry.author_signed_at ? ` · author signed ${escape(entry.author_signed_at)}` : ' · signature not recorded'}</p>${entry.entry_reason ? `<p><strong>Reason:</strong> ${escape(entry.entry_reason)}</p>` : ''}${clinicalPayloadHtml(entry.body)}</section>`).join('');
    const history = revisions.filter(revision => Number(revision.id) !== Number(note.clinical_version_id) && (revision.approval || revision.status === 'original' || includeDrafts)).map(revision => `<section class="amendment"><h3>Clinical version ${escape(revision.revisionNumber)} — ${escape(revision.status)}</h3><p>${escape(revision.reason || 'Original clinical record')} · entered ${escape(revision.createdAt)}</p>${clinicalPayloadHtml(revision.snapshot?.notePayload)}${clinicalValueHtml({ approval: revision.approval, signatures: revision.signatures?.map(signature => ({ action: signature.action, signedBy: names[signature.actorUserId] || `User ${signature.actorUserId}`, signedAt: signature.signedAt })) })}</section>`).join('');
    return `<article class="note${draft ? ' draft' : ''}${singleDocument && index === 0 ? ' single-document-note' : ''}"><p class="eyebrow">${draft ? 'UNSIGNED DRAFT — NOT A SIGNED CLINICAL RECORD' : 'Clinical note'}${note.clinical_version_number ? ` · approved version ${escape(note.clinical_version_number)}` : ''}</p><h2>${escape(note.title || 'Clinical note')}</h2><div class="encounter-header">${clinicalValueHtml(header)}</div><section>${clinicalPayloadHtml(note.note_payload)}</section>${payload?.meta ? `<h3>Documented responses</h3>${clinicalValueHtml(payload.meta)}` : ''}${Object.keys(clinicalMetadata).length ? `<details open><summary>Confirmed encounter details and structured responses</summary>${clinicalValueHtml(clinicalMetadata)}</details>` : ''}${signatureHtml(note, names)}${entries}${history}</article>`;
  }).join('');
  const planBody = plans.map(plan => `<article class="note${plan.status === 'draft' ? ' draft' : ''}"><p class="eyebrow">Treatment plan · ${escape(plan.status)}${!plan.provider_signed_at ? ' · provider signature not recorded' : ''}</p><h2>${escape(plan.title || 'Treatment plan')}</h2>${clinicalValueHtml({ effectiveDate: plan.effective_date, presentingProblem: plan.presentingProblem || plan.presenting_problem, diagnosis: plan.planDiagnoses?.map(diagnosis => ({ code: diagnosis.icd10_code, description: diagnosis.description, justification: diagnosis.justification })), diagnosticJustification: plan.diagnosticJustification || plan.diagnostic_justification, prescribedFrequency: plan.prescribedFrequency || plan.prescribed_frequency, goals: plan.goals, dischargePlan: plan.dischargePlan || plan.discharge_plan, providerSignedAt: plan.provider_signed_at, supervisorSignedAt: plan.supervisor_signed_at || plan.supervisor_cosigned_at, providerSignoff: plan.providerSignoff, supervisorSignoff: plan.supervisorSignoff, historicalRecordOnFile: plan.legacyRecordOnFile })}</article>`).join('');
  return `<style>html,body{background:#fff!important;color-scheme:light}body{font-family:Arial,sans-serif;color:#17324a;font-size:10.5pt;line-height:1.5}h1{font-size:25pt;color:#123d66}h2{font-size:17pt;border-bottom:2px solid #d4a62c;padding-bottom:7px}h3{font-size:12pt;color:#164f7e}.cover{padding:18px 0 24px}.cover>dl,.encounter-header>dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px}.encounter-header{padding:8px 14px;border:1px solid #d1dce6;border-radius:8px;background:#f5f8fb}.encounter-header .field{margin:3px 0}.single-document-note{page-break-before:auto!important}.eyebrow{font-size:9pt;letter-spacing:.06em;text-transform:uppercase;color:#536b7e}.note{page-break-before:always}.field{margin:8px 0;break-inside:auto}dt{font-weight:bold;color:#264960}dd{margin:3px 0 7px 12px;overflow-wrap:anywhere}dl dl{margin-left:8px}ol{padding-left:24px}.signatures,.amendment{margin-top:22px;border-top:1px solid #c5d3de;padding-top:12px;break-inside:auto}.draft{border-top:4px solid #b96223}.draft>.eyebrow{color:#a24f12}table{border-collapse:collapse;width:100%;font-size:9pt}th,td{text-align:left;border-bottom:1px solid #d1dce6;padding:9px;overflow-wrap:anywhere}summary{font-weight:bold;margin-top:18px}</style><section class="cover"><p class="eyebrow">${escape(agency.name || 'Clinical practice')} · confidential clinical information</p><h1>${escape(recordTitle)}</h1><h2>${escape(clientName)}</h2>${clinicalValueHtml({ dateOfBirth: client.date_of_birth, recordPrepared: exportedAt, agency: agency.name, noteCount: notes.length, treatmentPlanCount: plans.length })}<p>Approved clinical content is shown with its signature and amendment history. ${includeDrafts ? 'Unsigned drafts and proposed changes are clearly identified.' : 'Unsigned progress notes and unapproved proposed amendments are excluded. Treatment plans display their recorded signature state.'} Original attached files are embedded in this PDF; supported PDFs and images also appear as appendix pages.</p></section>${body}${diagnoses.length ? `<article class="note"><h2>Diagnosis history</h2>${clinicalValueHtml(diagnoses)}</article>` : ''}${planBody}${singleDocument && !manifest.length ? '' : `<article class="note"><h2>Supporting documents and attachment manifest</h2>${manifest.length ? `<table><thead><tr><th>Document</th><th>Included content</th><th>Integrity</th></tr></thead><tbody>${manifest.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(item.disposition)}</td><td>${item.sha256 ? escape(item.sha256) : escape(item.reason || '')}</td></tr>`).join('')}</tbody></table>` : '<p>No supporting documents were linked to the exported scope.</p>'}</article>`}`;
}

export async function generateClinicalRecordPdf(input, { renderHtml } = {}) {
  const attachments = input.attachments || [];
  if (attachments.reduce((total, attachment) => total + (attachment.buffer?.length || 0), 0) > 100 * 1024 * 1024) throw Object.assign(new Error('This record exceeds the 100 MB export limit. Export a smaller date range.'), { status: 413 });
  const manifest = [...(input.manifest || [])];
  const renderable = [];
  const usedNames = new Set();
  for (const original of attachments) {
    let name = String(original.name || 'supporting-document').replace(/[\r\n/\\]/g, '-');
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : '';
      let count = 2;
      do { name = `${stem} (${count++})${extension}`; } while (usedNames.has(name));
    }
    usedNames.add(name);
    const attachment = { ...original, name };
    const sha256 = crypto.createHash('sha256').update(attachment.buffer).digest('hex');
    let pages = null, image = null;
    if (attachment.mimeType === 'application/pdf') {
      try { pages = await PDFDocument.load(attachment.buffer); } catch { /* Retain the original as an embedded file even if its pages cannot be merged. */ }
    } else if (['image/jpeg', 'image/png'].includes(attachment.mimeType)) image = attachment;
    manifest.push({ name: attachment.name, sha256, disposition: pages ? `${pages.getPageCount()} appendix page(s) and embedded original` : image ? 'Appendix image and embedded original' : 'Embedded original file; open with a PDF reader that supports attachments' });
    renderable.push({ ...attachment, pages, image });
  }
  const html = buildClinicalRecordHtml({ ...input, manifest });
  let bytes;
  if (renderHtml) bytes = await renderHtml(html);
  else {
    const branded = await DocumentSigningService.applyPacketBrandChromeToHtml(html, { agencyId: input.agency.id, includeVersion: false });
    bytes = await DocumentSigningService.convertHTMLToPDF(branded.html, { ...branded.pdfOptions, disableFallback: true, documentType: 'clinical_medical_record', branding: { agencyId: input.agency.id } });
  }
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const basePageCount = pdf.getPageCount();
  for (const attachment of renderable) {
    await pdf.attach(attachment.buffer, attachment.name, { mimeType: attachment.mimeType || 'application/octet-stream', description: 'Original clinical supporting document' });
    if (attachment.pages) for (const page of await pdf.copyPages(attachment.pages, attachment.pages.getPageIndices())) pdf.addPage(page);
    if (attachment.image) {
      const image = attachment.mimeType === 'image/png' ? await pdf.embedPng(attachment.buffer) : await pdf.embedJpg(attachment.buffer);
      const page = pdf.addPage([612, 792]), dimensions = image.scaleToFit(516, 648);
      page.drawText('Supporting clinical image', { x: 48, y: 748, size: 12, font, color: rgb(.08, .24, .4) });
      page.drawImage(image, { x: (612 - dimensions.width) / 2, y: (720 - dimensions.height) / 2, width: dimensions.width, height: dimensions.height });
    }
  }
  for (let index = basePageCount; index < pdf.getPageCount(); index++) pdf.getPage(index).drawText(`CONFIDENTIAL - Clinical record attachment | Page ${index + 1} of ${pdf.getPageCount()}`, { x: 28, y: 12, size: 7, font, color: rgb(.25, .33, .4) });
  pdf.setTitle(input.recordTitle || 'Medical record');
  pdf.setSubject('Clinical record with amendment history and original supporting files');
  return pdf.save();
}
