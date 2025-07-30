import { createGradioToolName } from './packages/app/dist/server/utils/gradio-utils.js';

// Test individual cases to get correct expectations
console.log('=== Test sanitization ===');
console.log('multi--dash__test:', createGradioToolName('multi--dash__test', 0, false));

console.log('\n=== Test truncation with tool index ===');
const longName = 'very_long_tool_name_that_exceeds_forty_nine_characters_total_and_more';
console.log('Long name length:', longName.length);
console.log('Without toolIndex:', createGradioToolName(longName, 0, false));
console.log('With toolIndex 0:', createGradioToolName(longName, 0, false, 0));
console.log('With toolIndex 1:', createGradioToolName(longName, 0, false, 1));

console.log('\n=== Test collision scenario ===');
const baseName = 'image_utilities_mcp_update_text_image________';
console.log('Base name length:', baseName.length);
const tools = [0, 1, 2, 3].map(toolIdx => 
    createGradioToolName(baseName, 29, false, toolIdx)
);
tools.forEach((tool, idx) => console.log(`Tool ${idx}:`, tool));

console.log('\n=== Original collision test ===');
const tool1 = 'image_utilities_mcp_gradio_apply_filter__';
const tool2 = 'image_utilities_mcp_gradio_apply_filter_';

console.log('Tool1:', tool1, 'Length:', tool1.length);
console.log('Tool2:', tool2, 'Length:', tool2.length);

const result1 = createGradioToolName(tool1, 0, false, 0);
const result2 = createGradioToolName(tool2, 0, false, 1);

console.log('Result1:', result1);
console.log('Result2:', result2);
console.log('Collision?', result1 === result2);