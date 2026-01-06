"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import { createQueryClient } from "@/shared/lib/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const effectiveClientId = clientId || "MISSING_GOOGLE_CLIENT_ID";
  const [queryClient] = useState(() => createQueryClient());

  return (
    <GoogleOAuthProvider clientId={effectiveClientId}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}




