import { useState } from 'react'

const SEARCH_HISTORY_LIMIT = 10

function readSearchHistory(storageKey: string) {
  const rawValue = window.localStorage.getItem(storageKey)
  return rawValue ? JSON.parse(rawValue) as string[] : []
}

function writeSearchHistory(storageKey: string, entries: string[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(entries))
}

export function usePageSearchHistory(storageKey: string) {
  const [entries, setEntries] = useState(() => readSearchHistory(storageKey).slice(0, SEARCH_HISTORY_LIMIT))

  const addEntry = (query: string) => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return
    }

    setEntries((current) => {
      const nextEntries = [
        normalizedQuery,
        ...current.filter((entry) => entry.toLocaleLowerCase() !== normalizedQuery.toLocaleLowerCase()),
      ].slice(0, SEARCH_HISTORY_LIMIT)
      writeSearchHistory(storageKey, nextEntries)
      return nextEntries
    })
  }

  const removeEntry = (query: string) => {
    setEntries((current) => {
      const nextEntries = current.filter((entry) => entry !== query)
      writeSearchHistory(storageKey, nextEntries)
      return nextEntries
    })
  }

  const clearEntries = () => {
    setEntries([])
    writeSearchHistory(storageKey, [])
  }

  return {
    entries,
    addEntry,
    removeEntry,
    clearEntries,
  }
}
