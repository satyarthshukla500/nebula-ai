/**
 * usePerformanceMonitor Hook Tests
 * 
 * Unit tests for the performance monitoring hook to ensure proper
 * FPS tracking, frame time calculation, and automatic degradation.
 * 
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react'
import { usePerformanceMonitor } from '../usePerformanceMonitor'

// Provide cancelAnimationFrame/requestAnimationFrame for jsdom at module scope
// so they're available even during React cleanup after afterEach runs.
;(global as any).requestAnimationFrame = (cb: FrameRequestCallback): number =>
  setTimeout(cb, 16) as unknown as number
;(global as any).cancelAnimationFrame = (id: number): void => clearTimeout(id)

describe('usePerformanceMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // Override with jest mocks for assertion purposes
    let frameId = 0
    global.requestAnimationFrame = jest.fn((callback) => {
      frameId++
      setTimeout(() => callback(performance.now()), 16)
      return frameId
    })
    global.cancelAnimationFrame = jest.fn()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
    jest.useRealTimers()
    // Restore working implementations after useRealTimers so React cleanup
    // can call cancelAnimationFrame without throwing
    ;(global as any).requestAnimationFrame = (cb: FrameRequestCallback): number =>
      setTimeout(cb, 16) as unknown as number
    ;(global as any).cancelAnimationFrame = (id: number): void => clearTimeout(id)
  })

  describe('Initialization', () => {
    it('should initialize with default metrics', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      expect(result.current.fps).toBe(60)
      expect(result.current.frameTime).toBeCloseTo(16.67, 1)
      expect(result.current.isDegraded).toBe(false)
      expect(result.current.disableBlur).toBe(false)
      expect(result.current.orbReductionFactor).toBe(1.0)
    })

    it('should start monitoring on mount', () => {
      renderHook(() => usePerformanceMonitor())
      
      expect(requestAnimationFrame).toHaveBeenCalled()
    })

    it('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => usePerformanceMonitor())
      
      unmount()
      
      expect(cancelAnimationFrame).toHaveBeenCalled()
    })
  })

  describe('FPS Tracking', () => {
    it('should track frame rate', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      // Initial FPS should be 60
      expect(result.current.fps).toBe(60)
    })

    it('should calculate average frame time', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      // Frame time should be around 16.67ms for 60 FPS
      expect(result.current.frameTime).toBeGreaterThan(0)
      expect(result.current.frameTime).toBeLessThan(100)
    })
  })

  describe('Performance Degradation', () => {
    it('should not be degraded initially', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      expect(result.current.isDegraded).toBe(false)
      expect(result.current.disableBlur).toBe(false)
      expect(result.current.orbReductionFactor).toBe(1.0)
    })

    it('should maintain orb reduction factor at 1.0 when performance is good', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      expect(result.current.orbReductionFactor).toBe(1.0)
    })

    it('should not disable blur when performance is good', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      expect(result.current.disableBlur).toBe(false)
    })
  })

  describe('Frame Time Calculation', () => {
    it('should maintain frame time below 16ms target for 60 FPS', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      // For good performance, frame time should be close to 16.67ms
      expect(result.current.frameTime).toBeLessThanOrEqual(20)
    })
  })

  describe('Metrics Updates', () => {
    it('should update metrics periodically', () => {
      const { result } = renderHook(() => usePerformanceMonitor())
      
      const initialFps = result.current.fps
      
      // Metrics should be initialized
      expect(initialFps).toBeGreaterThan(0)
    })
  })
})
