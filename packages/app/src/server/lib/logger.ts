import { pino, type Logger } from 'pino';
import type { LoggerOptions } from 'pino';

const isDev = process.env.NODE_ENV === 'development';
const activeTransport = process.env.TRANSPORT || '';

// Handle destination based on transport type
const destination = activeTransport.toUpperCase() === 'STDIO' ? 2 : 1; // 2 = stderr, 1 = stdout

let logger: Logger;

if (isDev) {
	// Development: use pretty printing
	const options: LoggerOptions = {
		level: process.env.LOG_LEVEL || 'info',
		transport: {
			target: 'pino-pretty',
			options: {
				colorize: true,
				destination,
			},
		},
	};
	logger = pino(options);
} else {
	// Production: plain output
	logger = pino(
		{
			level: process.env.LOG_LEVEL || 'info',
		},
		pino.destination(destination)
	);
}

// Function to reconfigure logger for STDIO transport
export function forceLoggerToStderr(): void {
	const isDev = process.env.NODE_ENV === 'development';
	const level = process.env.LOG_LEVEL || 'info';

	if (isDev) {
		// Development: use pretty printing to stderr
		const options: LoggerOptions = {
			level,
			transport: {
				target: 'pino-pretty',
				options: {
					colorize: true,
					destination: 2, // stderr
				},
			},
		};
		Object.assign(logger, pino(options));
	} else {
		// Production: plain output to stderr
		Object.assign(logger, pino({ level }, pino.destination(2)));
	}
}

export { logger };
