import { supabaseAdmin } from "./lib/supabase-admin.js";

type Op = {
  code: string;
  label: string;
  required_role: string;
  category: "prep" | "fab" | "finish" | "machine" | "asm" | "qc" | "dispatch" | "site";
  default_hold_point_after?: boolean;
  description?: string;
};

// 27 master ops. required_role must match a value used in employees.role[].
// default_hold_point_after = true on ops that produce evidence requiring sign-off
// before the next op may start (planner can still override per routing).
const OPS: Op[] = [
  // Prep
  { code: "mark",              label: "Mark Out",            required_role: "fabricator", category: "prep" },
  { code: "cut",               label: "Cut",                 required_role: "fabricator", category: "prep" },
  { code: "drill",             label: "Drill",               required_role: "fabricator", category: "prep" },
  { code: "bevel",             label: "Bevel",               required_role: "fabricator", category: "prep" },

  // Fab
  { code: "plating",           label: "Plating (fit-up)",    required_role: "fabricator", category: "fab",     default_hold_point_after: true },
  { code: "weld",              label: "Weld",                required_role: "welder",     category: "fab",     default_hold_point_after: true },
  { code: "fettle",            label: "Fettle",              required_role: "fabricator", category: "fab" },
  { code: "straighten",        label: "Straighten",          required_role: "fabricator", category: "fab" },

  // Finish (appended after fab/machine when applicable)
  { code: "shot-blast",        label: "Shot Blast",          required_role: "fabricator", category: "finish" },
  { code: "paint",             label: "Paint",               required_role: "painter",    category: "finish",  default_hold_point_after: true },
  { code: "galvanise",         label: "Galvanise",           required_role: "painter",    category: "finish" },
  { code: "pickle-passivate",  label: "Pickle & Passivate",  required_role: "painter",    category: "finish",  default_hold_point_after: true,
    description: "Stainless steels — chemical clean to restore the passive layer after welding/fettling." },

  // Machine
  { code: "machine-setup",     label: "Machine Setup",       required_role: "machinist",  category: "machine" },
  { code: "mill",              label: "Mill",                required_role: "machinist",  category: "machine" },
  { code: "turn",              label: "Turn",                required_role: "machinist",  category: "machine" },
  { code: "bore",              label: "Bore",                required_role: "machinist",  category: "machine" },
  { code: "debur",             label: "Debur",               required_role: "machinist",  category: "machine" },

  // Assembly
  { code: "assemble",          label: "Assemble",            required_role: "fitter",     category: "asm" },

  // QC + dispatch (shop end-of-line)
  { code: "final-inspect",     label: "Final Inspection",    required_role: "inspector",  category: "qc",       default_hold_point_after: true },
  { code: "pack",              label: "Pack",                required_role: "fabricator", category: "dispatch" },
  { code: "dispatch",          label: "Dispatch",            required_role: "fabricator", category: "dispatch" },

  // Site
  { code: "site-offload",      label: "Site Offload",        required_role: "site",       category: "site" },
  { code: "site-position",     label: "Site Position",       required_role: "site",       category: "site" },
  { code: "site-bolt-up",      label: "Site Bolt-up",        required_role: "site",       category: "site" },
  { code: "site-weld",         label: "Site Weld",           required_role: "welder",     category: "site",     default_hold_point_after: true },
  { code: "site-snag",         label: "Site Snag",           required_role: "site",       category: "site" },
  { code: "handover",          label: "Handover",            required_role: "qc",         category: "site",     default_hold_point_after: true },
];

async function main() {
  const rows = OPS.map((o) => ({
    code: o.code,
    label: o.label,
    required_role: o.required_role,
    category: o.category,
    default_hold_point_after: o.default_hold_point_after ?? false,
    description: o.description ?? null,
    active: true,
  }));

  const { data, error } = await supabaseAdmin
    .from("production_op_library")
    .upsert(rows, { onConflict: "code" })
    .select("code");

  if (error) {
    console.error("seed-op-library failed:", error);
    process.exit(1);
  }

  console.log(`seeded ${data?.length ?? 0} ops into production_op_library`);
}

main();
