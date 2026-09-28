import { teamColour } from '../data/teams'

/** Decorative: the team name is always written next to it. */
export function TeamSwatch({ constructorId }: { constructorId: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-[1px] ring-1 ring-white/20"
      style={{ backgroundColor: teamColour(constructorId) }}
    />
  )
}
