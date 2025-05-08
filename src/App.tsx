//import "./App.css";

import { useEffect, useState } from "react";
import { Checkbox } from "./components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

type TransportInfo = {
  transport: "stdio" | "sse" | "streamableHttp" | "unknown";
};
function App() {
  const [transportInfo, setTransportInfo] = useState<TransportInfo>({
    transport: "unknown",
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch transport information from the API
    const fetchTransportInfo = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/transport");
        if (!response.ok) {
          throw new Error(`Failed to fetch transport info: ${response.status}`);
        }
        const data = await response.json();
        setTransportInfo(data);
      } catch (err) {
        console.error("Error fetching transport info:", err);
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransportInfo();
  }, []);

  // Format the transport name for display
  const getTransportDisplayName = () => {
    switch (transportInfo.transport) {
      case "stdio":
        return "Standard IO";
      case "sse":
        return "Server-Sent Events (SSE)";
      case "streamableHttp":
        return "Streamable HTTP";
      default:
        return "Unknown";
    }
  };

  return (
    <>
      <div className="flex h-screen w-screen items-center justify-center">
        <Card className="w-[700px]">
          <CardHeader>
            <CardTitle>Hugging Face MCP Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 rounded-lg bg-muted p-4">
              <h2 className="mb-2 text-lg font-semibold">Active Transport</h2>
              {isLoading ? (
                <p>Loading transport information...</p>
              ) : error ? (
                <p className="text-destructive">Error: {error}</p>
              ) : (
                <p className="font-medium">
                  Currently using{" "}
                  <span className="font-bold text-primary">
                    {getTransportDisplayName()}
                  </span>{" "}
                  transport
                </p>
              )}
            </div>

            <div className="items-top flex space-x-2">
              <Checkbox id="space_semantic_search" />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="space_semantic_search"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Space Search
                </label>
                <p className="text-sm text-muted-foreground">
                  Use semantic search to find Hugging Face Spaces.
                </p>
              </div>
              <Checkbox id="paper_semantic_search" />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="paper_semantic_search"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Paper Search
                </label>
                <p className="text-sm text-muted-foreground">
                  Use semantic search to find papers from xyz.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default App;
