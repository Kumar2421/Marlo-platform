import { requireAdmin } from "@/lib/admin";
import PlatformShell from "./platform-shell";

export default async function Home() {
  const { user, authorized } = await requireAdmin();

  if (!user) {
    return <main className="access"><div className="access-card"><div className="eyebrow">MARLO / PLATFORM</div><h1>Authentication required</h1><p>Sign in to the Marlo application, then return to the platform control plane.</p></div></main>;
  }

  if (!authorized) {
    return <main className="access"><div className="access-card"><div className="eyebrow">MARLO / PLATFORM</div><h1>403 — Admin access required</h1><p>Your account is authenticated but is not in the platform administrator allowlist.</p></div></main>;
  }

  return <PlatformShell userEmail={user.email ?? "operator"} />;
}
