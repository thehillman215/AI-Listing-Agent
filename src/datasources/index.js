// Abstraction layer so we can plug in MLS later without changing app code.
// Current implementation: manual/no-op enrichment. Later: add MLS provider or Places API.

export async function getPropertyContext(input) {
  const { property = {} } = input || {};
  const ctx = {
    normalized: {
      city: guessCityFromAddress(property.address),
      state: guessStateFromAddress(property.address),
    },
    mls: null,
    poi: []
  };
  return ctx;
}

function guessCityFromAddress(addr) {
  if (!addr) return null;
  const parts = addr.split(",").map(s => s.trim());
  return parts.length >= 2 ? parts[1] : null;
}
function guessStateFromAddress(addr) {
  if (!addr) return null;
  const parts = addr.split(",").map(s => s.trim());
  if (parts.length >= 3) {
    const stateZip = parts[2].split(" ").map(s => s.trim()).filter(Boolean);
    return stateZip[0] || null;
  }
  return null;
}
