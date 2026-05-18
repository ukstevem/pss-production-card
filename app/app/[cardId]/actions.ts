"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function addPart(cardId: string, formData: FormData) {
  const description = String(formData.get("description") ?? "").trim() || null;
  const material_spec = String(formData.get("material_spec") ?? "").trim() || null;
  const qty = Math.max(1, parseInt(String(formData.get("qty") ?? "1"), 10) || 1);
  const weightStr = String(formData.get("weight") ?? "").trim();
  const weight = weightStr === "" ? null : parseFloat(weightStr);

  const supabase = getSupabaseAdmin();

  // Pick next seq.
  const { data: existing, error: seqErr } = await supabase
    .from("production_card_part")
    .select("seq")
    .eq("card_id", cardId)
    .order("seq", { ascending: false })
    .limit(1);
  if (seqErr) throw new Error(`seq lookup failed: ${seqErr.message}`);
  const nextSeq = (existing?.[0]?.seq ?? 0) + 1;

  // Primary drawing is linked on the part detail page after creation.
  // App-layer enforces non-null primary_drawing_doc_id at card issue (see b5t).
  const { error } = await supabase.from("production_card_part").insert({
    card_id: cardId,
    seq: nextSeq,
    description,
    qty,
    weight,
    material_spec,
  });
  if (error) throw new Error(`addPart failed: ${error.message}`);

  revalidatePath(`/${cardId}/`);
}

export async function deleteCard(cardId: string) {
  const supabase = getSupabaseAdmin();
  // Guard: only allow deleting drafts.
  const { data: card, error: lookupErr } = await supabase
    .from("production_card")
    .select("state")
    .eq("id", cardId)
    .single();
  if (lookupErr || !card) throw new Error("card not found");
  if (card.state !== "draft") {
    throw new Error("only draft cards can be deleted");
  }

  const { error } = await supabase.from("production_card").delete().eq("id", cardId);
  if (error) throw new Error(`deleteCard failed: ${error.message}`);

  redirect(`/`);
}
