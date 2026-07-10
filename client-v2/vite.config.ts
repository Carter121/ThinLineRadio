import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	//* Expose PUBLIC_-prefixed env vars via import.meta.env (used by $lib/tlr-config.ts).
	//* Unlike $env/static/public, missing vars fall back to defaults instead of failing the build.
	envPrefix: 'PUBLIC_',
	plugins: [tailwindcss(), sveltekit()]
});
