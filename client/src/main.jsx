import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '7.css/dist/7.css'
import './app.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
