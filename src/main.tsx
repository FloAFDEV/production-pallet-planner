import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { router, queryClient } from "@/router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
<div>TEST MAIN OK</div>    </QueryClientProvider>
  </React.StrictMode>
);