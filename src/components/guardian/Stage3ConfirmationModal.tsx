'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface Stage3ConfirmationModalProps {
  isOpen: boolean
  onImOkay: () => void
  onCheckInNow: () => void
  onClose: () => void
}

export function Stage3ConfirmationModal({
  isOpen,
  onImOkay,
  onCheckInNow,
  onClose,
}: Stage3ConfirmationModalProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleImOkay = async () => {
    setError('')
    setIsConfirming(true)
    try {
      const res = await fetch('/api/guardian/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current',
          stage: 3,
          reason: 'user_confirmed_okay',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to confirm. Please try again.')
        return
      }

      onImOkay()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage3-modal-title"
      data-testid="stage3-confirmation-modal"
    >
      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col"
        style={{
          background: '#0f1225',
          border: '2px solid rgba(239,68,68,0.4)',
          boxShadow: '0 0 60px rgba(239,68,68,0.2), 0 25px 50px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-center gap-3">
            {/* Pulsing alert icon */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(239,68,68,0.2)',
                border: '2px solid rgba(239,68,68,0.5)',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2
              id="stage3-modal-title"
              className="text-lg font-bold"
              style={{ color: '#fca5a5' }}
            >
              Wellness Check Required
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors"
            style={{ color: '#8892b0' }}
            aria-label="Close"
            disabled={isConfirming}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          {/* Stage indicator */}
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <span className="text-2xl flex-shrink-0" aria-hidden="true">🚨</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#ef4444' }}>
                Stage 3 Escalation Active
              </p>
              <p className="text-sm" style={{ color: '#fca5a5' }}>
                Multiple check-ins have been missed. Please confirm you&apos;re okay.
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: '#8892b0' }}>
            Guardian Mode has detected several missed wellness check-ins. To prevent your emergency
            contact from being notified, please confirm you&apos;re okay or complete a check-in now.
          </p>

          {/* What happens next */}
          <div
            className="rounded-xl px-4 py-4 space-y-2"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#8892b0' }}>
              What happens if you don&apos;t respond
            </p>
            <div className="flex items-start gap-2">
              <span className="text-xs mt-0.5" style={{ color: '#ef4444' }}>→</span>
              <p className="text-xs" style={{ color: '#8892b0' }}>
                After 4 hours, your emergency contact will be notified that you&apos;ve missed check-ins.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs mt-0.5" style={{ color: '#8892b0' }}>→</span>
              <p className="text-xs" style={{ color: '#8892b0' }}>
                They will NOT receive your messages or any medical information.
              </p>
            </div>
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

        {/* Footer actions */}
        <div
          className="px-6 py-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Primary: I'm okay */}
          <Button
            onClick={handleImOkay}
            disabled={isConfirming}
            isLoading={isConfirming}
            data-testid="im-okay-button"
            className="w-full font-bold py-3"
            style={{
              background: 'linear-gradient(135deg, #10b981, #00d4ff)',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
            }}
          >
            I&apos;m Okay
          </Button>

          {/* Secondary: Complete check-in */}
          <Button
            onClick={onCheckInNow}
            disabled={isConfirming}
            data-testid="stage3-checkin-button"
            className="w-full font-semibold"
            style={{
              background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
              border: 'none',
              borderRadius: '12px',
            }}
          >
            Complete Check-in Instead
          </Button>

          {/* Dismiss note */}
          <p className="text-center text-xs" style={{ color: '#8892b0' }}>
            Closing this dialog does not stop the escalation timer.
          </p>
        </div>
      </div>
    </div>
  )
}
