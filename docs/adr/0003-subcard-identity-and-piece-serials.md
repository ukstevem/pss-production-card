# 0003 — Subcard identity, paint-pen piece serials, and retrospective Serial Picker

A Card decomposes into one or more **Subcards** — one row of `production_card_part`
per primary drawing. Subcard identity is `(card.doc_number,
primary_drawing.doc_number)`; there is no artificial A/B/C suffix. A new FK column
`production_card_part.primary_drawing_doc_id` → `document_incoming_scan(id)` is
mandatory at card issue (nullable in draft). The Subcard's printed cover sheet
displays the drawing's title-block number for humans; the **Subcard QR** encodes
the system identity.

Physical pieces (when `qty > 1`) are marked by hand with **paint-pen Piece
Serials** (`001`, `002`, …) per Subcard. At session-stop the kiosk shows a
touch-grid **Serial Picker** — operator taps the serials they completed in this
session. Each tap can carry a per-piece welding **Heat** if consumables changed
mid-session. Serials persist as text breadcrumbs in
`production_card_event.meta` jsonb as `{"pieces_completed": [{"serial",
"heat"?}, ...]}` — no piece-row entity in the schema (operator-applied, not
pre-allocated).

At issue the gate is **all-or-nothing**: every Subcard must have its primary
drawing filed in doc-service. No hold-per-line. If a drawing isn't ready, the
planner removes the Subcard from the Card and creates a separate Card for it
later when the drawing arrives.

Cards are immutable from issue. `card_rev` is abandoned. A card that must
change after issue is **replaced by a new Card** with a fresh doc-service
number; the predecessor's `superseded_by_card_id` points forward and its state
moves to `superseded`.

Rejected: QR-per-physical-piece (paint, surface texture, hot work make
stickers unreliable on metal). Rejected: A/B/C arbitrary suffixes (meaningless
to inspectors who track by drawing). Rejected: pre-allocated piece rows in
schema (`production_card_part_piece`) — heavy, unnecessary until a scribe
machine exists. Rejected: live `card_rev` mechanism with PDF refile-override
(mutates the doc-service archive; conflicts with the immutability invariant).
