# Supervisor Access Phase 2 Threshold

Phase 2 (per-agency capability overrides in `user_agencies`) should only begin when Phase 1 capability hardening cannot satisfy production needs without broad regressions.

## Trigger Criteria

Use all of the following as a go/no-go gate:

1. **Unmet requirement remains after Phase 1 fixes**
   - A validated workflow still fails for users with `has_supervisor_privileges`.
   - Example: user must be admin in agency A and provider/supervisor in agency B with different effective permissions.

2. **Scope cannot be represented with current model**
   - Requirement needs permission differences per agency for the same user.
   - The behavior cannot be safely implemented with global `users.role` + global booleans + assignment scoping.

3. **Regression pressure exceeds safe threshold**
   - Two or more critical workflows for existing roles require exceptions or one-off controller logic.
   - New exceptions increase risk of privilege leakage or inconsistent 403 behavior.

4. **Validation matrix is stable**
   - Current matrix passes for: provider, provider+supervisor capability, supervisor role, admin/support/staff, school_staff.
   - Remaining failures are only those requiring per-agency role/capability separation.

## Phase 2 Objective

Introduce per-agency capability overrides in `user_agencies` (not full multi-role rewrite) and migrate authorization reads to effective per-agency capabilities while keeping backward-compatible global defaults.

