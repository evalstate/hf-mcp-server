import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// https://vite.dev/config/
export default defineConfig(() => {
	// Conditionally apply singlefile plugin only to mcp-welcome build
	const plugins = [react(), tailwindcss()];

	// Check if we're building the mcp-welcome page specifically
	const isMcpWelcomeBuild = process.env.VITE_BUILD_TARGET === 'mcp-welcome';

	if (isMcpWelcomeBuild) {
		plugins.push(viteSingleFile());
	}

	return {
		plugins,
		resolve: {
			alias: {
				'@': path.resolve(__dirname, './src/web'),
			},
		},
		build: {
			outDir: path.resolve(__dirname, './dist/web'),
			emptyOutDir: false, // This prevents deleting mcp-server.js during builds
			rollupOptions: {
				input: isMcpWelcomeBuild
					? { mcpWelcome: path.resolve(__dirname, './src/web/mcp-welcome.html') }
					: {
							main: path.resolve(__dirname, './src/web/index.html'),
							mcpWelcome: path.resolve(__dirname, './src/web/mcp-welcome.html'),
						},
			},
		},
		root: path.resolve(__dirname, './src/web'),
	};
});
