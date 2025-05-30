import { pino } from 'pino';
import type { LoggerOptions } from 'pino';

const isDev = process.env.NODE_ENV === 'development';
const activeTransport = process.env.TRANSPORT || 'HTTP';

// Handle destination based on transport type
const destination = activeTransport === 'STDIO' ? 2 : 1; // 2 = stderr, 1 = stdout

let logger;

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

export { logger };
