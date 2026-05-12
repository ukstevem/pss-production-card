import { PageHeader, EmptyState } from "@platform/ui";

export default function Home() {
  return (
    <div className="p-8">
      <PageHeader
        title="Production Cards"
        subtitle="Workshop and site installation travellers"
      />
      <div className="mt-8">
        <EmptyState
          title="No cards yet"
          description="Cards will appear here once the planner UI is wired up (bd issue pss-production-card-89t)."
        />
      </div>
    </div>
  );
}
