import { z } from "zod";



/** {
  "error": "\"inferenceProviders[0]\" must be one of [black-forest-labs, cohere, cerebras, fal-ai, featherless-ai, fireworks-ai, groq, hf-inference, hyperbolic, nebius, novita, nscale, replicate, sambanova, together]"
} */
// https://github.com/huggingface/huggingface_hub/blob/main/docs/source/en/guides/search.md
// Define the search parameters


export const ModelSearchParamsSchema = z.object({
  search: z.string().min(1, "Search query is required"),
  limit: z.number().int().positive().default(5),
  sort: z.enum(["trendingScore", "downloads", "likes"]).default("likes"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type ModelSearchParams = z.infer<typeof ModelSearchParamsSchema>;

// Define the model search service
export class ModelSearchService {
  private readonly apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || "https://huggingface.co/api/models";
  }

  async search(params: ModelSearchParams): Promise<any> {
    try {
      // Map the sort value to the actual API parameter

      // Build the query parameters
      const queryParams = new URLSearchParams({
        search: params.search,
        limit: params.limit.toString(),
        sort: params.sort,
        direction: "-1",
        full: "false",
        config: "false",
      });
      // trending only supports -1

      // Get the HF token from environment
      const hfToken = process.env.HF_TOKEN || "";

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (hfToken) {
        headers["Authorization"] = `Bearer ${hfToken}`;
      }


      console.log("Making request to:", `${this.apiUrl}?${queryParams}`);
      // Make the API request
      const response = await fetch(`${this.apiUrl}?${queryParams}`, {
        headers,
      });


      if (!response.ok) {
        throw new Error(
          `Model search request failed: ${response.status} ${response.statusText}`
        );
      }

      // Return the raw JSON results
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for models: ${error.message}`);
      }
      throw error;
    }
  }
}

// Export a singleton instance for easy import
export const modelSearch = new ModelSearchService();
