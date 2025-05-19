//import "./App.css";

import { useEffect, useState } from "react";
import { ToolsCard } from "./components/ToolsCard";
import { ConnectionFooter } from "./components/ConnectionFooter";

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

  const searchTools = {
    space_semantic_search: {
      id: "space_semantic_search",
      label: "Space Search",
      description: "Find Spaces with semantic search.",
      settings: settings.tools.space_semantic_search || { enabled: false }
    },
    model_search: {
      id: "model_search",
      label: "Model Search",
      description: "Find Models with configurable search parameters.",
      settings: settings.tools.model_search || { enabled: false }
    },    
    paper_semantic_search: {
      id: "paper_semantic_search",
      label: "Papers Search",
      description: "Find ML research papers with semantic search.",
      settings: settings.tools.paper_semantic_search || { enabled: false }
    }
  };

  const developerTools = {
    gradio_api_endpoints: {
      id: "gradio_api_endpoints",
      label: "Gradio API Endpoint details",
      description: "Access Gradio API endpoint details.",
      settings: settings.tools.gradio_api_endpoints || { enabled: false }
    },
    gradio_integration_docs: {
      id: "gradio_integration_docs",
      label: "Gradio Integration Documentation",
      description: "Use Gradio integration instructions.",
      settings: settings.tools.gradio_integration_docs || { enabled: false }
    }
  };
  
  const adminTools = {
    manage_repositories: {
      id: "manage_repositories",
      label: "Manage Repositories",
      description: "Create, modify and manage Hugging Face repositories.",
      settings: settings.tools.manage_repositories || { enabled: false }
    }
  };

  return (
    <>
      <div className="flex h-screen w-screen items-center justify-center flex-col gap-6 pb-12">
        <ToolsCard 
          title="Hugging Face Search Tools (MCP)" 
          description="Find and use Hugging Face and Community content."
          tools={searchTools} 
          onToolToggle={handleToolToggle}
        />
        
        <ToolsCard 
          title="Hugging Face Developer Tools" 
          description="IDE focussed tools to build and integrate Gradio applications - use with Cursor, Goose, VSCode etc."
          tools={developerTools} 
          onToolToggle={handleToolToggle}
        />
        
        <ToolsCard 
          title="Hugging Face Administration Tools" 
          description="Administer Hugging Face Services and Repositories."
          tools={adminTools} 
          onToolToggle={handleToolToggle}
        />
      </div>
      
      <ConnectionFooter 
        isLoading={isLoading} 
        error={error} 
        transportInfo={transportInfo}
      />
    </>
  );
}

export default App;
