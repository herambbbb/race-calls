// Site frame: wordmark, navigation, and the non-affiliation notice with data credits.
import { NavLink, Outlet } from 'react-router'

const link = ({ isActive }: { isActive: boolean }) =>
  `text-sm tracking-wide ${isActive ? 'text-text' : 'text-muted hover:text-text'}`

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[2px] focus:border focus:border-text focus:bg-ink focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-3">
          <NavLink to="/" className="font-display text-2xl leading-none italic">
            Race Calls
          </NavLink>
          <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1">
            <NavLink to="/" end className={link}>
              Races
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl min-w-0 flex-1 px-4 py-6 focus:outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-4 py-4 text-xs leading-relaxed text-muted">
          <p>
            Unofficial fan project. Not affiliated with the FIA or any racing series or team. Calls by
            Jev (typesafe) via OpenRouter. Schedule, grid, and results from Jolpica; race control and
            weather from OpenF1; history from f1db.
          </p>
        </div>
      </footer>
    </div>
  )
}
