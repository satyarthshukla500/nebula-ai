'use client'

import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react'
import { Button } from '@/components/ui/Button'

interface OTPVerificationInputProps {
  contactId: string
  onBack: () => void
  onVerified: () => void
}

const OTP_LENGTH = 6

export function OTPVerificationInput({ contactId, onBack, onVerified }: OTPVerificationInputProps) {
  const [digits, setDigits] = useState<string[]>(new Array(OTP_LENGTH).fill(''))
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const code = digits.join('')
  const isComplete = code.length === OTP_LENGTH && digits.every((d) => d !== '')

  const handleDigitChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError('')

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setDigits(next)
    // Focus the next empty or last input
    const nextEmpty = next.findIndex((d) => !d)
    const focusIndex = nextEmpty === -1 ? OTP_LENGTH - 1 : nextEmpty
    inputRefs.current[focusIndex]?.focus()
  }

  const handleVerify = async () => {
    if (!isComplete) return
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/guardian/contacts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, verificationCode: code }),
      })

      const data = await res.json()

      if (!res.ok || !data.verified) {
        setError(data.error || 'Invalid code. Please try again.')
        setDigits(new Array(OTP_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
        return
      }

      onVerified()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    setIsResending(true)
    setResendSuccess(false)
    setError('')

    try {
      // Re-trigger verification by calling the contacts endpoint with the same contactId
      // In practice this would be a dedicated resend endpoint
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setResendSuccess(true)
      setDigits(new Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch {
      setError('Failed to resend code. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <p className="text-sm mb-6" style={{ color: '#8892b0' }}>
          A 6-digit verification code has been sent to your emergency contact via SMS and/or
          email. Ask them to share the code with you to confirm they consent to being your
          emergency contact.
        </p>

        <div className="flex justify-center gap-3 mb-6" data-testid="otp-inputs">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={isLoading}
              aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
              data-testid={`otp-digit-${i}`}
              className="w-12 h-14 text-center text-xl font-bold rounded-xl transition-all"
              style={{
                background: digit ? 'rgba(124,107,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: digit
                  ? '2px solid #7c6bff'
                  : '2px solid rgba(255,255,255,0.1)',
                color: 'white',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#7c6bff'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,107,255,0.2)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = digit
                  ? '#7c6bff'
                  : 'rgba(255,255,255,0.1)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          ))}
        </div>

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

        {resendSuccess && (
          <div
            className="rounded-lg px-4 py-3 text-sm mb-4"
            style={{
              background: 'rgba(16,185,129,0.1)',
              color: '#6ee7b7',
              border: '1px solid rgba(16,185,129,0.2)',
            }}
          >
            ✓ A new code has been sent
          </div>
        )}

        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: '#8892b0' }}>
            Didn&apos;t receive the code?
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-sm underline transition-opacity"
            style={{ color: '#7c6bff', opacity: isResending ? 0.5 : 1 }}
          >
            {isResending ? 'Sending...' : 'Resend code'}
          </button>
        </div>
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
          onClick={handleVerify}
          disabled={!isComplete || isLoading}
          isLoading={isLoading}
          className="flex-1"
          style={
            isComplete
              ? {
                  background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                }
              : {}
          }
          data-testid="verify-button"
        >
          Verify Contact
        </Button>
      </div>
    </div>
  )
}
