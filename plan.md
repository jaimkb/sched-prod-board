# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | opens an incident from the board and acks it in its panel — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** Clicking an incident row (or Enter/Space on it) opens that incident's **panel**, which names the incident id. The
  panel's **Ack** sends the ack for the panel's incident (`api.ack(id)`) and marks the row acked. Rows have no Ack
  button: new incidents still arrive live at the top (R1), and the panel does not move with the list, so a click
  never acks a row that slid under the pointer. *(Changed 2026-11-12 by product, after the step-one recording at
  00:30 showed a row Ack land on the wrong incident; see SCHED-4515.)*
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `incident-panel` | the open incident's panel, with `data-id="<incident id>"` and the id as its heading |
| `panel-ack` | the Ack button in the panel |
| `acked` | the acked mark in a row |

Retired: `ack` (the Ack button in a row), with R2's change.
| `build-sha` | the sha in the footer |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
