'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { EmergencyContactForm } from './EmergencyContactForm'
import { OTPVerificationInput } from './OTPVerificationInput'
import { CheckInScheduleSelector } from './CheckInScheduleSelector'

// Disclaimer content from design doc section 7.1
const DISCLAIMER_SECTIONS = [
  {
    title: 'Not a Medical Service',
    content:
      'Guardian Mode is NOT a medical diagnosis system, NOT a therapy service, and NOT a replacement for professional mental health care. It does not provide clinical assessments, diagnoses, or treatment recommendations.',
    mustAcknowledge: true,
  },
  {
    title: 'Not an Emergency Service',
    content:
      'Guardian Mode does NOT contact emergency services (police, ambulance, fire). If you are in immediate danger, call 911 or your local emergency number immediately. This feature cannot replace emergency services.',
    mustAcknowledge: true,
  },
  {
    title: 'How It Works',
    content:
      'Guardian Mode sends you scheduled check-in reminders. If you miss multiple check-ins and meet certain criteria, your designated emergency contact may be notified. The system uses a gradual escalation process with multiple opportunities for you to respond.',
    mustAcknowledge: false,
  },
  {
    title: 'Your Control',
    content:
      'You can disable Guardian Mode at any time from your settings. You control who your emergency contacts are and what information they receive. You can also adjust your check-in schedule at any time.',
    mustAcknowledge: true,
  },
  {
    title: 'Limitations',
    content:
      'Guardian Mode cannot prevent crises and may not detect all situations requiring support. It is a supplementary tool only. The system relies on your participation and cannot guarantee outcomes. False positives and missed detections are possible.',
    mustAcknowledge: true,
  },
]

const CONSENT_ITEMS = [
  'I understand this is not a medical service',
  'I understand this is not an emergency service',
  'I understand I can disable this at any time',
  'I have read and understand the full terms',
  'I consent to my emergency contact being notified under the conditions described',
]

type Step = 'disclaimer' | 'contact' | 'verify' | 'schedule'

interface DisclaimerModalProps {
  onClose: () => void
  onActivated: () => void
}

export function DisclaimerModal({ onClose, onActivated }: DisclaimerModalProps) {
  const [step, setStep] = useState<Step>('disclaimer')
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [checkedItems, setCheckedItems] = useState<boolean[]>(
    new Array(CONSENT_ITEMS.length).fill(false)
  )
  const [contactId, setContactId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const allChecked = checkedItems.every(Boolean)
  const canProceed = hasScrolledToBottom && allChecked

  // Check if user has scrolled to the bottom of the disclaimer
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 20
    if (atBottom) setHasScrolledToBottom(true)
  }

  // Auto-detect if content fits without scrolling
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollHeight <= el.clientHeight) {
      setHasScrolledToBottom(true)
    }
  }, [])

  const toggleCheckbox = (index: number) => {
    setCheckedItems((prev) => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl flex flex-col"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.12)',
          maxHeight: '90vh',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <h2 id="disclaimer-title" className="text-lg font-semibold" style={{ color: 'white' }}>
              {step === 'disclaimer' && 'Enable Guardian Mode'}
              {step === 'contact' && 'Add Emergency Contact'}
              {step === 'verify' && 'Verify Contact'}
              {step === 'schedule' && 'Set Check-in Schedule'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors"
            style={{ color: '#8892b0' }}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 px-6 pt-4 flex-shrink-0">
          {(['disclaimer', 'contact', 'verify', 'schedule'] as Step[]).map((s, i) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full transition-all"
              style={{
                background:
                  step === s
                    ? 'linear-gradient(90deg, #7c6bff, #00d4ff)'
                    : i < (['disclaimer', 'contact', 'verify', 'schedule'] as Step[]).indexOf(step)
                    ? '#7c6bff'
                    : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {step === 'disclaimer' && (
            <>
              {/* Scrollable disclaimer */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
                style={{ minHeight: 0 }}
                data-testid="disclaimer-scroll"
              >
                {DISCLAIMER_SECTIONS.map((section) => (
                  <div
                    key={section.title}
                    className="rounded-lg p-4"
                    style={{
                      background: section.mustAcknowledge
                        ? 'rgba(239,68,68,0.08)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${
                        section.mustAcknowledge
                          ? 'rgba(239,68,68,0.2)'
                          : 'rgba(255,255,255,0.06)'
                      }`,
                    }}
                  >
                    <h4
                      className="font-semibold text-sm mb-2"
                      style={{
                        color: section.mustAcknowledge ? '#fca5a5' : '#ccd6f6',
                      }}
                    >
                      {section.mustAcknowledge && '⚠️ '}{section.title}
                    </h4>
                    <p className="text-sm leading-relaxed" style={{ color: '#8892b0' }}>
                      {section.content}
                    </p>
                  </div>
                ))}

                {!hasScrolledToBottom && (
                  <p
                    className="text-center text-xs py-2"
                    style={{ color: '#7c6bff' }}
                    data-testid="scroll-hint"
                  >
                    ↓ Scroll to read all terms
                  </p>
                )}
              </div>

              {/* Consent checkboxes */}
              <div
                className="px-6 py-4 space-y-3 flex-shrink-0"
                style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p className="text-xs font-medium mb-3" style={{ color: '#8892b0' }}>
                  Please acknowledge all of the following:
                </p>
                {CONSENT_ITEMS.map((item, i) => (
                  <label
                    key={item}
                    className="flex items-start gap-3 cursor-pointer group"
                    data-testid={`consent-checkbox-${i}`}
                  >
                    <div className="relative flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={checkedItems[i]}
                        onChange={() => toggleCheckbox(i)}
                        className="sr-only"
                        aria-label={item}
                      />
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center transition-all"
                        style={{
                          background: checkedItems[i]
                            ? 'linear-gradient(135deg, #7c6bff, #00d4ff)'
                            : 'rgba(255,255,255,0.05)',
                          border: checkedItems[i]
                            ? 'none'
                            : '1px solid rgba(255,255,255,0.2)',
                        }}
                      >
                        {checkedItems[i] && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm" style={{ color: checkedItems[i] ? '#ccd6f6' : '#8892b0' }}>
                      {item}
                    </span>
                  </label>
                ))}
              </div>

              {/* Footer */}
              <div
                className="px-6 py-4 flex gap-3 flex-shrink-0"
                style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Button variant="ghost" onClick={onClose} className="flex-1" style={{ color: '#8892b0' }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setStep('contact')}
                  disabled={!canProceed}
                  className="flex-1"
                  style={
                    canProceed
                      ? {
                          background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: '600',
                        }
                      : {}
                  }
                  data-testid="proceed-button"
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 'contact' && (
            <EmergencyContactForm
              onBack={() => setStep('disclaimer')}
              onContactAdded={(id) => {
                setContactId(id)
                setStep('verify')
              }}
            />
          )}

          {step === 'verify' && contactId && (
            <OTPVerificationInput
              contactId={contactId}
              onBack={() => setStep('contact')}
              onVerified={() => setStep('schedule')}
            />
          )}

          {step === 'schedule' && (
            <CheckInScheduleSelector
              onBack={() => setStep('verify')}
              onActivated={onActivated}
            />
          )}
        </div>
      </div>
    </div>
  )
}
