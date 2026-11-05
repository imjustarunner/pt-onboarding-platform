const holders = new Set();

export function claimClientAlertPopup(clientId) {
  const key = Number(clientId || 0);
  if (!key || holders.has(key)) return false;
  holders.add(key);
  return true;
}

export function releaseClientAlertPopup(clientId) {
  holders.delete(Number(clientId || 0));
}
