import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const distPath = join(__dirname, 'dist');

// Middleware to set correct MIME types for JavaScript files
app.use((req, res, next) => {
  // Set correct MIME type for JavaScript files
  if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  } else if (req.path.endsWith('.mjs')) {
    res.type('application/javascript');
  } else if (req.path.endsWith('.css')) {
    res.type('text/css');
  } else if (req.path.endsWith('.json')) {
    res.type('application/json');
  } else if (req.path.endsWith('.svg')) {
    res.type('image/svg+xml');
  } else if (req.path.endsWith('.png')) {
    res.type('image/png');
  }
  next();
});

// Serve static files from dist directory
// This must come before the catch-all route
app.use(express.static(distPath, {
  // Don't set index, we'll handle SPA routing manually
  index: false,
  // Set proper MIME types
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  }
}));

// SPA fallback: serve index.html for all non-file routes
// This should only catch routes that don't match static files
app.get('*', (req, res) => {
  // Check if the request is for a file (has extension)
  const hasExtension = /\.[^/]+$/.test(req.path);
  
  if (hasExtension) {
    // It's a file request - check if file exists
    const filePath = join(distPath, req.path);
    try {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        // File exists, but express.static should have served it
        // If we reach here, something went wrong - try to serve it manually
        return res.sendFile(filePath);
      }
    } catch (err) {
      // Error checking file, return 404
      return res.status(404).send('File not found');
    }
    // File doesn't exist
    return res.status(404).send('File not found');
  }
  
  // For all other routes (SPA routes), serve index.html
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving files from: ${distPath}`);
});
