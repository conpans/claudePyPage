// The modifier key for shortcuts, named the way the learner's keyboard names it.
// The shortcuts themselves accept both Ctrl and Cmd everywhere.

const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** "Ctrl" on Windows and Linux, "Cmd" on a Mac. */
export const MOD_KEY = isApple ? 'Cmd' : 'Ctrl'
