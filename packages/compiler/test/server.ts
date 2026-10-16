import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

export interface StaticServer {
  url: string;
  close: () => Promise<void>;
  /** Bodies posted to /api/data/, so a test can see what an experiment uploaded. */
  uploads: { experimentID: string; filename: string; data: string }[];
  /** Set to make the upload route fail, exercising the fallback path. */
  failUploads: boolean;
  /** The group number /api/condition/ hands out next. */
  nextCondition: number;
}

export async function serveDirectory(root: string): Promise<StaticServer> {
  const uploads: StaticServer["uploads"] = [];
  const state = { failUploads: false, nextCondition: 0 };

  const server: Server = createServer((request, response) => {
    if (request.url?.startsWith("/api/condition")) {
      response.setHeader("access-control-allow-origin", "*");
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ condition: state.nextCondition }));
      return;
    }
    if (request.url?.startsWith("/api/data")) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.setHeader("access-control-allow-origin", "*");
        if (state.failUploads) {
          response.writeHead(500).end("nope");
          return;
        }
        uploads.push(JSON.parse(Buffer.concat(chunks).toString()) as (typeof uploads)[number]);
        response.writeHead(200, { "content-type": "application/json" }).end("{}");
      });
      return;
    }
    const requestedPath = new URL(request.url ?? "/", "http://localhost").pathname;
    if (requestedPath === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const filePath = join(root, normalize(requestedPath));
    if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server has no port");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    uploads,
    get failUploads() {
      return state.failUploads;
    },
    set failUploads(value: boolean) {
      state.failUploads = value;
    },
    get nextCondition() {
      return state.nextCondition;
    },
    set nextCondition(value: number) {
      state.nextCondition = value;
    },
  };
}
