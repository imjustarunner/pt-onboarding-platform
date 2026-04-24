/**
 * Summit Stats Team Challenge permission helpers.
 * provider_plus = Team Manager / Team Lead when assigned to a team by Program Manager.
 * Program Managers (admin) assign provider_plus users as team_manager_user_id on challenge_teams.
 */

/**
 * Check if user can manage a specific team (Team Lead or Program Manager).
 * @param {Object} user - User with id, role
 * @param {Object} team - Team with team_manager_user_id
 * @returns {boolean}
 */
export function canManageTeam(user, team) {
  if (!user || !team) return false;
  const role = String(user?.role || '').toLowerCase();
  // Site-wide admins can manage any team
  if (role === 'admin' || role === 'super_admin') return true;
  // Club managers / assistant managers can manage any team in their club
  if (role === 'club_manager' || role === 'assistant_manager') return true;
  // Any user assigned as the team manager (captain) can manage their own team
  if (team.team_manager_user_id && Number(team.team_manager_user_id) === Number(user.id)) {
    return true;
  }
  return false;
}
