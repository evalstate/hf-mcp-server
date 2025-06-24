/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatelessHttpTransport } from './stateless-http-transport.js';
import type { ServerFactory } from './base-transport.js';
import express from 'express';

describe('StatelessHttpTransport', () => {
	let transport: StatelessHttpTransport;

	beforeEach(() => {
		// Create a minimal instance for testing private methods
		const mockServerFactory = vi.fn() as unknown as ServerFactory;
		const mockApp = express();
		transport = new StatelessHttpTransport(mockServerFactory, mockApp);
	});

	describe('shouldHandle', () => {
		it('should handle tools/list requests', () => {
			const result = (transport as any).shouldHandle({ method: 'tools/list' });
			expect(result).toBe(true);
		});

		it('should handle tools/call requests', () => {
			const result = (transport as any).shouldHandle({ method: 'tools/call' });
			expect(result).toBe(true);
		});

		it('should handle initialize requests', () => {
			const result = (transport as any).shouldHandle({ method: 'initialize' });
			expect(result).toBe(true);
		});

		it('should not handle ping requests', () => {
			const result = (transport as any).shouldHandle({ method: 'ping' });
			expect(result).toBe(false);
		});

		it('should handle prompts/list requests', () => {
			const result = (transport as any).shouldHandle({ method: 'prompts/list' });
			expect(result).toBe(true);
		});

		it('should handle prompts/get requests', () => {
			const result = (transport as any).shouldHandle({ method: 'prompts/get' });
			expect(result).toBe(true);
		});

		it('should not handle resources/list requests', () => {
			const result = (transport as any).shouldHandle({ method: 'resources/list' });
			expect(result).toBe(false);
		});

		it('should not handle resources/read requests', () => {
			const result = (transport as any).shouldHandle({ method: 'resources/read' });
			expect(result).toBe(false);
		});

		it('should handle undefined method gracefully', () => {
			const result = (transport as any).shouldHandle({});
			expect(result).toBe(false);
		});

		it('should handle undefined body gracefully', () => {
			const result = (transport as any).shouldHandle(undefined);
			expect(result).toBe(false);
		});

		it('should handle null body gracefully', () => {
			const result = (transport as any).shouldHandle(null);
			expect(result).toBe(false);
		});
	});
});
