/**
 * ADP Payroll Export Service (stub)
 *
 * ADP integrations vary by product (Workforce Now, Vantage, etc.) and require
 * OAuth + tenant-specific configuration. This service is intentionally small and
 * pluggable so we can wire to the correct ADP API once credentials are available.
 */

class AdpPayrollService {
  static isConfigured() {
    // Placeholder config contract. We'll adjust keys once you confirm which ADP product/API.
    return !!process.env.ADP_API_BASE_URL && !!process.env.ADP_CLIENT_ID && !!process.env.ADP_CLIENT_SECRET;
  }

  static async exportPeriod(/* { agencyId, payrollPeriodId, summaries } */) {
    if (!this.isConfigured()) {
      const err = new Error('ADP export is not configured (missing ADP_API_BASE_URL / ADP_CLIENT_ID / ADP_CLIENT_SECRET)');
      err.code = 'ADP_NOT_CONFIGURED';
      throw err;
    }

    // Intentionally not implemented until we confirm ADP endpoint + required payload shape.
    const err = new Error('ADP export is not implemented yet for this environment');
    err.code = 'ADP_NOT_IMPLEMENTED';
    throw err;
  }
}

export default AdpPayrollService;

