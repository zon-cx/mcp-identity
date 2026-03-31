import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { env } from "process";

const docs = new Map<string, HocuspocusProvider>();

export function connectYjs(doc: Y.Doc | string, url?: string): Y.Doc {
  const document =
    typeof doc === "string"
      ? new Y.Doc({ guid: doc, shouldLoad: true, gc: false })
      : doc;

  url = url || env.YJS_URL || "wss://yjs.cfapps.us10-001.hana.ondemand.com";

  if (!docs.has(document.guid)) {
    const provider = new HocuspocusProvider({
      url,
      document,
      forceSyncInterval: 4000,
      name: document.guid,
    });

    docs.set(document.guid, provider);
    provider.startSync();
    provider.document.load();
  }

  return docs.get(document.guid)!.document;
}

