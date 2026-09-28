// Five start lights. On their own they run a real race start on a loop (see
// useStartSequence); given `lit`, they show that count instead, for the spoiler guard's
// reveal. Decorative: whatever they signal is also said in words nearby.
import { useStartSequence } from './useStartSequence'

export function StartLights({ lit, size = 'md' }: { lit?: number | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const { ref, lit: running } = useStartSequence<HTMLSpanElement>()
  const shown = lit ?? running
  const dot = size === 'sm' ? 'size-3' : size === 'lg' ? 'size-9 sm:size-14' : 'size-5 sm:size-6'
  return (
    <span ref={ref} aria-hidden="true" className="inline-flex gap-1.5 rounded-md border border-line bg-ink p-1.5 sm:gap-2 sm:p-2">
      {[0, 1, 2, 3, 4].map((i) => {
        const on = i < shown
        return (
          <span key={i} className="flex flex-col gap-1 rounded-sm bg-panel p-1">
            <span
              className={`${dot} rounded-full transition-[background-color,box-shadow] ${on ? 'duration-75' : 'duration-150'} ${
                on ? 'bg-[#ff3b30] shadow-[0_0_14px_3px_rgb(255_59_48/0.55)]' : 'bg-[#2a1413]'
              }`}
            />
            <span className={`${dot} rounded-full bg-[#101a33]`} />
          </span>
        )
      })}
    </span>
  )
}
