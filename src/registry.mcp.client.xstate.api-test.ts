import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createActor } from "xstate";
import { Map as YMap } from "yjs";
import clientManagerMachine, { type ServerConfig } from "./registry.mcp.client.xstate.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import * as dotenv from "dotenv";
import { connectYjs } from "./store.yjs.js";

dotenv.config();

const REGISTRY_URL = process.env.MCP_REGISTRY_URL ?? "https://registry.cfapps.eu12.hana.ondemand.com/mcp";
process.env.MCP_REGISTRY_URL = REGISTRY_URL;

const AUTH_TOKEN =
  "REDACTED";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

const id = "4db27887f15847f9be1ccf92334dfbb3";

// Initialize Yjs store
const doc = connectYjs("@mcp.registry");
const store = doc.getMap<ServerConfig>("@mcp.server");

const session = {
  store,
  auth: authInfo,
};

// Create and start the client manager actor
const actor = createActor(clientManagerMachine, {
  id: id,
  input: {
    session: {
      store,
      auth: authInfo,
      session: "test",
      id: id,
      name: id,
      version: "1.0.0"
    },
    store
  }
});

actor.subscribe((s) => {
  console.log(`[manager] state`, s.value);
});

actor.start();

// Initialize Hono app
const app = new Hono();

app.get("/state", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ value: snapshot.value, error: snapshot.context.error });
});

app.get("/servers", (c) => {
  const snapshot = actor.getSnapshot();
  const list = Object.values(snapshot.context.mcpActors ?? {}).map((act: any) => {
    const snap = act.getSnapshot();
    return {
      id: act.id,
      value: snap.value,
      error: snap.context.error,
      status: act.status,
      name: snap.context?.options?.info?.name ?? act.id,
    };
  });
  return c.json(list);
});

app.get("/tools", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ tools: snapshot.context.tools ?? [] });
});

app.get("/resources", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ resources: snapshot.context.resources ?? [] });
});

app.get("/debug/actors", (c) => {
  const snapshot = actor.getSnapshot();
  const actors = Object.entries(snapshot.context.mcpActors ?? {}).map(([key, act]: [string, any]) => ({
    key,
    id: act.id,
    state: act.getSnapshot().value,
    tools: act.getSnapshot().context.tools?.length ?? 0
  }));
  return c.json(actors);
});

app.get("/server/:id/tools", (c) => {
  const id = c.req.param("id");
  const snapshot = actor.getSnapshot();
  const act: any = snapshot.context.mcpActors?.[id];
  if (!act) return c.json({ ok: false, error: "server not found" }, 404);
  const snap = act.getSnapshot();
  return c.json({ ok: true, tools: snap.context.tools ?? [] });
});

app.post("/connect", async (c) => {
  const body = await c.req.json<ServerConfig>();
  const id = body.id ?? body.url; // simple id
  store.set(id, body);
  actor.send({ type: "connect", ...body, session });
  return c.json({ ok: true });
});

app.post("/recalculate-tools", (c) => {
  actor.send({ type: "recalculate-tools" });
  return c.json({ ok: true });
});

app.get("/namespaced/resources", (c) => {
  const snapshot = actor.getSnapshot();
  const res = Object.values(snapshot.context.mcpActors ?? {}).map((act: any) => {
    const snap = act.getSnapshot();
    return {
      id: act.id,
      value: snap.value,
      resources: snap.context.resources,
    };
  });
  return c.json(res);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8789);
  console.log(`[ClientManager Hono] listening http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app; 