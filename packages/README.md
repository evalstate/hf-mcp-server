

Session Resumability:

    STDIO - Not relevant
    SSE - Not supported
    StreamableHttp - Not supported
    StatelessHttp - Not supported



Stateful Transport Connection Management:

    MCP_CLIENT_CONNECTION_CHECK
    MCP_CLIENT_CONNECTION_TIMEOUT
    MCP_PING_KEEPALIVE
    

Instancing.

    MCP Servers are instantiated on a per-request basis. The McpServerFactory class can be modified to return a Singleton if preferred for the Stateless Http transport.
    