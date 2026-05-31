/**
 * @jest-environment jsdom
 *
 * CheckInModal Component Tests
 *
 * Tests for task 5.3.6: Test check-in completion and snooze flows
 * Validates: Requirements 1.2
 *
 * Covers:
 *  1. Modal not rendered when isOpen=false
 *  2. Modal rendered when isOpen=true
 *  3. Mood slider renders with default value of 5
 *  4. Mood slider value changes when interacted with
 *  5. Notes textarea is present and accepts input
 *  6. Submit button calls POST /api/guardian/checkin/complete with moodRating and notes
 *  7. Success state shown after successful submission with next check-in time
 *  8. onCheckInComplete callback called when Done button clicked
 *  9. Error message shown when submit API fails
 *  10. Snooze button calls POST /api/guardian/checkin/snooze
 *  11. onClose called after successful snooze
 *  12. Error shown when snooze API fails
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

import { CheckInModal } from '../CheckInModal'

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
  onClose: jest.fn(),
  onCheckInComplete: jest.fn(),
}

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('CheckInModal', () => {
  // 1. Modal not rendered when isOpen=false
  it('does not render modal content when isOpen is false', () => {
    render(<CheckInModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Wellness Check-in')).not.toBeInTheDocument()
  })

  // 2. Modal rendered when isOpen=true
  it('renders modal when isOpen is true', () => {
    render(<CheckInModal {...defaultProps} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Wellness Check-in')).toBeInTheDocument()
  })

  // 3. Mood slider renders with default value of 5
  it('renders mood slider with default value of 5', () => {
    render(<CheckInModal {...defaultProps} />)

    const slider = screen.getByTestId('mood-slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveValue('5')
  })

  // 4. Mood slider value changes when interacted with
  it('updates mood rating when slider value changes', () => {
    render(<CheckInModal {...defaultProps} />)

    const slider = screen.getByTestId('mood-slider')
    fireEvent.change(slider, { target: { value: '8' } })

    expect(slider).toHaveValue('8')
    // The numeric label should update too (appears in badge and tick-mark button)
    expect(screen.getAllByText('8').length).toBeGreaterThan(0)
  })

  // 5. Notes textarea is present and accepts input
  it('renders notes textarea and accepts input', () => {
    render(<CheckInModal {...defaultProps} />)

    const textarea = screen.getByTestId('notes-textarea')
    expect(textarea).toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'Feeling okay today' } })
    expect(textarea).toHaveValue('Feeling okay today')
  })

  // 6. Submit button calls POST /api/guardian/checkin/complete with moodRating and notes
  it('calls POST /api/guardian/checkin/complete with moodRating and notes on submit', async () => {
    mockFetch({
      '/api/guardian/checkin/complete': {
        ok: true,
        body: { data: { nextCheckInDue: '2024-01-15T10:00:00Z' } },
      },
    })

    render(<CheckInModal {...defaultProps} />)

    // Change mood to 7
    fireEvent.change(screen.getByTestId('mood-slider'), { target: { value: '7' } })

    // Add notes
    fireEvent.change(screen.getByTestId('notes-textarea'), {
      target: { value: 'Feeling good' },
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'))
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/guardian/checkin/complete',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moodRating: 7, notes: 'Feeling good' }),
      })
    )
  })

  // 6b. Notes omitted from body when empty
  it('omits notes from request body when notes field is empty', async () => {
    mockFetch({
      '/api/guardian/checkin/complete': {
        ok: true,
        body: { data: { nextCheckInDue: '2024-01-15T10:00:00Z' } },
      },
    })

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'))
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/guardian/checkin/complete',
      expect.objectContaining({
        body: JSON.stringify({ moodRating: 5 }),
      })
    )
  })

  // 7. Success state shown after successful submission with next check-in time
  it('shows success state with next check-in time after successful submission', async () => {
    mockFetch({
      '/api/guardian/checkin/complete': {
        ok: true,
        body: { data: { nextCheckInDue: '2024-01-15T10:00:00Z' } },
      },
    })

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'))
    })

    await waitFor(() => {
      expect(screen.getByText('Check-in Complete')).toBeInTheDocument()
    })

    expect(screen.getByText('Check-in Submitted')).toBeInTheDocument()
    expect(screen.getByText('Next Check-in')).toBeInTheDocument()
    expect(screen.getByTestId('done-button')).toBeInTheDocument()
  })

  // 8. onCheckInComplete callback called when Done button clicked
  it('calls onCheckInComplete with nextCheckInDue when Done button is clicked', async () => {
    const onCheckInComplete = jest.fn()
    const nextCheckInDue = '2024-01-15T10:00:00Z'

    mockFetch({
      '/api/guardian/checkin/complete': {
        ok: true,
        body: { data: { nextCheckInDue } },
      },
    })

    render(<CheckInModal {...defaultProps} onCheckInComplete={onCheckInComplete} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('done-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('done-button'))

    expect(onCheckInComplete).toHaveBeenCalledWith(nextCheckInDue)
  })

  // 9. Error message shown when submit API fails
  it('shows error message when submit API returns an error', async () => {
    mockFetch({
      '/api/guardian/checkin/complete': {
        ok: false,
        body: { error: 'Server error occurred' },
      },
    })

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred')
    // Still on the form, not success state
    expect(screen.queryByText('Check-in Submitted')).not.toBeInTheDocument()
  })

  // 9b. Error message shown on network failure during submit
  it('shows network error message when submit fetch throws', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please try again.')
    })
  })

  // 10. Snooze button calls POST /api/guardian/checkin/snooze
  it('calls POST /api/guardian/checkin/snooze when snooze button is clicked', async () => {
    mockFetch({
      '/api/guardian/checkin/snooze': { ok: true, body: {} },
    })

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('snooze-button'))
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/guardian/checkin/snooze',
      expect.objectContaining({ method: 'POST' })
    )
  })

  // 11. onClose called after successful snooze
  it('calls onClose after successful snooze', async () => {
    const onClose = jest.fn()

    mockFetch({
      '/api/guardian/checkin/snooze': { ok: true, body: {} },
    })

    render(<CheckInModal {...defaultProps} onClose={onClose} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('snooze-button'))
    })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  // 12. Error shown when snooze API fails
  it('shows error message when snooze API returns an error', async () => {
    mockFetch({
      '/api/guardian/checkin/snooze': {
        ok: false,
        body: { error: 'Snooze failed' },
      },
    })

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('snooze-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Snooze failed')
    })

    // onClose should NOT have been called
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  // 12b. Error shown on network failure during snooze
  it('shows network error message when snooze fetch throws', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock

    render(<CheckInModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('snooze-button'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please try again.')
    })
  })
})
