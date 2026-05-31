/**
 * @jest-environment jsdom
 *
 * Stage3ConfirmationModal Component Tests
 *
 * Tests for task 5.6.4: Test escalation UI components render and respond correctly
 * Validates: Requirements 1.4
 *
 * Covers:
 *  1. Not rendered when isOpen=false
 *  2. Rendered when isOpen=true
 *  3. "I'm Okay" button calls POST /api/guardian/escalate with correct payload
 *  4. onImOkay callback called after successful API response
 *  5. Error shown when API fails
 *  6. "Complete Check-in Instead" button calls onCheckInNow
 *  7. Close button calls onClose
 */

import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mock UI primitives ────────────────────────────────────────────────────

jest.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    isLoading,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode
    isLoading?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled || isLoading} {...rest}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
}))

// ─── Import component after mocks ──────────────────────────────────────────

import { Stage3ConfirmationModal } from '../Stage3ConfirmationModal'

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockFetch(responses: Record<string, { ok: boolean; body: unknown }>) {
  global.fetch = jest.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const match = Object.keys(responses).find((key) => urlStr.includes(key))
    if (!match) {
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found' }),
      } as Response)
    }
    const { ok, body } = responses[match]
    return Promise.resolve({
      ok,
      json: () => Promise.resolve(body),
    } as Response)
  }) as jest.Mock
}

const defaultProps = {
  isOpen: true,
  onImOkay: jest.fn(),
  onCheckInNow: jest.fn(),
  onClose: jest.fn(),
}

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Stage3ConfirmationModal', () => {
  // 1. Not rendered when isOpen=false
  it('does not render when isOpen is false', () => {
    render(<Stage3ConfirmationModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stage3-confirmation-modal')).not.toBeInTheDocument()
  })

  // 2. Rendered when isOpen=true
  it('renders modal when isOpen is true', () => {
    render(<Stage3ConfirmationModal {...defaultProps} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('stage3-confirmation-modal')).toBeInTheDocument()
    expect(screen.getByText('Wellness Check Required')).toBeInTheDocument()
  })

  // 3. "I'm Okay" button calls POST /api/guardian/escalate with correct payload
  it('calls POST /api/guardian/escalate with correct payload when "I\'m Okay" is clicked', async () => {
    mockFetch({
      '/api/guardian/escalate': { ok: true, body: {} },
    })

    render(<Stage3ConfirmationModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('im-okay-button'))
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/guardian/escalate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current',
          stage: 3,
          reason: 'user_confirmed_okay',
        }),
      })
    )
  })

  // 4. onImOkay callback called after successful API response
  it('calls onImOkay after successful API response', async () => {
    const onImOkay = jest.fn()
    mockFetch({
      '/api/guardian/escalate': { ok: true, body: {} },
    })

    render(<Stage3ConfirmationModal {...defaultProps} onImOkay={onImOkay} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('im-okay-button'))
    })

    await waitFor(() => {
      expect(onImOkay).toHaveBeenCalledTimes(1)
    })
  })

  // 5. Error shown when API fails (non-ok response)
  it('shows error message when API returns a non-ok response', async () => {
    mockFetch({
      '/api/guardian/escalate': {
        ok: false,
        body: { error: 'Escalation failed' },
      },
    })

    render(<Stage3ConfirmationModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('im-okay-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Escalation failed')
    expect(defaultProps.onImOkay).not.toHaveBeenCalled()
  })

  it('shows network error message when fetch throws', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock

    render(<Stage3ConfirmationModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('im-okay-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please try again.')
    })
  })

  it('shows fallback error when API returns non-ok with no error field', async () => {
    mockFetch({
      '/api/guardian/escalate': { ok: false, body: {} },
    })

    render(<Stage3ConfirmationModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('im-okay-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to confirm. Please try again.')
    })
  })

  // 6. "Complete Check-in Instead" button calls onCheckInNow
  it('calls onCheckInNow when "Complete Check-in Instead" is clicked', () => {
    const onCheckInNow = jest.fn()
    render(<Stage3ConfirmationModal {...defaultProps} onCheckInNow={onCheckInNow} />)

    fireEvent.click(screen.getByTestId('stage3-checkin-button'))

    expect(onCheckInNow).toHaveBeenCalledTimes(1)
  })

  // 7. Close button calls onClose
  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn()
    render(<Stage3ConfirmationModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
