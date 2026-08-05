import heic2any from "heic2any";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export function isHeic(src: string): boolean {
  if (!src) return false;
  return src.startsWith("data:image/heic") || src.startsWith("data:image/heif");
}

export function isJpegPngWebp(src: string): boolean {
  if (!src) return false;
  return src.startsWith("data:image/jpeg") || src.startsWith("data:image/png") || src.startsWith("data:image/webp");
}

export async function convertHeicBase64ToJpeg(dataUrl: string): Promise<string> {
  if (!isHeic(dataUrl)) {
    return dataUrl;
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return dataUrl;
  }

  const base64Data = dataUrl.substring(commaIndex + 1);
  const mimeTypeMatch = dataUrl.match(/data:(image\/heic|image\/heif)/i);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/heic";

  const blob = base64ToBlob(base64Data, mimeType);
  const convertedBlob = await heic2any({
    blob: blob,
    toType: "image/jpeg",
    quality: 0.8,
  });

  const blobToConvert = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blobToConvert);
  });
}

export async function convertHeicFileToJpegDataUrl(file: File): Promise<string> {
  const convertedBlob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.8,
  });

  const blobToConvert = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blobToConvert);
  });
}
