import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=1");
  }

  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="eyebrow">MARLO / PLATFORM</div>
        <h1>Sign in</h1>
        <p>Sign in with your Marlo account to access the platform control plane.</p>

        {params.error && <div className="auth-error">Invalid email or password.</div>}

        <form action={signIn}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>

        <div className="auth-note">Authentication succeeds first; platform access still requires administrator authorization.</div>
      </section>
    </main>
  );
}
