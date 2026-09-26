// Booking intent belongs to the appointment editor, not the calendar filter.
export function appointmentOfficeId(editorId, toolbarId) {
  const id = Number(editorId) > 0 ? Number(editorId) : Number(toolbarId);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}
export function officesForAgency(rows, agencyId) {
  const aid=Number(agencyId);
  return (rows || []).filter(row => Number(row.is_active ?? row.isActive ?? 1)!==0 && (!aid || [Number(row.agency_id || row.agencyId),...(row.agencyIds || []).map(Number)].includes(aid)));
}
export function defaultAppointmentServiceLocation(rows, modality, officeId) {
  const locations=rows || [];
  if(modality==='TELEHEALTH')return locations.find(l=>['02','10'].includes(String(l.placeOfService || l.place_of_service))) || null;
  const physical=locations.filter(l=>String(l.placeOfService || l.place_of_service)==='11');
  if(Number(officeId)>0)return physical.find(l=>Number(l.billingOfficeLocationId || l.billing_office_location_id || l.officeLocationId)===Number(officeId)) || null;
  return physical.length===1 && !Number(physical[0].billingOfficeLocationId || physical[0].billing_office_location_id) ? physical[0] : null;
}
