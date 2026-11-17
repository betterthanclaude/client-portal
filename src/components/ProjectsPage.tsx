import { useEffect, useState, type FormEvent } from 'react';
import { acceptInvitation, getProject, updateProject, type Member, type ProjectRequirements, type StoredFile, type WorkspaceProject } from '../lib/workspace-api';
import { formatBytes } from '../lib/files';
import { DEMO_MODE, demoAnalysis } from '../lib/demo';
import { ProjectUploads } from './ProjectUploads';
import { ProjectOverview } from './ProjectOverview';
import { ProjectMembers } from './ProjectMembers';

const EMPTY_REQUIREMENTS: ProjectRequirements = {
  mode: 'structured', component_weights: { visual_similarity: null, label_balance: null },
  visual_similarity: { context: null, temporal: null, layout: null, family: null, scene: null }, label_balance: [], notes: '',
};
type Detail = WorkspaceProject & { members: Member[]; files: StoredFile[] };
type Props = { projects: WorkspaceProject[]; projectId?: string; section?: string; loading: boolean; error: string | null; navigate: (path: string) => void; refresh: () => void; onProject: (project: WorkspaceProject) => void };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function ProjectsPage({ projects, projectId, section = 'requirements', loading, error, navigate, refresh, onProject }: Props) {
  const [filter, setFilter] = useState('ongoing');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [requirements, setRequirements] = useState<ProjectRequirements>(EMPTY_REQUIREMENTS);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(Boolean(projectId));
  const [notice, setNotice] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    getProject(projectId).then((result) => {
      if (!active) return;
      setDetail(result);
      setRequirements(result.requirements ? { ...EMPTY_REQUIREMENTS, ...result.requirements,
        component_weights: { ...EMPTY_REQUIREMENTS.component_weights, ...result.requirements.component_weights },
        visual_similarity: { ...EMPTY_REQUIREMENTS.visual_similarity, ...result.requirements.visual_similarity } } : EMPTY_REQUIREMENTS);
    }).catch((error) => { if (active) setNotice(errorText(error)); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [projectId, section, reload]);

  function updated(project: WorkspaceProject) {
    setDetail((current) => current ? { ...current, ...project } : null); onProject(project);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true); setNotice(null);
    try {
      updated(await updateProject(detail.id, { requirements }));
      navigate(`projects/${detail.id}/overview`);
    } catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }

  async function changeStatus() {
    if (!detail) return;
    setBusy(true); setNotice(null);
    try { updated(await updateProject(detail.id, { status: detail.status === 'completed' ? 'ongoing' : 'completed' })); setNotice('Project status updated. This does not change the status of any QC run.'); }
    catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let token = String(new FormData(event.currentTarget).get('invitation')).trim();
    setBusy(true); setNotice(null);
    try {
      if (token.includes('?')) token = new URL(token).searchParams.get('invitation') || '';
      const project = await acceptInvitation(token); onProject(project); refresh(); setJoining(false); navigate(`projects/${project.id}/requirements`);
    } catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }

  if (!projectId) {
    const filtered = projects.filter((project) => (filter === 'all' || project.status === filter) && project.name.toLowerCase().includes(search.toLowerCase()));
    return <main className="home page-main"><header className="page-heading"><div><p className="project-eyebrow">Workspace</p><h1>Projects</h1><p>Pick up where you left off.</p></div><button className="outline-btn" onClick={() => setJoining((value) => !value)} aria-expanded={joining}>Join a project</button></header>
      <div className="page-toolbar"><div className="segmented" role="group" aria-label="Project status">{['ongoing', 'completed', 'all'].map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All projects' : value === 'ongoing' ? 'Ongoing' : 'Completed'} <span>{projects.filter((item) => value === 'all' || item.status === value).length}</span></button>)}</div><label className="search-box"><input type="search" placeholder="Search projects" aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="outline-btn" disabled={loading} onClick={refresh}>Refresh</button></div>
      {joining && <section className="surface"><h2>Join an existing project</h2><form className="join-project-form" onSubmit={(event) => void join(event)}><label className="field-stack">Invitation link or code<input name="invitation" required placeholder={DEMO_MODE ? "Try demo-join" : "Paste your invitation"} /></label><button className="brown-btn" disabled={busy}>{busy ? 'Joining…' : 'Join project'}</button></form></section>}
      {(notice || error) && <p className="page-notice" role="alert">{notice || error}</p>}
      {loading ? <p className="empty-copy" role="status">Loading projects…</p> : filtered.length ? <div className="project-grid">{filtered.map((project) => <button className="project-tile" key={project.id} onClick={() => { onProject(project); navigate(`projects/${project.id}/${DEMO_MODE ? 'overview' : 'requirements'}`); }}><div><span className={`status-badge ${project.status === 'completed' ? 'muted' : ''}`}>{project.status === 'completed' ? 'Completed' : 'Ongoing'}</span><span aria-hidden="true">↗</span></div><h2>{project.name}</h2><p>{project.file_count || 0} files · {project.invitation_count ? `${project.invitation_count} invited` : 'Just you, for now'}</p><small>Created {new Date(project.created * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small></button>)}</div> : <section className="surface project-empty"><h2>{search ? 'No matching projects' : filter === 'completed' ? 'No completed projects yet' : 'No projects here yet'}</h2><p>{search ? 'Try a different project name.' : 'Join an existing project, or return to Home to create one.'}</p></section>}
      <p className="new-project-note">Starting something new? <button onClick={() => navigate('home')}>Create your project on Home <span aria-hidden="true">→</span></button></p>
    </main>;
  }

  const isOverview = section === 'overview', isFiles = section === 'files', isUpload = section === 'uploads', isRestart = section === 'restart';
  return <main className="home page-main"><header className="page-heading"><div><p className="project-eyebrow">Project</p><h1>{detail?.name || 'Your project'}</h1><nav className="project-breadcrumb" aria-label="Breadcrumb"><button onClick={() => navigate('home')}>Home</button><span>/</span><button onClick={() => navigate('projects')}>Projects</button><span>/</span><strong>{isOverview ? 'Overview' : isFiles ? 'Files' : isUpload ? 'Upload files' : 'Requirements'}</strong></nav></div>{detail && <div className="page-title-actions"><span className={`status-badge ${detail.status === 'completed' ? 'muted' : ''}`}>{detail.status === 'completed' ? 'Completed' : 'Ongoing'}</span><button className="outline-btn" aria-expanded={inviting} aria-controls="project-members" onClick={() => setInviting((value) => !value)}>Invite members</button></div>}</header>
    {notice && <p className="page-notice" role="status">{notice}</p>}
    {inviting && detail && <ProjectMembers projectId={detail.id} members={detail.members} onInvite={(member) => { setDetail({ ...detail, members: [...detail.members, member] }); onProject({ ...detail, invitation_count: detail.members.length + 1 }); }} onClose={() => setInviting(false)} />}
    {detailLoading ? <p className="empty-copy" role="status">Loading project…</p> : !detail ? <section className="surface"><h2>Project unavailable</h2><button className="outline-btn" onClick={() => setReload((value) => value + 1)}>Try again</button></section> : isOverview ? <ProjectOverview key={detail.id} project={detail} files={detail.files} onUpdate={updated} navigate={navigate} /> : <div className="page-with-rail"><div className="page-content">
      {isUpload ? <ProjectUploads projectId={detail.id} onUseApi={() => navigate('api/keys')} /> : isFiles ? <section className="surface"><div className="section-heading"><div><h2>Project files</h2><p>{detail.files.length} files · {formatBytes(detail.files.reduce((sum, file) => sum + file.size, 0))}</p></div><button className="outline-btn" onClick={() => setReload((value) => value + 1)}>Refresh</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>File</th><th>Source</th><th>Size</th>{DEMO_MODE && <th>Sample score</th>}</tr></thead><tbody>{detail.files.map((file) => <tr key={file.id}><td>{file.name}</td><td>{file.source === 's3' ? 'S3 reference' : 'Uploaded'}</td><td>{formatBytes(file.size)}</td>{DEMO_MODE && <td>{demoAnalysis([file], detail.requirements)?.score.toFixed(1)} / 100</td>}</tr>)}</tbody></table></div>{detail.files.length === 0 && <p className="empty-copy">No files added yet. Choose Upload files to get started.</p>}</section> : <section className="surface requirements-card"><div className="section-heading"><div><h2>Define requirements</h2><p>Tell us what a successful dataset looks like.</p></div><span className="scope-note">Saved with this project</span></div>
        {isRestart && <p className="page-notice">Restart uses the same {detail.files.length} files with new requirements. {DEMO_MODE ? 'Save your changes to refresh the sample overview. No charges apply.' : 'Editing is free; running the analysis again is paid. No rerun has started.'}</p>}
        <div className="segmented requirements-mode" role="group" aria-label="Requirements input method"><button aria-pressed={requirements.mode === 'structured'} onClick={() => setRequirements({ ...requirements, mode: 'structured' })}>Guided form <small>Recommended</small></button><button aria-pressed={requirements.mode === 'notes'} onClick={() => setRequirements({ ...requirements, mode: 'notes' })}>Write your requirements</button></div>
        <form onSubmit={(event) => void save(event)}>
          {requirements.mode === 'notes' ? <label className="field-stack">Your requirements<textarea value={requirements.notes} maxLength={10000} rows={9} placeholder="Describe the dataset you need, the balance you want, and any constraints…" onChange={(event) => setRequirements({ ...requirements, notes: event.target.value })} /><small>Written notes are saved as-is. They have not been interpreted as QC rules.</small></label> : <div className="requirements-sections">
            <details><summary>Component weights</summary><p>Set relative importance from 0 to 100. Leave a field blank if undecided.</p><div className="weight-grid">{([['visual_similarity', 'Visual similarity'], ['label_balance', 'Label balance']] as const).map(([id, label]) => <label key={id}>{label}<input type="number" min={0} max={100} step="any" placeholder="—" value={requirements.component_weights[id] ?? ''} onChange={(event) => setRequirements({ ...requirements, component_weights: { ...requirements.component_weights, [id]: event.target.value === '' ? null : Number(event.target.value) } })} /></label>)}</div></details>
            <details><summary>Label balance</summary><p>Add your labels and desired share of the dataset. Targets may total up to 100%.</p>{requirements.label_balance.map((item, index) => <div className="label-target" key={index}><input aria-label={`Label ${index + 1}`} placeholder="Label name" required maxLength={100} value={item.label} onChange={(event) => setRequirements({ ...requirements, label_balance: requirements.label_balance.map((entry, position) => position === index ? { ...entry, label: event.target.value } : entry) })} /><label><span className="sr">Target percentage for label {index + 1}</span><input type="number" min={0} max={100} step="any" required value={item.target} onChange={(event) => setRequirements({ ...requirements, label_balance: requirements.label_balance.map((entry, position) => position === index ? { ...entry, target: Number(event.target.value) } : entry) })} /><span>%</span></label><button className="remove-file" type="button" aria-label={`Remove label ${index + 1}`} onClick={() => setRequirements({ ...requirements, label_balance: requirements.label_balance.filter((_, position) => position !== index) })}>×</button></div>)}<button className="outline-btn more-files" type="button" disabled={requirements.label_balance.length >= 50} onClick={() => setRequirements({ ...requirements, label_balance: [...requirements.label_balance, { label: '', target: 0 }] })}>+ Add label</button></details>
            <details open><summary>Visual similarity</summary><p>Set the relative importance of each visual characteristic, from 0 to 100.</p><div className="weight-grid">{(['context', 'temporal', 'layout', 'family', 'scene'] as const).map((id) => <label key={id}><span>{id[0].toUpperCase() + id.slice(1)} weight</span><input aria-label={`${id[0].toUpperCase() + id.slice(1)} weight`} type="number" min={0} max={100} step="any" placeholder="—" value={requirements.visual_similarity[id] ?? ''} onChange={(event) => setRequirements({ ...requirements, visual_similarity: { ...requirements.visual_similarity, [id]: event.target.value === '' ? null : Number(event.target.value) } })} /></label>)}</div></details>
          </div>}
          <div className="form-actions"><p>{DEMO_MODE ? 'Preview updates with your saved requirements.' : 'Saving requirements is free. Analysis starts separately.'}</p><button className="brown-btn" disabled={busy}>{busy ? 'Saving…' : 'Save & view overview'} <span aria-hidden="true">→</span></button></div>
        </form>
      </section>}
    </div><aside className="page-rail" aria-label="Project actions"><button className={!isFiles && !isUpload ? 'rail-button active' : 'rail-button'} onClick={() => navigate(`projects/${detail.id}/requirements`)}>Requirements</button><button className={isUpload ? 'rail-button active' : 'rail-button'} onClick={() => navigate(`projects/${detail.id}/uploads`)}>Upload files</button><button className={isFiles ? 'rail-button active' : 'rail-button'} onClick={() => navigate(`projects/${detail.id}/files`)}>View files</button><button className="rail-button" onClick={() => navigate(`projects/${detail.id}/overview`)}>Overview</button><button className="rail-button rail-bottom" disabled={busy} onClick={() => void changeStatus()}>{detail.status === 'completed' ? 'Reopen project' : 'Mark completed'}</button></aside></div>}
  </main>;
}
