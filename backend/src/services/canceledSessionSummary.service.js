import User from '../models/User.model.js';

// Call after ordinary appointment authorization. Never return the full signed
// financial/clinical payload merely to explain a retained calendar cancellation.
export async function canceledSessionSummary(appointment, { user = id=>User.findById(id) } = {}) {
  if (!appointment || !/^(canceled|cancelled|late_canceled)(_|$)/.test(String(appointment.status))) return null;
  const actor = appointment.canceledByUserId ? await user(appointment.canceledByUserId) : null;
  const provider = appointment.providerUserId ? await user(appointment.providerUserId) : null;
  const name = u=>[u?.preferred_name || u?.first_name,u?.last_name].filter(Boolean).join(' ');
  const facts = appointment.cancellationRecommendationJson?.facts || {};
  return { actorUserId:appointment.canceledByUserId,actorName:name(actor) || null,providerName:name(provider) || null,
    canceledAt:appointment.canceledAt,reason:facts.clientFacingReason || appointment.cancellationReason || null,
    source:facts.absenceSource || 'individual_session',urgent:facts.urgent === true,feeCents:appointment.cancellationFeeCents,
    nonBillable:true,serviceRendered:false };
}
