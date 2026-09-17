# Public application CAPTCHA domain correction — September 17, 2026

The ITSCO provider application returned Google's “Invalid domain for site key”
error on `www.itsco.health`. The same application's checkbox rendered on
`app.itsco.health` in a fresh browser. The public intake API confirmed that the
application uses the shared Enterprise checkbox key `newwebappkey`, whose
allowed domains included the app hostname but omitted the public website.

With explicit user approval, the checkbox key in project `ptonboard-dev` was
updated to include the eight public website domains already present on the
score key:

- `itsco.health`
- `nextleveluplcc.com`
- `plottwistco.com`
- `theinnerstrengthinstitute.com`
- `risereviveco.com`
- `mh4kidz.org`
- `mentalrange.org`
- `kimicain.com`

Existing entries, checkbox integration type, challenge preference, and domain
validation were preserved. A separate read confirmed Google saved the update.
This was a live Google configuration change; no application deployment was
needed to apply it.

The immediate browser recheck still showed the old domain error. Google's
[settings documentation](https://developers.google.com/recaptcha/docs/settings)
allows up to 30 minutes for domain changes to take effect; base-domain entries
also cover their subdomains. No application was submitted during verification.

A later fresh-browser check on the same day confirmed the public provider
application on `https://www.itsco.health` displayed “I'm not a robot” with no
domain error or failed CAPTCHA/intake requests. The saved configuration had
propagated successfully. This verifies widget loading, not form submission.

For future public website launches, check both the score key and the checkbox
key selected by `RECAPTCHA_SITE_KEY_INTAKE`, and load an actual public intake
page on the destination hostname. Testing only an `app.` hostname does not
verify the public website's CAPTCHA configuration.

The separately reported editor session-check screen is unrelated to this
Google key configuration.
