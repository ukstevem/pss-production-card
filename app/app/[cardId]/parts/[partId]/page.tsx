import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@platform/ui";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  addDrawings,
  addPos,
  removeDrawing,
  removePo,
  updatePart,
  uploadDrawing,
} from "./actions";

export const dynamic = "force-dynamic";

// 61355 subclass IDs for class T (manufacturing + erection drawings).
const DRAWING_SUBCLASS_IDS = [71, 72, 73, 74];

type PartDetail = {
  id: string;
  card_id: string;
  seq: number;
  drawing_number: string | null;
  drawing_rev: string | null;
  description: string | null;
  qty: number;
  weight: number | null;
  material_spec: string | null;
  state: string;
};

type CardLite = {
  state: string;
  variant: string;
  exc_class: number | null;
  project_register_items: { projectnumber: string; item_seq: number } | null;
};

type Drawing = {
  id: string;
  doc_number: string | null;
  file_name: string;
  filed_path: string | null;
  iso_description_id: number | null;
};

type Po = {
  id: string;
  po_number: number | null;
  reference: string | null;
  status: string | null;
};

async function fetchPart(partId: string): Promise<PartDetail | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("production_card_part")
    .select(
      "id, card_id, seq, drawing_number, drawing_rev, description, qty, weight, material_spec, state"
    )
    .eq("id", partId)
    .maybeSingle();
  return (data as PartDetail) ?? null;
}

async function fetchCard(cardId: string): Promise<CardLite | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("production_card")
    .select(
      "state, variant, exc_class, project_register_items!inner(projectnumber, item_seq)"
    )
    .eq("id", cardId)
    .maybeSingle();
  return (data as unknown as CardLite) ?? null;
}

async function fetchAvailableDrawings(projectnumber: string): Promise<Drawing[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("document_incoming_scan")
    .select("id, doc_number, file_name, filed_path, iso_description_id, iso_subclass_id")
    .eq("project_number", projectnumber)
    .in("iso_subclass_id", DRAWING_SUBCLASS_IDS)
    .order("doc_number", { ascending: false });
  if (error) {
    console.error("[part] fetchAvailableDrawings failed:", error);
    return [];
  }
  return ((data ?? []) as Drawing[]);
}

async function fetchLinkedDrawingIds(partId: string): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("production_card_part_drawing")
    .select("doc_id")
    .eq("card_part_id", partId);
  return new Set((data ?? []).map((r) => r.doc_id));
}

async function fetchAvailablePos(projectnumber: string): Promise<Po[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, reference, status")
    .eq("project_id", projectnumber)
    .order("po_number", { ascending: false });
  if (error) {
    console.error("[part] fetchAvailablePos failed:", error);
    return [];
  }
  return (data ?? []) as Po[];
}

async function fetchLinkedPoIds(partId: string): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("production_card_part_po")
    .select("po_id")
    .eq("card_part_id", partId);
  return new Set((data ?? []).map((r) => r.po_id));
}

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ cardId: string; partId: string }>;
}) {
  const { cardId, partId } = await params;
  const part = await fetchPart(partId);
  if (!part || part.card_id !== cardId) notFound();
  const card = await fetchCard(cardId);
  if (!card) notFound();

  const projectnumber = card.project_register_items?.projectnumber ?? "";
  const isDraft = card.state === "draft";

  const [drawings, linkedDrawingIds, pos, linkedPoIds] = await Promise.all([
    fetchAvailableDrawings(projectnumber),
    fetchLinkedDrawingIds(partId),
    fetchAvailablePos(projectnumber),
    fetchLinkedPoIds(partId),
  ]);

  const linkedDrawings = drawings.filter((d) => linkedDrawingIds.has(d.id));
  const linkedPos = pos.filter((p) => linkedPoIds.has(p.id));

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <PageHeader
        title={`Part ${part.seq} — ${part.drawing_number ?? "(no drawing)"}`}
        backHref={`/${cardId}/`}
      >
        <Link
          href={`/${cardId}/parts/${partId}/routing/`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          Edit routing →
        </Link>
      </PageHeader>

      {/* Part fields */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-700">Part details</h2>
        {isDraft ? (
          <form action={updatePart.bind(null, cardId, partId)} className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Input label="Drawing number" name="drawing_number" defaultValue={part.drawing_number ?? ""} colSpan={2} />
            <Input label="Rev" name="drawing_rev" defaultValue={part.drawing_rev ?? ""} />
            <Input label="Qty" name="qty" type="number" min={1} defaultValue={String(part.qty)} required />
            <Input label="Weight (kg)" name="weight" type="number" step="0.01" defaultValue={part.weight != null ? String(part.weight) : ""} />
            <Input label="Description" name="description" defaultValue={part.description ?? ""} colSpan={3} />
            <Input label="Material spec" name="material_spec" defaultValue={part.material_spec ?? ""} colSpan={3} />
            <div className="col-span-2 md:col-span-6 flex justify-end">
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                Save
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Field label="Drawing">{part.drawing_number ?? "—"}</Field>
            <Field label="Rev">{part.drawing_rev ?? "—"}</Field>
            <Field label="Qty">{part.qty}</Field>
            <Field label="Weight">{part.weight ?? "—"}</Field>
            <Field label="Description" wide>{part.description ?? "—"}</Field>
            <Field label="Material spec" wide>{part.material_spec ?? "—"}</Field>
          </dl>
        )}
      </section>

      {/* Drawings */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-700">
          Drawings <span className="text-zinc-400">({linkedDrawings.length} linked / {drawings.length} available for project {projectnumber})</span>
        </h2>

        {linkedDrawings.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {linkedDrawings.map((d) => (
              <li key={d.id} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs">
                <a href={d.filed_path ?? "#"} target="_blank" rel="noreferrer" className="font-mono font-medium text-blue-800 hover:underline">
                  {d.doc_number ?? d.file_name}
                </a>
                {isDraft && (
                  <form action={removeDrawing.bind(null, cardId, partId, d.id)}>
                    <button type="submit" className="text-blue-600 hover:text-red-600" title="Unlink">✕</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {isDraft && (
          <>
            {drawings.length === 0 ? (
              <p className="text-xs text-zinc-500">No drawings filed yet for project {projectnumber}. Upload one below.</p>
            ) : (
              <form action={addDrawings.bind(null, cardId, partId)} className="mb-4 space-y-2">
                <p className="text-xs text-zinc-600">Tick to link to this part:</p>
                <div className="max-h-60 overflow-y-auto rounded border border-zinc-200 p-2 space-y-1">
                  {drawings.map((d) => {
                    const isLinked = linkedDrawingIds.has(d.id);
                    return (
                      <label key={d.id} className={`flex items-center gap-2 text-xs cursor-pointer ${isLinked ? "opacity-40" : ""}`}>
                        <input type="checkbox" name="doc_id" value={d.id} disabled={isLinked} />
                        <span className="font-mono">{d.doc_number ?? "—"}</span>
                        <span className="text-zinc-500">{d.file_name}</span>
                        {isLinked && <span className="text-blue-700">(linked)</span>}
                      </label>
                    );
                  })}
                </div>
                <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
                  Link selected
                </button>
              </form>
            )}

            <form action={uploadDrawing.bind(null, cardId, partId, projectnumber)} encType="multipart/form-data" className="rounded-lg border border-dashed border-zinc-300 p-4">
              <p className="mb-2 text-xs font-medium text-zinc-700">Upload a new drawing (PDF)</p>
              <p className="mb-3 text-xs text-zinc-500">
                Files to the document service as 61355 MANUFACTURING DRAWING tagged with project {projectnumber}.
                Upload alone does not link to this part — tick it in the picker above after upload.
              </p>
              <div className="flex items-center gap-3">
                <input type="file" name="file" accept="application/pdf" required className="text-xs" />
                <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                  Upload
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {/* POs */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-700">
          Purchase orders <span className="text-zinc-400">({linkedPos.length} linked / {pos.length} on project {projectnumber})</span>
        </h2>

        {linkedPos.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {linkedPos.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs">
                <span className="font-mono font-medium text-emerald-900">
                  PO {p.po_number}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                {isDraft && (
                  <form action={removePo.bind(null, cardId, partId, p.id)}>
                    <button type="submit" className="text-emerald-700 hover:text-red-600" title="Unlink">✕</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {isDraft && (
          pos.length === 0 ? (
            <EmptyState message={`No POs on project ${projectnumber}.`} />
          ) : (
            <form action={addPos.bind(null, cardId, partId)} className="space-y-2">
              <p className="text-xs text-zinc-600">Tick to link to this part:</p>
              <div className="max-h-60 overflow-y-auto rounded border border-zinc-200 p-2 space-y-1">
                {pos.map((p) => {
                  const isLinked = linkedPoIds.has(p.id);
                  return (
                    <label key={p.id} className={`flex items-center gap-2 text-xs cursor-pointer ${isLinked ? "opacity-40" : ""}`}>
                      <input type="checkbox" name="po_id" value={p.id} disabled={isLinked} />
                      <span className="font-mono">PO {p.po_number}</span>
                      <span className="text-zinc-500">{p.reference ?? ""}</span>
                      <span className="text-zinc-400">[{p.status}]</span>
                      {isLinked && <span className="text-emerald-700">(linked)</span>}
                    </label>
                  );
                })}
              </div>
              <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
                Link selected
              </button>
            </form>
          )
        )}
      </section>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-4" : ""}>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function Input({
  label,
  name,
  defaultValue,
  type = "text",
  step,
  min,
  required,
  colSpan = 1,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  step?: string;
  min?: number;
  required?: boolean;
  colSpan?: number;
}) {
  const cls = colSpan === 2 ? "col-span-2 md:col-span-2" : colSpan === 3 ? "col-span-2 md:col-span-3" : "";
  return (
    <label className={cls}>
      <span className="block text-xs text-zinc-600 mb-1">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}
