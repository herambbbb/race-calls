// A 0 to 1 bar. Decorative: the number is always printed beside it.
export function Bar({ value, colour }: { value: number; colour: string }) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%`
  return (
    <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-[1px] bg-raised">
      <span className="block h-full" style={{ width, backgroundColor: colour }} />
    </span>
  )
}
