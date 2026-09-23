import brandBoard from '../../assets/latinx/brand-board.png';
import logoBoard from '../../assets/latinx/logo-board.png';

// The supplied PNGs are opaque 1536 × 1024 brand boards. Present selected
// regions without modifying or regenerating the user's original artwork.
export const LATINX_ARTWORK = Object.freeze({
  logo: { source: brandBoard, x: 453, y: 101, width: 249, height: 98 },
  printLogo: { source: brandBoard, x: 20, y: 32, width: 386, height: 234 },
  accent: { source: brandBoard, x: 920, y: 508, width: 176, height: 153 },
  leaves: { source: logoBoard, x: 1148, y: 668, width: 370, height: 168 }
});
export const LATINX_BOARD_SIZE = Object.freeze({ width: 1536, height: 1024 });
