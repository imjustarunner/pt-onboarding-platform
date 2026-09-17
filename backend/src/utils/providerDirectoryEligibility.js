// Directory participation never grants application permissions or online booking enrollment.
export const PROVIDER_DIRECTORY_ROLES = ['provider','provider_plus','intern','intern_plus','facilitator','supervisor','admin','super_admin'];
export const seesClients = person => ![false, 0, '0'].includes(person?.sees_clients ?? person?.seesClients ?? true);
export function isDirectoryProvider(person, {assigned=false, enrolled=false}={}) {
 return seesClients(person) && (assigned || enrolled || PROVIDER_DIRECTORY_ROLES.includes(String(person?.role || '').toLowerCase()) || [true,1,'1'].includes(person?.has_provider_access));
}
