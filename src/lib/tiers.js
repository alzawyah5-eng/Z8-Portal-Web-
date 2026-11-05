// Z8 card tiers, from the Z8 Card Brand Guidelines (October 2026): one deep
// base colour per card, warm gold for the logo, chip and essential type.
// Which tier a client reaches is decided by the backend from total deposits.

export const GOLD = "#D6B56A";

export const TIERS = {
  emerald: {
    id: "emerald", name: "Emerald", rank: 1, base: "#00583F",
    gradient: "linear-gradient(135deg, #0b7656 0%, #00583F 55%, #003526 100%)",
    swatch: "bg-[#00583F]", text: "text-[#00583F]", soft: "bg-[#00583F]/10",
  },
  plum: {
    id: "plum", name: "Plum", rank: 2, base: "#51082F",
    gradient: "linear-gradient(135deg, #7a1449 0%, #51082F 55%, #2c0419 100%)",
    swatch: "bg-[#51082F]", text: "text-[#51082F]", soft: "bg-[#51082F]/10",
  },
  crimson: {
    id: "crimson", name: "Crimson", rank: 3, base: "#A00918",
    gradient: "linear-gradient(135deg, #c81c2c 0%, #A00918 55%, #620510 100%)",
    swatch: "bg-[#A00918]", text: "text-[#A00918]", soft: "bg-[#A00918]/10",
  },
};

export const TIER_LIST = [TIERS.emerald, TIERS.plum, TIERS.crimson];

export const tierInfo = (id) => TIERS[id] || null;
