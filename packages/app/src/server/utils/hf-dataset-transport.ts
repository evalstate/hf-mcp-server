import build from 'pino-abstract-transport';
import { uploadFile } from '@huggingface/hub';
import type { uploadFile as UploadFileFunction } from '@huggingface/hub';
import { randomUUID } from 'node:crypto';
import type { Transform } from 'node:stream';
import safeStringify from 'fast-safe-stringify';

export interface HfDatasetTransportOptions {
	loggingToken: string;
	datasetId: string;
	batchSize?: number;
	flushInterval?: number; // in milliseconds
	uploadFunction?: typeof UploadFileFunction;
}

export interface LogEntry {
	level: number;
	time: number;
	msg: string;
	[key: string]: unknown;
}

export class HfDatasetLogger {
	private loggingToken: string;
	private datasetId: string;
	private logBuffer: LogEntry[] = [];
	private batchSize: number;
	private flushInterval: number;
	private flushTimer?: NodeJS.Timeout;
	private isShuttingDown = false;
	private uploadInProgress = false;
	private sessionId: string;
	private uploadFunction: typeof UploadFileFunction;
	private readonly maxBufferSize: number = 1000;

	constructor(options: HfDatasetTransportOptions) {
		this.loggingToken = options.loggingToken;
		this.datasetId = options.datasetId;
		this.batchSize = options.batchSize || 100;
		const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
		this.flushInterval = isTest ? options.flushInterval || 1000 : Math.max(options.flushInterval || 300000, 300000);
		this.sessionId = randomUUID();
		this.uploadFunction = options.uploadFunction || uploadFile;

		// Start the flush timer
		this.startFlushTimer();

		// Register shutdown handlers
		this.registerShutdownHandlers();

		// Log initialization
		console.log(`[HF Dataset Logger] Initialized - Dataset: ${this.datasetId}, Session: ${this.sessionId}`);
	}

	processLog(logEntry: LogEntry): void {
		try {
			if (this.logBuffer.length >= this.maxBufferSize) {
				this.logBuffer.shift();
			}

			this.logBuffer.push(logEntry);

			if (this.logBuffer.length >= this.batchSize) {
				void this.flush();
			}
		} catch (error) {
			console.error('[HF Dataset Logger] Error processing log:', error);
		}
	}

	private startFlushTimer(): void {
		this.flushTimer = setInterval(() => {
			if (this.logBuffer.length > 0) {
				void this.flush();
			}
		}, this.flushInterval);
	}

	private async flush(): Promise<void> {
		if (this.uploadInProgress || this.logBuffer.length === 0) {
			return;
		}

		const logsToUpload = [...this.logBuffer];
		this.logBuffer = [];
		this.uploadInProgress = true;

		try {
			await this.uploadLogs(logsToUpload);
			console.log(`[HF Dataset Logger] ✅ Uploaded ${logsToUpload.length} logs to ${this.datasetId}`);
		} catch (error) {
			// Just log the error and drop the logs - no retry logic
			console.error('[HF Dataset Logger] ❌ Upload failed, dropping logs:', error);
		} finally {
			this.uploadInProgress = false;
		}
	}

	private async uploadLogs(logs: LogEntry[]): Promise<void> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `logs-${timestamp}-${this.sessionId}.jsonl`;

		const dateFolder = new Date().toISOString().split('T')[0];
		const pathInRepo = `logs/${dateFolder}/${filename}`;

		// Create JSONL content directly in memory
		const logData = logs
			.map((log) => safeStringifyLog(log, this.sessionId))
			.filter(Boolean) // Remove empty strings from null/undefined logs
			.join('\n');

		// Upload directly from memory with timeout
		const uploadTimeout = 30000; // 30 seconds
		await Promise.race([
			this.uploadFunction({
				repo: { type: 'dataset', name: this.datasetId },
				file: {
					path: pathInRepo,
					content: new Blob([logData], { type: 'application/x-ndjson' }),
				},
				accessToken: this.loggingToken,
				commitTitle: `Add ${logs.length} log entries`,
				commitDescription: `Session: ${this.sessionId}, Time: ${new Date().toISOString()}`,
			}),
			new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout')), uploadTimeout)),
		]);
	}

	private registerShutdownHandlers(): void {
		const shutdownHandler = async () => {
			await this.destroy();
		};

		// Register handlers for various shutdown signals (skip in tests to avoid MaxListeners warning)
		const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
		if (!isTest) {
			process.once('beforeExit', shutdownHandler);
			process.once('SIGINT', shutdownHandler);
			process.once('SIGTERM', shutdownHandler);
			process.once('exit', () => {
				// Synchronous cleanup if needed
				if (this.flushTimer) {
					clearInterval(this.flushTimer);
				}
			});
		}
	}

	async destroy(): Promise<void> {
		if (this.isShuttingDown) return;
		this.isShuttingDown = true;

		console.log('[HF Dataset Logger] Shutting down...');

		// Clear the flush timer
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}

		// Final flush attempt
		try {
			await this.flush();
		} catch (error) {
			console.error('[HF Dataset Logger] Error during final log flush:', error);
		}
	}

	// Simple health check method
	getStatus(): {
		bufferSize: number;
		uploadInProgress: boolean;
		sessionId: string;
	} {
		return {
			bufferSize: this.logBuffer.length,
			uploadInProgress: this.uploadInProgress,
			sessionId: this.sessionId,
		};
	}
}

interface TransportOptions {
	batchSize?: number;
	flushInterval?: number;
}

// Helper function to create a no-op transport
function createNoOpTransport(reason: string): Transform {
	console.warn(`[HF Dataset Logger] Dataset logging disabled: ${reason}`);
	return build(function (source) {
		source.on('data', function (_obj: unknown) {
			// No-op
		});
	});
}

// Helper function to safely stringify log entries
function safeStringifyLog(log: LogEntry, sessionId: string): string {
	if (!log) return ''; // Skip null/undefined logs
	return safeStringify.default({
		...log,
		timestamp: new Date(log.time || Date.now()).toISOString(),
		sessionId,
	});
}

// Factory function for Pino transport using pino-abstract-transport
export default async function (opts: TransportOptions = {}): Promise<Transform> {
	// Early returns for no-op cases
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return createNoOpTransport('disabled during tests');
	}

	const datasetId = process.env.LOGGING_DATASET_ID;
	if (!datasetId) {
		return createNoOpTransport('no dataset ID configured');
	}

	const loggingToken = process.env.LOGGING_HF_TOKEN || process.env.DEFAULT_HF_TOKEN;
	if (!loggingToken) {
		console.warn(
			'[HF Dataset Logger] No HF token available (LOGGING_HF_TOKEN or DEFAULT_HF_TOKEN). Dataset logging disabled.'
		);
		return createNoOpTransport('no HF token available');
	}

	// Log that we're using HF dataset logging
	console.log(`[HF Dataset Logger] Logging to dataset: ${datasetId}`);

	try {
		// Create the HF dataset logger instance
		const hfLogger = new HfDatasetLogger({
			loggingToken,
			datasetId,
			batchSize: opts.batchSize || parseInt(process.env.LOGGING_BATCH_SIZE || '100', 10),
			flushInterval:
				opts.flushInterval || Math.max(parseInt(process.env.LOGGING_FLUSH_INTERVAL || '300000', 10), 300000),
		});

		// Return a proper Pino transport using async iterator pattern (recommended)
		return build(
			async function (source) {
				for await (const obj of source) {
					// Process each log entry with error isolation
					try {
						hfLogger.processLog(obj);
					} catch (error) {
						// Never let transport errors affect the main logger
						console.error('[HF Dataset Logger] Transport error (ignoring):', error);
					}
				}
			},
			{
				async close(_err: Error) {
					// Ensure all logs are flushed on close
					try {
						await hfLogger.destroy();
					} catch (error) {
						console.error('[HF Dataset Logger] Error during close (ignoring):', error);
					}
				},
			}
		);
	} catch (error) {
		console.error('[HF Dataset Logger] Failed to initialize, falling back to no-op:', error);
		return createNoOpTransport('initialization failed');
	}
}
