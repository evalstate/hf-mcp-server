// Simple test file for semantic search
import { formatSearchResults } from './dist/src/services/semantic-search.js';

// Sample search results with emoji and relevance score
const mockResults = [
  {
    id: "philschmid/image-generation-editing",
    sdk: "gradio",
    likes: 123,
    title: "Image Generation & Editing",
    shortDescription: "Generate and Edit images with Gemini 2.0",
    author: "philschmid",
    authorData: {
      fullname: "Philipp Schmid"
    },
    emoji: "🖼️",
    semanticRelevancyScore: 0.8841320346665694
  },
  {
    id: "Heartsync/NSFW-image",
    sdk: "gradio",
    likes: 17,
    title: "NSFW Detection",
    shortDescription: "AI-powered NSFW content detection",
    author: "Heartsync",
    authorData: {
      fullname: "KAISAR"
    },
    emoji: "⚡️",
    semanticRelevancyScore: 0.7523691094398499
  }
];

// Format the search results
const formattedResults = formatSearchResults("theQuery",mockResults);

// Print the raw data and formatted results
console.log("Raw data:");
console.log(JSON.stringify(mockResults, null, 2));
console.log("\nFormatted results:");
console.log(formattedResults);
