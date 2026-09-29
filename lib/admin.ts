import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, authorized: false as const };

  const adminIds = (process.env.MARLO_ADMIN_USER_IDS ?? "").split(",").map(v => v.trim()).filter(Boolean);
  return { user, authorized: adminIds.includes(user.id) } as const;
}

export function createAdminClient() {
  const key = process.env.MARLO_SUPABASE_SECRET_KEY;
  if (!key) throw new Error("MARLO_SUPABASE_SECRET_KEY is not configured");
  return createSupabaseClient(process.env.MARLO_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
