/**
 * Utility functions for handling Gradio endpoint detection and configuration
 */

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