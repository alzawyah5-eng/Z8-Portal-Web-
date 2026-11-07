import { firebaseAuth } from "@/api/firebase";

// Private file URLs are short-lived, but also require an authenticated admin
// bearer token. Open a tab synchronously to satisfy popup blockers, then fetch
// the bytes with the current Firebase ID token.
export async function openPrivateFile(url, tab = null) {
  const target = tab || window.open("about:blank", "_blank");
  try {
    const user = firebaseAuth?.currentUser;
    if (!user) throw new Error("Sign in as an administrator to view this file.");
    const token = await user.getIdToken();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Your administrator session is required to view this file. Sign in again and retry.");
      }
      throw new Error("The private file could not be opened. Please try again.");
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    if (target) {
      target.opener = null;
      target.location.href = objectUrl;
    } else {
      window.location.assign(objectUrl);
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10 * 60 * 1000);
  } catch (error) {
    target?.close();
    throw error;
  }
}
