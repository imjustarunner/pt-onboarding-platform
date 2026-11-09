// DOM destinations shared by the hub and its active calendar. Keeping the controls
// in their owning components preserves their permissions and event handlers.
export const scheduleHubContext = Symbol('scheduleHubContext');
