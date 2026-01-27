/**
 * Central registry of per-route tutorial tours.
 *
 * NOTE: Kept intentionally small and known-safe: if a tour isn't found,
 * the app should behave normally.
 */

import dashboardTour from './tours/dashboard.tour';
import tasksTour from './tours/tasks.tour';

export const getTourForRoute = (route) => {
  const name = String(route?.name || '');
  if (!name) return null;

  const byRouteName = {
    Dashboard: dashboardTour,
    OrganizationDashboard: dashboardTour,
    Tasks: tasksTour,
    OrganizationTasks: tasksTour
  };

  return byRouteName[name] || null;
};

