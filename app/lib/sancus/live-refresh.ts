export const SANCUS_DATA_CHANGED = "sancus:data-changed"

export function signalSancusDataChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SANCUS_DATA_CHANGED))
}
