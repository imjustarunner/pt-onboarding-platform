/**
 * Lightweight Client Readiness summary from client list fields (no API).
 * Mirrors staff area gates + fall pending logic in clientOnboardingChecklist.service.js.
 */
import { isPaperPacketClient } from './paperPacketClient.js';
import {
  buildPacketSignatureSummary,
  normalizeOnboardingDocItems
} from './paperPacketDocumentCatalog.js';

function paperPacketDocsNeedAttention(client) {
  if (!isPaperPacketClient(client)) return false;
  const items = normalizeOnboardingDocItems(client?.onboarding_docs_json);
  const packetSignature = buildPacketSignatureSummary(items);
  const roiDoc = items.find((d) => d.key === 'roi') || null;
  const roiDocDone = !roiDoc || roiDoc.done;
  return !(packetSignature.done && roiDocDone);
}

function parseContinuation(client) {
  const raw = client?.continuation_services_json;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasWeekday(client) {
  const day = String(client?.service_day || '').trim();
  if (day && day.toLowerCase() !== 'unknown') return true;
  const pairs = String(client?.provider_day_pairs || '');
  if (pairs && /:(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(pairs)) return true;
  return false;
}

function julyCutoffYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
}

function isReturningSchoolClient(client, now = new Date()) {
  const isSchool = String(client?.client_type || '').toLowerCase() === 'school'
    || !!client?.organization_id;
  if (!isSchool) return false;
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  if (statusKey === 'terminated' || statusKey === 'waitlist') return false;
  if (client?.staff_onboarding_completed_at) return true;
  if (['onboarded', 'current'].includes(statusKey)) return true;
  const sub = client?.submission_date ? String(client.submission_date).slice(0, 10) : '';
  const created = client?.created_at ? String(client.created_at).slice(0, 10) : '';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : created;
  if (anchor && anchor < julyCutoffYmd(now)) return true;
  return false;
}

function continuationDone(data) {
  if (!data?.plan) return false;
  if (data.plan === 'not_continue_school' || data.plan === 'unable_to_contact_parent' || data.plan === 'other') {
    return !!(data.privateComment || data.comment || data.completedAt);
  }
  if (data.plan === 'continue_school') {
    return Array.isArray(data.serviceDays) && data.serviceDays.length > 0;
  }
  return false;
}

export function formatOnboardingSummary(client) {
  if (!client) return '—';
  if (client?.onboarding?.summary_label) return String(client.onboarding.summary_label);

  const statusKey = String(client?.client_status_key || '').toLowerCase();
  const cont = parseContinuation(client);
  const weekday = hasWeekday(client);
  const returning = isReturningSchoolClient(client);

  if (statusKey === 'terminated' || cont?.plan === 'not_continue_school'
    || (cont?.plan === 'other' && cont?.recommendTerminate)
    || (cont?.plan === 'unable_to_contact_parent' && cont?.recommendTerminate)) {
    return 'Terminated';
  }

  if (returning) {
    if (weekday && (statusKey === 'current' || (cont?.plan === 'continue_school' && continuationDone(cont)))) {
      return 'Fall readiness complete';
    }
    if (!weekday || statusKey === 'pending' || statusKey === 'onboarded' || statusKey === 'current') {
      const flagged = cont?.plan === 'unable_to_contact_parent'
        || cont?.plan === 'not_continue_school'
        || (cont?.plan === 'other' && cont?.recommendTerminate);
      if (!weekday || statusKey !== 'current' || !continuationDone(cont)) {
        return flagged ? 'Fall pending · Fall Readiness' : 'Fall pending';
      }
    }
  }

  // Do not treat Current without a weekday as complete.
  if (statusKey === 'current' && weekday) return 'Readiness complete';

  const open = [];
  const paperPacket = isPaperPacketClient(client);
  const pendingRoi = paperPacket && (
    client.paper_packet_staff_roi_pending === true
    || client.paper_packet_staff_roi_pending === 1
    || client.paper_packet_staff_roi_notice === true
  );
  if (pendingRoi) open.push('ROI staff');

  if (paperPacket && paperPacketDocsNeedAttention(client)) {
    open.push('Docs');
  }

  const hasProvider = !!(client.provider_id || client.provider_ids || client.provider_name);
  if (!hasProvider) open.push('Provider');

  const isSchool = String(client.client_type || '').toLowerCase() === 'school'
    || !!client.organization_id;
  if (isSchool && !weekday) open.push('Day');

  if (!client.insurance_type_id && !client.insurance_type_label) open.push('Insurance');

  if (!open.length) {
    if (!client.staff_onboarding_completed_at
      && statusKey !== 'onboarded') {
      return 'Ready to mark staff complete';
    }
    return 'Provider steps';
  }
  return `${open.length} open · ${open.slice(0, 3).join(' · ')}`;
}
