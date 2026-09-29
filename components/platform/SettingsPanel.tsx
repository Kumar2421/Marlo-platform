"use client";

type SettingsStatus = {
  admins: number;
  supabase: boolean;
  secretKey: boolean;
  vercel: boolean;
  adminIds: boolean;
};

function Row({label, value, note}:{label:string;value:string;note:string}) {
  return <div className="settings-row">
    <div className="settings-copy"><strong>{label}</strong><span>{note}</span></div>
    <div className={value === "READY" ? "settings-state ready" : "settings-state"}><i className="dot" />{value}</div>
  </div>;
}

export function SettingsPanel({settings}:{settings:SettingsStatus}) {
  return <div className="settings-panel">
    <Row label="Supabase" value={settings.supabase ? "READY" : "MISSING"} note="Server connection variables are configured." />
    <Row label="Service key" value={settings.secretKey ? "READY" : "MISSING"} note="Private server-side key is available to the control plane." />
    <Row label="Vercel" value={settings.vercel ? "READY" : "NOT SET"} note="Deployment integration token is configured." />
    <Row label="Admin access" value={settings.adminIds ? "READY" : "MISSING"} note={`${settings.admins} admin ID${settings.admins === 1 ? "" : "s"} configured.`} />
  </div>;
}

export function AccessControlPanel({settings}:{settings:SettingsStatus}) {
  return <div className="settings-panel">
    <div className="settings-note">Phase 1 access is allowlisted by <code>MARLO_ADMIN_USER_IDS</code>. Secrets and raw environment values are never rendered.</div>
    <div className="settings-actions"><span>Role model</span><strong>Platform admin</strong></div>
    <div className="settings-actions"><span>Admin accounts</span><strong>{settings.admins}</strong></div>
    <div className="settings-note">User/project permissions remain enforced in the customer application. Control-plane actions require server-side admin authorization.</div>
  </div>;
}
