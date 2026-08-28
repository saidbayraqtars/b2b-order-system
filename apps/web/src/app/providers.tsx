"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/toast";
import { BrandProvider } from "@/components/brand";

export function Providers({
  brand,
  children,
}: {
  brand: string;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <BrandProvider value={brand}>
          <ToastProvider>{children}</ToastProvider>
        </BrandProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
