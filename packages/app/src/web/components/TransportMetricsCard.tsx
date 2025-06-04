import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import type { TransportMetricsResponse } from '../../shared/transport-metrics.js';

// SWR fetcher function
const fetcher = (url: string) =>
	fetch(url).then((res) => {
		if (!res.ok) {
			throw new Error(`Failed to fetch: ${res.status}`);
		}
		return res.json();
	});

/**
 * Format relative time (e.g., "5m ago", "2h ago", "just now")
 */
function formatRelativeTime(timestamp: string): string {
	const now = new Date();
	const time = new Date(timestamp);
	const diffMs = now.getTime() - time.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);

	if (diffSeconds < 60) return 'just now';
	
	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	
	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
}

/**
 * Format uptime duration
 */
function formatUptime(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

/**
 * Format milliseconds to readable duration
 */
function formatMilliseconds(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format connection display for client
 */
function formatConnectionDisplay(active: number, total: number, isConnected: boolean, isStateless: boolean = false): string {
	const emoji = isConnected ? '🟢' : '🔴';
	if (isStateless) {
		// For stateless mode, just show total requests count
		return `${total} requests ${emoji}`;
	}
	return `${active}/${total} ${emoji}`;
}

export function TransportMetricsCard() {
	// Use SWR for metrics with auto-refresh every 3 seconds
	const { data: metrics, error } = useSWR<TransportMetricsResponse>(
		'/api/transport-metrics', 
		fetcher, 
		{
			refreshInterval: 3000,
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
		}
	);

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-red-600">⚠️ Transport Metrics Error</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-red-600">Failed to load transport metrics: {error.message}</p>
				</CardContent>
			</Card>
		);
	}

	if (!metrics) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>📊 Transport Metrics</CardTitle>
					<CardDescription>Loading transport metrics...</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="animate-pulse space-y-2">
						<div className="h-4 bg-gray-200 rounded w-3/4"></div>
						<div className="h-4 bg-gray-200 rounded w-1/2"></div>
						<div className="h-4 bg-gray-200 rounded w-2/3"></div>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Sort clients by connection status (connected first), then by last seen time, then by request count
	const sortedClients = [...metrics.clients].sort((a, b) => {
		// Connected clients first
		if (a.isConnected !== b.isConnected) {
			return b.isConnected ? 1 : -1;
		}
		
		// Then by most recent activity
		const aTime = new Date(a.lastSeen).getTime();
		const bTime = new Date(b.lastSeen).getTime();
		if (aTime !== bTime) {
			return bTime - aTime;
		}
		
		// Finally by request count
		return b.requestCount - a.requestCount;
	});

	const transportTypeDisplay = {
		stdio: 'STDIO',
		sse: 'Server-Sent Events',
		streamableHttp: 'Streamable HTTP',
		streamableHttpJson: 'Stateless HTTP JSON'
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>📊 Transport Metrics</CardTitle>
				<CardDescription>
					Real-time connection and performance metrics for {transportTypeDisplay[metrics.transport] || metrics.transport} transport
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Transport Info */}
				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-sm font-medium text-gray-600">Transport Type</p>
						<p className="text-lg font-mono">
							{transportTypeDisplay[metrics.transport] || metrics.transport}
							{metrics.isStateless && <span className="text-xs text-gray-500 ml-2">(stateless)</span>}
						</p>
					</div>
					<div>
						<p className="text-sm font-medium text-gray-600">Uptime</p>
						<p className="text-lg font-mono">{formatUptime(metrics.uptimeSeconds)}</p>
						<p className="text-xs text-gray-500">
							Started {formatRelativeTime(metrics.startupTime)}
						</p>
					</div>
				</div>

				{/* Configuration Settings */}
				{metrics.configuration && (
					<div>
						<h3 className="text-sm font-semibold text-gray-700 mb-3">Configuration</h3>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-sm font-medium text-gray-600">Stale Check Interval</p>
								<p className="text-lg font-mono text-blue-600">
									{formatMilliseconds(metrics.configuration.staleCheckInterval)}
								</p>
							</div>
							<div>
								<p className="text-sm font-medium text-gray-600">Stale Timeout</p>
								<p className="text-lg font-mono text-orange-600">
									{formatMilliseconds(metrics.configuration.staleTimeout)}
								</p>
							</div>
						</div>
						<p className="text-xs text-gray-500 mt-2">
							Sessions are checked every {formatMilliseconds(metrics.configuration.staleCheckInterval)} and removed after {formatMilliseconds(metrics.configuration.staleTimeout)} of inactivity
						</p>
					</div>
				)}

				{/* Connection Metrics */}
				<div>
					<h3 className="text-sm font-semibold text-gray-700 mb-3">Connection Statistics</h3>
					<div className="grid grid-cols-3 gap-4">
						<div>
							<p className="text-sm font-medium text-gray-600">Active</p>
							<p className="text-2xl font-bold text-green-600">
								{metrics.connections.active === 'stateless' ? 'N/A' : metrics.connections.active}
							</p>
						</div>
						<div>
							<p className="text-sm font-medium text-gray-600">Total</p>
							<p className="text-2xl font-bold text-blue-600">{metrics.connections.total}</p>
						</div>
						{metrics.connections.cleaned !== undefined && (
							<div>
								<p className="text-sm font-medium text-gray-600">Cleaned</p>
								<p className="text-2xl font-bold text-gray-600">{metrics.connections.cleaned}</p>
							</div>
						)}
					</div>
				</div>

				{/* Request Metrics */}
				<div>
					<h3 className="text-sm font-semibold text-gray-700 mb-3">Request Statistics</h3>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="text-sm font-medium text-gray-600">Total Requests</p>
							<p className="text-2xl font-bold text-blue-600">{metrics.requests.total}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-gray-600">Avg per Minute</p>
							<p className="text-2xl font-bold text-purple-600">{metrics.requests.averagePerMinute}</p>
						</div>
					</div>
				</div>

				{/* Error Metrics */}
				<div>
					<h3 className="text-sm font-semibold text-gray-700 mb-3">Error Statistics</h3>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="text-sm font-medium text-gray-600">Expected Errors (4xx)</p>
							<p className="text-2xl font-bold text-yellow-600">{metrics.errors.expected}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-gray-600">Unexpected Errors (5xx)</p>
							<p className="text-2xl font-bold text-red-600">{metrics.errors.unexpected}</p>
						</div>
					</div>
					{metrics.errors.lastError && (
						<div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
							<p className="text-sm font-medium text-red-700">Last Error:</p>
							<p className="text-sm text-red-600 font-mono">{metrics.errors.lastError.type}: {metrics.errors.lastError.message}</p>
							<p className="text-xs text-red-500">{formatRelativeTime(metrics.errors.lastError.timestamp)}</p>
						</div>
					)}
				</div>

				{/* Client Identities */}
				{sortedClients.length > 0 && (
					<div>
						<h3 className="text-sm font-semibold text-gray-700 mb-3">Client Identities</h3>
						<div className="space-y-2">
							{sortedClients.map((client) => (
								<div key={`${client.name}@${client.version}`} className="flex justify-between items-center p-3 bg-gray-50 rounded">
									<div>
										<p className="font-medium font-mono">{client.name}@{client.version}</p>
										<p className="text-sm text-gray-600">
											{client.requestCount} requests • First seen {formatRelativeTime(client.firstSeen)}
										</p>
									</div>
									<div className="text-right">
										<p className="font-medium">
											{formatConnectionDisplay(client.activeConnections, client.totalConnections, client.isConnected, metrics.isStateless)}
										</p>
										<p className="text-xs text-gray-500">
											Last seen {formatRelativeTime(client.lastSeen)}
										</p>
									</div>
								</div>
							))}
						</div>
						{sortedClients.length === 0 && (
							<p className="text-sm text-gray-500 italic">No client identities reported yet</p>
						)}
					</div>
				)}

				<div className="text-xs text-gray-400 text-center pt-4 border-t">
					Metrics update every 3 seconds • Times are relative to current time
				</div>
			</CardContent>
		</Card>
	);
}