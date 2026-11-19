import { useLayoutEffect, useRef, useState } from 'react';

const NAV = [
  ['home', 'Home', 'm3 10 9-7 9 7v10H3Z M9 20v-7h6v7'],
  ['projects', 'Projects', 'M3 7V4h7l2 3h9v13H3Z'],
  ['logs', 'Logs', 'M5 5h14M5 12h14M5 19h9'],
  ['api', 'API', 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16'],
  ['docs', 'Docs', 'M5 3h9l5 5v13H5ZM14 3v6h5M9 13h6M9 17h6'],
  ['settings', 'Settings', 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6'],
  ['support', 'Support', 'M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
] as const;

type Props = { page: string; collapsed: boolean; toggle: () => void; navigate: (path: string) => void; name: string; organization: string; onSignOut?: () => void };

export function Sidebar({ page, collapsed, toggle, navigate, name, organization, onSignOut }: Props) {
  const nav = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const selected = hovered ?? page.toLowerCase();
  useLayoutEffect(() => {
    const measure = () => setTop(nav.current?.querySelector<HTMLElement>(`[data-nav="${selected}"]`)?.offsetTop ?? null);
    measure();
    const observer = new ResizeObserver(measure);
    if (nav.current) observer.observe(nav.current);
    return () => observer.disconnect();
  }, [selected, collapsed]);
  function followScroll() {
    if (!pointer.current) return;
    const hit = document.elementFromPoint(pointer.current.x, pointer.current.y)?.closest<HTMLElement>('[data-nav]');
    setHovered(hit && nav.current?.contains(hit) ? hit.dataset.nav! : null);
  }
  return <aside className="side">
    <div className="side-brand"><a className="brand-link" href="#home" onClick={(event) => { event.preventDefault(); navigate('home'); }} aria-label="Kanook home"><span className="brand-symbol" aria-hidden="true">k.</span><span className="brand-copy"><strong className="brand-wordmark">Ka<em>n</em>ook</strong></span></a>
      <button className="menu-toggle" onClick={toggle} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!collapsed} aria-controls="sidebar-navigation"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m7-7-3 3 3 3" /></svg></button>
    </div>
    <div className="side-content" id="sidebar-navigation" onScroll={followScroll}>
      <nav className="side-nav" ref={nav} aria-label="Main" onPointerMove={(event) => { pointer.current = { x: event.clientX, y: event.clientY }; }} onPointerLeave={() => { pointer.current = null; setHovered(null); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(null); }}>
        <span className="nav-highlight" aria-hidden="true" style={{ transform: `translateY(${top ?? 0}px)`, opacity: top === null ? 0 : 1 }} />
        {NAV.map(([id, label, path], index) => <div key={id} className={index === 3 ? 'nav-group-start' : undefined}>
          {index === 3 && <p className="nav-group-label">Workspace tools</p>}
          <button data-nav={id} type="button" className={id === page.toLowerCase() ? 'nav-item is-current' : 'nav-item'} aria-current={id === page.toLowerCase() ? 'page' : undefined} aria-label={label} title={collapsed ? label : undefined}
            onPointerEnter={() => setHovered(id)} onFocus={() => setHovered(id)} onClick={() => navigate(id === 'api' ? 'api/usage' : id)}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg><span className="nav-copy">{label}</span>
          </button>
        </div>)}
      </nav>
      <button className="side-help" tabIndex={collapsed ? -1 : undefined} onClick={() => navigate('support')}><strong>We're here to help</strong><span>Contact support <span aria-hidden="true">↗</span></span></button>
      <div className="account"><span className="avatar-initials" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><div className="account-copy"><p className="account-name">{name}</p><p className="account-org">{organization}</p></div>{onSignOut && <button className="signout-button" title="Sign out" aria-label="Sign out" onClick={onSignOut}>↗</button>}</div>
    </div>
  </aside>;
}
