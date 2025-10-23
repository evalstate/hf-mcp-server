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
import type { ToolResult } from '../types/tool-result.js';
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

	// Show what was provided
	const providedKeys = args && typeof args === 'object' ? Object.keys(args) : [];
	if (providedKeys.length > 0) {
		errorMessage += `You provided: ${JSON.stringify(args, null, 2)}`;
	} else {
		errorMessage += `You provided: {} (no parameters)`;
	}

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
# Command as array (recommended, especially for complex commands)
hf_jobs("run", {
  "image": "python:3.12",
  "command": ["python", "-c", "print('Hello from HF Jobs!')"],
  "flavor": "cpu-basic"
})

# Command as string (parsed with POSIX shell semantics)
hf_jobs("run", {
  "image": "python:3.12",
  "command": "python -c \\"print('Hello world!')\\"",
  "flavor": "cpu-basic"
})
\`\`\`

### Run multiline Python scripts
\`\`\`
# Use array format with newlines in the -c argument
hf_jobs("run", {
  "image": "python:3.12",
  "command": ["python", "-c", "import sys\\nprint('Line 1')\\nprint('Line 2')"],
  "flavor": "cpu-basic"
})
\`\`\`

### Run bash/shell commands
\`\`\`
hf_jobs("run", {
  "image": "ubuntu:22.04",
  "command": ["bash", "-c", "apt-get update && apt-get install -y curl"],
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

## Hardware Flavors

**CPU:** cpu-basic, cpu-upgrade, cpu-performance, cpu-xl
**GPU:** t4-small, t4-medium, l4x1, a10g-small, a10g-large, a100-large, h100
**Specialized:** inf2x6 (AWS Inferentia)

## Command Format Guidelines

**Array format (recommended):**
- Use for complex commands, multiline scripts, or commands with special characters
- No quoting/escaping needed: \`["python", "-c", "print('hello')"]\`
- Works with any language: Python, bash, npm, etc.

**String format:**
- Parsed with POSIX shell semantics (quotes, escaping)
- Good for simple commands: \`"python script.py"\`
- Shell operators (|, &&, >, etc.) are NOT supported - use array with \`bash -c\` instead

## Tips

- Jobs default to detached mode (return immediately with job ID)
- Use Hub resources directly: \`load_dataset('squad')\`, \`AutoModel.from_pretrained('bert-base')\`
- Pass HF_TOKEN via secrets for private resources
- Logs are time-limited (10s max) - check job page for full logs
- For shell pipes/operators, use: \`["bash", "-c", "cmd1 | cmd2"]\`
`;

/**
 * Jobs tool configuration
 */
export const HF_JOBS_TOOL_CONFIG = {
	name: 'hf_jobs',
	description:
		'Manage HuggingFace compute jobs. Run any command in Docker containers (Python, Node.js, bash, etc.), ' +
		'execute Python scripts with UV package manager, manage scheduled jobs, and monitor job status and logs. ' +
		'Supports CPU and GPU hardware. Call with no arguments for full usage instructions and examples.',
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
		title: 'HuggingFace Jobs',
		destructiveHint: false,
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
		const args = params.args || {};

		// Validate command arguments if schema exists
		const schema = COMMAND_SCHEMAS[command as keyof typeof COMMAND_SCHEMAS];
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
					result = await scheduledRunCommand(args as ScheduledRunArgs, this.client);
					break;

				case 'scheduled uv':
					result = await scheduledUvCommand(args as ScheduledUvArgs, this.client);
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
