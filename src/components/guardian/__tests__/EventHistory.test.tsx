/**
 * @jest-environment jsdom
 *
 * EventHistory Component Tests
 *
 * Tests for task 5.5.6: Test event history display and filtering
 * Validates: Requirements 1.6
 *
 * Covers:
 *  1. Loading skeleton shown while fetching
 *  2. Empty state shown when no events
 *  3. Events displayed with type label and timestamp
 *  4. Risk score badge shown when risk_score_at_event is present
 *  5. Filter dropdown opens when filter button is clicked
 *  6. Selecting a filter type updates the API call with type param
 *  7. "Load more" button shown when there are more events
 *  8. Clicking "Load more" fetches next page and appends events
 *  9. Export button calls GET /api/guardian/events/export
 *  10. Error state shown when API fails
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
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode
    isLoading?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled || isLoading} type={type} {...rest}>
      {isLoading ? 'Loading…' : children}
    </button>
  ),
}))

// ─── Import component after mocks ──────────────────────────────────────────

import { EventHistory } from '../EventHistory'

// ─── Test data ─────────────────────────────────────────────────────────────

const MOCK_EVENT_1 = {
  id: 'event-1',
  event_type: 'check_in_completed',
  event_timestamp: '2024-01-15T10:00:00.000Z',
  risk_score_at_event: 25,
  escalation_stage: null,
  user_response: null,
  metadata: {},
}

const MOCK_EVENT_2 = {
  id: 'event-2',
  event_type: 'check_in_missed',
  event_timestamp: '2024-01-14T10:00:00.000Z',
  risk_score_at_event: null,
  escalation_stage: null,
  user_response: null,
  metadata: {},
}

const MOCK_EVENTS = [MOCK_EVENT_1, MOCK_EVENT_2]

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeEventsResponse(events: typeof MOCK_EVENTS, total?: number) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          events,
          total: total ?? events.length,
          page: 1,
          limit: 20,
        },
      }),
  } as Response
}

function mockFetchEvents(events: typeof MOCK_EVENTS, total?: number) {
  global.fetch = jest.fn(() =>
    Promise.resolve(makeEventsResponse(events, total))
  ) as jest.Mock
}

afterEach(() => {
  jest.restoreAllMocks()
})

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EventHistory', () => {
  // 1. Loading skeleton
  it('shows loading skeleton while fetching events', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock

    render(<EventHistory />)

    expect(screen.getByTestId('event-history-loading')).toBeInTheDocument()
    const skeletons = screen
      .getByTestId('event-history-loading')
      .querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // 2. Empty state
  it('shows empty state when no events exist', async () => {
    mockFetchEvents([])

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })

    expect(screen.getByText(/No events found/i)).toBeInTheDocument()
  })

  // 3. Events displayed with type label and timestamp
  it('displays events with type label and timestamp', async () => {
    mockFetchEvents(MOCK_EVENTS)

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('events-list')).toBeInTheDocument()
    })

    const typeLabels = screen.getAllByTestId('event-type-label')
    expect(typeLabels.some((el) => el.textContent === 'Check-in Completed')).toBe(true)
    expect(typeLabels.some((el) => el.textContent === 'Check-in Missed')).toBe(true)

    const timestamps = screen.getAllByTestId('event-timestamp')
    expect(timestamps.length).toBe(2)
    // Timestamps should be non-empty formatted strings
    timestamps.forEach((ts) => {
      expect(ts.textContent).not.toBe('')
    })
  })

  // 4. Risk score badge shown when risk_score_at_event is present
  it('shows risk score badge when risk_score_at_event is present', async () => {
    mockFetchEvents(MOCK_EVENTS)

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('events-list')).toBeInTheDocument()
    })

    // event-1 has risk_score_at_event: 25
    const badges = screen.getAllByTestId('event-risk-score')
    expect(badges.length).toBe(1)
    expect(badges[0]).toHaveTextContent('25')

    // event-2 has no risk score — no extra badge
    expect(badges.length).toBe(1)
  })

  // 5. Filter dropdown opens when filter button is clicked
  it('opens filter dropdown when filter button is clicked', async () => {
    mockFetchEvents(MOCK_EVENTS)

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('event-history')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('filter-dropdown')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('filter-button'))

    expect(screen.getByTestId('filter-dropdown')).toBeInTheDocument()
  })

  // 6. Selecting a filter type updates the API call with type param
  it('calls API with type param when a filter is selected', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(makeEventsResponse(MOCK_EVENTS))
    ) as jest.Mock
    global.fetch = fetchMock

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('event-history')).toBeInTheDocument()
    })

    // Open filter dropdown
    fireEvent.click(screen.getByTestId('filter-button'))
    expect(screen.getByTestId('filter-dropdown')).toBeInTheDocument()

    // Click "Check-in Completed" option (use getAllByText since the event row also shows this label)
    const options = screen.getAllByText('Check-in Completed')
    // The dropdown option is the one inside the filter-dropdown
    const dropdown = screen.getByTestId('filter-dropdown')
    const dropdownOption = Array.from(dropdown.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Check-in Completed')
    )!
    fireEvent.click(dropdownOption)

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]))
      const filteredCall = calls.find((url) => url.includes('type=check_in_completed'))
      expect(filteredCall).toBeDefined()
    })
  })

  // 7. "Load more" button shown when there are more events
  it('shows "Load more" button when total exceeds loaded events', async () => {
    // 2 events loaded but total is 5
    mockFetchEvents(MOCK_EVENTS, 5)

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('load-more-button')).toBeInTheDocument()
    })

    expect(screen.getByTestId('load-more-button')).toHaveTextContent(/Load more/i)
  })

  it('does not show "Load more" button when all events are loaded', async () => {
    mockFetchEvents(MOCK_EVENTS, 2)

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('events-list')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('load-more-button')).not.toBeInTheDocument()
  })

  // 8. Clicking "Load more" fetches next page and appends events
  it('fetches next page and appends events when "Load more" is clicked', async () => {
    const PAGE_2_EVENT = {
      id: 'event-3',
      event_type: 'guardian_enabled',
      event_timestamp: '2024-01-13T10:00:00.000Z',
      risk_score_at_event: null,
      escalation_stage: null,
      user_response: null,
      metadata: {},
    }

    const fetchMock = jest.fn((url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('page=2')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { events: [PAGE_2_EVENT], total: 3, page: 2, limit: 20 },
            }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { events: MOCK_EVENTS, total: 3, page: 1, limit: 20 },
          }),
      } as Response)
    }) as jest.Mock
    global.fetch = fetchMock

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('load-more-button')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('load-more-button'))
    })

    await waitFor(() => {
      const typeLabels = screen.getAllByTestId('event-type-label')
      expect(typeLabels.some((el) => el.textContent === 'Guardian Enabled')).toBe(true)
    })

    // Original events still present
    const typeLabels = screen.getAllByTestId('event-type-label')
    expect(typeLabels.some((el) => el.textContent === 'Check-in Completed')).toBe(true)
    expect(typeLabels.some((el) => el.textContent === 'Check-in Missed')).toBe(true)

    // page=2 was requested
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((url) => url.includes('page=2'))).toBe(true)
  })

  // 9. Export button calls GET /api/guardian/events/export
  it('calls GET /api/guardian/events/export when export button is clicked', async () => {
    // Set up fetch mock first (before any URL stubs that might throw)
    const fetchMock = jest.fn((url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/guardian/events/export')) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['csv,data'], { type: 'text/csv' })),
          headers: new Headers({
            'content-disposition': 'attachment; filename="events.csv"',
          }),
          json: () => Promise.resolve({}),
        } as unknown as Response)
      }
      return Promise.resolve(makeEventsResponse(MOCK_EVENTS))
    }) as jest.Mock
    global.fetch = fetchMock

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('event-history')).toBeInTheDocument()
    })

    // Define URL stubs right before clicking export (after render succeeds)
    try {
      Object.defineProperty(global.URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: jest.fn(() => 'blob:mock-url'),
      })
      Object.defineProperty(global.URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: jest.fn(),
      })
    } catch {
      // jsdom may not allow redefining — assign directly
      ;(global as unknown as Record<string, unknown>).URL = {
        ...global.URL,
        createObjectURL: jest.fn(() => 'blob:mock-url'),
        revokeObjectURL: jest.fn(),
      }
    }

    const appendChildSpy = jest
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => node)

    await act(async () => {
      fireEvent.click(screen.getByTestId('export-button'))
    })

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(calls.some((url) => url.includes('/api/guardian/events/export'))).toBe(true)
    })

    appendChildSpy.mockRestore()
  })

  // 10. Error state shown when API fails
  it('shows error state when API returns an error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to load events.' }),
      } as Response)
    ) as jest.Mock

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('event-history-error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('event-history-error')).toHaveTextContent(
      /Failed to load events/i
    )
  })

  it('shows network error message when fetch throws', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock

    render(<EventHistory />)

    await waitFor(() => {
      expect(screen.getByTestId('event-history-error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('event-history-error')).toHaveTextContent(
      /Network error/i
    )
  })
})
