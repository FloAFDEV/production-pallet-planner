import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">
          Une erreur est survenue
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "Erreur inattendue"}
        </p>

        <button
          onClick={reset}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultErrorComponent: DefaultErrorComponent,
});