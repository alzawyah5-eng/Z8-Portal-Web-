// ID photo handling.
//
// Decoding a camera photo in the browser to resize it can allocate hundreds of
// megabytes (an 8000 px JPEG is ~190 MB decoded) and the page is killed mid-way,
// which is what left the screen blank. Most photos already fit PhotonPay's 6 MB
// limit, so they are used exactly as picked and nothing is decoded. Only a photo
// that would be refused is re-encoded once, at a reduced size.

export const MAX_ID_PHOTO_BYTES = 6 * 1024 * 1024;

const MAX_EDGE = 1600;

const ACCEPTED = ["image/jpeg", "image/png"];

function jpegName(name) {
  return String(name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
}

// Some Android galleries and cloud pickers hand over photos with an empty or
// generic type, so the real format is read from the file's first bytes.
async function sniffType(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
    const brand = String.fromCharCode(...head.slice(4, 12));
    if (/^ftyp(heic|heix|mif1|msf1|hevc)/.test(brand)) return "image/heic";
  } catch { /* fall through */ }
  return "";
}

export async function prepareIdPhoto(file) {
  const type = ACCEPTED.includes(file.type) ? file.type : await sniffType(file);
  if (type === "image/heic") {
    // Safari can decode HEIC; convert it to JPEG for PhotonPay.
    try {
      return await shrink(file);
    } catch {
      throw new Error("This photo is in HEIC format. Take a screenshot of it, or set the camera to 'Most Compatible', and try again.");
    }
  }
  if (!ACCEPTED.includes(type)) throw new Error("Use a JPG or PNG photo.");
  const typed = type === file.type ? file : new File([file], file.name || (type === "image/png" ? "photo.png" : "photo.jpg"), { type });
  if (typed.size <= MAX_ID_PHOTO_BYTES) return typed;
  return shrink(typed);
}

async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("This photo could not be opened. Use a smaller JPG or PNG photo."));
      img.src = url;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob = null;
    for (const quality of [0.85, 0.7, 0.55]) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_ID_PHOTO_BYTES) break;
    }
    // Release the decoded pixels before anything else runs.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size > MAX_ID_PHOTO_BYTES) {
      throw new Error("This photo is too large even after resizing. Take a new photo at a lower resolution.");
    }
    return new File([blob], jpegName(file.name), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Base64 is only needed for the PhotonPay upload, so it is produced at send
// time instead of being held in state for every photo.
export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.readAsDataURL(file);
  });
}