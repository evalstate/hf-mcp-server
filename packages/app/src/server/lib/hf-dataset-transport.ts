import build from 'pino-abstract-transport';
import { uploadFile } from '@huggingface/hub';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Transform } from 'node:stream';
import safeStringify from 'fast-safe-stringify';

interface HfDatasetTransportOptions {
	loggingToken: string;
	datasetId: string;
	batchSize?: number;
	flushInterval?: number; // in milliseconds
	maxRetries?: number;
	baseRetryDelay?: number;
	organizeByDate?: boolean;
	uploadFunction?: (options: {
		repo: { type: 'dataset'; name: string };
		file: { path: string; content: URL };
		accessToken: string;
		commitTitle: string;
		commitDescription: string;
	}) => Promise<any>;
}

interface LogEntry {
	level: number;
	time: number;
	msg: string;
	[key: string]: unknown;
}

export class HfDatasetLogger {
	private loggingToken: string;
	private datasetId: string;
	private logBuffer: LogEntry[] = [];
	private retryQueue: LogEntry[] = [];
	private readonly maxRetryQueueSize: number = 10000; // Prevent infinite growth
	private batchSize: number;
	private flushInterval: number;
	private maxRetries: number;
	private baseRetryDelay: number;
	private organizeByDate: boolean;
	private flushTimer?: NodeJS.Timeout;
	private isShuttingDown = false;
	private tempDir: string;
	private uploadInProgress = false;
	private sessionId: string;
	private lastFlushTime: number = 0;
	private uploadFunction: (options: {
		repo: { type: 'dataset'; name: string };
		file: { path: string; content: URL };
		accessToken: string;
		commitTitle: string;
		commitDescription: string;
	}) => Promise<any>;
	// Circuit breaker pattern
	private consecutiveFailures: number = 0;
	private circuitBreakerOpenUntil: number = 0;
	private readonly maxConsecutiveFailures: number = 5;
	private readonly circuitBreakerCooldown: number = 300000; // 5 minutes

	constructor(options: HfDatasetTransportOptions) {
		this.loggingToken = options.loggingToken;
		this.datasetId = options.datasetId;
		this.batchSize = options.batchSize || 100;
		// Enforce minimum 5-minute interval as per HF best practices
		this.flushInterval = Math.max(options.flushInterval || 300000, 300000);
		this.maxRetries = options.maxRetries || 3;
		this.baseRetryDelay = options.baseRetryDelay || 2000;
		this.organizeByDate = options.organizeByDate ?? true;
		this.sessionId = randomUUID();
		this.uploadFunction = options.uploadFunction || uploadFile;

		// Create temporary directory for log files with safety checks
		this.tempDir = join(tmpdir(), 'hf-mcp-logs');
		try {
			if (!existsSync(this.tempDir)) {
				mkdirSync(this.tempDir, { recursive: true, mode: 0o755 });
			}
			// Test write permissions
			const testFile = join(this.tempDir, '.write-test');
			writeFileSync(testFile, 'test');
			unlinkSync(testFile);
		} catch (error) {
			console.error('[HF Dataset Logger] Failed to setup temp directory:', error);
			// Fallback to a different temp location
			this.tempDir = join(tmpdir(), `hf-mcp-logs-${this.sessionId}`);
			mkdirSync(this.tempDir, { recursive: true, mode: 0o755 });
		}

		// Start the flush timer
		this.startFlushTimer();

		// Register shutdown handlers
		this.registerShutdownHandlers();

		// Log initialization
		console.log(`[HF Dataset Logger] Initialized - Dataset: ${this.datasetId}, Session: ${this.sessionId}`);
	}

	processLog(logEntry: LogEntry): void {
		try {
			// Circuit breaker check
			if (this.isCircuitBreakerOpen()) {
				// Silently drop logs when circuit is open
				return;
			}

			// Enforce maximum buffer size to prevent memory issues
			// Consider both logBuffer and retryQueue for total memory usage
			const totalQueuedLogs = this.logBuffer.length + this.retryQueue.length;
			if (totalQueuedLogs >= this.batchSize * 10) {
				// Drop oldest logs if total queued logs are too large
				const targetBufferSize = Math.max(this.batchSize * 3, this.batchSize * 10 - this.retryQueue.length);
				this.logBuffer = this.logBuffer.slice(-targetBufferSize);
			}

			// Add to buffer
			this.logBuffer.push(logEntry);

			// Check if we should flush based on batch size
			if (this.logBuffer.length >= this.batchSize) {
				// Only flush if enough time has passed since last flush
				const timeSinceLastFlush = Date.now() - this.lastFlushTime;
				if (timeSinceLastFlush >= this.flushInterval) {
					void this.flush();
				}
			}
		} catch (error) {
			// Don't let logging errors crash the app
			console.error('[HF Dataset Logger] Error processing log:', error);
		}
	}

	private startFlushTimer(): void {
		this.flushTimer = setInterval(() => {
			if (this.logBuffer.length > 0 || this.retryQueue.length > 0) {
				void this.flush();
			}
		}, this.flushInterval);
	}

	private async flush(): Promise<void> {
		if (this.uploadInProgress) {
			return;
		}

		const allLogs = [...this.retryQueue, ...this.logBuffer];
		if (allLogs.length === 0) {
			return;
		}

		this.uploadInProgress = true;
		this.logBuffer = [];
		this.retryQueue = [];
		this.lastFlushTime = Date.now();

		try {
			await this.attemptUploadWithRetry(allLogs);
		} finally {
			this.uploadInProgress = false;
		}
	}

	private async attemptUploadWithRetry(allLogs: LogEntry[]): Promise<void> {
		for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
			try {
				await this.uploadLogs(allLogs);
				console.log(`[HF Dataset Logger] ✅ Uploaded ${allLogs.length} logs to ${this.datasetId}`);
				this.consecutiveFailures = 0;
				return;
			} catch (error) {
				await this.handleUploadError(error, attempt, allLogs);
			}
		}
	}

	private async handleUploadError(error: unknown, attempt: number, allLogs: LogEntry[]): Promise<void> {
		const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);
		console.error(`[HF Dataset Logger] ❌ Upload attempt ${attempt}/${this.maxRetries + 1} failed:`, error);

		if (attempt <= this.maxRetries) {
			console.log(`[HF Dataset Logger] ⏳ Retrying in ${delay}ms...`);
			await this.sleep(delay);
			return;
		}

		// Max retries reached
		this.consecutiveFailures++;

		if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
			this.openCircuitBreaker();
			return;
		}

		this.addLogsToRetryQueue(allLogs);
	}

	private openCircuitBreaker(): void {
		this.circuitBreakerOpenUntil = Date.now() + this.circuitBreakerCooldown;
		console.error(
			`[HF Dataset Logger] 🔴 Circuit breaker OPEN - dropping logs for ${this.circuitBreakerCooldown / 1000}s`
		);
		this.retryQueue = [];
	}

	private addLogsToRetryQueue(allLogs: LogEntry[]): void {
		console.error('[HF Dataset Logger] 🔴 Max retries reached. Adding logs back to retry queue.');
		// Prioritize newer logs over older ones in retry queue
		const newRetryQueue = [...this.retryQueue, ...allLogs];
		if (newRetryQueue.length > this.maxRetryQueueSize) {
			console.warn(`[HF Dataset Logger] Retry queue exceeds ${this.maxRetryQueueSize}, dropping oldest logs`);
			// Keep the most recent logs (drop oldest)
			this.retryQueue = newRetryQueue.slice(-this.maxRetryQueueSize);
		} else {
			this.retryQueue = newRetryQueue;
		}
	}

	private async uploadLogs(logs: LogEntry[]): Promise<void> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `logs-${timestamp}-${this.sessionId}.jsonl`;

		// Organize by date if enabled
		const dateFolder = this.organizeByDate ? new Date().toISOString().split('T')[0] : '';
		const pathInRepo = dateFolder ? `logs/${dateFolder}/${filename}` : `logs/${filename}`;

		const tempPath = join(this.tempDir, filename);

		try {
			// Create JSONL content with human-readable timestamps
			const logData = logs
				.map((log) => safeStringifyLog(log, this.sessionId))
				.join('\n');

			// Check file size (limit to 10MB per upload)
			const maxFileSize = 10 * 1024 * 1024; // 10MB
			if (Buffer.byteLength(logData) > maxFileSize) {
				throw new Error(`Log batch too large: ${Buffer.byteLength(logData)} bytes`);
			}

			// Write to temporary file
			writeFileSync(tempPath, logData);

			// Upload to HF dataset with timeout
			const uploadTimeout = 30000; // 30 seconds
			await Promise.race([
				this.uploadFunction({
					repo: { type: 'dataset', name: this.datasetId },
					file: {
						path: pathInRepo,
						content: new URL(`file://${tempPath}`),
					},
					accessToken: this.loggingToken,
					commitTitle: `Add ${logs.length} log entries`,
					commitDescription: `Session: ${this.sessionId}, Time: ${new Date().toISOString()}`,
				}),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout')), uploadTimeout)),
			]);
		} finally {
			// Cleanup temp file
			try {
				if (existsSync(tempPath)) {
					unlinkSync(tempPath);
				}
			} catch (cleanupError) {
				console.warn('[HF Dataset Logger] ⚠️ Failed to cleanup temp file:', cleanupError);
			}
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private registerShutdownHandlers(): void {
		const shutdownHandler = async () => {
			await this.destroy();
		};

		// Register handlers for various shutdown signals
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

	async destroy(): Promise<void> {
		if (this.isShuttingDown) return;
		this.isShuttingDown = true;

		console.log('[HF Dataset Logger] Shutting down...');

		// Clear the flush timer
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}

		// Final flush with shorter retry attempts for shutdown
		const originalMaxRetries = this.maxRetries;
		this.maxRetries = 1; // Reduce retries during shutdown
		try {
			await this.flush();
		} catch (error) {
			console.error('[HF Dataset Logger] Error during final log flush:', error);
		} finally {
			this.maxRetries = originalMaxRetries;
		}
	}

	// Circuit breaker check
	private isCircuitBreakerOpen(): boolean {
		if (Date.now() < this.circuitBreakerOpenUntil) {
			return true;
		}
		// Allow circuit breaker to close after cooldown, but don't reset failure count
		// consecutiveFailures will be reset only on successful upload
		if (this.circuitBreakerOpenUntil > 0) {
			this.circuitBreakerOpenUntil = 0;
			console.log('[HF Dataset Logger] Circuit breaker CLOSED - resuming normal operation');
		}
		return false;
	}

	// Health check method
	getStatus(): {
		bufferSize: number;
		retryQueueSize: number;
		uploadInProgress: boolean;
		sessionId: string;
		lastFlushTime: number;
		timeSinceLastFlush: number;
		circuitBreakerOpen: boolean;
		consecutiveFailures: number;
	} {
		return {
			bufferSize: this.logBuffer.length,
			retryQueueSize: this.retryQueue.length,
			uploadInProgress: this.uploadInProgress,
			sessionId: this.sessionId,
			lastFlushTime: this.lastFlushTime,
			timeSinceLastFlush: Date.now() - this.lastFlushTime,
			circuitBreakerOpen: this.isCircuitBreakerOpen(),
			consecutiveFailures: this.consecutiveFailures,
		};
	}
}

interface TransportOptions {
	batchSize?: number;
	flushInterval?: number;
	maxRetries?: number;
	baseRetryDelay?: number;
	organizeByDate?: boolean;
}

// Helper function to create a no-op transport
function createNoOpTransport(reason: string): Transform {
	console.log(`[HF Dataset Logger] Creating no-op transport: ${reason}`);
	return build(function (source) {
		source.on('data', function (_obj: unknown) {
			// No-op
		});
	});
}

// Helper function to parse and validate environment variables
function parseEnvInt(envVar: string, defaultValue: number, min?: number, max?: number): number {
	const value = parseInt(process.env[envVar] || defaultValue.toString(), 10);
	if (isNaN(value)) return defaultValue;
	if (min !== undefined && value < min) return min;
	if (max !== undefined && value > max) return max;
	return value;
}

// Helper function to safely stringify log entries
function safeStringifyLog(log: LogEntry, sessionId: string): string {
	// Handle null/undefined logs
	if (!log || typeof log !== 'object') {
		return safeStringify.default({
			level: 30,
			time: Date.now(),
			timestamp: new Date().toISOString(),
			msg: '[Invalid log entry]',
			sessionId,
		});
	}
	
	const enhancedLog = {
		...log,
		timestamp: new Date(log.time || Date.now()).toISOString(),
		sessionId,
	};
	return safeStringify.default(enhancedLog);
}

// Factory function for Pino transport using pino-abstract-transport
export default async function (opts: TransportOptions = {}): Promise<Transform> {
	// Early returns for no-op cases
	if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
		return createNoOpTransport('disabled during tests');
	}

	if (process.env.LOGGING_EMERGENCY_DISABLE === 'true') {
		console.warn('[HF Dataset Logger] Emergency disable active - all HF logging disabled');
		return createNoOpTransport('emergency disabled');
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
			batchSize: opts.batchSize || parseEnvInt('LOGGING_BATCH_SIZE', 100, 1, 1000),
			flushInterval: opts.flushInterval || parseEnvInt('LOGGING_FLUSH_INTERVAL', 300000, 300000),
			maxRetries: opts.maxRetries || parseEnvInt('LOGGING_MAX_RETRIES', 3, 1, 5),
			baseRetryDelay: opts.baseRetryDelay || parseEnvInt('LOGGING_RETRY_DELAY', 2000, 1000),
			organizeByDate: opts.organizeByDate ?? process.env.LOGGING_ORGANIZE_BY_DATE !== 'false',
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
