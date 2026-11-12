import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAck = panel.querySelector('[data-testid="panel-ack"]');

// R5: the viewer's own zone and the viewer's own day/month order (en-GB, de-DE, en-NZ → dd/mm).
const timeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Rows by incident id, so a refresh updates rows in place instead of redrawing the list. */
const rows = new Map();
/** The latest data for each incident on the board, and what this viewer acked. */
const incidents = new Map();
const acked = new Map();
/** The incident the panel shows. The panel is keyed by id, so rows moving never change what Ack acks. */
let openId = null;

function text(tag, className, value) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = value;
  return el;
}

function setTime(timeEl, iso) {
  if (timeEl.dateTime === iso) return;
  timeEl.dateTime = iso; // full UTC value stays in the attribute
  timeEl.textContent = timeFormat.format(new Date(iso));
}

function markRowAcked(row, reply) {
  if (row.querySelector('[data-testid="acked"]')) return;
  const mark = document.createElement('span');
  mark.dataset.testid = 'acked';
  mark.className = 'acked';
  mark.textContent = 'Acked';
  mark.title = `acked ${reply.ackedAt}`;
  row.append(mark);
  row.classList.add('is-acked');
}

/** R2 (changed): a row opens its incident panel; Ack lives in the panel. */
function openPanel(id) {
  openId = id;
  for (const [rowId, row] of rows) row.setAttribute('aria-selected', String(rowId === id));
  renderPanel();
  panel.hidden = false;
  panel.focus();
}

function closePanel() {
  const row = rows.get(openId);
  openId = null;
  panel.hidden = true;
  for (const r of rows.values()) r.setAttribute('aria-selected', 'false');
  row?.focus();
}

function renderPanel() {
  if (!openId) return;
  const incident = incidents.get(openId);
  panel.dataset.id = openId;
  panel.querySelector('.panel-id').textContent = openId;
  panel.querySelector('.panel-sev').textContent = incident?.severity ?? '';
  panel.querySelector('.panel-sev').className = `panel-sev ${incident?.severity ?? ''}`;
  panel.querySelector('.panel-what').textContent = incident
    ? `${incident.service} · ${incident.region} · ${incident.summary}`
    : 'No longer on the board.';
  const time = panel.querySelector('time');
  if (incident) setTime(time, incident.openedAt);
  const reply = acked.get(openId);
  panelAck.disabled = Boolean(reply) || !incident || panelAck.dataset.busy === 'true';
  panelAck.textContent = reply ? 'Acked' : panelAck.dataset.busy === 'true' ? 'Acking…' : `Ack ${openId}`;
  panel.querySelector('.panel-note').textContent = reply ? `Acked ${timeFormat.format(new Date(reply.ackedAt))}` : '';
}

panelAck.addEventListener('click', async () => {
  const id = panel.dataset.id; // the panel's incident, whatever the list did meanwhile
  panelAck.dataset.busy = 'true';
  renderPanel();
  try {
    const reply = await ack(id);
    acked.set(id, reply);
    const row = rows.get(id);
    if (row) markRowAcked(row, reply);
  } catch (err) {
    console.error(err);
    status.textContent = `Ack for ${id} failed. Try again.`;
  } finally {
    panelAck.dataset.busy = 'false';
    if (openId === id) renderPanel();
  }
});
panel.querySelector('.panel-close').addEventListener('click', closePanel);
panel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanel();
});

function createRow(incident) {
  const row = document.createElement('li');
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;
  row.className = `row ${incident.severity}`;
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-label', `Open ${incident.id}`);
  row.setAttribute('aria-selected', 'false');
  const time = document.createElement('time');
  setTime(time, incident.openedAt);
  row.append(
    text('span', 'id', incident.id),
    text('span', 'sev', incident.severity),
    text('span', 'what', `${incident.service} · ${incident.region} · ${incident.summary}`),
    time,
  );
  row.addEventListener('click', () => openPanel(incident.id));
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(incident.id);
    }
  });
  return row;
}

/** R1: newest first, new incidents at the top; existing rows keep their element (and their ack state). */
function render(list_) {
  const seen = new Set();
  let previous = null;
  for (const incident of list_) {
    seen.add(incident.id);
    incidents.set(incident.id, incident);
    let row = rows.get(incident.id);
    if (row) {
      setTime(row.querySelector('time'), incident.openedAt);
      row.className = `row ${incident.severity}${row.classList.contains('is-acked') ? ' is-acked' : ''}`;
    } else {
      row = createRow(incident);
      row.setAttribute('aria-selected', String(incident.id === openId));
      rows.set(incident.id, row);
    }
    const wanted = previous ? previous.nextSibling : list.firstChild;
    if (row !== wanted) list.insertBefore(row, wanted);
    previous = row;
  }
  for (const [id, row] of rows) {
    if (!seen.has(id)) {
      row.remove();
      rows.delete(id);
      incidents.delete(id);
    }
  }
  empty.hidden = list_.length > 0;
  list.hidden = list_.length === 0;
  renderPanel();
}

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    loader?.remove(); // R3: gone once incidents load
    board.setAttribute('aria-busy', 'false');
    status.textContent = `Updated ${timeFormat.format(new Date(page.updatedAt))}`;
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not reach the incident API. Retrying…';
  } finally {
    setTimeout(refresh, REFRESH_MS); // R4: one request at a time, every 2 seconds
  }
}

refresh();
