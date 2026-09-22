import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const toCrc = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, toCrc, crcBuf]);
}

function encodeRGBAtoPNG(rgbaBuf, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = createChunk("IHDR", ihdrData);

  const scanlineLen = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLen);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLen;
    rawData[rowOffset] = 0; // Filter None
    rgbaBuf.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createChunk("IDAT", compressed);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createIco(pngItems) {
  const count = pngItems.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(count, 4); // count

  let offset = 6 + count * 16;
  const entries = [];
  const imageDatas = [];

  for (const item of pngItems) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.data.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    imageDatas.push(item.data);
    offset += item.data.length;
  }

  return Buffer.concat([header, ...entries, ...imageDatas]);
}

// Read logo-fta.png
const logoPath = path.resolve(process.cwd(), "public/logo-fta.png");
const fileBuf = fs.readFileSync(logoPath);
const width = 725, height = 366;

let idatBuffers = [], offset = 8;
while (offset < fileBuf.length) {
  const len = fileBuf.readUInt32BE(offset);
  const type = fileBuf.slice(offset + 4, offset + 8).toString("ascii");
  if (type === "IDAT") idatBuffers.push(fileBuf.slice(offset + 8, offset + 8 + len));
  offset += 8 + len + 4;
}
const decompressed = zlib.inflateSync(Buffer.concat(idatBuffers));
const bpp = 4;
const stride = 1 + width * bpp;
const raw = Buffer.alloc(width * height * 4);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a; if (pb <= pc) return b; return c;
}

for (let y = 0; y < height; y++) {
  const filter = decompressed[y * stride];
  const rowStart = y * stride + 1;
  const outRowStart = y * width * bpp;
  const prevOutRowStart = (y - 1) * width * bpp;
  for (let x = 0; x < width * bpp; x++) {
    const rawByte = decompressed[rowStart + x];
    const a = x >= bpp ? raw[outRowStart + x - bpp] : 0;
    const b = y > 0 ? raw[prevOutRowStart + x] : 0;
    const c = (x >= bpp && y > 0) ? raw[prevOutRowStart + x - bpp] : 0;
    let val = 0;
    if (filter === 0) val = rawByte;
    else if (filter === 1) val = (rawByte + a) & 0xff;
    else if (filter === 2) val = (rawByte + b) & 0xff;
    else if (filter === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
    else if (filter === 4) val = (rawByte + paeth(a, b, c)) & 0xff;
    raw[outRowStart + x] = val;
  }
}

// Bounding box of the FTA letters in public/logo-fta.png
const cropX = 44, cropY = 113, cropW = 577, cropH = 171;

function sampleLogoAlpha(normX, normY) {
  if (normX < 0 || normX >= 1 || normY < 0 || normY >= 1) return 0;
  const srcX = cropX + normX * cropW;
  const srcY = cropY + normY * cropH;
  const x0 = Math.floor(srcX), y0 = Math.floor(srcY);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = srcX - x0, fy = srcY - y0;

  function getAlpha(px, py) {
    const idx = (py * width + px) * 4;
    const b = raw[idx + 2];
    // Anti-aliased logo mask
    return Math.max(0, Math.min(1, (255 - b) / (255 - 31)));
  }

  const a00 = getAlpha(x0, y0);
  const a10 = getAlpha(x1, y0);
  const a01 = getAlpha(x0, y1);
  const a11 = getAlpha(x1, y1);

  return (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy;
}

// Render icon of given size
// cornerRadiusRatio: 0 for apple-touch-icon (solid square) or 0.18 for rounded corners
function renderIcon(size, cornerRadiusRatio = 0.18, logoWidthRatio = 0.85) {
  const out = Buffer.alloc(size * size * 4);
  const r = size * cornerRadiusRatio;
  const orangeR = 245, orangeG = 130, orangeB = 32; // Official FTA orange #F58220

  const targetLogoW = size * logoWidthRatio;
  const targetLogoH = targetLogoW * (cropH / cropW);
  const logoStartX = (size - targetLogoW) / 2;
  const logoStartY = (size - targetLogoH) / 2;

  const ss = size <= 64 ? 4 : (size <= 192 ? 2 : 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let accumR = 0, accumG = 0, accumB = 0, accumA = 0;

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;

          let bgAlpha = 1;
          if (r > 0) {
            let cornerDist = 0;
            let inCorner = false;
            if (px < r && py < r) {
              cornerDist = Math.hypot(px - r, py - r);
              inCorner = true;
            } else if (px > size - r && py < r) {
              cornerDist = Math.hypot(px - (size - r), py - r);
              inCorner = true;
            } else if (px < r && py > size - r) {
              cornerDist = Math.hypot(px - r, py - (size - r));
              inCorner = true;
            } else if (px > size - r && py > size - r) {
              cornerDist = Math.hypot(px - (size - r), py - (size - r));
              inCorner = true;
            }

            if (inCorner) {
              if (cornerDist > r + 0.5) bgAlpha = 0;
              else if (cornerDist > r - 0.5) bgAlpha = 0.5 - (cornerDist - r);
            }
          }

          if (bgAlpha <= 0) continue;

          const normX = (px - logoStartX) / targetLogoW;
          const normY = (py - logoStartY) / targetLogoH;
          const logoAlpha = sampleLogoAlpha(normX, normY);

          // Blend white logo onto FTA orange background
          const curR = orangeR * (1 - logoAlpha) + 255 * logoAlpha;
          const curG = orangeG * (1 - logoAlpha) + 255 * logoAlpha;
          const curB = orangeB * (1 - logoAlpha) + 255 * logoAlpha;

          accumR += curR * bgAlpha;
          accumG += curG * bgAlpha;
          accumB += curB * bgAlpha;
          accumA += bgAlpha;
        }
      }

      const totalSamples = ss * ss;
      const finalA = accumA / totalSamples;
      const idx = (y * size + x) * 4;
      if (finalA > 0.001) {
        out[idx] = Math.round(accumR / accumA);
        out[idx + 1] = Math.round(accumG / accumA);
        out[idx + 2] = Math.round(accumB / accumA);
        out[idx + 3] = Math.round(finalA * 255);
      } else {
        out[idx] = 0; out[idx + 1] = 0; out[idx + 2] = 0; out[idx + 3] = 0;
      }
    }
  }

  return out;
}

const pubDir = path.resolve(process.cwd(), "public");

// 1. favicon-32x32.png
const rgba32 = renderIcon(32, 0.16, 0.86);
const png32 = encodeRGBAtoPNG(rgba32, 32, 32);
fs.writeFileSync(path.join(pubDir, "favicon-32x32.png"), png32);
console.log("Generated favicon-32x32.png:", png32.length, "bytes");

// 2. favicon-192x192.png
const rgba192 = renderIcon(192, 0.18, 0.84);
const png192 = encodeRGBAtoPNG(rgba192, 192, 192);
fs.writeFileSync(path.join(pubDir, "favicon-192x192.png"), png192);
console.log("Generated favicon-192x192.png:", png192.length, "bytes");

// 3. favicon-512x512.png
const rgba512 = renderIcon(512, 0.18, 0.84);
const png512 = encodeRGBAtoPNG(rgba512, 512, 512);
fs.writeFileSync(path.join(pubDir, "favicon-512x512.png"), png512);
console.log("Generated favicon-512x512.png:", png512.length, "bytes");

// 4. apple-touch-icon.png (180x180, solid orange background with no transparent corners for iOS)
const rgba180 = renderIcon(180, 0, 0.84);
const png180 = encodeRGBAtoPNG(rgba180, 180, 180);
fs.writeFileSync(path.join(pubDir, "apple-touch-icon.png"), png180);
console.log("Generated apple-touch-icon.png:", png180.length, "bytes");

// 5. favicon.ico with 16x16, 32x32, 48x48
const rgba16 = renderIcon(16, 0.12, 0.88);
const png16 = encodeRGBAtoPNG(rgba16, 16, 16);
const rgba48 = renderIcon(48, 0.18, 0.85);
const png48 = encodeRGBAtoPNG(rgba48, 48, 48);

const icoBuf = createIco([
  { width: 16, height: 16, data: png16 },
  { width: 32, height: 32, data: png32 },
  { width: 48, height: 48, data: png48 }
]);
fs.writeFileSync(path.join(pubDir, "favicon.ico"), icoBuf);
console.log("Generated favicon.ico:", icoBuf.length, "bytes");
