const path = require("path");
const http = require("http");
const fs = require("fs");

const PORT = 5000;
const ROOT_DIR = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const CSS_DIR = path.join(ROOT_DIR, "css");

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];

  // Redirigir raíz a home.html
  if (reqPath === "/" || reqPath === "/index" || reqPath === "") {
    reqPath = "/home.html";
  }

  let filePath;
  if (reqPath.startsWith("/css/")) {
    filePath = path.join(CSS_DIR, reqPath.replace("/css/", ""));
  } else {
    filePath = path.join(FRONTEND_DIR, reqPath);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Intentar buscar en raíz
      const fallbackPath = path.join(ROOT_DIR, reqPath);
      fs.stat(fallbackPath, (err2, stats2) => {
        if (err2 || !stats2.isFile()) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
          res.end(`404 Not Found: ${req.url}`);
        } else {
          serveFile(fallbackPath, res);
        }
      });
    } else {
      serveFile(filePath, res);
    }
  });
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("500 Internal Server Error");
    } else {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      });
      res.end(data);
    }
  });
}

server.listen(PORT, () => {
  console.log(`🌐 MealOps Frontend Web Server corriendo en http://localhost:${PORT}`);
  console.log(`   - Home Panel: http://localhost:${PORT}/home.html`);
  console.log(`   - KDS Cocina: http://localhost:${PORT}/kds.html`);
  console.log(`   - Ventas POS: http://localhost:${PORT}/index.html`);
  console.log(`   - Menú:       http://localhost:${PORT}/menu.html`);
  console.log(`   - Productos:  http://localhost:${PORT}/products.html`);
  console.log(`   - Login:      http://localhost:${PORT}/login.html`);
});
