/**
 * AnimatedBackground Component Tests
 *
 * @jest-environment jsdom
 */

import React from 'react'
import { render } from '@testing-library/react'
import { AnimatedBackground } from '../AnimatedBackground'

describe('AnimatedBackground', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<AnimatedBackground />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders a fixed-position wrapper div', () => {
    const { container } = render(<AnimatedBackground />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.position).toBe('fixed')
  })

  it('renders orb elements inside the wrapper', () => {
    const { container } = render(<AnimatedBackground />)
    const divs = container.querySelectorAll('div')
    // wrapper + 3 orbs + grid dots + particle container = at least 5 divs
    expect(divs.length).toBeGreaterThanOrEqual(5)
  })

  it('renders the particle container with id nebula-particles', () => {
    const { container } = render(<AnimatedBackground />)
    const particleContainer = container.querySelector('#nebula-particles')
    expect(particleContainer).not.toBeNull()
  })

  it('does not throw on unmount', () => {
    const { unmount } = render(<AnimatedBackground />)
    expect(() => unmount()).not.toThrow()
  })

  it('clears the spawn interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval')
    const { unmount } = render(<AnimatedBackground />)
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('spawns particle divs into nebula-particles container over time', (done) => {
    const { container } = render(<AnimatedBackground />)
    const particleContainer = container.querySelector('#nebula-particles') as HTMLElement

    // Wait for at least 2 spawn intervals (350ms each)
    setTimeout(() => {
      expect(particleContainer.children.length).toBeGreaterThan(0)
      done()
    }, 800)
  }, 3000)
})
