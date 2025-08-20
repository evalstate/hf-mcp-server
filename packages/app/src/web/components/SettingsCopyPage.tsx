import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import {
	Copy,
	Settings,
	CheckCircle,
	Search,
	Database,
	Rocket,
	ChevronDown,
	ChevronRight,
	Terminal,
	Bot,
	MessageSquare,
} from 'lucide-react';
import { useState } from 'react';

interface ClientConfig {
	id: string;
	name: string;
	icon: React.ReactNode;
	description: string;
	configExample: string;
	instructions: string[];
}

const CLIENT_CONFIGS: ClientConfig[] = [
	{
		id: 'claude-desktop',
		name: 'Claude Desktop',
		icon: <MessageSquare className="h-5 w-5" />,
		description: "Use with Anthropic's Claude Desktop app",
		configExample: `{
  "mcpServers": {
    "huggingface": {
      "command": "npx",
      "args": [
        "@llmindset/hf-mcp-server"
      ],
      "env": {
        "HF_TOKEN": "your_hf_token_here"
      }
    }
  }
}`,
		instructions: [
			'Copy the MCP server URL from the button above',
			'Open Claude Desktop settings',
			'Add the Hugging Face MCP server configuration',
			'Restart Claude Desktop to load the server',
		],
	},
	{
		id: 'terminal',
		name: 'Terminal/CLI',
		icon: <Terminal className="h-5 w-5" />,
		description: 'Run directly from your terminal',
		configExample: `# Install the MCP server
npm install -g @llmindset/hf-mcp-server

# Set your Hugging Face token
export HF_TOKEN=your_hf_token_here

# Run the server
hf-mcp-server`,
		instructions: [
			'Install the MCP server package globally',
			'Set your HF_TOKEN environment variable',
			'Run the server using the command line',
			'Connect your MCP-compatible client to the server',
		],
	},
	{
		id: 'custom-client',
		name: 'Custom MCP Client',
		icon: <Bot className="h-5 w-5" />,
		description: 'Integrate with your own MCP client',
		configExample: `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['@llmindset/hf-mcp-server'],
  env: {
    HF_TOKEN: process.env.HF_TOKEN
  }
});

const client = new Client({
  name: "my-client",
  version: "1.0.0"
}, {
  capabilities: {}
});

await client.connect(transport);`,
		instructions: [
			'Install the MCP SDK in your project',
			'Create a transport to connect to the HF MCP server',
			'Initialize your MCP client with proper capabilities',
			'Use the client to call available tools and resources',
		],
	},
];

export function SettingsCopyPage() {
	const [copied, setCopied] = useState(false);
	const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

	// Handler for copying MCP URL
	const handleCopyMcpUrl = async () => {
		const mcpUrl = `https://huggingface.co/mcp?login`;

		try {
			await navigator.clipboard.writeText(mcpUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy URL:', err);
		}
	};

	// Handler for going to settings (switch to search tab)
	const handleGoToSettings = () => {
		window.open('https://huggingface.co/settings/mcp', '_blank');
	};

	// Handler for toggling client configuration sections
	const toggleClientExpansion = (clientId: string) => {
		setExpandedClients((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(clientId)) {
				newSet.delete(clientId);
			} else {
				newSet.add(clientId);
			}
			return newSet;
		});
	};

	// Handler for copying config examples
	const copyConfigExample = async (config: string) => {
		try {
			await navigator.clipboard.writeText(config);
		} catch (err) {
			console.error('Failed to copy config:', err);
		}
	};

	return (
		<div className="min-h-screen bg-background">
			{/* Hero Section with HF Logo */}
			<div className="bg-gradient-to-b from-primary/5 to-background px-8 pt-12 pb-8">
				<div className="max-w-4xl mx-auto text-center">
					<img src="/hf-logo-with-title.svg" alt="Hugging Face" className="h-16 mx-auto mb-8" />
					<h1 className="text-3xl font-bold text-foreground mb-4">Welcome to the Hugging Face MCP Server</h1>
					<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
						Connect assistants to the Hub and thousands of AI Apps
					</p>
				</div>
			</div>

			<div className="px-8 pb-12">
				<div className="max-w-3xl mx-auto">
					{/* Action Buttons Card */}
					<Card>
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-semibold">Get Started</CardTitle>
							<CardDescription>Connect your AI assistant to Hugging Face in two simple steps</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-3">
								<div className="flex items-center space-x-2 text-sm text-muted-foreground">
									<span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
										1
									</span>
									<span>Copy the MCP server URL</span>
								</div>
								<Button
									size="lg"
									onClick={handleCopyMcpUrl}
									className="w-full font-semibold transition-all duration-200"
									variant={copied ? 'default' : 'default'}
								>
									{copied ? (
										<>
											<CheckCircle className="mr-2 h-5 w-5" />
											Copied to Clipboard!
										</>
									) : (
										<>
											<Copy className="mr-2 h-5 w-5" />
											Copy MCP URL
										</>
									)}
								</Button>
							</div>

							<div className="space-y-3">
								<div className="flex items-center space-x-2 text-sm text-muted-foreground">
									<span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
										2
									</span>
									<span>Configure your tools in settings</span>
								</div>
								<Button size="lg" variant="outline" onClick={handleGoToSettings} className="w-full font-semibold">
									<Settings className="mr-2 h-5 w-5" />
									Go to Settings
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Client Configuration Section */}
					<Card className="mt-8">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-semibold">Client Setup</CardTitle>
							<CardDescription>Choose your preferred AI client and follow the setup instructions</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{CLIENT_CONFIGS.map((client) => {
								const isExpanded = expandedClients.has(client.id);
								return (
									<div key={client.id} className="border border-border rounded-lg">
										{/* Client Header */}
										<button
											onClick={() => toggleClientExpansion(client.id)}
											className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors rounded-lg"
										>
											<div className="flex items-center space-x-3">
												<div className="text-primary">{client.icon}</div>
												<div className="text-left">
													<h4 className="font-semibold text-foreground">{client.name}</h4>
													<p className="text-sm text-muted-foreground">{client.description}</p>
												</div>
											</div>
											<div className="text-muted-foreground">
												{isExpanded ? <ChevronDown className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
											</div>
										</button>

										{/* Expanded Content */}
										{isExpanded && (
											<div className="px-4 pb-4 space-y-4 border-t border-border mt-3 pt-4">
												{/* Instructions */}
												<div>
													<h5 className="font-semibold text-sm text-foreground mb-2">Instructions:</h5>
													<ol className="list-decimal list-inside space-y-1">
														{client.instructions.map((instruction, index) => (
															<li key={index} className="text-sm text-muted-foreground">
																{instruction}
															</li>
														))}
													</ol>
												</div>

												{/* Configuration Example */}
												<div>
													<div className="flex items-center justify-between mb-2">
														<h5 className="font-semibold text-sm text-foreground">Configuration:</h5>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => copyConfigExample(client.configExample)}
															className="h-8 px-2 text-xs"
														>
															<Copy className="h-3 w-3 mr-1" />
															Copy
														</Button>
													</div>
													<pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
														<code className="text-foreground font-mono">{client.configExample}</code>
													</pre>
												</div>
											</div>
										)}
									</div>
								);
							})}
						</CardContent>
					</Card>

					{/* What is MCP Card - moved to bottom */}
					<Card className="mt-8">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-semibold">What is MCP?</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-base text-muted-foreground leading-relaxed">
								The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely connect to
								external data sources and tools. This HF MCP Server provides seamless access to Hugging Face's vast
								ecosystem.
							</p>

							{/* Features Grid */}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
								<div className="flex items-start space-x-3">
									<Search className="h-5 w-5 text-primary mt-0.5" />
									<div>
										<h4 className="font-semibold text-sm text-foreground">Search Models</h4>
										<p className="text-sm text-muted-foreground">Browse and discover ML models</p>
									</div>
								</div>
								<div className="flex items-start space-x-3">
									<Database className="h-5 w-5 text-primary mt-0.5" />
									<div>
										<h4 className="font-semibold text-sm text-foreground">Access Datasets</h4>
										<p className="text-sm text-muted-foreground">Explore training datasets</p>
									</div>
								</div>
								<div className="flex items-start space-x-3">
									<Rocket className="h-5 w-5 text-primary mt-0.5" />
									<div>
										<h4 className="font-semibold text-sm text-foreground">Run Spaces</h4>
										<p className="text-sm text-muted-foreground">Interact with ML applications</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
