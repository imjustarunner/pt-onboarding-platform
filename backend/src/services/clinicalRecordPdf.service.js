import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import crypto from 'node:crypto';
import DocumentSigningService from './documentSigning.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { agencyDocumentPresentation } from './documentAgencyBranding.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const parse = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value); } catch { return value; } };
const humanize = key => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());
const internal = /(?:^id$|(?:^|_)(?:agency|client|user|session|note|document|goal|objective)_id$|Id$|Ids$|path$|url$|uri$|token|receipt|hash|encrypted|_enc$|storage|quarantine|signature_image|signatureImage|signatureData|base64|dataUrl|imageData|fileData|source_tool|toolId|aidId|modelName|latency|fingerprint|privatePsychotherapy|restricted|requestEvidence|ipAddress|userAgent|generationSource)/i;
export function clinicalValueHtml(value, depth = 0) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return `<time datetime="${escape(value.toISOString())}">${escape(value.toISOString())}</time>`;
  if (typeof value === 'string' && /^data:(?:image|application)\/[\w.+-]+;base64,/i.test(value)) return '<em>File data is retained in the original supporting document.</em>';
  if (depth > 12) throw Object.assign(new Error('A clinical field is nested too deeply to export safely.'), { status: 422 });
  if (Array.isArray(value)) {
    const items = value.map(item => clinicalValueHtml(item, depth + 1)).filter(Boolean);
    return items.length ? `<ol>${items.map(item => `<li>${item}</li>`).join('')}</ol>` : '';
  }
  if (typeof value === 'object') {
    const fields = Object.entries(value).filter(([key]) => !internal.test(key)).map(([key, item]) => {
    const body = clinicalValueHtml(item, depth + 1);
    const compact = ['string', 'number', 'boolean'].includes(typeof item) && !String(item).includes('\n') && String(item).length < 100;
    return body ? `<div class="field${/^(?:mentalStatusExam|mse)$/.test(key) ? ' field--mse' : ''}${compact ? ' field--compact' : ' field--wide'}"><dt>${escape(humanize(key))}</dt><dd>${body}</dd></div>` : '';
    }).join('');
    return fields ? `<dl>${fields}</dl>` : '';
  }
  return `<span>${escape(typeof value === 'boolean' ? value ? 'Yes' : 'No' : value).replace(/\n/g, '<br/>')}</span>`;
}
const decodedPayload = payload => maybeDecryptNotePayload(payload && typeof payload === 'object' ? JSON.stringify(payload) : payload);
export function clinicalPayloadHtml(payload) {
  const plain = decodedPayload(payload);
  const value = parse(plain);
  if (value?.sections && typeof value.sections === 'object') return Object.entries(value.sections).map(([title, body]) => {
    const content = clinicalValueHtml(body);
    return content ? `<section class="note-section${/mental status|^mse$/i.test(title) ? ' note-section--mse' : ''}"><h3>${escape(humanize(title))}</h3>${content}</section>` : '';
  }).join('');
  return clinicalValueHtml(value?.text || value);
}
function signatureHtml(note, names = {}, recordType = 'clinical') {
  if (recordType === 'tutoring' && !note.provider_signed_at && note.saved_at) return `<aside class="signatures"><strong>Session record</strong><p>Recorded by: ${escape(names[note.saved_by_user_id || note.created_by_user_id] || 'Tutor')} · ${escape(note.saved_at)}</p></aside>`;
  const versionSignatures = note.clinical_version_signatures || [];
  const author = versionSignatures.find(signature => ['author_sign', 'initial_author_sign'].includes(signature.action));
  const supervisor = versionSignatures.find(signature => ['supervisor_sign', 'initial_supervisor_sign'].includes(signature.action));
  const revised = Number(note.clinical_version_number) > 1;
  const signed = revised ? author?.signedAt : note.provider_signed_at;
  const authorId = author?.actorUserId || note.provider_signed_by_user_id || note.created_by_user_id;
  const role = recordType === 'tutoring' ? 'Tutor' : 'Provider';
  return `<aside class="signatures"><strong>Signature record</strong><p>${signed ? `${role} electronically signed: ${escape(names[authorId] || `User ${authorId}`)} · ${escape(signed)}` : revised ? `${role} signature is not present on this amendment; see the amendment approval below.` : `Unsigned draft — ${role.toLowerCase()} signature not recorded.`}</p>${supervisor?.signedAt || note.supervisor_cosigned_at ? `<p>${recordType === 'tutoring' ? 'Supervisor' : 'Clinical supervisor'} electronically signed: ${escape(names[supervisor?.actorUserId || note.supervisor_cosigned_by_user_id] || 'Authorized supervisor')} · ${escape(supervisor?.signedAt || note.supervisor_cosigned_at)}</p>` : ''}</aside>`;
}
const dateLabel = value => value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
const agencyName = agency => String(agency.official_name || agency.name || 'Clinical practice').trim();
const brandColors = agency => agencyDocumentPresentation(agency, { primaryColor: '#283e4b', accentColor: '#61717c' });

/** Compact, tenant-only print identity; no platform or generator branding. */
export function clinicalRecordPrintOptions({ agency = {}, brand = {}, client = {}, recordType = 'clinical', sample = false } = {}) {
  const name = escape(agencyName(agency)), colors = brandColors(agency);
  const logo = [brand.headerLogoDataUrl, brand.headerImageDataUrl].find(value => /^data:image\/(?:png|jpe?g|webp);base64,[a-z\d+/=\s]+$/i.test(String(value || '')));
  const kind = recordType === 'tutoring' ? 'Learning record' : 'Clinical record';
  const person = escape(client.full_name || client.recordDemographics?.fullName || [client.first_name, client.last_name].filter(Boolean).join(' '));
  const dateOfBirth = client.date_of_birth || client.recordDemographics?.dateOfBirth;
  const birth = dateOfBirth ? ` · DOB ${escape(dateLabel(dateOfBirth))}` : '';
  return {
    networkIsolation: true, format: 'Letter', printBackground: true, displayHeaderFooter: true,
    margin: { top: '0.72in', right: '0.48in', bottom: '0.48in', left: '0.48in' },
    headerTemplate: `<div style="width:100%;margin:0 0.48in;padding:0 0 6px;border-bottom:1.5px solid ${colors.primaryColor};display:flex;align-items:center;justify-content:space-between;gap:14px;font-family:Arial,sans-serif;font-size:8px;height:42px;color:#24323b;"><div style="width:43%;height:34px;display:flex;align-items:center;">${logo ? `<img alt="${name}" src="${logo}" style="max-width:210px;max-height:34px;object-fit:contain;object-position:left center;" />` : `<strong style="font-size:13px;">${name}</strong>`}</div><div style="text-align:right;max-width:57%;"><strong style="font-size:11px;">${name}</strong><div style="font-size:8px;margin-top:3px;">${sample ? 'FICTIONAL SAMPLE · ' : ''}${kind} · Confidential</div></div></div>`,
    footerTemplate: `<div style="width:100%;margin:0 0.48in;padding-top:5px;border-top:1px solid #d7dee2;display:flex;justify-content:space-between;gap:12px;font-family:Arial,sans-serif;font-size:8px;color:#52606b;"><div>${name} · Confidential${sample ? ' · Fictional sample' : ''}${person ? `<div style="margin-top:2px;">${person}${birth}</div>` : ''}</div><span style="white-space:nowrap;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
  };
}

export function clientRecordIdentity(client = {}) {
  const demographics = client.recordDemographics || {};
  const address = [client.address_street || demographics.addressStreet, client.address_apt || demographics.addressApt,
    client.address_city || demographics.addressCity, client.address_state || demographics.addressState, client.address_zip || demographics.addressZip].filter(Boolean).join(', ');
  return { recordNumber: client.identifier_code || client.record_number || (client.id ? String(client.id) : null),
    dateOfBirth: dateLabel(client.date_of_birth || demographics.dateOfBirth), preferredName: client.preferred_name || demographics.preferredName,
    gender: client.gender || demographics.gender,
    preferredLanguage: client.preferred_language || client.primary_client_language || demographics.preferredLanguage,
    address: address || null, phone: client.contact_phone || demographics.contactPhone, email: client.email || demographics.email,
    guardian: client.recordGuardians || null };
}
// Note snapshots are authoritative. Never replace an old diagnosis or presenting
// problem with a later value from the live chart during an export.
export function documentedClinicalContext(note, metadata = {}) {
  const chart = metadata.structuredChart || {}, context = metadata.narrivaContext || {}, confirmed = metadata.narrivaPreflight?.clinicalContext || {};
  const diagnoses = [chart.diagnoses, chart.intakeDiagnoses, metadata.diagnoses, confirmed.diagnoses].find(value => Array.isArray(value) && value.length);
  return { presentingProblem: context.presentingProblem || metadata.presentingProblem || chart.presentingProblem || confirmed.presentingProblem || 'Not recorded in this note.',
    diagnoses: diagnoses || 'Not recorded in this note.', diagnosticJustification: note.diagnostic_justification || chart.diagnosticJustification || metadata.diagnosticJustification || confirmed.diagnosticJustification ||
      (diagnoses || []).filter(diagnosis => diagnosis.justification).map(diagnosis => `${diagnosis.code || diagnosis.icd10_code || ''}: ${diagnosis.justification}`).join('\n') || 'Not recorded in this note.' };
}

export function buildClinicalRecordHtml({ client = {}, agency = {}, notes = [], plans = [], diagnoses = [], manifest = [], names = {}, exportedAt = new Date().toISOString(), recordTitle = 'Medical record', includeDrafts = false, singleDocument = false, recordType = 'clinical', sample = false } = {}) {
  const colors = brandColors(agency);
  const clientName = client.full_name || client.recordDemographics?.fullName || [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client';
  const body = notes.map(({ note, session = {}, addenda = [], revisions = [] }, index) => {
    const metadata = parse(note.metadata_json) || {}, chart = metadata.structuredChart || {}, encounter = metadata.sessionContext || {};
    const payload = parse(decodedPayload(note.note_payload));
    const draft = !note.provider_signed_at && !(recordType === 'tutoring' && note.saved_at);
    const header = { dateOfService: metadata.dateOfService || metadata.date_of_service || encounter.dateOfService || session.scheduled_start_at,
      serviceCode: metadata.serviceCode || session.service_code, startTime: chart.startTime || encounter.startTimeLocal || session.scheduled_start_at,
      endTime: chart.endTime || encounter.endTimeLocal || session.scheduled_end_at, durationMinutes: chart.durationMinutes ?? encounter.durationMinutes ?? session.duration_minutes,
      timeZone: session.source_timezone || agency.timezone, participants: chart.participants || encounter.participants || metadata.participants || 'Not recorded in this note.',
      participantDetails: chart.participantsDetail || encounter.participantsDetail || metadata.participantsDetail || metadata.narrivaContext?.participantsDetail,
      location: chart.locationLabel || encounter.locationLabel || metadata.locationLabel, placeOfService: chart.placeOfService || session.place_of_service,
      [recordType === 'tutoring' ? 'tutor' : 'provider']: names[note.provider_signed_by_user_id || note.created_by_user_id] };
    const localClock = value => typeof value === 'string' && /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?$/i.test(value.trim());
    if (localClock(header.startTime) && localClock(header.endTime)) {
      header.time = `${header.startTime}–${header.endTime}${header.durationMinutes != null ? ` · ${header.durationMinutes} min` : ''}${header.timeZone ? ` · ${header.timeZone}` : ''}`;
      for (const key of ['startTime', 'endTime', 'durationMinutes', 'timeZone']) delete header[key];
    }
    const metadataLabels = { structuredChart: recordType === 'tutoring' ? 'Learning evidence and responses' : 'Structured clinical findings', sessionContext: 'Confirmed encounter details', narrivaContext: 'Provider-confirmed clinical context', narrivaPreflight: 'Clinical review exceptions', smartGuide: 'Clinician guided responses', smartNoteGuide: 'Clinician guided responses', termination: 'Termination details' };
    const repeatedHeaderFields = new Set(['durationMinutes', 'participants', 'locationLabel', 'startTime', 'endTime', 'startTimeLocal', 'endTimeLocal', 'placeOfService', 'participantsDetail', ...(recordType === 'tutoring' ? [] : ['diagnoses', 'intakeDiagnoses', 'diagnosticJustification', 'presentingProblem'])]);
    const clinicalMetadata = Object.fromEntries(['structuredChart', 'sessionContext', 'narrivaContext', 'narrivaPreflight', 'consentConfirmed', 'interactiveComplexity', 'interactiveComplexityReason', 'riskAssessment', 'mse', 'smartGuide', 'smartNoteGuide', 'questionnaireResponses', 'formAnswers', 'structuredResponses', 'treatmentGoals', 'goalRatings', 'termination'].filter(key => metadata[key] != null).map(key => {
      const value = ['structuredChart', 'sessionContext', 'narrivaContext'].includes(key) && typeof metadata[key] === 'object' ? Object.fromEntries(Object.entries(metadata[key]).filter(([field]) => !repeatedHeaderFields.has(field))) : metadata[key];
      return [metadataLabels[key] || key, value];
    }));
    const entries = addenda.map(entry => `<section class="amendment"><h3>${escape(recordType === 'tutoring' ? 'Earlier session documentation' : ({ addendum: 'Addendum', correction: 'Amendment / correction', late_entry: 'Late entry' })[entry.entry_kind] || 'Historical entry')}</h3><p>Entered ${escape(entry.created_at)} by ${escape(names[entry.created_by_user_id] || `User ${entry.created_by_user_id}`)}${recordType === 'tutoring' ? '' : entry.author_signed_at ? ` · author signed ${escape(entry.author_signed_at)}` : ' · signature not recorded'}</p>${entry.entry_reason ? `<p><strong>Reason:</strong> ${escape(entry.entry_reason)}</p>` : ''}${clinicalPayloadHtml(entry.body)}</section>`).join('');
    const history = revisions.filter(revision => Number(revision.id) !== Number(note.clinical_version_id) && (revision.approval || revision.status === 'original' || includeDrafts)).map(revision => `<section class="amendment"><h3>Clinical version ${escape(revision.revisionNumber)} — ${escape(revision.status)}</h3><p>${escape(revision.reason || 'Original clinical record')} · entered ${escape(revision.createdAt)}</p>${clinicalPayloadHtml(revision.snapshot?.notePayload)}${clinicalValueHtml({ approval: revision.approval, signatures: revision.signatures?.map(signature => ({ action: signature.action, signedBy: names[signature.actorUserId] || `User ${signature.actorUserId}`, signedAt: signature.signedAt })) })}</section>`).join('');
    return `<article class="note${draft ? ' draft' : ''}${singleDocument && index === 0 ? ' single-document-note' : ''}"><p class="eyebrow">${draft ? 'UNSIGNED DRAFT — NOT A SIGNED CLINICAL RECORD' : recordType === 'tutoring' ? 'Tutoring note' : 'Clinical note'}${note.clinical_version_number ? ` · approved version ${escape(note.clinical_version_number)}` : ''}</p>${singleDocument && index === 0 ? '' : `<h2>${escape(note.title || 'Clinical note')}</h2>`}<div class="encounter-header">${clinicalValueHtml(header)}</div>${recordType === 'tutoring' ? '' : `<section class="clinical-context">${clinicalValueHtml(documentedClinicalContext(note, metadata))}</section>`}<section>${clinicalPayloadHtml(note.note_payload)}</section>${payload?.meta ? `<h3>Documented responses</h3>${clinicalValueHtml(payload.meta)}` : ''}${Object.entries(clinicalMetadata).map(([label, value]) => label === metadataLabels.structuredChart || label === metadataLabels.sessionContext ? clinicalValueHtml(value) : clinicalValueHtml({ [label]: value })).filter(Boolean).map(content => `<section class="structured-responses">${content}</section>`).join('')}${signatureHtml(note, names, recordType)}${entries}${history}</article>`;
  }).join('');
  const planBody = plans.map(plan => `<article class="note${plan.status === 'draft' ? ' draft' : ''}"><p class="eyebrow">Treatment plan · ${escape(plan.status)}${!plan.provider_signed_at ? ' · provider signature not recorded' : ''}</p><h2>${escape(plan.title || 'Treatment plan')}</h2>${clinicalValueHtml({ effectiveDate: plan.effective_date, presentingProblem: plan.presentingProblem || plan.presenting_problem, diagnosis: plan.planDiagnoses?.map(diagnosis => ({ code: diagnosis.icd10_code, description: diagnosis.description, justification: diagnosis.justification })), diagnosticJustification: plan.diagnosticJustification || plan.diagnostic_justification, prescribedFrequency: plan.prescribedFrequency || plan.prescribed_frequency, goals: plan.goals, dischargePlan: plan.dischargePlan || plan.discharge_plan, providerSignedAt: plan.provider_signed_at, supervisorSignedAt: plan.supervisor_signed_at || plan.supervisor_cosigned_at, providerSignoff: plan.providerSignoff, supervisorSignoff: plan.supervisorSignoff, historicalRecordOnFile: plan.legacyRecordOnFile })}</article>`).join('');
  const identity = clinicalValueHtml({ ...clientRecordIdentity(client), ...(!singleDocument ? { prepared: exportedAt, notes: notes.length, treatmentPlans: plans.length } : {}) });
  const legend = singleDocument ? '' : `<p class="record-scope">Approved content includes its signature and amendment history. ${includeDrafts ? 'Unsigned drafts and proposed changes are identified.' : 'Unsigned progress notes and proposed amendments are excluded; treatment plans show their recorded approval state.'} Attachment originals are embedded; supported PDFs and images also follow as appendix pages.</p>`;
  return `<title>${escape(agencyName(agency))} · ${escape(recordTitle)}</title><style>
    html,body{background:#fff!important;color-scheme:light}body{font-family:Arial,Helvetica,sans-serif;color:#25343d;font-size:9pt;line-height:1.3;margin:0}
    *{box-sizing:border-box}h1{font-size:15pt;line-height:1.14;color:${colors.primaryColor};margin:0 0 5px}h2{font-size:11pt;color:${colors.primaryColor};border-bottom:1px solid #cbd5dc;padding-bottom:4px;margin:11px 0 7px}h3{font-size:9.25pt;color:${colors.primaryColor};margin:8px 0 4px}
    .cover{padding:0 0 7px;margin-bottom:5px;border-bottom:1px solid ${colors.accentColor}}.cover h2{font-size:10pt;display:inline-block;margin:0 12px 3px 0;border:0;padding:0}.cover>dl{font-size:8.5pt;margin:2px 0;display:flex;flex-wrap:wrap;gap:3px 18px}.cover>dl>.field{margin:0;display:flex;gap:5px}.cover>dl dd{margin:0}.cover>dl dt{font-weight:normal;color:#52606b}
    .clinical-context{margin:8px 0}.clinical-context>dl{display:block}.clinical-context>dl>.field{display:grid;grid-template-columns:110px 1fr;gap:0 8px;margin:4px 0}.clinical-context>dl>.field>dt{font-size:8.5pt}.clinical-context>dl>.field>dd{margin:0}.clinical-context ol{margin:0;padding-left:15px}.encounter-header{padding:6px 9px;border:1px solid #d1dce2;border-radius:4px;background:#f6f8f9;margin:5px 0 9px}.encounter-header>dl{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 14px}.encounter-header .field{margin:0}.encounter-header dt{font-size:8pt;font-weight:normal;color:#52606b}.encounter-header dd{margin:1px 0 0;font-weight:600}
    .single-document-note>.eyebrow{display:none}.eyebrow{font-size:7.5pt;letter-spacing:.035em;text-transform:uppercase;color:#52606b;margin:3px 0 5px}.note{page-break-before:always}.single-document-note{page-break-before:auto!important}.field{margin:2px 0;min-width:0}.field--wide{grid-column:1/-1}.field--compact>dt,.field--compact>dd{display:inline}.field--compact>dt::after{content:": "}.field--compact>dd{margin:0}.encounter-header .field--compact>dt,.encounter-header .field--compact>dd{display:block}.encounter-header .field--compact>dt::after{content:none}.note-section{margin:11px 0;padding-top:7px;border-top:1px solid #d8e0e5}.note-section>h3{margin:0 0 5px;padding:3px 7px;background:#f2f5f7;border-left:2px solid ${colors.accentColor}}.note-section--mse,.field--mse{font-size:8pt;background:#f6f8f9;border:1px solid #d8e0e5;border-radius:3px;padding:7px;margin-top:10px}.note-section--mse h3,.field--mse>dt{font-size:8.5pt}.field--mse>dd>dl{grid-template-columns:repeat(3,minmax(0,1fr));gap:3px 14px}.structured-responses{margin-top:7px}dt{font-weight:600;color:${colors.primaryColor}}dd{margin:2px 0 0;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 16px;margin:0}dl dl{margin-top:3px}ol{padding-left:18px;margin:3px 0}li{margin-bottom:3px}
    .signatures,.amendment{margin-top:9px;border-top:1px solid #cbd5dc;padding-top:6px}.signatures{font-size:8.5pt;break-inside:avoid}.signatures p{margin:3px 0}.amendment p{margin:4px 0}.draft{border-top:2px solid #936027}.draft>.eyebrow{color:#80551f}p{margin:4px 0}.record-scope{font-size:8pt;color:#52606b;margin-top:6px}.sample-note{font-size:8pt;color:#52606b;margin:2px 0 5px}table{border-collapse:collapse;width:100%;font-size:8.5pt}th,td{text-align:left;border-bottom:1px solid #d1dce6;padding:5px;overflow-wrap:anywhere}summary{font-weight:600;font-size:8.5pt;margin-top:7px}details>dl{margin-top:4px}h1,h2,h3,dt,summary{break-after:avoid}section>dl>.field--wide{break-inside:auto}
  </style><section class="cover"><h1>${escape(recordTitle)}</h1><h2>${escape(clientName)}</h2>${identity}${legend}</section>${body}${diagnoses.length ? `<article class="note"><h2>Diagnosis history</h2>${clinicalValueHtml(diagnoses)}</article>` : ''}${planBody}${singleDocument && !manifest.length ? '' : `<article class="note"><h2>Supporting documents and attachment manifest</h2>${manifest.length ? `<table><thead><tr><th>Document</th><th>Included content</th><th>Integrity</th></tr></thead><tbody>${manifest.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(item.disposition)}</td><td>${item.sha256 ? escape(item.sha256) : escape(item.reason || '')}</td></tr>`).join('')}</tbody></table>` : '<p>No supporting documents were linked to the exported scope.</p>'}</article>`}`;
}

export async function generateClinicalRecordPdf(input, { renderHtml, resolveBrand = async agency => (await import('./packetBrandChrome.service.js')).resolvePacketBrandChrome(agency) } = {}) {
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
  let brand = await resolveBrand(input.agency || {});
  const sourceLogo = [brand?.headerLogoDataUrl, brand?.headerImageDataUrl].find(value => /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(value || '')));
  if (sourceLogo) {
    // Print-sized copy only; uploaded agency artwork remains untouched. Large
    // poster-resolution logos should not inflate every clinical-note download.
    try {
      const { default: sharp } = await import('sharp');
      const buffer = await sharp(Buffer.from(sourceLogo.split(',')[1], 'base64')).resize({ width: 630, height: 102, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      brand = { ...brand, headerLogoDataUrl: `data:image/png;base64,${buffer.toString('base64')}` };
    } catch {
      // A damaged logo must not prevent access to the clinical record. The
      // agency's own name remains the header identity, with no platform fallback.
      brand = { ...brand, headerLogoDataUrl: null, headerImageDataUrl: null };
    }
  }
  const pdfOptions = clinicalRecordPrintOptions({ ...input, brand });
  const bytes = renderHtml ? await renderHtml(html, pdfOptions)
    : await DocumentSigningService.convertHTMLToPDF(html, { ...pdfOptions, disableFallback: true, networkIsolation: true, documentType: 'clinical_medical_record', branding: { agencyId: input.agency?.id } });
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
  pdf.setTitle(`${agencyName(input.agency || {})} — ${input.recordTitle || 'Medical record'}`);
  pdf.setAuthor(agencyName(input.agency || {}));
  pdf.setCreator(agencyName(input.agency || {}));
  pdf.setSubject(`${input.recordType === 'tutoring' ? 'Learning' : 'Clinical'} record with amendment history and original supporting files`);
  return pdf.save();
}
