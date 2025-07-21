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
 * Creates a Gradio tool name based on space name, index, and privacy status
 * This is the core logic used throughout the application for generating tool names
 * 
 * @param spaceName - The original space name (e.g., "evalstate/flux1_schnell")
 * @param index - Zero-based index position (will be converted to 1-based)
 * @param isPrivate - Whether this is a private space (determines gr vs grp prefix)
 * @returns The generated tool name following Gradio naming convention
 * 
 * @example
 * createGradioToolName('evalstate/flux1_schnell', 0, false) // 'gr1_evalstate_flux1_schnell'
 * createGradioToolName('abidlabs/EasyGhibli', 1, false) // 'gr2_abidlabs_easyghibli'
 * createGradioToolName('my-space/private.model', 2, true) // 'grp3_my_space_private_model'
 */
export function createGradioToolName(spaceName: string, index: number, isPrivate: boolean): string {
	// Sanitize the space name: replace special characters with underscores and lowercase
	const sanitizedName = spaceName ? spaceName.replace(/[/\-\s.]+/g, '_').toLowerCase() : 'unknown';
	
	// Choose prefix based on privacy status
	const prefix = isPrivate ? GRADIO_PRIVATE_PREFIX : GRADIO_PREFIX;
	
	// Create tool name: {prefix}{1-based-index}_{sanitized_name}
	return `${prefix}${(index + 1).toString()}_${sanitizedName}`;
}