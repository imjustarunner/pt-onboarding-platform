import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const distPath = join(__dirname, 'dist');

console.log(`Serving files from: ${distPath}`);
console.log(`Dist directory exists: ${existsSync(distPath)}`);

// Log what files exist in dist directory
if (existsSync(distPath)) {
  try {
    const distContents = readdirSync(distPath);
    console.log(`Dist directory contents: ${distContents.join(', ')}`);
    
    // Check assets folder
    const assetsPath = join(distPath, 'assets');
    if (existsSync(assetsPath)) {
      const assetsContents = readdirSync(assetsPath);
      console.log(`Assets directory contents (${assetsContents.length} files):`);
      assetsContents.forEach(file => {
        const filePath = join(assetsPath, file);
        const stats = statSync(filePath);
        console.log(`  - ${file} (${stats.size} bytes)`);
      });
      
      // Check what index.html references
      try {
        const indexPath = join(distPath, 'index.html');
        const indexContent = readFileSync(indexPath, 'utf-8');
        const jsMatch = indexContent.match(/src="([^"]*\.js)"/);
        const cssMatch = indexContent.match(/href="([^"]*\.css)"/);
        if (jsMatch) {
          const referencedJs = jsMatch[1].replace(/^\//, '');
          console.log(`index.html references JS: ${referencedJs}`);
          const referencedJsPath = join(distPath, referencedJs);
          console.log(`  File exists: ${existsSync(referencedJsPath)}`);
          if (!existsSync(referencedJsPath)) {
            console.log(`  ERROR: Referenced file does not exist! Looking for: ${referencedJsPath}`);
          }
        }
        if (cssMatch) {
          const referencedCss = cssMatch[1].replace(/^\//, '');
          console.log(`index.html references CSS: ${referencedCss}`);
        }
      } catch (err) {
        console.error('Error reading index.html:', err);
      }
    } else {
      console.log('WARNING: assets directory does not exist!');
    }
    
    // Check index.html
    const indexPath = join(distPath, 'index.html');
    if (existsSync(indexPath)) {
      console.log('✓ index.html exists');
    } else {
      console.log('✗ index.html does NOT exist!');
    }
  } catch (err) {
    console.error('Error reading dist directory:', err);
  }
} else {
  console.error('ERROR: dist directory does not exist! Build may have failed.');
}

// Serve static files from dist directory
// This handles all static assets including /assets/* files
app.use(express.static(distPath, {
  index: false, // Don't serve index.html automatically
  setHeaders: (res, path) => {
    // Set correct MIME types
    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
    
    // Cache static assets (JS, CSS) for 1 year, but not index.html
    if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.css') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// SPA fallback: serve index.html for all routes that don't match static files
app.get('*', (req, res) => {
  // Check if this is a request for a file (has file extension)
  const hasExtension = /\.[^/]+$/.test(req.path);
  
  if (hasExtension) {
    // It's a file request - if we reach here, express.static didn't find it
    const filePath = join(distPath, req.path);
    console.log(`[404] File not found: ${req.path} (checked: ${filePath})`);
    return res.status(404).send('File not found');
  }
  
  // For all other routes (SPA routes), serve index.html
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    // Prevent caching of index.html to ensure fresh content
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(indexPath);
  } else {
    console.error(`[ERROR] index.html not found at: ${indexPath}`);
    res.status(500).send('index.html not found');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving files from: ${distPath}`);
});
