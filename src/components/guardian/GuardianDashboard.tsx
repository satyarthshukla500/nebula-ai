'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CheckInStatus {
  isEnabled: boolean
  nextCheckInDue: string | null
  lastCheckIn: string | null
  currentRiskScore: number
  missedCheckIns: number
}

interface GuardianDashboardProps {
  onDisabled: () => void
  onManageContacts?: () => void
}

// ── Risk level helpers ─────────────────────────────────────────────────────────

type RiskLevel = 'Low' | 'Moderate' | 'Elevated' | 'High'

function getRiskLevel(score: number): RiskLevel {
  if (score <= 20) return 'Low'
  if (score <= 40) return 'Moderate'
  if (score <= 60) return 'Elevated'
  return 'High'
}

const RISK_COLORS: Record<RiskLevel, { text: string; bg: string; border: string; bar: string }> = {
  Low: {
    text: '#6ee7b7',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    bar: '#10b981',
  },
  Moderate: {
    text: '#fcd34d',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
    bar: '#f59e0b',
  },
  Elevated: {
    text: '#fdba74',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
    bar: '#f97316',
  },
  High: {
    text: '#fca5a5',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
    bar: '#ef4444',
  },
}

// ── Date formatting ────────────────────────────────────────────────────────────

function formatDateTime(value: string | null): string {
  if (!value) return 'None'
  const date = new Date(value)
  if (isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GuardianDashboard({ onDisabled, onManageContacts }: GuardianDashboardProps) {
  const [status, setStatus] = useState<CheckInStatus | null>(null)
  const [contactsCount, setContactsCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Disable flow
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)
  const [disableError, setDisableError] = useState('')

  const fetchData = useCallback(async () => {
    setError('')
    try {
      const [statusRes, contactsRes] = await Promise.all([
        fetch('/api/guardian/checkin/status'),
        fetch('/api/guardian/contacts'),
      ])

      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setStatus(statusData.data ?? null)
      } else {
        setError('Could not load Guardian Mode status.')
      }

      if (contactsRes.ok) {
        const contactsData = await contactsRes.json()
        const contacts = contactsData.data ?? contactsData.contacts ?? []
        setContactsCount(Array.isArray(contacts) ? contacts.length : 0)
      }
    } catch {
      setError('Network error. Please refresh.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDisable = async () => {
    setDisableError('')
    setIsDisabling(true)
    try {
      const res = await fetch('/api/guardian/settings/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setShowDisableConfirm(false)
        onDisabled()
      } else {
        const data = await res.json()
        setDisableError(data.error || 'Failed to disable Guardian Mode.')
      }
    } catch {
      setDisableError('Network error. Please try again.')
    } finally {
      setIsDisabling(false)
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="guardian-dashboard-loading">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl h-24 animate-pulse"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          />
        ))}
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div
        className="rounded-2xl px-6 py-5 text-sm"
        style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#fca5a5',
        }}
        role="alert"
        data-testid="guardian-dashboard-error"
      >
        {error}
      </div>
    )
  }

  const riskScore = status?.currentRiskScore ?? 0
  const riskLevel = getRiskLevel(riskScore)
  const riskColors = RISK_COLORS[riskLevel]

  return (
    <div className="space-y-4" data-testid="guardian-dashboard">
      {/* Active status badge */}
      <div
        className="flex items-center gap-3 rounded-xl px-5 py-4"
        style={{
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.3)',
        }}
      >
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold" style={{ color: '#6ee7b7' }}>
          Guardian Mode is active
        </p>
      </div>

      {/* Risk score card */}
      <div
        className="rounded-2xl px-6 py-5"
        style={{
          background: '#0f1225',
          border: `1px solid ${riskColors.border}`,
        }}
        data-testid="risk-score-card"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#8892b0' }}>
            Current Risk Score
          </p>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              background: riskColors.bg,
              border: `1px solid ${riskColors.border}`,
              color: riskColors.text,
            }}
            data-testid="risk-level-label"
          >
            {riskLevel}
          </span>
        </div>

        <div className="flex items-end gap-3 mb-3">
          <span className="text-4xl font-bold" style={{ color: 'white' }} data-testid="risk-score-value">
            {riskScore}
          </span>
          <span className="text-sm mb-1" style={{ color: '#8892b0' }}>
            / 100
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full rounded-full h-2"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          role="progressbar"
          aria-valuenow={riskScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Risk score: ${riskScore} out of 100 — ${riskLevel}`}
        >
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${riskScore}%`,
              background: riskColors.bar,
            }}
          />
        </div>

        <p className="text-xs mt-2" style={{ color: '#8892b0' }}>
          Risk levels: 0–20 Low · 21–40 Moderate · 41–60 Elevated · 61+ High
        </p>
      </div>

      {/* Check-in times card */}
      <div
        className="rounded-2xl px-6 py-5"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        data-testid="checkin-times-card"
      >
        <p className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: '#8892b0' }}>
          Check-in Schedule
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(124,107,255,0.15)', border: '1px solid rgba(124,107,255,0.25)' }}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="11" rx="2" stroke="#7c6bff" strokeWidth="1.5" />
                <path d="M5 1v2M11 1v2M2 7h12" stroke="#7c6bff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-xs" style={{ color: '#8892b0' }}>Next Check-in</p>
              <p className="text-sm font-semibold" style={{ color: 'white' }} data-testid="next-checkin-time">
                {formatDateTime(status?.nextCheckInDue ?? null)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="#00d4ff" strokeWidth="1.5" />
                <path d="M8 5v3.5l2 2" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-xs" style={{ color: '#8892b0' }}>Last Check-in</p>
              <p className="text-sm font-semibold" style={{ color: 'white' }} data-testid="last-checkin-time">
                {formatDateTime(status?.lastCheckIn ?? null)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency contacts card */}
      <div
        className="rounded-2xl px-6 py-5 flex items-center justify-between gap-4"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        data-testid="contacts-card"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="6" cy="5" r="3" stroke="#10b981" strokeWidth="1.5" />
              <path d="M1 14c0-2.761 2.239-5 5-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 10v4M9 12h4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-xs" style={{ color: '#8892b0' }}>Emergency Contacts</p>
            <p className="text-sm font-semibold" style={{ color: 'white' }} data-testid="contacts-count">
              {contactsCount === null
                ? '—'
                : contactsCount === 0
                ? 'None added'
                : `${contactsCount} contact${contactsCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <button
          onClick={onManageContacts}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          style={{
            background: 'rgba(124,107,255,0.12)',
            border: '1px solid rgba(124,107,255,0.25)',
            color: '#a78bfa',
          }}
          data-testid="manage-contacts-link"
          aria-label="Manage emergency contacts"
        >
          Manage
        </button>
      </div>

      {/* Disable button */}
      <Button
        onClick={() => setShowDisableConfirm(true)}
        className="w-full"
        style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '12px',
          fontWeight: '600',
          padding: '12px',
          color: '#fca5a5',
        }}
        data-testid="disable-guardian-button"
      >
        Disable Guardian Mode
      </Button>

      {/* Disable confirmation dialog */}
      {showDisableConfirm && (
        <DisableConfirmDialog
          isDisabling={isDisabling}
          error={disableError}
          onConfirm={handleDisable}
          onCancel={() => {
            setShowDisableConfirm(false)
            setDisableError('')
          }}
        />
      )}
    </div>
  )
}

// ── Disable confirmation dialog ────────────────────────────────────────────────

function DisableConfirmDialog({
  isDisabling,
  error,
  onConfirm,
  onCancel,
}: {
  isDisabling: boolean
  error: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      data-testid="disable-confirm-dialog"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto"
          style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
          }}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 3C7.134 3 4 6.134 4 10c0 2.21.895 4.21 2.343 5.657L11 11l4.657 4.657A7.965 7.965 0 0019 10c0-4.418-3.582-8-8-8z"
              stroke="#f87171"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11 11l-4.657 4.657A7.965 7.965 0 0011 19a7.965 7.965 0 004.657-3.343L11 11z"
              stroke="#f87171"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h4 className="text-base font-semibold text-center mb-2" style={{ color: 'white' }}>
          Disable Guardian Mode?
        </h4>
        <p className="text-sm text-center mb-5" style={{ color: '#8892b0' }}>
          All scheduled check-ins will be cancelled immediately. Your emergency contacts will no
          longer be notified if you miss check-ins.
        </p>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm mb-4"
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

        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="flex-1"
            style={{ color: '#8892b0' }}
            disabled={isDisabling}
            data-testid="cancel-disable"
          >
            Keep Active
          </Button>
          <Button
            onClick={onConfirm}
            isLoading={isDisabling}
            className="flex-1"
            style={{
              background: 'rgba(239,68,68,0.8)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '10px',
              fontWeight: '600',
              color: 'white',
            }}
            data-testid="confirm-disable"
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  )
}
