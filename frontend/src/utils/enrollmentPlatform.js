// Product identity comes from server entitlements, independently of agency colors.
export function enrollmentPlatform(branding) {
  const product = branding?.enrollmentProduct || branding?.officeProduct;
  if (product === 'auricwell') return { name: 'AuricWell', icon: '/auricwell/mark.svg' };
  if (product === 'schoolcarebridge') return { name: 'SchoolCareBridge', icon: '' };
  return null;
}
