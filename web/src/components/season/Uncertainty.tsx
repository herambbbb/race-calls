// Why every number on a leaderboard here is uncertain. Racing is a sport: the result of
// one afternoon turns on moments no model sees coming, and the samples are tiny.
const REASONS: { title: string; body: string }[] = [
  {
    title: 'It is a sport',
    body: 'A safety car at the wrong moment, a first-lap crash, a sudden shower, a failed engine, a slow pit stop or a penalty can decide a race. A good call can lose and a bad call can win.',
  },
  {
    title: 'The samples are tiny',
    body: 'A season has only a handful of races left to call. Gaps like 0.066 against 0.067 in podium Brier are well inside what luck alone produces; it takes many races to tell skill from chance.',
  },
  {
    title: 'The calls are not independent',
    body: 'The 22 podium chances in a race move together: one crash can take out two front runners, and teammates share a car. So 22 calls a race is worth far less than 22 separate tests.',
  },
  {
    title: 'The inputs are imperfect',
    body: 'The grid is the qualifying order, so penalties announced later are missing. The historical rates come from 2014 to 2025, before the 2026 rules. Data sources can lag or be wrong: one calendar still listed a race three hours after it had actually run.',
  },
  {
    title: 'Backtests may be memorised',
    body: 'Jev may have seen the backtest results in training, so a good backtest score can be memory rather than skill. Only races after the model was built are a fair test.',
  },
]

export function Uncertainty({ className = '' }: { className?: string }) {
  return (
    <aside aria-labelledby="uncertainty-heading" className={`rounded-[22px] border border-line bg-panel p-6 ${className}`}>
      <h3 id="uncertainty-heading" className="font-display text-2xl leading-tight">
        Read these numbers <span className="italic">with care</span>
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Every figure here comes with real uncertainty. Treat the leaderboard as a running record, not a verdict.
      </p>
      <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm leading-relaxed sm:grid-cols-2 lg:grid-cols-3">
        {REASONS.map((r) => (
          <div key={r.title}>
            <dt className="font-semibold text-text">{r.title}</dt>
            <dd className="mt-1 text-muted">{r.body}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
