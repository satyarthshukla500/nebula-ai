/**
 * @jest-environment jsdom
 *
 * EscalationBanner Component Tests
 *
 * Tests for task 5.6.4: Test escalation UI components render and respond correctly
 * Validates: Requirements 1.4
 *
 * Covers:
 *  1. Not rendered when isVisible=false
 *  2. Rendered when isVisible=true
 *  3. Shows overdue duration when overdueMinutes is provided
 *  4. "Check In Now" button calls onCheckInNow
 *  5. "Snooze" button calls onSnooze and hides the banner
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mock UI primitives ────────────────────────────────────────────────────

jest.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode
    variant?: string
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}))

// ─── Import component after mocks ──────────────────────────────────────────

import { EscalationBanner } from '../EscalationBanner'

// ─── Helpers ───────────────────────────────────────────────────────────────

const defaultProps = {
  isVisible: true,
  onCheckInNow: jest.fn(),
  onSnooze: jest.fn(),
}

afterEach(() => {
  jest.clearAllMocks()
})

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EscalationBanner', () => {
  // 1. Not rendered when isVisible=false
  it('does not render when isVisible is false', () => {
    render(<EscalationBanner {...defaultProps} isVisible={false} />)

    expect(screen.queryByTestId('escalation-banner')).not.toBeInTheDocument()
  })

  // 2. Rendered when isVisible=true
  it('renders banner when isVisible is true', () => {
    render(<EscalationBanner {...defaultProps} />)

    expect(screen.getByTestId('escalation-banner')).toBeInTheDocument()
    expect(screen.getByText('Check-in Overdue')).toBeInTheDocument()
  })

  // 3. Shows overdue duration when overdueMinutes is provided
  it('shows overdue duration in minutes when overdueMinutes < 60', () => {
    render(<EscalationBanner {...defaultProps} overdueMinutes={45} />)

    expect(screen.getByText(/45 minutes overdue/)).toBeInTheDocument()
  })

  it('shows overdue duration in hours when overdueMinutes >= 60', () => {
    render(<EscalationBanner {...defaultProps} overdueMinutes={120} />)

    expect(screen.getByText(/2 hours overdue/)).toBeInTheDocument()
  })

  it('shows hours and minutes when overdueMinutes has remainder', () => {
    render(<EscalationBanner {...defaultProps} overdueMinutes={90} />)

    expect(screen.getByText(/1h 30m overdue/)).toBeInTheDocument()
  })

  it('shows generic overdue message when overdueMinutes is not provided', () => {
    render(<EscalationBanner {...defaultProps} />)

    expect(screen.getByText(/Your wellness check-in is overdue\./)).toBeInTheDocument()
  })

  // 4. "Check In Now" button calls onCheckInNow
  it('calls onCheckInNow when "Check In Now" button is clicked', () => {
    const onCheckInNow = jest.fn()
    render(<EscalationBanner {...defaultProps} onCheckInNow={onCheckInNow} />)

    fireEvent.click(screen.getByTestId('escalation-checkin-button'))

    expect(onCheckInNow).toHaveBeenCalledTimes(1)
  })

  // 5. "Snooze" button calls onSnooze and hides the banner
  it('calls onSnooze and hides the banner when "Snooze" button is clicked', () => {
    const onSnooze = jest.fn()
    render(<EscalationBanner {...defaultProps} onSnooze={onSnooze} />)

    fireEvent.click(screen.getByTestId('escalation-snooze-button'))

    expect(onSnooze).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('escalation-banner')).not.toBeInTheDocument()
  })
})
