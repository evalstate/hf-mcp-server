import { createGradioToolName } from './packages/app/dist/server/utils/gradio-utils.js';

const tool1 = 'image_utilities_mcp_update_text_image_______'; // 44 chars
const tool2 = 'image_utilities_mcp_update_text_image________'; // 45 chars

console.log('Tool1 length:', tool1.length);
console.log('Tool2 length:', tool2.length);

const result1 = createGradioToolName(tool1, 29, false);
const result2 = createGradioToolName(tool2, 29, false);

console.log('\nResult1:', result1);
console.log('Result1 length:', result1.length);
console.log('\nResult2:', result2);
console.log('Result2 length:', result2.length);

console.log('\nDo they collide?', result1 === result2);

// Let's trace through the calculation
const prefix = 'gr';
const indexStr = '30';
const maxNameLength = 49 - prefix.length - indexStr.length - 1;
console.log('\nMax name length:', maxNameLength); // Should be 44

// For tool2 (45 chars), it exceeds by 1
const keepFromEnd = maxNameLength - 20 - 1; // 44 - 20 - 1 = 23
console.log('Keep from end:', keepFromEnd);
console.log('First 20 chars of tool2:', tool2.substring(0, 20));
console.log('Last', keepFromEnd, 'chars of tool2:', tool2.slice(-keepFromEnd));