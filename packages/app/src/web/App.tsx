//import "./App.css";

import useSWR, { mutate } from 'swr';
import { ToolsCard } from './components/ToolsCard';
import { ConnectionFooter } from './components/ConnectionFooter';
import type { TransportInfo } from '../shared/transport-info.js';

type ToolSettings = {
	enabled: boolean;
};

type AppSettings = {
	tools: {
		[toolId: string]: ToolSettings;
	};
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

	const isLoading = !transportInfo && !transportError;
	const error = transportError ? transportError.message : null;

	// Handle checkbox changes
	const handleToolToggle = async (toolId: string, checked: boolean) => {
		try {
			// Optimistic update - immediately update the UI
			const currentSettings = settings || { tools: {} };
			const optimisticSettings = {
				...currentSettings,
				tools: {
					...currentSettings.tools,
					[toolId]: { enabled: checked },
				},
			};

			// Update the cache optimistically
			mutate('/api/settings', optimisticSettings, false);

			// Make the API call
			const response = await fetch(`/api/settings/tools/${toolId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ enabled: checked }),
			});

			if (!response.ok) {
				throw new Error(`Failed to update tool settings: ${response.status}`);
			}

			// Revalidate to get fresh data from server
			mutate('/api/settings');

			console.error(`${toolId} is now ${checked ? 'enabled' : 'disabled'}`);
		} catch (err) {
			console.error(`Error updating tool settings:`, err);
			alert(`Error updating ${toolId}: ${err instanceof Error ? err.message : 'Unknown error'}`);

			// Revert optimistic update on error
			mutate('/api/settings');
		}
	};

	const searchTools = {
		paper_search: {
			// Changed from paper_semantic_search
			id: 'paper_search',
			label: 'Papers Search',
			description: 'Find Machine Learning Research Papers.',
			settings: settings?.tools?.paper_search || { enabled: true },
		},
		space_search: {
			// Changed from space_semantic_search
			id: 'space_search',
			label: 'Space Search',
			description: 'Find Gradio Hugging Face Spaces.',
			settings: settings?.tools?.space_search || { enabled: true },
		},
		model_search: {
			id: 'model_search',
			label: 'Model Search',
			description: 'Search for ML models with filters for task, library, etc.',
			settings: settings?.tools?.model_search || { enabled: true },
		},
		model_detail: {
			id: 'model_detail',
			label: 'Model Details',
			description: 'Get detailed information about a specific model.',
			settings: settings?.tools?.model_detail || { enabled: true },
		},
		dataset_search: {
			id: 'dataset_search',
			label: 'Dataset Search',
			description: 'Search for datasets with filters for author, tags, etc.',
			settings: settings?.tools?.dataset_search || { enabled: true },
		},
		dataset_detail: {
			id: 'dataset_detail',
			label: 'Dataset Details',
			description: 'Get detailed information about a specific dataset.',
			settings: settings?.tools?.dataset_detail || { enabled: true },
		},
	};

	const spaceTools = {
		duplicate_space: {
			id: 'duplicate_space',
			label: 'Duplicate Space',
			description: 'Duplicate any Hugging Face Space to your account.',
			settings: settings?.tools?.duplicate_space || { enabled: true },
		},
	};

	return (
		<>
			<div className="flex h-screen w-screen items-center justify-center flex-col gap-6 pb-12">
				<ToolsCard
					title="🤗 Hugging Face Search Tools (MCP)"
					description="Find and use Hugging Face and Community content."
					tools={searchTools}
					onToolToggle={handleToolToggle}
				/>
				<ToolsCard
					title="🤗 Hugging Face Space Tools (MCP)"
					description="Manage and duplicate Hugging Face Spaces."
					tools={spaceTools}
					onToolToggle={handleToolToggle}
				/>
			</div>

			<ConnectionFooter isLoading={isLoading} error={error} transportInfo={transportInfo || { transport: 'unknown' }} />
		</>
	);
}

export default App;
