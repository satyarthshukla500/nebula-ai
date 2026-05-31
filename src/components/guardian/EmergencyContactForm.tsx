'use client'

import { useState, FormEvent } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface EmergencyContactFormProps {
  onBack: () => void
  onContactAdded: (contactId: string) => void
}

const RELATIONSHIPS = [
  'Parent',
  'Sibling',
  'Partner / Spouse',
  'Friend',
  'Therapist',
  'Other',
]

export function EmergencyContactForm({ onBack, onContactAdded }: EmergencyContactFormProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [relationship, setRelationship] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Contact name is required')
      return
    }
    if (!phone.trim() && !email.trim()) {
      setError('Please provide at least a phone number or email address')
      return
    }
    if (!relationship) {
      setError('Please select a relationship')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/guardian/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          relationship,
          notificationLevel: 'critical_only',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add contact')
        return
      }

      onContactAdded(data.data.contactId)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <p className="text-sm" style={{ color: '#8892b0' }}>
          Add a trusted person who will be notified only if you miss multiple check-ins and
          meet specific criteria. They must verify their contact details via a one-time code.
        </p>

        <Input
          label="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          required
          disabled={isLoading}
          data-testid="contact-name"
        />

        <Input
          label="Phone Number (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 000-0000"
          disabled={isLoading}
          data-testid="contact-phone"
        />

        <Input
          label="Email Address (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          disabled={isLoading}
          data-testid="contact-email"
        />

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: '#8892b0', fontSize: '13px' }}>
            Relationship
          </label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            required
            disabled={isLoading}
            data-testid="contact-relationship"
            className="w-full px-4 py-2 rounded-lg"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: relationship ? 'white' : '#8892b0',
              borderRadius: '10px',
              outline: 'none',
            }}
          >
            <option value="" disabled style={{ background: '#0f1225' }}>
              Select relationship
            </option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r} style={{ background: '#0f1225', color: 'white' }}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: 'rgba(124,107,255,0.08)',
            border: '1px solid rgba(124,107,255,0.2)',
          }}
        >
          <p className="text-xs" style={{ color: '#a78bfa' }}>
            🔒 Contact information is encrypted and only used to send notifications under
            the conditions you agreed to. They can opt out at any time.
          </p>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}
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
          type="submit"
          isLoading={isLoading}
          className="flex-1"
          style={{
            background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
            border: 'none',
            borderRadius: '10px',
            fontWeight: '600',
          }}
          data-testid="add-contact-submit"
        >
          Send Verification
        </Button>
      </div>
    </form>
  )
}
