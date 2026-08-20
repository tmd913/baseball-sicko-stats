import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Both ports are overridable by environment, and the reason is parallel work:
   several agents run this app at once in their own worktrees, and a proxy
   target pinned to one port means the second one to start is reading the
   first one's server. `PORT` is what `dev:server` already sets, so the API
   half needs nothing new; these are the client half's two matching knobs. */
const apiPort = process.env.API_PORT ?? '4000';
const clientPort = Number(process.env.CLIENT_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so other devices on the LAN can connect
    port: clientPort,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
});
