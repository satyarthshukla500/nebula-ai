'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface CheckInScheduleSelectorProps {
  onBack: () => void
  onActivated: () => void
}

const INTERVALS = [
  { value: '6 hours', label: 'Every 6 hours', description: 'More frequent check-ins' },
  { value: '12 hours', label: 'Every 12 hours', description: 'Twice daily (recommended)', recommended: true },
  { value: '24 hours', label: 'Every 24 hours', description: 'Once daily' },
]

const PREFERRED_TIMES = [
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '18:00', label: '6:00 PM' },
  { value: '20:00', label: '8:00 PM' },
  { value: '21:00', label: '9:00 PM' },
  { value: '22:00', label: '10:00 PM' },
]

export function CheckInScheduleSelector({ onBack, onActivated }: CheckInScheduleSelectorProps) {
  const [interval, setInterval] = useState('12 hours')
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['09:00', '21:00'])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const toggleTime = (time: string) => {
    setSelectedTimes((prev) => {
      if (prev.includes(time)) {
        // Don't allow deselecting if only one time is selected
        if (prev.length <= 1) return prev
        return prev.filter((t) => t !== time)
      }
      return [...prev, time].sort()
    })
  }

  const handleActivate = async () => {
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/guardian/settings/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentVersion: '1.0',
          checkInInterval: interval,
          preferredTimes: selectedTimes,
          riskThreshold: 40,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to enable Guardian Mode')
        return
      }

      onActivated()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <p className="text-sm" style={{ color: '#8892b0' }}>
          Choose how often you&apos;d like to receive wellness check-in reminders. You can
          change this at any time in your settings.
        </p>

        {/* Interval selector */}
        <div>
          <p className="text-sm font-medium mb-3" style={{ color: '#ccd6f6' }}>
            Check-in Frequency
          </p>
          <div className="space-y-2">
            {INTERVALS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setInterval(opt.value)}
                data-testid={`interval-${opt.value.replace(' ', '-')}`}
                className="w-full text-left rounded-xl px-4 py-3 transition-all"
                style={{
                  background:
                    interval === opt.value
                      ? 'rgba(124,107,255,0.15)'
                      : 'rgba(255,255,255,0.04)',
                  border:
                    interval === opt.value
                      ? '2px solid #7c6bff'
                      : '2px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'white' }}>
                      {opt.label}
                    </span>
                    {opt.recommended && (
                      <span
                        className="ml-2 text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(124,107,255,0.2)',
                          color: '#a78bfa',
                        }}
                      >
                        Recommended
                      </span>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: '#8892b0' }}>
                      {opt.description}
                    </p>
                  </div>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background:
                        interval === opt.value
                          ? 'linear-gradient(135deg, #7c6bff, #00d4ff)'
                          : 'rgba(255,255,255,0.1)',
                      border: interval === opt.value ? 'none' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    {interval === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Preferred times */}
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: '#ccd6f6' }}>
            Preferred Check-in Times
          </p>
          <p className="text-xs mb-3" style={{ color: '#8892b0' }}>
            Select one or more times when you&apos;d like to receive reminders
          </p>
          <div className="flex flex-wrap gap-2" data-testid="time-selector">
            {PREFERRED_TIMES.map((t) => {
              const selected = selectedTimes.includes(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleTime(t.value)}
                  data-testid={`time-${t.value}`}
                  className="px-3 py-1.5 rounded-lg text-sm transition-all"
                  style={{
                    background: selected
                      ? 'rgba(124,107,255,0.2)'
                      : 'rgba(255,255,255,0.05)',
                    border: selected
                      ? '1px solid #7c6bff'
                      : '1px solid rgba(255,255,255,0.1)',
                    color: selected ? '#a78bfa' : '#8892b0',
                    fontWeight: selected ? '600' : '400',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <p className="text-xs" style={{ color: '#6ee7b7' }}>
            ✓ You can adjust your schedule at any time from Guardian Mode settings.
            Quiet hours (10 PM – 8 AM) are respected by default.
          </p>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
            role="alert"
          >
            {error}
          </div>
        )}
      </div>

      <div
        className="px-6 py-4 flex gap-3 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="flex-1"
          style={{ color: '#8892b0' }}
          disabled={isLoading}
        >
          Back
        </Button>
        <Button
          onClick={handleActivate}
          isLoading={isLoading}
          className="flex-1"
          style={{
            background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
            border: 'none',
            borderRadius: '10px',
            fontWeight: '600',
          }}
          data-testid="activate-button"
        >
          Activate Guardian Mode
        </Button>
      </div>
    </div>
  )
}
