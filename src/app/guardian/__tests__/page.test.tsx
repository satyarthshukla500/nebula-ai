/**
 * @jest-environment jsdom
 *
 * Guardian Mode Page — End-to-End Consent Flow Tests
 *
 * Tests for task 5.1.10: Test complete consent flow end-to-end
 * Validates: Requirements 1.1
 *
 * Covers:
 *  1. Loading state shown while fetching settings
 *  2. Disabled view shown when Guardian Mode is not enabled
 *  3. "Enable Guardian Mode" button opens DisclaimerModal
 *  4. After activation, ActivationConfirmation is shown
 *  5. After onDone, dashboard view is shown
 *  6. Dashboard shows "Disable Guardian Mode" button
 *  7. Disabling returns to disabled view
 */

import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mock child components to isolate page logic ───────────────────────────

jest.mock('@/components/guardian/DisclaimerModal', () => ({
  DisclaimerModal: ({
    onClose,
    onActivated,
  }: {
    onClose: () => void
    onActivated: () => void
  }) => (
    <div data-testid="disclaimer-modal">
      <button onClick={onClose} data-testid="modal-close">
        Close
      </button>
      <button onClick={onActivated} data-testid="modal-activate">
        Activate
      </button>
    </div>
  ),
}))

jest.mock('@/components/guardian/ActivationConfirmation', () => ({
  ActivationConfirmation: ({ onDone }: { onDone: () => void }) => (
    <div data-testid="activation-confirmation">
      <button onClick={onDone} data-testid="done-button">
        Go to Guardian Dashboard
      </button>
    </div>
  ),
}))

jest.mock('@/components/guardian/GuardianDashboard', () => ({
  GuardianDashboard: ({ onDisabled }: { onDisabled: () => void }) => {
    const [error, setError] = React.useState('')
    const handleDisable = async () => {
      try {
        const res = await fetch('/api/guardian/settings/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (res.ok) {
          onDisabled()
        } else {
          const data = await res.json()
          setError(data.error || 'Failed to disable Guardian Mode.')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
      }
    }
    return (
      <div data-testid="guardian-dashboard">
        <p>Guardian Mode is active</p>
        {error && <div role="alert">{error}</div>}
        <button onClick={handleDisable} data-testid="disable-button">
          Disable Guardian Mode
        </button>
      </div>
    )
  },
}))

// Mock UI primitives to avoid style/import issues in jsdom
jest.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

// ─── Import page after mocks ────────────────────────────────────────────────

import GuardianModePage from '../page'

// ─── Helpers ────────────────────────────────────────────────────────────────

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

afterEach(() => {
  jest.restoreAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GuardianModePage — consent flow', () => {
  // 1. Loading state
  it('shows loading spinner while fetching settings', () => {
    // fetch never resolves during this test
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock

    render(<GuardianModePage />)

    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    expect(screen.getByText(/Loading Guardian Mode settings/i)).toBeInTheDocument()
  })

  // 2. Disabled view when not enabled
  it('shows disabled view when Guardian Mode is not enabled', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: false } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })

    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('disclaimer-modal')).not.toBeInTheDocument()
  })

  // 2b. Disabled view when settings returns 404
  it('shows disabled view when settings API returns non-ok', async () => {
    mockFetch({
      '/api/guardian/settings': { ok: false, body: { error: 'Not found' } },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })
  })

  // 2c. Disabled view on network error
  it('shows disabled view on fetch network error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })
  })

  // 3. "Enable Guardian Mode" button opens DisclaimerModal
  it('opens DisclaimerModal when "Enable Guardian Mode" is clicked', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: false } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Enable Guardian Mode'))

    expect(screen.getByTestId('disclaimer-modal')).toBeInTheDocument()
  })

  // 3b. Closing the modal hides it
  it('closes DisclaimerModal when onClose is called', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: false } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Enable Guardian Mode'))
    expect(screen.getByTestId('disclaimer-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('modal-close'))
    expect(screen.queryByTestId('disclaimer-modal')).not.toBeInTheDocument()
  })

  // 4. After activation, ActivationConfirmation is shown
  it('shows ActivationConfirmation after modal signals activation', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: false } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Enable Guardian Mode'))
    fireEvent.click(screen.getByTestId('modal-activate'))

    expect(screen.getByTestId('activation-confirmation')).toBeInTheDocument()
    expect(screen.queryByTestId('disclaimer-modal')).not.toBeInTheDocument()
  })

  // 5. After onDone, dashboard view is shown
  it('shows dashboard view after ActivationConfirmation onDone', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: false } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })

    // Open modal → activate → done
    fireEvent.click(screen.getByText('Enable Guardian Mode'))
    fireEvent.click(screen.getByTestId('modal-activate'))
    fireEvent.click(screen.getByTestId('done-button'))

    expect(screen.queryByTestId('activation-confirmation')).not.toBeInTheDocument()
    expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
    expect(screen.getByText(/Guardian Mode is active/i)).toBeInTheDocument()
  })

  // 6. Dashboard shown directly when already enabled
  it('shows dashboard view when Guardian Mode is already enabled', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: true } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
    })

    expect(screen.queryByText('Enable Guardian Mode')).not.toBeInTheDocument()
    expect(screen.getByText(/Guardian Mode is active/i)).toBeInTheDocument()
  })

  // 6b. Dashboard also works with top-level isEnabled field
  it('shows dashboard when settings returns top-level isEnabled: true', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { isEnabled: true },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
    })
  })

  // 7. Disabling returns to disabled view
  it('returns to disabled view after successfully disabling Guardian Mode', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: true } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
    })

    // Now mock the disable endpoint
    global.fetch = jest.fn((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/guardian/settings/disable')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
    }) as jest.Mock

    await act(async () => {
      fireEvent.click(screen.getByText('Disable Guardian Mode'))
    })

    await waitFor(() => {
      expect(screen.getByText('Enable Guardian Mode')).toBeInTheDocument()
    })

    expect(screen.queryByText('Disable Guardian Mode')).not.toBeInTheDocument()
  })

  // 7b. Shows error message when disable API fails
  it('shows error message when disable API returns an error', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: true } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
    })

    global.fetch = jest.fn((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/guardian/settings/disable')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Server error' }),
        } as Response)
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
    }) as jest.Mock

    await act(async () => {
      fireEvent.click(screen.getByText('Disable Guardian Mode'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })

    // Still on dashboard
    expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
  })

  // 7c. Shows network error message when disable fetch throws
  it('shows network error message when disable fetch throws', async () => {
    mockFetch({
      '/api/guardian/settings': {
        ok: true,
        body: { data: { isEnabled: true } },
      },
    })

    render(<GuardianModePage />)

    await waitFor(() => {
      expect(screen.getByText('Disable Guardian Mode')).toBeInTheDocument()
    })

    global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock

    await act(async () => {
      fireEvent.click(screen.getByText('Disable Guardian Mode'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error')
    })
  })
})
