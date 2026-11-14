export function enrollmentSourceLabel(source) {
  return ({ PUBLIC_INTAKE_LINK:'Public intake link', PUBLIC_OFFICE_INTAKE:'Office enrollment', PUBLIC_BOOKING_INQUIRY:'Booking inquiry', SCHOOL_UPLOAD:'School paper packet', SCHOOL_UPLOAD_INTERNAL:'School paper packet', ADAPTIVE_QUICK_PROSPECTIVE:'Quick prospective', BULK_IMPORT:'Imported', ADMIN_CREATED:'Added by staff' })[source] || String(source || 'Unknown source').replaceAll('_',' ').toLowerCase();
}
export function enrollmentCareSetting(client) {
  const organization=String(client.organizationType || client.organization_type || '').toLowerCase();
  if (['school','program','learning'].includes(organization)) return organization;
  return client.clientType === 'school' || client.client_type === 'school' ? 'school' : 'office';
}
export function enrollmentIsDemo(client) {
  return [client.isDemo,client.is_demo,client.createdViaDevFill,client.created_via_dev_fill,client.adaptiveMeta?.isDemo].some(value => value === true || value === 1 || value === '1');
}
export function filterEnrollments(clients, {source='',organization='',setting='',demo='exclude'}={}) {
  return clients.filter(client => (!source || client.source === source)
    && (!organization || Number(client.organizationId) === Number(organization))
    && (!setting || enrollmentCareSetting(client) === setting)
    && (demo === 'all' || (demo === 'only' ? enrollmentIsDemo(client) : !enrollmentIsDemo(client))));
}
