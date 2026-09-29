import type { PlatformUser } from "@/lib/platform-data";

export function UsersPanel({ users, onSelect }: { users: PlatformUser[]; onSelect?: (id: string) => void }) {
  if (!users.length) {
    return <div className="empty users-empty"><strong>USER DIRECTORY</strong><span>No authenticated users found.</span></div>;
  }

  return (
    <div className="users-panel">
      {users.map((user) => (
        <button className="user-row" key={user.id} onClick={() => onSelect?.(user.id)}>
          <div className="user-main">
            <strong>{user.email ?? "No email"}</strong>
            <span>{user.id.slice(0, 8)} · joined {new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="user-meta">
            <strong>{user.projects}</strong>
            <span>projects</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserDetailPanel({ user }: { user: PlatformUser | null }) {
  if (!user) {
    return <div className="empty users-empty"><strong>USER DETAIL</strong><span>Select a user from the directory.</span></div>;
  }

  return (
    <div className="user-detail">
      <div className="user-detail-row"><span>Email</span><strong>{user.email ?? "Not available"}</strong></div>
      <div className="user-detail-row"><span>User ID</span><code>{user.id}</code></div>
      <div className="user-detail-row"><span>Created</span><strong>{new Date(user.createdAt).toLocaleString()}</strong></div>
      <div className="user-detail-row"><span>Projects</span><strong>{user.projects}</strong></div>
    </div>
  );
}
