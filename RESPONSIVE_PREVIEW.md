# Responsive preview workflow (mobile/tablet/desktop)

This repo supports **two complementary ways** to validate mobile + tablet layouts while building.

## 1) In-app preview (Super Admin only)

If you are logged in as `super_admin`:

- Go to **Admin → Settings → System → Viewport Preview**
- Choose **Desktop**, **Tablet**, or **Mobile**

What it does:

- Constrains the app width to simulate the chosen device size
- Forces **hamburger-only navigation** in Tablet/Mobile preview
- Persists the selection in your browser (`localStorage`) so it stays enabled while you work

## 2) Browser responsive mode (recommended during development)

Use your browser’s responsive tools to validate breakpoints and CSS behavior.

### Chrome (recommended)

- Open DevTools → click the **Toggle device toolbar** (phone/tablet icon)
- Pick a device preset, or set custom widths
- Test both portrait + landscape
- Test with throttling if performance is a concern

### Safari (best for iOS quirks)

- Enable Develop menu: Safari → Settings → Advanced → “Show features for web developers”
- Use **Responsive Design Mode**
- Use **Web Inspector** to debug iOS-specific layout issues

## 3) Real device verification (required before shipping)

Responsive tools catch most issues, but real devices catch the rest (touch/scroll, viewport quirks, keyboard, safe areas, etc.).

- Open the internet URL on an actual phone/tablet
- Test:
  - Navigation (hamburger open/close)
  - Forms + input fields (keyboard + scrolling)
  - Document signing flows
  - External links (e.g., Google Meet/event links)

