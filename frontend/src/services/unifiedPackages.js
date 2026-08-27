import api from './api';

/**
 * Unified booking package catalog (tenant + program scoped).
 */
export async function listPackages(agencyId, params = {}) {
  const { data } = await api.get(`/tenant-booking/agencies/${agencyId}/packages`, {
    params: { ensureSuites: 'false', ...params }
  });
  return data?.packages || [];
}

export async function createPackage(agencyId, payload) {
  const { data } = await api.post(`/tenant-booking/agencies/${agencyId}/packages`, payload);
  return data?.package;
}

export async function updatePackage(agencyId, packageId, payload) {
  const { data } = await api.patch(`/tenant-booking/agencies/${agencyId}/packages/${packageId}`, payload);
  return data?.package;
}

export async function duplicatePackage(agencyId, packageId, payload = {}) {
  const { data } = await api.post(
    `/tenant-booking/agencies/${agencyId}/packages/${packageId}/duplicate`,
    payload
  );
  return data?.package;
}

export async function listClientEntitlements(agencyId, clientId, params = {}) {
  const { data } = await api.get(
    `/tenant-booking/agencies/${agencyId}/clients/${clientId}/entitlements`,
    { params }
  );
  return data;
}

export async function activateEntitlement(agencyId, payload) {
  const { data } = await api.post(`/tenant-booking/agencies/${agencyId}/entitlements`, payload);
  return data?.entitlement;
}

export async function checkoutPackage(agencyId, packageId, payload) {
  const { data } = await api.post(
    `/tenant-booking/agencies/${agencyId}/packages/${packageId}/checkout`,
    payload
  );
  return data;
}

export async function confirmPackageCheckout(agencyId, packageId, payload) {
  const { data } = await api.post(
    `/tenant-booking/agencies/${agencyId}/packages/${packageId}/confirm`,
    payload
  );
  return data;
}

export async function listProgramPackages(classId, params = {}) {
  const { data } = await api.get(`/learning-program-classes/${classId}/packages`, { params });
  return data;
}

export async function listGuardianPackages(clientId, params = {}) {
  const { data } = await api.get(`/tutoring-learning-os/clients/${clientId}/packages`, { params });
  return data;
}

export async function listGuardianEntitlements(clientId, params = {}) {
  const { data } = await api.get(`/tutoring-learning-os/clients/${clientId}/package-entitlements`, {
    params
  });
  return data;
}

export async function checkoutGuardianPackage(clientId, packageId, payload = {}) {
  const { data } = await api.post(
    `/tutoring-learning-os/clients/${clientId}/packages/${packageId}/checkout`,
    payload
  );
  return data;
}

export async function confirmGuardianPackage(clientId, packageId, payload = {}) {
  const { data } = await api.post(
    `/tutoring-learning-os/clients/${clientId}/packages/${packageId}/confirm`,
    payload
  );
  return data;
}

export function formatMoney(cents) {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

export default {
  listPackages,
  createPackage,
  updatePackage,
  duplicatePackage,
  listClientEntitlements,
  activateEntitlement,
  checkoutPackage,
  confirmPackageCheckout,
  listProgramPackages,
  listGuardianPackages,
  listGuardianEntitlements,
  checkoutGuardianPackage,
  confirmGuardianPackage,
  formatMoney
};
