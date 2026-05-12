"use server";

import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function createCard(formData: FormData) {
  const project_register_item_id = String(formData.get("project_register_item_id") ?? "");
  const variantRaw = String(formData.get("variant") ?? "");

  if (!project_register_item_id) throw new Error("project_register_item_id required");
  if (variantRaw !== "shop" && variantRaw !== "site") throw new Error("variant must be shop or site");

  const supabase = getSupabaseAdmin();

  // Read exc_class from the item to denormalise onto the card at issue time.
  // (We set it on creation too, so it's visible while drafting.)
  const { data: item, error: itemErr } = await supabase
    .from("project_register_items")
    .select("exc_class")
    .eq("id", project_register_item_id)
    .single();

  if (itemErr || !item) {
    throw new Error(`Item lookup failed: ${itemErr?.message ?? "not found"}`);
  }

  const { data: card, error: cardErr } = await supabase
    .from("production_card")
    .insert({
      project_register_item_id,
      variant: variantRaw,
      exc_class: item.exc_class,
      state: "draft",
    })
    .select("id")
    .single();

  if (cardErr || !card) {
    throw new Error(`Card create failed: ${cardErr?.message ?? "no row returned"}`);
  }

  redirect(`/production-card/${card.id}/`);
}
