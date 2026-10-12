// Matching rules for the hosted version of REWEAR.
// Keep these results consistent with python/wardrobe.py.
export const CATEGORIES = ['top', 'bottom', 'shoes', 'outer'];
export const COLORS = ['black', 'white', 'grey', 'beige', 'brown', 'navy', 'blue', 'green', 'red', 'pink',
  'purple', 'orange'
];
export const STYLES = ['casual', 'streetwear', 'smart'];
export const SEASONS = ['warm', 'cool', 'cold'];
const neutrals = new Set(['black', 'white', 'grey', 'beige', 'brown', 'navy', 'blue']);
export function validateItem(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('Each garment must be an object.');
  for (const [key, max] of [
      ['id', 80],
      ['name', 100]
    ])
    if (typeof x[key] !== 'string' || !x[key].trim() || x[key].length > max) throw Error('Invalid garment ' +
      key + '.');
  if (!CATEGORIES.includes(x.category) || !COLORS.includes(x.color)) throw Error(
    'Choose a supported category and colour.');
  for (const [key, allowed] of [
      ['styles', STYLES],
      ['seasons', SEASONS]
    ])
    if (!Array.isArray(x[key]) || !x[key].length || x[key].length > 3 || x[key].some(v => !allowed.includes(
        v))) throw Error('Choose at least one valid ' + key + ' tag.');
  if (!['slim', 'regular', 'relaxed'].includes(x.fit) || !['plain', 'stripe', 'print'].includes(x.pattern))
    throw Error('Choose a supported fit and pattern.');
  if (typeof x.available !== 'boolean') throw Error('Availability must be true or false.');
  return x;
}
export function validateWardrobe(w) {
  if (!Array.isArray(w) || w.length > 60) throw Error('Use a wardrobe of at most 60 items.');
  w.forEach(validateItem);
  if (new Set(w.map(x => x.id)).size !== w.length) throw Error('Garment IDs must be unique.');
  return w;
}
export function checkOutfit(w, ids, style = 'any', season = 'any') {
  validateWardrobe(w);
  if (![...STYLES, 'any'].includes(style) || ![...SEASONS, 'any'].includes(season)) throw Error(
    'Invalid style or season filter.');
  if (!Array.isArray(ids) || ids.length > 4 || ids.some(x => typeof x !== 'string')) throw Error(
    'Select up to four garment IDs.');
  const lookup = new Map(w.map(x => [x.id, x]));
  if (new Set(ids).size !== ids.length || ids.some(x => !lookup.has(x))) throw Error(
    'Select unique items that exist in the wardrobe.');
  const items = ids.map(x => lookup.get(x)),
    issues = [],
    counts = c => items.filter(x => x.category === c).length;
  for (const c of ['top', 'bottom', 'shoes'])
    if (counts(c) !== 1) issues.push('Choose exactly one ' + c + '.');
  if (counts('outer') > 1) issues.push('Choose at most one outer layer.');
  if (items.some(x => !x.available)) issues.push('An item is marked unavailable.');
  let styles = [...STYLES],
    seasons = [...SEASONS];
  for (const x of items) {
    styles = styles.filter(v => x.styles.includes(v));
    seasons = seasons.filter(v => x.seasons.includes(v));
  }
  if (!styles.length || (style !== 'any' && !styles.includes(style))) issues.push(
    'The pieces need a shared style tag.');
  if (!seasons.length || (season !== 'any' && !seasons.includes(season))) issues.push(
    'The pieces need a shared season tag.');
  if (new Set(items.filter(x => !neutrals.has(x.color)).map(x => x.color)).size > 1) issues.push(
    'This simple rule allows one accent colour at a time.');
  if (items.filter(x => x.pattern !== 'plain').length > 1) issues.push(
    'This simple rule allows one patterned piece at a time.');
  styles.sort();
  seasons.sort();
  return {
    valid: !issues.length,
    issues,
    reasons: issues.length ? [] : ['Shared style: ' + styles.join(', '), 'Shared season: ' + seasons.join(
      ', '), 'One accent colour and one patterned piece at most.'],
    item_ids: ids,
    styles,
    seasons
  };
}
export function enumerateOutfits(w, style = 'any', season = 'any', focusId = null) {
  validateWardrobe(w);
  const focus = focusId === null ? null : w.find(x => x.id === focusId);
  if (focusId !== null && !focus) throw Error('The focus garment does not exist.');
  const groups = ['top', 'bottom', 'shoes'].map(c => w.filter(x => x.category === c && x.available)),
    out = [];
  for (const a of groups[0])
    for (const b of groups[1])
      for (const c of groups[2]) {
        const ids = [a.id, b.id, c.id];
        if (focus?.category === 'outer') ids.push(focus.id);
        if (focus && !ids.includes(focusId)) continue;
        const result = checkOutfit(w, ids, style, season);
        if (result.valid) out.push(result);
      }
  return out;
}
export function buildOutfits(w, style = 'any', season = 'any', focusId = null) {
  checkOutfit(w, [], style, season);
  const results = enumerateOutfits(w, style, season, focusId);
  return {
    total: results.length,
    outfits: results.slice(0, 24),
    missing_categories: ['bottom', 'shoes', 'top'].filter(c => !w.some(x => x.category === c && x.available)),
    note: 'Tag-compatible combinations, not a guarantee of visual fit. Showing up to 24.'
  };
}
export function equivalent(a, b) {
  return ['category', 'color', 'fit', 'pattern'].every(k => a[k] === b[k]) && ['styles', 'seasons'].every(
    k => [...new Set(a[k])].sort().join(',') === [...new Set(b[k])].sort().join(','));
}
export function comparePurchase(w, candidate, style = 'any', season = 'any', price = null, expectedWears =
  null) {
  validateWardrobe(w);
  validateItem(candidate);
  if (w.length >= 60) throw Error('Remove an item before testing a purchase in a full wardrobe.');
  if (w.some(x => x.id === candidate.id)) throw Error('Give the potential purchase a separate ID.');
  if (!candidate.available) throw Error('Mark the potential purchase available to test it.');
  if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000))
    throw Error('Price must be between 0 and 100000 CAD.');
  if (expectedWears !== null && (!Number.isInteger(expectedWears) || expectedWears < 1 || expectedWears >
      10000)) throw Error('Expected wears must be a whole number from 1 to 10000.');
  const result = buildOutfits([...w, candidate], style, season, candidate.id),
    similar = w.filter(x => equivalent(x, candidate)),
    availableSimilar = similar.filter(x => x.available);
  return {
    candidate_id: candidate.id,
    compatible_count: result.total,
    new_tag_combinations: availableSimilar.length ? 0 : result.total,
    similar_items: similar.map(x => x.id),
    outfits: result.outfits,
    missing_categories: result.missing_categories,
    cost_per_wear: price !== null && expectedWears !== null ? Math.round((price / expectedWears + Number
      .EPSILON) * 100) / 100 : null,
    summary: !result.total ? 'No compatible outfits yet' : availableSimilar.length ?
      'You own an available piece with the same tags' : 'Adds tag combinations to explore',
    note: 'Similarity uses category, colour, fit, pattern, style and season tags. Material and cut details are not inferred from photos. Cost per wear uses your estimate.'
  };
}
export function searchWardrobe(w, query = '', category = 'any', availableOnly = false) {
  validateWardrobe(w);
  if (typeof query !== 'string' || query.length > 100 || ![...CATEGORIES, 'any'].includes(category))
  throw Error('Invalid wardrobe search.');
  if (typeof availableOnly !== 'boolean') throw Error('Availability filter must be a boolean.');
  const items = w.filter(x => [x.name, x.color, x.category, ...x.styles].join(' ').toLowerCase().includes(
    query.toLowerCase()) && (category === 'any' || x.category === category) && (!availableOnly || x
    .available));
  return {
    items,
    total: items.length
  };
}
export function callTool(name, a) {
  switch (name) {
    case 'search_wardrobe':
      return searchWardrobe(a.wardrobe, a.query ?? '', a.category ?? 'any', a.available_only ?? false);
    case 'build_outfits':
      return buildOutfits(a.wardrobe, a.style ?? 'any', a.season ?? 'any', a.focus_id ?? null);
    case 'check_outfit':
      return checkOutfit(a.wardrobe, a.item_ids, a.style ?? 'any', a.season ?? 'any');
    case 'compare_purchase':
      return comparePurchase(a.wardrobe, a.candidate, a.style ?? 'any', a.season ?? 'any', a.price ?? null, a
        .expected_wears ?? null);
    default:
      throw Error('Unknown tool');
  }
}
