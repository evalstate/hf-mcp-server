import { pino, type Logger, multistream } from 'pino';
import type { LoggerOptions, Level } from 'pino';
import type { StreamEntry } from 'pino';

const isDev = process.env.NODE_ENV === 'development';
const activeTransport = process.env.TRANSPORT || '';

const destination = activeTransport.toUpperCase() === 'STDIO' ? 2 : 1; // 2 = stderr, 1 = stdout

const logLevel = (process.env.LOG_LEVEL || 'info') as Level;
const hfLoggingEnabled = !!process.env.LOGGING_DATASET_ID;

function createLogger(): Logger {
	const baseOptions: LoggerOptions = {
		level: logLevel,
		...(!isDev && { timestamp: pino.stdTimeFunctions.isoTime }),
	};

	// Try to setup HF logging if enabled
	if (hfLoggingEnabled) {
		try {
			const streams: StreamEntry[] = [
				// Console stream
				{
					level: logLevel,
					stream: isDev
						? pino.transport({
								target: 'pino-pretty',
								options: {
									colorize: true,
									destination,
								},
							})
						: pino.destination(destination),
				},
				// HF dataset stream
				{
					level: logLevel,
					stream: pino.transport({
						target: './hf-dataset-transport.js',
						options: {
							sync: false,
							ignoreErrors: true,
						},
					}),
				},
			];
			return pino(baseOptions, multistream(streams));
		} catch (error) {
			console.warn('[Logger] Failed to setup HF transport, falling back to console only:', error);
			// Fall through to console-only setup
		}
	}

	// Console-only logging (default or fallback)
	if (isDev) {
		return pino({
			...baseOptions,
			transport: {
				target: 'pino-pretty',
				options: {
					colorize: true,
					destination,
				},
			},
		});
	} else {
		return pino(baseOptions, pino.destination(destination));
	}
}

const logger: Logger = createLogger();

// Function to reconfigure logger for STDIO transport
export function forceLoggerToStderr(): void {
	const stderrOptions: LoggerOptions = {
		level: logLevel,
		...(!isDev && { timestamp: pino.stdTimeFunctions.isoTime }),
	};

	if (isDev) {
		// Development: use pretty printing to stderr
		Object.assign(
			logger,
			pino({
				...stderrOptions,
				transport: {
					target: 'pino-pretty',
					options: {
						colorize: true,
						destination: 2, // stderr
					},
				},
			})
		);
	} else {
		// Production: plain output to stderr
		Object.assign(logger, pino(stderrOptions, pino.destination(2)));
	}
}

export { logger };
