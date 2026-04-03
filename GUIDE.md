# LiteCDN – Quick-Start Guide

## 📁 Project Structure

```
LiteCDN/
├── backend/
│   ├── config.js              # Shared port/URL configuration
│   ├── origin/
│   │   ├── origin.js          # Origin Server (port 4000)
│   │   └── static/            # Static files served by Origin
│   │       ├── hello.txt
│   │       ├── data.json
│   │       └── sample.txt
│   ├── edge/
│   │   └── edge.js            # Edge Server (ports 3001-3003)
│   └── cdn/
│       ├── cdn.js             # CDN Gateway / Router (port 3000)
│       └── routing.js         # Round-Robin RoutingService
├── frontend/
│   └── index.html             # Browser-based test dashboard
├── scripts/
│   └── startAll.js            # One-command launcher for all servers
├── package.json
├── GUIDE.md                   # ← You are here
└── README.md
```

## ⚙️ Prerequisites

- **Node.js** ≥ 16
- **npm** (comes with Node.js)

## 🚀 Installation

```bash
cd LiteCDN
npm install
```

## ▶️ Starting the Servers

### Option A – Start everything at once

```bash
npm run start:all
```

This launches the Origin Server, three Edge Servers, and the CDN Gateway in one terminal.

### Option B – Start each server individually (separate terminals)

Open **5 terminals**, all in the `LiteCDN` folder:

```bash
# Terminal 1 – Origin Server (port 4000)
npm run start:origin

# Terminal 2 – Edge Server 1 (port 3001)
npm run start:edge1

# Terminal 3 – Edge Server 2 (port 3002)
npm run start:edge2

# Terminal 4 – Edge Server 3 (port 3003)
npm run start:edge3

# Terminal 5 – CDN Gateway (port 3000)
npm run start:cdn
```

## 🧪 Testing the Flow

### Using `curl`

```bash
# First request → CACHE MISS (fetches from Origin, caches at Edge)
curl -i http://localhost:3000/cdn/content/hello.txt

# Second request → may be CACHE HIT (if routed to the same edge)
curl -i http://localhost:3000/cdn/content/hello.txt

# Third request → will go to the next edge (round-robin)
curl -i http://localhost:3000/cdn/content/hello.txt

# Fetch JSON data
curl -i http://localhost:3000/cdn/content/data.json

# Fetch dynamic mock API data
curl -i http://localhost:3000/cdn/mock/api
```

### Using PowerShell (`Invoke-RestMethod`)

```powershell
Invoke-RestMethod http://localhost:3000/cdn/content/hello.txt
Invoke-RestMethod http://localhost:3000/cdn/content/data.json
```

### Using the Browser Dashboard

Open `frontend/index.html` in a browser, select a resource, and click **"Fetch via CDN"**. The dashboard shows the cache status (`HIT`/`MISS`), the Edge Server that handled the request, and the response time.

## 🔍 Useful Debug Endpoints

| Endpoint | Description |
|---|---|
| `http://localhost:3000/health` | CDN Gateway health |
| `http://localhost:3000/status` | Routing info & edge list |
| `http://localhost:3001/health` | Edge-1 health + cache size |
| `http://localhost:3001/cache`  | Edge-1 cached keys |
| `http://localhost:4000/health` | Origin Server health |

## 📊 Expected Console Output

When you run `curl http://localhost:3000/cdn/content/hello.txt`, the terminal logs will show:

```
[CDNSystem]  📥  Request received: GET /cdn/content/hello.txt
[RoutingService] 🔀 Round-Robin → selected Edge-1 (http://localhost:3001)
[CDNSystem]  🔀 Routed to Edge-1 (http://localhost:3001)
[CDNSystem]  ➡️  Forwarding to: http://localhost:3001/fetch/content/hello.txt

[Edge-1] 📥  GET /fetch/content/hello.txt
[Edge-1] ❌ CACHE MISS → "/content/hello.txt"
[Edge-1] 🔄 Fetching from Origin: http://localhost:4000/content/hello.txt

[OriginServer] 📥  GET /content/hello.txt

[Edge-1] 💾 Stored in cache: "/content/hello.txt"
[CDNSystem] ✅  Response from Edge-1 | Cache: MISS
```

A second request to the same edge will show:

```
[Edge-1] ⚡ CACHE HIT → "/content/hello.txt"
```

## 📝 Scope

| Requirement | Status |
|---|---|
| CDNSystem accepts HTTP requests | ✅ |
| Round-Robin routing to Edge Servers | ✅ |
| Request forwarding to selected Edge | ✅ |
| Basic in-memory cache (Map) | ✅ |
| Cache hit → serve from cache | ✅ |
| Cache miss → fetch from Origin | ✅ |
| Return origin content to client | ✅ |
| Store fetched content in cache | ✅ |
| Console logging at each step | ✅ |
