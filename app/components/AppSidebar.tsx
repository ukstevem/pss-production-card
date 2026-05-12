"use client";

import { SidebarUser } from "@platform/auth";
import { Sidebar } from "@platform/ui";

export function AppSidebar() {
  return (
    <Sidebar
      appLabel="Production Card"
      logoSrc="/production-card/pss-logo-reversed.png"
      navSections={[
        {
          heading: "Cards",
          items: [
            { label: "All Cards", href: "/production-card/" },
            { label: "New Card", href: "/production-card/new/" },
          ],
        },
        {
          heading: "Registers",
          items: [
            { label: "WPS", href: "/production-card/admin/wps/" },
            { label: "Welder Quals", href: "/production-card/admin/welder-quals/" },
            { label: "Op Library", href: "/production-card/admin/ops/" },
            { label: "Routing Templates", href: "/production-card/admin/routing-templates/" },
          ],
        },
        {
          heading: "Shop Floor",
          items: [
            { label: "Live View", href: "/production-card/live/" },
          ],
        },
      ]}
      userSlot={<SidebarUser />}
    />
  );
}
