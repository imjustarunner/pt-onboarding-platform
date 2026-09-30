# Employee group email readiness

Creating a Workspace Group and app inbox did not register a Gmail Send mail as identity on the shared transport. Sender verification correctly rejected those incomplete configurations before sending.

Group username provisioning now ensures the app inbox and accepted Gmail sender before returning success. Personal replies remain addressed to the employee's group. A partially completed setup can resume using the same persisted work address; it cannot replace an existing username, reuse a non-group account, create a duplicate group, or reset an already prepared password.

Before User.updateStatus saves ACTIVE_EMPLOYEE for a group-email employee, it verifies the Workspace group and ensures an accepted Gmail sender. This covers hires whose group was created before this change. Missing groups, pending verification, and Gmail failures prevent the activation write. Onboarding prerequisites remain enforced first. Non-group employees retain their existing activation behavior.

Validation: 216 hire tests and 241 messaging tests pass, including new provisioning, interrupted setup/retry, pending or mismatched sender identities, preserved passwords, and activation blocked before any status write on failure.

## Production repair and authorized resend

Paige Tayloe's existing agency-2 group sender (identity 541) was missing from Gmail Send mail as. Confirmed active app ownership and the existing Workspace group before creating the sender. A separate Gmail lookup confirmed accepted verification and the correct reply address.

The user explicitly authorized retrying her failed emails. Three distinct outbound messages (2335, 2358, 3128) had definitive pre-send verification failures, no delivery IDs, and no successful duplicate in the audited message records. Requeued those exact records through the normal app worker with original recipients/content. All three were recorded sent with delivery IDs at 2026-09-30 21:07:33–36 UTC; communication records 1570–1572 also report sent without errors. This confirms sending, not recipient opens. Historical failure audit records are preserved.
