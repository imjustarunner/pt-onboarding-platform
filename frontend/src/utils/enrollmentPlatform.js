// Product identity comes from server entitlements, independently of agency colors.
export function enrollmentPlatform(branding) {
  const product = branding?.enrollmentProduct || branding?.officeProduct;
  if (product === 'auricwell') return { name: 'AuricWell', icon: '/auricwell/mark.svg' };
  if (product === 'schoolcarebridge') return { name: 'SchoolCareBridge', icon: '/assets/schoolcarebridge/logo.png' };
  return null;
}

export function enrollmentPlatforms(branding, language = 'en') {
  const es = language === 'es';
  const items = [];
  if (branding?.schoolCareBridge || branding?.enrollmentProduct === 'schoolcarebridge') {
    items.push({ name: 'SchoolCareBridge', icon: '/assets/schoolcarebridge/logo.png', role: es ? 'Coordinación escolar' : 'School coordination' });
  }
  const platform = enrollmentPlatform(branding);
  if (platform?.name === 'AuricWell') items.push({ ...platform, role: es ? 'Portal clínico' : 'Clinical portal' });
  return items;
}
