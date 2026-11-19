export function FlowSteps({ current, projectId, navigate }: { current: number; projectId?: string; navigate: (path: string) => void }) {
  const steps = ['Project', 'Dataset', 'Requirements', 'Review'];
  const routes = ['home', `projects/${projectId}/uploads`, `projects/${projectId}/requirements`, `projects/${projectId}/overview`];
  return <nav className="flow-steps" aria-label="Project setup">{steps.map((label, index) => <button key={label} disabled={!projectId && index > 0} className={index === current ? 'current' : index < current ? 'complete' : ''} aria-current={index === current ? 'step' : undefined} onClick={() => navigate(routes[index])}><span className="flow-bar" /><span><small>{String(index + 1).padStart(2, '0')}</small>{label}</span></button>)}</nav>;
}
