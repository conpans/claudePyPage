import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css'
import '@fontsource-variable/atkinson-hyperlegible-mono'
import { render } from 'preact'
import { App } from './app.tsx'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

const root = document.getElementById('app')
if (root) render(<App />, root)
