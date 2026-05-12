import Link from "next/link";
import { PageHeader } from "@platform/ui";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createCard } from "./actions";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  projectnumber: string;
  item_seq: number;
  line_desc: string | null;
  exc_class: number | null;
};

async function fetchItems(projectnumber: string): Promise<Item[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_register_items")
    .select("id, projectnumber, item_seq, line_desc, exc_class")
    .eq("projectnumber", projectnumber)
    .order("item_seq", { ascending: true });

  if (error) {
    console.error("[new-card] fetchItems failed:", error);
    return [];
  }
  return (data ?? []) as Item[];
}

export default async function NewCardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const params = await searchParams;
  const projectnumber = params.project?.trim() ?? "";
  const items = projectnumber ? await fetchItems(projectnumber) : [];

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="New Production Card" backHref="/production-card/" />

      <form
        method="get"
        action="/production-card/new/"
        className="mb-8 flex items-end gap-3"
      >
        <label className="flex-1">
          <span className="block text-sm font-medium text-zinc-700 mb-1">
            Project number
          </span>
          <input
            type="text"
            name="project"
            defaultValue={projectnumber}
            placeholder="e.g. 10358"
            required
            pattern="\d+"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Find items
        </button>
      </form>

      {projectnumber && items.length === 0 && (
        <p className="text-sm text-zinc-500">
          No items found for project <code className="font-mono">{projectnumber}</code>.
        </p>
      )}

      {items.length > 0 && (
        <form action={createCard} className="space-y-6">
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">EXC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <input
                        type="radio"
                        name="project_register_item_id"
                        value={it.id}
                        required
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {it.projectnumber}-{String(it.item_seq).padStart(2, "0")}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {it.line_desc ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">
                      {it.exc_class ?? <span className="text-zinc-400">unset</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="rounded-lg border border-zinc-200 p-4">
            <legend className="px-2 text-sm font-medium text-zinc-700">Variant</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="variant" value="shop" defaultChecked required />
                Shop
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="variant" value="site" />
                Site
              </label>
            </div>
          </fieldset>

          <div className="flex justify-end gap-3">
            <Link
              href="/production-card/"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create draft card
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
