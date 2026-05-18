// Shape-only types matching the migrations. Not generated — kept lean.

export type CardState =
  | "draft"
  | "submitted_for_qc"
  | "issued"
  | "in_progress"
  | "on_hold"
  | "awaiting_final_inspection"
  | "complete"
  | "closed"
  | "cancelled"
  | "superseded";

export type CardVariant = "shop" | "site";

export type ProductionCard = {
  id: string;
  issued_doc_id: string | null;          // as-planned PDF; populated at issue
  closed_doc_id: string | null;          // as-built PDF; populated at close (ADR-0005)
  project_register_item_id: string;
  variant: CardVariant;
  exc_class: number | null;
  state: CardState;
  required_final_inspections: string[];  // codes from production_inspection_type
  ndt_coverage_percent: number | null;   // 1..100; required when weld_mpi or weld_dpi in required_final_inspections
  issued_by: string | null;
  issued_at: string | null;
  qc_signed_by: string | null;
  qc_signed_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  superseded_by_card_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRegisterItem = {
  id: string;
  projectnumber: string;
  item_seq: number;
  line_desc: string | null;
  exc_class: number | null;
};

export type CardListRow = ProductionCard & {
  projectnumber: string;
  item_seq: number;
  line_desc: string | null;
  issued_doc_number: string | null;
  closed_doc_number: string | null;
};

export type PartState =
  | "pending"
  | "in_progress"
  | "awaiting_final"
  | "accepted"
  | "rejected"
  | "cancelled";

export type ProductionCardPart = {
  id: string;
  card_id: string;
  seq: number;
  primary_drawing_doc_id: string | null; // FK → document_incoming_scan(id); mandatory at issue
  description: string | null;
  qty: number;
  weight: number | null;
  material_spec: string | null;
  material_doc_id: string | null;
  material_po_id: string | null;
  state: PartState;
  notes: string | null;
};

export type OpState =
  | "pending"
  | "in_progress"
  | "awaiting_inspection"
  | "accepted"
  | "rework"
  | "skipped";

export type ProductionCardPartOp = {
  id: string;
  card_part_id: string;
  seq: number;
  op_code: string;
  required_role: string;
  hold_point_after: boolean;
  wps_id: string | null;
  state: OpState;
  planned_duration_minutes: number | null;
  notes: string | null;
};

export type InspectionType =
  | "geometric"
  | "weld_visual"
  | "weld_mpi"
  | "weld_dpi"
  | "cosmetic"
  | "client_specific";

export type OpLibraryRow = {
  code: string;
  label: string;
  required_role: string;
  default_hold_point_after: boolean;
  category: string;
  description: string | null;
  active: boolean;
};

export type RoutingTemplate = {
  id: string;
  name: string;
  process_family: string;
  description: string | null;
  active: boolean;
  ops?: { seq: number; op_code: string; hold_point_after: boolean | null }[];
};

export type WpsRow = {
  id: string;
  wps_no: string;
  process: string | null;
  material_grade: string | null;
  position: string | null;
  joint_type: string | null;
  active: boolean;
};
