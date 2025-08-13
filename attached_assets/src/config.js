export const CREDIT_PACKS = {
  starter: { price: process.env.CREDIT_PRICE_20,  credits: 20,  label: "Starter (20 credits)" },
  pro:     { price: process.env.CREDIT_PRICE_50,  credits: 50,  label: "Pro (50 credits)" },
  team:    { price: process.env.CREDIT_PRICE_200, credits: 200, label: "Team (200 credits)" }
};

export const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/?success=true";
export const CANCEL_URL  = process.env.STRIPE_CANCEL_URL  || "http://localhost:3000/?canceled=true";
