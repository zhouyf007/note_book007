"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var NotesCore = require("./app.js");

var PORT = Number(process.env.PORT || 3000);
var ROOT = __dirname;
var DATA_FILE = path.join(ROOT, "notes-data.json");
var MAX_BODY_SIZE = 1024 * 1024;

var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readNotes() {
  try {
    return NotesCore.normalizeNotes(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (error) {
    return [];
  }
}

function writeNotes(notes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(NotesCore.normalizeNotes(notes), null, 2), "utf8");
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function collectBody(request, response, callback) {
  var body = "";
  request.on("data", function (chunk) {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      response.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("请求内容过大");
      request.destroy();
    }
  });
  request.on("end", function () {
    callback(body);
  });
}

function serveStatic(request, response) {
  var url = new URL(request.url, "http://localhost");
  var pathname = decodeURIComponent(url.pathname);
  var targetPath = pathname === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, pathname);
  var resolved = path.resolve(targetPath);

  if (!resolved.startsWith(ROOT)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("禁止访问");
    return;
  }

  fs.readFile(resolved, function (error, data) {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("文件不存在");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(resolved)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

var server = http.createServer(function (request, response) {
  if (request.url === "/api/notes" && request.method === "GET") {
    sendJson(response, 200, readNotes());
    return;
  }

  if (request.url === "/api/notes" && request.method === "PUT") {
    collectBody(request, response, function (body) {
      try {
        var notes = NotesCore.normalizeNotes(JSON.parse(body || "[]"));
        writeNotes(notes);
        sendJson(response, 200, notes);
      } catch (error) {
        sendJson(response, 400, { error: "笔记数据格式错误" });
      }
    });
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, function () {
  console.log("笔记服务已启动：http://localhost:" + PORT);
  console.log("所有浏览器访问这个地址会共享同一份 notes-data.json");
});
