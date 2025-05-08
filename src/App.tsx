//import "./App.css";

import { useEffect, useState } from "react";
import { Checkbox } from "./components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

type TransportInfo = {
  transport: "stdio" | "sse" | "streamableHttp" | "unknown";
  port?: number;
  hfTokenMasked?: string;
  hfTokenSet?: boolean;
};

type ToolSettings = {
  enabled: boolean;
};

type AppSettings = {
  tools: {
    [toolId: string]: ToolSettings;
  };
};

function App() {
  const [transportInfo, setTransportInfo] = useState<TransportInfo>({
    transport: "unknown",
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    tools: {
      space_semantic_search: { enabled: false },
      paper_semantic_search: { enabled: false }
    }
  });

  useEffect(() => {
    // Fetch transport information and settings from the API
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch transport info
        const transportResponse = await fetch("/api/transport");
        if (!transportResponse.ok) {
          throw new Error(`Failed to fetch transport info: ${transportResponse.status}`);
        }
        const transportData = await transportResponse.json();
        setTransportInfo(transportData);
        
        // Fetch settings
        const settingsResponse = await fetch("/api/settings");
        if (!settingsResponse.ok) {
          throw new Error(`Failed to fetch settings: ${settingsResponse.status}`);
        }
        const settingsData = await settingsResponse.json();
        setSettings(settingsData);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Format the transport name for display
  const getTransportDisplayName = () => {
    switch (transportInfo.transport) {
      case "stdio":
        return "STDIO";
      case "sse":
        return "SSE";
      case "streamableHttp":
        return "Streamable HTTP";
      default:
        return "Unknown";
    }
  };
  
  // Handle checkbox changes
  const handleToolToggle = async (toolId: string, checked: boolean) => {
    try {
      const response = await fetch(`/api/settings/tools/${toolId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: checked }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update tool settings: ${response.status}`);
      }
      
      const updatedToolSettings = await response.json();
      
      // Update local state
      setSettings(prevSettings => ({
        ...prevSettings,
        tools: {
          ...prevSettings.tools,
          [toolId]: updatedToolSettings
        }
      }));
      
      console.log(`${toolId} is now ${checked ? 'enabled' : 'disabled'}`);
      
    } catch (err) {
      console.error(`Error updating tool settings:`, err);
      alert(`Error updating ${toolId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  };

  return (
    <>
      <div className="flex h-screen w-screen items-center justify-center">
        <Card className="w-[700px]">
          <CardHeader>
            <CardTitle>Hugging Face Search Tools (MCP)</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Checkboxes in a flex row layout */}
            <div className="flex flex-row gap-8 mb-6">
              {/* First Checkbox */}
              <div className="flex-1">
                <div className="items-top flex space-x-2">
                  <Checkbox 
                    id="space_semantic_search" 
                    checked={settings.tools.space_semantic_search?.enabled || false}
                    onCheckedChange={(checked) => handleToolToggle("space_semantic_search", checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="space_semantic_search"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Space Search {settings.tools.space_semantic_search?.enabled ? "(Enabled)" : "(Disabled)"}
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Semantic Search for Hugging Face Spaces.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Second Checkbox */}
              <div className="flex-1">
                <div className="items-top flex space-x-2">
                  <Checkbox 
                    id="paper_semantic_search" 
                    checked={settings.tools.paper_semantic_search?.enabled || false}
                    onCheckedChange={(checked) => handleToolToggle("paper_semantic_search", checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="paper_semantic_search"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Paper Search {settings.tools.paper_semantic_search?.enabled ? "(Enabled)" : "(Disabled)"}
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Use semantic search to find papers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 rounded-lg bg-muted p-4">
              {isLoading ? (
                <p>Loading transport information...</p>
              ) : error ? (
                <p className="text-destructive">Error: {error}</p>
              ) : (
                <div>
                  <p className="mb-2 text-xs">
                    Using{" "}
                    <span className="font-bold text-primary">
                      {getTransportDisplayName()}
                    </span>{" "}
                    transport
                    {(transportInfo.transport === "sse" || transportInfo.transport === "streamableHttp") && 
                      transportInfo.port && (
                        <span className="ml-1">
                          on port <span className="font-mono">{transportInfo.port}</span>
                        </span>
                      )
                    }
                  </p>
                  
                  <p className={`text-xs mt-2 ${!transportInfo.hfTokenSet ? "text-red-500 font-semibold" : ""}`}>
                    HF Token: {transportInfo.hfTokenSet ? (
                      <span className="font-mono">{transportInfo.hfTokenMasked}</span>
                    ) : (
                      <span>⚠️ Not configured</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default App;
