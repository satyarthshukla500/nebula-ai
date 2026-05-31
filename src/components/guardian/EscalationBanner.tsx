'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface EscalationBannerProps {
  isVisible: boolean
  onCheckInNow: () => void
  onSnooze: () => void
  overdueMinutes?: number
}

function formatOverdue(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (remaining === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`
  return `${hours}h ${remaining}m`
}

export function EscalationBanner({
  isVisible,
  onCheckInNow,
  onSnooze,
  overdueMinutes,
}: EscalationBannerProps) {
  const [isSnoozed, setIsSnoozed] = useState(false)

  if (!isVisible || isSnoozed) return null

  const handleSnooze = () => {
    setIsSnoozed(true)
    onSnooze()
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="escalation-banner"
      className="w-full flex items-center gap-4 px-5 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.12))',
        borderBottom: '1px solid rgba(245,158,11,0.35)',
        borderTop: '1px solid rgba(245,158,11,0.2)',
      }}
    >
      {/* Warning icon */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          background: 'rgba(245,158,11,0.2)',
          border: '1px solid rgba(245,158,11,0.4)',
        }}
        aria-hidden="true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#fcd34d' }}>
          Check-in Overdue
        </p>
        <p className="text-xs" style={{ color: '#d1a84b' }}>
          {overdueMinutes != null
            ? `Your wellness check-in is ${formatOverdue(overdueMinutes)} overdue.`
            : 'Your wellness check-in is overdue.'}
          {' '}Please check in to stop escalation.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          onClick={handleSnooze}
          data-testid="escalation-snooze-button"
          className="text-xs px-3 py-1.5"
          style={{ color: '#8892b0', minWidth: 0 }}
        >
          Snooze
        </Button>
        <Button
          onClick={onCheckInNow}
          data-testid="escalation-checkin-button"
          className="text-xs px-4 py-1.5 font-semibold"
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            minWidth: 0,
          }}
        >
          Check In Now
        </Button>
      </div>
    </div>
  )
}
