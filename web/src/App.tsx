// Routes:
//   /                   races with calls, then backtests (the season page comes later)
//   /race/:round        a live race of the current season
//   /backtest/:round    a backtest race
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { RacePage } from './pages/RacePage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="race/:round" element={<RacePage kind="live" />} />
        <Route path="backtest/:round" element={<RacePage kind="backtest" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
