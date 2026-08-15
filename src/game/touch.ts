// ============================================================================
// Touch input — shared analog state for the virtual joystick.
// The joystick UI (components/touch/TouchControls) writes here every pointer
// frame; PlayerController reads it in useFrame. Module singleton = zero
// re-render cost for a 60Hz input stream.
// ============================================================================

export const touchMove = {
  /** -1..1, screen right = +x */
  x: 0,
  /** -1..1, screen down = +y (maps to world +z) */
  y: 0,
  /** true while the thumb is on the stick past the deadzone */
  active: false,
  /** 0..1 analog magnitude (pre-deadzone) */
  magnitude: 0,
}

export const resetTouchMove = () => {
  touchMove.x = 0
  touchMove.y = 0
  touchMove.active = false
  touchMove.magnitude = 0
}

/** Coarse pointer = phone/tablet. Touchscreen LAPTOPS have a fine primary
 *  pointer, so capability alone ('ontouchstart') must not count — only a real
 *  coarse pointer or an actual touch (App.tsx runtime upgrade) flips mode. */
export const detectTouch = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
