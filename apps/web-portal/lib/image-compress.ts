export const MAX_IMAGE_DIMENSION = 1280;
export const IMAGE_QUALITY = 0.8;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

function scaledSize(width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Draws any image-like source onto a white canvas (JPEG has no alpha) and exports a 1280px max JPEG data URL.
export function compressCanvasSource(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): string {
  const { width, height } = scaledSize(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image.")); };
    image.src = url;
  });
}

// Compresses a gallery / native-camera File to a 1280px JPEG data URL. Falls back to the raw data URL if decoding fails.
export async function compressImageFile(file: File): Promise<string> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      try { return compressCanvasSource(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close?.(); }
    }
    const image = await loadImage(file);
    return compressCanvasSource(image, image.naturalWidth, image.naturalHeight);
  } catch {
    try {
      const image = await loadImage(file);
      return compressCanvasSource(image, image.naturalWidth, image.naturalHeight);
    } catch {
      return readAsDataUrl(file);
    }
  }
}
