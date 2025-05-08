import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface TransportInfo {
  transport: "stdio" | "sse" | "streamableHttp" | "unknown";
  port?: number;
  hfTokenMasked?: string;
  hfTokenSet?: boolean;
}

interface ConnectionInfoProps {
  isLoading: boolean;
  error: string | null;
  transportInfo: TransportInfo;
}

export function ConnectionInfo({ isLoading, error, transportInfo }: ConnectionInfoProps) {
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

  return (
    <Card className="w-[500px]">
      <CardHeader>
        <CardTitle className="text-sm">Connection Information</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p>Loading transport information...</p>
        ) : error ? (
          <p className="text-destructive">Error: {error}</p>
        ) : (
          <div className="text-xs">
            <div className="flex items-center mb-2">
              <span className="font-medium w-24">Transport:</span>
              <span className="font-medium text-primary">
                {getTransportDisplayName()}
                {transportInfo.port && (
                    <span className="ml-1">
                      on port <span className="font-mono">{transportInfo.port}</span>
                    </span>
                  )
                }
              </span>
            </div>
            
            <div className="flex items-center">
              <span className="font-medium w-24">HF Token:</span>
              <span className={`font-mono ${!transportInfo.hfTokenSet ? "text-red-500 font-semibold" : ""}`}>
                {transportInfo.hfTokenSet ? transportInfo.hfTokenMasked : "⚠️ Not configured"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}