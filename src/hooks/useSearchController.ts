import { useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { SearchHistoryType } from '../shared/contracts'

interface SearchControllerOptions {
  navigate: NavigateFunction
  saveSearchQuery: (query: string) => Promise<void>
  addRecentSearch: (query: string, type?: SearchHistoryType) => Promise<void>
}

function getSearchRoute(query: string, type: SearchHistoryType) {
  const encodedQuery = encodeURIComponent(query)

  return {
    sidebar: '/search',
    artists: `/artists?artist=${encodedQuery}`,
    albums: `/albums?album=${encodedQuery}`,
    songs: `/songs?search=${encodedQuery}`,
    playlists: `/playlists?search=${encodedQuery}`,
    folders: '/search?type=folders',
  }[type]
}

export function useSearchController({ navigate, saveSearchQuery, addRecentSearch }: SearchControllerOptions) {
  const [searchInput, setSearchInput] = useState('')
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('')
  const [searchResultQuery, setSearchResultQuery] = useState('')
  const [searchResultsLoading, setSearchResultsLoading] = useState(false)
  const searchResultTimerRef = useRef<number | null>(null)

  const clearSearchResultTimer = () => {
    if (searchResultTimerRef.current != null) {
      window.clearTimeout(searchResultTimerRef.current)
      searchResultTimerRef.current = null
    }
  }

  useEffect(() => {
    return clearSearchResultTimer
  }, [])

  const commitSearchQuery = async (value: string, type: SearchHistoryType = 'sidebar') => {
    const nextQuery = value.trim()
    clearSearchResultTimer()

    setSearchInput(nextQuery)
    setSubmittedSearchQuery(nextQuery)

    if (!nextQuery) {
      setSearchResultsLoading(false)
      setSearchResultQuery('')
      await saveSearchQuery('')
      return
    }

    navigate(getSearchRoute(nextQuery, type))
    setSearchResultsLoading(true)
    searchResultTimerRef.current = window.setTimeout(() => {
      setSearchResultQuery(nextQuery)
      setSearchResultsLoading(false)
      searchResultTimerRef.current = null
    }, 40)
    void addRecentSearch(nextQuery, type)
  }

  const commitDirectorySearchQuery = (value: string, folderRelativePath: string) => {
    const nextQuery = value.trim()
    if (!nextQuery) {
      return
    }

    clearSearchResultTimer()
    setSearchInput(nextQuery)
    setSubmittedSearchQuery(nextQuery)
    setSearchResultQuery(nextQuery)
    setSearchResultsLoading(false)
    navigate(`/search?folder=${encodeURIComponent(folderRelativePath)}`)
    void addRecentSearch(nextQuery, 'folders')
  }

  return {
    searchInput,
    submittedSearchQuery,
    searchResultQuery,
    searchResultsLoading,
    setSearchInput,
    commitSearchQuery,
    commitDirectorySearchQuery,
  }
}
