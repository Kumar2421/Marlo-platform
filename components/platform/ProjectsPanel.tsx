import type { PlatformProject } from "@/lib/platform-data";

export function ProjectsPanel({ projects, onSelect }: { projects: PlatformProject[]; onSelect?: (id: string) => void }) {
  if (!projects.length) {
    return <div className="empty projects-empty"><strong>PROJECT DIRECTORY</strong><span>No customer projects found.</span></div>;
  }

  return (
    <div className="projects-panel">
      {projects.map((project) => (
        <button className="project-row" key={project.id} onClick={() => onSelect?.(project.id)}>
          <div className="project-main">
            <strong>{project.name || "Untitled project"}</strong>
            <span>{project.url || "No URL"} · {project.category || "Uncategorized"}</span>
          </div>
          <div className="project-meta">
            <strong>{project.ownerEmail ?? "No owner email"}</strong>
            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function ProjectDetailPanel({ project }: { project: PlatformProject | null }) {
  if (!project) {
    return <div className="empty projects-empty"><strong>PROJECT DETAIL</strong><span>Select a project from the directory.</span></div>;
  }

  return (
    <div className="project-detail">
      <div className="project-detail-row"><span>Name</span><strong>{project.name || "Untitled project"}</strong></div>
      <div className="project-detail-row"><span>Owner</span><strong>{project.ownerEmail ?? "Not available"}</strong></div>
      <div className="project-detail-row"><span>URL</span><strong>{project.url ?? "Not available"}</strong></div>
      <div className="project-detail-row"><span>Category</span><strong>{project.category ?? "Not set"}</strong></div>
      <div className="project-detail-row"><span>Created</span><strong>{new Date(project.createdAt).toLocaleString()}</strong></div>
      <div className="project-detail-row"><span>Project ID</span><code>{project.id}</code></div>
    </div>
  );
}
