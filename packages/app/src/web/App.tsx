//import "./App.css";

import { useEffect, useState } from 'react';
import { ToolsCard } from './components/ToolsCard';
import { ConnectionFooter } from './components/ConnectionFooter';

type TransportInfo = {
	transport: 'stdio' | 'sse' | 'streamableHttp' | 'unknown';
	port?: number;
	hfTokenMasked?: string;
	hfTokenSet?: boolean;
};

type ToolSettings = {
	enabled: boolean;
};

type AppSettings = {
	tools: {
		[toolId: string]: ToolSettings;
	};
};

function App() {
	const [transportInfo, setTransportInfo] = useState<TransportInfo>({
		transport: 'unknown',
	});
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [settings, setSettings] = useState<AppSettings>({
		tools: {
			space_search: { enabled: false },
			model_search: { enabled: false },
			model_detail: { enabled: false },
			paper_search: { enabled: false },
			dataset_search: { enabled: false },
			dataset_detail: { enabled: false },
		},
	});

	useEffect(() => {
		// Fetch transport information and settings from the API
		const fetchData = async () => {
			try {
				setIsLoading(true);

				// Fetch transport info
				const transportResponse = await fetch('/api/transport');
				if (!transportResponse.ok) {
					throw new Error(`Failed to fetch transport info: ${transportResponse.status}`);
				}
				const transportData = await transportResponse.json();
				setTransportInfo(transportData);

				// Fetch settings
				const settingsResponse = await fetch('/api/settings');
				if (!settingsResponse.ok) {
					throw new Error(`Failed to fetch settings: ${settingsResponse.status}`);
				}
				const settingsData = await settingsResponse.json();
				setSettings(settingsData);
			} catch (err) {
				console.error('Error fetching data:', err);
				setError(err instanceof Error ? err.message : 'Unknown error occurred');
			} finally {
				setIsLoading(false);
			}
		};

		fetchData();
	}, []);

	// Handle checkbox changes
	const handleToolToggle = async (toolId: string, checked: boolean) => {
		try {
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

			const updatedToolSettings = await response.json();

			// Update local state
			setSettings((prevSettings) => ({
				...prevSettings,
				tools: {
					...prevSettings.tools,
					[toolId]: updatedToolSettings,
				},
			}));

			console.error(`${toolId} is now ${checked ? 'enabled' : 'disabled'}`);
		} catch (err) {
			console.error(`Error updating tool settings:`, err);
			alert(`Error updating ${toolId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const searchTools = {
		paper_search: {
			// Changed from paper_semantic_search
			id: 'paper_search',
			label: 'Papers Search',
			description: 'Find Machine Learning Research Papers.',
			settings: settings.tools.paper_search || { enabled: false },
		},
		space_search: {
			// Changed from space_semantic_search
			id: 'space_search',
			label: 'Space Search',
			description: 'Find Gradio Hugging Face Spaces.',
			settings: settings.tools.space_search || { enabled: false },
		},
		model_search: {
			id: 'model_search',
			label: 'Model Search',
			description: 'Search for ML models with filters for task, library, etc.',
			settings: settings.tools.model_search || { enabled: false },
		},
		model_detail: {
			id: 'model_detail',
			label: 'Model Details',
			description: 'Get detailed information about a specific model.',
			settings: settings.tools.model_detail || { enabled: false },
		},
		dataset_search: {
			id: 'dataset_search',
			label: 'Dataset Search',
			description: 'Search for datasets with filters for author, tags, etc.',
			settings: settings.tools.dataset_search || { enabled: false },
		},
		dataset_detail: {
			id: 'dataset_detail',
			label: 'Dataset Details',
			description: 'Get detailed information about a specific dataset.',
			settings: settings.tools.dataset_detail || { enabled: false },
		},
	};

	return (
		<>
			<div className="flex h-screen w-screen items-center justify-center flex-col gap-6 pb-12">
				<ToolsCard
					title="Hugging Face Search Tools (MCP)"
					description="Find and use Hugging Face and Community content."
					tools={searchTools}
					onToolToggle={handleToolToggle}
				/>
			</div>

			<ConnectionFooter isLoading={isLoading} error={error} transportInfo={transportInfo} />
		</>
	);
}

export default App;
