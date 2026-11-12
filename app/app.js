import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');

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

function markAcked(row, reply) {
  const mark = document.createElement('span');
  mark.dataset.testid = 'acked';
  mark.className = 'acked';
  mark.textContent = 'Acked';
  mark.title = `acked ${reply.ackedAt}`;
  row.querySelector('[data-testid="ack"]').replaceWith(mark);
  row.classList.add('is-acked');
}

async function onAck(event) {
  const button = event.currentTarget;
  const row = button.closest('[data-testid="incident-row"]');
  const id = row.dataset.id;
  button.disabled = true;
  button.textContent = 'Acking…';
  try {
    markAcked(row, await ack(id)); // R2
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Ack';
    status.textContent = `Ack for ${id} failed. Try again.`;
  }
}

function createRow(incident) {
  const row = document.createElement('li');
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;
  row.className = `row ${incident.severity}`;
  const time = document.createElement('time');
  setTime(time, incident.openedAt);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'ack';
  button.className = 'ack';
  button.textContent = 'Ack';
  button.addEventListener('click', onAck);
  row.append(
    text('span', 'id', incident.id),
    text('span', 'sev', incident.severity),
    text('span', 'what', `${incident.service} · ${incident.region} · ${incident.summary}`),
    time,
    button,
  );
  return row;
}

/** R1: newest first, new incidents at the top; existing rows keep their element (and their ack state). */
function render(incidents) {
  const seen = new Set();
  let previous = null;
  for (const incident of incidents) {
    seen.add(incident.id);
    let row = rows.get(incident.id);
    if (row) {
      setTime(row.querySelector('time'), incident.openedAt);
      row.className = `row ${incident.severity}${row.classList.contains('is-acked') ? ' is-acked' : ''}`;
    } else {
      row = createRow(incident);
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
    }
  }
  empty.hidden = incidents.length > 0;
  list.hidden = incidents.length === 0;
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
