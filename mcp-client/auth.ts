#!/usr/bin/env node

 import {  URL } from "node:url";
 import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
 import {
  OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { connectYjs } from "./yjs";
import * as Y from "yjs";
import { createAtom } from "@xstate/store";
import { jwtDecode } from "jwt-decode";
// Configuration

const authState =  connectYjs("@mcp.oauth");

async function logRedirect(url: URL) {
  console.log(`mock redirect to: ${url.toString()}`);
}

function getCode(length = 4) {
  let max = Number("1".padEnd(length + 1, "0"));
  return `${Math.floor(Math.random() * max)}`.padStart(length, "0");
}

/**
 * In-memory OAuth client provider for demonstration purposes
 * In production, you should persist tokens securely
 */
export class InMemoryOAuthClientProvider implements OAuthClientProvider {
  public authorizationUrl = createAtom<URL | undefined>(undefined);
  constructor(
    redirectUrl: string | URL,
    clientMetadata: OAuthClientMetadata,
    public id: string = getCode(6),
    private readonly onRedirect: (url: URL) => any | Promise<any> = (
      url: URL
    ) => {
      console.log("on redirect to: ", url);
      this.authorizationUrl.set(url);
    }
  ) {
    console.log("InMemoryOAuthClientProvider", redirectUrl, clientMetadata, id);
    authState.getMap(this.id).set("redirectUrl", redirectUrl);
    authState.getMap(this.id).set("clientMetadata", clientMetadata);
    authState.getMap(this.id).set("id", id);
   }

  get store(): Y.Map<any> {
    return authState.getMap<any>(this.id);
  }

  static fromState(
    id: string,
  ): InMemoryOAuthClientProvider {
    return new InMemoryOAuthClientProvider(
      authState.getMap<string>(id).get("redirectUrl")!,
      authState.getMap<OAuthClientMetadata>(id).get("clientMetadata")!,
      id
    );
  }

  public static finishAuth(id: string, authCode: string) {
    authState.getMap<string>(id).set("code", authCode);
    return authState.getMap<string>(id);
  }
  public finishAuth(authCode: string) {
    authState.getMap<string>(this.id).set("code", authCode);
  }
  
  public async save<T>(key: string, value: T) {
    authState.getMap<T>(this.id).set(key, value);
  }
  public async get<T>(key: string) {
    return authState.getMap<T>(this.id).get(key);
  }

  get redirectUrl(): string | URL {
    return authState.getMap<string | URL>(this.id).get("redirectUrl")!;
  }

  get clientMetadata(): OAuthClientMetadata {
    console.log(
      "clientMetadata",
      authState.getMap<OAuthClientMetadata>(this.id).get("clientMetadata")!
    );
    return authState
      .getMap<OAuthClientMetadata>(this.id)
      .get("clientMetadata")!;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return authState
      .getMap<OAuthClientInformationFull>(this.id)
      .get("clientInformation");
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    authState.getMap(this.id).set("clientInformation", clientInformation);
  }

  tokens(): OAuthTokens | undefined {
    return authState.getMap<OAuthTokens>(this.id).get("tokens");
  }

  saveTokens(tokens: OAuthTokens): void {
    authState.getMap<OAuthTokens>(this.id).set("tokens", tokens);
  }

  state(): string | Promise<string> {
    return this.id;
  }

  public async info(): Promise<
    { id?: string; name?: string; email?: string } | undefined
  > {
    const tokens = this.tokens();
   
    if (tokens?.access_token ) {
      const iss =  jwtDecode(tokens?.access_token).iss;
      const userInfoUrl = new URL(`${iss}/userinfo`);
      console.log("userInfoUrl", userInfoUrl.toString());
      const userInfo = await fetch(
        userInfoUrl.toString(),
        {
          headers: {
            Authorization: `Bearer ${tokens?.access_token}`,
          },
        }
      );
      const userInfoJson = await userInfo.json();
      console.log("userInfo", userInfoJson);
      return {
        id: userInfoJson.sub,
        name: userInfoJson.name || userInfoJson.nickname || userInfoJson.given_name,
        email: userInfoJson.email,
      };
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.set("codeVerifier", codeVerifier);
  }

  codeVerifier(): string {
    if (!this.store.get("codeVerifier"))
      throw new Error("No code verifier saved");
    return this.store.get("codeVerifier")!;
  }
 
   
  public async waitForCode(): Promise<string> {
    const state= this.store;
    return await new Promise((resolve) => {
      checkCode();
      function checkCode(){
        if(state.get("code")){
          const code = state.get("code")!;
          state.delete("code");
          state.unobserve(checkCode);
          resolve(code);
        }
      }
      state.observe(checkCode);
    });
  }

  public async tokensAsync(): Promise<OAuthTokens> {
    const state= this.store; 
      return await new Promise((resolve) => {
        function checkTokens(){
          if(state.get("tokens")){
            resolve(state.get("tokens")!);
            state.unobserve(checkTokens);
          }
        }
        checkTokens();
        state.observe(checkTokens);
      });
  }
}


 