import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function manualChunks(id) {
  if (!id.includes('/node_modules/')) return undefined;
  if (id.includes('/node_modules/pdf-lib/')) return 'vendor-pdf';
  if (id.includes('/node_modules/xlsx/')) return 'vendor-xlsx';
  if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'vendor-react';
  if (id.includes('/node_modules/@mantine/') || id.includes('/node_modules/@tabler/')) return 'vendor-ui';
  return undefined;
}

export const viteConfig = {
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
};

export default defineConfig(viteConfig);
