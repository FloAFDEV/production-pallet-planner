import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/AppLayout";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Coffret ERP — Gestion production" },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<AppLayout />
			<Toaster richColors position="top-right" />
		</>
	);
}