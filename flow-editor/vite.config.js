import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// O bundle é servido pelo GitHub Pages em https://www.eciaa.com.br/flow-editor/dist/
// e carregado por um shell HTML que o n8n devolve autenticado.
// `base` precisa ser o caminho público real, senão os assets quebram dentro do iframe.
export default defineConfig({
  base: '/flow-editor/dist/',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // IIFE, não módulo ES. O app roda dentro de um iframe sandboxed sem
    // `allow-same-origin`, onde a origem é `null`: um <script type="module">
    // de outro host precisaria passar por CORS e falharia. Script clássico não.
    // Consequência: bundle único, sem code splitting (daí o inlineDynamicImports).
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.[hash].js',
        assetFileNames: 'app.[hash][extname]'
      }
    }
  }
})
