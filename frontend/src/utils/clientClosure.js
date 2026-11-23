export const isClientClosureStatus = row => ['inactive','archived','terminated','dead'].includes(String(row?.status_key || row?.statusKey || '').toLowerCase());
