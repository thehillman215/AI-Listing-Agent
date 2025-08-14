const keys = ['STRIPE_SECRET_KEY','CREDIT_PRICE_20','CREDIT_PRICE_50','CREDIT_PRICE_200','STRIPE_WEBHOOK_SECRET'];
const out = {};
for (const k of keys) {
  const v = process.env[k] || '';
  out[k] = !!v;
  out[k + '_prefix'] = v ? v.slice(0,12) : '';
}
console.log(out);
