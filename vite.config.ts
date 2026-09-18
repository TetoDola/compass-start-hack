import { defineConfig, loadEnv } from 'vite';
import { fundHoldingsMiddleware } from './server/fund-holdings.ts';
import { intelligenceMiddleware } from './server/intelligence.ts';

export default defineConfig(({ mode }) => {
 const config = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
 return {
  plugins: [{ name: 'compass-data', configureServer(server) { server.middlewares.use(fundHoldingsMiddleware(process.cwd(), config)); server.middlewares.use(intelligenceMiddleware(config)); }, configurePreviewServer(server) { server.middlewares.use(fundHoldingsMiddleware(process.cwd(), config)); server.middlewares.use(intelligenceMiddleware(config)); } }],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/unriskomega-2026/**'],
    },
  },
}; });
