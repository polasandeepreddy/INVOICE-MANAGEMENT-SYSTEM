const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Puppeteer's A4 paper size, in points (72pt = 1in). Must match the `format: "A4"` passed to page.pdf() below.
const PAGE_WIDTH_PT = 8.27 * 72;   // 595.44
const PAGE_HEIGHT_PT = 11.69 * 72; // 841.68

// Must match the `margin` object passed to page.pdf() below.
const MARGIN_TOP_MM = 15;
const MARGIN_LEFT_MM = 10;
const MM_TO_PT = 2.834645669;
const MARGIN_TOP_PT = MARGIN_TOP_MM * MM_TO_PT;
const MARGIN_LEFT_PT = MARGIN_LEFT_MM * MM_TO_PT;

const PX_TO_PT = 72 / 96; // Chrome's print pipeline uses 96 CSS px = 1in = 72pt

// Printable content width, expressed in CSS px, so a viewport of this width makes on-screen
// layout (getBoundingClientRect) match what Chrome's print engine will actually lay out — Chrome
// reflows the page to the paper's printable width when generating a PDF, not to the browser
// viewport width, so we set the viewport to that same width before measuring anything.
const CONTENT_WIDTH_PX = Math.round((PAGE_WIDTH_PT - MARGIN_LEFT_PT * 2) / PX_TO_PT);

/**
 * Reads the on-page rects of the "For :" line, the "Authorized Signatory" line, and their
 * shared signature column (elements #cs-sig-for / #cs-sig-auth / #cs-sig-col in the invoice
 * HTML template), and converts the empty gap between the two lines into a PDF-point rectangle
 * (bottom-left origin, [x, y, width, height]) that a signing API's `location` field can use.
 * Returns null if those elements aren't present in the HTML (e.g. templates that don't render
 * a signature block), so callers can fall back to a fixed position.
 */
const measureSignatureGap = async (page) => {
    const layout = await page.evaluate(() => {
        const col = document.getElementById('cs-sig-col');
        const forEl = document.getElementById('cs-sig-for');
        const authEl = document.getElementById('cs-sig-auth');
        if (!col || !forEl || !authEl) return null;
        const toRect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        return { col: toRect(col), forLine: toRect(forEl), authLine: toRect(authEl) };
    });

    if (!layout) return null;

    // Horizontally center on the "For : JAYARAMA ASSOCIATES" and "Authorized Signatory" text lines
    const forCenterPx = (layout.forLine.left + layout.forLine.right) / 2;
    const authCenterPx = (layout.authLine.left + layout.authLine.right) / 2;
    const targetCenterPx = (forCenterPx + authCenterPx) / 2;

    const gapTopPx = layout.forLine.bottom;   // just below "For :"
    const gapBottomPx = layout.authLine.top;  // just above "Authorized Signatory"
    const gapHeightPx = gapBottomPx - gapTopPx;

    // If the two lines are touching/overlapping, signal to use fallback
    if (gapHeightPx < 6) return null;

    // Standard digital signature box dimensions (180-190 pt width, 65-75 pt height)
    // CloudSigner stamps require at least 180pt width and 65pt height to avoid vertical text compression
    const boxWidthPt = Math.max(180, Math.min(200, (layout.col.width || 240) * PX_TO_PT));
    const boxHeightPt = Math.max(65, Math.min(80, (gapHeightPx - 6) * PX_TO_PT));

    const boxWidthPx = boxWidthPt / PX_TO_PT;
    const boxLeftPx = targetCenterPx - boxWidthPx / 2;
    const boxTopPx = gapTopPx + Math.max(2, (gapHeightPx - (boxHeightPt / PX_TO_PT)) / 2);

    // Convert CSS-px viewport rect (origin: top-left) into PDF points (origin: bottom-left)
    const llx = MARGIN_LEFT_PT + boxLeftPx * PX_TO_PT;
    const ury = PAGE_HEIGHT_PT - (MARGIN_TOP_PT + boxTopPx * PX_TO_PT);
    const lly = ury - boxHeightPt;

    return {
        x: Math.round(llx),
        y: Math.round(lly),
        width: Math.round(boxWidthPt),
        height: Math.round(boxHeightPt)
    };
};

const generateInvoicePDF = async (htmlContent, outputPath) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: CONTENT_WIDTH_PX,
      height: 3000,
      deviceScaleFactor: 2,
    });

    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    let signatureGapRect = null;
    try {
      signatureGapRect = await measureSignatureGap(page);
    } catch (measureErr) {
      console.warn('[generateInvoicePDF] Could not measure signature gap:', measureErr.message);
    }

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: `${MARGIN_TOP_MM}mm`,
        right: "10mm",
        bottom: "15mm",
        left: `${MARGIN_LEFT_MM}mm`,
      },
      preferCSSPageSize: false,
    });

    fs.writeFileSync(outputPath, pdfBuffer);
    return { outputPath, signatureGapRect };
  } finally {
    await browser.close();
  }
};

module.exports = generateInvoicePDF;
