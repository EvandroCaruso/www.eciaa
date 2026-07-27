import { createApp } from 'vue'
import App from './App.vue'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import './styles.css'
import './canvas.css'

// O tema vem do Hub quando embarcado; dark é o padrão do ecossistema.
const theme = (window.__MSGFLOW_CTX__ && window.__MSGFLOW_CTX__.theme) || 'dark'
document.documentElement.setAttribute('data-theme', theme)

createApp(App).mount('#app')
