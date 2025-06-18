/**
 * Gradio metrics tracking module
 * 
 * This module collects metrics for Gradio tool calls, tracking successful
 * and failed tool executions to provide visibility into the performance
 * of Gradio endpoints.
 */

export interface GradioToolMetrics {
	/** Number of successful tool calls */
	success: number;
	/** Number of failed tool calls (including isError results and exceptions) */
	failure: number;
	/** Breakdown by tool name */
	byTool: Record<string, { success: number; failure: number }>;
}

export class GradioMetricsCollector {
	private static instance: GradioMetricsCollector;
	private metrics: GradioToolMetrics = {
		success: 0,
		failure: 0,
		byTool: {},
	};

	private constructor() {}

	public static getInstance(): GradioMetricsCollector {
		if (!GradioMetricsCollector.instance) {
			GradioMetricsCollector.instance = new GradioMetricsCollector();
		}
		return GradioMetricsCollector.instance;
	}

	/**
	 * Records a successful Gradio tool call
	 * @param toolName The name of the tool that was called
	 */
	public recordSuccess(toolName: string): void {
		// Update overall metrics
		this.metrics.success++;

		// Initialize tool-specific metrics if needed
		if (!this.metrics.byTool[toolName]) {
			this.metrics.byTool[toolName] = { success: 0, failure: 0 };
		}

		// Update tool-specific metrics
		this.metrics.byTool[toolName].success++;
	}

	/**
	 * Records a failed Gradio tool call
	 * @param toolName The name of the tool that was called
	 */
	public recordFailure(toolName: string): void {
		// Update overall metrics
		this.metrics.failure++;

		// Initialize tool-specific metrics if needed
		if (!this.metrics.byTool[toolName]) {
			this.metrics.byTool[toolName] = { success: 0, failure: 0 };
		}

		// Update tool-specific metrics
		this.metrics.byTool[toolName].failure++;
	}

	/**
	 * Returns the current metrics
	 */
	public getMetrics(): Readonly<GradioToolMetrics> {
		return { ...this.metrics, byTool: { ...this.metrics.byTool } };
	}

	/**
	 * Resets all metrics to zero
	 */
	public reset(): void {
		this.metrics = {
			success: 0,
			failure: 0,
			byTool: {},
		};
	}

	/**
	 * Get a summary of the metrics suitable for logging or display
	 */
	public getSummary(): string {
		const total = this.metrics.success + this.metrics.failure;
		const successRate = total > 0 ? ((this.metrics.success / total) * 100).toFixed(1) : '0.0';
		return `Gradio Tool Calls - Total: ${total}, Success: ${this.metrics.success}, Failure: ${this.metrics.failure}, Success Rate: ${successRate}%`;
	}
}

// Export singleton instance
export const gradioMetrics = GradioMetricsCollector.getInstance();