import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Scripts run from app/. Load .env.local then .env in that order.
const here = process.cwd();
for (const f of [".env.local", ".env"]) {
  const p = resolve(here, f);
  if (existsSync(p)) loadEnv({ path: p, override: false });
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL not set");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY not set");

export const supabaseAdmin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
