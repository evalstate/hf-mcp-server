import { BaseTransport, type TransportOptions } from './base-transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export class SseTransport extends BaseTransport {
	// Store multiple SSE transport instances
	private sseTransports: Record<string, SSEServerTransport> = {};

	async initialize(options: TransportOptions): Promise<void> {
		// SSE endpoint for client connections
		this.app.get('/sse', async (req, res) => {
			console.log('Received SSE connection');

			// Create dedicated transport for this connection
			const transport = new SSEServerTransport('/message', res);
			const sessionId = transport.sessionId;

			// Store in our collection
			this.sseTransports[sessionId] = transport;

			// Clean up on connection close
			res.on('close', () => {
				console.log(`SSE connection closed: ${sessionId}`);
				delete this.sseTransports[sessionId];
			});

			// Connect to server
			await this.server.connect(transport);

			// Note: No need to set server.onclose here
		});

		// Handle messages for all SSE sessions
		this.app.post('/message', async (req, res) => {
			console.log('Received SSE message');

			// Extract sessionId from query parameters
			const sessionId = req.query.sessionId as string;

			if (sessionId && this.sseTransports[sessionId]) {
				// Handle message with the appropriate transport
				await this.sseTransports[sessionId].handlePostMessage(req, res);
			} else {
				res.status(404).json({
					error: 'Session not found',
				});
			}
		});

		console.log('SSE transport routes initialized');
	}

	async cleanup(): Promise<void> {
		console.log('Cleaning up SSE transport');

		// Close all active SSE connections
		const transportIds = Object.keys(this.sseTransports);

		for (const id of transportIds) {
			try {
				const transport = this.sseTransports[id];
				if (transport) {
					await transport.close();
					delete this.sseTransports[id];
				} else {
					console.error('Transport not found for ID:', id);
				}
			} catch (err) {
				console.error(`Error closing SSE transport ${id}:`, err);
			}
		}
	}
}
