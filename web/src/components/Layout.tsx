// Site frame: a floating pill navigation, the page, and a poster footer with the
// non-affiliation notice and data credits. Each route is its own page: a new page
// starts at the top at once (never a scroll up through the old one) and fades in.
// Wheel and touch scrolling are smoothed with Lenis, unless motion is reduced.
import Lenis from 'lenis'
import { useEffect, useRef, type RefObject } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router'
import { nextRace } from '../data/calendar'
import { Backdrop } from './art/Backdrop'
import { useEggs } from './eggs/context'
import { EasterEggs } from './eggs/EasterEggs'
import { Finish } from './eggs/Finish'
import { REPO } from '../data/format'
import { useNow } from './useNow'

function useSmoothScroll() {
  const lenis = useRef<Lenis | null>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // No `anchors`: hash jumps are the router's job, and they never animate.
    lenis.current = new Lenis({ autoRaf: true })
    return () => {
      lenis.current?.destroy()
      lenis.current = null
    }
  }, [])
  return lenis
}

function hashTarget(hash: string): HTMLElement | null {
  if (!hash) return null
  let id = hash.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    // A malformed escape: look the raw id up instead.
  }
  return document.getElementById(id)
}

/**
 * A new page starts at the top at once, or at its hash target just under the sticky
 * header. Back and forward keep the browser's own scroll restoration.
 */
function useScrollOnNavigate(lenis: RefObject<Lenis | null>) {
  const { pathname, hash, key } = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    if (type === 'POP') return
    const target = hashTarget(hash)
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
    // offsetTop chains ignore the page-entry animation, so the landing spot is exact.
    let top = 0
    for (let el: HTMLElement | null = target; el; el = el.offsetParent as HTMLElement | null) top += el.offsetTop
    const y = target ? Math.max(0, top - header - 16) : 0
    if (lenis.current) {
      // Lenis still knows the old page's height until it measures the new one.
      lenis.current.resize()
      lenis.current.scrollTo(y, { immediate: true, force: true })
    } else {
      window.scrollTo({ top: y, behavior: 'instant' })
    }
  }, [pathname, hash, key, type, lenis])
}

/**
 * Publishes the sticky header's height as --header-h, so a full-bleed section can sit
 * under it (the front page hero) and still keep its text clear of it.
 */
function useHeaderHeight() {
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const set = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`)
    set()
    const observer = new ResizeObserver(set)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display leading-none tracking-tight ${className}`}>
      Race <span className="italic">Calls</span>
    </span>
  )
}

function Mark() {
  return (
    <span
      aria-hidden="true"
      className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-ink"
    >
      <span className="chequer absolute inset-0 text-text/15" />
      {/* A tiny rear-wing flap: it opens when DRS does. */}
      <span className="mark-flap absolute top-1.5 h-0.5 w-4 rounded-full bg-text/60 transition-transform duration-300" />
      <span className="relative size-2 rounded-full bg-star shadow-[0_0_12px_2px_rgb(245_197_66/0.6)]" />
    </span>
  )
}

const PAGES: [string, string][] = [
  ['/season', 'Season'],
  ['/backtests', 'Backtests'],
  ['/method', 'Method'],
]

const item = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-white/10 text-text' : 'text-muted hover:text-text'}`

function NextPill() {
  const now = useNow(30_000)
  const next = nextRace(now)
  if (!next) return null
  const days = Math.max(0, Math.floor((Date.parse(next.race_start) - now) / 86_400_000))
  return (
    <Link
      to={`/race/${next.round}`}
      className="glass tag hidden items-center gap-2 rounded-full border border-white/10 py-2 pr-4 pl-3 text-text transition-colors hover:border-white/25 md:inline-flex"
    >
      <span aria-hidden="true" className="animate-pulse-dot size-1.5 rounded-full bg-sector-green text-sector-green" />
      Next: R{next.round} in {days === 0 ? 'under a day' : `${days}d`}
    </Link>
  )
}

export function Layout() {
  return (
    <EasterEggs>
      <Shell />
    </EasterEggs>
  )
}

function Shell() {
  const { drs, tapMark } = useEggs()
  const lenis = useSmoothScroll()
  useScrollOnNavigate(lenis)
  useHeaderHeight()
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <Backdrop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-[2px] focus:border focus:border-text focus:bg-ink focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <nav aria-label="Main" className="flex min-w-0 items-center gap-1.5">
            <Link to="/" onClick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) tapMark() }} className="glass flex shrink-0 items-center gap-2 rounded-full border border-white/10 p-1 pr-4">
              <Mark />
              <Wordmark className="text-xl" />
            </Link>
            <span className="glass hidden items-center gap-0.5 rounded-full border border-white/10 p-1 sm:flex">
              {PAGES.map(([to, label]) => (
                <NavLink key={to} to={to} className={item}>
                  {label}
                </NavLink>
              ))}
            </span>
          </nav>
          <div className="flex items-center gap-1.5">
            {drs && (
              <span className="glass egg-in tag inline-flex items-center gap-2 rounded-full border border-sector-green/50 py-2 pr-3 pl-2.5 text-sector-green">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-sector-green shadow-[0_0_8px_2px_rgb(79_217_143/0.6)]" />
                DRS
              </span>
            )}
            <NextPill />
            <a
              href={REPO}
              className="glass inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-sm text-muted transition-colors hover:text-text"
            >
              Repo
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <nav aria-label="Pages" className="glass mx-auto mt-2 flex max-w-6xl justify-between gap-1 rounded-full border border-white/10 p-1 sm:hidden">
          {PAGES.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `${item({ isActive })} flex-1 text-center`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="w-full min-w-0 flex-1 focus:outline-none">
        {/* Keyed by path, so every page arrives with its own entrance. */}
        <div key={pathname} className="animate-page">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line">
      <div aria-hidden="true" className="pointer-events-none select-none">
        {[0, 1, 2].map((i) => (
          <p
            key={i}
            className="-mb-[0.18em] px-4 text-center font-display text-[19vw] leading-[0.8] tracking-tight whitespace-nowrap"
            style={{
              color: i === 0 ? 'var(--color-raised)' : 'transparent',
              WebkitTextStroke: i === 0 ? undefined : '1px var(--color-line)',
              opacity: 1 - i * 0.3,
            }}
          >
            Race <span className="italic">Calls</span>
          </p>
        ))}
      </div>
      <div className="relative border-t border-line bg-ink">
        <Finish />
        <nav aria-label="Footer" className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 border-b border-line px-4 py-5 text-sm sm:px-6">
          <Link to="/" className="text-muted hover:text-text">Home</Link>
          <Link to="/season" className="text-muted hover:text-text">Season</Link>
          <Link to="/season#leaderboard" className="text-muted hover:text-text">Leaderboard</Link>
          <Link to="/season#races" className="text-muted hover:text-text">Races</Link>
          <Link to="/backtests" className="text-muted hover:text-text">Backtests</Link>
          <Link to="/method" className="text-muted hover:text-text">Method</Link>
          <a href={REPO} className="text-muted hover:text-text">Repository ↗</a>
        </nav>
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:px-6">
          <p>
            <span className="tag block text-text">Calls</span>
            Jev by TypeSafe. Jev returns numbers only, no reasons.
          </p>
          <p>
            <span className="tag block text-text">Data</span>
            Schedule, grid, and results from Jolpica. Race control and weather from OpenF1. History from f1db.
          </p>
          <p>
            <span className="tag block text-text">Notice</span>
            Unofficial fan project. Not affiliated with the FIA or any racing series or team.
          </p>
        </div>
      </div>
    </footer>
  )
}
