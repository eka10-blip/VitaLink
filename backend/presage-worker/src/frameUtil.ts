/** Downsample RGB24 to reduce SmartSpectra CPU/memory on cloud hosts. */
export function downsampleRgb24(
  src: Uint8Array,
  width: number,
  height: number,
  maxWidth = 640,
): { data: Buffer; width: number; height: number } {
  if (width <= maxWidth) {
    return {
      data: Buffer.isBuffer(src) ? src : Buffer.from(src),
      width,
      height,
    };
  }
  const scale = maxWidth / width;
  const nw = maxWidth;
  const nh = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(nw * nh * 3);
  for (let y = 0; y < nh; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < nw; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 3;
      const di = (y * nw + x) * 3;
      out[di] = src[si] ?? 0;
      out[di + 1] = src[si + 1] ?? 0;
      out[di + 2] = src[si + 2] ?? 0;
    }
  }
  return { data: out, width: nw, height: nh };
}
