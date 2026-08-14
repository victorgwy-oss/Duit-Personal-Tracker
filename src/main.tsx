import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ensureSeeded } from './db'
import { isOnlineMode } from './lib/config'

// In local-only mode we seed defaults before first render. In online mode the
// sync bootstrap decides whether to seed or adopt cloud data after sign-in.
const boot = isOnlineMode ? Promise.resolve() : ensureSeeded()

boot.finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
