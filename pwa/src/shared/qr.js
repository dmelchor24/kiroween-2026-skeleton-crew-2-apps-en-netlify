/**
 * qr.js — Generates and renders a QR code as inline SVG.
 */

import qrcodeLib from "qrcode-generator";

// qrcode-generator exports the function as default in CJS.
// Vite may wrap it in an object with .default — normalize both cases.
const qrcode = typeof qrcodeLib === "function" ? qrcodeLib : qrcodeLib.default;

/**
 * Draws an SVG QR code in the given container.
 * @param {HTMLElement} container - Element where the SVG is injected
 * @param {string} text          - Text/URI to encode (e.g. otpauth://)
 */
export function renderQr(container, text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 2;
  const size  = count + quiet * 2;
  let path = "";

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }

  container.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`;
}
