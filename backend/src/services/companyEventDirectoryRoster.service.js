import pool from '../config/database.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  loadCompanyEventDirectoryCounts,
  loadCompanyEventDirectoryStaff
} from './companyEventDirectoryCounts.service.js';

function clientInitials(row) {
  const initials = String(row?.initials || '').trim();
  if (initials) return initials;
  const code = String(row?.identifier_code || '').trim();
  if (code) return code;
  return '?';
}

function formatHm(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s.slice(0, 5);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s.slice(0, 5);
  const d = new Date(2000, 0, 1, h, mi, 0);
  try {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return s.slice(0, 5);
  }
}

function formatDateYmd(raw) {
  const s = String(raw || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '';
  const d = new Date(`${s}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return s;
  try {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

function formatDateRange(startsAt, endsAt) {
  const left = formatDateYmd(startsAt);
  const right = formatDateYmd(endsAt);
  if (!left) return '';
  return right && right !== left ? `${left} – ${right}` : left;
}

function sessionLineLabel(row) {
  const parts = [];
  const date = formatDateYmd(row.sessionDate);
  if (date) parts.push(date);
  const label = String(row.label || row.sessionLabel || '').trim();
  if (label) parts.push(label);
  if (row.startsAt && row.endsAt) {
    try {
      const a = new Date(row.startsAt);
      const b = new Date(row.endsAt);
      if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())) {
        parts.push(
          `${a.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}–${b.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        );
      }
    } catch {
      // ignore
    }
  } else if (row.startTime && row.endTime) {
    parts.push(`${formatHm(row.startTime)}–${formatHm(row.endTime)}`);
  }
  if (row.weekday) parts.push(String(row.weekday));
  const loc = String(row.locationLabel || '').trim();
  if (loc) parts.push(loc);
  return parts.join(' · ') || 'Session';
}

async function loadClientsByEventId(agencyId, eventIds) {
  const result = new Map();
  const ids = [...new Set((eventIds || []).map((id) => Number(id)).filter((n) => n > 0))];
  if (!ids.length || !agencyId) return result;

  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT cec.company_event_id,
              c.initials,
              c.identifier_code,
              COALESCE(cec.treatment_plan_complete, 0) AS treatment_plan_complete,
              cec.intake_outcome
       FROM company_event_clients cec
       INNER JOIN clients c ON c.id = cec.client_id
       WHERE cec.agency_id = ? AND cec.company_event_id IN (${ph})
         AND (cec.intake_outcome IS NULL OR cec.intake_outcome <> 'denied')
       ORDER BY cec.company_event_id ASC, c.initials ASC, c.identifier_code ASC, c.id ASC`,
      [agencyId, ...ids]
    );
    for (const r of rows || []) {
      const eid = Number(r.company_event_id);
      if (!eid) continue;
      if (!result.has(eid)) {
        result.set(eid, { registrants: [], participants: [] });
      }
      const bucket = result.get(eid);
      const init = clientInitials(r);
      const intakeAccepted = String(r.intake_outcome || '').toLowerCase() === 'accepted';
      if (intakeAccepted) bucket.participants.push(init);
      else bucket.registrants.push(init);
    }
  } catch {
    // optional workflow columns
  }
  return result;
}

async function loadSessionsByEventId(eventIds) {
  const result = new Map();
  const ids = [...new Set((eventIds || []).map((id) => Number(id)).filter((n) => n > 0))];
  if (!ids.length) return result;

  const ph = ids.map(() => '?').join(',');

  try {
    const [rows] = await pool.execute(
      `SELECT company_event_id, session_date, label, starts_at, ends_at, location_label
       FROM company_event_session_dates
       WHERE company_event_id IN (${ph})
       ORDER BY company_event_id ASC, session_date ASC, starts_at ASC, id ASC`,
      ids
    );
    for (const r of rows || []) {
      const eid = Number(r.company_event_id);
      if (!eid) continue;
      if (!result.has(eid)) result.set(eid, []);
      result.get(eid).push({
        sessionDate: r.session_date,
        label: r.label,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        locationLabel: r.location_label
      });
    }
  } catch {
    // optional table
  }

  try {
    const [sbRows] = await pool.execute(
      `SELECT company_event_id, session_date, weekday, start_time, end_time, location_label
       FROM skill_builders_event_sessions
       WHERE company_event_id IN (${ph})
       ORDER BY company_event_id ASC, session_date ASC, id ASC
       LIMIT 2000`,
      ids
    );
    for (const r of sbRows || []) {
      const eid = Number(r.company_event_id);
      if (!eid) continue;
      if (!result.has(eid)) result.set(eid, []);
      const list = result.get(eid);
      const dateKey = String(r.session_date || '').slice(0, 10);
      const dup = list.some(
        (x) =>
          String(x.sessionDate || '').slice(0, 10) === dateKey
          && String(x.startTime || '') === String(r.start_time || '')
      );
      if (dup) continue;
      list.push({
        sessionDate: r.session_date,
        weekday: r.weekday,
        startTime: r.start_time,
        endTime: r.end_time,
        locationLabel: r.location_label
      });
    }
  } catch {
    // optional table
  }

  return result;
}

/** Full roster payload for directory PDF export. */
export async function loadCompanyEventDirectoryRosterExport(agencyId) {
  const [eventRows] = await pool.execute(
    `SELECT ce.id,
            ce.title,
            ce.event_type,
            ce.starts_at,
            ce.ends_at,
            ce.public_session_label,
            ce.public_session_date_range,
            sg.name AS skills_group_name,
            sch.name AS school_name
     FROM company_events ce
     LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     LEFT JOIN agencies sch ON sch.id = sg.organization_id
     WHERE ce.agency_id = ?
     ORDER BY (ce.ends_at < NOW()) ASC, ce.ends_at DESC, ce.id DESC
     LIMIT 300`,
    [agencyId]
  );

  const events = (eventRows || []).map((row) => ({
    id: Number(row.id),
    title: String(row.title || '').trim() || `Event ${row.id}`,
    eventType: String(row.event_type || '').trim(),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    publicSessionLabel: String(row.public_session_label || '').trim(),
    publicSessionDateRange: String(row.public_session_date_range || '').trim(),
    skillsGroupName: String(row.skills_group_name || '').trim(),
    schoolName: String(row.school_name || '').trim()
  }));

  const eventIds = events.map((e) => e.id).filter((n) => n > 0);
  const [countsMap, staffMap, clientsMap, sessionsMap] = await Promise.all([
    loadCompanyEventDirectoryCounts(agencyId, eventIds),
    loadCompanyEventDirectoryStaff(agencyId, eventIds),
    loadClientsByEventId(agencyId, eventIds),
    loadSessionsByEventId(eventIds)
  ]);

  return events.map((ev) => {
    const counts = countsMap.get(ev.id) || {};
    const staff = staffMap.get(ev.id) || [];
    const clients = clientsMap.get(ev.id) || { registrants: [], participants: [] };
    const sessions = sessionsMap.get(ev.id) || [];
    const locationLabel = ev.schoolName || ev.title;
    return {
      ...ev,
      locationLabel,
      dateRange: formatDateRange(ev.startsAt, ev.endsAt),
      sessions: sessions.map(sessionLineLabel),
      registrantInitials: clients.registrants,
      participantInitials: clients.participants,
      staffNames: staff.map((s) => s.fullName),
      registrantsCount: counts.registrantsCount ?? clients.registrants.length,
      participantsCount: counts.participantsCount ?? clients.participants.length,
      staffAssignedCount: counts.staffAssignedCount ?? staff.length
    };
  });
}

function wrapText(text, maxChars = 92) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function generateCompanyEventDirectoryRosterPdf({ agencyName, events }) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = page.getSize().height - margin;

  const ensureSpace = (needed = 40) => {
    if (y < margin + needed) {
      page = pdfDoc.addPage([612, 792]);
      y = page.getSize().height - margin;
    }
  };

  const drawLines = (lines, { size = 10, font = helvetica, indent = 0, gap = 14, color = rgb(0, 0, 0) } = {}) => {
    for (const ln of lines) {
      ensureSpace(gap + 4);
      page.drawText(ln, { x: margin + indent, y, size, font, color, maxWidth: 612 - margin * 2 - indent });
      y -= gap;
    }
  };

  page.drawText('Programs & Events Roster', {
    x: margin,
    y,
    size: 20,
    font: helveticaBold,
    color: rgb(0, 0, 0)
  });
  y -= 24;
  drawLines([`Agency: ${agencyName || 'Agency'}`, `Generated: ${new Date().toLocaleString('en-US')}`], {
    size: 10,
    gap: 16,
    color: rgb(0.35, 0.35, 0.35)
  });
  y -= 8;

  for (const ev of events || []) {
    ensureSpace(120);
    page.drawLine({
      start: { x: margin, y },
      end: { x: 612 - margin, y },
      thickness: 0.75,
      color: rgb(0.82, 0.82, 0.82)
    });
    y -= 18;

    page.drawText(String(ev.title || 'Event'), {
      x: margin,
      y,
      size: 13,
      font: helveticaBold,
      color: rgb(0, 0, 0),
      maxWidth: 612 - margin * 2
    });
    y -= 18;

    const meta = [];
    if (ev.locationLabel && ev.locationLabel !== ev.title) meta.push(`Location: ${ev.locationLabel}`);
    if (ev.dateRange) meta.push(`Dates: ${ev.dateRange}`);
    if (ev.publicSessionDateRange) meta.push(`Session dates: ${ev.publicSessionDateRange}`);
    if (ev.publicSessionLabel) meta.push(`Session: ${ev.publicSessionLabel}`);
    if (ev.skillsGroupName) meta.push(`Group: ${ev.skillsGroupName}`);
    for (const ln of meta) drawLines(wrapText(ln), { size: 10, gap: 14 });

    if (Array.isArray(ev.sessions) && ev.sessions.length) {
      drawLines(['Scheduled sessions:'], { font: helveticaBold, size: 10, gap: 14 });
      for (const s of ev.sessions) {
        drawLines(wrapText(`• ${s}`), { indent: 10, size: 9, gap: 12, color: rgb(0.2, 0.2, 0.2) });
      }
    }

    const reg = (ev.registrantInitials || []).join(', ') || '—';
    const par = (ev.participantInitials || []).join(', ') || '—';
    const staff = (ev.staffNames || []).join(', ') || '—';

    drawLines(
      [
        `Registrants (${ev.registrantsCount ?? 0}): ${reg}`,
        `Participants (${ev.participantsCount ?? 0}): ${par}`,
        `Staff (${ev.staffAssignedCount ?? 0}): ${staff}`
      ],
      { size: 10, gap: 14 }
    );
    y -= 6;
  }

  if (!events?.length) {
    drawLines(['No events found for this agency.'], { size: 11, color: rgb(0.4, 0.4, 0.4) });
  }

  return pdfDoc.save();
}
