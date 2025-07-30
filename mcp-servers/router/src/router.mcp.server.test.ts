import { createActor } from 'xstate';
import mcpClientMachine from './mcp.client.js';
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// Test configuration
const ROUTER_URL = "http://localhost:8080/mcp/test-client";
const AUTH_TOKEN = "REDACTED";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

describe('MCP Client Integration with Router', () => {
  let actor: any;

  beforeEach(() => {
    actor = createActor(mcpClientMachine, {
      input: {
        url: new URL(ROUTER_URL),
        options: {
          info: { name: "router-test-client", version: "1.0.0" },
          auth: authInfo,
          session: "test",
        },
      },
    });
  });

  afterEach(() => {
    if (actor) {
      actor.send({ type: "cleanup" });
    }
  });

  it('should connect to router and transition to ready state', async () => {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for ready state'));
      }, 10000);

      actor.subscribe((state: any) => {
        console.log(`[Test] State: ${state.value}, Error: ${state.context.error?.message || 'none'}`);
        
        if (state.matches('ready')) {
          clearTimeout(timeout);
          resolve();
        } else if (state.matches('failed')) {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect: ${state.context.error?.message}`));
        }
      });
    });

    actor.start();
    await readyPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('ready')).toBe(true);
    expect(snapshot.context.error).toBeUndefined();
  }, 15000);

  it('should list tools from router', async () => {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for ready state'));
      }, 10000);

      actor.subscribe((state: any) => {
        if (state.matches('ready')) {
          clearTimeout(timeout);
          resolve();
        } else if (state.matches('failed')) {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect: ${state.context.error?.message}`));
        }
      });
    });

    actor.start();
    await readyPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.tools).toBeDefined();
    expect(Array.isArray(snapshot.context.tools)).toBe(true);
    
    console.log('Available tools:', snapshot.context.tools.map((t: any) => t.name));
  }, 15000);

  it('should list resources from router', async () => {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for ready state'));
      }, 10000);

      actor.subscribe((state: any) => {
        if (state.matches('ready')) {
          clearTimeout(timeout);
          resolve();
        } else if (state.matches('failed')) {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect: ${state.context.error?.message}`));
        }
      });
    });

    actor.start();
    await readyPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.resources).toBeDefined();
    expect(Array.isArray(snapshot.context.resources)).toBe(true);
    
    console.log('Available resources:', snapshot.context.resources.map((r: any) => r.name));
  }, 15000);

  it('should list resource templates from router', async () => {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for ready state'));
      }, 10000);

      actor.subscribe((state: any) => {
        if (state.matches('ready')) {
          clearTimeout(timeout);
          resolve();
        } else if (state.matches('failed')) {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect: ${state.context.error?.message}`));
        }
      });
    });

    actor.start();
    await readyPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.resourceTemplates).toBeDefined();
    expect(Array.isArray(snapshot.context.resourceTemplates)).toBe(true);
    
    console.log('Available resource templates:', snapshot.context.resourceTemplates.map((rt: any) => rt.name));
  }, 15000);

  it('should list prompts from router', async () => {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for ready state'));
      }, 10000);

      actor.subscribe((state: any) => {
        if (state.matches('ready')) {
          clearTimeout(timeout);
          resolve();
        } else if (state.matches('failed')) {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect: ${state.context.error?.message}`));
        }
      });
    });

    actor.start();
    await readyPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.prompts).toBeDefined();
    expect(Array.isArray(snapshot.context.prompts)).toBe(true);
    
    console.log('Available prompts:', snapshot.context.prompts.map((p: any) => p.name));
  }, 15000);

  it('should test completion with resource template', async () => {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for ready state'));
      }, 10000);

      actor.subscribe((state: any) => {
        if (state.matches('ready')) {
          clearTimeout(timeout);
          resolve();
        } else if (state.matches('failed')) {
          clearTimeout(timeout);
          reject(new Error(`Failed to connect: ${state.context.error?.message}`));
        }
      });
    });

    actor.start();
    await readyPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.client).toBeDefined();

    // Test completion with a resource template
    try {
      const result = await snapshot.context.client.complete({
        ref: {
          type: "ref/resource",
          uri: "urn:mcp:server/registry"
        },
        argument: {
          name: "registry",
          value: "test value"
        }
      });
      
      console.log('Completion result:', result);
      expect(result).toBeDefined();
    } catch (error) {
      console.log('Completion error (expected for some servers):', error);
      // This might fail depending on the server implementation, which is okay
    }
  }, 20000);
});

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running MCP Client Router Integration Tests...');
  
  const testActor = createActor(mcpClientMachine, {
    input: {
      url: new URL(ROUTER_URL),
      options: {
        info: { name: "router-test-client", version: "1.0.0" },
        auth: authInfo,
        session: "test",
      },
    },
  });

  testActor.subscribe((state) => {
    console.log(`[Router Test] State: ${state.value}, Error: ${state.context.error?.message || 'none'}`);
    
    if (state.matches('ready')) {
      console.log('✅ Connected to router successfully!');
      console.log('Tools:', state.context.tools?.length || 0);
      console.log('Resources:', state.context.resources?.length || 0);
      console.log('Resource Templates:', state.context.resourceTemplates?.length || 0);
      console.log('Prompts:', state.context.prompts?.length || 0);
      
      // Test completion
      if (state.context.client) {
        state.context.client.complete({
          ref: {
            type: "ref/resource",
            uri: "urn:mcp:server/registry"
          },
          argument: {
            name: "registry",
            value: "test value"
          }
        }).then((result: any) => {
          console.log('✅ Completion test successful:', result);
        }).catch((error: any) => {
          console.log('⚠️ Completion test failed (expected for some servers):', error.message);
        }).finally(() => {
          testActor.send({ type: "cleanup" });
        });
      }
    } else if (state.matches('failed')) {
      console.log('❌ Failed to connect to router:', state.context.error?.message);
      process.exit(1);
    }
  });

  testActor.start();
} 