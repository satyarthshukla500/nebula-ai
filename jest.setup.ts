import '@testing-library/jest-dom'

// Provide browser animation and timer globals that jsdom doesn't implement.
// Assigned unconditionally so they're always available in all test environments.
// Tests that need specific behavior (e.g. fake timers) override these in beforeEach.
Object.assign(global, {
  requestAnimationFrame: (cb: FrameRequestCallback): number =>
    setTimeout(cb, 16) as unknown as number,
  cancelAnimationFrame: (id: number): void => clearTimeout(id),
  setInterval: global.setInterval,
  clearInterval: global.clearInterval,
})
