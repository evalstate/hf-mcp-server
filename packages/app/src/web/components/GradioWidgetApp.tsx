import { useEffect, useState } from 'react';

// Define types for Skybridge window.openai API
declare global {
	interface Window {
		openai?: {
			toolOutput?: {
				url?: string;
				[key: string]: unknown;
			};
			widgetState?: unknown;
			setWidgetState?: (state: unknown) => void;
			requestDisplayMode?: (options: { mode: 'inline' | 'fullscreen' }) => void;
			callTool?: (toolName: string, params: Record<string, unknown>) => void;
		};
	}
}

export function GradioWidgetApp() {
	const [toolOutput, setToolOutput] = useState<{ url?: string } | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		// Initial check for toolOutput
		const checkToolOutput = () => {
			if (window.openai?.toolOutput) {
				setToolOutput(window.openai.toolOutput);
				setIsLoading(false);
			}
		};

		checkToolOutput();

		// Poll for updates to window.openai.toolOutput
		const interval = setInterval(() => {
			if (window.openai?.toolOutput) {
				setToolOutput(window.openai.toolOutput);
				setIsLoading(false);
			}
		}, 100);

		// Set a timeout to stop loading after a reasonable time
		const timeout = setTimeout(() => {
			setIsLoading(false);
		}, 2000);

		return () => {
			clearInterval(interval);
			clearTimeout(timeout);
		};
	}, []);

	// Determine if we should show the audio player
	const shouldShowAudioPlayer = toolOutput?.url?.endsWith('.wav');

	return (
		<div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-gray-50 to-gray-100">
			<div className="max-w-2xl w-full">
				{/* Always show the Huggy Pop logo */}
				<div className="flex justify-center mb-6">
					<img
						src="https://chunte-hfba.static.hf.space/images/modern%20Huggies/Huggy%20Pop.gif"
						alt="Hugging Face"
						className="w-32 h-32 object-contain"
					/>
				</div>

				{isLoading ? (
					<div className="text-center">
						<p className="text-gray-600">Loading...</p>
					</div>
				) : shouldShowAudioPlayer && toolOutput?.url ? (
					<div className="bg-white rounded-lg shadow-lg p-6">
						<h2 className="text-xl font-semibold mb-4 text-gray-800">Audio Player</h2>
						<audio controls className="w-full" src={toolOutput.url}>
							Your browser does not support the audio element.
						</audio>
						<p className="text-sm text-gray-500 mt-2 break-all">{toolOutput.url}</p>
					</div>
				) : (
					<div className="bg-white rounded-lg shadow-lg p-6 text-center">
						<p className="text-gray-600">
							{toolOutput?.url
								? 'Content available but no preview available for this type.'
								: 'No content to display.'}
						</p>
						{toolOutput?.url && !shouldShowAudioPlayer && (
							<p className="text-sm text-gray-400 mt-2 break-all">{toolOutput.url}</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
