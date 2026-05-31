/**
 * @jest-environment jsdom
 *
 * GuardianDashboard Component Tests
 *
 * Tests for task 5.4.6: Test dashboard displays correct data from API
 * Validates: Requirements 1.6
 *
 * Covers:
 *  1. Loading skeleton shown while fetching data
 *  2. Risk score displayed correctly (numeric value)
 *  3. Risk level label shown correctly for each level (Low/Moderate/Elevated/High)
 *  4. Next check-in time displayed
 *  5. Last check-in time displayed
 *  6. Emergency contacts count displayed
 *  7. "Disable Guardian Mode" button opens confirmation dialog
 *  8. Confirming disable calls POST /api/guardian/settings/disable and calls onDisabled
 *  9. Cancelling disable closes dialog without calling onDisabled
 *  10. Error shown when disable API fails
 *  11. Error state shown when status API fails
 */

import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mock Button component ─────────────────────────────────────────────────

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

import { GuardianDashboard } from '../GuardianDashboard'

// ─── Test data ─────────────────────────────────────────────────────────────

const MOCK_STATUS = {
  isEnabled: true,
  nextCheckInDue: '2024-06-15T10:00:00.000Z',
  lastCheckIn: '2024-06-14T10:00:00.000Z',
  currentRiskScore: 15,
  missedCheckIns: 0,
}

const MOCK_CONTACTS = [
  { id: 'c1', contact_name: 'Alice', relationship: 'Sister', is_verified: true },
  { id: 'c2', contact_name: 'Bob', relationship: 'Friend', is_verified: false },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockFetchSuccess(
  status = MOCK_STATUS,
  contacts = MOCK_CONTACTS
) {
  global.fetch = jest.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    if (urlStr.includes('/api/guardian/checkin/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: status }),
      } as Response)
    }
    if (urlStr.includes('/api/guardian/contacts')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: contacts }),
      } as Response)
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  }) as jest.Mock
}

afterEach(() => {
  jest.restoreAllMocks()
})

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('GuardianDashboard', () => {
  // 1. Loading skeleton
  it('shows loading skeleton while fetching data', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    expect(screen.getByTestId('guardian-dashboard-loading')).toBeInTheDocument()
    const skeletons = screen
      .getByTestId('guardian-dashboard-loading')
      .querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // 2. Risk score displayed correctly
  it('displays the numeric risk score from the API', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, currentRiskScore: 35 })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('risk-score-value')).toBeInTheDocument()
    })

    expect(screen.getByTestId('risk-score-value')).toHaveTextContent('35')
  })

  // 3a. Risk level label — Low (0–20)
  it('shows "Low" risk level label for score ≤ 20', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, currentRiskScore: 10 })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('risk-level-label')).toHaveTextContent('Low')
    })
  })

  // 3b. Risk level label — Moderate (21–40)
  it('shows "Moderate" risk level label for score 21–40', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, currentRiskScore: 30 })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('risk-level-label')).toHaveTextContent('Moderate')
    })
  })

  // 3c. Risk level label — Elevated (41–60)
  it('shows "Elevated" risk level label for score 41–60', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, currentRiskScore: 55 })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('risk-level-label')).toHaveTextContent('Elevated')
    })
  })

  // 3d. Risk level label — High (61+)
  it('shows "High" risk level label for score > 60', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, currentRiskScore: 75 })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('risk-level-label')).toHaveTextContent('High')
    })
  })

  // 4. Next check-in time displayed
  it('displays the next check-in time', async () => {
    mockFetchSuccess()

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('next-checkin-time')).toBeInTheDocument()
    })

    // Should not show "None" since we provided a date
    expect(screen.getByTestId('next-checkin-time')).not.toHaveTextContent('None')
  })

  // 4b. Next check-in shows "None" when null
  it('displays "None" for next check-in when not set', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, nextCheckInDue: null })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('next-checkin-time')).toHaveTextContent('None')
    })
  })

  // 5. Last check-in time displayed
  it('displays the last check-in time', async () => {
    mockFetchSuccess()

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('last-checkin-time')).toBeInTheDocument()
    })

    expect(screen.getByTestId('last-checkin-time')).not.toHaveTextContent('None')
  })

  // 5b. Last check-in shows "None" when null
  it('displays "None" for last check-in when not set', async () => {
    mockFetchSuccess({ ...MOCK_STATUS, lastCheckIn: null })

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('last-checkin-time')).toHaveTextContent('None')
    })
  })

  // 6. Emergency contacts count displayed
  it('displays the correct emergency contacts count', async () => {
    mockFetchSuccess(MOCK_STATUS, MOCK_CONTACTS) // 2 contacts

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('contacts-count')).toHaveTextContent('2 contacts')
    })
  })

  it('displays "None added" when there are no emergency contacts', async () => {
    mockFetchSuccess(MOCK_STATUS, [])

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('contacts-count')).toHaveTextContent('None added')
    })
  })

  it('displays singular "contact" for exactly 1 contact', async () => {
    mockFetchSuccess(MOCK_STATUS, [MOCK_CONTACTS[0]])

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('contacts-count')).toHaveTextContent('1 contact')
    })
  })

  // 7. "Disable Guardian Mode" button opens confirmation dialog
  it('opens confirmation dialog when "Disable Guardian Mode" is clicked', async () => {
    mockFetchSuccess()

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('disable-guardian-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('disable-guardian-button'))

    expect(screen.getByTestId('disable-confirm-dialog')).toBeInTheDocument()
  })

  // 8. Confirming disable calls POST and onDisabled
  it('calls POST /api/guardian/settings/disable and onDisabled when confirmed', async () => {
    const onDisabled = jest.fn()
    const disableMock = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    )

    global.fetch = jest.fn((url: string | URL | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/guardian/settings/disable')) {
        return disableMock(url, options)
      }
      if (urlStr.includes('/api/guardian/checkin/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: MOCK_STATUS }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: MOCK_CONTACTS }),
      } as Response)
    }) as jest.Mock

    render(<GuardianDashboard onDisabled={onDisabled} />)

    await waitFor(() => {
      expect(screen.getByTestId('disable-guardian-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('disable-guardian-button'))
    expect(screen.getByTestId('disable-confirm-dialog')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-disable'))
    })

    expect(disableMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/guardian/settings/disable'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(onDisabled).toHaveBeenCalledTimes(1)
  })

  // 9. Cancelling disable closes dialog without calling onDisabled
  it('closes dialog without calling onDisabled when cancel is clicked', async () => {
    const onDisabled = jest.fn()
    mockFetchSuccess()

    render(<GuardianDashboard onDisabled={onDisabled} />)

    await waitFor(() => {
      expect(screen.getByTestId('disable-guardian-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('disable-guardian-button'))
    expect(screen.getByTestId('disable-confirm-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cancel-disable'))

    expect(screen.queryByTestId('disable-confirm-dialog')).not.toBeInTheDocument()
    expect(onDisabled).not.toHaveBeenCalled()
  })

  // 10. Error shown when disable API fails
  it('shows error message when disable API call fails', async () => {
    global.fetch = jest.fn((url: string | URL | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/guardian/settings/disable')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Failed to disable Guardian Mode.' }),
        } as Response)
      }
      if (urlStr.includes('/api/guardian/checkin/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: MOCK_STATUS }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: MOCK_CONTACTS }),
      } as Response)
    }) as jest.Mock

    const onDisabled = jest.fn()
    render(<GuardianDashboard onDisabled={onDisabled} />)

    await waitFor(() => {
      expect(screen.getByTestId('disable-guardian-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('disable-guardian-button'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-disable'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to disable Guardian Mode.')
    expect(onDisabled).not.toHaveBeenCalled()
    // Dialog stays open
    expect(screen.getByTestId('disable-confirm-dialog')).toBeInTheDocument()
  })

  // 11. Error state shown when status API fails
  it('shows error state when status API fails', async () => {
    global.fetch = jest.fn((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/guardian/checkin/status')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Server error' }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: MOCK_CONTACTS }),
      } as Response)
    }) as jest.Mock

    render(<GuardianDashboard onDisabled={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('guardian-dashboard-error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('guardian-dashboard-error')).toHaveTextContent(
      /Could not load Guardian Mode status/i
    )
  })
})
