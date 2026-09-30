// Keep the existing HQ routes intact. A future dedicated AuricWell deployment
// can use /app without changing practice links or clinical components.
export function auricwellAppBase(hostname = window.location.hostname) {
  return /^(www\.)?auricwell\.com$/i.test(hostname) ? '/app' : '/auricwell/app';
}
export function auricwellWebsiteBase(hostname = window.location.hostname) {
  return /^(www\.)?auricwell\.com$/i.test(hostname) ? '/' : '/auricwell';
}
