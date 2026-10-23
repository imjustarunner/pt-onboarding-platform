import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

/** Render only internally generated, escaped report HTML. No remote resources. */
export async function renderExchangeAuditPdf(html) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || [
    '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(path => existsSync(path));
  let browser;
  try {
    browser = await puppeteer.launch({
      ...(executablePath ? {executablePath} : {}), headless:'new', timeout:30000,
      args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent(html, {waitUntil:'load', timeout:15000});
    return Buffer.from(await page.pdf({
      format:'Letter', landscape:true, printBackground:true, timeout:30000,
      margin:{top:'0.45in',right:'0.5in',bottom:'0.55in',left:'0.5in'},
      displayHeaderFooter:true, headerTemplate:'<div></div>',
      footerTemplate:'<div style="width:100%;font-family:Arial;font-size:9px;color:#526475;padding:0 36px;display:flex;justify-content:space-between"><span>Client Exchange · Internal support report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
    }));
  } finally {
    await browser?.close();
  }
}
