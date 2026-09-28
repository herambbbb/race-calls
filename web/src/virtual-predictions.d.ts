declare module 'virtual:predictions' {
  /** Repository path to slimmed record; validated by the loader's guard. */
  const predictions: Record<string, unknown>
  export default predictions
}

declare module 'virtual:scores' {
  /** Repository path to score record; validated by the loader's guard. */
  const scores: Record<string, unknown>
  export default scores
}
