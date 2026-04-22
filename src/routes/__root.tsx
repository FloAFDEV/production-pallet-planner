import {
  createRootRouteWithContext,
  Outlet,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Coffret ERP — Gestion de production",
      },
      {
        name: "description",
        content:
          "ERP de gestion de production : composants, coffrets, OF, livraisons",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),

  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>{children}</body>
      <Scripts />
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <AppLayout />
      <Toaster richColors position="top-right" />
    </>
  );
}