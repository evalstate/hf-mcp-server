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
	ExternalLink,
	Download,
	AlertTriangle,
	Info,
} from 'lucide-react';
import { useState } from 'react';

interface ActionButton {
	type: 'link' | 'download' | 'copy' | 'external';
	label: string;
	url?: string;
	content?: string;
	variant?: 'default' | 'secondary' | 'outline';
}

interface InstructionStep {
	type: 'text' | 'code' | 'button' | 'warning' | 'info';
	content: string;
	button?: ActionButton;
	copyable?: boolean;
}

interface ClientConfig {
	id: string;
	name: string;
	icon: React.ReactNode;
	description: string;
	configExample?: string;
	instructions: (string | InstructionStep)[];
	actionButtons?: ActionButton[];
	manualConfig?: {
		title: string;
		steps: InstructionStep[];
	};
}

const CLIENT_CONFIGS: ClientConfig[] = [
	{
		id: 'claude',
		name: 'Claude Desktop and Claude.ai',
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
		actionButtons: [
			{
				type: 'external',
				label: 'Download Claude Desktop',
				url: 'https://claude.ai/download',
				variant: 'outline',
			},
		],
	},
	{
		id: 'claude-code',
		name: 'Claude Code',
		icon: <Terminal className="h-5 w-5" />,
		description: 'Use with Claude Code in your terminal',
		instructions: [
			{
				type: 'info',
				content: 'Claude Code automatically detects MCP servers. Simply add this server to your configuration.',
			},
			{
				type: 'button',
				content: 'Add to Claude Code configuration',
				button: {
					type: 'copy',
					label: 'Copy Config',
					content: 'npx @llmindset/hf-mcp-server',
					variant: 'default',
				},
			},
			{
				type: 'code',
				content: `# Add to your Claude Code config
echo 'npx @llmindset/hf-mcp-server' >> ~/.config/claude-code/servers`,
				copyable: true,
			},
		],
		actionButtons: [
			{
				type: 'external',
				label: 'Claude Code Docs',
				url: 'https://docs.anthropic.com/en/docs/claude-code',
				variant: 'outline',
			},
		],
		manualConfig: {
			title: 'Manual Configuration',
			steps: [
				{
					type: 'text',
					content: 'Set your Hugging Face token as an environment variable:',
				},
				{
					type: 'code',
					content: 'export HF_TOKEN=your_hf_token_here',
					copyable: true,
				},
				{
					type: 'warning',
					content: 'Make sure to restart Claude Code after adding the server configuration.',
				},
			],
		},
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
			{
				type: 'code',
				content: 'npm install @modelcontextprotocol/sdk',
				copyable: true,
			},
			{
				type: 'text',
				content: 'Create a transport to connect to the HF MCP server',
			},
			{
				type: 'text',
				content: 'Initialize your MCP client with proper capabilities',
			},
			{
				type: 'info',
				content:
					'Use the client to call available tools and resources. See the MCP documentation for available methods.',
			},
		],
		actionButtons: [
			{
				type: 'external',
				label: 'MCP Documentation',
				url: 'https://modelcontextprotocol.io/docs',
				variant: 'outline',
			},
			{
				type: 'external',
				label: 'SDK Reference',
				url: 'https://github.com/modelcontextprotocol/typescript-sdk',
				variant: 'secondary',
			},
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

	// Handler for action buttons
	const handleActionButton = async (button: ActionButton) => {
		switch (button.type) {
			case 'copy':
				if (button.content) {
					try {
						await navigator.clipboard.writeText(button.content);
					} catch (err) {
						console.error('Failed to copy content:', err);
					}
				}
				break;
			case 'link':
			case 'external':
				if (button.url) {
					window.open(button.url, '_blank');
				}
				break;
			case 'download':
				if (button.url) {
					const link = document.createElement('a');
					link.href = button.url;
					link.download = button.label;
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}
				break;
		}
	};

	// Component for rendering instruction steps
	const renderInstructionStep = (step: InstructionStep, index: number) => {
		const baseClasses = 'text-sm';

		switch (step.type) {
			case 'warning':
				return (
					<div key={index} className="flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
						<AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
						<div className="text-sm text-yellow-800">{step.content}</div>
					</div>
				);
			case 'info':
				return (
					<div key={index} className="flex items-start space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
						<Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
						<div className="text-sm text-blue-800">{step.content}</div>
					</div>
				);
			case 'code':
				return (
					<div key={index} className="relative">
						<pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
							<code className="text-foreground font-mono">{step.content}</code>
						</pre>
						{step.copyable && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => copyConfigExample(step.content)}
								className="absolute top-2 right-2 h-6 px-2 text-xs"
							>
								<Copy className="h-3 w-3" />
							</Button>
						)}
					</div>
				);
			case 'button':
				return (
					<div key={index} className="flex items-center space-x-3">
						<span className={baseClasses + ' text-muted-foreground flex-grow'}>{step.content}</span>
						{step.button && (
							<Button
								variant={step.button.variant || 'default'}
								size="sm"
								onClick={() => handleActionButton(step.button!)}
								className="ml-auto"
							>
								{step.button.type === 'external' && <ExternalLink className="h-4 w-4 mr-2" />}
								{step.button.type === 'download' && <Download className="h-4 w-4 mr-2" />}
								{step.button.type === 'copy' && <Copy className="h-4 w-4 mr-2" />}
								{step.button.label}
							</Button>
						)}
					</div>
				);
			default:
				return (
					<div key={index} className={baseClasses + ' text-muted-foreground'}>
						{step.content}
					</div>
				);
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
						<CardHeader className="pb-0">
							<CardTitle className="text-xl font-semibold">Get Started</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6 pt-0">
							{/* Side-by-side layout on larger screens */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								{/* Step 1 */}
								<div className="space-y-4">
									<div className="flex items-center space-x-3 mb-4">
										<span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">
											1
										</span>
										<span className="text-lg font-medium text-foreground">Setup your Client with this URL:</span>
									</div>

									{/* URL input with embedded copy button */}
									<div className="relative">
										<input
											type="text"
											value="https://huggingface.co/mcp?login"
											readOnly
											className="w-full px-4 py-3 pr-12 text-sm font-mono bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 h-12 cursor-pointer hover:bg-muted/80 transition-colors"
											onClick={handleCopyMcpUrl}
										/>
										<Button
											size="sm"
											onClick={handleCopyMcpUrl}
											className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 px-2 hover:bg-secondary/80 transition-colors"
											variant={copied ? 'default' : 'secondary'}
										>
											{copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
										</Button>
									</div>
								</div>

								{/* Step 2 */}
								<div className="space-y-4">
									<div className="flex items-center space-x-3 mb-4">
										<span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">
											2
										</span>
										<span className="text-lg font-medium text-foreground">Choose Apps and Tools</span>
									</div>

									<div className="relative">
										<input
											type="text"
											value="Go to Hugging Face MCP Settings"
											readOnly
											className="w-full pl-12 pr-12 py-3 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 h-12 cursor-pointer hover:bg-muted/80 transition-colors"
											onClick={handleGoToSettings}
										/>
										<Button
											size="sm"
											onClick={handleGoToSettings}
											className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 px-2 hover:bg-secondary/80 transition-colors"
											variant="secondary"
										>
											<ExternalLink className="h-4 w-4" />
										</Button>
										<Settings className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Client Configuration Section */}
					<Card className="mt-8">
						<CardHeader className="pb-0">
							<CardTitle className="text-xl font-semibold">Detailed Client Setup</CardTitle>
							<CardDescription>Choose your preferred AI client and follow the setup instructions</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4 pt-0">
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
												{/* Action Buttons */}
												{client.actionButtons && client.actionButtons.length > 0 && (
													<div className="flex flex-wrap gap-2">
														{client.actionButtons.map((button, index) => (
															<Button
																key={index}
																variant={button.variant || 'default'}
																size="sm"
																onClick={() => handleActionButton(button)}
																className="h-8"
															>
																{button.type === 'external' && <ExternalLink className="h-4 w-4 mr-2" />}
																{button.type === 'download' && <Download className="h-4 w-4 mr-2" />}
																{button.type === 'copy' && <Copy className="h-4 w-4 mr-2" />}
																{button.label}
															</Button>
														))}
													</div>
												)}

												{/* Instructions */}
												<div>
													<h5 className="font-semibold text-sm text-foreground mb-2">Instructions:</h5>
													<div className="space-y-2">
														{client.instructions.map((instruction, index) => {
															if (typeof instruction === 'string') {
																return (
																	<div key={index} className="flex items-start space-x-2">
																		<span className="text-sm text-muted-foreground flex-shrink-0 mt-0.5">
																			{index + 1}.
																		</span>
																		<span className="text-sm text-muted-foreground">{instruction}</span>
																	</div>
																);
															} else {
																return renderInstructionStep(instruction, index);
															}
														})}
													</div>
												</div>

												{/* Configuration Example */}
												{client.configExample && (
													<div>
														<div className="flex items-center justify-between mb-2">
															<h5 className="font-semibold text-sm text-foreground">Configuration:</h5>
															<Button
																variant="ghost"
																size="sm"
																onClick={() => copyConfigExample(client.configExample!)}
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
												)}

												{/* Manual Configuration */}
												{client.manualConfig && (
													<div>
														<h5 className="font-semibold text-sm text-foreground mb-2">{client.manualConfig.title}</h5>
														<div className="space-y-2">
															{client.manualConfig.steps.map((step, index) => renderInstructionStep(step, index))}
														</div>
													</div>
												)}
											</div>
										)}
									</div>
								);
							})}
						</CardContent>
					</Card>

					{/* What is MCP Card - moved to bottom */}
					<Card className="mt-8">
						<CardHeader className="pb-3">
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
