import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthMetadataRouter, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { env } from "node:process";
import { jwtDecode, JwtPayload } from "jwt-decode";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { connectYjs } from "./store.yjs";
import { createHash } from "node:crypto";
import express from "express";

const ISSUER =
  "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg";
const STATIC_CLIENT_ID =
  env.OAUTH_STATIC_CLIENT_ID || "FYEcmQ4aAAZ-i69s1UZSxJ8x";

const authState =  connectYjs("@mcp.auth").getMap<Record<string, unknown>>("tokens");

export const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${ISSUER}/authorize`,
    tokenUrl: `${ISSUER}/token`,
    registrationUrl: `${ISSUER}/register`,
    revocationUrl: `${ISSUER}/revoke`,
   },
  fetch: async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();

    // Upstream dynamic registration is flaky; return a stable static client.
    if (url === `${ISSUER}/register`) {
      const rawBody = typeof init?.body === "string" ? init.body : "{}";
      const metadata = JSON.parse(rawBody) as Record<string, any>;
      const now = Math.floor(Date.now() / 1000);

      return new Response(
        JSON.stringify({
          client_id: STATIC_CLIENT_ID,
          client_id_issued_at: now,
          redirect_uris: metadata.redirect_uris || [
            "cursor://anysphere.cursor-mcp/oauth/callback",
          ],
          token_endpoint_auth_method:
            metadata.token_endpoint_auth_method || "none",
          grant_types: metadata.grant_types || [
            "authorization_code",
            "refresh_token",
          ],
          response_types: metadata.response_types || ["code"],
          client_name: metadata.client_name || "cursor-vscode",
          scope: metadata.scope || "openid profile email",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return fetch(input, init);
  },

  verifyAccessToken: async (token) => {
    const { azp, exp, iss } = jwtDecode(token ) as JwtPayload & {azp?:string}
    console.log("verifyAccessToken", azp);
    async function attemptVerify():Promise<Record<string, unknown>> { 
        const response = await fetch(`${ISSUER}/userinfo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }).catch((e)=> console.error("unexpected error during userinfo endpoint", e.message, e.stack, e.code))
        
        if (!response?.ok) {
          console.error(
            "token_verification_failed",
            response?.statusText,
            response && Object.fromEntries(response?.headers?.entries()),
            response && await response.text()
          );
          throw new UnauthorizedError(response?.statusText ?? "failed to fetch");
        }

        const userInfo = await response.json();
        if (
            typeof userInfo !== "object" ||
            userInfo === null ||
            !("sub" in userInfo)
          ) {
            throw new UnauthorizedError("invalid_token");
          }
          
        return {
          ...userInfo,
          name:
            userInfo.nickname ||
            userInfo.name ||
            userInfo.given_name ||
            userInfo.family_name,

          expiresAt: new Date(exp! * 1000).toISOString(),
        } 
    }
    const id= createHash("sha1").update(token.split(".")[2]).digest().toString();
    console.debug("token id", id)
    if (!authState.has(id)) {
        authState.set(id, await attemptVerify());
    }
    const userInfo = authState.get(id)!;

    return {
      issuer: iss,
      scopes: ["openid", "profile", "email"],
      token, 
      expiresAt: Date.now() + (exp || 1) * 1000,
      extra:userInfo,
      clientId: azp || "default-client",
      resource: new URL(`${env.BASE_URL || "http://localhost:8080"}/oauth/protected-resource/mcp`),
    };
  },
  getClient: async (client_id) => {
    return {
      scope: "openid profile email",
      client_id,
      redirect_uris: [
        "cursor://anysphere.cursor-mcp/oauth/callback",
        "http://localhost:3000/callback",
        "http://localhost:6274/oauth/callback/debug",
        "http://localhost:6274/oauth/callback",
        "http://localhost:8080/oauth/callback",
        "http://localhost:8090/oauth/callback",
        `${env.BASE_URL || "http://localhost:8080"}/oauth/callback`,
        `${env.BASE_URL || "http://localhost:8080"}/oauth/callback/debug`,
      ],
    };
  },
});

export const authRouter = mcpAuthRouter({
  provider: proxyProvider,
  issuerUrl: new URL(env.BASE_URL || "http://localhost:8080"),
  baseUrl: new URL(env.BASE_URL || "http://localhost:8080"),
  serviceDocumentationUrl: new URL("https://docs.example.com/"),
  scopesSupported: ["openid", "profile", "email"],
});
export const protectedResourcesRouter = express.Router();

protectedResourcesRouter.use(express.json());
protectedResourcesRouter.use(express.urlencoded({ extended: true }));


protectedResourcesRouter.get("/.well-known/oauth-protected-resource/mcp", async (req, res, next) => {
    console.log("openid-configuration request", req.headers);
    const baseUrl = env.BASE_URL || `${req.protocol}://${req.headers.host}`;
    const router = mcpAuthMetadataRouter({
        oauthMetadata: {
          issuer: `${baseUrl}/`,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          registration_endpoint: `${baseUrl}/register`,
          revocation_endpoint: `${baseUrl}/revoke`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
          scopes_supported: ["openid", "profile", "email"],
          code_challenge_methods_supported: ["S256"],
        },
        resourceServerUrl: new URL(`${req.protocol}://${req.headers.host}/mcp`),
        scopesSupported: ["openid", "profile", "email"],
        serviceDocumentationUrl: new URL("https://docs.example.com/"),
    });
    await router(req, res, next);
    }
);





export const requireAuth = requireBearerAuth({
  verifier: proxyProvider,
   requiredScopes: ["openid", "profile", "email"],
});
 
 

