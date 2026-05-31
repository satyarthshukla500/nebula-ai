'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType =
  | 'guardian_enabled'
  | 'guardian_disabled'
  | 'check_in_completed'
  | 'check_in_missed'
  | 'escalation_stage_1'
  | 'escalation_stage_2'
  | 'escalation_stage_3'
  | 'escalation_stage_4'
  | 'user_response'
  | 'contact_notified'
  | 'risk_score_updated'

interface CrisisEvent {
  id: string
  event_type: EventType
  event_timestamp: string
  risk_score_at_event: number | null
  escalation_stage: number | null
  user_response: string | null
  metadata: Record<string, unknown>
}

interface EventsResponse {
  data: {
    events: CrisisEvent[]
    total: number
    page: number
    limit: number
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 20

const ALL_EVENT_TYPES: EventType[] = [
  'guardian_enabled',
  'guardian_disabled',
  'check_in_completed',
  'check_in_missed',
  'escalation_stage_1',
  'escalation_stage_2',
  'escalation_stage_3',
  'escalation_stage_4',
  'user_response',
  'contact_notified',
  'risk_score_updated',
]

const EVENT_LABELS: Record<EventType, string> = {
  guardian_enabled: 'Guardian Enabled',
  guardian_disabled: 'Guardian Disabled',
  check_in_completed: 'Check-in Completed',
  check_in_missed: 'Check-in Missed',
  escalation_stage_1: 'Escalation Stage 1',
  escalation_stage_2: 'Escalation Stage 2',
  escalation_stage_3: 'Escalation Stage 3',
  escalation_stage_4: 'Escalation Stage 4',
  user_response: 'User Response',
  contact_notified: 'Contact Notified',
  risk_score_updated: 'Risk Score Updated',
}

// ── Styling helpers ────────────────────────────────────────────────────────────

interface EventStyle {
  icon: string
  color: string
  bg: string
  border: string
}

function getEventStyle(type: EventType): EventStyle {
  switch (type) {
    case 'guardian_enabled':
      return { icon: '🛡️', color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' }
    case 'guardian_disabled':
      return { icon: '🔓', color: '#8892b0', bg: 'rgba(136,146,176,0.1)', border: 'rgba(136,146,176,0.2)' }
    case 'check_in_completed':
      return { icon: '✅', color: '#00d4ff', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.2)' }
    case 'check_in_missed':
      return { icon: '⚠️', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' }
    case 'escalation_stage_1':
      return { icon: '🔔', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' }
    case 'escalation_stage_2':
      return { icon: '📱', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' }
    case 'escalation_stage_3':
      return { icon: '🚨', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' }
    case 'escalation_stage_4':
      return { icon: '🆘', color: '#dc2626', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.3)' }
    case 'user_response':
      return { icon: '💬', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' }
    case 'contact_notified':
      return { icon: '📞', color: '#7c6bff', bg: 'rgba(124,107,255,0.1)', border: 'rgba(124,107,255,0.25)' }
    case 'risk_score_updated':
      return { icon: '📊', color: '#06b6d4', bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.2)' }
  }
}

function getRiskColor(score: number): string {
  if (score <= 20) return '#10b981'
  if (score <= 40) return '#f59e0b'
  if (score <= 60) return '#f97316'
  return '#ef4444'
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventHistory() {
  const [events, setEvents] = useState<CrisisEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState<EventType | ''>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const fetchEvents = useCallback(
    async (pageNum: number, type: EventType | '', append: boolean) => {
      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
        setError('')
      }

      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(PAGE_LIMIT),
        })
        if (type) params.set('type', type)

        const res = await fetch(`/api/guardian/events?${params.toString()}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || 'Failed to load events.')
          return
        }

        const data: EventsResponse = await res.json()
        const incoming = data.data?.events ?? []

        setTotal(data.data?.total ?? 0)
        setEvents((prev) => (append ? [...prev, ...incoming] : incoming))
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    []
  )

  // Initial load and filter changes reset to page 1
  useEffect(() => {
    setPage(1)
    fetchEvents(1, filterType, false)
  }, [filterType, fetchEvents])

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchEvents(nextPage, filterType, true)
  }

  const handleFilterChange = (type: EventType | '') => {
    setFilterType(type)
    setFilterOpen(false)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/guardian/events/export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Export failed. Please try again.')
        return
      }

      // Trigger file download
      const blob = await res.blob()
      const contentDisposition = res.headers.get('content-disposition')
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/)
      const filename = filenameMatch?.[1] ?? 'guardian-events.csv'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const hasMore = events.length < total

  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="event-history-loading">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl h-20 animate-pulse"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="event-history">
      {/* Header row: filter + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter dropdown */}
        <div className="relative" data-testid="filter-container">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-colors"
            style={{
              background: filterType
                ? `${getEventStyle(filterType).bg}`
                : 'rgba(255,255,255,0.06)',
              border: filterType
                ? `1px solid ${getEventStyle(filterType).border}`
                : '1px solid rgba(255,255,255,0.1)',
              color: filterType ? getEventStyle(filterType).color : '#ccd6f6',
            }}
            aria-haspopup="listbox"
            aria-expanded={filterOpen}
            data-testid="filter-button"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 3h12M3 7h8M5 11h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {filterType ? EVENT_LABELS[filterType] : 'All Event Types'}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              style={{ transform: filterOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {filterOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-20 rounded-xl overflow-hidden"
              style={{
                background: '#0f1225',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                minWidth: '220px',
              }}
              role="listbox"
              aria-label="Filter by event type"
              data-testid="filter-dropdown"
            >
              <button
                role="option"
                aria-selected={filterType === ''}
                onClick={() => handleFilterChange('')}
                className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={{
                  color: filterType === '' ? '#a78bfa' : '#ccd6f6',
                  background: filterType === '' ? 'rgba(167,139,250,0.1)' : 'transparent',
                }}
              >
                All Event Types
              </button>
              {ALL_EVENT_TYPES.map((type) => {
                const style = getEventStyle(type)
                return (
                  <button
                    key={type}
                    role="option"
                    aria-selected={filterType === type}
                    onClick={() => handleFilterChange(type)}
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
                    style={{
                      color: filterType === type ? style.color : '#ccd6f6',
                      background: filterType === type ? style.bg : 'transparent',
                    }}
                  >
                    <span>{style.icon}</span>
                    {EVENT_LABELS[type]}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Export button */}
        <Button
          onClick={handleExport}
          isLoading={isExporting}
          disabled={isExporting}
          className="flex items-center gap-2 text-sm px-4 py-2"
          style={{
            background: 'rgba(124,107,255,0.12)',
            border: '1px solid rgba(124,107,255,0.25)',
            borderRadius: '12px',
            color: '#a78bfa',
            fontWeight: '500',
          }}
          data-testid="export-button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 1v8M4 6l3 3 3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Export
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fca5a5',
          }}
          role="alert"
          data-testid="event-history-error"
        >
          {error}
        </div>
      )}

      {/* Event count summary */}
      {!error && (
        <p className="text-xs" style={{ color: '#8892b0' }} data-testid="event-count">
          {total === 0
            ? 'No events recorded yet.'
            : `Showing ${events.length} of ${total} event${total !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* Events list */}
      {events.length === 0 && !error ? (
        <div
          className="rounded-2xl px-6 py-10 flex flex-col items-center text-center"
          style={{
            background: '#0f1225',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          data-testid="empty-state"
        >
          <span className="text-4xl mb-3">📋</span>
          <p className="text-sm font-medium mb-1" style={{ color: '#ccd6f6' }}>
            No events found
          </p>
          <p className="text-xs" style={{ color: '#8892b0' }}>
            {filterType
              ? `No "${EVENT_LABELS[filterType]}" events have been recorded.`
              : 'Guardian Mode events will appear here once activity begins.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="events-list">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <Button
          onClick={handleLoadMore}
          isLoading={isLoadingMore}
          disabled={isLoadingMore}
          className="w-full"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            color: '#8892b0',
            fontWeight: '500',
          }}
          data-testid="load-more-button"
        >
          {isLoadingMore ? 'Loading…' : `Load more (${total - events.length} remaining)`}
        </Button>
      )}
    </div>
  )
}

// ── Event row ──────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: CrisisEvent }) {
  const [expanded, setExpanded] = useState(false)
  const style = getEventStyle(event.event_type)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: '#0f1225',
        border: `1px solid rgba(255,255,255,0.08)`,
      }}
      data-testid="event-row"
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ background: 'transparent' }}
        aria-expanded={expanded}
        aria-label={`${EVENT_LABELS[event.event_type]} — ${formatTimestamp(event.event_timestamp)}`}
      >
        {/* Icon badge */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
          style={{ background: style.bg, border: `1px solid ${style.border}` }}
          aria-hidden="true"
        >
          {style.icon}
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'white' }} data-testid="event-type-label">
            {EVENT_LABELS[event.event_type]}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#8892b0' }} data-testid="event-timestamp">
            {formatTimestamp(event.event_timestamp)}
          </p>
        </div>

        {/* Risk score badge */}
        {event.risk_score_at_event !== null && (
          <div
            className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              background: `${getRiskColor(event.risk_score_at_event)}20`,
              border: `1px solid ${getRiskColor(event.risk_score_at_event)}40`,
              color: getRiskColor(event.risk_score_at_event),
            }}
            data-testid="event-risk-score"
            aria-label={`Risk score: ${event.risk_score_at_event}`}
          >
            {event.risk_score_at_event}
          </div>
        )}

        {/* Expand chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: '#8892b0',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="px-4 pb-4 space-y-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          data-testid="event-details"
        >
          <div className="pt-3 grid grid-cols-2 gap-3">
            {/* Timestamp detail */}
            <DetailCell label="Timestamp" value={formatTimestamp(event.event_timestamp)} />

            {/* Event type */}
            <DetailCell label="Event Type" value={EVENT_LABELS[event.event_type]} />

            {/* Risk score */}
            {event.risk_score_at_event !== null && (
              <DetailCell
                label="Risk Score"
                value={`${event.risk_score_at_event} / 100`}
                valueColor={getRiskColor(event.risk_score_at_event)}
              />
            )}

            {/* Escalation stage */}
            {event.escalation_stage !== null && (
              <DetailCell label="Escalation Stage" value={`Stage ${event.escalation_stage}`} />
            )}
          </div>

          {/* User response */}
          {event.user_response && (
            <div
              className="rounded-lg px-3 py-2.5 mt-2"
              style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: '#a78bfa' }}>
                User Response
              </p>
              <p className="text-sm" style={{ color: '#ccd6f6' }}>
                {event.user_response}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail cell ────────────────────────────────────────────────────────────────

function DetailCell({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: '#8892b0' }}>
        {label}
      </p>
      <p className="text-sm font-medium" style={{ color: valueColor ?? '#ccd6f6' }}>
        {value}
      </p>
    </div>
  )
}
