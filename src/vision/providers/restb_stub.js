import { ROOM_TYPES, FEATURE_KEYS } from "../taxonomy.js";
const hintMap = {
  kitchen: { room: "kitchen" }, bed: { room: "primary_bed" }, bath: { room: "bath" },
  living: { room: "living" }, dining: { room: "dining" }, exterior: { room: "exterior_front" },
  pool: { feature: "pool" }, fireplace: { feature: "fireplace" }, island: { feature: "island" },
  quartz: { feature: "countertops_quartz" }, granite: { feature: "countertops_granite" },
  stainless: { feature: "appliances_stainless" }, hardwood: { feature: "flooring_hardwood" },
  tile: { feature: "flooring_tile" }
};
export async function analyzeStub(files) {
  const rooms = [], features = []; let people = false, text = false;
  files.forEach((f, idx) => {
    const name = (f.originalname || "").toLowerCase();
    for (const k of Object.keys(hintMap)) {
      if (name.includes(k)) {
        const h = hintMap[k];
        if (h.room && ROOM_TYPES.includes(h.room)) rooms.push({ imageIdx: idx, type: h.room, conf: 0.9 });
        if (h.feature && FEATURE_KEYS.includes(h.feature)) features.push({ key: h.feature, conf: 0.85, imageIdx: idx });
      }
    }
    if (name.includes("people") || name.includes("face")) people = true;
    if (name.includes("watermark") || name.includes("logo") || name.includes("text")) text = true;
  });
  return { rooms, features, compliance: { people, text }, raw: { source: "stub" } };
}
