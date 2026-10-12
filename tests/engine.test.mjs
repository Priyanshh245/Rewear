import {
  test
} from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync
} from 'node:fs';
import {
  spawnSync
} from 'node:child_process';
import {
  buildOutfits,
  checkOutfit,
  comparePurchase,
  callTool
} from '../src/engine.js';
const base = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const clone = () => structuredClone(base);
test('rules produce complete real combinations and respect filters', () => {
  assert.equal(buildOutfits(clone()).total, 8);
  assert.equal(buildOutfits(clone(), 'smart').total, 1);
  assert.equal(buildOutfits(clone(), 'streetwear').total, 0);
  for (const result of buildOutfits(clone()).outfits) {
    assert.equal(result.item_ids.length, 3);
    assert(checkOutfit(clone(), result.item_ids).valid);
  }
  const w = clone();
  w[0].available = false;
  assert.equal(buildOutfits(w).total, 4);
  assert(!checkOutfit(w, ['t1', 'b1', 's1']).valid);
});
test('same tags do not imply new combinations; unavailable substitutes differ', () => {
  const w = clone(),
    candidate = {
      ...w[0],
      id: 'new',
      styles: [...w[0].styles].reverse()
    };
  const result = comparePurchase(w, candidate, 'any', 'any', 85, 25);
  assert.equal(result.compatible_count, 4);
  assert.equal(result.new_tag_combinations, 0);
  assert.equal(result.cost_per_wear, 3.4);
  w[0].available = false;
  assert.equal(comparePurchase(w, candidate).new_tag_combinations, 4);
  assert.equal(comparePurchase(w, candidate, 'any', 'any', 267.5, 100).cost_per_wear, 2.68);
});
test('strict IDs and numeric limits; no invented garments', () => {
  assert.throws(() => checkOutfit(clone(), ['unknown']));
  assert.throws(() => buildOutfits([], 'bogus'));
  assert.throws(() => comparePurchase(clone(), base[0]));
  const c = {
    ...base[0],
    id: 'new'
  };
  assert.throws(() => comparePurchase(clone(), c, 'any', 'any', NaN));
  assert.throws(() => comparePurchase(clone(), c, 'any', 'any', 1, 0));
  assert.throws(() => comparePurchase(clone(), c, 'any', 'any', 1, true));
  const jacket = {
    ...c,
    category: 'outer',
    color: 'green',
    styles: ['casual']
  };
  const result = comparePurchase(clone(), jacket);
  assert.equal(result.compatible_count, 4);
  for (const outfit of result.outfits) assert(outfit.item_ids.includes('new'));
});
test('Python and hosted engine agree across wardrobe changes and edge cases', () => {
  const cases = [];
  for (const style of ['any', 'casual', 'smart', 'streetwear'])
    for (const season of ['any', 'warm', 'cold']) cases.push({
      name: 'build_outfits',
      arguments: {
        wardrobe: clone(),
        style,
        season
      }
    });
  for (const category of ['top', 'bottom', 'shoes', 'outer'])
    for (const color of ['white', 'green', 'red']) cases.push({
      name: 'compare_purchase',
      arguments: {
        wardrobe: clone(),
        candidate: {
          ...base[0],
          id: 'new',
          category,
          color
        },
        price: 85,
        expected_wears: 25
      }
    });
  for (const index of [0, 2, 4]) {
    const w = clone();
    w[index].available = false;
    cases.push({
      name: 'build_outfits',
      arguments: {
        wardrobe: w
      }
    });
  }
  const pattern = clone();
  pattern[0].pattern = 'stripe';
  pattern[2].pattern = 'print';
  cases.push({
    name: 'build_outfits',
    arguments: {
      wardrobe: pattern
    }
  });
  cases.push({
    name: 'search_wardrobe',
    arguments: {
      wardrobe: clone(),
      query: 'white'
    }
  });
  cases.push({
    name: 'check_outfit',
    arguments: {
      wardrobe: clone(),
      item_ids: ['t1', 'b1', 's1']
    }
  });
  const code =
    `import sys,json;sys.path.insert(0,'python');import wardrobe as r\ncases=json.load(sys.stdin);out=[]\nfor case in cases:\n out.append(getattr(r,case['name'])(**case['arguments']))\njson.dump(out,sys.stdout)`;
  const result = spawnSync('python3', ['-c', code], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify(cases),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const expected = JSON.parse(result.stdout);
  cases.forEach((c, i) => assert.deepEqual(callTool(c.name, c.arguments), expected[i], JSON.stringify(
  c)));
});
