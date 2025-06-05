//import "./App.css";

import useSWR, { mutate } from 'swr';
import { ToolsCard } from './components/ToolsCard';
import { GradioEndpointsCard, type GradioEndpoint } from './components/GradioEndpointsCard';
import { TransportMetricsCard } from './components/TransportMetricsCard';
import { ConnectionFooter } from './components/ConnectionFooter';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import type { TransportInfo } from '../shared/transport-info.js';

type AppSettings = {
	builtInTools: string[];
};

// SWR fetcher function
const fetcher = (url: string) =>
	fetch(url).then((res) => {
		if (!res.ok) {
			throw new Error(`Failed to fetch: ${res.status}`);
		}
		return res.json();
	});

function App() {
	// Use SWR for transport info with auto-refresh
	const { data: transportInfo, error: transportError } = useSWR<TransportInfo>('/api/transport', fetcher, {
		refreshInterval: 3000, // Refresh every 3 seconds
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
	});

	// Use SWR for sessions to trigger stdioClient update
	useSWR('/api/sessions', fetcher, {
		refreshInterval: 3000, // Refresh every 3 seconds
		revalidateOnFocus: true,
	});

	// Use SWR for settings
	const { data: settings } = useSWR<AppSettings>('/api/settings', fetcher);

	// Use SWR for Gradio endpoints
	const { data: gradioEndpoints = [] } = useSWR<GradioEndpoint[]>('/api/gradio-endpoints', fetcher);

	const isLoading = !transportInfo && !transportError;
	const error = transportError ? transportError.message : null;

	// Handle checkbox changes
	const handleToolToggle = async (toolId: string, checked: boolean) => {
		try {
			// Optimistic update - immediately update the UI
			const currentSettings = settings || { builtInTools: [] };
			const currentTools = currentSettings.builtInTools;
			const newTools = checked 
				? [...currentTools.filter(id => id !== toolId), toolId]
				: currentTools.filter(id => id !== toolId);
			
			const optimisticSettings = {
				...currentSettings,
				builtInTools: newTools,
			};

			// Update the cache optimistically
			mutate('/api/settings', optimisticSettings, false);

			// Make the API call
			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ builtInTools: newTools }),
			});

			if (!response.ok) {
				throw new Error(`Failed to update tool settings: ${response.status}`);
			}

			// Revalidate to get fresh data from server
			mutate('/api/settings');

			console.log(`${toolId} is now ${checked ? 'enabled' : 'disabled'}`);
		} catch (err) {
			console.error(`Error updating tool settings:`, err);
			alert(`Error updating ${toolId}: ${err instanceof Error ? err.message : 'Unknown error'}`);

			// Revert optimistic update on error
			mutate('/api/settings');
		}
	};

	// Handle Gradio endpoint toggles
	const handleGradioEndpointToggle = async (index: number, enabled: boolean) => {
		try {
			// Optimistic update
			const optimisticEndpoints = [...gradioEndpoints];
			if (optimisticEndpoints[index]) {
				optimisticEndpoints[index] = { ...optimisticEndpoints[index], enabled };
				mutate('/api/gradio-endpoints', optimisticEndpoints, false);
			}

			// Make API call
			const response = await fetch(`/api/gradio-endpoints/${index}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled }),
			});

			if (!response.ok) {
				throw new Error(`Failed to update endpoint: ${response.status}`);
			}

			// Revalidate to ensure consistency
			mutate('/api/gradio-endpoints');

			console.log(`Gradio endpoint at index ${index} is now ${enabled ? 'enabled' : 'disabled'}`);
		} catch (err) {
			console.error(`Error updating Gradio endpoint:`, err);
			alert(`Error updating endpoint: ${err instanceof Error ? err.message : 'Unknown error'}`);

			// Revert optimistic update on error
			mutate('/api/gradio-endpoints');
		}
	};

	// Handle Gradio endpoint URL changes
	const handleGradioEndpointUrlChange = async (index: number, url: string) => {
		try {
			// Make API call
			const response = await fetch(`/api/gradio-endpoints/${index}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || `Failed to update endpoint URL: ${response.status}`);
			}

			// Revalidate to ensure consistency
			mutate('/api/gradio-endpoints');

			console.log(`Gradio endpoint at index ${index} URL updated to ${url}`);
		} catch (err) {
			console.error(`Error updating Gradio endpoint URL:`, err);
			alert(`Error updating endpoint URL: ${err instanceof Error ? err.message : 'Unknown error'}`);

			// Revert by revalidating
			mutate('/api/gradio-endpoints');
		}
	};

	/** should we use annotations / Title here? */
	const searchTools = {
		paper_search: {
			// Changed from paper_semantic_search
			id: 'paper_search',
			label: 'Papers Search',
			description: 'Find Machine Learning Research Papers.',
			settings: { enabled: settings?.builtInTools?.includes('paper_search') ?? true },
		},
		space_search: {
			// Changed from space_semantic_search
			id: 'space_search',
			label: 'Space Search',
			description: 'Find Gradio Hugging Face Spaces.',
			settings: { enabled: settings?.builtInTools?.includes('space_search') ?? true },
		},
		model_search: {
			id: 'model_search',
			label: 'Model Search',
			description: 'Find models with filters for task, library, etc.',
			settings: { enabled: settings?.builtInTools?.includes('model_search') ?? true },
		},
		model_detail: {
			id: 'model_detail',
			label: 'Model Details',
			description: 'Detailed information about a specific model.',
			settings: { enabled: settings?.builtInTools?.includes('model_detail') ?? true },
		},
		dataset_search: {
			id: 'dataset_search',
			label: 'Dataset Search',
			description: 'Find datasets with filters for author, tags, etc.',
			settings: { enabled: settings?.builtInTools?.includes('dataset_search') ?? true },
		},
		dataset_detail: {
			id: 'dataset_detail',
			label: 'Dataset Details',
			description: 'Detailed information about a specific dataset.',
			settings: { enabled: settings?.builtInTools?.includes('dataset_detail') ?? true },
		},
	};

	const spaceTools = {
		duplicate_space: {
			id: 'duplicate_space',
			label: 'Duplicate Space',
			description: 'Duplicate a Space to your account.',
			settings: { enabled: settings?.builtInTools?.includes('duplicate_space') ?? true },
		},
		space_info: {
			id: 'space_info',
			label: 'Spaces Information',
			description: 'Get detailed information about your Spaces.',
			settings: { enabled: settings?.builtInTools?.includes('space_info') ?? true },
		},
		space_files: {
			id: 'space_files',
			label: 'Space Files',
			description: 'List all files in a static Space with download URLs.',
			settings: { enabled: settings?.builtInTools?.includes('space_files') ?? true },
		},
	};

	return (
		<>
			<div className="min-h-screen p-8">
				<div className="max-w-2xl mx-auto">
					<Tabs defaultValue="metrics" className="w-full">
						<TabsList className="mb-6">
							<TabsTrigger value="metrics">📊 Transport Metrics</TabsTrigger>
							<TabsTrigger value="search">🔍 Search Tools</TabsTrigger>
							<TabsTrigger value="spaces">🚀 Space Tools</TabsTrigger>
							<TabsTrigger value="gradio">⚡ Gradio Endpoints</TabsTrigger>
						</TabsList>
						<TabsContent value="metrics">
							<TransportMetricsCard />
						</TabsContent>
						<TabsContent value="search">
							<ToolsCard
								title="🤗 Hugging Face Search Tools (MCP)"
								description="Find and use Hugging Face and Community content."
								tools={searchTools}
								onToolToggle={handleToolToggle}
							/>
						</TabsContent>
						<TabsContent value="spaces">
							<ToolsCard
								title="🤗 Hugging Face Space Tools (MCP)"
								description="Manage and duplicate Hugging Face Spaces."
								tools={spaceTools}
								onToolToggle={handleToolToggle}
							/>
						</TabsContent>
						<TabsContent value="gradio">
							<GradioEndpointsCard
								endpoints={gradioEndpoints}
								onEndpointToggle={handleGradioEndpointToggle}
								onEndpointUrlChange={handleGradioEndpointUrlChange}
							/>
						</TabsContent>
					</Tabs>
				</div>
			</div>

			<ConnectionFooter isLoading={isLoading} error={error} transportInfo={transportInfo || { transport: 'unknown' }} />
		</>
	);
}

export default App;
