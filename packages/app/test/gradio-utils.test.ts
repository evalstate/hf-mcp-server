import { describe, it, expect } from 'vitest';
import { isGradioTool } from '../src/server/utils/gradio-utils.js';

describe('isGradioTool', () => {
	describe('should return true for valid Gradio tool names', () => {
		it('should detect basic gr tools', () => {
			expect(isGradioTool('gr1_tool')).toBe(true);
			expect(isGradioTool('gr2_another_tool')).toBe(true);
			expect(isGradioTool('gr999_test')).toBe(true);
		});

		it('should detect grp (private) tools', () => {
			expect(isGradioTool('grp1_private_tool')).toBe(true);
			expect(isGradioTool('grp2_another_private')).toBe(true);
			expect(isGradioTool('grp10_test')).toBe(true);
		});

		it('should detect real-world Gradio tool names', () => {
			expect(isGradioTool('gr1_evalstate_flux1_schnell')).toBe(true);
			expect(isGradioTool('grp3_my_private_space')).toBe(true);
			expect(isGradioTool('gr42_image_generator')).toBe(true);
		});

		it('should handle complex tool names with multiple underscores', () => {
			expect(isGradioTool('gr1_some_complex_tool_name_here')).toBe(true);
			expect(isGradioTool('grp5_another_complex_private_tool')).toBe(true);
		});
	});

	describe('should return false for non-Gradio tool names', () => {
		it('should reject standard HF tools', () => {
			expect(isGradioTool('hf_doc_search')).toBe(false);
			expect(isGradioTool('hf_model_search')).toBe(false);
			expect(isGradioTool('hf_whoami')).toBe(false);
		});

		it('should reject tools with missing number', () => {
			expect(isGradioTool('gr_tool')).toBe(false);
			expect(isGradioTool('grp_tool')).toBe(false);
		});

		it('should reject tools with missing underscore', () => {
			expect(isGradioTool('gr1tool')).toBe(false);
			expect(isGradioTool('grp2tool')).toBe(false);
		});

		it('should reject tools that do not start with gr/grp', () => {
			expect(isGradioTool('1_gr_tool')).toBe(false);
			expect(isGradioTool('some_gr1_tool')).toBe(false);
			expect(isGradioTool('prefix_grp2_tool')).toBe(false);
		});

		it('should reject empty or invalid inputs', () => {
			expect(isGradioTool('')).toBe(false);
			expect(isGradioTool('gr')).toBe(false);
			expect(isGradioTool('grp')).toBe(false);
			expect(isGradioTool('gr1')).toBe(false);
			expect(isGradioTool('grp1')).toBe(false);
		});

		it('should reject regular tool names', () => {
			expect(isGradioTool('regular_tool')).toBe(false);
			expect(isGradioTool('some_function')).toBe(false);
			expect(isGradioTool('tool_name')).toBe(false);
			expect(isGradioTool('api_call')).toBe(false);
		});

		it('should reject tools with invalid format variations', () => {
			expect(isGradioTool('gra1_tool')).toBe(false);
			expect(isGradioTool('grpp1_tool')).toBe(false);
			expect(isGradioTool('gr_1_tool')).toBe(false);
			expect(isGradioTool('grp_1_tool')).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle tools with numbers in the name part', () => {
			expect(isGradioTool('gr1_tool2')).toBe(true);
			expect(isGradioTool('grp1_v2_api')).toBe(true);
		});

		it('should handle tools with special characters in the name part', () => {
			expect(isGradioTool('gr1_tool-name')).toBe(true);
			expect(isGradioTool('grp1_tool.api')).toBe(true);
		});

		it('should require at least one digit', () => {
			expect(isGradioTool('gr_tool')).toBe(false);
			expect(isGradioTool('grp_tool')).toBe(false);
		});
	});
});