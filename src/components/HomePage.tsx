import { useEffect, useRef, useState } from "react";
import { ProjectUploads } from "./ProjectUploads";
import { ProjectMembers } from "./ProjectMembers";
import { ApiPage } from "./ApiPage";
import { ProjectsPage } from "./ProjectsPage";
import { acceptInvitation, createProject, getProject, listProjects, type Member, type WorkspaceProject } from "../lib/workspace-api";

const NAV = [
  { id: "Home", label: "Home" },
  { id: "Projects", label: "Projects" },
  { id: "Logs", label: "Logs" },
  { id: "Api", label: "API" },
  { id: "Docs", label: "Docs" },
  { id: "Settings", label: "Settings" },
  { id: "Support", label: "Support" },
] as const;

const NAV_PATHS: Record<(typeof NAV)[number]["id"], string> = {
  Home: "m3 10 9-7 9 7v10H3Z M9 20v-7h6v7",
  Projects: "M3 7V4h7l2 3h9v13H3Z",
  Logs: "M5 5h14M5 12h14M5 19h9",
  Api: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16",
  Docs: "M5 3h9l5 5v13H5ZM14 3v6h5M9 13h6M9 17h6",
  Settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  Support: "M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
};

export function HomePage() {
  const projectInput = useRef<HTMLInputElement>(null);
  const [menuCollapsed, setMenuCollapsed] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [mode, setMode] = useState<"name" | "join">("name");
  const [projectName, setProjectName] = useState("");
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [route, setRoute] = useState(() => window.location.hash.slice(1));
  const page = route.startsWith('api') ? 'Api' : route.startsWith('projects') ? 'Projects' : 'Home';

  function navigate(path: string) {
    if (path === 'home') { setProject(null); setProjectName(''); setMode('name'); setMembers([]); setInviting(false); setNotice(null); }
    window.location.hash = path;
    setRoute(path);
  }

  function rememberProject(selected: WorkspaceProject) {
    setProject(selected);
    localStorage.setItem('kanook-project', selected.id);
    setProjects((current) => current.some((item) => item.id === selected.id) ? current.map((item) => item.id === selected.id ? { ...item, ...selected } : item) : [selected, ...current]);
  }

  async function refreshProjects() {
    setLoading(true); setNotice(null);
    try { setProjects((await listProjects()).items); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load projects.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const change = () => { const next = window.location.hash.slice(1); setRoute(next); if (next === 'projects') void refreshProjects(); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const result = await listProjects();
        if (!active) return;
        setProjects(result.items);
        const invitation = new URLSearchParams(window.location.search).get("invitation");
        if (invitation) {
          window.location.hash = 'home'; setRoute('home');
          setMode("join");
          setProjectName(invitation);
          return;
        }
        const selected = localStorage.getItem("kanook-project");
        if (selected && result.items.some((item) => item.id === selected)) {
          const detail = await getProject(selected);
          if (active) { setProject(detail); setMembers(detail.members); }
        }
        if (active && !window.location.hash) {
          const initial = result.items.length > 0 ? 'projects' : 'home';
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${initial}`);
          setRoute(initial);
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load your projects.");
      } finally { if (active) setLoading(false); }
    }
    void restore();
    return () => { active = false; };
  }, []);

  async function selectProject(selected: WorkspaceProject) {
    setBusy(true);
    try {
      const detail = await getProject(selected.id);
      setProject(detail);
      setMembers(detail.members);
      localStorage.setItem("kanook-project", selected.id);
      setNotice(null);
      setInviting(false);
      navigate(`projects/${selected.id}/requirements`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open this project."); }
    finally { setBusy(false); }
  }

  async function nameProject(showInvites = false) {
    const value = projectName.trim();
    if (!value) {
      setNotice(mode === "join" ? "Paste your invitation link." : "Enter a project name.");
      projectInput.current?.focus();
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let token = value;
      if (mode === "join" && value.includes("?")) token = new URL(value).searchParams.get("invitation") || "";
      const result = mode === "join" ? await acceptInvitation(token) : await createProject(value);
      const detail = await getProject(result.id);
      setProject(detail);
      setMembers(detail.members);
      setProjects((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      localStorage.setItem("kanook-project", result.id);
      if (mode === "join") window.history.replaceState(null, "", window.location.pathname);
      setInviting(showInvites);
      requestAnimationFrame(() => document.getElementById(showInvites ? "member-email" : "project-heading")?.focus());
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open your project."); }
    finally { setBusy(false); }
  }

  function openInvite() {
    if (!project) {
      void nameProject(true);
      return;
    }
    setInviting((open) => !open);
    setNotice(null);
    requestAnimationFrame(() => document.getElementById("member-email")?.focus());
  }

  return (
    <div className={menuCollapsed ? "shell menu-collapsed" : "shell"}>
      <aside className="side">
        <div className="side-brand">
          <p className="side-wordmark">Kanook</p>
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuCollapsed ? "Expand menu" : "Collapse menu"}
            title={menuCollapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!menuCollapsed}
            aria-controls="sidebar-navigation"
            onClick={() => setMenuCollapsed((collapsed) => !collapsed)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              <path className="collapse-chevron" d="m16 9-3 3 3 3" />
            </svg>
          </button>
        </div>

        <div className="side-content" id="sidebar-navigation">
        <nav className="side-nav" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === page ? "nav-item is-current" : "nav-item"}
              aria-current={item.id === page ? "page" : undefined}
              aria-label={item.label}
              title={menuCollapsed ? item.label : undefined}
              onClick={() => { if (item.id === 'Home') navigate('home'); else if (item.id === 'Projects') navigate('projects'); else if (item.id === 'Api') navigate('api/usage'); }}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={NAV_PATHS[item.id]} />
              </svg>
              <span className="nav-copy">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="account" title="John Smith · Acme Corporation" aria-label="John Smith, Acme Corporation">
          <div className="account-copy">
            <p className="account-name">John Smith</p>
            <p className="account-org">Acme Corporation</p>
          </div>
          <svg className="account-avatar" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="17" r="9" fill="currentColor" />
            <path d="M8 48v-5a16 16 0 0 1 32 0v5Z" fill="currentColor" />
          </svg>
        </div>
        </div>
      </aside>

      <div className="workspace">
        {page === 'Api' ? loading ? <main className="home page-main"><p role="status">Loading workspace…</p></main> : <ApiPage project={project} projects={projects} tab={route === 'api/keys' ? 'keys' : 'usage'} navigate={navigate} /> : page === 'Projects' ? <ProjectsPage key={route} projects={projects} projectId={route.split('/')[1]} section={route.split('/')[2]} loading={loading} error={notice} navigate={navigate} refresh={() => void refreshProjects()} onProject={rememberProject} /> :
        <main className={project ? "home project-home" : "home"}>
          {!project ? (
            <>
              <div className="welcome welcome-plain">
                <h1>Welcome, Magan</h1>
                <p>Let’s get started, create your first project below</p>
              </div>
              <section className="start-card">
                <h2>{mode === "join" ? "Have a project invitation?" : "What is your project called?"}</h2>
                <form className="name-row" onSubmit={(event) => { event.preventDefault(); void nameProject(); }}>
                  <label className="sr" htmlFor="project-name">{mode === "join" ? "Invitation link" : "Enter project name"}</label>
                  <input ref={projectInput} id="project-name" value={projectName} autoComplete="off" maxLength={mode === "join" ? 2048 : 100} disabled={busy || loading}
                    placeholder={mode === "join" ? "Paste invitation link or code" : "Enter Project Name"}
                    onChange={(event) => { setProjectName(event.target.value); setNotice(null); }} />
                  <button type="submit" className="brown-btn brown-btn-wide" disabled={busy || loading}>{busy ? "Opening…" : mode === "join" ? "Join project" : "continue"}</button>
                </form>
                <div className="split-actions">
                  <button type="button" className="brown-btn" disabled={busy || loading} onClick={() => {
                    setMode((current) => current === "join" ? "name" : "join");
                    setProjectName("");
                    setInviting(false);
                    setNotice(null);
                  }}>{mode === "join" ? "Create a project" : "Join a project"}</button>
                  <button type="button" className="brown-btn" disabled={busy || loading || mode === "join"} onClick={openInvite} aria-expanded={inviting} aria-controls="project-members">Invite members</button>
                </div>
                <p className="optional-note">Inviting people is optional. You can add them later.</p>
              </section>
              {projects.length > 0 && <section className="recent-projects" aria-label="Recent projects"><p>Or continue a project</p>{projects.map((item) => <button key={item.id} type="button" className="outline-btn" disabled={busy} onClick={() => void selectProject(item)}>{item.name} <span aria-hidden="true">↗</span></button>)}</section>}
              {notice && <p className="home-note status-line" role="status">{notice}</p>}
            </>
          ) : (
            <header className="project-header">
              <div>
                <p className="project-eyebrow">Project</p>
                <h1 id="project-heading" tabIndex={-1}>{project.name}</h1>
                <nav className="project-breadcrumb" aria-label="Breadcrumb">
                  <button type="button" disabled={busy} onClick={() => { setProject(null); setProjectName(""); setMode("name"); setMembers([]); setInviting(false); localStorage.removeItem("kanook-project"); }}>Home</button><span aria-hidden="true">/</span><strong>Upload files</strong>
                </nav>
              </div>
              <div className="project-team">
                <span>{members.length === 0 ? "Just you, for now" : `${members.length} invited`}</span>
                <button type="button" className="outline-btn" disabled={busy} onClick={openInvite} aria-expanded={inviting} aria-controls="project-members">
                  <span aria-hidden="true">+</span> Invite members
                </button>
              </div>
            </header>
          )}

          {inviting && project && <ProjectMembers projectId={project.id} members={members} onInvite={(member) => setMembers((current) => [...current, member])} onClose={() => setInviting(false)} />}

          {project && <><ProjectUploads key={project.id} projectId={project.id} onUseApi={() => navigate('api/keys')} /><div className="home-continue"><button className="brown-btn" onClick={() => navigate(`projects/${project.id}/requirements`)}>Define requirements <span aria-hidden="true">→</span></button></div></>}
        </main>
        }
      </div>
    </div>
  );
}
