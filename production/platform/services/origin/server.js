const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
let isEnabled = true;

fs.mkdirSync(DATA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DATA_DIR),
  filename: (_req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage });

app.use((req, res, next) => {
  if (!isEnabled && !req.path.startsWith('/admin') && req.path !== '/health') {
    return res.status(503).json({ error: 'origin is disabled' });
  }
  return next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'UP', service: 'origin', enabled: isEnabled });
});

app.get('/files', async (_req, res) => {
  const entries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const fullPath = path.join(DATA_DIR, e.name);
        const stats = await fs.promises.stat(fullPath);
        return {
          name: e.name,
          size: stats.size,
          updatedAt: stats.mtime.toISOString()
        };
      })
  );

  files.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ files });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }
  return res.status(201).json({
    message: 'uploaded',
    file: {
      name: req.file.originalname,
      size: req.file.size
    }
  });
});

app.get('/content/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const fullPath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'file not found on origin' });
  }

  const contentType = mime.lookup(filename) || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  return res.sendFile(fullPath);
});

app.delete('/content/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const fullPath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'file not found on origin' });
  }

  await fs.promises.unlink(fullPath);
  return res.json({ message: 'deleted', filename });
});

app.post('/admin/state', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean' });
  }
  isEnabled = enabled;
  return res.json({ message: 'origin state updated', enabled: isEnabled });
});

app.listen(PORT, () => {
  console.log(`[origin] running on :${PORT} with data dir ${DATA_DIR}`);
});
