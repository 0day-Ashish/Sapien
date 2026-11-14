"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NearWalletProvider } from "./near-wallet";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NearWalletProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NearWalletProvider>
  );
}
