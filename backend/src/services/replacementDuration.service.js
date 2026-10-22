// A replacement keeps its original service/package. Check changed lengths using
// the same rules as booking; never silently change a clinical service code.
export async function validateReplacementDuration(appointment, slot) {
  if (appointment.packageEntitlementId) {
    const BookingPackage = (await import('../models/BookingPackage.model.js')).default;
    const { assertPackageProviderBinding } = await import('./bookingPackagePricing.js');
    const entitlement = await BookingPackage.findEntitlementById(appointment.packageEntitlementId, appointment.agencyId);
    assertPackageProviderBinding(entitlement?.pricingSnapshot, { providerUserId: appointment.providerUserId,
      tenantServiceId: appointment.tenantServiceId, startAt: slot.startAt, endAt: slot.endAt,
      modality: slot.modality, participantMode: 'individual' });
  } else if ((!appointment.businessType || ['mental_health','healthcare'].includes(appointment.businessType))
    && appointment.serviceCode && !(await (await import('./selfPayRates.service.js')).getAgencySelfPayOnly(appointment.agencyId))) {
    const User = (await import('../models/User.model.js')).default;
    const provider = await User.findById(appointment.providerUserId);
    const { validateSchedulingSelection } = await import('./schedulingTaxonomy.service.js');
    await validateSchedulingSelection({ agencyId: appointment.agencyId, providerId: appointment.providerUserId,
      userRole: provider.role, providerCredentialText: provider.credential, appointmentTypeCode: 'SESSION',
      serviceCode: appointment.serviceCode, modality: slot.modality,
      scheduledStartAt: slot.startAt, scheduledEndAt: slot.endAt });
  }
}
