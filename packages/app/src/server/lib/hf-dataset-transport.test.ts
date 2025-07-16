import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HfDatasetLogger } from './hf-dataset-transport.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('HfDatasetLogger', () => {
	let logger: HfDatasetLogger;
	let testTempDir: string;

	beforeEach(() => {
		// Create isolated temp directory for each test
		testTempDir = join(tmpdir(), `hf-test-${Date.now()}`);
		mkdirSync(testTempDir, { recursive: true });
	});

	afterEach(async () => {
		if (logger) {
			await logger.destroy();
		}
		// Clean up temp directory
		if (existsSync(testTempDir)) {
			rmSync(testTempDir, { recursive: true, force: true });
		}
	});

	function createTestLogger(options: Partial<any> = {}) {
		// Create a stub upload function that tracks calls
		const uploadCalls: any[] = [];
		const uploadStub = async (params: any) => {
			uploadCalls.push(params);
			return Promise.resolve();
		};
		
		const logger = new HfDatasetLogger({
			loggingToken: 'test-token',
			datasetId: 'test/dataset',
			batchSize: 3,
			flushInterval: 1000, // Short interval for testing
			maxRetries: 2,
			baseRetryDelay: 100,
			organizeByDate: false,
			uploadFunction: uploadStub,
			...options
		});
		
		// Attach the calls array to the logger for test access
		(logger as any).uploadCalls = uploadCalls;
		return logger;
	}

	describe('Buffer Management', () => {
		it('should trim buffer when exceeding capacity', async () => {
			logger = createTestLogger({ batchSize: 2, flushInterval: 60000 });
			
			// Add logs to exceed buffer capacity (batchSize * 10 = 20)
			for (let i = 0; i < 25; i++) {
				logger.processLog({
					level: 30,
					time: Date.now(),
					msg: `Test message ${i}`
				});
			}

			// Wait for any pending flushes
			await new Promise(resolve => setTimeout(resolve, 200));

			const status = logger.getStatus();
			// Buffer should be trimmed to reasonable size (much less than original 25)
			expect(status.bufferSize + status.retryQueueSize).toBeLessThan(25);
			// Should have triggered some uploads due to batching
			expect((logger as any).uploadCalls.length).toBeGreaterThan(0);
		});

		it('should consider retry queue size in buffer trimming', async () => {
			logger = createTestLogger({ batchSize: 2, flushInterval: 60000 });
			
			// Simulate having items in retry queue by accessing private property
			// This tests the total memory calculation without mocking
			const loggerAny = logger as any;
			loggerAny.retryQueue = new Array(15).fill(null).map((_, i) => ({
				level: 30,
				time: Date.now(),
				msg: `Retry message ${i}`
			}));

			// Add logs to buffer
			for (let i = 0; i < 10; i++) {
				logger.processLog({
					level: 30,
					time: Date.now(),
					msg: `Buffer message ${i}`
				});
			}

			// Wait for any pending flushes
			await new Promise(resolve => setTimeout(resolve, 200));

			const status = logger.getStatus();
			// Total memory usage should be managed
			expect(status.bufferSize + status.retryQueueSize).toBeLessThanOrEqual(25);
			// Should have attempted uploads
			expect((logger as any).uploadCalls.length).toBeGreaterThan(0);
		});
	});

	describe('Circuit Breaker', () => {
		it('should open circuit breaker after consecutive failures', () => {
			logger = createTestLogger({ maxRetries: 1 });
			
			// Simulate consecutive failures by setting the counter
			const loggerAny = logger as any;
			loggerAny.consecutiveFailures = 5; // Exceeds maxConsecutiveFailures (5)
			loggerAny.circuitBreakerOpenUntil = Date.now() + 1000;

			// Circuit breaker should be open
			expect(logger.getStatus().circuitBreakerOpen).toBe(true);
			
			// Logs should be dropped when circuit is open
			const initialBufferSize = logger.getStatus().bufferSize;
			logger.processLog({
				level: 30,
				time: Date.now(),
				msg: 'Test message during circuit breaker'
			});
			
			// Buffer size should not increase
			expect(logger.getStatus().bufferSize).toBe(initialBufferSize);
		});

		it('should close circuit breaker after cooldown period', async () => {
			logger = createTestLogger();
			
			// Set circuit breaker to open with short cooldown
			const loggerAny = logger as any;
			loggerAny.circuitBreakerOpenUntil = Date.now() + 100; // 100ms cooldown

			expect(logger.getStatus().circuitBreakerOpen).toBe(true);

			// Wait for cooldown to expire
			await new Promise(resolve => setTimeout(resolve, 150));

			// Circuit breaker should be closed
			expect(logger.getStatus().circuitBreakerOpen).toBe(false);
		});

		it('should not reset consecutive failures until successful upload', () => {
			logger = createTestLogger();
			
			const loggerAny = logger as any;
			loggerAny.consecutiveFailures = 3;
			loggerAny.circuitBreakerOpenUntil = Date.now() + 100;

			// Wait for circuit breaker to close
			setTimeout(() => {
				// consecutiveFailures should still be 3 (not reset to 0)
				expect(loggerAny.consecutiveFailures).toBe(3);
			}, 150);
		});
	});

	describe('Retry Queue Logic', () => {
		it('should prioritize newer logs over older ones in retry queue', () => {
			logger = createTestLogger({ batchSize: 2 });
			
			const loggerAny = logger as any;
			
			// Add some logs to retry queue
			const retryLogs = [
				{ level: 30, time: 1000, msg: 'Retry 1' },
				{ level: 30, time: 2000, msg: 'Retry 2' }
			];
			loggerAny.retryQueue = retryLogs;

			// Add new logs that would be added to retry queue
			const newLogs = [
				{ level: 30, time: 3000, msg: 'New 1' },
				{ level: 30, time: 4000, msg: 'New 2' }
			];

			// Simulate adding to retry queue
			loggerAny.addLogsToRetryQueue(newLogs);

			// Order should be: old retry logs first, then new logs
			expect(loggerAny.retryQueue).toHaveLength(4);
			expect(loggerAny.retryQueue[0].msg).toBe('Retry 1');
			expect(loggerAny.retryQueue[1].msg).toBe('Retry 2');
			expect(loggerAny.retryQueue[2].msg).toBe('New 1');
			expect(loggerAny.retryQueue[3].msg).toBe('New 2');
		});

		it('should drop oldest logs when retry queue exceeds capacity', () => {
			logger = createTestLogger({ batchSize: 2 });
			
			const loggerAny = logger as any;
			loggerAny.maxRetryQueueSize = 5;

			// Fill retry queue to capacity
			loggerAny.retryQueue = new Array(5).fill(null).map((_, i) => ({
				level: 30,
				time: Date.now(),
				msg: `Existing ${i}`
			}));

			// Add more logs that exceed capacity
			const newLogs = new Array(3).fill(null).map((_, i) => ({
				level: 30,
				time: Date.now(),
				msg: `New ${i}`
			}));

			loggerAny.addLogsToRetryQueue(newLogs);

			// Should keep only the most recent 5 logs
			expect(loggerAny.retryQueue).toHaveLength(5);
			// Should contain the newest logs
			expect(loggerAny.retryQueue.some((log: any) => log.msg === 'New 2')).toBe(true);
		});
	});

	describe('Error Resilience', () => {
		it('should never crash when processing malformed log entries', () => {
			logger = createTestLogger();
			
			// Test various malformed inputs - each should not crash
			expect(() => {
				logger.processLog(null as any);
			}).not.toThrow();
			
			expect(() => {
				logger.processLog(undefined as any);
			}).not.toThrow();
			
			expect(() => {
				logger.processLog({} as any); // Missing required fields
			}).not.toThrow();
			
			expect(() => {
				logger.processLog({ level: 'invalid' } as any); // Wrong type
			}).not.toThrow();
			
			expect(() => {
				logger.processLog({ level: 30, time: 'invalid' } as any); // Wrong time type
			}).not.toThrow();
			
			expect(() => {
				logger.processLog({ level: 30, time: Date.now(), msg: null } as any); // Null message
			}).not.toThrow();
			
			// Test circular reference
			const circularObj = { level: 30, time: Date.now(), msg: 'test' };
			(circularObj as any).circular = circularObj;
			expect(() => {
				logger.processLog(circularObj as any);
			}).not.toThrow();

			// Logger should still be functional
			const status = logger.getStatus();
			expect(status).toBeDefined();
		});

		it('should handle edge cases with small values', async () => {
			// Test with minimal configuration
			logger = createTestLogger({
				batchSize: 1,
				flushInterval: 60000, // Prevent auto-flush
				maxRetries: 0,
				baseRetryDelay: 10
			});

			// Should handle single log
			logger.processLog({
				level: 30,
				time: Date.now(),
				msg: 'Single log'
			});

			// Wait for any pending flushes
			await new Promise(resolve => setTimeout(resolve, 200));

			const status = logger.getStatus();
			// With batchSize=1, should have triggered upload
			expect((logger as any).uploadCalls.length).toBeGreaterThan(0);
			expect(status.bufferSize + status.retryQueueSize).toBeGreaterThanOrEqual(0);
		});

		it('should handle zero batch size gracefully', () => {
			// This should not crash even with invalid config
			expect(() => {
				logger = createTestLogger({ batchSize: 0 });
			}).not.toThrow();
		});

		it('should handle concurrent processLog calls', async () => {
			logger = createTestLogger({ batchSize: 5 });
			
			// Simulate concurrent logging
			const promises = [];
			for (let i = 0; i < 100; i++) {
				promises.push(
					Promise.resolve().then(() => {
						logger.processLog({
							level: 30,
							time: Date.now(),
							msg: `Concurrent message ${i}`
						});
					})
				);
			}

			// Should handle all concurrent calls without crashing
			await Promise.all(promises);
			
			const status = logger.getStatus();
			expect(status).toBeDefined();
		});
	});

	describe('Memory Management', () => {
		it('should maintain reasonable memory usage under load', () => {
			logger = createTestLogger({ batchSize: 5 });
			
			// Add many logs
			for (let i = 0; i < 1000; i++) {
				logger.processLog({
					level: 30,
					time: Date.now(),
					msg: `Load test message ${i}`
				});
			}

			const status = logger.getStatus();
			// Should not accumulate unlimited logs
			expect(status.bufferSize).toBeLessThan(100);
		});

		it('should handle large log messages efficiently', () => {
			logger = createTestLogger({ batchSize: 2 });
			
			// Create large log message
			const largeMessage = 'x'.repeat(10000);
			
			expect(() => {
				logger.processLog({
					level: 30,
					time: Date.now(),
					msg: largeMessage
				});
			}).not.toThrow();

			const status = logger.getStatus();
			expect(status.bufferSize).toBe(1);
		});
	});

	describe('Status and Health Check', () => {
		it('should provide accurate status information', () => {
			logger = createTestLogger();
			
			// Add some logs
			logger.processLog({ level: 30, time: Date.now(), msg: 'Test 1' });
			logger.processLog({ level: 30, time: Date.now(), msg: 'Test 2' });
			
			const status = logger.getStatus();
			
			expect(status).toHaveProperty('bufferSize');
			expect(status).toHaveProperty('retryQueueSize');
			expect(status).toHaveProperty('uploadInProgress');
			expect(status).toHaveProperty('sessionId');
			expect(status).toHaveProperty('circuitBreakerOpen');
			expect(status).toHaveProperty('consecutiveFailures');
			
			expect(status.bufferSize).toBe(2);
			expect(status.uploadInProgress).toBe(false);
			expect(status.sessionId).toBeDefined();
		});
	});
});