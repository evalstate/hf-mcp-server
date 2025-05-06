// Import the semantic search service
import { semanticSearch, SearchResult } from './src/services/semantic-search.js';

// Sample search query
const testQuery = "image generation";

// Function to run the test
async function testSemanticSearch() {
  try {
    console.log(`Testing semantic search with query: "${testQuery}"`);
    
    // Perform the search
    const results = await semanticSearch.search(testQuery, 5);
    
    // Log the raw results
    console.log("Raw search results:");
    console.log(JSON.stringify(results, null, 2));
    
    // Check if emoji and relevanceScore are in the results
    console.log("\nChecking for emoji and relevanceScore in results:");
    results.forEach((result: SearchResult, index: number) => {
      console.log(`Result #${index + 1}:`);
      console.log(`- Title: ${result.title || 'Untitled'}`);
      console.log(`- Emoji: ${result.emoji || 'Not present'}`);
      console.log(`- Relevance Score: ${result.semanticRelevancyScore !== undefined ? 
        (result.semanticRelevancyScore * 100).toFixed(1) + '%' : 'Not present'}`);
    });
    
    // Format the results as markdown
    const markdown = semanticSearch.formatSearchResults(results);
    
    // Log the formatted markdown
    console.log("\nFormatted markdown table:");
    console.log(markdown);
    
    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error("Test failed with error:", error instanceof Error ? error.message : String(error));
  }
}

// Run the test
testSemanticSearch();