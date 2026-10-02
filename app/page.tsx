import { requireAdmin } from "@/lib/admin";
import PlatformShell from "./platform-shell";
import { redirect } from "next/navigation";

export default async function Home() {
  const { user, authorized } = await requireAdmin();

  if (!user) {
    redirect("/login");
  }

  if (!authorized) {
    return <main className="access"><div className="access-card"><div className="eyebrow">MARLO / PLATFORM</div><h1>403 — Admin access required</h1><p>Your account is authenticated but is not in the platform administrator allowlist.</p></div></main>;
  }

  return <PlatformShell userEmail={user.email ?? "operator"} />;
}
