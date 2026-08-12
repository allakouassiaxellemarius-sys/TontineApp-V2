function peutVibrer() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export const haptic = {
  tap: () => peutVibrer() && navigator.vibrate(8),
  success: () => peutVibrer() && navigator.vibrate([0, 15, 40, 15]),
  error: () => peutVibrer() && navigator.vibrate([0, 30, 50, 30, 50, 30]),
  warning: () => peutVibrer() && navigator.vibrate([0, 20, 40, 20]),
}
