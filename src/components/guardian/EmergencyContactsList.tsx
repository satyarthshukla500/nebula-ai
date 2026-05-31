'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { EmergencyContactForm } from './EmergencyContactForm'
import { OTPVerificationInput } from './OTPVerificationInput'

interface EmergencyContact {
  id: string
  contact_name: string
  relationship: string
  is_verified: boolean
  contact_phone?: string
  contact_email?: string
}

type AddContactStep = 'form' | 'otp'

const MAX_CONTACTS = 3

export function EmergencyContactsList() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Add-contact flow
  const [showAddFlow, setShowAddFlow] = useState(false)
  const [addStep, setAddStep] = useState<AddContactStep>('form')
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)

  // Remove confirmation
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/guardian/contacts')
      if (!res.ok) throw new Error('Failed to load contacts')
      const data = await res.json()
      const list = data.data ?? data.contacts ?? []
      setContacts(Array.isArray(list) ? list : [])
    } catch {
      setError('Could not load emergency contacts.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const atLimit = contacts.length >= MAX_CONTACTS

  // ── Add flow handlers ──────────────────────────────────────────────────────

  function openAddFlow() {
    setAddStep('form')
    setPendingContactId(null)
    setShowAddFlow(true)
  }

  function closeAddFlow() {
    setShowAddFlow(false)
    setPendingContactId(null)
  }

  function handleContactAdded(contactId: string) {
    setPendingContactId(contactId)
    setAddStep('otp')
  }

  function handleVerified() {
    closeAddFlow()
    fetchContacts()
  }

  // ── Remove handlers ────────────────────────────────────────────────────────

  async function confirmRemove() {
    if (!removingId) return
    setIsRemoving(true)
    try {
      const res = await fetch(`/api/guardian/contacts/${removingId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove contact')
      setContacts((prev) => prev.filter((c) => c.id !== removingId))
    } catch {
      setError('Could not remove contact. Please try again.')
    } finally {
      setIsRemoving(false)
      setRemovingId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#0f1225',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
      data-testid="emergency-contacts-list"
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'white' }}>
            Emergency Contacts
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#8892b0' }}>
            {contacts.length} / {MAX_CONTACTS} contacts
          </p>
        </div>

        <Button
          onClick={openAddFlow}
          disabled={atLimit}
          data-testid="add-contact-button"
          style={
            atLimit
              ? {
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#8892b0',
                  borderRadius: '10px',
                  fontSize: '13px',
                  cursor: 'not-allowed',
                }
              : {
                  background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                  fontSize: '13px',
                }
          }
        >
          + Add Contact
        </Button>
      </div>

      {/* 3-contact limit warning */}
      {atLimit && (
        <div
          className="mx-6 mt-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.25)',
            color: '#fcd34d',
          }}
          data-testid="limit-warning"
        >
          You&apos;ve reached the maximum of {MAX_CONTACTS} emergency contacts. Remove one to add
          another.
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="mx-6 mt-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fca5a5',
          }}
          role="alert"
          data-testid="contacts-error"
        >
          {error}
        </div>
      )}

      {/* Contact list */}
      <div className="px-6 py-4 space-y-3">
        {isLoading ? (
          <>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl h-16 animate-pulse"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              />
            ))}
          </>
        ) : contacts.length === 0 ? (
          <div
            className="rounded-xl px-5 py-8 text-center"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.1)',
            }}
            data-testid="empty-state"
          >
            <p className="text-sm" style={{ color: '#8892b0' }}>
              No emergency contacts added yet.
            </p>
            <p className="text-xs mt-1" style={{ color: '#4a5568' }}>
              Add a trusted person who can be notified if you miss multiple check-ins.
            </p>
          </div>
        ) : (
          contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              onRemove={() => setRemovingId(contact.id)}
            />
          ))
        )}
      </div>

      {/* Add-contact modal */}
      {showAddFlow && (
        <AddContactModal
          step={addStep}
          pendingContactId={pendingContactId}
          onBack={addStep === 'otp' ? () => setAddStep('form') : closeAddFlow}
          onContactAdded={handleContactAdded}
          onVerified={handleVerified}
          onClose={closeAddFlow}
        />
      )}

      {/* Remove confirmation dialog */}
      {removingId && (
        <RemoveConfirmDialog
          contact={contacts.find((c) => c.id === removingId)!}
          isRemoving={isRemoving}
          onConfirm={confirmRemove}
          onCancel={() => setRemovingId(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  onRemove,
}: {
  contact: EmergencyContact
  onRemove: () => void
}) {
  return (
    <div
      className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
      data-testid={`contact-row-${contact.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{
            background: 'linear-gradient(135deg, rgba(124,107,255,0.3), rgba(0,212,255,0.3))',
            color: '#a78bfa',
          }}
          aria-hidden="true"
        >
          {contact.contact_name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'white' }}>
            {contact.contact_name}
          </p>
          <p className="text-xs truncate" style={{ color: '#8892b0' }}>
            {contact.relationship}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Verification badge */}
        <VerificationBadge isVerified={contact.is_verified} />

        {/* Remove button */}
        <button
          onClick={onRemove}
          aria-label={`Remove ${contact.contact_name}`}
          data-testid={`remove-contact-${contact.id}`}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

function VerificationBadge({ isVerified }: { isVerified: boolean }) {
  return isVerified ? (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: 'rgba(16,185,129,0.15)',
        border: '1px solid rgba(16,185,129,0.3)',
        color: '#6ee7b7',
      }}
      data-testid="badge-verified"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
        <path
          d="M1.5 4l1.5 1.5 3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Verified
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.25)',
        color: '#fcd34d',
      }}
      data-testid="badge-pending"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
        <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 2.5v2l1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Pending
    </span>
  )
}

function AddContactModal({
  step,
  pendingContactId,
  onBack,
  onContactAdded,
  onVerified,
  onClose,
}: {
  step: AddContactStep
  pendingContactId: string | null
  onBack: () => void
  onContactAdded: (id: string) => void
  onVerified: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      data-testid="add-contact-modal"
    >
      <div
        className="w-full max-w-md rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          maxHeight: '90vh',
        }}
      >
        {/* Modal header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <h4 className="text-base font-semibold" style={{ color: 'white' }}>
            {step === 'form' ? 'Add Emergency Contact' : 'Verify Contact'}
          </h4>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8892b0',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          {step === 'form' ? (
            <EmergencyContactForm onBack={onBack} onContactAdded={onContactAdded} />
          ) : pendingContactId ? (
            <OTPVerificationInput
              contactId={pendingContactId}
              onBack={onBack}
              onVerified={onVerified}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RemoveConfirmDialog({
  contact,
  isRemoving,
  onConfirm,
  onCancel,
}: {
  contact: EmergencyContact
  isRemoving: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      data-testid="remove-confirm-dialog"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: '#0f1225',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto"
          style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
          }}
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M8 4h4M3 6h14M5 6l1 10h8l1-10"
              stroke="#f87171"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h4 className="text-base font-semibold text-center mb-2" style={{ color: 'white' }}>
          Remove Contact?
        </h4>
        <p className="text-sm text-center mb-6" style={{ color: '#8892b0' }}>
          Are you sure you want to remove{' '}
          <span style={{ color: 'white', fontWeight: 600 }}>{contact.contact_name}</span> as an
          emergency contact? They will no longer be notified.
        </p>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="flex-1"
            style={{ color: '#8892b0' }}
            disabled={isRemoving}
            data-testid="cancel-remove"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            isLoading={isRemoving}
            className="flex-1"
            style={{
              background: 'rgba(239,68,68,0.8)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '10px',
              fontWeight: '600',
              color: 'white',
            }}
            data-testid="confirm-remove"
          >
            Remove
          </Button>
        </div>
      </div>
    </div>
  )
}
