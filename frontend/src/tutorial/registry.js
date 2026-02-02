/**
 * Central registry of per-route tutorial tours.
 *
 * NOTE: Kept intentionally small and known-safe: if a tour isn't found,
 * the app should behave normally.
 */

import dashboardTour from './tours/dashboard.tour';
import tasksTour from './tours/tasks.tour';
import scheduleHubTour from './tours/scheduleHub.tour';
import myScheduleTour from './tours/mySchedule.tour';
import schoolProviderProfileTour from './tours/schoolProviderProfile.tour';
import staffScheduleCompareTour from './tours/staffScheduleCompare.tour';
import buildingsShellTour from './tours/buildingsShell.tour';
import buildingsScheduleTour from './tours/buildingsSchedule.tour';
import buildingsReviewTour from './tours/buildingsReview.tour';
import buildingsSettingsTour from './tours/buildingsSettings.tour';
import communicationsFeedTour from './tours/communicationsFeed.tour';
import notificationsTour from './tours/notifications.tour';
import platformChatsTour from './tours/platformChats.tour';
import communicationThreadTour from './tours/communicationThread.tour';
import supportTicketsQueueTour from './tours/supportTicketsQueue.tour';
import providerAvailabilityDashboardTour from './tours/providerAvailabilityDashboard.tour';
import userProfileTour from './tours/userProfile.tour';
import payrollTour from './tours/payroll.tour';
import expensesTour from './tours/expenses.tour';
import payrollReportsTour from './tours/payrollReports.tour';
import hiringCandidatesTour from './tours/hiringCandidates.tour';
import userManagerTour from './tours/userManager.tour';
import notificationsHubTour from './tours/notificationsHub.tour';
import teamNotificationsTour from './tours/teamNotifications.tour';
import clientManagementTour from './tours/clientManagement.tour';
import providerDirectoryTour from './tours/providerDirectory.tour';
import schoolsOverviewTour from './tours/schoolsOverview.tour';

export const getTourForRoute = (route) => {
  const name = String(route?.name || '');
  if (!name) return null;

  // Dashboard has multiple major panels; provide a focused tour when the schedule tab is open.
  const tab = String(route?.query?.tab || '');
  if ((name === 'Dashboard' || name === 'OrganizationDashboard') && tab === 'my_schedule') {
    return myScheduleTour;
  }

  const byRouteName = {
    Dashboard: dashboardTour,
    OrganizationDashboard: dashboardTour,
    Tasks: tasksTour,
    OrganizationTasks: tasksTour,
    OrganizationScheduleHub: scheduleHubTour,
    OrganizationSchoolProviderProfile: schoolProviderProfileTour,
    StaffScheduleCompare: staffScheduleCompareTour,
    OrganizationStaffScheduleCompare: staffScheduleCompareTour,
    Buildings: buildingsShellTour,
    OrganizationBuildings: buildingsShellTour,
    BuildingsSchedule: buildingsScheduleTour,
    OrganizationBuildingsSchedule: buildingsScheduleTour,
    BuildingsReview: buildingsReviewTour,
    OrganizationBuildingsReview: buildingsReviewTour,
    BuildingsSettings: buildingsSettingsTour,
    OrganizationBuildingsSettings: buildingsSettingsTour,
    CommunicationsFeed: communicationsFeedTour,
    OrganizationCommunicationsFeed: communicationsFeedTour,
    PlatformChats: platformChatsTour,
    OrganizationPlatformChats: platformChatsTour,
    CommunicationThread: communicationThreadTour,
    OrganizationCommunicationThread: communicationThreadTour,
    SupportTicketsQueue: supportTicketsQueueTour,
    ProviderAvailabilityDashboard: providerAvailabilityDashboardTour,
    OrganizationProviderAvailabilityDashboard: providerAvailabilityDashboardTour,
    UserProfile: userProfileTour,
    OrganizationUserProfile: userProfileTour,
    Payroll: payrollTour,
    OrganizationPayroll: payrollTour,
    PayrollReports: payrollReportsTour,
    OrganizationPayrollReports: payrollReportsTour,
    Expenses: expensesTour,
    OrganizationExpenses: expensesTour,
    HiringCandidates: hiringCandidatesTour,
    OrganizationHiringCandidates: hiringCandidatesTour,
    UserManager: userManagerTour,
    OrganizationUserManager: userManagerTour,
    ClientManagement: clientManagementTour,
    OrganizationClientManagement: clientManagementTour,
    SupervisorNotifications: notificationsHubTour,
    OrganizationSupervisorNotifications: notificationsHubTour,
    TeamNotifications: teamNotificationsTour,
    OrganizationTeamNotifications: teamNotificationsTour,
    ProviderDirectory: providerDirectoryTour,
    OrganizationProviderDirectory: providerDirectoryTour,
    SchoolOverviewDashboard: schoolsOverviewTour,
    OrganizationSchoolOverviewDashboard: schoolsOverviewTour,
    Notifications: notificationsTour,
    OrganizationNotifications: notificationsTour
  };

  return byRouteName[name] || null;
};

