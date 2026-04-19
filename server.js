// server.js — Next.js custom server for cPanel Node.js App (3D Ninjaz /v1 preview)
// Passenger / cPanel sets PORT automatically.
const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
      // eslint-disable-next-line no-console
      console.log(`> 3D Ninjaz /v1 ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start Next.js server:", err);
    process.exit(1);
  });
