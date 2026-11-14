export function filterClientDemos(clients, mode) {
  if (!['only','exclude'].includes(mode)) return clients;
  return clients.filter(client => {
    const demo=Number(client.is_demo)===1 || Number(client.created_via_dev_fill)===1;
    return mode==='only' ? demo : !demo;
  });
}
