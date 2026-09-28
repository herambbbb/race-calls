// Routes, each its own page:
//   /                   front page: what this is, the next race, the circuits to come
//   /season             leaderboard, calibration, every race with its status
//   /backtests          past races run after the fact, kept apart
//   /method             how calls are made, committed, and scored
//   /race/:round        a live race of the current season (upcoming ones too)
//   /backtest/:round    a backtest race
//   /preview[/:state]   dev only: every page state, for design review
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { Backtests } from './pages/Backtests'
import { Landing } from './pages/Landing'
import { Method } from './pages/Method'
import { NotFound } from './pages/NotFound'
import { RacePage } from './pages/RacePage'
import { Season } from './pages/Season'

const Preview = import.meta.env.DEV
  ? lazy(() => import('./preview/Preview').then((m) => ({ default: m.Preview })))
  : null

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="season" element={<Season />} />
        <Route path="backtests" element={<Backtests />} />
        <Route path="method" element={<Method />} />
        <Route path="race/:round" element={<RacePage kind="live" />} />
        <Route path="backtest/:round" element={<RacePage kind="backtest" />} />
        {Preview && (
          <>
            <Route path="preview" element={<Suspense><Preview /></Suspense>} />
            <Route path="preview/:state" element={<Suspense><Preview /></Suspense>} />
          </>
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
