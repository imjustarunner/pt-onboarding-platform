# Champions Counseling: Google Workspace sign-in assessment

Reviewed November 11, 2026. This assessment describes source behavior; it does not establish the live OAuth application's audience or Champions' identity provider. No Google configuration or account was changed by this review.

## What already works

Google SSO is configurable per agency using `googleSsoEnabled`, `googleSsoRequiredRoles`, and `googleSsoAllowedDomains`. The existing agency editor exposes all three controls in `frontend/src/components/admin/AgencyManagement.vue` around lines 1474–1516. Staff, providers, administrators, Clinical Practice Assistants, Provider Plus, and super administrators can be selected; school staff and client/guardian roles are excluded from forced SSO.

`backend/src/controllers/auth.controller.js` resolves the required agency policy around lines 172–219, blocks password login when applicable around line 604, and routes identified existing employees to Google around lines 1393–1446. Forced SSO from any of a user's affiliated agencies currently applies across login slugs.

The platform uses its configured Google OAuth client with `openid`, `email`, and `profile` scopes (`backend/src/services/googleOAuth.service.js`, lines 58–78). Another agency can authenticate its existing Google Workspace identities through this application without PlotTwist administering that agency's Workspace or creating its Google accounts.

## What is missing or needs verification

- **No first-login user provisioning.** The Google callback looks up the signed-in email using `User.findByEmail` and rejects an unknown account (`auth.controller.js`, around lines 1923–1926). It then requires existing agency membership around line 1950. Employees must first have an app record and membership.
- **No signed hosted-domain enforcement.** The callback verifies the ID token, audience, verified email, nonce, and configured email-domain allowlist. It does not examine Google's signed `hd` claim. Google says the email domain alone does not establish that an identity is managed by Workspace; a strict Workspace-only policy needs an approved hosted domain checked against `hd`. See [Google OpenID Connect reference](https://developers.google.com/identity/openid-connect/reference).
- **OAuth audience is an external configuration dependency.** The repository cannot establish whether the live OAuth application's audience is Internal or External. Internal limits authorization to the owning Google organization. Access for Champions requires an appropriately published External application, permitted callback URLs, and any approval required by Champions' Workspace administrator. See [Google audience settings](https://support.google.com/cloud/answer/15549945?hl=en) and [Google OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- **Champions' identity provider is unconfirmed.** Their domain email and public Gmail address do not establish whether their staff use Google Workspace. Keep forced SSO disabled during the demo until the owner confirms the provider and domain.

## Converting temporary provider logins

The current Users editor can change an employee's primary login email while preserving their user ID, provider profile, and relationships. `backend/src/controllers/user.controller.js` around lines 2811–2838 restricts that change to administrators/support and checks for collisions.

Updating only that field is insufficient for a complete demo-to-live conversion:

- `User.findByEmail` also searches `work_email`, `username`, `personal_email`, and `user_login_emails` (`backend/src/models/User.model.js`, around lines 177–264). Reconcile or remove temporary identifiers so they cannot remain valid login aliases.
- `backend/src/utils/passwordLogin.js` explicitly treats `is_demo`, `sso_password_override`, or `login_is_group_email` as password-login accounts. Enabling tenant SSO while retaining one of these flags does not force the converted employee through Google.
- Revoke temporary sessions, invitation tokens, and reset tokens when assigning the actual employee address; retain the existing record ID and approved organization membership.

For an agency using its own Workspace, leave `workspaceProvisioningEnabled` and `managedWorkspaceGroupsEnabled` disabled unless a separate managed-Workspace arrangement is authorized. Those settings govern account/group administration, not ordinary Google sign-in.

## Narrow next steps

1. Use temporary password-based provider accounts for the Champions demonstration and a password-set invitation for the owner.
2. Confirm the real employee addresses and whether Champions uses Google Workspace.
3. Provide one account-claim/conversion operation that collision-checks the confirmed address, reconciles temporary login identifiers, invalidates prior sessions/tokens, and clears demo/password-override flags when enabling SSO.
4. Validate the live OAuth audience and add an explicit signed hosted-domain policy before presenting sign-in as Workspace-only.
5. Test the owner's Google sign-in before requiring it for other staff. Preserve a deliberate owner recovery route.

First-login provisioning can be a later, opt-in agency feature. It should require verified tenant domain ownership, a signed hosted-domain check, explicit invitation or approved-email matching, and a restricted default role. Existing provider profiles should be claimed through invitations rather than inferred from names.
