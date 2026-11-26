export const isClientClosureStatus = row => ['inactive','archived','terminated','dead'].includes(String(row?.status_key || row?.statusKey || '').toLowerCase());

export const canOpenClientReactivation = client => !client?.compliance_archived_at
  && !Number(client?.is_demo) && !Number(client?.created_via_dev_fill)
  && ['inactive','terminated'].includes(String(client?.client_status_key || '').toLowerCase());
