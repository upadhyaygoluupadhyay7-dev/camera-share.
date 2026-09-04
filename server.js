const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const rooms = new Map();

const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "/index.html" : req.url;
  file = path.join(PUBLIC, file);

  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(file);
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css"
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream"
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function makeCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "create") {
      const code = makeCode();

      rooms.set(code, {
        sharer: ws,
        viewer: null
      });

      ws.room = code;
      ws.role = "sharer";

      send(ws, {
        type: "created",
        code
      });

      return;
    }

    if (msg.type === "join") {
      const room = rooms.get(msg.code);

      if (!room || room.viewer) {
        return send(ws, {
          type: "error",
          message: "Invalid or busy sharing code."
        });
      }

      room.viewer = ws;

      ws.room = msg.code;
      ws.role = "viewer";

      send(room.sharer, {
        type: "viewer-joined"
      });

      return;
    }

    const room = rooms.get(ws.room);
    if (!room) return;

    const other =
      ws.role === "sharer"
        ? room.viewer
        : room.sharer;

    if (["offer", "answer", "candidate"].includes(msg.type)) {
      send(other, msg);
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.room);

    if (!room) return;

    const other =
      ws.role === "sharer"
        ? room.viewer
        : room.sharer;

    send(other, {
      type: "peer-left"
    });

    rooms.delete(ws.room);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
