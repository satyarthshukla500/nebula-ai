'use client'

import { useState, useEffect } from 'react'
import { DisclaimerModal } from '@/components/guardian/DisclaimerModal'
import { ActivationConfirmation } from '@/components/guardian/ActivationConfirmation'
import { GuardianDashboard } from '@/components/guardian/GuardianDashboard'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'

type PageView = 'loading' | 'disabled' | 'consent-done' | 'dashboard'

export default function GuardianModePage() {
  const [view, setView] = useState<PageView>('loading')
  const [showModal, setShowModal] = useState(false)

  // Fetch settings on mount to determine initial view
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/guardian/settings')
        if (res.ok) {
          const data = await res.json()
          const isEnabled = data?.data?.isEnabled ?? data?.isEnabled ?? false
          setView(isEnabled ? 'dashboard' : 'disabled')
        } else {
          // If 404 or no settings yet, treat as disabled
          setView('disabled')
        }
      } catch {
        setView('disabled')
      }
    }
    fetchSettings()
  }, [])

  const handleActivated = () => {
    setShowModal(false)
    setView('consent-done')
  }

  const handleDone = () => {
    setView('dashboard')
  }

  // Loading state
  if (view === 'loading') {
    return (
      <div className="p-6 max-w-2xl mx-auto flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#7c6bff', borderTopColor: 'transparent' }}
            aria-label="Loading"
          />
          <p className="text-sm" style={{ color: '#8892b0' }}>
            Loading Guardian Mode settings…
          </p>
        </div>
      </div>
    )
  }

  // Post-activation confirmation screen
  if (view === 'consent-done') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <ActivationConfirmation onDone={handleDone} />
      </div>
    )
  }

  // Dashboard view — shown when Guardian Mode is already enabled
  if (view === 'dashboard') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'white' }}>
            Guardian Mode
          </h2>
          <p className="mt-1" style={{ color: '#8892b0' }}>
            Active — monitoring your wellness check-ins
          </p>
        </div>

        <GuardianDashboard
          onDisabled={() => setView('disabled')}
        />
      </div>
    )
  }

  // Default: disabled view — consent flow entry point
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold" style={{ color: 'white' }}>
          Guardian Mode
        </h2>
        <p className="mt-1" style={{ color: '#8892b0' }}>
          A consent-based wellness check-in system for your safety
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h3 className="font-semibold" style={{ color: 'white' }}>
                What is Guardian Mode?
              </h3>
              <p className="text-sm" style={{ color: '#8892b0' }}>
                Voluntary wellness monitoring with emergency contact support
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="space-y-3 mb-6">
            {[
              { icon: '📅', text: 'Scheduled wellness check-ins at your preferred times' },
              { icon: '👤', text: 'Emergency contact notified only if you miss multiple check-ins' },
              { icon: '🔒', text: 'You control everything — disable at any time' },
              { icon: '⚠️', text: 'NOT a medical service or emergency service' },
            ].map(({ icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{icon}</span>
                <span className="text-sm" style={{ color: '#ccd6f6' }}>{text}</span>
              </li>
            ))}
          </ul>

          <div
            className="rounded-lg p-4 mb-6"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>
              ⚠️ Important: Guardian Mode is NOT a substitute for professional mental health care
              or emergency services. If you are in immediate danger, call 911 or your local
              emergency number.
            </p>
          </div>

          <Button
            onClick={() => setShowModal(true)}
            className="w-full"
            style={{
              background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
              border: 'none',
              borderRadius: '12px',
              fontWeight: '600',
              padding: '12px',
            }}
          >
            Enable Guardian Mode
          </Button>
        </CardBody>
      </Card>

      {showModal && (
        <DisclaimerModal
          onClose={() => setShowModal(false)}
          onActivated={handleActivated}
        />
      )}
    </div>
  )
}
