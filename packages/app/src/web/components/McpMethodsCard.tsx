import useSWR from 'swr';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import type { TransportMetricsResponse } from '../../shared/transport-metrics.js';

// SWR fetcher function
const fetcher = (url: string) =>
	fetch(url).then((res) => {
		if (!res.ok) {
			throw new Error(`Failed to fetch: ${res.status}`);
		}
		return res.json();
	});

export function McpMethodsCard() {
	// Use SWR for transport metrics with auto-refresh
	const { data: metrics, error } = useSWR<TransportMetricsResponse>('/api/transport-metrics', fetcher, {
		refreshInterval: 3000, // Refresh every 3 seconds
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
	});

	const isLoading = !metrics && !error;
	const isStdioMode = metrics?.transport === 'stdio';

	// Sort methods by call count (descending)
	const sortedMethods = metrics?.methods?.sort((a, b) => b.count - a.count) || [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>HTTP JSON Transport Statistics</CardTitle>
				<CardDescription>
					MCP method call statistics and performance metrics
					{isStdioMode && ' (Empty in STDIO mode)'}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading && (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-muted-foreground">Loading metrics...</div>
					</div>
				)}

				{error && (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-destructive">Error loading metrics: {error.message}</div>
					</div>
				)}

				{isStdioMode && (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-muted-foreground">
							Method tracking is not available in STDIO mode. This data is only collected for HTTP-based transports.
						</div>
					</div>
				)}

				{metrics && !isStdioMode && sortedMethods.length === 0 && (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-muted-foreground">No method calls recorded yet.</div>
					</div>
				)}

				{metrics && !isStdioMode && sortedMethods.length > 0 && (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div className="text-sm text-muted-foreground">
								Showing {sortedMethods.length} method{sortedMethods.length !== 1 ? 's' : ''} tracked since{' '}
								{new Date(metrics.startupTime).toLocaleString()}
							</div>
							<div className="text-sm font-medium">
								Total MCP Calls: <span className="font-mono">{sortedMethods.reduce((sum, method) => sum + method.count, 0).toLocaleString()}</span>
							</div>
						</div>

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Method</TableHead>
									<TableHead className="text-right">Calls</TableHead>
									<TableHead className="text-right">Errors</TableHead>
									<TableHead className="text-right">Error Rate</TableHead>
									<TableHead className="text-right">Avg Response</TableHead>
									<TableHead className="text-right">Last Called</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{sortedMethods.map((method) => (
									<TableRow key={method.method}>
										<TableCell className="font-mono text-sm">
											{method.method === 'tools/call' ? (
												<span className="text-blue-600 dark:text-blue-400">tools/call</span>
											) : method.method.startsWith('tools/call:') ? (
												<>
													<span className="text-blue-600 dark:text-blue-400">tools/call:</span>
													<span className="text-green-600 dark:text-green-400">
														{method.method.replace('tools/call:', '')}
													</span>
												</>
											) : (
												method.method
											)}
										</TableCell>
										<TableCell className="text-right font-mono">{method.count.toLocaleString()}</TableCell>
										<TableCell className="text-right font-mono">
											{method.errors > 0 ? (
												<span className="text-red-600 dark:text-red-400">{method.errors}</span>
											) : (
												'0'
											)}
										</TableCell>
										<TableCell className="text-right font-mono">
											{method.errorRate > 0 ? (
												<span className="text-red-600 dark:text-red-400">{method.errorRate.toFixed(1)}%</span>
											) : (
												'0%'
											)}
										</TableCell>
										<TableCell className="text-right font-mono">
											{method.averageResponseTime ? `${method.averageResponseTime.toFixed(0)}ms` : '—'}
										</TableCell>
										<TableCell className="text-right text-sm text-muted-foreground">
											{new Date(method.lastCalled).toLocaleTimeString()}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}