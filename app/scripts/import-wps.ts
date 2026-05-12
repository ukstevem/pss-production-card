import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "./lib/supabase-admin.js";

type WpsRow = {
  wps_no: string;
  standard: string | null;
  process: string | null;
  joint_type: string | null;
  material_grade: string | null;
  thickness: string | null;
  diameter: string | null;
  consumable_spec: string | null;
  gas_flux: string | null;
  position: string | null;
  mode_of_transfer: string | null;
  preheat: string | null;
  charpy_test: string | null;
  range_of_qualification: Record<string, string | null>;
  attributes: Record<string, string | null>;
};

async function main() {
  const dataPath = resolve(process.cwd(), "scripts/data/wps.json");
  const raw = readFileSync(dataPath, "utf-8");
  const wpsList = JSON.parse(raw) as WpsRow[];

  if (!Array.isArray(wpsList) || wpsList.length === 0) {
    console.error(`no WPS rows in ${dataPath}`);
    process.exit(1);
  }

  // Strip null-valued keys from jsonb blobs so the DB columns stay tidy.
  const cleanJson = (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ""));

  const rows = wpsList.map((w) => ({
    wps_no: w.wps_no,
    standard: w.standard,
    process: w.process,
    joint_type: w.joint_type,
    material_grade: w.material_grade,
    thickness: w.thickness,
    diameter: w.diameter,
    consumable_spec: w.consumable_spec,
    gas_flux: w.gas_flux,
    position: w.position,
    mode_of_transfer: w.mode_of_transfer,
    preheat: w.preheat,
    charpy_test: w.charpy_test,
    range_of_qualification: cleanJson(w.range_of_qualification ?? {}),
    attributes: cleanJson(w.attributes ?? {}),
    active: true,
  }));

  // Upsert in chunks to keep payloads reasonable.
  const chunkSize = 50;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("welding_wps")
      .upsert(chunk, { onConflict: "wps_no" })
      .select("wps_no");
    if (error) {
      console.error(`import-wps chunk failed at i=${i}:`, error);
      process.exit(1);
    }
    total += data?.length ?? 0;
  }

  console.log(`imported ${total} WPS rows into welding_wps`);
}

main();
