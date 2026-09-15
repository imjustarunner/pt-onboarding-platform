/** Company agreements are visible only to that company's admins and PlotTwistCo. */
export function createBusinessLifecycleAccess(getAgencies) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'super_admin') return next();
      if (req.user?.role !== 'admin') return res.status(403).json({ error: { message: 'Company administrator access is required.' } });
      const agencies = await getAgencies(req.user.id);
      if (!agencies.some(a => Number(a.id) === Number(req.params.agencyId))) return res.status(403).json({ error: { message: 'You do not administer this company.' } });
      next();
    } catch (error) { next(error); }
  };
}
