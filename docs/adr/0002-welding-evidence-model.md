# 0002 — Welding evidence model: Seam → Pass → Session

Welding evidence is keyed on Seam (the canonical joint), with Pass as a sub-entity
of Seam. Seams at EXC ≥ 3 are snapshotted from an external Weld Map at card-issue
time and become immutable for that card revision (matches the `exc_class` snapshot
pattern). Pass is declared retrospectively at session-stop: the welder keys
pass-count, the system creates that many Pass rows attributed to the session.
Pass type (`root` / `fill` / `cap` / `other`) infers from sequence; welder/inspector
can override.

At EXC ≤ 2 the Seam and Pass layers exist with degenerate single rows and are
hidden from the planner and kiosk UI ("flattened wrapper"). Same storage, same
queries — EXC class gates only the UI.

Rejected: live reference to Weld Map (would let upstream edits silently mutate
issued cards — incompatible with the immutable-on-close invariant). Rejected:
live per-pass scan-in (welder interruption cost too high for the traceability gain).
Rejected: pass tracking only at EXC ≥ 3 (two code paths, branched queries — worse
than one path with hidden UI).
