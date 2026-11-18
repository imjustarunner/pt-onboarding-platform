// Clinical PDF rendering has no internet, file:// or script access. Embedded
// agency artwork is resolved by the authorized server before rendering.
export async function isolatePrivatePdfPage(page) {
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', request => /^(?:data:|about:|blob:)/i.test(request.url()) ? request.continue() : request.abort());
}
