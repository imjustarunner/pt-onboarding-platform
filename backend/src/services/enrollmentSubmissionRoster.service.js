import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import Client from '../models/Client.model.js';

const defaults = { rows: IntakeSubmissionClient, clients: Client };

export function submittedChildCount(intakeData) {
  const data = typeof intakeData === 'string' ? JSON.parse(intakeData) : intakeData;
  return Math.max(1, (Array.isArray(data?.clients) ? data.clients : [])
    .filter(child => child && (child.fullName || child.firstName || child.clientId || child.id)).length);
}

export function submissionArtifactsComplete(submission, rows, expectedCount) {
  const data = typeof submission.intake_data === 'string' ? JSON.parse(submission.intake_data) : submission.intake_data;
  if (data?.packetGeneration?.status === 'needs_review') return false;
  if (expectedCount === 1 && submission.combined_pdf_path) return true;
  return rows.length >= expectedCount && rows.every(row => Boolean(row.bundle_pdf_path));
}

export async function persistSubmissionRoster(submissionId, clients, deps = defaults) {
  const rows = await deps.rows.listBySubmissionId(submissionId);
  const saved = new Set(rows.map(row => Number(row.client_id)).filter(Boolean));
  for (const client of clients) {
    if (!client?.id || saved.has(Number(client.id))) continue;
    await deps.rows.create({ intakeSubmissionId: submissionId, clientId: client.id,
      fullName: client.full_name || client.initials || '', initials: client.initials || null,
      contactPhone: client.contact_phone || null });
    saved.add(Number(client.id));
  }
}

export async function restoreSubmissionRoster(submission, expectedCount, agencyId, deps = defaults) {
  const rows = await deps.rows.listBySubmissionId(submission.id);
  const ids = [...new Set([...rows.map(row => Number(row.client_id)), Number(submission.client_id)].filter(Boolean))];
  if (!ids.length) return [];
  const clients = await Promise.all(ids.map(id => deps.clients.findById(id, { includeSensitive: true })));
  if (clients.length < expectedCount || clients.some(client => !client || Number(client.agency_id) !== Number(agencyId))) {
    throw Object.assign(new Error('Your saved enrollment needs a care-team review to reconnect all children. Your answers and signatures are saved; please do not start over.'), { status: 409 });
  }
  return clients;
}
