#!/usr/bin/env node
/**
 * Browser smoke test for PTOnboardingApp supervision workflow.
 * Run: node smoke-test-supervision.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const TIMEOUT = 15000;

const results = {
  reachability: null,
  authBlocker: null,
  checks: [],
  uiRegressions: [],
  nextAction: null
};

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);

    // 1. Reachability
    try {
      const resp = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const status = resp?.status() ?? 0;
      if (status >= 200 && status < 400) {
        results.reachability = { status: 'PASS', evidence: `HTTP ${status} at ${BASE_URL}` };
      } else {
        results.reachability = { status: 'FAIL', evidence: `HTTP ${status} at ${BASE_URL}` };
      }
    } catch (e) {
      results.reachability = { status: 'FAIL', evidence: e.message || 'Could not reach app' };
      console.log(JSON.stringify(results, null, 2));
      await browser.close();
      return;
    }

    // 2. Auth check - look for login redirect or login form
    await page.waitForLoadState('networkidle').catch(() => {});
    const url = page.url();
    const hasLoginForm = await page.locator('input[type="password"], input[name="password"], [data-testid="login"], form[action*="login"]').count() > 0;
    const hasLoginText = await page.locator('text=/sign in|log in|login/i').count() > 0;
    const isLoginPage = url.includes('login') || url.includes('auth') || hasLoginForm || hasLoginText;

    if (isLoginPage || !url.includes('localhost')) {
      results.authBlocker = {
        status: 'BLOCKED',
        evidence: `Redirected to auth or external URL. Current URL: ${url}. Login form present: ${hasLoginForm || hasLoginText}`
      };
      results.nextAction = 'Provide valid credentials or use existing session cookie to proceed past login.';
    } else {
      results.authBlocker = { status: 'PASS', evidence: 'No login redirect; session may be active' };
    }

    // 3. If we have a session, navigate to supervision areas
    if (results.authBlocker.status !== 'BLOCKED') {
      // Try common org slug patterns - app often redirects to /{slug}/dashboard
      const currentPath = new URL(url).pathname;
      let orgSlug = null;
      const slugMatch = currentPath.match(/^\/([^/]+)\//);
      if (slugMatch) orgSlug = slugMatch[1];
      if (!orgSlug && currentPath === '/') {
        // May be on root - try /dashboard (router may resolve slug)
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        const afterPath = new URL(page.url()).pathname;
        const m = afterPath.match(/^\/([^/]+)\//);
        if (m) orgSlug = m[1];
      }
      const slug = orgSlug || 'demo'; // fallback

      // Check 3a: Dashboard supervision area (Supervision button / modal entry)
      try {
        const dashUrl = orgSlug ? `${BASE_URL}/${slug}/dashboard` : `${BASE_URL}/dashboard`;
        await page.goto(dashUrl, { waitUntil: 'domcontentloaded' });
        const supvBtn = page.locator('button:has-text("Supervision"), button:has-text("View supervisees"), .stat-card-button:has-text("Supervision")');
        const hasSupvBtn = await supvBtn.first().isVisible().catch(() => false);
        if (hasSupvBtn) {
          results.checks.push({ id: 'dashboard-supervision', status: 'PASS', evidence: 'Supervision button/area visible on dashboard' });
        } else {
          results.checks.push({ id: 'dashboard-supervision', status: 'FAIL', evidence: 'Supervision button not found (may require supervisor role)' });
        }
      } catch (e) {
        results.checks.push({ id: 'dashboard-supervision', status: 'BLOCKED', evidence: e.message });
      }

      // Check 3b: Supervision modal - Recent sessions (Submit session, Mark missed, Export CSV)
      try {
        const supvBtn = page.locator('button:has-text("Supervision"), button:has-text("View supervisees"), .stat-card-button:has-text("Supervision")');
        if (await supvBtn.first().isVisible().catch(() => false)) {
          await supvBtn.first().click();
          await page.waitForTimeout(1500);
          const recentH4 = page.locator('h4:has-text("Recent sessions")');
          const exportCsv = page.locator('button:has-text("Export CSV")');
          const submitSession = page.locator('button:has-text("Submit session")');
          const markMissed = page.locator('button:has-text("Mark missed")');
          const hasRecent = await recentH4.first().isVisible().catch(() => false);
          const hasExport = await exportCsv.first().isVisible().catch(() => false);
          const hasSubmit = await submitSession.first().isVisible().catch(() => false);
          const hasMarkMissed = await markMissed.first().isVisible().catch(() => false);
          const found = [hasRecent && 'Recent sessions', hasExport && 'Export CSV', (hasSubmit || hasMarkMissed) && '(Submit/Mark missed)'].filter(Boolean);
          if (found.length >= 2) {
            results.checks.push({ id: 'supervision-modal-history', status: 'PASS', evidence: `Found: ${found.join(', ')}` });
          } else {
            results.checks.push({ id: 'supervision-modal-history', status: 'FAIL', evidence: `Partial: recent=${hasRecent}, export=${hasExport}, submit=${hasSubmit}, markMissed=${hasMarkMissed}` });
          }
        } else {
          results.checks.push({ id: 'supervision-modal-history', status: 'BLOCKED', evidence: 'Could not open supervision modal (no Supervision button)' });
        }
      } catch (e) {
        results.checks.push({ id: 'supervision-modal-history', status: 'BLOCKED', evidence: e.message });
      }

      // Check 3c: Payroll supervision attendance modal (Export CSV)
      try {
        const payrollUrl = orgSlug ? `${BASE_URL}/${slug}/admin/payroll` : `${BASE_URL}/admin/payroll`;
        await page.goto(payrollUrl, { waitUntil: 'domcontentloaded' });
        // Look for "Supervision attendance" button - may be in a stage modal or card
        const supvAttBtn = page.locator('button:has-text("Supervision attendance")');
        const hasBtn = await supvAttBtn.first().isVisible().catch(() => false);
        if (hasBtn) {
          await supvAttBtn.first().click();
          await page.waitForTimeout(1500);
          const modalTitle = page.locator('text=Supervision attendance & pay');
          const modalExport = page.locator('.modal-backdrop button:has-text("Export CSV")');
          const hasModal = await modalTitle.first().isVisible().catch(() => false);
          const hasModalExport = await modalExport.first().isVisible().catch(() => false);
          if (hasModal && hasModalExport) {
            results.checks.push({ id: 'payroll-supervision-modal', status: 'PASS', evidence: 'Supervision attendance modal with Export CSV visible' });
          } else {
            results.checks.push({ id: 'payroll-supervision-modal', status: 'FAIL', evidence: `Modal: ${hasModal}, Export CSV: ${hasModalExport}` });
          }
        } else {
          results.checks.push({ id: 'payroll-supervision-modal', status: 'BLOCKED', evidence: 'Supervision attendance button not found (may need pay period selected or admin role)' });
        }
      } catch (e) {
        results.checks.push({ id: 'payroll-supervision-modal', status: 'BLOCKED', evidence: e.message });
      }
    } else {
      results.checks = [
        { id: 'dashboard-supervision', status: 'BLOCKED', evidence: 'Auth required' },
        { id: 'supervision-modal-history', status: 'BLOCKED', evidence: 'Auth required' },
        { id: 'payroll-supervision-modal', status: 'BLOCKED', evidence: 'Auth required' }
      ];
    }

  } catch (e) {
    results.reachability = results.reachability || { status: 'FAIL', evidence: e.message };
  } finally {
    if (browser) await browser.close();
  }

  // Output report
  console.log('\n=== PTOnboardingApp Supervision Smoke Test Report ===\n');
  console.log('Reachability:', results.reachability?.status, '-', results.reachability?.evidence);
  console.log('Auth blocker:', results.authBlocker?.status, '-', results.authBlocker?.evidence);
  console.log('\nChecklist:');
  console.table(results.checks.map(c => ({ Check: c.id, Status: c.status, Evidence: c.evidence })));
  if (results.uiRegressions?.length) console.log('\nUI regressions:', results.uiRegressions);
  if (results.nextAction) console.log('\nNext action:', results.nextAction);
  console.log('\n');
}

main().catch(console.error);
