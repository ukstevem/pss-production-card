import Link from "next/link";
import { PageHeader, EmptyState } from "@platform/ui";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CardListRow } from "@/lib/types";

const STATE_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-zinc-200 text-zinc-800" },
  submitted_for_qc: { label: "Submitted for QC", tone: "bg-yellow-100 text-yellow-800" },
  issued: { label: "Issued", tone: "bg-blue-100 text-blue-800" },
  in_progress: { label: "In Progress", tone: "bg-amber-100 text-amber-800" },
  on_hold: { label: "On Hold", tone: "bg-red-100 text-red-800" },
  awaiting_final_inspection: { label: "Awaiting Final", tone: "bg-purple-100 text-purple-800" },
  complete: { label: "Complete", tone: "bg-green-100 text-green-800" },
  closed: { label: "Closed", tone: "bg-zinc-300 text-zinc-900" },
  cancelled: { label: "Cancelled", tone: "bg-zinc-200 text-zinc-500 line-through" },
  superseded: { label: "Superseded", tone: "bg-zinc-200 text-zinc-500 line-through" },
};

export const dynamic = "force-dynamic";

async function fetchCards(): Promise<CardListRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_card")
    .select(
      `id, issued_doc_id, closed_doc_id, project_register_item_id, variant, exc_class, state,
       required_final_inspections, ndt_coverage_percent,
       issued_by, issued_at, qc_signed_by, qc_signed_at, closed_by, closed_at,
       superseded_by_card_id, notes, created_at, updated_at,
       project_register_items!inner(projectnumber, item_seq, line_desc),
       issued_doc:document_incoming_scan!issued_doc_id(doc_number),
       closed_doc:document_incoming_scan!closed_doc_id(doc_number)`
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[production-card] fetchCards failed:", error);
    return [];
  }

  return (data ?? []).map((r) => {
    const row = r as unknown as {
      project_register_items?:
        | { projectnumber: string; item_seq: number; line_desc: string | null }
        | { projectnumber: string; item_seq: number; line_desc: string | null }[]
        | null;
      issued_doc?: { doc_number: string | null } | { doc_number: string | null }[] | null;
      closed_doc?: { doc_number: string | null } | { doc_number: string | null }[] | null;
    };
    const pri = Array.isArray(row.project_register_items)
      ? row.project_register_items[0]
      : row.project_register_items;
    const issued = Array.isArray(row.issued_doc) ? row.issued_doc[0] : row.issued_doc;
    const closed = Array.isArray(row.closed_doc) ? row.closed_doc[0] : row.closed_doc;
    return {
      ...(r as object),
      projectnumber: pri?.projectnumber ?? "",
      item_seq: pri?.item_seq ?? 0,
      line_desc: pri?.line_desc ?? null,
      issued_doc_number: issued?.doc_number ?? null,
      closed_doc_number: closed?.doc_number ?? null,
    } as CardListRow;
  });
}

export default async function Home() {
  const cards = await fetchCards();

  return (
    <div className="p-8">
      <PageHeader title="Production Cards">
        <Link
          href="/new/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          New card
        </Link>
      </PageHeader>

      {cards.length === 0 ? (
        <div className="mt-8">
          <EmptyState message="No cards yet. Create the first production card to begin." />
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2">Doc / Card</th>
                <th className="px-4 py-2">Project · Item</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Variant</th>
                <th className="px-4 py-2">EXC</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {cards.map((c) => {
                const sl = STATE_LABEL[c.state] ?? { label: c.state, tone: "bg-zinc-100 text-zinc-700" };
                return (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/${c.id}/`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {c.issued_doc_number ?? `draft · ${c.id.slice(0, 8)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {c.projectnumber}-{String(c.item_seq).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{c.line_desc ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 capitalize">{c.variant}</td>
                    <td className="px-4 py-3 text-zinc-600">{c.exc_class ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sl.tone}`}>
                        {sl.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(c.updated_at).toLocaleString("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
