/**
 * @jest-environment jsdom
 *
 * EmergencyContactsList Component Tests
 *
 * Tests for task 5.2.6: Test contact management flows
 * Validates: Requirements 1.3
 *
 * Covers:
 *  1. Loading state shown while fetching contacts
 *  2. Empty state shown when no contacts
 *  3. Contacts displayed with name, relationship, and verification badge
 *  4. Verified badge shown for verified contacts
 *  5. Pending badge shown for unverified contacts
 *  6. "Add Contact" button opens the add modal
 *  7. Contact removal: clicking remove button shows confirmation dialog
 *  8. Confirming removal calls DELETE API and removes contact from list
 *  9. Cancelling removal closes dialog without removing
 *  10. 3-contact limit: "Add Contact" button disabled and warning shown when at capacity
 */

import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mock child components ─────────────────────────────────────────────────

jest.mock('@/components/guardian/EmergencyContactForm', () => ({
  EmergencyContactForm: ({
    onContactAdded,
    onBack,
  }: {
    onContactAdded: (id: string) => void
    onBack: () => void
  }) => (
    <div data-testid="emergency-contact-form">
      <button onClick={() => onContactAdded('new-contact-id')} data-testid="submit-contact-form">
        Submit
      </button>
      <button onClick={onBack} data-testid="back-from-form">
        Back
      </button>
    </div>
  ),
}))

jest.mock('@/components/guardian/OTPVerificationInput', () => ({
  OTPVerificationInput: ({
    onVerified,
    onBack,
  }: {
    contactId: string
    onVerified: () => void
    onBack: () => void
  }) => (
    <div data-testid="otp-verification-input">
      <button onClick={onVerified} data-testid="verify-otp">
        Verify
      </button>
      <button onClick={onBack} data-testid="back-from-otp">
        Back
      </button>
    </div>
  ),
}))

jest.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    isLoading,
    type,
    variant,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode
    isLoading?: boolean
    variant?: string
  }) => (
    <button onClick={onClick} disabled={disabled || isLoading} type={type} {...rest}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
}))

// ─── Import component after mocks ──────────────────────────────────────────

import { EmergencyContactsList } from '../EmergencyContactsList'

// ─── Test data ─────────────────────────────────────────────────────────────

const MOCK_CONTACTS = [
  {
    id: 'contact-1',
    contact_name: 'Alice Smith',
    relationship: 'Sister',
    is_verified: true,
  },
  {
    id: 'contact-2',
    contact_name: 'Bob Jones',
    relationship: 'Friend',
    is_verified: false,
  },
]

const THREE_CONTACTS = [
  ...MOCK_CONTACTS,
  {
    id: 'contact-3',
    contact_name: 'Carol White',
    relationship: 'Partner',
    is_verified: true,
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockFetchContacts(contacts: typeof MOCK_CONTACTS, ok = true) {
  global.fetch = jest.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    if (urlStr.includes('/api/guardian/contacts') && !urlStr.match(/contacts\/[^/]+$/)) {
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { data: contacts } : { error: 'Failed' }),
      } as Response)
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  }) as jest.Mock
}

afterEach(() => {
  jest.restoreAllMocks()
})

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EmergencyContactsList', () => {
  // 1. Loading state
  it('shows loading skeleton while fetching contacts', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock

    render(<EmergencyContactsList />)

    // Skeleton placeholders are rendered (animate-pulse divs)
    const container = screen.getByTestId('emergency-contacts-list')
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // 2. Empty state
  it('shows empty state when no contacts exist', async () => {
    mockFetchContacts([])

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })

    expect(screen.getByText(/No emergency contacts added yet/i)).toBeInTheDocument()
  })

  // 3. Contacts displayed with name, relationship, and badge
  it('displays contacts with name and relationship', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    expect(screen.getByText('Sister')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.getByText('Friend')).toBeInTheDocument()
  })

  // 4. Verified badge for verified contacts
  it('shows verified badge for verified contacts', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    const verifiedBadges = screen.getAllByTestId('badge-verified')
    expect(verifiedBadges.length).toBe(1)
    expect(verifiedBadges[0]).toHaveTextContent('Verified')
  })

  // 5. Pending badge for unverified contacts
  it('shows pending badge for unverified contacts', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    })

    const pendingBadges = screen.getAllByTestId('badge-pending')
    expect(pendingBadges.length).toBe(1)
    expect(pendingBadges[0]).toHaveTextContent('Pending')
  })

  // 6. "Add Contact" button opens the add modal
  it('opens add contact modal when "Add Contact" button is clicked', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('add-contact-button'))

    expect(screen.getByTestId('add-contact-modal')).toBeInTheDocument()
    expect(screen.getByTestId('emergency-contact-form')).toBeInTheDocument()
  })

  // 7. Clicking remove button shows confirmation dialog
  it('shows remove confirmation dialog when remove button is clicked', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('remove-contact-contact-1'))

    expect(screen.getByTestId('remove-confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to remove/i)).toBeInTheDocument()
    // Alice Smith appears in both the contact row and the dialog
    expect(screen.getAllByText('Alice Smith').length).toBeGreaterThanOrEqual(1)
  })

  // 8. Confirming removal calls DELETE API and removes contact from list
  it('calls DELETE API and removes contact when removal is confirmed', async () => {
    const deleteMock = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    )

    global.fetch = jest.fn((url: string | URL | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (options?.method === 'DELETE') {
        return deleteMock(url, options)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: MOCK_CONTACTS }),
      } as Response)
    }) as jest.Mock

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    // Open confirmation dialog
    fireEvent.click(screen.getByTestId('remove-contact-contact-1'))
    expect(screen.getByTestId('remove-confirm-dialog')).toBeInTheDocument()

    // Confirm removal
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-remove'))
    })

    // DELETE was called with the correct URL
    expect(deleteMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/guardian/contacts/contact-1'),
      expect.objectContaining({ method: 'DELETE' })
    )

    // Contact removed from list
    await waitFor(() => {
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument()
    })

    // Dialog closed
    expect(screen.queryByTestId('remove-confirm-dialog')).not.toBeInTheDocument()
  })

  // 9. Cancelling removal closes dialog without removing
  it('closes confirmation dialog without removing when cancel is clicked', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('remove-contact-contact-1'))
    expect(screen.getByTestId('remove-confirm-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cancel-remove'))

    expect(screen.queryByTestId('remove-confirm-dialog')).not.toBeInTheDocument()
    // Contact still in list
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  // 10. 3-contact limit: button disabled and warning shown
  it('disables "Add Contact" button and shows warning when at 3-contact limit', async () => {
    mockFetchContacts(THREE_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByText('Carol White')).toBeInTheDocument()
    })

    const addButton = screen.getByTestId('add-contact-button')
    expect(addButton).toBeDisabled()

    expect(screen.getByTestId('limit-warning')).toBeInTheDocument()
    expect(screen.getByTestId('limit-warning')).toHaveTextContent(
      /maximum of 3 emergency contacts/i
    )
  })

  // Bonus: OTP step shown after contact form submission
  it('shows OTP verification step after contact form is submitted', async () => {
    mockFetchContacts(MOCK_CONTACTS)

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('add-contact-button'))
    expect(screen.getByTestId('emergency-contact-form')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('submit-contact-form'))

    expect(screen.getByTestId('otp-verification-input')).toBeInTheDocument()
    expect(screen.queryByTestId('emergency-contact-form')).not.toBeInTheDocument()
  })

  // Bonus: Modal closes and contacts refresh after OTP verification
  it('closes modal and refreshes contacts after OTP verification', async () => {
    const fetchMock = jest.fn()
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: MOCK_CONTACTS }),
    } as Response)
    global.fetch = fetchMock

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('add-contact-button'))
    fireEvent.click(screen.getByTestId('submit-contact-form'))
    expect(screen.getByTestId('otp-verification-input')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('verify-otp'))
    })

    expect(screen.queryByTestId('add-contact-modal')).not.toBeInTheDocument()
    // fetch was called again to refresh contacts
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // Error state when fetch fails
  it('shows error message when contacts fetch fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Server error' }) } as Response)
    ) as jest.Mock

    render(<EmergencyContactsList />)

    await waitFor(() => {
      expect(screen.getByTestId('contacts-error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('contacts-error')).toHaveTextContent(
      /Could not load emergency contacts/i
    )
  })
})
