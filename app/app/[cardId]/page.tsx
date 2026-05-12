import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@platform/ui";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ProductionCardPart } from "@/lib/types";
import { addPart, deleteCard } from "./actions";

export const dynamic = "force-dynamic";

type CardWithJoins = {
  id: string;
  doc_id: string | null;
  variant: "shop" | "site";
  exc_class: number | null;
  card_rev: number;
  state: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  project_register_items: {
    projectnumber: string;
    item_seq: number;
    line_desc: string | null;
  } | null;
  document_incoming_scan: { doc_number: string | null } | null;
};

async function fetchCard(cardId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_card")
    .select(
      `id, doc_id, variant, exc_class, card_rev, state, notes, created_at, updated_at,
       project_register_items!inner(projectnumber, item_seq, line_desc),
       document_incoming_scan(doc_number)`
    )
    .eq("id", cardId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as CardWithJoins;
}

async function fetchParts(cardId: string): Promise<ProductionCardPart[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_card_part")
    .select(
      "id, card_id, seq, drawing_number, drawing_rev, description, qty, weight, material_spec, material_doc_id, material_po_id, state, notes"
    )
    .eq("card_id", cardId)
    .order("seq", { ascending: true });

  if (error) {
    console.error("[card-detail] fetchParts failed:", error);
    return [];
  }
  return (data ?? []) as ProductionCardPart[];
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await fetchCard(cardId);
  if (!card) notFound();

  const parts = await fetchParts(cardId);
  const pri = card.project_register_items;
  const docNumber = card.document_incoming_scan?.doc_number ?? null;
  const isDraft = card.state === "draft";

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title={docNumber ?? `Draft card · ${cardId.slice(0, 8)}`}
        backHref="/production-card/"
      >
        {isDraft && (
          <form action={deleteCard.bind(null, cardId)}>
            <button
              type="submit"
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete draft
            </button>
          </form>
        )}
      </PageHeader>

      <dl className="mb-8 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <Field label="Project · Item">
          {pri ? `${pri.projectnumber}-${String(pri.item_seq).padStart(2, "0")}` : "—"}
        </Field>
        <Field label="Variant" className="capitalize">{card.variant}</Field>
        <Field label="EXC class">{card.exc_class ?? "—"}</Field>
        <Field label="State">{card.state}</Field>
        <Field label="Card revision">{card.card_rev}</Field>
        <Field label="Created">
          {new Date(card.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
        </Field>
        <Field label="Updated">
          {new Date(card.updated_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
        </Field>
      </dl>

      {pri?.line_desc && (
        <p className="mb-8 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700">
          <strong className="font-medium">Item description:</strong> {pri.line_desc}
        </p>
      )}

      <h2 className="mb-3 text-base font-semibold">Parts</h2>

      {parts.length === 0 ? (
        <EmptyState message="No parts yet. Add the first part below." />
      ) : (
        <div className="mb-6 overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Drawing</th>
                <th className="px-3 py-2">Rev</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Routing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {parts.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-3 font-mono text-xs">{p.seq}</td>
                  <td className="px-3 py-3 font-mono text-xs">{p.drawing_number ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-zinc-600">{p.drawing_rev ?? "—"}</td>
                  <td className="px-3 py-3 text-zinc-700">{p.description ?? "—"}</td>
                  <td className="px-3 py-3">{p.qty}</td>
                  <td className="px-3 py-3 text-zinc-600">{p.weight ?? "—"}</td>
                  <td className="px-3 py-3 text-zinc-600">{p.material_spec ?? "—"}</td>
                  <td className="px-3 py-3 text-zinc-600">{p.state}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/production-card/${cardId}/parts/${p.id}/routing/`}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Edit routing →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isDraft && (
        <form action={addPart.bind(null, cardId)} className="rounded-lg border border-zinc-200 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-700">Add part</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <label className="col-span-2 md:col-span-2">
              <span className="block text-xs text-zinc-600 mb-1">Drawing number</span>
              <input name="drawing_number" className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label>
              <span className="block text-xs text-zinc-600 mb-1">Rev</span>
              <input name="drawing_rev" className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label>
              <span className="block text-xs text-zinc-600 mb-1">Qty</span>
              <input name="qty" type="number" min={1} defaultValue={1} required className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label>
              <span className="block text-xs text-zinc-600 mb-1">Weight (kg)</span>
              <input name="weight" type="number" step="0.01" min={0} className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="col-span-2 md:col-span-3">
              <span className="block text-xs text-zinc-600 mb-1">Description</span>
              <input name="description" className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="col-span-2 md:col-span-3">
              <span className="block text-xs text-zinc-600 mb-1">Material spec</span>
              <input name="material_spec" placeholder="e.g. S355 J2+N 12mm PL" className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Add part
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-1 font-medium text-zinc-900 ${className ?? ""}`}>{children}</dd>
    </div>
  );
}
