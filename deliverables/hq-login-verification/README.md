# HQ Login

HQ-only login presentation based on the supplied light and dark references. Device color scheme is applied in CSS, including live changes, independently of a saved dashboard appearance preference. The existing account identification, password, Google SSO, and recovery handlers remain in LoginView.

Browser verification uses mocked API responses and synthetic credentials. No authenticated production data is used. Run from the repository root with a local Vite server:

```sh
HQ_PREVIEW_URL=http://127.0.0.1:5188 node frontend/scripts/verify-hq-login.mjs
```

Background asset: `frontend/public/branding/hq-login-ribbons.png`. Generated with the built-in image generation tool; existing PlotTwistCo logo artwork is reused unchanged.

Google button mark: `frontend/public/branding/google-g.png`, downloaded unchanged from `https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png`.

Generation prompt: Generate a production website background bitmap, landscape 1536x1024. Abstract PlotTwistHQ red and charcoal visual direction: nearly black clean charcoal background with elegant fine scarlet red diagonal ribbon lines sweeping upward from lower left to upper right, very restrained glow along those lines at outer edges. Broad empty clean dark upper-left and center-right areas for live HTML headline and login form. Crisp subtle fabric-like fine line texture only near lower edges. No orbs, no bokeh, no purple, no blue, no brown. No text, no logos, no forms, no dashboard, no frames. This will be full bleed behind a real login UI; keep the background subtle and high readability.
