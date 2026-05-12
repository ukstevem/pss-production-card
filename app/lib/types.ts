// Shape-only types matching the migrations. Not generated — kept lean.

export type CardState =
  | "draft"
  | "issued"
  | "in_progress"
  | "on_hold"
  | "awaiting_final_inspection"
  | "complete"
  | "closed"
  | "cancelled";

export type CardVariant = "shop" | "site";

export type ProductionCard = {
  id: string;
  doc_id: string | null;
  project_register_item_id: string;
  variant: CardVariant;
  exc_class: number | null;
  card_rev: number;
  state: CardState;
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
  doc_number: string | null;
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
  drawing_number: string | null;
  drawing_rev: string | null;
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
