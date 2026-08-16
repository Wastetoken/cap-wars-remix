
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WorldProvider } from 'koota/react'
import { world } from './ecs/index.ts'

if (typeof window !== 'undefined') {
  window.addEventListener('gesturestart', (e) => e.preventDefault())
}

createRoot(document.getElementById('root')!).render(

    <WorldProvider world={world}>
      <App />
    </WorldProvider>

)
