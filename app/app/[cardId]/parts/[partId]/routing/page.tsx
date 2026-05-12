import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@platform/ui";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  OpLibraryRow,
  ProductionCardPart,
  ProductionCardPartOp,
  RoutingTemplate,
  WpsRow,
} from "@/lib/types";
import {
  addOp,
  applyTemplate,
  moveOp,
  removeOp,
  setOpWps,
  toggleHoldPoint,
} from "./actions";

export const dynamic = "force-dynamic";

async function fetchPart(partId: string): Promise<ProductionCardPart | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_card_part")
    .select(
      "id, card_id, seq, drawing_number, drawing_rev, description, qty, weight, material_spec, material_doc_id, material_po_id, state, notes"
    )
    .eq("id", partId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProductionCardPart;
}

async function fetchOps(partId: string): Promise<ProductionCardPartOp[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_card_part_op")
    .select(
      "id, card_part_id, seq, op_code, required_role, hold_point_after, wps_id, state, planned_duration_minutes, notes"
    )
    .eq("card_part_id", partId)
    .order("seq", { ascending: true });
  if (error) return [];
  return (data ?? []) as ProductionCardPartOp[];
}

async function fetchLibrary(): Promise<OpLibraryRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_op_library")
    .select("code, label, required_role, default_hold_point_after, category, description, active")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("code", { ascending: true });
  if (error) return [];
  return (data ?? []) as OpLibraryRow[];
}

async function fetchTemplates(): Promise<RoutingTemplate[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("production_routing_template")
    .select("id, name, process_family, description, active")
    .eq("active", true)
    .order("process_family", { ascending: true });
  if (error) return [];
  return (data ?? []) as RoutingTemplate[];
}

async function fetchWpsList(): Promise<WpsRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("welding_wps")
    .select("id, wps_no, process, material_grade, position, joint_type, active")
    .eq("active", true)
    .order("wps_no", { ascending: true });
  if (error) return [];
  return (data ?? []) as WpsRow[];
}

async function isDraft(cardId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("production_card")
    .select("state")
    .eq("id", cardId)
    .single();
  return data?.state === "draft";
}

export default async function RoutingPage({
  params,
}: {
  params: Promise<{ cardId: string; partId: string }>;
}) {
  const { cardId, partId } = await params;
  const part = await fetchPart(partId);
  if (!part || part.card_id !== cardId) notFound();

  const [ops, library, templates, wpsList, editable] = await Promise.all([
    fetchOps(partId),
    fetchLibrary(),
    fetchTemplates(),
    fetchWpsList(),
    isDraft(cardId),
  ]);

  const libByCode = new Map(library.map((o) => [o.code, o]));

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title={`Routing — ${part.drawing_number ?? `part ${part.seq}`}`}
        backHref={`/${cardId}/`}
      />

      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
        <Field label="Part #">{part.seq}</Field>
        <Field label="Drawing rev">{part.drawing_rev ?? "—"}</Field>
        <Field label="Qty">{part.qty}</Field>
        <Field label="Material">{part.material_spec ?? "—"}</Field>
        <Field label="State">{part.state}</Field>
      </dl>

      {!editable && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This card has been issued — routing is read-only.
        </div>
      )}

      {editable && (
        <section className="mb-8 rounded-lg border border-zinc-200 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Apply template</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Applying a template <strong>replaces</strong> the current op list.
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <form key={t.id} action={applyTemplate.bind(null, cardId, partId, t.id)}>
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
                  title={t.description ?? undefined}
                >
                  {t.name}{" "}
                  <span className="text-zinc-500">({t.process_family})</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-3 text-base font-semibold">Ops</h2>

      {ops.length === 0 ? (
        <EmptyState message="No ops yet. Apply a template or add ops manually." />
      ) : (
        <div className="mb-6 overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 w-12">Seq</th>
                <th className="px-3 py-2">Op</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">WPS</th>
                <th className="px-3 py-2">Hold</th>
                <th className="px-3 py-2">State</th>
                {editable && <th className="px-3 py-2 w-32"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {ops.map((op, idx) => {
                const lib = libByCode.get(op.op_code);
                const isWeld = op.op_code === "weld" || op.op_code === "site-weld";
                return (
                  <tr key={op.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 font-mono text-xs">{op.seq}</td>
                    <td className="px-3 py-3">
                      <span className="font-medium">{lib?.label ?? op.op_code}</span>
                      <span className="ml-1 font-mono text-xs text-zinc-500">{op.op_code}</span>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{op.required_role}</td>
                    <td className="px-3 py-3">
                      {isWeld ? (
                        editable ? (
                          <form action={setOpWps.bind(null, cardId, op.id)} className="flex items-center gap-1">
                            <select
                              name="wps_id"
                              defaultValue={op.wps_id ?? ""}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs"
                            >
                              <option value="">— pick WPS —</option>
                              {wpsList.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.wps_no} · {w.process ?? ""}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                            >
                              Save
                            </button>
                          </form>
                        ) : op.wps_id ? (
                          <span className="font-mono text-xs">{wpsList.find((w) => w.id === op.wps_id)?.wps_no ?? op.wps_id.slice(0, 8)}</span>
                        ) : (
                          <span className="text-xs text-red-600">missing</span>
                        )
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editable ? (
                        <form action={toggleHoldPoint.bind(null, cardId, op.id)}>
                          <button
                            type="submit"
                            className={`rounded px-2 py-0.5 text-xs ${op.hold_point_after ? "bg-amber-200 text-amber-900" : "bg-zinc-100 text-zinc-600"}`}
                          >
                            {op.hold_point_after ? "Hold ✓" : "No hold"}
                          </button>
                        </form>
                      ) : (
                        <span className={op.hold_point_after ? "text-amber-700" : "text-zinc-400"}>
                          {op.hold_point_after ? "✓" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{op.state}</td>
                    {editable && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <form action={moveOp.bind(null, cardId, op.id, "up")}>
                            <button
                              type="submit"
                              disabled={idx === 0}
                              className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-50 disabled:opacity-30"
                              title="Move up"
                            >
                              ↑
                            </button>
                          </form>
                          <form action={moveOp.bind(null, cardId, op.id, "down")}>
                            <button
                              type="submit"
                              disabled={idx === ops.length - 1}
                              className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-50 disabled:opacity-30"
                              title="Move down"
                            >
                              ↓
                            </button>
                          </form>
                          <form action={removeOp.bind(null, cardId, op.id)}>
                            <button
                              type="submit"
                              className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Add op</h2>
          <form action={addOp.bind(null, cardId, partId)} className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[14rem]">
              <span className="block text-xs text-zinc-600 mb-1">Operation</span>
              <select
                name="op_code"
                required
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">— pick op —</option>
                {Object.entries(groupByCategory(library)).map(([cat, ops]) => (
                  <optgroup key={cat} label={cat}>
                    {ops.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label} ({o.code})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Append op
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function groupByCategory(library: OpLibraryRow[]): Record<string, OpLibraryRow[]> {
  return library.reduce<Record<string, OpLibraryRow[]>>((acc, o) => {
    (acc[o.category] ??= []).push(o);
    return acc;
  }, {});
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium text-zinc-900">{children}</dd>
    </div>
  );
}
