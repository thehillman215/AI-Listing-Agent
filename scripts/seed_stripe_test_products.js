// scripts/seed_stripe_test_products.js  (ESM)
// Usage: STRIPE_SECRET_KEY=sk_test_xxx node scripts/seed_stripe_test_products.js
import Stripe from "stripe";
import fs from "node:fs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_xxx", {
  apiVersion: "2024-06-20",
});

const PACKS = [
  { name: "Credits 20", amount: 900, key: "20" },
  { name: "Credits 50", amount: 1900, key: "50" },
  { name: "Credits 200", amount: 5900, key: "200" },
];

async function upsertProduct(name) {
  const search = await stripe.products.search({ query: `name:'${name}'` });
  return search.data[0] ?? (await stripe.products.create({ name }));
}

async function upsertPrice(productId, amount) {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  const found = prices.data.find(
    (p) => p.unit_amount === amount && p.currency === "usd",
  );
  return (
    found ??
    (await stripe.prices.create({
      product: productId,
      unit_amount: amount,
      currency: "usd",
    }))
  );
}

const result = {};
for (const p of PACKS) {
  const product = await upsertProduct(p.name);
  const price = await upsertPrice(product.id, p.amount);
  result[p.key] = price.id;
}
fs.writeFileSync("stripe_prices.json", JSON.stringify(result, null, 2));
console.log("Price IDs written to stripe_prices.json:", result);
