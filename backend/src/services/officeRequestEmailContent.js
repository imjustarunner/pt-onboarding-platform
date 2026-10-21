import { emailActionButton } from "../utils/emailActionButton.js";

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (value) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
const hour = (value) =>
  `${Number(value) % 12 || 12}:00 ${Number(value) % 24 < 12 ? "AM" : "PM"}`;
export function officeReviewUrl(base, item) {
  const q = new URLSearchParams({ approvals: "1", request: item.key });
  if (item.officeId) q.set("officeId", String(item.officeId));
  if (item.startDate) q.set("weekStart", item.startDate);
  return `${base}/buildings/schedule?${q}`;
}
export function buildOfficeRequestEmail({ kind, items, base, name }) {
  const review = kind === "review";
  const allApproved = items.every((i) => i.action === "approve");
  const title = review
    ? "Office requests ready for review"
    : allApproved
      ? "Your office requests are approved"
      : "Your office request updates";
  const intro = review
    ? "Review the requested times, available rooms, and conflicts in Building Master. You can approve, deny, or choose another available room."
    : "Here are your office reservation decisions, together in one update.";
  const sections = items.map((item) => {
    const lines = [
      ...(review
        ? [item.providerName]
        : [item.action === "approve" ? "Approved" : "Not approved"]),
      [
        item.officeName || "Office preferences",
        item.roomLabel || "Room to be selected",
      ].join(" · "),
      item.address,
      item.startDate
        ? `${item.recurrence === "ONCE" ? "" : "Starting "}${date(item.startDate)}`
        : "Date to be confirmed",
      `${(item.slots || []).map((s) => `${hour(s.startHour)}–${hour(s.endHour)}`).join(", ")} (${item.timezone})`,
      item.frequencyLabel,
      item.lastDate ? `Last reserved date: ${date(item.lastDate)}` : "",
      item.comment ? `Approver note: ${item.comment}` : "",
    ].filter(Boolean);
    if (review) {
      lines.push(
        item.clientLinked
          ? "A session is attached to this request. Review its details in the app."
          : "Office reservation request; no attached session.",
      );
    } else if (item.action === "approve") {
      if (item.sessions?.length) {
        lines.push(
          `Confirmed: ${item.sessions.length} attached session${item.sessions.length === 1 ? "" : "s"} with this office reservation.`,
        );
        const format = (raw) =>
          new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: item.timezone,
          }).format(new Date(raw));
        lines.push(
          ...item.sessions
            .slice(0, 3)
            .map((s) => `${format(s.start)} – ${format(s.end)}`),
        );
        if (item.sessions.length > 3)
          lines.push("All confirmed dates are in My Schedule.");
      } else if (item.clientLinked)
        lines.push(
          "Your office is approved. The attached session has not been confirmed in the app; please review My Schedule before relying on a session confirmation.",
        );
      else
        lines.push(
          "You may now schedule sessions in this office during the approved times. Continue using your current scheduling system until app session booking is enabled for you.",
        );
    }
    if (item.photoAttached)
      lines.push(`Office photo attached: ${item.photoAttached}`);
    const url = review
      ? officeReviewUrl(base, item)
      : `${base}/my-schedule?date=${encodeURIComponent(item.startDate || "")}`;
    return {
      text: `${lines.join("\n")}\n${review ? "Review in Building Master" : "Open My Schedule"}: ${url}`,
      html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border:1px solid #dce8e1;border-radius:14px;background:#f4f8f5"><tr><td style="padding:20px">${lines.map((s, i) => `<p style="margin:0 0 10px;${i < 2 ? "font-weight:bold;font-size:18px;" : ""}">${esc(s)}</p>`).join("")}${emailActionButton(review ? "Review in Building Master" : "Open My Schedule", url, true)}</td></tr></table>`,
    };
  });
  return {
    subject: `${review ? "Office approval needed" : allApproved ? "Office approved" : "Office request update"} · ${items.length} request${items.length === 1 ? "" : "s"}`,
    text: `Hello ${name || "there"},\n\n${title}\n${intro}\n\n${sections.map((s) => s.text).join("\n\n")}`,
    html: `<div style="font-family:Arial,sans-serif;color:#203b32;font-size:16px;line-height:1.55;padding:20px;max-width:640px;margin:auto"><p>Hello ${esc(name || "there")},</p><h1 style="font-size:28px;line-height:1.2;color:#175d43">${esc(title)}</h1><p>${esc(intro)}</p>${sections.map((s) => s.html).join("")}</div>`,
  };
}
