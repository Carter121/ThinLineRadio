import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

//* Static SPA build: everything is client-rendered (ssr disabled in the root layout)
//* and the Go server embeds ../server/webapp-v2 and serves index.html as the SPA fallback.
/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ script: true }),

	compilerOptions: {
		experimental: {
			async: true
		}
	},

	kit: {
		adapter: adapter({
			pages: '../server/webapp-v2',
			assets: '../server/webapp-v2',
			fallback: 'index.html',
			precompress: false,
			strict: true
		})
	}
};

export default config;
