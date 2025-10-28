import { z } from 'zod';
import { JobsApiClient } from './api-client.js';
import { HfApiError } from '../hf-api-call.js';
import { runCommand, uvCommand } from './commands/run.js';
import { psCommand } from './commands/ps.js';
import { logsCommand } from './commands/logs.js';
import { inspectCommand, cancelCommand } from './commands/inspect.js';
import {
	scheduledRunCommand,
	scheduledUvCommand,
	scheduledPsCommand,
	scheduledInspectCommand,
	scheduledDeleteCommand,
	scheduledSuspendCommand,
	scheduledResumeCommand,
} from './commands/scheduled.js';
import { formatCommandHelp } from './schema-help.js';
import type { ToolResult } from '../types/tool-result.js';
import { CPU_FLAVORS, GPU_FLAVORS, SPECIALIZED_FLAVORS } from './types.js';
import type {
	RunArgs,
	UvArgs,
	PsArgs,
	LogsArgs,
	InspectArgs,
	CancelArgs,
	ScheduledRunArgs,
	ScheduledUvArgs,
	ScheduledPsArgs,
	ScheduledJobArgs,
} from './types.js';

// Re-export types
export * from './types.js';
export { JobsApiClient } from './api-client.js';

// Import Zod schemas for validation
import {
	runArgsSchema,
	uvArgsSchema,
	psArgsSchema,
	logsArgsSchema,
	inspectArgsSchema,
	cancelArgsSchema,
	scheduledRunArgsSchema,
	scheduledUvArgsSchema,
	scheduledPsArgsSchema,
	scheduledJobArgsSchema,
} from './types.js';

/**
 * Map of command names to their validation schemas
 */
const COMMAND_SCHEMAS = {
	run: runArgsSchema,
	uv: uvArgsSchema,
	ps: psArgsSchema,
	logs: logsArgsSchema,
	inspect: inspectArgsSchema,
	cancel: cancelArgsSchema,
	'scheduled run': scheduledRunArgsSchema,
	'scheduled uv': scheduledUvArgsSchema,
	'scheduled ps': scheduledPsArgsSchema,
	'scheduled inspect': scheduledJobArgsSchema,
	'scheduled delete': scheduledJobArgsSchema,
	'scheduled suspend': scheduledJobArgsSchema,
	'scheduled resume': scheduledJobArgsSchema,
} as const;

const HELP_FLAG = 'help';

const CPU_FLAVOR_LIST = CPU_FLAVORS.join(', ');
const GPU_FLAVOR_LIST = GPU_FLAVORS.join(', ');
const SPECIALIZED_FLAVOR_LIST = SPECIALIZED_FLAVORS.join(', ');
const HARDWARE_FLAVORS_SECTION = [
	`**CPU:** ${CPU_FLAVOR_LIST}`,
	GPU_FLAVORS.length ? `**GPU:** ${GPU_FLAVOR_LIST}` : undefined,
	SPECIALIZED_FLAVORS.length ? `**Specialized:** ${SPECIALIZED_FLAVOR_LIST}` : undefined,
]
	.filter((line): line is string => Boolean(line))
	.join('\n');

function isHelpRequested(args: Record<string, unknown> | undefined): boolean {
	if (!args) {
		return false;
	}

	const helpValue = args[HELP_FLAG];
	return helpValue === true || helpValue === 'true';
}

function removeHelpFlag(args: Record<string, unknown> | undefined): Record<string, unknown> {
	if (!args || !(HELP_FLAG in args)) {
		return args ?? {};
	}

	const { [HELP_FLAG]: _ignored, ...rest } = args;
	return rest;
}

/**
 * Validate command arguments against a Zod schema
 * Returns a ToolResult with detailed error message if validation fails
 */
function validateArgs(
	schema: z.ZodSchema,
	args: unknown,
	commandName: string
): { success: true } | { success: false; errorResult: ToolResult } {
	const result = schema.safeParse(args);

	if (result.success) {
		return { success: true };
	}

	// Format Zod errors into a helpful message
	const errors = result.error.errors;
	const missingFields: string[] = [];
	const invalidFields: string[] = [];

	for (const err of errors) {
		const field = err.path.join('.');
		if (err.code === 'invalid_type' && err.received === 'undefined') {
			missingFields.push(`  • ${field}: ${err.message}`);
		} else {
			invalidFields.push(`  • ${field}: ${err.message}`);
		}
	}

	let errorMessage = `Error: Invalid parameters for '${commandName}'\n\n`;

	if (missingFields.length > 0) {
		errorMessage += `Missing required parameters:\n${missingFields.join('\n')}\n\n`;
	}

	if (invalidFields.length > 0) {
		errorMessage += `Invalid parameters:\n${invalidFields.join('\n')}\n\n`;
	}

	errorMessage += `Call hf_jobs("${commandName}", {"help": true}) to see valid arguments.`;

	return {
		success: false,
		errorResult: {
			formatted: errorMessage,
			totalResults: 0,
			resultsShared: 0,
			isError: true,
		},
	};
}

/**
 * Usage instructions when tool is called with no arguments
 */
const USAGE_INSTRUCTIONS = `# HuggingFace Jobs API

Manage compute jobs on Hugging Face infrastructure.

## Available Commands

### Job Management
- **run** - Run a job with a Docker image
- **uv** - Run a Python script with UV (inline dependencies)
- **ps** - List jobs
- **logs** - Fetch job logs
- **inspect** - Get detailed job information
- **cancel** - Cancel a running job

### Scheduled Jobs
- **scheduled run** - Create a scheduled job
- **scheduled uv** - Create a scheduled UV job
- **scheduled ps** - List scheduled jobs
- **scheduled inspect** - Get scheduled job details
- **scheduled delete** - Delete a scheduled job
- **scheduled suspend** - Pause a scheduled job
- **scheduled resume** - Resume a suspended job

## Examples

### Run a simple job
\`\`\`
hf_jobs("run", {
  "image": "python:3.12",
  "command": ["python", "-c", "print('Hello from HF Jobs!')"],
  "flavor": "cpu-basic"
})
\`\`\`

### Use a Hugging Face Space as the image
\`\`\`
hf_jobs("run", {
  "image": "hf.co/spaces/username/spacename",
  "command": ["python", "app.py"],
  "flavor": "cpu-basic"
})
\`\`\`

### Run multiline Python scripts
\`\`\`
hf_jobs("run", {
  "image": "python:3.12",
  "command": ["python", "-c", "import sys\\nprint('Line 1')\\nprint('Line 2')"],
  "flavor": "cpu-basic"
})
\`\`\`

### Run a Python Script from a URL with UV
\`\`\`
hf_jobs("uv", {
  "script": "https://huggingface.co/datasets/uv-scripts/classification/blob/main/classify-dataset.py",
  "with_deps": ["pandas"],
  "script_args": ["--input", "data.csv"],
  "flavor": "cpu-basic"
})
\`\`\`

### Run an inline Python script with UV
\`\`\`
hf_jobs("uv", {
  "script": "import math\\nprint('area:', math.pi * 4**2)"
})
\`\`\`


### Run bash/shell commands
\`\`\`
hf_jobs("run", {
  "image": "ubuntu:22.04",
  "command": ["/bin/sh", "-lc", "apt-get update && apt-get install -y curl"],
  "flavor": "cpu-basic"
})
\`\`\`

### List running jobs
\`\`\`
hf_jobs("ps")
\`\`\`

### Get job logs
\`\`\`
hf_jobs("logs", {"job_id": "your-job-id"})
\`\`\`

### Run with GPU
\`\`\`
hf_jobs("run", {
  "image": "pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel",
  "command": ["python", "train.py"],
  "flavor": "a10g-small"
})
\`\`\`

### Schedule a job
\`\`\`
hf_jobs("scheduled run", {
  "schedule": "@hourly",
  "image": "python:3.12",
  "command": ["python", "backup.py"]
})
\`\`\`

### Schedule a UV script
\`\`\`
hf_jobs("scheduled uv", {
  "schedule": "0 9 * * 1-5",
  "script": "https://huggingface.co/datasets/uv-scripts/classification/blob/main/classify-dataset.py",
  "with_deps": ["pandas"],
  "script_args": ["--input", "data.csv"]
})
\`\`\`

## Hardware Flavors

${HARDWARE_FLAVORS_SECTION}

## Command Format Guidelines

**Array format (default):**
- Recommended for every command—JSON keeps arguments intact (URLs with \`&\`, spaces, etc.)
- Use \`["/bin/sh", "-lc", "..."]\` when you need shell operators like \`&&\`, \`|\`, or redirections
- Works with any language: Python, bash, node, npm, uv, etc.

**String format (simple cases only):**
- Still accepted for backwards compatibility, parsed with POSIX shell semantics
- Rejects shell operators and can mis-handle characters such as \`&\`; switch to arrays when things turn complex
- \`$HF_TOKEN\` stays literal—forward it via \`secrets: { "HF_TOKEN": "$HF_TOKEN" }\`

**Multiline inline scripts:**
- Include newline characters directly in the argument (e.g., \`"first line\\nsecond line"\`)
- UV inline scripts are automatically base64-decoded inside the container; just send the raw script text

### Show command-specific help
\`\`\`
hf_jobs("<command>", {"help": true})
\`\`\`

## Tips

- The uv-scripts organisation contains examples for common tasks. dataset_search {'author':'uv-scripts'}
- Jobs default to detached mode, returning after 10 seconds..
- Prefer array commands to avoid shell parsing surprises
- To access private Hub assets, include \`secrets: { "HF_TOKEN": "$HF_TOKEN" }\` (or \`${'${HF_TOKEN}'}\`) to inject your auth token.
- Logs are time-limited (10s max) - check job page for full logs
`;

/**
 * Jobs tool configuration
 */
export const HF_JOBS_TOOL_CONFIG = {
	name: 'hf_jobs',
	description:
		'Manage HuggingFace compute jobs. Run commands in Docker containers, ' +
		'execute Python scripts with UV, schedule and monitor jobs, status and logs. ' +
		'Call hf_jobs with no command for full usage instructions and examples. ' +
		'Supports CPU and GPU hardware.',
	schema: z.object({
		command: z
			.string()
			.optional()
			.describe(
				'Command to execute: "run", "uv", "ps", "logs", "inspect", "cancel", ' +
					'"scheduled run", "scheduled uv", "scheduled ps", "scheduled inspect", ' +
					'"scheduled delete", "scheduled suspend", "scheduled resume"'
			),
		args: z.record(z.any()).optional().describe('Command-specific arguments as a JSON object'),
	}),
	annotations: {
		title: 'Hugging Face Jobs', // omit destructive hint.
		readOnlyHint: false,
		openWorldHint: true,
	},
} as const;

/**
 * Jobs tool implementation
 */
export class HfJobsTool {
	private client: JobsApiClient;
	private hfToken?: string;
	private isAuthenticated: boolean;

	constructor(hfToken?: string, isAuthenticated?: boolean, namespace?: string) {
		this.hfToken = hfToken;
		this.isAuthenticated = isAuthenticated ?? !!hfToken;
		this.client = new JobsApiClient(hfToken, namespace);
	}

	/**
	 * Execute a jobs command
	 */
	async execute(params: { command?: string; args?: Record<string, unknown> }): Promise<ToolResult> {
		// If not authenticated, show upgrade message
		if (!this.isAuthenticated) {
			return {
				formatted:
					'Jobs are available for Pro, Team and Enterprise users. Go to https://huggingface.co/pricing to get started.',
				totalResults: 0,
				resultsShared: 0,
			};
		}

		// If no command provided, return usage instructions
		if (!params.command) {
			return {
				formatted: USAGE_INSTRUCTIONS,
				totalResults: 1,
				resultsShared: 1,
			};
		}

		const command = params.command.toLowerCase();
		const rawArgs = params.args || {};
		const schema = COMMAND_SCHEMAS[command as keyof typeof COMMAND_SCHEMAS];
		const helpRequested = isHelpRequested(rawArgs);

		if (helpRequested) {
			if (!schema) {
				return {
					formatted: `No help available for '${params.command}'.`,
					totalResults: 0,
					resultsShared: 0,
				};
			}

			return {
				formatted: formatCommandHelp(command, schema),
				totalResults: 1,
				resultsShared: 1,
			};
		}

		const args = removeHelpFlag(rawArgs);

		// Validate command arguments if schema exists
		if (schema) {
			const validation = validateArgs(schema, args, command);
			if (!validation.success) {
				return validation.errorResult;
			}
		}

		try {
			let result: string;

			switch (command) {
				case 'run':
					result = await runCommand(args as RunArgs, this.client, this.hfToken);
					break;

				case 'uv':
					result = await uvCommand(args as UvArgs, this.client, this.hfToken);
					break;

				case 'ps':
					result = await psCommand(args as PsArgs, this.client);
					break;

				case 'logs':
					result = await logsCommand(args as LogsArgs, this.client, this.hfToken);
					break;

				case 'inspect':
					result = await inspectCommand(args as InspectArgs, this.client);
					break;

				case 'cancel':
					result = await cancelCommand(args as CancelArgs, this.client);
					break;

				case 'scheduled run':
					result = await scheduledRunCommand(args as ScheduledRunArgs, this.client, this.hfToken);
					break;

				case 'scheduled uv':
					result = await scheduledUvCommand(args as ScheduledUvArgs, this.client, this.hfToken);
					break;

				case 'scheduled ps':
					result = await scheduledPsCommand(args as ScheduledPsArgs, this.client);
					break;

				case 'scheduled inspect':
					result = await scheduledInspectCommand(args as ScheduledJobArgs, this.client);
					break;

				case 'scheduled delete':
					result = await scheduledDeleteCommand(args as ScheduledJobArgs, this.client);
					break;

				case 'scheduled suspend':
					result = await scheduledSuspendCommand(args as ScheduledJobArgs, this.client);
					break;

				case 'scheduled resume':
					result = await scheduledResumeCommand(args as ScheduledJobArgs, this.client);
					break;

				default:
					return {
						formatted: `Unknown command: "${params.command}"
Available commands:
- run, uv, ps, logs, inspect, cancel
- scheduled run, scheduled uv, scheduled ps, scheduled inspect, scheduled delete, scheduled suspend, scheduled resume

Call hf_jobs() with no arguments for full usage instructions.`,
						totalResults: 0,
						resultsShared: 0,
					};
			}

			return {
				formatted: result,
				totalResults: 1,
				resultsShared: 1,
			};
		} catch (error) {
			let errorMessage = error instanceof Error ? error.message : String(error);

			// If this is an HfApiError with a response body, include it
			if (error instanceof HfApiError && error.responseBody) {
				try {
					// Try to parse and format the response body
					const parsed: unknown = JSON.parse(error.responseBody);
					const formattedBody = JSON.stringify(parsed, null, 2);
					errorMessage += `\n\nServer response:\n${formattedBody}`;
				} catch {
					// If not valid JSON, include raw response (if not too long)
					if (error.responseBody.length < 500) {
						errorMessage += `\n\nServer response: ${error.responseBody}`;
					}
				}
			}

			return {
				formatted: `Error executing ${params.command}: ${errorMessage}`,
				totalResults: 0,
				resultsShared: 0,
				isError: true,
			};
		}
	}
}
