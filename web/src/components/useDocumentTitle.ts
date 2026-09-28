// Sets document.title for the current route. Titles never carry the series name.
import { useEffect } from 'react'

const SITE = 'Race Calls'

export function useDocumentTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} - ${SITE}` : SITE
  }, [page])
}
