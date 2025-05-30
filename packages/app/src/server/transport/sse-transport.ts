import { BaseTransport, type TransportOptions } from './base-transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export class SseTransport extends BaseTransport {
	// Store multiple SSE transport instances
	private sseTransports: Map<string, SSEServerTransport> = new Map();

	async initialize(_options: TransportOptions): Promise<void> {
		// SSE endpoint for client connections
		this.app.get('/sse', (req, res) => {
			void (async () => {
				console.log('Received SSE connection');

				// Create dedicated transport for this connection
				const transport = new SSEServerTransport('/message', res);
				const sessionId = transport.sessionId;

				// Store in our collection
				this.sseTransports.set(sessionId, transport);

				// Clean up on connection close
				res.on('close', () => {
					console.log(`SSE connection closed: ${sessionId}`);
					this.sseTransports.delete(sessionId);
				});

				// Connect to server
				await this.server.connect(transport);

				// Note: No need to set server.onclose here
			})();
		});

		// Handle messages for all SSE sessions
		this.app.post('/message', (req, res) => {
			void (async () => {
				console.log('Received SSE message');

				// Extract sessionId from query parameters
				const sessionId = req.query.sessionId as string;

				const transport = sessionId ? this.sseTransports.get(sessionId) : undefined;
				if (transport) {
					// Handle message with the appropriate transport
					// Pass req.body as the third parameter since express.json() has already parsed it
					await transport.handlePostMessage(req, res, req.body);
				} else {
					res.status(404).json({
						error: 'Session not found',
					});
				}
			})();
		});

		console.log('SSE transport routes initialized');
		// No await needed at top level, but method must be async to match base class
		return Promise.resolve();
	}

	async cleanup(): Promise<void> {
		console.log('Cleaning up SSE transport');

		// Close all active SSE connections
		const transportIds = Array.from(this.sseTransports.keys());

		for (const id of transportIds) {
			try {
				const transport = this.sseTransports.get(id);
				if (transport) {
					await transport.close();
					this.sseTransports.delete(id);
				} else {
					console.error('Transport not found for ID:', id);
				}
			} catch (err) {
				console.error(`Error closing SSE transport ${id}:`, err);
			}
		}
	}
}
