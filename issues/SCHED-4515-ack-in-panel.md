---
id: SCHED-4515
title: Ack moves from the row to an incident panel
status: done
plan: R2 (changed)
---

The step-one recording (build 930d553, 00:30) showed a row Ack land on the wrong incident: on-call pointed at
INC-5237's Ack, a new incident arrived at the top, every row moved down one place, and the click acked INC-9594.

Product's decision: "New incidents stay live at the top. Ack leaves the row: a row opens its incident panel, and
Ack lives there."

- R1 stays: new incidents arrive live at the top, newest first.
- Rows lose their Ack button (`data-testid="ack"` retired).
- Clicking a row (or Enter/Space on it) opens its panel (`data-testid="incident-panel"`, `data-id` = incident id,
  heading = incident id). The panel sits beside the list and does not move when rows arrive.
- The panel's Ack (`data-testid="panel-ack"`, labeled "Ack <id>") acks the panel's incident and marks its row
  acked (`data-testid="acked"`).

Acceptance: with incidents arriving, open an incident and ack it from its panel; the acked incident is the one the
panel names, even if the row moved meanwhile.
