"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// 61355 description ID 173 = "MANUFACTURING DRAWING" (subclass TC). Used
// when filing uploads from the planner UI through the document service.
const DRAWING_DESCRIPTION_ID = 173;

async function revalidate(cardId: string, partId: string) {
  revalidatePath(`/${cardId}/parts/${partId}/`);
  revalidatePath(`/${cardId}/`);
}

export async function updatePart(cardId: string, partId: string, formData: FormData) {
  const drawing_number = (formData.get("drawing_number") as string)?.trim() || null;
  const drawing_rev = (formData.get("drawing_rev") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const material_spec = (formData.get("material_spec") as string)?.trim() || null;
  const qty = Math.max(1, parseInt((formData.get("qty") as string) ?? "1", 10) || 1);
  const wStr = ((formData.get("weight") as string) ?? "").trim();
  const weight = wStr === "" ? null : parseFloat(wStr);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("production_card_part")
    .update({ drawing_number, drawing_rev, description, qty, weight, material_spec })
    .eq("id", partId);
  if (error) throw new Error(`updatePart failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function addDrawings(cardId: string, partId: string, formData: FormData) {
  const docIds = formData.getAll("doc_id").map((v) => String(v)).filter(Boolean);
  if (docIds.length === 0) return;

  const rows = docIds.map((doc_id) => ({ card_part_id: partId, doc_id }));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("production_card_part_drawing")
    .upsert(rows, { onConflict: "card_part_id,doc_id", ignoreDuplicates: true });
  if (error) throw new Error(`addDrawings failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function removeDrawing(cardId: string, partId: string, docId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("production_card_part_drawing")
    .delete()
    .eq("card_part_id", partId)
    .eq("doc_id", docId);
  if (error) throw new Error(`removeDrawing failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function addPos(cardId: string, partId: string, formData: FormData) {
  const poIds = formData.getAll("po_id").map((v) => String(v)).filter(Boolean);
  if (poIds.length === 0) return;

  const rows = poIds.map((po_id) => ({ card_part_id: partId, po_id }));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("production_card_part_po")
    .upsert(rows, { onConflict: "card_part_id,po_id", ignoreDuplicates: true });
  if (error) throw new Error(`addPos failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function removePo(cardId: string, partId: string, poId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("production_card_part_po")
    .delete()
    .eq("card_part_id", partId)
    .eq("po_id", poId);
  if (error) throw new Error(`removePo failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function uploadDrawing(
  cardId: string,
  partId: string,
  projectnumber: string,
  formData: FormData
) {
  const docServiceUrl = process.env.DOC_SERVICE_URL;
  const apiKey = process.env.DOC_SERVICE_API_KEY;
  if (!docServiceUrl) throw new Error("DOC_SERVICE_URL not set");
  if (!apiKey) throw new Error("DOC_SERVICE_API_KEY not set — get one from doc service admin and set in env");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("no file uploaded");

  const upload = new FormData();
  upload.append("file", file);
  upload.append("iso_description_id", String(DRAWING_DESCRIPTION_ID));
  upload.append("project_number", projectnumber);

  const resp = await fetch(`${docServiceUrl}/api/file`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: upload,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`doc service upload failed (${resp.status}): ${text.slice(0, 500)}`);
  }

  // Upload SUCCEEDS but does NOT auto-link — planner must tick it in the
  // picker after upload (revalidate will make it appear in the list).
  await revalidate(cardId, partId);
}
