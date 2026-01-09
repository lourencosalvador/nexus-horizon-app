import { createClient } from "@supabase/supabase-js";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return { url, serviceRole };
}

export function createSupabaseAdminClient() {
  const env = getEnv();
  if (!env) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.url, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}


