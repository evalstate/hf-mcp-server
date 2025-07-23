/**
 * Utility functions for handling Gradio endpoint detection and configuration
 */
import { GRADIO_PREFIX, GRADIO_PRIVATE_PREFIX } from '../../shared/constants.js';

/**
 * Determines if a tool name represents a Gradio endpoint
 * Gradio tools follow the pattern: gr<number>_<name> or grp<number>_<name>
 *
 * @param toolName - The name of the tool to check
 * @returns true if the tool is a Gradio endpoint, false otherwise
 *
 * @example
 * isGradioTool('gr1_evalstate_flux1_schnell') // true
 * isGradioTool('grp2_private_tool') // true
 * isGradioTool('hf_doc_search') // false
 * isGradioTool('regular_tool') // false
 */
export function isGradioTool(toolName: string): boolean {
	// Gradio tools follow pattern: gr<number>_<name> or grp<number>_<name>
	return /^grp?\d+_/.test(toolName);
}

/**
 * Creates a Gradio tool name based on tool name, index, and privacy status
 * This is the core logic used throughout the application for generating tool names
 *
 * @param toolName - The tool name (e.g., "flux1_schnell", "EasyGhibli")
 * @param index - Zero-based index position (will be converted to 1-based)
 * @param isPrivate - Whether this is a private space (determines gr vs grp prefix)
 * @returns The generated tool name following Gradio naming convention
 *
 * @example
 * createGradioToolName('flux1_schnell', 0, false) // 'gr1_flux1_schnell'
 * createGradioToolName('EasyGhibli', 1, false) // 'gr2_easyghibli'
 * createGradioToolName('private.model', 2, true) // 'grp3_private_model'
 */
export function createGradioToolName(toolName: string, index: number, isPrivate: boolean | undefined): string {
	// Choose prefix based on privacy status
	const prefix = isPrivate ? GRADIO_PRIVATE_PREFIX : GRADIO_PREFIX;
	const indexStr = (index + 1).toString();

	// Calculate available space for the sanitized name (40 - prefix - index - underscore)
	const maxNameLength = 40 - prefix.length - indexStr.length - 1;

	// Sanitize the tool name: replace special characters with underscores, normalize multiple underscores, and lowercase
	let sanitizedName = toolName
		? toolName
				.replace(/[-\s.]+/g, '_') // Replace special chars with underscores
				.replace(/_+/g, '_') // Normalize multiple underscores to single
				.toLowerCase()
		: 'unknown';

	// Truncate if necessary to fit within 40 character limit
	if (sanitizedName.length > maxNameLength) {
		sanitizedName = sanitizedName.substring(0, maxNameLength);
	}

	// Create tool name: {prefix}{1-based-index}_{sanitized_name}
	return `${prefix}${indexStr}_${sanitizedName}`;
}
