// Re-export output utilities for convenience
export { Table, Banner, ProgressBar, CompletionSummary, separator, supportsEmoji, getEmoji, BOX_CHARS } from './output'

// Re-export Ink components from their individual files
export { InkBanner } from '../components/InkBanner'
export { InkCompletionSummary } from '../components/InkCompletionSummary'
export { ProgressBar as InkProgressBar } from '../components/ProgressBar'
export { InkTable } from '../components/InkTable'
export { InkLog } from '../components/InkLog'
export { InkSpinner } from '../components/InkSpinner'
export { InkStream } from '../components/InkStream'

/**
 * Helper function to render Ink components interactively (for TTY mode)
 */
export async function renderInkInteractive(element: React.ReactElement): Promise<void> {
  const { render } = await import('ink')
  render(element)
}

/**
 * Helper function to render Ink components to string (for non-TTY/JSON mode)
 */
export async function renderInk(element: React.ReactElement): Promise<string> {
  const { render: renderToString } = await import('ink-testing-library')
  const { lastFrame, unmount } = renderToString(element)
  const output = lastFrame() || ''
  unmount()
  return output
}
