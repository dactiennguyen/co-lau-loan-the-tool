// Choices of the UI kept in localStorage, so they outlive a switch of account and a start of the app: the open tab of
// each account, "Mua xong quay về chỗ cũ". A storage that fails (blocked, full) keeps nothing and breaks nothing: the
// choice then lasts as long as the view.

/** The value kept under `key`, null when none is (or the storage cannot be read). */
export function recalled(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Drops what is kept under `key`; does nothing when the storage refuses. */
export function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Kept.
  }
}

/** Keeps `value` under `key`; does nothing when the storage refuses. */
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not kept.
  }
}

