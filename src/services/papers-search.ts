import { z } from "zod";

// Core interfaces for the paper data structure
interface Author {
  name: string;
  // There may be other fields not documented in the API
}

interface User {
  name: string;
  // There may be other fields not documented in the API
}

interface PaperInfo {
  // Core identification
  id: string;                    // arXiv paper ID (e.g. "2407.21783")
  title?: string;                // Paper title

  // Content
  summary?: string;              // Paper abstract/summary
  authors?: Author[];            // List of authors

  // Metadata
  source?: string;               // Source (typically "arXiv")
  publishedAt?: string;          // ISO 8601 date when the paper was published

  // Hugging Face specific
  upvotes?: number;              // Number of upvotes on Hugging Face
  comments?: number;             // Number of comments (might be named numComments in response)
  discussionId?: string;         // ID for discussions on Hugging Face
  submittedAt?: string;          // ISO 8601 date when added to Hugging Face daily papers
  submittedBy?: User;            // User who submitted the paper

  // The response may contain a nested "paper" object with duplicated info
  paper?: {
    id?: string;
    authors?: Author[];
    publishedAt?: string;
    summary?: string;
    upvotes?: number;
    discussionId?: string;
  };
}

// Normalized paper interface with consistent structure and useful URLs
export interface NormalizedPaper {
  id: string;
  title: string | null;
  summary: string | null;
  authors: string[];
  publishedDate: Date | null;
  submittedDate: Date | null;
  submittedBy: string | null;
  upvotes: number;
  comments: number;

  // URLs to access the paper
  arxivUrl: string;      // Link to arXiv page
  pdfUrl: string;        // Direct link to PDF
  hubUrl: string;        // Link to Hugging Face discussion
}

// Helper function to parse dates (handles null/undefined)
function parseDate(dateString?: string): Date | null {
  if (!dateString) return null;
  try {
    return new Date(dateString);
  } catch {
    return null;
  }
}

// Helper function to normalize a paper object
function normalizePaper(raw: PaperInfo): NormalizedPaper {
  // Extract data from either top level or nested "paper" object
  const paper = raw.paper || {};

  // Extract the ID first so we can use it consistently for URLs
  const id = raw.id || paper.id || "";

  return {
    id,
    title: raw.title || null,
    summary: raw.summary || paper.summary || null,
    authors: raw.authors?.map(author => author.name) ||
             paper.authors?.map(author => author.name) || [],
    publishedDate: parseDate(raw.publishedAt || paper.publishedAt),
    submittedDate: parseDate(raw.submittedAt),
    submittedBy: raw.submittedBy?.name || null,
    upvotes: raw.upvotes || paper.upvotes || 0,
    comments: raw.comments || 0,
    // URLs - using the extracted ID for consistency
    arxivUrl: id ? `https://arxiv.org/abs/${id}` : "",
    pdfUrl: id ? `https://arxiv.org/pdf/${id}.pdf` : "",
    hubUrl: raw.discussionId ?
      `https://huggingface.co/papers/${raw.discussionId}` :
      (id ? `https://huggingface.co/papers/${id}` : "")
  };
}

// Create a schema validator for search parameters
export const PaperSearchParamsSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  limit: z.number().optional().default(10),
});

export type PaperSearchParams = z.infer<typeof PaperSearchParamsSchema>;

// Default number of results to return
const RESULTS_TO_RETURN = 10;

// Import configuration
export const config = {
  hfToken: process.env.HF_TOKEN || "",
};

/**
 * Service for searching Hugging Face Papers
 */
export class PapersSearchService {
  private readonly apiUrl: string;

  /**
   * Creates a new papers search service
   * @param apiUrl The URL of the Hugging Face papers search API
   */
  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || "https://huggingface.co/api/papers/search";
  }

  /**
   * Searches for papers on the Hugging Face Hub
   * @param query Search query string (e.g. "llama", "attention")
   * @param limit Maximum number of results to return
   * @returns Array of normalized paper objects
   */
  async search(
    query: string,
    limit: number = RESULTS_TO_RETURN,
  ): Promise<NormalizedPaper[]> {
    try {
      // Validate input before making API call
      if (!query) {
        return [];
      }
      
      if (typeof query !== 'string') {
        throw new Error('Search query must be a string');
      }

      // Build the query URL
      const url = new URL(this.apiUrl);
      url.searchParams.append("q", query);

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.hfToken) {
        headers["Authorization"] = `Bearer ${config.hfToken}`;
      }

      console.log("Making request to:", url.toString());
      
      // Make the API request
      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        throw new Error(
          `Papers search request failed: ${response.status} ${response.statusText}`
        );
      }

      // Parse the response
      const papers = await response.json() as PaperInfo[];
      
      // Apply limit and normalize the results
      return papers.slice(0, limit).map(normalizePaper);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for papers: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Gets details for a specific paper by ID
   * @param id arXiv ID of the paper (e.g. "2407.21783")
   * @returns Normalized paper object
   */
  async getPaper(id: string): Promise<NormalizedPaper> {
    try {
      if (!id) {
        throw new Error("Paper ID is required");
      }

      // Build the API URL for a specific paper
      const url = `https://huggingface.co/api/papers/${id}`;

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.hfToken) {
        headers["Authorization"] = `Bearer ${config.hfToken}`;
      }
      
      // Make the API request
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `Paper details request failed: ${response.status} ${response.statusText}`
        );
      }

      // Parse and normalize the paper
      const paper = await response.json() as PaperInfo;
      return normalizePaper(paper);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get paper details: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Formats search results as a markdown table for MCP friendly output
 * @param query The search query used
 * @param results The search results to format
 * @returns A markdown formatted string with the search results
 */
export const formatSearchResults = (query: string, results: NormalizedPaper[]): string => {
  if (results.length === 0) {
    return `No matching research papers found for the query '${query}'. Try a different query.`;
  }

  let markdown = `# Paper Search Results for the query '${query}'\n\n`;
  markdown += "| Title | Authors | Published | Links | Upvotes |\n";
  markdown += "|-------|---------|-----------|-------|--------|\n";

  for (const paper of results) {
    const title = paper.title || "Untitled";
    const authors = paper.authors.length > 3 
      ? `${paper.authors.slice(0, 3).join(", ")} et al.` 
      : paper.authors.join(", ");
    
    const publishedDate = paper.publishedDate 
      ? paper.publishedDate.toLocaleDateString() 
      : "Unknown";
    
    const links = `[arXiv](${paper.arxivUrl}) | [PDF](${paper.pdfUrl}) | [HF](${paper.hubUrl})`;
    const upvotes = paper.upvotes || 0;

    markdown +=
      `| [${escapeMarkdown(title)}](${paper.hubUrl}) ` +
      `| ${escapeMarkdown(authors)} ` +
      `| ${publishedDate} ` +
      `| ${links} ` +
      `| ${upvotes} |\n`;
  }

  return markdown;
}

/**
 * Escapes special markdown characters in a string
 * @param text The text to escape
 * @returns The escaped text
 */
function escapeMarkdown(text: string): string {
  if (!text) return "";
  // Replace pipe characters and newlines for table compatibility
  // Plus additional markdown formatting characters for better safety
  return text
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#");
}

// Export a singleton instance for easy import
export const papersSearch = new PapersSearchService();