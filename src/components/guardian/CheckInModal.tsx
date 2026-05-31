'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface CheckInModalProps {
  isOpen: boolean
  onClose: () => void
  onCheckInComplete: (nextCheckInDue: string) => void
}

const MOOD_LABELS: Record<number, string> = {
  1: 'Very Low',
  2: 'Low',
  3: 'Below Average',
  4: 'Slightly Low',
  5: 'Neutral',
  6: 'Slightly Good',
  7: 'Good',
  8: 'Very Good',
  9: 'Great',
  10: 'Excellent',
}

function getMoodColor(rating: number): string {
  if (rating <= 3) return '#ef4444'
  if (rating <= 5) return '#f59e0b'
  if (rating <= 7) return '#00d4ff'
  return '#10b981'
}

function formatNextCheckIn(value: string): string {
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CheckInModal({ isOpen, onClose, onCheckInComplete }: CheckInModalProps) {
  const [moodRating, setMoodRating] = useState(5)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSnoozing, setIsSnoozing] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState<{ nextCheckInDue: string } | null>(null)

  if (!isOpen) return null

  const moodColor = getMoodColor(moodRating)

  const handleSubmit = async () => {
    setError('')
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/guardian/checkin/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moodRating,
          notes: notes.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to submit check-in. Please try again.')
        return
      }

      setSuccessData({ nextCheckInDue: data.data?.nextCheckInDue ?? '' })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSnooze = async () => {
    setError('')
    setIsSnoozing(true)

    try {
      const res = await fetch('/api/guardian/checkin/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to snooze. Please try again.')
        return
      }

      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSnoozing(false)
    }
  }

  const handleDone = () => {
    if (successData) {
      onCheckInComplete(successData.nextCheckInDue)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-modal-title"
    >
      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <h2 id="checkin-modal-title" className="text-lg font-semibold" style={{ color: 'white' }}>
              {successData ? 'Check-in Complete' : 'Wellness Check-in'}
            </h2>
          </div>
          {!successData && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 transition-colors"
              style={{ color: '#8892b0' }}
              aria-label="Close"
              disabled={isSubmitting || isSnoozing}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {successData ? (
            /* Success state */
            <div className="flex flex-col items-center text-center py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(0,212,255,0.2))',
                  border: '2px solid rgba(16,185,129,0.4)',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path
                    d="M8 16l5.5 5.5 10.5-10.5"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'white' }}>
                Check-in Submitted
              </h3>
              <p className="text-sm mb-6" style={{ color: '#8892b0' }}>
                Thanks for checking in. Your wellness data has been recorded.
              </p>

              {successData.nextCheckInDue && (
                <div
                  className="w-full rounded-xl px-5 py-4 flex items-center gap-4 text-left"
                  style={{
                    background: 'rgba(124,107,255,0.1)',
                    border: '1px solid rgba(124,107,255,0.25)',
                  }}
                >
                  <span className="text-2xl flex-shrink-0">📅</span>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: '#7c6bff' }}>
                      Next Check-in
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'white' }}>
                      {formatNextCheckIn(successData.nextCheckInDue)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm" style={{ color: '#8892b0' }}>
                How are you feeling right now? Your response helps Guardian Mode monitor your wellness.
              </p>

              {/* Mood rating slider */}
              <div data-testid="mood-rating-section">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium" style={{ color: '#ccd6f6' }}>
                    Mood Rating
                  </p>
                  <div
                    className="flex items-center gap-2 px-3 py-1 rounded-full"
                    style={{
                      background: `${moodColor}20`,
                      border: `1px solid ${moodColor}40`,
                    }}
                  >
                    <span className="text-lg font-bold" style={{ color: moodColor }}>
                      {moodRating}
                    </span>
                    <span className="text-xs font-medium" style={{ color: moodColor }}>
                      {MOOD_LABELS[moodRating]}
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={moodRating}
                    onChange={(e) => setMoodRating(Number(e.target.value))}
                    aria-label="Mood rating from 1 to 10"
                    aria-valuemin={1}
                    aria-valuemax={10}
                    aria-valuenow={moodRating}
                    aria-valuetext={`${moodRating} - ${MOOD_LABELS[moodRating]}`}
                    data-testid="mood-slider"
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${moodColor} 0%, ${moodColor} ${(moodRating - 1) / 9 * 100}%, rgba(255,255,255,0.1) ${(moodRating - 1) / 9 * 100}%, rgba(255,255,255,0.1) 100%)`,
                      outline: 'none',
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs" style={{ color: '#8892b0' }}>1 — Very Low</span>
                    <span className="text-xs" style={{ color: '#8892b0' }}>10 — Excellent</span>
                  </div>
                </div>

                {/* Mood tick marks */}
                <div className="flex justify-between mt-1 px-0.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMoodRating(n)}
                      aria-label={`Set mood to ${n}`}
                      className="text-xs w-5 text-center transition-colors"
                      style={{
                        color: n === moodRating ? moodColor : 'rgba(255,255,255,0.2)',
                        fontWeight: n === moodRating ? '700' : '400',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes textarea */}
              <div data-testid="notes-section">
                <label
                  htmlFor="checkin-notes"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#ccd6f6' }}
                >
                  Notes{' '}
                  <span className="text-xs font-normal" style={{ color: '#8892b0' }}>
                    (optional)
                  </span>
                </label>
                <textarea
                  id="checkin-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How are you doing? Any thoughts you'd like to share..."
                  rows={3}
                  maxLength={1000}
                  data-testid="notes-textarea"
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(124,107,255,0.5)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.1)'
                  }}
                />
                <p className="text-xs mt-1 text-right" style={{ color: '#8892b0' }}>
                  {notes.length}/1000
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
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex gap-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {successData ? (
            <Button
              onClick={handleDone}
              className="w-full"
              style={{
                background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '600',
              }}
              data-testid="done-button"
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={handleSnooze}
                disabled={isSubmitting || isSnoozing}
                isLoading={isSnoozing}
                className="flex-1"
                style={{ color: '#8892b0' }}
                data-testid="snooze-button"
              >
                Snooze
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || isSnoozing}
                isLoading={isSubmitting}
                className="flex-1"
                style={{
                  background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                }}
                data-testid="submit-button"
              >
                Submit Check-in
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
