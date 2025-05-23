import { z } from "zod";
import { HfApiCall } from "./hf-api-call.js";

// https://github.com/huggingface/huggingface_hub/blob/a26b93e8ba0b51ce76ce5c2044896587c47c6b60/src/huggingface_hub/hf_api.py#L1481-L1542
// Raw JSON response for https://hf.co/api/papers/search?q=llama%203%20herd Llama Herd is ~50,000 tokens
// Raw JSON response for https://hf.co/api/papers/search?q=kazakh -> ~ 9 papers,
// Return papers as delimited markdown (or simplified JSON)
// ---
//
// can we link to Collections, Datasets, Models, Spaces?
// Create a schema validator for search parameters

export const PaperSearchDescription =
  "Search Hugging Face for Machine Learning research papers.";

export const DEFAULT_AUTHORS_TO_SHOW = 8;
const RESULTS_TO_RETURN = 10;

export const PAPER_SEARCH_TOOL_CONFIG = {
  name: "paper_search",
  description: "Search for Machine Learning research papers on Hugging Face. " +
    "Include 'Link to paper' When presenting the results. " +
    "Consider whether tabulating matches user intent. The",
  schema: z.object({
  query: z
    .string()
    .min(3, "Supply at least one search term")
    .max(200, "Query too long"),
  limit: z.number().optional().default(10),
}),
  annotations: {
    title: "Paper Search",
    destructiveHint: false,
    readOnlyHint: true,
    openWorldHint: true,
  }
} as const;

interface Author {
  name?: string;
  user?: {
    user: string;
  };
}

interface Paper {
  id: string;
  authors?: Author[];
  publishedAt?: string;
  title?: string;
  summary?: string;
  upvotes?: number;
  ai_keywords?: string[];
}

export interface PaperSearchResult {
  paper: Paper;
  numComments?: number;
  isAuthorParticipating?: boolean;
}

// Define input types for paper search
interface PaperSearchParams {
  q: string;
}

/**
 * Service for searching Hugging Face Papers
 */
export class PaperSearchTool extends HfApiCall<PaperSearchParams, PaperSearchResult[]> {
  /**
   * Creates a new papers search service
   * @param apiUrl The URL of the Hugging Face papers search API
   * @param hfToken Optional Hugging Face token for API access
   */
  constructor(
    hfToken?: string,
    apiUrl = "https://huggingface.co/api/papers/search"
  ) {
    super(apiUrl, hfToken);
  }

  /**
   * Searches for papers on the Hugging Face Hub
   * @param query Search query string (e.g. "llama", "attention")
   * @param limit Maximum number of results to return
   * @returns Formatted string with paper information
   */
  async search(
    query: string,
    limit: number = RESULTS_TO_RETURN
  ): Promise<string> {
    try {
      if (!query) return "No query";

      const papers = await this.callApi<PaperSearchResult[]>({ q: query });
      
      if (papers.length === 0) return `No papers found for query '${query}'`;
      return formatSearchResults(query, papers.slice(0, limit));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for papers: ${error.message}`);
      }
      throw error;
    }
  }
}

function formatSearchResults(
  query: string,
  papers: PaperSearchResult[]
): string {
  const r: string[] = [];
  r.push(`The following papers matched the query ${query}`);

  for (const result of papers) {
    r.push("---");
    const title = result.paper.title ?? `Paper ID ${result.paper.id}`;
    r.push("");
    r.push(`## ${title}`);
    r.push("");
    r.push(published(result.paper.publishedAt));
    r.push(authors(result.paper.authors));
    r.push("");
    r.push("### Abstract");
    r.push("");
    r.push(result.paper.summary ?? "No abstract available");
    r.push("");
    r.push(
      result.paper.ai_keywords
        ? `**AI Keywords**: ${result.paper.ai_keywords.join(", ")}`
        : ""
    );

    const upvotes: string =
      result.paper.upvotes && result.paper.upvotes > 0
        ? `Upvoted ${result.paper.upvotes.toString()} times`
        : "";

    if (result.numComments && result.numComments > 0) {
      if (result.isAuthorParticipating)
        r.push(
          `${upvotes}. The authors are participating in a discussion with ${result.numComments} comments.`
        );
      else
        r.push(
          `${upvotes}. There is a community discussion with ${result.numComments} comments.`
        );
    } else {
      if ("" != upvotes) r.push(upvotes);
    }

    r.push(
      `**Link to paper:** [https://hf.co/papers/${result.paper.id}](https://hf.co/papers/${result.paper.id})`
    );
  }
  r.push("---");
  return r.join("\n");
}

export function published(published: string | undefined): string {
  try {
    if (!published) return "Publication date not available";
    const date = new Date(published);

    // Check if date is valid (invalid dates return NaN when converted to number)
    if (isNaN(date.getTime())) {
      return "Publication date not available";
    }

    // Format using Intl.DateTimeFormat for locale-aware formatting
    const day = date.getDate().toString();
    const month = date.toLocaleString("en", { month: "short" });
    const year = date.getFullYear().toString();

    return `Published on ${day} ${month}, ${year}`;
  } catch {
    return "Publication date not available";
  }
}

export function authors(
  authors: Author[] | undefined,
  authorsToShow: number = DEFAULT_AUTHORS_TO_SHOW
): string {
  if (!authors || 0 === authors.length) return "**Authors:** Not available";
  const f: string[] = [];
  for (const author of authors.slice(0, authorsToShow)) {
    const profileLink: string = author.user?.user
      ? ` ([${author.user.user}](https://hf.co/${author.user.user}))`
      : "";
    const authorName: string = author.name ?? "Unknown";
    f.push(`${authorName}${profileLink}`);
  }

  if (authors.length > authorsToShow) {
    f.push(`and ${(authors.length - authorsToShow).toString()} more.`);
  }
  return `**Authors:** ${f.join(", ")}`;
}

// /**
//  * Escapes special markdown characters in a string
//  * @param text The text to escape
//  * @returns The escaped text
//  */
// function escapeMarkdown(text: string): string {
//   if (!text) return "";
//   // Replace pipe characters and newlines for table compatibility
//   // Plus additional markdown formatting characters for better safety
//   return text
//     .replace(/\|/g, "\\|")
//     .replace(/\n/g, " ")
//     .replace(/\*/g, "\\*")
//     .replace(/_/g, "\\_")
//     .replace(/~/g, "\\~")
//     .replace(/>/g, "\\>")
//     .replace(/#/g, "\\#");
// }
