import { createContext, useContext } from 'react'
import type { EggId } from '../../data/eggs'

export interface Eggs {
  found: Set<EggId>
  drs: boolean
  /** Whether the keyboard secrets listen at all (they can be switched off). */
  keysOn: boolean
  setKeysOn: (on: boolean) => void
  trigger: (id: EggId) => void
  /** A plain click on the logo mark: three in a row is the radio, five is lights out. */
  tapMark: () => void
}

export const EggsContext = createContext<Eggs>({
  found: new Set(),
  drs: false,
  keysOn: true,
  setKeysOn: () => {},
  trigger: () => {},
  tapMark: () => {},
})

export const useEggs = () => useContext(EggsContext)
