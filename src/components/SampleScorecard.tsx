import type { demoAnalysis } from '../lib/demo';

type Analysis = NonNullable<ReturnType<typeof demoAnalysis>>;
export function SampleScorecard({ analysis, target, onConfigure }: { analysis: Analysis; target: number; onConfigure: () => void }) {
  const gaps = analysis.components.filter((item) => item.score < target).sort((a, b) => a.score - b.score);
  const recommendations: Record<string, string> = {
    'Context diversity': 'Add more indoor, outdoor, and low-light environments to your selection.',
    'Temporal coverage': 'Include longer sequences and more times of day.',
    'Layout variety': 'Bring in wider angles and less common camera viewpoints.',
    'Family coverage': 'Add examples from underrepresented object families.',
    'Scene diversity': 'Include more distinct locations and remove near-duplicate scenes.',
    'Label balance': 'Increase examples for your underrepresented labels.',
    'Visual clarity': 'Review blurred frames and replace low-resolution clips.',
  };
  return <>
    <section className="surface sample-scorecard">
      <div className="section-heading"><div><h2>Your scorecard</h2><p>Seven components, one clear picture.</p></div><span>Sample analysis</span></div>
      <div className="scorecard-legend"><span>Current score</span><span>Target {target} / 100</span></div>
      {analysis.components.map((item) => <div className="scorecard-row" key={item.name}>
        <span>{item.name}</span><div className="score-track" role="meter" aria-label={item.name} aria-valuenow={item.score} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${item.score}%` }} /><i style={{ left: `${Math.min(target, 99.5)}%` }} /></div>
        <strong>{item.score.toFixed(1)}</strong><small>{item.score >= target ? 'On target' : `${(target - item.score).toFixed(1)} to go`}</small>
      </div>)}
    </section>
    <section className="surface"><div className="section-heading"><div><h2>A path to your goal</h2><p>{Math.max(0, target - analysis.score).toFixed(1)} points to your target · illustrative recommendations</p></div><button className="text-hit" onClick={onConfigure}>Configure →</button></div>
      {gaps.length ? <ol className="next-steps">{gaps.slice(0, 3).map((item, index) => <li key={item.name}><span className="step-number">{index + 1}</span><div><strong>{item.name}</strong><p>{recommendations[item.name]}</p></div><span className="status-badge muted">{(target - item.score).toFixed(1)} pt gap</span></li>)}</ol> : <p>Your sample selection meets this goal. Set a higher target to explore the next steps.</p>}
    </section>
  </>;
}
