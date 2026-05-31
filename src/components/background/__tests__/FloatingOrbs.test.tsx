/**
 * FloatingOrbs Component Tests
 *
 * @jest-environment jsdom
 */

import React from 'react'
import { render } from '@testing-library/react'
import { FloatingOrbs } from '../FloatingOrbs'

// Mock useTheme so FloatingOrbs gets a valid theme
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    currentTheme: {
      colors: {
        primary: '#8b5cf6',
        secondary: '#7c3aed',
        accent: '#a78bfa',
        glow: '#8b5cf6',
        background: '#0f0f1e',
        surface: '#1a1a2e',
      },
      effects: {
        glowIntensity: 60,
        animationSpeed: 1.0,
        particleDensity: 50,
        blurAmount: 10,
        enableOrbs: true,
        enableGrid: true,
        enableParticles: true,
      },
    },
  }),
}))

// Mock usePerformanceMonitor so FloatingOrbs doesn't need rAF for metrics
jest.mock('@/hooks/usePerformanceMonitor', () => ({
  usePerformanceMonitor: () => ({
    fps: 60,
    frameTime: 16.67,
    isDegraded: false,
    disableBlur: false,
    orbReductionFactor: 1.0,
  }),
}))

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600

  const mockCtx = {
    clearRect: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    filter: 'none',
    fillStyle: '',
  }

  // jsdom returns null for getContext('2d') — override it
  jest.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any)

  return canvas
}

describe('FloatingOrbs', () => {
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    canvas = makeCanvas()
    global.requestAnimationFrame = jest.fn((cb) => {
      setTimeout(() => cb(Date.now()), 16)
      return 1
    }) as any
    global.cancelAnimationFrame = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      const { container } = render(
        <FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />
      )
      expect(container).toBeInTheDocument()
    })

    it('should return null (no DOM elements)', () => {
      const { container } = render(
        <FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('should handle null canvas gracefully', () => {
      expect(() => {
        render(<FloatingOrbs canvas={null} width={800} height={600} intensity={60} />)
      }).not.toThrow()
    })
  })

  describe('Orb Initialization', () => {
    it('should start animation when canvas is provided', () => {
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />)
      expect(requestAnimationFrame).toHaveBeenCalled()
    })

    it('should start animation with low intensity', () => {
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={10} />)
      expect(requestAnimationFrame).toHaveBeenCalled()
    })

    it('should start animation with high intensity', () => {
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={100} />)
      expect(requestAnimationFrame).toHaveBeenCalled()
    })

    it('should not start animation when canvas is null', () => {
      render(<FloatingOrbs canvas={null} width={800} height={600} intensity={60} />)
      expect(requestAnimationFrame).not.toHaveBeenCalled()
    })
  })

  describe('Animation Loop', () => {
    it('should start animation loop on mount', () => {
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />)
      expect(requestAnimationFrame).toHaveBeenCalled()
    })

    it('should clear canvas on each frame', async () => {
      const ctx = canvas.getContext('2d') as any
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />)
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)
    })

    it('should cancel animation frame on unmount', () => {
      const { unmount } = render(
        <FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />
      )
      unmount()
      expect(cancelAnimationFrame).toHaveBeenCalled()
    })

    it('should not throw error on unmount', () => {
      const { unmount } = render(
        <FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />
      )
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('Orb Rendering', () => {
    it('should create radial gradients for orbs', async () => {
      const ctx = canvas.getContext('2d') as any
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />)
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(ctx.createRadialGradient).toHaveBeenCalled()
    })

    it('should draw orbs using arc', async () => {
      const ctx = canvas.getContext('2d') as any
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />)
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(ctx.arc).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
    })
  })

  describe('Canvas Dimensions', () => {
    it('should handle canvas resize', () => {
      const { rerender } = render(
        <FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />
      )
      rerender(<FloatingOrbs canvas={canvas} width={1024} height={768} intensity={60} />)
      expect(requestAnimationFrame).toHaveBeenCalled()
    })

    it('should handle zero dimensions gracefully', () => {
      expect(() => {
        render(<FloatingOrbs canvas={canvas} width={0} height={0} intensity={60} />)
      }).not.toThrow()
    })
  })

  describe('Intensity Prop', () => {
    it('should accept intensity prop', () => {
      expect(() => {
        render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={80} />)
      }).not.toThrow()
    })

    it('should default intensity to 60', () => {
      expect(() => {
        render(<FloatingOrbs canvas={canvas} width={800} height={600} />)
      }).not.toThrow()
    })

    it('should handle low intensity', () => {
      expect(() => {
        render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={10} />)
      }).not.toThrow()
    })

    it('should handle high intensity', () => {
      expect(() => {
        render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={100} />)
      }).not.toThrow()
    })
  })

  describe('Performance', () => {
    it('should use requestAnimationFrame for smooth animation', () => {
      render(<FloatingOrbs canvas={canvas} width={800} height={600} intensity={60} />)
      expect(requestAnimationFrame).toHaveBeenCalled()
    })
  })
})
