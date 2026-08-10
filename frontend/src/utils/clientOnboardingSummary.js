/**
 * Lightweight Client Readiness summary from client list fields (no API).
 * Mirrors staff area gates in clientOnboardingChecklist.service.js.
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

export function formatOnboardingSummary(client) {
  if (!client) return '—';
  if (client?.onboarding?.summary_label) return String(client.onboarding.summary_label);
  if (String(client?.client_status_key || '').toLowerCase() === 'current') return 'Readiness complete';

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

  const day = String(client.service_day || '').trim();
  const isSchool = String(client.client_type || '').toLowerCase() === 'school'
    || !!client.organization_id;
  if (isSchool && !day) open.push('Day');

  if (!client.insurance_type_id && !client.insurance_type_label) open.push('Insurance');

  if (!open.length) {
    if (!client.staff_onboarding_completed_at
      && String(client.client_status_key || '').toLowerCase() !== 'onboarded') {
      return 'Ready to mark staff complete';
    }
    return 'Provider steps';
  }
  return `${open.length} open · ${open.slice(0, 3).join(' · ')}`;
}
