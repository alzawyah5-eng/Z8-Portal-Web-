// Proof of payment for a deposit: a photo (handled like ID photos: HEIC
// converted, large photos shrunk) or a PDF up to 6 MB.
import { z8 } from "@/api/z8Client";
import { prepareIdPhoto, readBase64 } from "@/lib/idPhoto";
import { openPrivateFile } from "@/lib/openPrivateFile";

export const MAX_PROOF_BYTES = 6 * 1024 * 1024;

async function isPdf(file) {
  if (file.type === "application/pdf") return true;
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  } catch {
    return false;
  }
}

export async function prepareProof(file) {
  if (await isPdf(file)) {
    if (file.size > MAX_PROOF_BYTES) throw new Error("This PDF is larger than 6 MB. Send a smaller one or a photo of the receipt.");
    return file.type === "application/pdf" ? file : new File([file], file.name || "proof.pdf", { type: "application/pdf" });
  }
  try {
    return await prepareIdPhoto(file);
  } catch (error) {
    throw new Error(String(error.message || "").replace("Use a JPG or PNG photo.", "Add a photo (JPG or PNG) or a PDF."));
  }
}

// Stores the file privately; returns a token bound to the signed-in account.
export async function uploadProof(file) {
  const response = await z8.functions.invoke("photonpayCards", {
    action: "store_deposit_proof",
    payload: { dataBase64: await readBase64(file), fileName: file.name },
  });
  if (response.data?.error || !response.data?.proof_token) throw new Error(response.data?.error || "The proof could not be saved. Please try again.");
  return response.data.proof_token;
}

// Opens a proof through a short-lived link. The tab is opened first so phone
// browsers don't block it as a pop-up.
export async function openProof(entryId) {
  const tab = window.open("", "_blank");
  try {
    const response = await z8.functions.invoke("photonpayCards", { action: "deposit_proof", payload: { entryId } });
    if (response.data?.error || !response.data?.url) throw new Error(response.data?.error || "The proof could not be opened.");
    await openPrivateFile(response.data.url, tab);
  } catch (error) {
    if (tab) tab.close();
    throw error;
  }
}
