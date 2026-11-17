type Props = { title: string; subtitle: string; bars: { date: string; value: number }[]; unit: 'h' | '$' };

export function UsageChart({ title, subtitle, bars, unit }: Props) {
  const max = Math.max(0.01, ...bars.map((bar) => bar.value));
  const label = (value: number) => unit === '$' ? `$${value.toFixed(2)}` : `${value.toFixed(2)} h`;
  return <section className="surface chart-card">
    <h2>{title}</h2><p>{subtitle}</p>
    <div className={`bar-chart ${unit === '$' ? 'spend-chart' : ''}`} role="img" aria-label={`${title}, daily timeline`}>
      <span className="chart-axis">{label(max)}</span>
      <div className="chart-bars">{bars.map((bar) => <div key={bar.date} className="chart-column" tabIndex={0} aria-label={`${bar.date}: ${label(bar.value)}`} title={`${bar.date}: ${label(bar.value)}`}><span style={{ height: `${bar.value / max * 100}%` }} /></div>)}</div>
    </div>
    <div className="chart-dates"><span>{bars[0]?.date}</span><span>{bars.at(-1)?.date}</span></div>
  </section>;
}
