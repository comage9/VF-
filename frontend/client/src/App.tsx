import { Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/offline-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import Dashboard from "@/pages/dashboard";

function App() {
  const envBase = (import.meta as any)?.env?.BASE_URL ?? "/";
  const detectedBase = typeof window !== 'undefined' && window.location.pathname.startsWith('/sales')
    ? '/sales'
    : envBase;
  const routerBase = detectedBase === "/" ? undefined : detectedBase.replace(/\/$/, "");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OfflineBanner />
        <Toaster />
        <WouterRouter base={routerBase}>
          <ErrorBoundary label="dashboard">
            <Dashboard />
          </ErrorBoundary>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
