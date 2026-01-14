/**
 * Font Loading Utility
 * 
 * Dynamically loads font files and applies them to CSS variables.
 * Supports both uploaded fonts (with file_path) and system fonts (family_name only).
 */

// Track loaded fonts to avoid duplicate @font-face declarations
const loadedFonts = new Set();

/**
 * Get font file format from file extension
 * @param {string} filePath - Path to font file
 * @returns {string} Font format (woff2, woff, ttf, otf)
 */
function getFontFormat(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const formatMap = {
    'woff2': 'woff2',
    'woff': 'woff',
    'ttf': 'truetype',
    'otf': 'opentype'
  };
  return formatMap[ext] || 'woff2';
}

/**
 * Load a single font file and create @font-face declaration
 * @param {Object} font - Font object with file_path and family_name
 * @returns {Promise<void>}
 */
export async function loadFont(font) {
  if (!font) return;
  
  const { file_path, family_name, name } = font;
  
  // If no file_path, it's a system font - just return the family_name
  if (!file_path) {
    return family_name || name;
  }
  
  // Create unique identifier for this font
  const fontId = `${family_name}-${file_path}`;
  
  // Skip if already loaded
  if (loadedFonts.has(fontId)) {
    return family_name || name;
  }
  
  try {
    // Create @font-face declaration
    const fontFormat = getFontFormat(file_path);
    // Normalize file_path - handle various formats:
    // - Remove leading slash if present
    // - Remove "uploads/" prefix if already present to avoid double prefix
    // - Ensure final path is "fonts/..." or "icons/..." etc.
    let normalizedPath = file_path.startsWith('/') ? file_path.slice(1) : file_path;
    if (normalizedPath.startsWith('uploads/')) {
      normalizedPath = normalizedPath.substring('uploads/'.length);
    }
    // Build absolute URL to backend /uploads (frontend is a separate service in prod)
    // VITE_API_URL should be like "https://onboarding-backend.../api"
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
    const fontUrl = `${apiBase}/uploads/${normalizedPath}`;
    
    // Create style element for @font-face
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: '${family_name || name}';
        src: url('${fontUrl}') format('${fontFormat}');
        font-display: swap;
      }
    `;
    
    // Append to document head
    document.head.appendChild(style);
    
    // Mark as loaded
    loadedFonts.add(fontId);
    
    // Wait for font to load with timeout
    // If font fails to load (404/500), browser will use fallback
    try {
      await Promise.race([
        document.fonts.load(`1em '${family_name || name}'`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), 5000))
      ]);
    } catch (loadError) {
      // Font file may not exist or failed to load - silently use fallback
      // Browser will automatically use system fonts as fallback
    }
    
    return family_name || name;
  } catch (error) {
    // Silently fail - browser will use system font fallback
    // Only log in development for debugging
    if (import.meta.env.DEV) {
      console.warn(`Font not available, using system fallback: ${family_name || name}`, error.message);
    }
    // Return family_name as fallback
    return family_name || name;
  }
}

/**
 * Load all platform branding fonts
 * @param {Object} platformBranding - Platform branding object with font fields
 * @returns {Promise<Object>} Object with font family names for each type
 */
export async function loadPlatformFonts(platformBranding) {
  if (!platformBranding) {
    return {
      headerFont: null,
      bodyFont: null,
      numericFont: null,
      displayFont: null
    };
  }
  
  const fonts = {
    headerFont: null,
    bodyFont: null,
    numericFont: null,
    displayFont: null
  };
  
  // Load fonts if they have file_path (uploaded fonts)
  // Otherwise use family_name or fallback to font name field
  
  // Header font
  if (platformBranding.header_font_path && platformBranding.header_font_family) {
    const headerFont = await loadFont({
      file_path: platformBranding.header_font_path,
      family_name: platformBranding.header_font_family,
      name: platformBranding.header_font_name
    });
    fonts.headerFont = headerFont || platformBranding.header_font_family || platformBranding.header_font;
  } else {
    fonts.headerFont = platformBranding.header_font_family || platformBranding.header_font || null;
  }
  
  // Body font
  if (platformBranding.body_font_path && platformBranding.body_font_family) {
    const bodyFont = await loadFont({
      file_path: platformBranding.body_font_path,
      family_name: platformBranding.body_font_family,
      name: platformBranding.body_font_name
    });
    fonts.bodyFont = bodyFont || platformBranding.body_font_family || platformBranding.body_font;
  } else {
    fonts.bodyFont = platformBranding.body_font_family || platformBranding.body_font || null;
  }
  
  // Numeric font
  if (platformBranding.numeric_font_path && platformBranding.numeric_font_family) {
    const numericFont = await loadFont({
      file_path: platformBranding.numeric_font_path,
      family_name: platformBranding.numeric_font_family,
      name: platformBranding.numeric_font_name
    });
    fonts.numericFont = numericFont || platformBranding.numeric_font_family || platformBranding.numeric_font;
  } else {
    fonts.numericFont = platformBranding.numeric_font_family || platformBranding.numeric_font || null;
  }
  
  // Display font
  if (platformBranding.display_font_path && platformBranding.display_font_family) {
    const displayFont = await loadFont({
      file_path: platformBranding.display_font_path,
      family_name: platformBranding.display_font_family,
      name: platformBranding.display_font_name
    });
    fonts.displayFont = displayFont || platformBranding.display_font_family || platformBranding.display_font;
  } else {
    fonts.displayFont = platformBranding.display_font_family || platformBranding.display_font || null;
  }
  
  return fonts;
}

/**
 * Apply font families to CSS variables
 * @param {Object} fonts - Object with font family names
 */
export function applyFontsToCSS(fonts) {
  const root = document.documentElement;
  
  // Default fallbacks from style.css
  const defaults = {
    header: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    numeric: "'IBM Plex Mono', 'Courier New', monospace",
    display: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  };
  
  // Apply header font
  if (fonts.headerFont) {
    root.style.setProperty('--font-header', `'${fonts.headerFont}', ${defaults.header.split(',').slice(1).join(',').trim()}`);
  } else {
    root.style.setProperty('--font-header', defaults.header);
  }
  
  // Apply body font
  if (fonts.bodyFont) {
    root.style.setProperty('--font-body', `'${fonts.bodyFont}', ${defaults.body.split(',').slice(1).join(',').trim()}`);
  } else {
    root.style.setProperty('--font-body', defaults.body);
  }
  
  // Apply numeric font
  if (fonts.numericFont) {
    root.style.setProperty('--font-numeric', `'${fonts.numericFont}', ${defaults.numeric.split(',').slice(1).join(',').trim()}`);
  } else {
    root.style.setProperty('--font-numeric', defaults.numeric);
  }
  
  // Apply display font
  if (fonts.displayFont) {
    root.style.setProperty('--font-display', `'${fonts.displayFont}', ${defaults.display.split(',').slice(1).join(',').trim()}`);
  } else {
    root.style.setProperty('--font-display', defaults.display);
  }
}

/**
 * Load and apply platform branding fonts
 * @param {Object} platformBranding - Platform branding object
 * @returns {Promise<void>}
 */
export async function loadAndApplyPlatformFonts(platformBranding) {
  try {
    const fonts = await loadPlatformFonts(platformBranding);
    applyFontsToCSS(fonts);
  } catch (error) {
    console.error('Error loading and applying platform fonts:', error);
  }
}
