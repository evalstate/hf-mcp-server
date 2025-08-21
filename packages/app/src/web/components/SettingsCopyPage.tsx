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
	Bot,
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
	content: string | React.ReactNode;
	button?: ActionButton;
	copyable?: boolean;
}

interface ClientConfig {
	id: string;
	name: string;
	icon: React.ReactNode;
	description?: string;
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
		icon: (
			<svg
				className="h-5 w-5"
				width="1em"
				height="1em"
				viewBox="0 0 12 12"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<g clip-path="url(#a)">
					<path
						d="m2.96 7.65 1.97-1.1.03-.1-.03-.05h-.1l-.33-.02-1.12-.03-.97-.04-.95-.06-.24-.05L1 5.91l.02-.15.2-.13.29.02.63.05.95.06.69.04 1.02.11h.16L5 5.84l-.06-.04-.04-.04-.99-.66-1.06-.7-.56-.41-.3-.2-.15-.2-.07-.42.28-.3.36.03.1.02.37.29.8.61 1.03.77.16.12.06-.04v-.03l-.06-.11-.57-1.02-.6-1.04-.27-.43-.07-.26c-.03-.1-.04-.2-.04-.3l.3-.42L3.8 1l.42.06.17.15.26.59.42.93.64 1.26.2.37.1.35.03.1h.07v-.06l.05-.7.1-.88.1-1.12.03-.32.16-.38.3-.2.25.11.2.29-.03.18-.12.77-.23 1.21-.15.81h.09l.1-.1.41-.54.69-.86.3-.34.36-.38.22-.18h.43l.32.47-.14.49-.44.56-.37.47-.53.71-.33.57.03.04h.08l1.2-.26.63-.11.77-.13.35.16.04.16-.14.34-.82.2-.96.2-1.44.33-.01.01.02.03.64.06.28.02h.68l1.25.09.33.22.2.26-.03.2-.5.26-.7-.16-1.59-.38-.54-.13h-.08v.04l.46.45.83.75 1.05.97.05.24-.13.2-.15-.03-.92-.69-.35-.31-.8-.68h-.06v.08l.19.27.98 1.46.05.45-.07.15-.26.09-.28-.05-.57-.8-.59-.9-.47-.82-.06.04-.28 3.02-.13.15-.3.12-.26-.2-.14-.3.14-.62.16-.8.13-.64.12-.79.07-.26v-.02H5.9l-.6.83-.9 1.22-.73.77-.17.07-.3-.15.03-.28.17-.24 1-1.27.6-.78.38-.46v-.06h-.03L2.72 8.73l-.47.06-.2-.19.02-.3.1-.1.8-.55Z"
						fill="#D97757"
					></path>
				</g>
				<defs>
					<clipPath id="a">
						<path fill="#fff" transform="translate(1 1)" d="M0 0h10v10H0z"></path>
					</clipPath>
				</defs>
			</svg>
		),
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
		id: 'vscode',
		name: 'Visual Studio Code',
		icon: (
			<svg
				className="h-5 w-5"
				width="1em"
				height="1em"
				viewBox="0 0 12 12"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<g clipPath="url(#a)">
					<mask id="b" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="1" y="1" width="10" height="10">
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M8.1 10.93c.15.06.33.06.49-.02l2.06-.99c.21-.1.35-.32.35-.56V2.64a.63.63 0 0
  0-.35-.56l-2.06-1a.62.62 0 0 0-.71.13L3.94 4.8 2.22 3.5a.42.42 0 0 0-.53.02l-.55.5a.42.42 0 0 0 0 .62L2.62 6 1.14 7.36a.42.42 0 0 0 0
  .61l.55.5c.15.14.37.15.53.03l1.72-1.3 3.94 3.59c.06.06.13.1.21.14Zm.4-7.2L5.51 6l3 2.27V3.73Z"
							fill="#fff"
						></path>
					</mask>
					<g mask="url(#b)">
						<path
							d="m10.64 2.08-2.06-1a.62.62 0 0 0-.7.13L1.12 7.36a.42.42 0 0 0 0 .61l.55.5c.15.14.37.15.53.03l8.12-6.17c.28-.2.67 0
  .67.33v-.02a.63.63 0 0 0-.36-.56Z"
							fill="#0065A9"
						></path>
						<g filter="url(#c)">
							<path
								d="m10.64 9.92-2.06.99a.62.62 0 0 1-.7-.12L1.12 4.64a.42.42 0 0 1 0-.62l.55-.5a.42.42 0 0 1 .53-.02l8.12
  6.16c.28.2.67.01.67-.33v.03c0 .24-.14.45-.36.56Z"
								fill="#007ACC"
							></path>
						</g>
						<g filter="url(#d)">
							<path
								d="M8.59 10.91a.62.62 0 0 1-.71-.12c.23.23.62.07.62-.26V1.46c0-.32-.4-.48-.63-.25a.62.62 0 0 1
  .72-.12l2.06.99c.21.1.35.32.35.56v6.72c0 .24-.14.46-.35.56l-2.06.99Z"
								fill="#1F9CF0"
							></path>
						</g>
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M8.08 10.93c.16.06.34.06.5-.02l2.06-.99c.21-.1.35-.32.35-.56V2.64a.63.63 0 0
  0-.35-.56l-2.06-1a.62.62 0 0 0-.71.13L3.93 4.8 2.2 3.5a.42.42 0 0 0-.53.02l-.55.5a.42.42 0 0 0 0 .62L2.62 6l-1.5 1.36a.42.42 0 0 0 0
  .61l.56.5c.15.14.37.15.53.03l1.72-1.3 3.94 3.59c.06.06.13.1.21.14Zm.41-7.2L5.5 6l3 2.27V3.73Z"
							fill="url(#e)"
							style={{ mixBlendMode: 'overlay' }}
							opacity=".25"
						></path>
					</g>
				</g>
				<defs>
					<filter
						id="c"
						x="-8.27"
						y="-5.85"
						width="28.53"
						height="26.07"
						filterUnits="userSpaceOnUse"
						colorInterpolationFilters="sRGB"
					>
						<feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
						<feColorMatrix
							in="SourceAlpha"
							values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
							result="hardAlpha"
						></feColorMatrix>
						<feOffset></feOffset>
						<feGaussianBlur stdDeviation="4.63"></feGaussianBlur>
						<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"></feColorMatrix>
						<feBlend mode="overlay" in2="BackgroundImageFix" result="effect1_dropShadow_640_684"></feBlend>
						<feBlend in="SourceGraphic" in2="effect1_dropShadow_640_684" result="shape"></feBlend>
					</filter>
					<filter
						id="d"
						x="-1.38"
						y="-8.24"
						width="21.64"
						height="28.46"
						filterUnits="userSpaceOnUse"
						colorInterpolationFilters="sRGB"
					>
						<feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
						<feColorMatrix
							in="SourceAlpha"
							values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
							result="hardAlpha"
						></feColorMatrix>
						<feOffset></feOffset>
						<feGaussianBlur stdDeviation="4.63"></feGaussianBlur>
						<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"></feColorMatrix>
						<feBlend mode="overlay" in2="BackgroundImageFix" result="effect1_dropShadow_640_684"></feBlend>
						<feBlend in="SourceGraphic" in2="effect1_dropShadow_640_684" result="shape"></feBlend>
					</filter>
					<linearGradient id="e" x1="5.99" y1="1.02" x2="5.99" y2="10.97" gradientUnits="userSpaceOnUse">
						<stop stopColor="#fff"></stop>
						<stop offset="1" stopColor="#fff" stopOpacity="0"></stop>
					</linearGradient>
					<clipPath id="a">
						<path fill="#fff" transform="translate(1 1)" d="M0 0h10v10H0z"></path>
					</clipPath>
				</defs>
			</svg>
		),
		//	description: 'Use with VS Code MCP extension',
		instructions: [
			{
				type: 'info',
				content: 'Install the MCP extension for VS Code to enable AI assistants with Hugging Face access.',
			},
			'Install the MCP extension from VS Code marketplace',
			'Open VS Code settings (Cmd/Ctrl + ,)',
			'Search for "MCP" in settings',
			'Add the Hugging Face MCP server configuration',
			'Reload VS Code to activate the server',
		],
		actionButtons: [
			{
				type: 'external',
				label: 'Install MCP Extension',
				url: 'vscode:extension/modelcontextprotocol.mcp',
				variant: 'default',
			},
			{
				type: 'external',
				label: 'VS Code MCP Docs',
				url: 'https://marketplace.visualstudio.com/items?itemName=modelcontextprotocol.mcp',
				variant: 'outline',
			},
		],
		configExample: `// Add to VS Code settings.json
{
  "mcp.servers": {
    "huggingface": {
      "command": "npx",
      "args": ["@llmindset/hf-mcp-server"],
      "env": {
        "HF_TOKEN": "your_hf_token_here"
      }
    }
  }
}`,
	},
	{
		id: 'cursor',
		name: 'Cursor',
		icon: (
			<svg
				className="h-5 w-5"
				width="1em"
				height="1em"
				viewBox="0 0 12 12"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<defs>
					<linearGradient
						id="paint0_linear_640_687"
						x1="5.99601"
						y1="5.99219"
						x2="5.99601"
						y2="11.3473"
						gradientUnits="userSpaceOnUse"
					>
						<stop className="stop-color-black dark:stop-color-white" offset="0.16" stopOpacity="0.39"></stop>
						<stop className="stop-color-black dark:stop-color-white" offset="0.658" stopOpacity="0.8"></stop>
					</linearGradient>
					<linearGradient
						id="paint1_linear_640_687"
						x1="10.6523"
						y1="3.3347"
						x2="6"
						y2="6.06268"
						gradientUnits="userSpaceOnUse"
					>
						<stop className="stop-color-black dark:stop-color-white" offset="0.182" stopOpacity="0.31"></stop>
						<stop className="stop-color-black dark:stop-color-white" offset="0.715" stopOpacity="0"></stop>
					</linearGradient>
					<linearGradient
						id="paint2_linear_640_687"
						x1="5.99601"
						y1="0.640625"
						x2="1.34375"
						y2="8.6733"
						gradientUnits="userSpaceOnUse"
					>
						<stop className="stop-color-black dark:stop-color-white" stopOpacity="0.6"></stop>
						<stop className="stop-color-black dark:stop-color-white" offset="0.667" stopOpacity="0.22"></stop>
					</linearGradient>
				</defs>
				<path
					d="M5.99601 11.3473L10.6483 8.66975L5.99601 5.99219L1.34375 8.66975L5.99601 11.3473Z"
					fill="url(#paint0_linear_640_687)"
				></path>
				<path d="M10.6523 8.6733V3.31818L6 0.640625V5.99574L10.6523 8.6733Z" fill="url(#paint1_linear_640_687)"></path>
				<path
					d="M5.99601 0.640625L1.34375 3.31818V8.6733L5.99601 5.99574V0.640625Z"
					fill="url(#paint2_linear_640_687)"
				></path>
				<path
					className="fill-gray-500 dark:fill-gray-400"
					d="M10.6523 3.32031L6 11.353V5.99787L10.6523 3.32031Z"
				></path>
				<path
					className="fill-black dark:fill-white"
					d="M10.6483 3.32031L5.99601 5.99787L1.34375 3.32031H10.6483Z"
				></path>
			</svg>
		),
		//		description: 'Use with Cursor AI editor',
		instructions: [
			{
				type: 'text',
				content: (
					<a
						href="https://cursor.com/en/install-mcp?name=huggingface&config=eyJ1cmwiOiJodHRwczovL2h1Z2dpbmdmYWNlLmNvL21jcD9sb2dpbiJ9"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-block border border-border rounded-lg p-2 hover:bg-accent/10 transition-colors duration-200"
					>
						<img
							src="https://cursor.com/deeplink/mcp-install-light.svg"
							alt="Add huggingface MCP server to Cursor"
							height="32"
							className="hover:scale-105 transition-transform duration-200"
						/>
					</a>
				),
			},
			{
				type: 'text',
				content: 'After clicking, complete authentication in your browser.',
			},
		],
		manualConfig: {
			title: 'Manual Configuration with an HF_TOKEN',
			steps: [
				{
					type: 'text',
					content: 'Edit your Cursor configuration file to add the Hugging Face MCP server:',
				},
				{
					type: 'info',
					content:
						'Location: ~/.cursor/mcp_settings.json (Mac/Linux) or %APPDATA%\\Cursor\\mcp_settings.json (Windows)',
				},
				{
					type: 'code',
					content: `{
  "mcpServers": {
    "huggingface": {
      "command": "npx",
      "args": ["@llmindset/hf-mcp-server"],
      "env": {
        "HF_TOKEN": "your_hf_token_here"
      }
    }
  }
}`,
					copyable: true,
				},
				{
					type: 'text',
					content: 'Replace "your_hf_token_here" with your actual Hugging Face API token.',
				},
			],
		},
	},
	{
		id: 'lm-studio',
		name: 'LM Studio',
		icon: (
			<svg
				className="h-5 w-5"
				xmlns="http://www.w3.org/2000/svg"
				xmlnsXlink="http://www.w3.org/1999/xlink"
				aria-hidden="true"
				focusable="false"
				role="img"
				width="1em"
				height="1em"
				preserveAspectRatio="xMidYMid meet"
				viewBox="0 0 24 24"
			>
				<path
					fill="url(#icon-lm-studio-a)"
					d="M19.337 0H4.663A4.663 4.663 0 0 0 0 4.663v14.674A4.663 4.663 0 0 0 4.663 24h14.674A4.663 4.663 0 0 0 24 19.337V4.663A4.663 4.663 0 0 0 19.337 0"
				></path>
				<g fill="#fff" opacity=".266">
					<path d="M15.803 4.35H7.418a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M19.928 7.063h-8.385a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M17.51 9.776H9.125a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M14.523 12.632H6.138a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M17.51 15.345H9.125a1 1 0 1 0 0 2h8.385a1 1 0 1 0 0-2M20.497 18.059h-4.829a1 1 0 1 0 0 1.999h4.829a1 1 0 1 0 0-2"></path>
				</g>
				<g fill="#fff" opacity=".845">
					<path d="M12.65 4.345H4.265a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M16.775 7.058H8.39a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M14.357 9.771H5.972a1 1 0 0 0 0 2h8.385a1 1 0 0 0 0-2M11.37 12.627H2.985a1 1 0 1 0 0 2h8.385a1 1 0 0 0 0-2M14.357 15.34H5.972a1 1 0 1 0 0 2h8.385a1 1 0 0 0 0-2M17.344 18.054h-4.828a1 1 0 1 0 0 1.999h4.828a1 1 0 1 0 0-2"></path>
				</g>
				<defs>
					<linearGradient
						id="icon-lm-studio-a"
						x1="78.731"
						x2="2229.6"
						y1="0"
						y2="2218.01"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="#6E7EF3"></stop>
						<stop offset="1" stopColor="#4F13BE"></stop>
					</linearGradient>
				</defs>
			</svg>
		),
		//		description: 'Use with LM Studio for local models',
		instructions: [
			{
				type: 'text',
				content: (
					<a
						href="https://lmstudio.ai/install-mcp?name=huggingface&config=eyJ1cmwiOiJodHRwczovL2h1Z2dpbmdmYWNlLmNvL21jcCIsImhlYWRlcnMiOnsiQXV0aG9yaXphdGlvbiI6IkJlYXJlciA8WU9VUl9IRl9UT0tFTj4ifX0%3D"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-block border border-border rounded-lg p-2 hover:bg-accent/10 transition-colors duration-200"
					>
						<img
							src="https://files.lmstudio.ai/deeplink/mcp-install-dark.svg"
							alt="Add MCP Server huggingface to LM Studio"
							className="hover:scale-105 transition-transform duration-200"
						/>
					</a>
				),
			},
			{
				type: 'text',
				content: 'After clicking, change your <HF_TOKEN> with your READ Hugging Face API token.',
			},
		],
	},
	{
		id: 'claude-code',
		name: 'Claude Code',
		icon: (
			<svg
				className="h-5 w-5"
				width="1em"
				height="1em"
				viewBox="0 0 12 12"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<g clip-path="url(#a)">
					<path
						d="m2.96 7.65 1.97-1.1.03-.1-.03-.05h-.1l-.33-.02-1.12-.03-.97-.04-.95-.06-.24-.05L1 5.91l.02-.15.2-.13.29.02.63.05.95.06.69.04 1.02.11h.16L5 5.84l-.06-.04-.04-.04-.99-.66-1.06-.7-.56-.41-.3-.2-.15-.2-.07-.42.28-.3.36.03.1.02.37.29.8.61 1.03.77.16.12.06-.04v-.03l-.06-.11-.57-1.02-.6-1.04-.27-.43-.07-.26c-.03-.1-.04-.2-.04-.3l.3-.42L3.8 1l.42.06.17.15.26.59.42.93.64 1.26.2.37.1.35.03.1h.07v-.06l.05-.7.1-.88.1-1.12.03-.32.16-.38.3-.2.25.11.2.29-.03.18-.12.77-.23 1.21-.15.81h.09l.1-.1.41-.54.69-.86.3-.34.36-.38.22-.18h.43l.32.47-.14.49-.44.56-.37.47-.53.71-.33.57.03.04h.08l1.2-.26.63-.11.77-.13.35.16.04.16-.14.34-.82.2-.96.2-1.44.33-.01.01.02.03.64.06.28.02h.68l1.25.09.33.22.2.26-.03.2-.5.26-.7-.16-1.59-.38-.54-.13h-.08v.04l.46.45.83.75 1.05.97.05.24-.13.2-.15-.03-.92-.69-.35-.31-.8-.68h-.06v.08l.19.27.98 1.46.05.45-.07.15-.26.09-.28-.05-.57-.8-.59-.9-.47-.82-.06.04-.28 3.02-.13.15-.3.12-.26-.2-.14-.3.14-.62.16-.8.13-.64.12-.79.07-.26v-.02H5.9l-.6.83-.9 1.22-.73.77-.17.07-.3-.15.03-.28.17-.24 1-1.27.6-.78.38-.46v-.06h-.03L2.72 8.73l-.47.06-.2-.19.02-.3.1-.1.8-.55Z"
						fill="#D97757"
					></path>
				</g>
				<defs>
					<clipPath id="a">
						<path fill="#fff" transform="translate(1 1)" d="M0 0h10v10H0z"></path>
					</clipPath>
				</defs>
			</svg>
		),
		//		description: 'Use with Claude Code in your terminal',
		instructions: [
			{
				type: 'text',
				content: 'Enter the command below to install in Claude Code:',
			},
			{
				type: 'code',
				content: 'claude mcp add hf-mcp-server -t http https://huggingface.co/mcp?login',
				copyable: true,
			},
			{
				type: 'text',
				content: 'Then start Claude and follow the instructions to complete authentication.',
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
			title: 'Using a READ HF_TOKEN instead of OAuth:',
			steps: [
				{
					type: 'text',
					content: 'To use an HF_TOKEN rather than OAuth, use the following command:',
				},
				{
					type: 'code',
					content: `claude mcp add hf-mcp-server \\
  -t http https://huggingface.co/mcp \\
  -H "Authorization: Bearer <HF_TOKEN>"`,
					copyable: true,
				},
				{
					type: 'text',
					content: 'Replace <HF_TOKEN> with your Hugging Face API token.',
				},
			],
		},
	},
	{
		id: 'other-clients',
		name: 'Other Clients',
		icon: <Bot className="h-5 w-5" />,
		description: 'Integrate with any MCP-compatible client',
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
					<div key={index} className="relative group">
						<pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
							<code className="text-foreground font-mono">{step.content}</code>
						</pre>
						{step.copyable && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => copyConfigExample(step.content)}
								className="absolute top-2 right-2 h-6 px-2 text-xs transition-all duration-200 hover:bg-secondary hover:scale-110"
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
							<CardDescription>
								Create a <a href="https://huggingface.co/join">Hugging Face account</a>{' '}
							</CardDescription>
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
										<span className="text-lg font-medium text-foreground">Choose your Apps and Tools</span>
									</div>

									<div className="relative">
										<input
											type="text"
											value="Go to MCP Settings"
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
													<h5 className="font-semibold text-sm text-foreground mb-2">
														{(client.id === 'lm-studio' || client.id === 'cursor') ? 'One Click Install:' : 'Instructions:'}
													</h5>
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
													<div className="relative group">
														<div className="flex items-center justify-between mb-2">
															<h5 className="font-semibold text-sm text-foreground">Configuration:</h5>
														</div>
														<pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
															<code className="text-foreground font-mono">{client.configExample}</code>
														</pre>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => copyConfigExample(client.configExample!)}
															className="absolute top-2 right-2 h-6 px-2 text-xs transition-all duration-200 hover:bg-secondary hover:scale-110"
														>
															<Copy className="h-3 w-3 mr-1" />
															Copy
														</Button>
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
