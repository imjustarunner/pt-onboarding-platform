/**
 * Build self-contained, print-friendly HTML for project workspace views.
 * Used for browser print and downloadable export.
 */

const TAB_LABELS = {
  overview: 'Overview',
  tasks: 'Tasks',
  lists: 'Shared Lists',
  documents: 'Documents',
  activity: 'Activity',
  whiteboard: 'Whiteboards'
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(d);
  }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(d);
  }
}

function memberName(m) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function taskStatusCounts(tasks) {
  const counts = { pending: 0, in_progress: 0, waiting: 0, completed: 0, overridden: 0, other: 0 };
  for (const t of tasks || []) {
    const k = t.status || 'pending';
    if (counts[k] !== undefined) counts[k]++;
    else counts.other++;
  }
  return counts;
}

function priorityCounts(tasks) {
  const counts = { high: 0, medium: 0, low: 0, none: 0 };
  for (const t of tasks || []) {
    const k = t.urgency || 'none';
    if (counts[k] !== undefined) counts[k]++;
    else counts.none++;
  }
  return counts;
}

function activityVerb(actionType) {
  const map = {
    created: 'created task',
    completed: 'completed',
    assigned: 'was assigned',
    reassigned: 'reassigned',
    status_changed: 'updated status of',
    commented: 'commented on',
    updated: 'updated'
  };
  return map[actionType] || actionType || 'updated';
}

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: 11pt; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    line-height: 1.45;
    background: #fff;
  }
  .doc { max-width: 900px; margin: 0 auto; padding: 28px 32px 48px; }
  .cover {
    border-bottom: 3px solid #14532d;
    padding-bottom: 20px;
    margin-bottom: 28px;
    page-break-after: always;
  }
  .cover__eyebrow {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    margin: 0 0 6px;
  }
  .cover h1 {
    margin: 0 0 8px;
    font-size: 26pt;
    font-weight: 800;
    color: #14532d;
    line-height: 1.15;
  }
  .cover__desc { margin: 0 0 14px; color: #334155; font-size: 11pt; max-width: 640px; }
  .cover__meta { display: flex; flex-wrap: wrap; gap: 16px 28px; font-size: 10pt; color: #475569; }
  .cover__meta strong { color: #0f172a; }
  .cover__members { margin-top: 14px; font-size: 10pt; }
  .cover__members ul { margin: 6px 0 0; padding-left: 18px; }
  .section { margin-bottom: 32px; page-break-inside: avoid; }
  .section--break { page-break-before: always; }
  .section__title {
    font-size: 14pt;
    font-weight: 800;
    color: #14532d;
    margin: 0 0 4px;
    padding-bottom: 6px;
    border-bottom: 2px solid #dcfce7;
  }
  .section__sub { margin: 0 0 14px; font-size: 9.5pt; color: #64748b; }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
  .kpi {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    background: #f8fafc;
  }
  .kpi__label { display: block; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .kpi__value { display: block; font-size: 18pt; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .kpi__sub { display: block; font-size: 8.5pt; color: #64748b; margin-top: 2px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .panel {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
    background: #fff;
  }
  .panel h3 { margin: 0 0 10px; font-size: 10pt; font-weight: 700; color: #334155; }
  .stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 9.5pt; }
  .stat-row:last-child { border-bottom: 0; }
  .bar-row { margin-bottom: 8px; }
  .bar-row__head { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 3px; }
  .bar-row__track { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
  .bar-row__fill { height: 100%; border-radius: 4px; }
  table.data {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin-top: 8px;
  }
  table.data th, table.data td {
    border: 1px solid #e2e8f0;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  table.data th {
    background: #f1f5f9;
    font-weight: 700;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #475569;
  }
  table.data tr:nth-child(even) td { background: #fafafa; }
  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 8pt;
    font-weight: 700;
    white-space: nowrap;
  }
  .badge--open { background: #dbeafe; color: #1d4ed8; }
  .badge--progress { background: #ede9fe; color: #6d28d9; }
  .badge--waiting { background: #fef3c7; color: #b45309; }
  .badge--done { background: #dcfce7; color: #15803d; }
  .badge--blocked { background: #fee2e2; color: #b91c1c; }
  .badge--high { background: #fee2e2; color: #b91c1c; }
  .badge--medium { background: #ffedd5; color: #c2410c; }
  .badge--low { background: #dbeafe; color: #1d4ed8; }
  .badge--none { background: #f1f5f9; color: #64748b; }
  .list-card {
    border: 1px solid #e2e8f0;
    border-left: 4px solid #22c55e;
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .list-card h4 { margin: 0 0 8px; font-size: 11pt; }
  .list-card__stats { display: flex; gap: 20px; font-size: 9pt; color: #475569; }
  .list-card__stats strong { color: #0f172a; font-size: 11pt; display: block; }
  .activity-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 9.5pt; }
  .activity-item:last-child { border-bottom: 0; }
  .activity-item time { display: block; font-size: 8.5pt; color: #94a3b8; margin-top: 2px; }
  .muted { color: #64748b; }
  .empty { padding: 16px; text-align: center; color: #94a3b8; font-size: 9.5pt; border: 1px dashed #e2e8f0; border-radius: 8px; }
  .health {
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 14px;
    font-size: 10pt;
  }
  .health--good { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
  .health--fair { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
  .health--bad { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
  .health strong { font-size: 11pt; }
  .footer-note {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #94a3b8;
    text-align: center;
  }
  .toolbar {
    position: sticky;
    top: 0;
    background: #14532d;
    color: #fff;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    z-index: 10;
  }
  .toolbar button {
    background: #fff;
    color: #14532d;
    border: 0;
    border-radius: 6px;
    padding: 8px 16px;
    font-weight: 700;
    font-size: 10pt;
    cursor: pointer;
  }
  .toolbar button:hover { background: #f0fdf4; }
  @media print {
    .no-print { display: none !important; }
    .doc { padding: 0; max-width: 100%; }
    .cover { page-break-after: always; }
    .section--break { page-break-before: always; }
    table.data tr { page-break-inside: avoid; }
    .list-card { page-break-inside: avoid; }
    .badge, .kpi, .health, table.data th, .bar-row__fill {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

function statusBadgeClass(status) {
  const map = {
    pending: 'badge--open',
    in_progress: 'badge--progress',
    waiting: 'badge--waiting',
    completed: 'badge--done',
    overridden: 'badge--blocked'
  };
  return map[status] || 'badge--open';
}

function priorityBadgeClass(urgency) {
  const map = { high: 'badge--high', medium: 'badge--medium', low: 'badge--low' };
  return map[urgency] || 'badge--none';
}

function renderCover({ project, overview, generatedAt, scopeLabel }) {
  const members = overview?.members || [];
  return `
    <header class="cover">
      <p class="cover__eyebrow">Project workspace · ${esc(scopeLabel)}</p>
      <h1>${esc(project?.name || 'Project')}</h1>
      ${project?.description ? `<p class="cover__desc">${esc(project.description)}</p>` : ''}
      <div class="cover__meta">
        <span><strong>Due:</strong> ${esc(fmtDate(project?.due_date))}</span>
        <span><strong>Progress:</strong> ${esc(overview?.progress_pct ?? 0)}%</span>
        <span><strong>Generated:</strong> ${esc(generatedAt)}</span>
      </div>
      ${members.length ? `
        <div class="cover__members">
          <strong>Team (${members.length})</strong>
          <ul>${members.map((m) => `<li>${esc(memberName(m))}${m.role ? ` <span class="muted">(${esc(m.role)})</span>` : ''}</li>`).join('')}</ul>
        </div>
      ` : ''}
    </header>
  `;
}

function renderOverviewSection({ overview, tasks, healthStatus, healthItems, upcomingDeadlines, priorityBars }) {
  const status = taskStatusCounts(tasks);
  const total = tasks?.length || 0;
  const open = overview?.open_task_count ?? status.pending + status.in_progress + status.waiting;

  return `
    <section class="section">
      <h2 class="section__title">Overview</h2>
      <p class="section__sub">Project health and key metrics</p>
      <div class="kpi-grid">
        <div class="kpi"><span class="kpi__label">Overall progress</span><span class="kpi__value">${esc(overview?.progress_pct ?? 0)}%</span></div>
        <div class="kpi"><span class="kpi__label">Tasks</span><span class="kpi__value">${esc(total)}</span><span class="kpi__sub">${esc(open)} open</span></div>
        <div class="kpi"><span class="kpi__label">Shared lists</span><span class="kpi__value">${esc((overview?.lists || []).length)}</span></div>
        <div class="kpi"><span class="kpi__label">Action items</span><span class="kpi__value">${esc(overview?.open_action_item_count ?? 0)}</span><span class="kpi__sub">open</span></div>
        <div class="kpi"><span class="kpi__label">Documents</span><span class="kpi__value">${esc(overview?.document_count ?? 0)}</span></div>
        <div class="kpi"><span class="kpi__label">Team</span><span class="kpi__value">${esc((overview?.members || []).length)}</span></div>
      </div>
      ${healthStatus ? `
        <div class="health ${esc(healthStatus.cls)}">
          <strong>${esc(healthStatus.label)}</strong> — ${esc(healthStatus.tagline)}
        </div>
      ` : ''}
      <div class="two-col">
        <div class="panel">
          <h3>Task status breakdown</h3>
          ${[
            ['Open', status.pending, '#3b82f6'],
            ['In progress', status.in_progress, '#8b5cf6'],
            ['Waiting', status.waiting, '#f59e0b'],
            ['Blocked', status.overridden, '#ef4444'],
            ['Completed', status.completed, '#22c55e']
          ].filter(([, c]) => c > 0).map(([label, count, color]) => `
            <div class="bar-row">
              <div class="bar-row__head"><span>${esc(label)}</span><span>${esc(count)}</span></div>
              <div class="bar-row__track"><div class="bar-row__fill" style="width:${total ? Math.round((count / total) * 100) : 0}%;background:${color}"></div></div>
            </div>
          `).join('') || '<p class="muted">No tasks yet.</p>'}
        </div>
        <div class="panel">
          <h3>Priority distribution</h3>
          ${(priorityBars || []).map((p) => `
            <div class="bar-row">
              <div class="bar-row__head"><span>${esc(p.label)}</span><span>${esc(p.count)}</span></div>
              <div class="bar-row__track"><div class="bar-row__fill" style="width:${esc(p.pct)}%;background:${esc(p.color)}"></div></div>
            </div>
          `).join('')}
        </div>
      </div>
      ${healthItems?.length ? `
        <div class="panel">
          <h3>Project health indicators</h3>
          ${healthItems.map((h) => `
            <div class="stat-row"><span>${esc(h.label)}</span><strong>${esc(h.value)}</strong></div>
          `).join('')}
        </div>
      ` : ''}
      ${upcomingDeadlines?.length ? `
        <div class="panel" style="margin-top:14px">
          <h3>Upcoming deadlines</h3>
          <table class="data">
            <thead><tr><th>Task</th><th>Due</th><th>Status</th><th>Assignee</th></tr></thead>
            <tbody>
              ${upcomingDeadlines.map((t) => `
                <tr>
                  <td>${esc(t.title)}</td>
                  <td>${esc(fmtDate(t.due_date))}</td>
                  <td><span class="badge ${statusBadgeClass(t.status)}">${esc(t.statusLabel || t.status)}</span></td>
                  <td>${esc(t.assigneeLabel || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </section>
  `;
}

function renderTasksSection(tasks) {
  if (!tasks?.length) {
    return `
      <section class="section section--break">
        <h2 class="section__title">Tasks</h2>
        <div class="empty">No tasks in this project.</div>
      </section>
    `;
  }
  return `
    <section class="section section--break">
      <h2 class="section__title">Tasks</h2>
      <p class="section__sub">${esc(tasks.length)} task${tasks.length !== 1 ? 's' : ''}</p>
      <table class="data">
        <thead>
          <tr>
            <th>Task</th>
            <th>List</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Due</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((t) => `
            <tr>
              <td>${esc(t.title)}</td>
              <td>${esc(t.task_list_name || '—')}</td>
              <td><span class="badge ${statusBadgeClass(t.status)}">${esc(t.statusLabel || t.status)}</span></td>
              <td><span class="badge ${priorityBadgeClass(t.urgency)}">${esc(t.priorityLabel || t.urgency || 'None')}</span></td>
              <td>${esc(t.assigneeLabel || '—')}</td>
              <td>${esc(fmtDate(t.due_date))}</td>
              <td>${esc(t.typeLabel || 'General')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function renderListsSection(overview, listMembersByListId) {
  const lists = overview?.lists || [];
  if (!lists.length) {
    return `
      <section class="section section--break">
        <h2 class="section__title">Shared Lists</h2>
        <div class="empty">No shared lists attached to this project.</div>
      </section>
    `;
  }
  return `
    <section class="section section--break">
      <h2 class="section__title">Shared Lists</h2>
      <p class="section__sub">${esc(lists.length)} list${lists.length !== 1 ? 's' : ''} attached</p>
      ${lists.map((l) => {
        const members = listMembersByListId?.[Number(l.id)] || [];
        const done = (l.total_task_count || 0) - (l.open_task_count || 0);
        const pct = l.total_task_count ? Math.round((done / l.total_task_count) * 100) : 0;
        return `
          <div class="list-card">
            <h4>${esc(l.name)}</h4>
            <div class="list-card__stats">
              <span><strong>${esc(l.total_task_count || 0)}</strong> total tasks</span>
              <span><strong>${esc(l.open_task_count || 0)}</strong> open</span>
              <span><strong>${esc(done)}</strong> done (${esc(pct)}%)</span>
              <span><strong>${esc(members.length)}</strong> members</span>
            </div>
            ${members.length ? `<p class="muted" style="margin:8px 0 0;font-size:9pt">Members: ${members.map((m) => esc(memberName(m))).join(', ')}</p>` : ''}
          </div>
        `;
      }).join('')}
    </section>
  `;
}

function renderDocumentsSection(overview) {
  const count = overview?.document_count ?? 0;
  return `
    <section class="section section--break">
      <h2 class="section__title">Documents</h2>
      <p class="section__sub">${esc(count)} document${count !== 1 ? 's' : ''} linked via project tasks</p>
      <div class="panel">
        <p>Documents are attached to individual tasks. Open each task in the workspace to view or download attachments.</p>
      </div>
    </section>
  `;
}

function renderActivitySection(activity) {
  const items = activity || [];
  if (!items.length) {
    return `
      <section class="section section--break">
        <h2 class="section__title">Activity</h2>
        <div class="empty">No activity recorded yet.</div>
      </section>
    `;
  }
  return `
    <section class="section section--break">
      <h2 class="section__title">Activity</h2>
      <p class="section__sub">${esc(items.length)} recent event${items.length !== 1 ? 's' : ''}</p>
      <div class="panel">
        ${items.map((a) => `
          <div class="activity-item">
            <div>
              <strong>${esc([a.actor_first_name, a.actor_last_name].filter(Boolean).join(' ') || 'Unknown')}</strong>
              ${esc(activityVerb(a.action_type))}
              <em>"${esc(a.task_title || 'task')}"</em>
              <time>${esc(fmtDateTime(a.created_at))}</time>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderWhiteboardsSection(whiteboards) {
  const items = whiteboards || [];
  if (!items.length) {
    return `
      <section class="section section--break">
        <h2 class="section__title">Whiteboards</h2>
        <div class="empty">No whiteboards in this project.</div>
      </section>
    `;
  }
  return `
    <section class="section section--break">
      <h2 class="section__title">Whiteboards</h2>
      <p class="section__sub">${esc(items.length)} canvas${items.length !== 1 ? 'es' : ''}</p>
      <table class="data">
        <thead><tr><th>Name</th><th>Last updated</th></tr></thead>
        <tbody>
          ${items.map((wb) => `
            <tr>
              <td>${esc(wb.name)}</td>
              <td>${esc(fmtDateTime(wb.updated_at))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="muted" style="margin-top:10px;font-size:9pt">Canvas drawings are not included in print/export — open each whiteboard in the workspace to view.</p>
    </section>
  `;
}

/**
 * @param {'overview'|'full'|'tasks'|'lists'|'documents'|'activity'|'whiteboard'} scope
 */
export function buildProjectPrintHtml(snapshot, scope = 'full') {
  const {
    project,
    overview,
    tasks,
    activity,
    whiteboards,
    listMembersByListId,
    healthStatus,
    healthItems,
    upcomingDeadlines,
    priorityBars
  } = snapshot;

  const generatedAt = new Date().toLocaleString();
  const scopeLabel = scope === 'full' ? 'Full export' : (TAB_LABELS[scope] || scope);

  const sections = [];
  const includeCover = scope === 'full' || scope === 'overview';

  let body = '';
  if (includeCover) {
    body += renderCover({ project, overview, generatedAt, scopeLabel });
  } else {
    body += `
      <header style="border-bottom:2px solid #14532d;padding-bottom:12px;margin-bottom:20px">
        <p class="cover__eyebrow">${esc(project?.name || 'Project')} · ${esc(scopeLabel)}</p>
        <p class="muted" style="margin:0;font-size:9pt">Generated ${esc(generatedAt)}</p>
      </header>
    `;
  }

  const add = (id, html) => { if (html) sections.push({ id, html }); };

  if (scope === 'full' || scope === 'overview') {
    add('overview', renderOverviewSection({
      overview, tasks, healthStatus, healthItems, upcomingDeadlines, priorityBars
    }));
  }
  if (scope === 'full' || scope === 'tasks') add('tasks', renderTasksSection(tasks));
  if (scope === 'full' || scope === 'lists') add('lists', renderListsSection(overview, listMembersByListId));
  if (scope === 'full' || scope === 'documents') add('documents', renderDocumentsSection(overview));
  if (scope === 'full' || scope === 'activity') add('activity', renderActivitySection(activity));
  if (scope === 'full' || scope === 'whiteboard') add('whiteboard', renderWhiteboardsSection(whiteboards));

  body += sections.map((s) => s.html).join('');
  body += `<p class="footer-note">PlotTwist HQ · Project workspace · Confidential internal document</p>`;

  const title = `${project?.name || 'Project'} — ${scopeLabel}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="toolbar no-print">
    <span>${esc(title)}</span>
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <div class="doc">${body}</div>
</body>
</html>`;
}

export function openProjectPrintWindow(html) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    window.alert('Please allow pop-ups to print or export this project.');
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Auto-trigger print dialog after styles load
  const trigger = () => {
    try {
      w.print();
    } catch {
      /* user can use toolbar button */
    }
  };
  if (w.document.readyState === 'complete') {
    setTimeout(trigger, 300);
  } else {
    w.addEventListener('load', () => setTimeout(trigger, 300));
  }
  return true;
}

export function downloadProjectHtml(html, filename) {
  const safe = String(filename || 'project')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'project';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.html`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printProjectScope(snapshot, scope) {
  const html = buildProjectPrintHtml(snapshot, scope);
  return openProjectPrintWindow(html);
}

export function exportProjectFull(snapshot) {
  const html = buildProjectPrintHtml(snapshot, 'full');
  const name = snapshot?.project?.name || 'project';
  downloadProjectHtml(html, `${name}-full-export`);
  return true;
}
