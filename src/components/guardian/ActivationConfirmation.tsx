'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface ActivationConfirmationProps {
  nextCheckInDue?: string | Date
  emergencyContactsCount?: number
  onDone: () => void
}

function formatNextCheckIn(value: string | Date | undefined): string {
  if (!value) return 'Scheduled'
  const date = typeof value === 'string' ? new Date(value) : value
  if (isNaN(date.getTime())) return 'Scheduled'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ActivationConfirmation({
  nextCheckInDue: propNextCheckIn,
  emergencyContactsCount: propContactsCount,
  onDone,
}: ActivationConfirmationProps) {
  const [nextCheckIn, setNextCheckIn] = useState<string | Date | undefined>(propNextCheckIn)
  const [contactsCount, setContactsCount] = useState<number>(propContactsCount ?? 0)
  const [isLoading, setIsLoading] = useState(!propNextCheckIn && propContactsCount === undefined)

  useEffect(() => {
    if (propNextCheckIn !== undefined && propContactsCount !== undefined) return

    async function fetchData() {
      try {
        const [statusRes, contactsRes] = await Promise.all([
          fetch('/api/guardian/checkin/status'),
          fetch('/api/guardian/contacts'),
        ])

        if (statusRes.ok) {
          const statusData = await statusRes.json()
          if (statusData.data?.nextCheckInDue) {
            setNextCheckIn(statusData.data.nextCheckInDue)
          }
        }

        if (contactsRes.ok) {
          const contactsData = await contactsRes.json()
          const contacts = contactsData.data ?? contactsData.contacts ?? []
          setContactsCount(Array.isArray(contacts) ? contacts.length : 0)
        }
      } catch {
        // Non-critical — display with defaults
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [propNextCheckIn, propContactsCount])

  return (
    <div
      className="rounded-2xl p-8 flex flex-col items-center text-center"
      style={{
        background: '#0f1225',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}
      data-testid="activation-confirmation"
    >
      {/* Success icon */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(0,212,255,0.2))',
          border: '2px solid rgba(16,185,129,0.4)',
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M10 20l7 7 13-13"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Heading */}
      <h2 className="text-2xl font-bold mb-2" style={{ color: 'white' }}>
        Guardian Mode Activated
      </h2>
      <p className="text-sm mb-8" style={{ color: '#8892b0', maxWidth: '360px' }}>
        You&apos;re all set. Guardian Mode is now active and monitoring your wellness check-ins.
      </p>

      {/* Summary cards */}
      {isLoading ? (
        <div className="w-full space-y-3 mb-8">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl h-16 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
          ))}
        </div>
      ) : (
        <div className="w-full space-y-3 mb-8">
          {/* Next check-in */}
          <div
            className="rounded-xl px-5 py-4 flex items-center gap-4 text-left"
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
                {formatNextCheckIn(nextCheckIn)}
              </p>
            </div>
          </div>

          {/* Emergency contacts */}
          <div
            className="rounded-xl px-5 py-4 flex items-center gap-4 text-left"
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
            }}
          >
            <span className="text-2xl flex-shrink-0">👤</span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: '#10b981' }}>
                Emergency Contacts
              </p>
              <p className="text-sm font-semibold" style={{ color: 'white' }}>
                {contactsCount === 0
                  ? 'No contacts added yet'
                  : `${contactsCount} contact${contactsCount !== 1 ? 's' : ''} set up`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Deactivation instructions */}
      <div
        className="w-full rounded-xl px-5 py-4 mb-8 text-left"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#8892b0' }}>
          How to Deactivate
        </p>
        <p className="text-sm leading-relaxed" style={{ color: '#ccd6f6' }}>
          You can disable Guardian Mode at any time. Go to{' '}
          <span style={{ color: '#a78bfa' }}>Settings → Guardian Mode</span> and click
          &ldquo;Disable Guardian Mode&rdquo;. All scheduled check-ins will be cancelled immediately.
        </p>
      </div>

      {/* Done button */}
      <Button
        onClick={onDone}
        className="w-full"
        style={{
          background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
          border: 'none',
          borderRadius: '12px',
          fontWeight: '600',
          padding: '12px',
        }}
        data-testid="done-button"
      >
        Go to Guardian Dashboard
      </Button>
    </div>
  )
}
