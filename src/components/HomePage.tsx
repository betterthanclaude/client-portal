import { useEffect, useRef, useState } from "react";
import { ProjectUploads } from "./ProjectUploads";
import { ProjectMembers } from "./ProjectMembers";
import { ApiPage } from "./ApiPage";
import { ProjectsPage } from "./ProjectsPage";
import { DEMO_MODE } from '../lib/demo';
import { acceptInvitation, createProject, getProject, listProjects, type Member, type WorkspaceProject } from "../lib/workspace-api";

import { Sidebar } from './Sidebar';
import { FlowSteps } from './FlowSteps';
import { DocsPage } from './DocsPage';
import { SettingsPage } from './SettingsPage';
import { SupportPage } from './SupportPage';
import { LogsPage } from './LogsPage';
import type { Session } from '../lib/http';
const PROJECT_STORAGE_KEY = DEMO_MODE ? 'kanook-demo-project' : 'kanook-project';

export function HomePage({ session, onSignOut, accountNotice }: { session: Session | null; onSignOut?: () => void; accountNotice?: string | null }) {
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
  const section = route.split('/')[0];
  const page = ['api', 'projects', 'docs', 'settings', 'support', 'logs'].includes(section) ? section : 'home';

  function navigate(path: string) {
    if (path === 'home') { setProject(null); setProjectName(''); setMode('name'); setMembers([]); setInviting(false); setNotice(null); }
    window.location.hash = path;
    setRoute(path);
  }

  function rememberProject(selected: WorkspaceProject) {
    setProject(selected);
    localStorage.setItem(PROJECT_STORAGE_KEY, selected.id);
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
        const selected = localStorage.getItem(PROJECT_STORAGE_KEY);
        if (selected && result.items.some((item) => item.id === selected)) {
          const detail = await getProject(selected);
          if (active && window.location.hash !== '#home') { setProject(detail); setMembers(detail.members); }
        }
        if (active && !window.location.hash) {
          const initial = result.items.length > 0 && (!DEMO_MODE || selected) ? 'projects' : 'home';
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
      localStorage.setItem(PROJECT_STORAGE_KEY, selected.id);
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
      localStorage.setItem(PROJECT_STORAGE_KEY, result.id);
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
      <Sidebar page={page} collapsed={menuCollapsed} toggle={() => setMenuCollapsed((value) => !value)} navigate={navigate} name={session?.email.split('@')[0] || 'Magan'} organization={session?.organization_name || 'Acme Corporation'} onSignOut={onSignOut} />

      <div className="workspace">
        {DEMO_MODE && <div className="demo-banner"><span><i aria-hidden="true" />Demo workspace</span><a href="?demo=0#home">Sample data · Connect your workspace ↗</a></div>}
        {accountNotice && <p className="page-notice" role="alert">{accountNotice}</p>}
        {page === 'docs' ? <DocsPage /> : page === 'settings' ? <SettingsPage session={session} navigate={navigate} /> : page === 'support' ? <SupportPage projects={projects} /> : page === 'logs' ? <LogsPage /> : page === 'api' ? loading ? <main className="home page-main"><p role="status">Loading workspace…</p></main> : <ApiPage project={project} projects={projects} tab={route === 'api/keys' ? 'keys' : 'usage'} navigate={navigate} /> : page === 'projects' ? <ProjectsPage key={route} projects={projects} projectId={route.split('/')[1]} section={route.split('/')[2]} loading={loading} error={notice} navigate={navigate} refresh={() => void refreshProjects()} onProject={rememberProject} /> :
        <main className={project ? "home project-home" : "home home-start"}>
          {!project ? (
            <>
              <div className="welcome welcome-plain">
                <h1>Welcome, {session?.email.split('@')[0] || 'Magan'}.</h1>
                <p>Name your project to get started.</p>
              </div>
              <section className="start-card" aria-label="Start a project">
                <form className="name-row" onSubmit={(event) => { event.preventDefault(); void nameProject(); }}>
                  <label className="sr" htmlFor="project-name">{mode === "join" ? "Invitation link" : "Enter project name"}</label>
                  <input ref={projectInput} id="project-name" value={projectName} autoComplete="off" maxLength={mode === "join" ? 2048 : 100} disabled={busy || loading}
                    placeholder={mode === "join" ? "Paste invitation link or code" : "Enter Project Name"}
                    onChange={(event) => { setProjectName(event.target.value); setNotice(null); }} />
                  <button type="submit" className="brown-btn" disabled={busy || loading}>{busy ? "Opening…" : mode === "join" ? "Join project" : "Continue"} <span aria-hidden="true">→</span></button>
                </form>
                <div className="split-actions">
                  <button type="button" className="text-hit" disabled={busy || loading} onClick={() => {
                    setMode((current) => current === "join" ? "name" : "join");
                    setProjectName("");
                    setInviting(false);
                    setNotice(null);
                  }}>{mode === "join" ? "Create a project" : "Join a project"}</button>
                  <button type="button" className="text-hit" disabled={busy || loading || mode === "join"} onClick={openInvite} aria-expanded={inviting} aria-controls="project-members">Invite members <span aria-hidden="true">+</span></button>
                </div>
                <p className="optional-note">Inviting people is optional. You can add them later.</p>
              </section>
              {projects.length > 0 && <section className="recent-projects" aria-label="Recent projects"><p>Or continue a project</p>{projects.slice(0, 3).map((item) => <button key={item.id} type="button" className="outline-btn" disabled={busy} onClick={() => void selectProject(item)}>{item.name} <span aria-hidden="true">↗</span></button>)}</section>}
              {notice && <p className="home-note status-line" role="status">{notice}</p>}
            </>
          ) : (
            <header className="project-header">
              <div>
                <p className="project-eyebrow">Project</p>
                <h1 id="project-heading" tabIndex={-1}>{project.name}</h1>
                <nav className="project-breadcrumb" aria-label="Breadcrumb">
                  <button type="button" disabled={busy} onClick={() => { setProject(null); setProjectName(""); setMode("name"); setMembers([]); setInviting(false); localStorage.removeItem(PROJECT_STORAGE_KEY); }}>Home</button><span aria-hidden="true">/</span><strong>Upload files</strong>
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

          {project && <><FlowSteps current={1} projectId={project.id} navigate={navigate} /><ProjectUploads key={project.id} projectId={project.id} onUseApi={() => navigate('api/keys')} /><div className="home-continue"><button className="brown-btn" onClick={() => navigate(`projects/${project.id}/requirements`)}>Define requirements <span aria-hidden="true">→</span></button></div></>}
        </main>
        }
      </div>
    </div>
  );
}
