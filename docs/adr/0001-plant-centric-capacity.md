# 0001 — Plant-centric capacity model

Pull-flow capacity is modelled per Plant Type (weld set, saw, drill, paint booth, …),
not per Operator role. A Station is the queue of pending Ops for one Plant Type;
its capacity equals the count of Plant of that type in state=`available`. Operator
availability is a secondary filter, tracked for QC attribution rather than as the
primary planning constraint.

Rejected: per-role queue ("one Station per welder/fabricator/etc"). That model
conflated production planning (plant-limited) with QC traceability (operator-attributed),
which answer different questions and trip different alarms. Cells are not modelled
separately — Plant subsumes their role as the schedulable bottleneck.
