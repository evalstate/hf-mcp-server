import { z } from 'zod';
import { listFiles, spaceInfo } from '@huggingface/hub';
import type { SpaceEntry } from '@huggingface/hub';
import { formatBytes, escapeMarkdown } from './utilities.js';
import { HfApiError } from './hf-api-call.js';
import { explain } from './error-messages.js';

// Define the FileWithUrl interface
export interface FileWithUrl {
	path: string;
	size: number;
	type: 'file' | 'directory' | 'unknown';
	url: string;
	sizeFormatted: string;
	lastModified?: string;
	lfs: boolean;
}

// Tool configuration
export const SPACE_FILES_TOOL_CONFIG = {
	name: 'space_files',
	description: '', // This will be dynamically set with username
	schema: z.object({
		spaceName: z.string().optional().describe('Space identifier in format "username/spacename"'),
		format: z
			.enum(['detailed', 'simple'])
			.optional()
			.default('detailed')
			.describe('Output format: detailed (grouped by directory) or simple (flat list)'),
	}),
	annotations: {
		title: 'Space Files List',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;

// Define parameter types
export type SpaceFilesParams = z.infer<typeof SPACE_FILES_TOOL_CONFIG.schema>;

/**
 * Service for listing files in Hugging Face Spaces
 */
export class SpaceFilesTool {
	private readonly accessToken?: string;
	private readonly username?: string;

	constructor(hfToken?: string, username?: string) {
		this.accessToken = hfToken;
		this.username = username;
	}

	static createToolConfig(username?: string) {
		const description = username
			? `List all files in a static Hugging Face Space. Use the direct download URL when specifying Files inputs for Gradio endpoints. Defaults to ${username}/filedrop.`
			: `List all files in a static Hugging Face Space. Use the direct download URL when specifying Files inputs for Gradio endpoints.`;
		return {
			...SPACE_FILES_TOOL_CONFIG,
			description,
		};
	}

	/**
	 * Get all files in a space with their URLs
	 */
	async getSpaceFilesWithUrls(spaceName: string): Promise<FileWithUrl[]> {
		try {
			// Get space info to determine subdomain
			const space = await spaceInfo({
				name: spaceName,
				additionalFields: ['subdomain'],
				...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
			});

			// Check if it's a static space
			if (space.sdk !== 'static') {
				throw new Error(
					`Space "${spaceName}" is not a static space (found: ${space.sdk}). This tool only works with static HTML/CSS/JS spaces.`
				);
			}

			// Construct base URL
			const subdomain = (space as SpaceEntry & { subdomain?: string }).subdomain;

			const files: FileWithUrl[] = [];

			// List all files recursively
			for await (const file of listFiles({
				repo: { type: 'space', name: spaceName },
				recursive: true,
				expand: true, // Get last commit info
				...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
			})) {
				if (file.type === 'file') {
					files.push({
						path: file.path,
						size: file.size,
						type: file.type,
						url: this.constructFileUrl(spaceName, file.path, subdomain),
						sizeFormatted: formatBytes(file.size),
						lastModified: file.lastCommit?.date,
						lfs: !!file.lfs,
					});
				}
			}

			return files.sort((a, b) => a.path.localeCompare(b.path));
		} catch (error) {
			if (error instanceof HfApiError) {
				throw explain(error, `Failed to list files for space "${spaceName}"`);
			}
			throw error;
		}
	}

	/**
	 * Construct the URL for a file
	 */
	private constructFileUrl(spaceName: string, filePath: string, subdomain?: string): string {
		// For static spaces with custom domains
		if (subdomain) {
			// Remove leading slash if present
			const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
			return `https://${subdomain}.static.hf.space/${cleanPath}`;
		}

		// Fallback to direct HF URL
		return `https://huggingface.co/spaces/${spaceName}/resolve/main/${filePath}`;
	}

	/**
	 * Generate detailed markdown report with files grouped by directory
	 */
	async generateDetailedMarkdown(spaceName: string): Promise<string> {
		const files = await this.getSpaceFilesWithUrls(spaceName);

		let markdown = `# Files in Space: ${spaceName}\n\n`;
		markdown += `**Total Files**: ${files.length}\n`;
		markdown += `**Total Size**: ${formatBytes(files.reduce((sum, f) => sum + f.size, 0))}\n\n`;

		// Group files by directory
		const byDirectory = files.reduce(
			(acc, file) => {
				const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '/';
				if (!acc[dir]) acc[dir] = [];
				acc[dir].push(file);
				return acc;
			},
			{} as Record<string, FileWithUrl[]>
		);

		// Generate table
		markdown += `## All Files\n\n`;
		markdown += `| File Path | Size | Type | Last Modified | URL |\n`;
		markdown += `|-----------|------|------|---------------|-----|\n`;

		// Sort directories and output files
		const sortedDirs = Object.keys(byDirectory).sort();
		for (const dir of sortedDirs) {
			const dirFiles = byDirectory[dir];
			if (!dirFiles) continue;

			if (dir !== '/' && dirFiles.length > 0) {
				markdown += `| **📁 ${escapeMarkdown(dir)}/** | | | | |\n`;
			}

			for (const file of dirFiles) {
				const fileName = file.path.split('/').pop() || file.path;
				const indent = dir === '/' ? '' : '&nbsp;&nbsp;&nbsp;&nbsp;';
				const icon = this.getFileIcon(fileName);
				const lastMod = file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-';

				markdown += `| ${indent}${icon} ${escapeMarkdown(fileName)} | ${file.sizeFormatted} | ${file.lfs ? 'LFS' : 'Regular'} | ${lastMod} | ${file.url} |\n`;
			}
		}

		// Add direct access examples
		markdown += `\n## Direct Access Examples\n\n`;
		markdown += `\`\`\`bash\n`;

		// Show a few example URLs
		const examples = files.slice(0, 3);
		for (const file of examples) {
			markdown += `# Download ${file.path}\n`;
			markdown += `curl -O ${file.url}\n\n`;
		}
		markdown += `\`\`\`\n`;
		markdown += '## Use the URL when specifying Files inputs for Gradio endpoints.\n\n';

		return markdown;
	}

	/**
	 * Generate simple markdown table without grouping
	 */
	async generateSimpleMarkdown(spaceName: string): Promise<string> {
		const files = await this.getSpaceFilesWithUrls(spaceName);

		let markdown = `# Files in ${spaceName}\n\n`;
		markdown += `| File Name | Path | Size | URL |\n`;
		markdown += `|-----------|------|------|-----|\n`;

		for (const file of files) {
			const fileName = file.path.split('/').pop() || file.path;
			const icon = this.getFileIcon(fileName);
			markdown += `| ${icon} ${escapeMarkdown(fileName)} | ${escapeMarkdown(file.path)} | ${file.sizeFormatted} | [Link](${file.url}) |\n`;
		}

		return markdown;
	}

	/**
	 * List files with the specified format
	 */
	async listFiles(params: SpaceFilesParams): Promise<string> {
		const { format } = params;

		// Use provided spaceName or default to username/filedrop
		const spaceName = params.spaceName || (this.username ? `${this.username}/filedrop` : 'filedrop');

		if (format === 'simple') {
			return this.generateSimpleMarkdown(spaceName);
		}
		return this.generateDetailedMarkdown(spaceName);
	}

	/**
	 * Get file icon based on extension
	 */
	private getFileIcon(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase();
		const iconMap: Record<string, string> = {
			py: '🐍',
			js: '📜',
			ts: '📘',
			md: '📝',
			txt: '📄',
			json: '📊',
			yaml: '⚙️',
			yml: '⚙️',
			png: '🖼️',
			jpg: '🖼️',
			jpeg: '🖼️',
			gif: '🖼️',
			svg: '🎨',
			mp4: '🎬',
			mp3: '🎵',
			pdf: '📕',
			zip: '📦',
			tar: '📦',
			gz: '📦',
			html: '🌐',
			css: '🎨',
			ipynb: '📓',
			csv: '📊',
			parquet: '🗄️',
			safetensors: '🤖',
			bin: '💾',
			pkl: '🥒',
			h5: '🗃️',
		};

		return iconMap[ext || ''] || '📄';
	}
}
