/**
 * VF Production Plan - Color Mapping Utility
 *
 * This utility provides color mapping functionality for the VF production plan UI.
 * It handles color name to HEX code conversion with special handling for white/ivory colors.
 */

export interface ColorMapping {
  text: string;
  background: string;
  isSpecial: boolean; // true for white/ivory colors that need background styling
}

/**
 * Complete color map based on VF production plan specifications
 * Follows Approach A: Text color only for normal colors, Text+Background for white/ivory
 */
const COLOR_MAP: Record<string, ColorMapping> = {
  // Normal colors (text color only, white background)
  "Black": { text: "#000000", background: "#FFFFFF", isSpecial: false },
  "Brown": { text: "#8B4513", background: "#FFFFFF", isSpecial: false },
  "Dark Brown": { text: "#5D4037", background: "#FFFFFF", isSpecial: false },
  "Gray1": { text: "#808080", background: "#FFFFFF", isSpecial: false },
  "Gray2": { text: "#A9A9A9", background: "#FFFFFF", isSpecial: false },
  "Gray3": { text: "#696969", background: "#FFFFFF", isSpecial: false },
  "Gray4": { text: "#D3D3D3", background: "#FFFFFF", isSpecial: false },
  "Green": { text: "#228B22", background: "#FFFFFF", isSpecial: false },
  "Dark Green": { text: "#006400", background: "#FFFFFF", isSpecial: false },
  "NAVY1": { text: "#000080", background: "#FFFFFF", isSpecial: false },
  "Navy2": { text: "#191970", background: "#FFFFFF", isSpecial: false },
  "Modern Blue(B3)": { text: "#1E90FF", background: "#FFFFFF", isSpecial: false },
  "BLUE(B2)": { text: "#4169E1", background: "#FFFFFF", isSpecial: false },
  "EU BLUE": { text: "#4682B4", background: "#FFFFFF", isSpecial: false },
  "Dark O": { text: "#2F4F4F", background: "#FFFFFF", isSpecial: false },
  "Mint1": { text: "#98FB98", background: "#FFFFFF", isSpecial: false },
  "Mint2": { text: "#3CB371", background: "#FFFFFF", isSpecial: false },
  "Violet": { text: "#8A2BE2", background: "#FFFFFF", isSpecial: false },
  "Baige": { text: "#F5F5DC", background: "#FFFFFF", isSpecial: false },
  "Orange": { text: "#FFA500", background: "#FFFFFF", isSpecial: false },
  "EU YELLO": { text: "#FFD700", background: "#FFFFFF", isSpecial: false },
  "Yello": { text: "#FFFF00", background: "#FFFFFF", isSpecial: false },
  "Butter": { text: "#FFFACD", background: "#FFFFFF", isSpecial: false },
  "Pink(P2)": { text: "#FFC0CB", background: "#FFFFFF", isSpecial: false },
  "Pink(P3)": { text: "#DB7093", background: "#FFFFFF", isSpecial: false },
  "Kaki(BRIDA)": { text: "#C3B091", background: "#FFFFFF", isSpecial: false },
  "Orange(BRIDA)": { text: "#FF8C00", background: "#FFFFFF", isSpecial: false },
  "Yello(BRIDA)": { text: "#FFD700", background: "#FFFFFF", isSpecial: false },
  "O": { text: "#708090", background: "#FFFFFF", isSpecial: false },
  "Ratan Deep Green": { text: "#2E8B57", background: "#FFFFFF", isSpecial: false },
  "Navy(BRIDA)": { text: "#000080", background: "#FFFFFF", isSpecial: false },
  "EU RED": { text: "#DC1434", background: "#FFFFFF", isSpecial: false },
  "Simple Gray1": { text: "#808080", background: "#FFFFFF", isSpecial: false },
  "Simple Gray2": { text: "#A9A9A9", background: "#FFFFFF", isSpecial: false },
  "Simple Butter": { text: "#FFFACD", background: "#FFFFFF", isSpecial: false },
  "Simple Navy1": { text: "#000080", background: "#FFFFFF", isSpecial: false },
  "Simple Pink3": { text: "#DB7093", background: "#FFFFFF", isSpecial: false },
  "Simple Blue3": { text: "#1E90FF", background: "#FFFFFF", isSpecial: false },
  "Simple Mint1": { text: "#98FB98", background: "#FFFFFF", isSpecial: false },
  "Ratan Brown": { text: "#8B4513", background: "#FFFFFF", isSpecial: false },
  "Ratan Butter": { text: "#FFFACD", background: "#FFFFFF", isSpecial: false },
  "Decos Butter": { text: "#FFFACD", background: "#FFFFFF", isSpecial: false },
  "Decos NAVY2": { text: "#191970", background: "#FFFFFF", isSpecial: false },
  "Decos Gray2": { text: "#A9A9A9", background: "#FFFFFF", isSpecial: false },
  "Decos Pink3": { text: "#DB7093", background: "#FFFFFF", isSpecial: false },
  "Decos NAVY1": { text: "#000080", background: "#FFFFFF", isSpecial: false },
  "Decos Gray1": { text: "#808080", background: "#FFFFFF", isSpecial: false },
  "Happy (B3)": { text: "#1E90FF", background: "#FFFFFF", isSpecial: false },
  "Happy (Butter)": { text: "#FFFACD", background: "#FFFFFF", isSpecial: false },
  "Happy (Gray2)": { text: "#A9A9A9", background: "#FFFFFF", isSpecial: false },
  "Happy (PINK3)": { text: "#DB7093", background: "#FFFFFF", isSpecial: false },
  "Extra Large Body (Blue3)": { text: "#1E90FF", background: "#FFFFFF", isSpecial: false },
  "Extra Large Body (Butter)": { text: "#FFFACD", background: "#FFFFFF", isSpecial: false },
  "Extra Large Body (Gray2)": { text: "#A9A9A9", background: "#FFFFFF", isSpecial: false },
  "Extra Large Body (PINK3)": { text: "#DB7093", background: "#FFFFFF", isSpecial: false },

  // White/Ivory colors (text + background for clear visibility)
  "WHITE1": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "Simple White": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE1_RATAN": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE1_DECOS": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE1_LOTTE": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE1_BRIDA": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE(BRIDA)": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE-CAP(WHITE)": { text: "#000000", background: "#F5F5F5", isSpecial: true },
  "WHITE2": { text: "#696969", background: "#FFF8DC", isSpecial: true },
  "IVORY": { text: "#8B7355", background: "#FFF8DC", isSpecial: true },
  "Ivory": { text: "#8B7355", background: "#FFF8DC", isSpecial: true },
  "Simple Ivory": { text: "#8B7355", background: "#FFF8DC", isSpecial: true },
  "Ratan Ivory": { text: "#8B7355", background: "#FFF8DC", isSpecial: true },
  "IVORY2": { text: "#A0522D", background: "#FAF0E6", isSpecial: true },
  "Ivory2": { text: "#A0522D", background: "#FAF0E6", isSpecial: true },
  "IVORY-CAP(IVORY)": { text: "#8B7355", background: "#FFF8DC", isSpecial: true },
};

/**
 * Get color mapping for a given color name
 * @param colorName - The color name to look up (e.g., "Black", "WHITE1", "Pink(P2)")
 * @returns ColorMapping object with text and background colors
 * @throws Error if color name is not found
 */
export function getColorMapping(colorName: string): ColorMapping {
  const color = COLOR_MAP[colorName];
  if (!color) {
    console.warn(`Color not found in mapping: "${colorName}". Using default styling.`);
    return { text: "#000000", background: "#FFFFFF", isSpecial: false };
  }
  return color;
}

/**
 * Check if a color is a special white/ivory color
 * @param colorName - The color name to check
 * @returns true if the color requires special background styling
 */
export function isSpecialColor(colorName: string): boolean {
  return getColorMapping(colorName).isSpecial;
}

/**
 * Get CSS style object for a given color name
 * @param colorName - The color name to get styles for
 * @returns CSS style object with color and backgroundColor
 */
export function getColorStyles(colorName: string): React.CSSProperties {
  const mapping = getColorMapping(colorName);
  return {
    color: mapping.text,
    backgroundColor: mapping.background,
  };
}

/**
 * Get all available color names
 * @returns Array of all available color names
 */
export function getAvailableColors(): string[] {
  return Object.keys(COLOR_MAP);
}

/**
 * Normalize color name (handle case sensitivity and common variations)
 * @param colorName - The color name to normalize
 * @returns Normalized color name
 */
export function normalizeColorName(colorName: string): string {
  if (!colorName) return "";

  // Remove extra whitespace
  const trimmed = colorName.trim();

  // Try exact match first (case-sensitive)
  if (COLOR_MAP[trimmed]) {
    return trimmed;
  }

  // Try case-insensitive match
  const upperKey = trimmed.toUpperCase();
  const matchedKey = Object.keys(COLOR_MAP).find(key => key.toUpperCase() === upperKey);

  return matchedKey || trimmed;
}

/**
 * Get a default color for unknown colors
 * @returns Default color mapping
 */
export function getDefaultColor(): ColorMapping {
  return { text: "#000000", background: "#FFFFFF", isSpecial: false };
}

/**
 * Color mapping utility class for more advanced usage
 */
export class ColorUtility {
  private cache: Map<string, ColorMapping> = new Map();

  /**
   * Get color mapping with caching
   */
  getColor(colorName: string): ColorMapping {
    const normalized = normalizeColorName(colorName);

    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    const mapping = getColorMapping(normalized);
    this.cache.set(normalized, mapping);
    return mapping;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get color contrast ratio for accessibility
   */
  getContrastRatio(colorName: string): number {
    const mapping = this.getColor(colorName);
    return calculateContrastRatio(mapping.text, mapping.background);
  }

  /**
   * Check if color contrast meets WCAG AA standard
   */
  isAccessible(colorName: string): boolean {
    return this.getContrastRatio(colorName) >= 4.5;
  }
}

/**
 * Calculate contrast ratio between two colors for accessibility
 */
function calculateContrastRatio(color1: string, color2: string): number {
  const luminance1 = getLuminance(color1);
  const luminance2 = getLuminance(color2);
  const lighter = Math.max(luminance1, luminance2);
  const darker = Math.min(luminance1, luminance2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get luminance of a color for contrast calculations
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const a = [rgb.r, rgb.g, rgb.b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Convert HEX color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// Export utility instance
export const colorUtility = new ColorUtility();