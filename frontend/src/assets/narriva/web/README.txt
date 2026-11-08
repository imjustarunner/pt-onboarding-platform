Narriva marketing derivatives

These WebP files are resized format derivatives of the original PNG assets in
the parent directory. They retain the supplied design; no new marks, people or
clinical imagery were generated. The original app assets remain unchanged.

Only the dedicated AuricWell website build uses these files, through
frontend/scripts/narriva-website-assets.mjs. App/demo production builds continue
to use the canonical Narriva brand configuration and original assets.

Recreate with cwebp:
  cwebp -quiet -q 90 -resize WIDTH 0 ../NAME.png -o NAME.webp
WIDTH=160 for icon-navy, verified, not-verified; WIDTH=640 for other marks.

The eight derivatives total approximately 160 KiB. Their purpose is to keep the
public interactive website from embedding about 5 MiB of full-size app graphics.
