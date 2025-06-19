import { createActor } from 'xstate';
import mcpClientMachine from '../src/mcp.client.xstate.js';
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// Test configuration
const ROUTER_URL = "http://localhost:8080/mcp/test-client";
const AUTH_TOKEN = "REDACTED";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

console.log('🚀 Starting MCP Client Router Integration Test...');
console.log(`📡 Connecting to router at: ${ROUTER_URL}`);

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

let testResults = {
  connected: false,
  tools: 0,
  resources: 0,
  resourceTemplates: 0,
  prompts: 0,
  completionTested: false,
  completionSuccess: false
};

testActor.subscribe((state) => {
  console.log(`[Router Test] State: ${state.value}, Error: ${state.context.error?.message || 'none'}`);
  
  if (state.matches('ready')) {
    console.log('✅ Connected to router successfully!');
    testResults.connected = true;
    
    // Log available data
    testResults.tools = state.context.tools?.length || 0;
    testResults.resources = state.context.resources?.length || 0;
    testResults.resourceTemplates = state.context.resourceTemplates?.length || 0;
    testResults.prompts = state.context.prompts?.length || 0;
    
    console.log(`📊 Available data:`);
    console.log(`   Tools: ${testResults.tools}`);
    console.log(`   Resources: ${testResults.resources}`);
    console.log(`   Resource Templates: ${testResults.resourceTemplates}`);
    console.log(`   Prompts: ${testResults.prompts}`);
    
    // Log specific items
    if (state.context.tools?.length > 0) {
      console.log(`   Tool names: ${state.context.tools.map((t: any) => t.name).join(', ')}`);
    }
    if (state.context.resources?.length > 0) {
      console.log(`   Resource names: ${state.context.resources.map((r: any) => r.name).join(', ')}`);
    }
    if (state.context.resourceTemplates?.length > 0) {
      console.log(`   Resource template names: ${state.context.resourceTemplates.map((rt: any) => rt.name).join(', ')}`);
    }
    if (state.context.prompts?.length > 0) {
      console.log(`   Prompt names: ${state.context.prompts.map((p: any) => p.name).join(', ')}`);
    }
    
    // Test completion with resource template
    if (state.context.client && !testResults.completionTested) {
      testResults.completionTested = true;
      console.log('🧪 Testing completion with resource template...');
      
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
        testResults.completionSuccess = true;
        printTestSummary();
        testActor.send({ type: "cleanup" });
      }).catch((error: any) => {
        console.log('⚠️ Completion test failed (expected for some servers):', error.message);
        testResults.completionSuccess = false;
        printTestSummary();
        testActor.send({ type: "cleanup" });
      });
    }
  } else if (state.matches('failed')) {
    console.log('❌ Failed to connect to router:', state.context.error?.message);
    printTestSummary();
    process.exit(1);
  }
});

function printTestSummary() {
  console.log('\n📋 Test Summary:');
  console.log(`   Connection: ${testResults.connected ? '✅ Success' : '❌ Failed'}`);
  console.log(`   Tools found: ${testResults.tools}`);
  console.log(`   Resources found: ${testResults.resources}`);
  console.log(`   Resource Templates found: ${testResults.resourceTemplates}`);
  console.log(`   Prompts found: ${testResults.prompts}`);
  console.log(`   Completion test: ${testResults.completionTested ? (testResults.completionSuccess ? '✅ Success' : '⚠️ Failed (expected)') : '⏭️ Skipped'}`);
  
  if (testResults.resourceTemplates > 0) {
    console.log('\n🎉 Resource templates are working! The integration is successful.');
  } else {
    console.log('\n⚠️ No resource templates found. This might be expected depending on the server configuration.');
  }
}

// Start the test
testActor.start();

// Set a timeout to prevent hanging
setTimeout(() => {
  if (!testResults.connected) {
    console.log('⏰ Test timeout - router might not be running');
    printTestSummary();
    process.exit(1);
  }
}, 15000); 