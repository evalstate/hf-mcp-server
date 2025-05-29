import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
	plugins: [],
	test: {
		globals: true,
		setupFiles: [],
		include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
	},
});
