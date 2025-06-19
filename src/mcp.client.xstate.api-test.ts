import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createActor } from "xstate";
import mcpClientMachine from "./mcp.client.xstate.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";

const testLocalRouter = false;
const MCP_URL = testLocalRouter ? new URL("http://localhost:8080/mcp/4db27887f15847f9be1ccf92334dfbb3") : new URL("https://registry.cfapps.eu12.hana.ondemand.com/mcp/4db27887f15847f9be1ccf92334dfbb3");

// Connect to local router instead of remote registry
  const AUTH_TOKEN =
  "REDACTED";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

// Interpret the XState machine (single long-lived actor for all requests).
const actor = createActor(mcpClientMachine, {
  input: {
    url: MCP_URL,
    options: {
      info: { name: "router-test-client", version: "1.0.0" },
      auth: authInfo,
      session: "test",
    },
  },
});

let latestState = actor.getSnapshot();
actor.subscribe((state) => {
  latestState = state;
  // Log state transitions for debug
  console.log(`[MCP-XState]`, state.value, state.context.error?.message ?? "");
});

actor.start();

// Utility to wait for a predicate on latestState with timeout.
function waitFor<T>(predicate: () => T | undefined, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const started = Date.now();
    const handle = setInterval(() => {
      const res = predicate();
      if (res !== undefined) {
        clearInterval(handle);
        resolve(res);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(handle);
        reject(new Error("Timeout"));
      }
    }, 100);
  });
}

const app = new Hono();

app.get("/state", (c) => {
  return c.json({
    value: latestState.value,
    error: latestState.context.error,
    retries: latestState.context.retries,
  });
});

app.get("/tools", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ tools: snapshot.context.tools ?? [] });
});

app.get("/resources", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ resources: snapshot.context.resources ?? [] });
});

app.get("/resource-data/:name", (c) => {
  const name = c.req.param("name");
  const snapshot = actor.getSnapshot();
  const data = snapshot.context.resourceData?.[name];
  if (!data) {
    return c.json({ ok: false, error: "No data for resource" }, 404);
  }
  return c.json({ ok: true, data });
});

// Endpoint to trigger reading a resource by name using the actor.
app.post("/read-resource/:name", async (c) => {
  const name = c.req.param("name");
  const resource: Resource | undefined = latestState.context.resources?.find(
    (r) => r.name === name
  );
  if (!resource) {
    return c.json({ ok: false, error: "Resource not found in current list" }, 404);
  }

  actor.send({
    type: "@updates.resource",
    ...resource,
  } as any);

  try {
    const data = await waitFor(() => latestState.context.resourceData?.[name], 8000);
    return c.json({ ok: true, data });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 504);
  }
});

// Restart/Retry endpoint
app.post("/retry", (_c) => {
  actor.send({ type: "retry" });
  return _c.json({ ok: true });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8788);
  console.log(`[MCP XState Hono] Running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app; 