# 🚀 LiteCDN - Educational Content Delivery Network with GUI Dashboard

A lightweight, educational CDN implementation with **built-in web-based GUI dashboard** for monitoring and testing.

## ✨ What's Included

### Core CDN System
- **Origin Server** (Port 4000) - Serves static content
- **3 Edge Servers** (Ports 3001-3003) - Caching layer with round-robin routing
- **CDN Gateway/Router** (Port 3000) - Main entry point with reverse-proxy

### NEW: Interactive GUI Dashboard 🎉
- **Real-time test execution** (Load, Cache, Routing tests)
- **Beautiful charts & visualizations** using Chart.js
- **System status monitoring** with metrics
- **Professional web interface** with responsive design

---

## 🎯 Features

### System Features
✅ **Round-Robin Routing** - Distributes requests evenly  
✅ **Edge Caching** - Caches content locally  
✅ **Deterministic Behavior** - Predictable routing for testing  
✅ **Multi-Origin Support** - Connect edges to origin servers  

### Dashboard Features
✅ **Load Distribution Chart** - Bar chart showing requests per edge  
✅ **Cache Status Chart** - Doughnut chart for hit/miss ratio  
✅ **Routing Accuracy Chart** - Verification of round-robin  
✅ **System Status Panel** - Shows active edges and URLs  
✅ **Test Metrics** - Real-time performance data  
✅ **Detailed Results** - Full test logs and data  

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 16
- npm (comes with Node.js)

### Installation
```bash
cd LiteCDN
npm install
```

### Start the System
```bash
npm run start:all
```

### Access the Dashboard
Open your browser:
```
http://localhost:3000/dashboard.html
```

---

## 📊 Using the Dashboard

### 1. **Load Test** (📊)
Tests load balancing across 3 edges
- Sends ~100 concurrent requests
- Shows request distribution
- Displays balance metrics
- **Expected**: ~33 requests per edge

### 2. **Cache Test** (💾)
Verifies caching behavior
- Tracks cache hits vs misses
- Shows hit rate percentage
- First request = MISS, subsequent = HIT
- **Expected**: >50% hit rate

### 3. **Routing Test** (🔀)
Validates round-robin routing
- Verifies deterministic sequence
- Checks accuracy percentage
- Each request goes to next edge in order
- **Expected**: 100% accuracy

---

## 📁 Project Structure

```
LiteCDN/
├── backend/
│   ├── config.js              # Configuration (ports, URLs)
│   ├── cdn.js                 # CDN Gateway with API endpoints
│   ├── testAPI.js             # Test runner for dashboard
│   ├── routing.js             # Round-robin routing logic
│   ├── edge/edge.js           # Edge server with caching
│   └── origin/origin.js       # Origin server
├── frontend/
│   ├── dashboard.html         # GUI Dashboard (NEW!)
│   ├── index.html             # Basic interface
│   └── styles.css
├── scripts/
│   └── startAll.js            # Launcher script
├── testing/
│   ├── testCache.js           # Cache testing
│   ├── testLoad.js            # Load testing
│   ├── testRouting.js         # Routing testing
│   └── testZipf.js            # Zipf distribution test
├── GUIDE.md                   # Basic guide
├── DASHBOARD_GUIDE.md         # Dashboard usage guide
├── GUI_IMPLEMENTATION.md      # Implementation details
└── package.json
```

---

## 🎨 Dashboard UI

### Color Scheme
- **Gradient Background**: Purple (#667eea → #764ba2)
- **Status Green**: #48bb78 (healthy)
- **Status Red**: #f56565 (error)
- **Status Yellow**: #feebc8 (warning)

### Responsive Design
- Works on desktop (full layout)
- Works on tablet (2-column)
- Works on mobile (single column)

---

## 📈 Example Outputs

### Load Test
```json
{
  "distribution": {
    "Edge-1": 34,
    "Edge-2": 33,
    "Edge-3": 33
  },
  "summary": {
    "totalRequests": 100,
    "imbalancePercent": 3.45,
    "status": "Balanced ✅"
  }
}
```

### Cache Test
```json
{
  "summary": {
    "hits": 24,
    "misses": 6,
    "hitRate": "80.0%",
    "status": "Good ✅"
  }
}
```

### Routing Test
```json
{
  "summary": {
    "totalRequests": 12,
    "correctCount": 12,
    "accuracy": "100.0%"
  }
}
```

---

## 🔧 API Endpoints

### Content Delivery
```
GET /cdn/<path>     → Route request through CDN
GET /health         → Check gateway status
GET /status         → Get system status (edges, index)
```

### Dashboard/Testing
```
GET /api/tests/load         → Run load test
GET /api/tests/cache        → Run cache test
GET /api/tests/routing      → Run routing test
GET /dashboard.html         → Dashboard UI
```

---

## 🧪 Testing

### Manual Testing (without dashboard)
```bash
# Terminal 1 - Start system
npm run start:all

# Terminal 2 - Run individual tests
node testing/testLoad.js
node testing/testCache.js
node testing/testRouting.js
node testing/testZipf.js
```

### Automated Testing (with dashboard)
1. Start system: `npm run start:all`
2. Open: `http://localhost:3000/dashboard.html`
3. Click test buttons for live results

---

## 📊 What Each Component Does

### Origin Server (Port 4000)
- Stores master copies of content
- Serves requests from edge caches when miss occurs
- Static files: `hello.txt`, `data.json`, `sample.txt`

### Edge Servers (Ports 3001-3003)
- Local caching layer
- Serves cached content (HIT)
- Falls back to origin on cache miss (MISS)
- Round-robin distributed by gateway

### CDN Gateway (Port 3000)
- Main entry point for clients
- Implements round-robin routing
- Routes requests to appropriate edge
- Serves dashboard UI and API

---

## 🎯 Dashboard Features in Detail

### System Status Panel
Shows:
- Number of active edges
- Current round-robin index
- Edge URLs and ports
- Auto-detected on first load

### Test Summary Panel
Displays quick results:
- Load test: Balanced/Imbalanced
- Cache test: Hit rate %
- Routing test: Accuracy %

### Interactive Charts
1. **Load Distribution** (Bar Chart)
   - Requests per edge
   - Balance metrics
   - Hover for details

2. **Cache Status** (Doughnut Chart)
   - Hit vs miss ratio
   - Percentages
   - Color-coded (green/red)

3. **Routing Accuracy** (Bar Chart)
   - Correct vs incorrect routes
   - Accuracy percentage
   - Pass/fail indication

### Detailed Results Table
- Timestamp for each request
- Edge ID
- Cache status (HIT/MISS)
- Response time
- Searchable and sortable

---

## ⚙️ Configuration

Edit `backend/config.js` to change:
- Gateway port (default: 3000)
- Edge server ports (default: 3001-3003)
- Origin server URL (default: http://localhost:4000)

```javascript
module.exports = {
  cdn: { port: 3000 },
  edges: [
    { id: 'Edge-1', port: 3001 },
    { id: 'Edge-2', port: 3002 },
    { id: 'Edge-3', port: 3003 },
  ],
  origin: { port: 4000 },
};
```

---

## 🚨 Troubleshooting

### Dashboard won't load
- Ensure `npm run start:all` is running
- Check port 3000 is available
- Try full URL: `http://localhost:3000/dashboard.html`

### Tests show errors
- Verify all servers started successfully
- Check console (F12 → Console) for errors
- Ensure no ports are blocked

### Charts not rendering
- Clear browser cache
- Refresh the page
- Check if Chart.js loaded (F12 → Network)

### Load imbalance detected
- This is normal for small samples
- Run load test multiple times
- Check if one edge is slower

---

## 📚 Documentation

- **GUIDE.md** - Basic setup guide
- **DASHBOARD_GUIDE.md** - Complete dashboard usage
- **GUI_IMPLEMENTATION.md** - Technical implementation details
- **DASHBOARD_VISUAL_REFERENCE.md** - Visual layout reference

---

## 🎯 Learning Objectives

This project demonstrates:
- ✅ CDN architecture and round-robin routing
- ✅ Edge caching and hit/miss behavior
- ✅ Load distribution and balancing
- ✅ Reverse proxy implementation
- ✅ REST API design
- ✅ Real-time web dashboards
- ✅ Data visualization with charts

---

## 🔒 Security Notes

- This is an **educational project** not for production
- No authentication or authorization
- No data encryption
- Use only in trusted networks
- No sensitive data handling

---

## 📦 Dependencies

```json
{
  "axios": "^1.7.0",      // HTTP client
  "express": "^4.21.0",   // Web framework
  "cors": "^2.8.5"        // CORS middleware
}
```

Frontend uses:
- Chart.js (via CDN) - Easy charting
- HTML5 - Modern web standards
- CSS3 - Responsive design

---

## 🚀 Performance

Typical test results:
- Load Test: 5-10 seconds (100 requests)
- Cache Test: 2-5 seconds (12 requests)
- Routing Test: 1-3 seconds (12 requests)
- Dashboard rendering: <500ms

---

## 🎉 Features Showcase

### ✨ What Makes This Cool

1. **Beautiful UI** - Modern gradient design with smooth animations
2. **Real-time Tests** - Run tests directly from browser
3. **Smart Charts** - Auto-scaling visualizations
4. **Live Updates** - No page reloads needed
5. **Responsive** - Works on all devices
6. **Educational** - Learn CDN concepts interactively

---

## 📞 Support

For issues or questions:
1. Check the documentation files
2. Review browser console (F12)
3. Check server logs in terminal
4. Verify all servers are running

---

## 📝 License

MIT

---

## 🎓 Educational Value

This CDN implementation is perfect for learning:
- How CDNs distribute content
- How round-robin routing works
- How edge caching improves performance
- How to monitor distributed systems
- How to build web dashboards
- Real-time data visualization

Start learning: `npm run start:all` → `http://localhost:3000/dashboard.html`

**Enjoy your LiteCDN journey! 🚀**
