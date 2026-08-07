// Brand scoping for the whole Ops app.
//
// Every product (Ad Tracker, Influencer Tracker, Collection Tracker) runs
// identically for each brand — only the data is separated. The active brand
// travels on an `X-Brand` header, which the server applies to the root tables
// (batches, creators, sourcing, ct_collections, ct_ideas) and to the budget
// setting. Everything addressed by a globally-unique row id needs no scoping.

export const BRANDS = [
  { key: "cainte", label: "Cainté", color: "#000000" },
  { key: "elle",   label: "Elle",   color: "#B8860B" },
];

const STORAGE_KEY = "ops_brand";
const isValid = (b) => BRANDS.some(x => x.key === b);

let current = (() => {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  return isValid(saved) ? saved : BRANDS[0].key;
})();

export const getBrand = () => current;
export const brandMeta = (key = current) => BRANDS.find(b => b.key === key) || BRANDS[0];

export const setBrand = (key) => {
  if (!isValid(key)) return;
  current = key;
  sessionStorage.setItem(STORAGE_KEY, key);
};

// Drop-in replacement for fetch() on our own /api routes — same signature,
// with the active brand attached.
export const api = (path, opts = {}) =>
  fetch(path, { ...opts, headers: { ...(opts.headers || {}), "X-Brand": current } });
