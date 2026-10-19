import express from "express";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
const app = express(),
  root = path.dirname(fileURLToPath(import.meta.url));
const upstream = process.env.AURICWELL_API_UPSTREAM;
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(self), microphone=(self)",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.stripe.com https://*.tokbox.com wss://*.tokbox.com https://*.opentok.com wss://*.opentok.com https://*.vonage.com wss://*.vonage.com; frame-src https://js.stripe.com https://hooks.stripe.com; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  });
  if (process.env.NODE_ENV === "production")
    res.set("Strict-Transport-Security", "max-age=31536000");
  next();
});
// Stream the signed callback unchanged: parsing/re-serializing here would break
// signature verification in the API service.
app.use(["/api/auricwell", "/api/auricwell-sms/webhook"], (req, res) => {
  if (!upstream)
    return res
      .status(503)
      .json({
        error: { message: "AuricWell API upstream is not configured." },
      });
  const url = new URL(req.originalUrl, upstream);
  const headers = { ...req.headers, host: url.host };
  headers["x-forwarded-for"] = req.ip;
  delete headers["x-forwarded-host"];
  const proxy = (url.protocol === "https:" ? https : http).request(
    url,
    { method: req.method, headers, timeout: 60000 },
    (response) => {
      res.status(response.statusCode);
      for (const [key, value] of Object.entries(response.headers))
        if (value != null) res.setHeader(key, value);
      response.pipe(res);
    },
  );
  proxy.on("timeout", () => proxy.destroy());
  proxy.on("error", () => {
    if (!res.headersSent)
      res
        .status(502)
        .json({ error: { message: "AuricWell is temporarily unavailable." } });
    else res.end();
  });
  req.on("aborted", () => proxy.destroy());
  req.pipe(proxy);
});
app.get("/robots.txt", (_req, res) =>
  res.type("text").send("User-agent: *\nDisallow: /app\nDisallow: /api/\nDisallow: /join/\nDisallow: /platform/\n"),
);
app.use(["/app", "/join", "/platform", "/account"], (_req, res, next) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  next();
});
// Public policies are generated from the same source used by the practice portals.
for (const [type, aliases] of Object.entries({privacypolicy:['privacy','privacy-policy'],terms:[],platformhipaa:['hipaa']})) {
  app.get([`/auricwell/${type}`,`/${type}`,...aliases.map(alias=>`/${alias}`)], (_req,res)=>
    res.type('html').sendFile(path.join(root,'dist','legal',`${type}.html`)));
}
app.use(express.static(path.join(root, "dist"), { index: false }));
app.get("*", (_req, res) => res.sendFile(path.join(root, "dist/index.html")));
app.listen(Number(process.env.PORT || 8080), "0.0.0.0");
