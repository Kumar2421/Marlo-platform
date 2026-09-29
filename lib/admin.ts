import { createClient } from "@/utils/supabase/server";

export async function requireAdmin(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return {user:null,authorized:false as const};
  const adminIds=(process.env.MARLO_ADMIN_USER_IDS??"").split(",").map(v=>v.trim()).filter(Boolean);
  const authorized=adminIds.includes(user.id);
  return {user,authorized} as const;
}