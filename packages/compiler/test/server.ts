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
}

export async function serveDirectory(root: string): Promise<StaticServer> {
  const server: Server = createServer((request, response) => {
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
  };
}
