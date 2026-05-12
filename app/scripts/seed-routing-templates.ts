import { supabaseAdmin } from "./lib/supabase-admin.js";

type Template = {
  name: string;
  process_family: "Fabrication" | "Machining" | "Assembly" | "Site Install" | "Finishing";
  description?: string;
  ops: string[];                 // op_codes in sequence
};

// Starter templates. Planner picks one as a base and edits per-part.
// Finishing ops (shot-blast / paint / galvanise / pickle-passivate) are
// not baked into a fixed template — planner appends them as needed.
const TEMPLATES: Template[] = [
  {
    name: "Standard Fabrication",
    process_family: "Fabrication",
    description: "Mark → cut → prep → fit-up → weld → fettle → final inspect.",
    ops: ["mark", "cut", "drill", "bevel", "plating", "weld", "fettle", "final-inspect"],
  },
  {
    name: "Standard Machining",
    process_family: "Machining",
    description: "Setup → cutting ops → debur → final inspect.",
    ops: ["machine-setup", "mill", "turn", "bore", "debur", "final-inspect"],
  },
  {
    name: "Standard Assembly",
    process_family: "Assembly",
    description: "Assemble → final inspect.",
    ops: ["assemble", "final-inspect"],
  },
  {
    name: "Standard Site Install",
    process_family: "Site Install",
    description: "Offload → position → bolt-up → site weld → snag → handover.",
    ops: ["site-offload", "site-position", "site-bolt-up", "site-weld", "site-snag", "handover"],
  },
];

async function main() {
  for (const t of TEMPLATES) {
    // Upsert template by (process_family, name)
    const { data: tplRow, error: tplErr } = await supabaseAdmin
      .from("production_routing_template")
      .upsert(
        { name: t.name, process_family: t.process_family, description: t.description ?? null, active: true },
        { onConflict: "process_family,name" }
      )
      .select("id")
      .single();

    if (tplErr || !tplRow) {
      console.error(`failed to upsert template ${t.process_family}/${t.name}:`, tplErr);
      process.exit(1);
    }

    // Replace its op list (delete + insert keeps things idempotent without
    // worrying about reordering vs upserting on (template_id, seq)).
    const { error: delErr } = await supabaseAdmin
      .from("production_routing_template_op")
      .delete()
      .eq("template_id", tplRow.id);
    if (delErr) {
      console.error(`failed to clear ops for ${t.name}:`, delErr);
      process.exit(1);
    }

    const opRows = t.ops.map((code, i) => ({
      template_id: tplRow.id,
      seq: i + 1,
      op_code: code,
      hold_point_after: null,    // inherit from production_op_library.default_hold_point_after
    }));

    const { error: insErr } = await supabaseAdmin
      .from("production_routing_template_op")
      .insert(opRows);
    if (insErr) {
      console.error(`failed to insert ops for ${t.name}:`, insErr);
      process.exit(1);
    }

    console.log(`seeded template ${t.process_family} / ${t.name} (${t.ops.length} ops)`);
  }
}

main();
