import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/fonts.css'
import './styles/industry.css'
import './styles/app.css'
import App from './App.vue'
import { setRequestObserver } from './api/client'
import { reportError } from './errors'
import { useNetworkLogStore } from './stores/networkLog'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Every API call goes through src/api/client.ts, which reports it to the network log. Registered before
// mount so the initial GET /api/nodes/roots is logged too.
const networkLog = useNetworkLogStore(pinia)
setRequestObserver({
  start: (method, path) => networkLog.start(method, path),
  finish: (id, status, durationMs) => {
    networkLog.finish(id, status, durationMs)
  },
})

app.config.errorHandler = (err) => {
  reportError(err)
}
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason)
})

app.mount('#app')
