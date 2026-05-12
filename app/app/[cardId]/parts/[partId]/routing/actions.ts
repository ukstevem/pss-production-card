"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function getOpLibrary() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_op_library")
    .select("code, required_role, default_hold_point_after");
  if (error) throw new Error(`op library lookup failed: ${error.message}`);
  return new Map((data ?? []).map((o) => [o.code, o]));
}

async function revalidate(cardId: string, partId: string) {
  revalidatePath(`/production-card/${cardId}/parts/${partId}/routing/`);
  revalidatePath(`/production-card/${cardId}/`);
}

export async function applyTemplate(cardId: string, partId: string, templateId: string) {
  const supabase = getSupabaseAdmin();
  const lib = await getOpLibrary();

  const { data: templateOps, error: tErr } = await supabase
    .from("production_routing_template_op")
    .select("seq, op_code, hold_point_after")
    .eq("template_id", templateId)
    .order("seq", { ascending: true });
  if (tErr) throw new Error(`template lookup failed: ${tErr.message}`);

  // Wipe existing ops on this part.
  const { error: delErr } = await supabase
    .from("production_card_part_op")
    .delete()
    .eq("card_part_id", partId);
  if (delErr) throw new Error(`clear ops failed: ${delErr.message}`);

  if ((templateOps ?? []).length === 0) {
    await revalidate(cardId, partId);
    return;
  }

  const rows = (templateOps ?? []).map((t, i) => {
    const meta = lib.get(t.op_code);
    if (!meta) throw new Error(`unknown op_code in template: ${t.op_code}`);
    return {
      card_part_id: partId,
      seq: i + 1,
      op_code: t.op_code,
      required_role: meta.required_role,
      hold_point_after: t.hold_point_after ?? meta.default_hold_point_after,
      state: "pending",
    };
  });

  const { error } = await supabase.from("production_card_part_op").insert(rows);
  if (error) throw new Error(`apply template failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function addOp(cardId: string, partId: string, formData: FormData) {
  const op_code = String(formData.get("op_code") ?? "").trim();
  if (!op_code) throw new Error("op_code required");

  const supabase = getSupabaseAdmin();
  const lib = await getOpLibrary();
  const meta = lib.get(op_code);
  if (!meta) throw new Error(`unknown op_code: ${op_code}`);

  const { data: existing, error: seqErr } = await supabase
    .from("production_card_part_op")
    .select("seq")
    .eq("card_part_id", partId)
    .order("seq", { ascending: false })
    .limit(1);
  if (seqErr) throw new Error(`seq lookup failed: ${seqErr.message}`);
  const nextSeq = (existing?.[0]?.seq ?? 0) + 1;

  const { error } = await supabase.from("production_card_part_op").insert({
    card_part_id: partId,
    seq: nextSeq,
    op_code,
    required_role: meta.required_role,
    hold_point_after: meta.default_hold_point_after,
    state: "pending",
  });
  if (error) throw new Error(`addOp failed: ${error.message}`);

  await revalidate(cardId, partId);
}

export async function removeOp(cardId: string, opId: string) {
  const supabase = getSupabaseAdmin();
  const { data: row, error: lookErr } = await supabase
    .from("production_card_part_op")
    .select("card_part_id")
    .eq("id", opId)
    .single();
  if (lookErr || !row) throw new Error("op not found");

  const { error } = await supabase.from("production_card_part_op").delete().eq("id", opId);
  if (error) throw new Error(`removeOp failed: ${error.message}`);

  await revalidate(cardId, row.card_part_id);
}

export async function moveOp(cardId: string, opId: string, direction: "up" | "down") {
  const supabase = getSupabaseAdmin();

  const { data: target, error: tErr } = await supabase
    .from("production_card_part_op")
    .select("id, seq, card_part_id")
    .eq("id", opId)
    .single();
  if (tErr || !target) throw new Error("op not found");

  const op = direction === "up" ? "lt" : "gt";
  const order = direction === "up" ? false : true; // up: prev row = highest seq below; down: next = lowest seq above
  const { data: sibling, error: sErr } = await supabase
    .from("production_card_part_op")
    .select("id, seq")
    .eq("card_part_id", target.card_part_id)
    [op]("seq", target.seq)
    .order("seq", { ascending: order })
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(`sibling lookup failed: ${sErr.message}`);
  if (!sibling) {
    await revalidate(cardId, target.card_part_id);
    return; // already at end
  }

  // Swap seq via a temporary -1 to avoid the unique (card_part_id, seq) constraint.
  const tmp = -1 * (target.seq + 1);
  const upd1 = await supabase.from("production_card_part_op").update({ seq: tmp }).eq("id", target.id);
  if (upd1.error) throw new Error(`move step 1 failed: ${upd1.error.message}`);
  const upd2 = await supabase.from("production_card_part_op").update({ seq: target.seq }).eq("id", sibling.id);
  if (upd2.error) throw new Error(`move step 2 failed: ${upd2.error.message}`);
  const upd3 = await supabase.from("production_card_part_op").update({ seq: sibling.seq }).eq("id", target.id);
  if (upd3.error) throw new Error(`move step 3 failed: ${upd3.error.message}`);

  await revalidate(cardId, target.card_part_id);
}

export async function setOpWps(cardId: string, opId: string, formData: FormData) {
  const wpsRaw = String(formData.get("wps_id") ?? "").trim();
  const wps_id = wpsRaw === "" ? null : wpsRaw;

  const supabase = getSupabaseAdmin();
  const { data: row, error: lookErr } = await supabase
    .from("production_card_part_op")
    .select("card_part_id")
    .eq("id", opId)
    .single();
  if (lookErr || !row) throw new Error("op not found");

  const { error } = await supabase
    .from("production_card_part_op")
    .update({ wps_id })
    .eq("id", opId);
  if (error) throw new Error(`setOpWps failed: ${error.message}`);

  await revalidate(cardId, row.card_part_id);
}

export async function toggleHoldPoint(cardId: string, opId: string) {
  const supabase = getSupabaseAdmin();
  const { data: row, error: lookErr } = await supabase
    .from("production_card_part_op")
    .select("card_part_id, hold_point_after")
    .eq("id", opId)
    .single();
  if (lookErr || !row) throw new Error("op not found");

  const { error } = await supabase
    .from("production_card_part_op")
    .update({ hold_point_after: !row.hold_point_after })
    .eq("id", opId);
  if (error) throw new Error(`toggleHoldPoint failed: ${error.message}`);

  await revalidate(cardId, row.card_part_id);
}
