import useSWR from 'swr';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Separator } from './ui/separator';
import { Table, TableBody, TableCell, TableRow } from './ui/table';
import { AlertTriangle, Activity, Wifi, WifiOff, Clock } from 'lucide-react';
import { DataTable } from './data-table';
import { createSortableHeader } from './data-table-utils';
import type { TransportMetricsResponse } from '../../shared/transport-metrics.js';

// SWR fetcher function
const fetcher = (url: string) =>
	fetch(url).then((res) => {
		if (!res.ok) {
			throw new Error(`Failed to fetch: ${res.status}`);
		}
		return res.json();
	});

type ClientData = {
	name: string;
	version: string;
	requestCount: number;
	activeConnections: number;
	totalConnections: number;
	isConnected: boolean;
	lastSeen: string;
	firstSeen: string;
};

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
 * Get connection status badge variant
 */
function getConnectionBadgeVariant(isConnected: boolean): 'success' | 'secondary' {
	return isConnected ? 'success' : 'secondary';
}

/**
 * Check if client was seen recently (within last 5 minutes)
 */
function isRecentlyActive(lastSeen: string): boolean {
	const now = new Date();
	const lastSeenTime = new Date(lastSeen);
	const diffMs = now.getTime() - lastSeenTime.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	return diffMinutes < 5;
}

/**
 * Format connection display for client
 */
function formatConnectionDisplay(active: number, total: number, isStateless: boolean = false): string {
	if (isStateless) {
		return '-';
	}
	return `${active}/${total}`;
}

export function TransportMetricsCard() {
	// Use SWR for metrics with auto-refresh every 3 seconds
	const { data: metrics, error } = useSWR<TransportMetricsResponse>('/api/transport-metrics', fetcher, {
		refreshInterval: 3000,
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
	});

	// Define columns for the client identities table
	const createClientColumns = (isStateless: boolean): ColumnDef<ClientData>[] => [
		{
			accessorKey: "name",
			header: createSortableHeader("Client"),
			cell: ({ row }) => {
				const client = row.original;
				return (
					<div>
						<p className="font-medium font-mono text-sm">
							{client.name}@{client.version}
						</p>
						<p className="text-xs text-muted-foreground">
							First seen {formatRelativeTime(client.firstSeen)}
						</p>
					</div>
				);
			},
		},
		{
			accessorKey: "requestCount",
			header: createSortableHeader("Request Count", "right"),
			cell: ({ row }) => (
				<div className="text-right font-mono text-sm">{row.getValue<number>("requestCount")}</div>
			),
		},
		{
			accessorKey: "activeConnections",
			header: createSortableHeader("Connections", "right"),
			cell: ({ row }) => {
				const client = row.original;
				return (
					<div className="text-right font-mono text-sm">
						{formatConnectionDisplay(
							client.activeConnections,
							client.totalConnections,
							isStateless
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "isConnected",
			header: createSortableHeader("Status"),
			cell: ({ row }) => {
				const client = row.original;
				return (
					<div>
						{isStateless ? (
							isRecentlyActive(client.lastSeen) ? (
								<Badge variant="success" className="gap-1">
									<Activity className="h-3 w-3" />
									Recent
								</Badge>
							) : (
								<Badge variant="secondary" className="gap-1">
									<Clock className="h-3 w-3" />
									Idle
								</Badge>
							)
						) : (
							<Badge variant={getConnectionBadgeVariant(client.isConnected)} className="gap-1">
								{client.isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
								{client.isConnected ? 'Connected' : 'Disconnected'}
							</Badge>
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "lastSeen",
			header: createSortableHeader("Last Seen", "right"),
			cell: ({ row }) => (
				<div className="text-right text-sm text-muted-foreground">
					{formatRelativeTime(row.getValue<string>("lastSeen"))}
				</div>
			),
		},
	];

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>📊 Transport Metrics</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Error Loading Metrics</AlertTitle>
						<AlertDescription>Failed to load transport metrics: {error.message}</AlertDescription>
					</Alert>
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

	const clientData = metrics.clients;

	const transportTypeDisplay = {
		stdio: 'STDIO',
		sse: 'Server-Sent Events',
		streamableHttp: 'Streamable HTTP',
		streamableHttpJson: 'Stateless HTTP JSON',
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>📊 Transport Metrics</CardTitle>
				<CardDescription>
					Real-time connection and performance metrics for{' '}
					{transportTypeDisplay[metrics.transport] || metrics.transport} transport
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Transport Info */}
				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-sm font-medium text-muted-foreground">Transport Type</p>
						<div className="flex items-center gap-2">
							<p className="text-sm font-mono">{transportTypeDisplay[metrics.transport] || metrics.transport}</p>
							{metrics.isStateless && <Badge variant="secondary">stateless</Badge>}
						</div>
					</div>
					<div>
						<p className="text-sm font-medium text-muted-foreground">Uptime</p>
						<p className="text-sm font-mono">{formatUptime(metrics.uptimeSeconds)}</p>
					</div>
				</div>

				{/* Configuration Settings */}
				{metrics.configuration && (
					<>
						<Separator />
						<div>
							<h3 className="text-sm font-semibold text-foreground mb-3">Configuration</h3>
							<div className="grid grid-cols-3 gap-4">
								<div>
									<p className="text-sm font-medium text-muted-foreground">Heartbeat</p>
									<p className="text-sm font-mono">{formatMilliseconds(metrics.configuration.heartbeatInterval || 30000)}</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">Stale Check</p>
									<p className="text-sm font-mono">{formatMilliseconds(metrics.configuration.staleCheckInterval)}</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">Stale Timeout</p>
									<p className="text-sm font-mono">{formatMilliseconds(metrics.configuration.staleTimeout)}</p>
								</div>
								{metrics.configuration.pingEnabled !== undefined && (
									<>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Ping Keep-Alive</p>
											<p className="text-sm font-mono">{metrics.configuration.pingEnabled ? 'Enabled' : 'Disabled'}</p>
										</div>
										{metrics.configuration.pingEnabled && metrics.configuration.pingInterval && (
											<div>
												<p className="text-sm font-medium text-muted-foreground">Ping Interval</p>
												<p className="text-sm font-mono">{formatMilliseconds(metrics.configuration.pingInterval)}</p>
											</div>
										)}
									</>
								)}
							</div>
							<p className="text-xs text-muted-foreground mt-2">
								SSE connections checked every {formatMilliseconds(metrics.configuration.heartbeatInterval || 30000)}, 
								sessions swept every {formatMilliseconds(metrics.configuration.staleCheckInterval)}, 
								removed after {formatMilliseconds(metrics.configuration.staleTimeout)} inactive
								{metrics.configuration.pingEnabled && metrics.configuration.pingInterval && 
									`, pings sent every ${formatMilliseconds(metrics.configuration.pingInterval)}`}
							</p>
						</div>
					</>
				)}

				<Separator />

				{/* Metrics Table */}
				<div>
					<Table>
						<TableBody>
							{!metrics.isStateless && (
								<TableRow>
									<TableCell className="font-medium text-sm">Active Connections</TableCell>
									<TableCell className="text-sm font-mono">{metrics.connections.active}</TableCell>
								</TableRow>
							)}
							<TableRow>
								<TableCell className="font-medium text-sm">
									{metrics.isStateless ? 'Request Count (HTTP)' : 'Total Connections'}
								</TableCell>
								<TableCell className="text-sm font-mono">{metrics.connections.total}</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium text-sm">Cleaned Sessions</TableCell>
								<TableCell className="text-sm font-mono">{metrics.connections.cleaned ?? 0}</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium text-sm">Requests per Minute</TableCell>
								<TableCell className="text-sm font-mono">{metrics.requests.averagePerMinute}</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium text-sm">Client Errors (4xx)</TableCell>
								<TableCell className="text-sm font-mono">{metrics.errors.expected}</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium text-sm">Server Errors (5xx)</TableCell>
								<TableCell className="text-sm font-mono">{metrics.errors.unexpected}</TableCell>
							</TableRow>
							{metrics.pings && (
								<>
									<TableRow>
										<TableCell className="font-medium text-sm">Pings Sent</TableCell>
										<TableCell className="text-sm font-mono">{metrics.pings.sent}</TableCell>
									</TableRow>
									<TableRow>
										<TableCell className="font-medium text-sm">Ping Success Rate</TableCell>
										<TableCell className="text-sm font-mono">
											{metrics.pings.sent > 0 
												? `${Math.round((metrics.pings.successful / metrics.pings.sent) * 100)}%`
												: '-'}
										</TableCell>
									</TableRow>
									{metrics.pings.lastPingTime && (
										<TableRow>
											<TableCell className="font-medium text-sm">Last Ping</TableCell>
											<TableCell className="text-sm font-mono">{formatRelativeTime(metrics.pings.lastPingTime)}</TableCell>
										</TableRow>
									)}
								</>
							)}
						</TableBody>
					</Table>
				</div>

				{/* Client Identities */}
				{clientData.length > 0 && (
					<>
						<Separator />
						<div>
							<h3 className="text-sm font-semibold text-foreground mb-3">Client Identities</h3>
							<DataTable 
								columns={createClientColumns(metrics.isStateless)} 
								data={clientData} 
								searchColumn="name"
								searchPlaceholder="Filter clients..."
								pageSize={50}
							/>
						</div>
					</>
				)}

				{/* Last Error Display */}
				{metrics.errors.lastError && (
					<>
						<Separator />
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertTitle>Last Error</AlertTitle>
							<AlertDescription>
								<p className="font-mono text-sm">
									{metrics.errors.lastError.type}: {metrics.errors.lastError.message}
								</p>
								<p className="text-xs mt-1">{formatRelativeTime(metrics.errors.lastError.timestamp)}</p>
							</AlertDescription>
						</Alert>
					</>
				)}

				<Separator />
				<div className="text-xs text-muted-foreground text-center">
					Metrics update every 3 seconds • Times are relative to current time
				</div>
			</CardContent>
		</Card>
	);
}
