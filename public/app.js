// REWEAR frontend. Project owner: Priyansh Panwar.
// This file handles the wardrobe, outfit canvas, browser storage and MCP calls.
'use strict';
const $ = selector => document.querySelector(selector);
const categories = ['top', 'bottom', 'shoes', 'outer'];
const colors = {
  black: '#30312f',
  white: '#eceee6',
  grey: '#9d9f98',
  beige: '#ccba98',
  brown: '#89644c',
  navy: '#374553',
  blue: '#7b98aa',
  green: '#76896d',
  red: '#b95c4b',
  pink: '#d29a9e',
  purple: '#9a82ad',
  orange: '#cd8b52'
};
const styles = ['casual', 'streetwear', 'smart'];
const seasons = ['warm', 'cool', 'cold'];
const labels = {
  top: 'Tops',
  bottom: 'Bottoms',
  shoes: 'Shoes',
  outer: 'Outer layers'
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [c]));
const uid = () => crypto.randomUUID();
const blankState = () => ({
  version: 1,
  wardrobe: [],
  looks: [],
  wears: [],
  demo: false
});
let state = blankState(),
  db, page = 'wardrobe',
  filter = 'any',
  editId = null;
let selection = {},
  suggestions = [],
  purchase = null,
  purchaseResult = null;
let toastTimer, requestId = 0,
  initialized = false;
const images = {
  item: null,
  purchase: null
};

function silhouette(item) {
  const fill = colors[item.color] || colors.beige;
  const paths = {
    top: 'M47 24 L66 18 Q80 36 94 18 L113 24 L139 49 L120 72 L108 62 L108 140 L52 140 L52 62 L40 72 L21 49 Z',
    bottom: 'M49 20 L111 20 L118 146 L90 146 L80 67 L70 146 L42 146 Z',
    shoes: 'M20 89 L44 61 L59 67 L73 91 L123 111 Q141 115 138 134 L20 134 Q12 110 20 89 Z',
    outer: 'M47 24 L66 18 L80 36 L94 18 L113 24 L132 51 L148 120 L126 128 L108 66 L108 143 L52 143 L52 66 L34 128 L12 120 L28 51 Z'
  };
  let detail = item.category === 'bottom' ? '<path d="M49 33H111 M80 22V64"/>' : item.category === 'outer' ?
    '<path d="M80 36V143 M60 92H72 M88 92H100"/>' : item.category === 'shoes' ?
    '<path d="M20 121H137 M51 78L66 75 M58 88L73 85 M67 98L82 95"/>' : '<path d="M66 20Q80 42 94 20"/>';
  if (item.pattern === 'stripe') detail += '<path d="M53 85H107 M53 97H107 M53 109H107"/>';
  if (item.pattern === 'print') detail += '<circle cx="79" cy="85" r="12"/>';
  return `<svg viewBox="0 0 160 165" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${paths[item.category]}" fill="${fill}" stroke="#283c3445" stroke-width="1.5" stroke-linejoin="round"/><g fill="none" stroke="#283c3455" stroke-width="1.5">${detail}</g></svg>`;
}

function visual(item) {
  return item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">` :
    silhouette(item);
}

function metadata(item) {
  const {
    id,
    name,
    category,
    color,
    fit,
    pattern,
    styles,
    seasons,
    available
  } = item;
  return {
    id,
    name,
    category,
    color,
    fit,
    pattern,
    styles,
    seasons,
    available
  };
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5000);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rewear-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Browser storage is unavailable. Enable storage and reload.'));
  });
}

function readState() {
  return new Promise((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get('collection');
    request.onsuccess = () => resolve(request.result || blankState());
    request.onerror = () => reject(request.error);
  });
}
async function saveState(next) {
  await new Promise((resolve, reject) => {
    if (!db) return reject(Error('Browser storage is unavailable. Reload before making changes.'));
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(next, 'collection');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(Error('Could not save. Export a backup and check browser storage.'));
    tx.onabort = () => reject(Error('Could not save. Check browser storage.'));
  });
  state = next;
}
async function rawRpc(method, params) {
  const response = await fetch('/mcp/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method,
      params
    })
  });
  if (!response.ok) throw Error(response.status === 401 ? 'Sign in to use the matching server.' :
    'Matching server unavailable. Your wardrobe is still saved.');
  const result = await response.json();
  if (result.error) throw Error(result.error.message);
  return result.result;
}
async function rpc(name, args) {
  if (!initialized) {
    await rawRpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'REWEAR frontend',
        version: '1.0.0'
      }
    });
    initialized = true;
  }
  const result = await rawRpc('tools/call', {
    name,
    arguments: args
  });
  if (result.isError) throw Error(result.content?.[0]?.text || 'Could not complete matching.');
  return result.structuredContent || JSON.parse(result.content[0].text);
}
async function busy(button, task) {
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await task();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

function confirmAction(title, copy) {
  $('#confirm-title').textContent = title;
  $('#confirm-copy').textContent = copy;
  const dialog = $('#confirm-dialog');
  dialog.showModal();
  return new Promise(resolve => {
    const finish = answer => {
      dialog.close();
      dialog.oncancel = null;
      $('#confirm-ok').onclick = null;
      $('#confirm-cancel').onclick = null;
      resolve(answer);
    };
    $('#confirm-ok').onclick = () => finish(true);
    $('#confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => {
      event.preventDefault();
      finish(false);
    };
  });
}

function options(values, selected, anyLabel) {
  return (anyLabel ? `<option value="any">${anyLabel}</option>` : '') + values.map(v =>
    `<option value="${v}" ${selected === v?'selected':''}>${escapeHtml(labels[v] || v[0].toUpperCase()+v.slice(1))}</option>`
    ).join('');
}

function fieldMarkup(prefix, item = {}) {
  return `<div class="item-fields"><label>Piece name<input name="name" required maxlength="100" value="${escapeHtml(item.name || '')}" placeholder="Black relaxed jeans"></label><div class="form-row"><label>Category<select name="category">${options(categories,item.category||'top')}</select></label><label>Colour<select name="color">${options(Object.keys(colors),item.color||'black')}</select></label></div><div class="form-row"><label>Fit<select name="fit">${options(['slim','regular','relaxed'],item.fit||'regular')}</select></label><label>Pattern<select name="pattern">${options(['plain','stripe','print'],item.pattern||'plain')}</select></label></div>${tagFields('styles',styles,item.styles||['casual'])}${tagFields('seasons',seasons,item.seasons||seasons)}<div class="upload"><div id="${prefix}-preview" class="upload-preview">${silhouette({category:item.category||'top',color:item.color||'black',pattern:item.pattern||'plain'})}</div><label>Photo (optional)<input type="file" id="${prefix}-photo" accept="image/jpeg,image/png,image/webp"><span class="fine">JPEG, PNG or WebP · up to 12 MB</span><button type="button" class="text-button" data-remove-photo="${prefix}">Remove photo</button></label></div>${prefix==='item'?`<label class="availability"><input type="checkbox" name="available" style="width:auto;accent-color:var(--ink)" ${item.available!==false?'checked':''}> Available to wear</label>`:''}</div>`;
}

function tagFields(name, values, selected) {
  return `<fieldset class="tag-fields"><legend>${name==='styles'?'Style':'Season'} tags · choose at least one</legend><div class="tag-options">${values.map(v=>`<label><input type="checkbox" name="${name}" value="${v}" ${selected.includes(v)?'checked':''}>${v}</label>`).join('')}</div></fieldset>`;
}

function readItem(form, id, prefix) {
  const data = new FormData(form),
    chosenStyles = data.getAll('styles'),
    chosenSeasons = data.getAll('seasons');
  if (!chosenStyles.length || !chosenSeasons.length) throw Error('Choose at least one style and season tag.');
  const name = String(data.get('name')).trim();
  if (!name) throw Error('Give this piece a name.');
  return {
    id,
    name,
    category: data.get('category'),
    color: data.get('color'),
    fit: data.get('fit'),
    pattern: data.get('pattern'),
    styles: chosenStyles,
    seasons: chosenSeasons,
    available: prefix === 'purchase' || data.has('available'),
    image: images[prefix]
  };
}

function initPhoto(prefix, item = {}) {
  images[prefix] = item.image || null;
  if (images[prefix]) $(`#${prefix}-preview`).innerHTML = visual(item);
  $(`#${prefix}-photo`).onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024)
        throw Error('Use a JPEG, PNG or WebP photo smaller than 12 MB.');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#d7cdbf';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let quality = .82,
        image = canvas.toDataURL('image/jpeg', quality);
      while (image.length > 240000 && quality > .22) {
        quality -= .1;
        image = canvas.toDataURL('image/jpeg', quality);
      }
      if (image.length > 240000) throw Error(
        'This photo could not be made small enough. Try a simpler crop.');
      images[prefix] = image;
      $(`#${prefix}-preview`).innerHTML = `<img src="${image}" alt="Photo preview">`;
    } catch (error) {
      toast(error.message);
      event.target.value = '';
    }
  };
}

function renderWardrobe() {
  $('#metric-pieces').textContent = state.wardrobe.length;
  $('#metric-looks').textContent = state.looks.length;
  $('#metric-wears').textContent = state.wears.length;
  $('#demo-banner').hidden = !state.demo;
  $('#wardrobe-filters').innerHTML = ['any', ...categories].map(c =>
    `<button class="chip ${filter===c?'active':''}" data-filter="${c}">${c==='any'?'All pieces':labels[c]}</button>`
    ).join('');
  const query = $('#search').value.toLowerCase();
  const items = state.wardrobe.filter(x => (filter === 'any' || x.category === filter) && [x.name, x.color,
    ...x.styles
  ].join(' ').toLowerCase().includes(query));
  $('#wardrobe-grid').innerHTML = items.length ? items.map(x => garmentCard(x)).join('') : state.wardrobe
    .length ? '<div class="empty"><h2>No pieces match.</h2><p>Try a different filter or search.</p></div>' :
    `<div class="empty"><h2>Your wardrobe starts here.</h2><p>Add a top, bottoms and shoes to find your first combinations.<br>Or explore a sample collection to see how REWEAR works.</p><div class="empty-actions"><button class="primary" data-action="add">＋ Add my first piece</button><button class="secondary" data-action="demo">Explore sample wardrobe ↗</button></div></div>`;
}

function garmentCard(item, pick = false) {
  const body =
    `<div class="garment-visual">${visual(item)}${!item.available?'<span class="unavailable">Unavailable</span>':''}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.color)} / ${escapeHtml(item.fit)}<br>${escapeHtml(item.styles.join(' · '))}</p>`;
  return `<article class="garment-card" ${pick&&item.available?`draggable="true" data-drag="${escapeHtml(item.id)}"`:''}>${pick?`<button data-pick="${escapeHtml(item.id)}" class="${Object.values(selection).includes(item.id)?'selected':''}" ${!item.available?'disabled':''}>${body}</button>`:body+`<div class="garment-actions"><button data-edit="${escapeHtml(item.id)}">Edit</button><button data-delete="${escapeHtml(item.id)}">Remove</button></div>`}</article>`;
}

function renderStudio() {
  $('#canvas').innerHTML = categories.map(c => {
    const item = state.wardrobe.find(x => x.id === selection[c]);
    return `<div class="slot" data-slot="${c}"><span class="slot-label">${escapeHtml(labels[c].toUpperCase())}${c==='outer'?' / OPTIONAL':''}</span>${item?`<button data-remove-slot="${c}" aria-label="Remove ${escapeHtml(item.name)}">×</button><div class="visual">${visual(item)}</div><strong>${escapeHtml(item.name)}</strong>`:'<span class="slot-empty">＋</span><strong>Drop or select a piece</strong>'}</div>`;
  }).join('');
  $('#studio-grid').innerHTML = state.wardrobe.length ? state.wardrobe.map(x => garmentCard(x, true)).join(
    '') :
    '<div class="empty"><h2>Add your first pieces.</h2><p>Your canvas uses clothes from your wardrobe.</p><button class="primary" data-action="add">Add a piece</button></div>';
  $('#outfit-check').className = 'check-note';
  $('#outfit-check').textContent = 'Save or find combinations to check the matching rules.';
}

function lookMarkup(result, lookup, index, mode) {
  const items = result.item_ids.map(id => lookup.find(x => x.id === id)).filter(Boolean);
  return `<article class="look-card"><div class="look-pieces">${items.map(x=>`<div class="mini-piece">${visual(x)}</div>`).join('')}</div><h3>${escapeHtml(result.name || 'Combination '+(index+1))}</h3><p>${items.map(x=>escapeHtml(x.name)).join(' + ')}</p>${result.reasons?`<p>${escapeHtml(result.reasons[0] || '')}</p>`:''}${mode==='suggest'?`<button class="secondary" data-use-look="${index}">Try on canvas ↗</button>`:mode==='saved'?`<p>${state.wears.filter(x=>x.look_id===result.id).length} wears logged</p><div class="look-actions"><button class="primary" data-wear="${escapeHtml(result.id)}">Wore this today</button><button class="secondary" data-load-look="${escapeHtml(result.id)}">Edit on canvas</button><button class="text-button" data-remove-look="${escapeHtml(result.id)}">Remove</button></div>`:''}</article>`;
}

function renderSaved() {
  $('#saved-grid').innerHTML = state.looks.length ? state.looks.map((x, i) => lookMarkup(x, state.wardrobe, i,
      'saved')).join('') :
    '<div class="empty"><h2>Find your first favourite.</h2><p>Build a combination in the studio, then save it here.</p><button class="primary" data-page="studio">Open outfit studio ↗</button></div>';
  $('#wear-journal').innerHTML = state.wears.length ? [...state.wears].reverse().map(x =>
    `<div class="journal-row"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.date)}</span></div>`
    ).join('') : '<p class="muted">Your actual wears will appear here.</p>';
  $('#undo-wear').hidden = !state.wears.length;
}

function setPage(next) {
  if (!['wardrobe', 'studio', 'compare', 'saved'].includes(next)) return;
  page = next;
  document.querySelectorAll('.page').forEach(x => x.hidden = x.id !== 'page-' + next);
  document.querySelectorAll('.sidebar [data-page]').forEach(x => x.classList.toggle('active', x.dataset
    .page === next));
  $('#breadcrumb').textContent = {
    wardrobe: 'YOUR PERSONAL WARDROBE',
    studio: 'THE OUTFIT STUDIO',
    compare: 'BEFORE YOU BUY',
    saved: 'YOUR SAVED COMBINATIONS'
  } [next];
  if (next === 'wardrobe') renderWardrobe();
  if (next === 'studio') renderStudio();
  if (next === 'saved') renderSaved();
  if (location.hash.slice(1) !== next) history.replaceState(null, '', '#' + next);
}

function refresh() {
  renderWardrobe();
  if (page === 'studio') renderStudio();
  if (page === 'saved') renderSaved();
}

function openEditor(id = null) {
  if (!id && state.wardrobe.length >= 60) return toast(
    'Your wardrobe supports 60 pieces. Remove one before adding another.');
  editId = id;
  const item = state.wardrobe.find(x => x.id === id) || {};
  $('#item-title').textContent = id ? 'Edit piece' : 'Add a piece';
  $('#item-fields').innerHTML = fieldMarkup('item', item);
  initPhoto('item', item);
  $('#item-dialog').showModal();
}
async function addDemo() {
  if (state.wardrobe.length) return;
  const specs = [
    ['White everyday tee', 'top', 'white', ['casual', 'streetwear'], 'regular'],
    ['Black oversized tee', 'top', 'black', ['casual', 'streetwear'], 'relaxed'],
    ['Navy shirt', 'top', 'navy', ['casual', 'smart'], 'regular'],
    ['Blue relaxed jeans', 'bottom', 'blue', ['casual', 'streetwear'], 'relaxed'],
    ['Black trousers', 'bottom', 'black', ['casual', 'smart'], 'regular'],
    ['Beige chinos', 'bottom', 'beige', ['casual', 'smart'], 'regular'],
    ['White sneakers', 'shoes', 'white', ['casual', 'streetwear'], 'regular'],
    ['Brown loafers', 'shoes', 'brown', ['casual', 'smart'], 'regular'],
    ['Green overshirt', 'outer', 'green', ['casual', 'streetwear'], 'relaxed']
  ];
  await saveState({
    ...blankState(),
    demo: true,
    wardrobe: specs.map(([name, category, color, tags, fit]) => ({
      id: uid(),
      name,
      category,
      color,
      styles: tags,
      seasons: [...seasons],
      fit,
      pattern: 'plain',
      available: true,
      image: null
    }))
  });
  refresh();
  toast('Sample wardrobe added. These are demonstration pieces.');
}

function validateBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.wardrobe) || data.wardrobe.length > 60 || !Array
    .isArray(data.looks) || data.looks.length > 300 || !Array.isArray(data.wears) || data.wears.length > 5000)
    throw Error('This is not a supported REWEAR backup.');
  const wardrobe = data.wardrobe.map(x => {
    if (!x || typeof x.id !== 'string' || !x.id || x.id.length > 80 || typeof x.name !== 'string' || !x
      .name.trim() || x.name.length > 100 || !categories.includes(x.category) || !Object.keys(colors)
      .includes(x.color) || !['slim', 'regular', 'relaxed'].includes(x.fit) || !['plain', 'stripe',
        'print'
      ].includes(x.pattern) || typeof x.available !== 'boolean') throw Error(
      'A backup garment has invalid fields.');
    for (const [key, allowed] of [
        ['styles', styles],
        ['seasons', seasons]
      ])
      if (!Array.isArray(x[key]) || !x[key].length || x[key].length > 3 || x[key].some(v => !allowed
          .includes(v))) throw Error('A backup garment has invalid tags.');
    if (x.image && (typeof x.image !== 'string' || x.image.length > 240000 || !
        /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x.image))) throw Error(
      'A backup photo has an unsupported format.');
    return {
      ...metadata(x),
      image: x.image || null
    };
  });
  if (new Set(wardrobe.map(x => x.id)).size !== wardrobe.length) throw Error(
    'Duplicate garment IDs in backup.');
  const looks = data.looks.map(x => {
    if (!x || typeof x.id !== 'string' || !x.id || x.id.length > 80 || typeof x.name !== 'string' || !x
      .name.trim() || x.name.length > 80 || !Array.isArray(x.item_ids) || x.item_ids.length < 3 || x
      .item_ids.length > 4 || new Set(x.item_ids).size !== x.item_ids.length || x.item_ids.some(id => !
        wardrobe.some(y => y.id === id))) throw Error('An outfit in this backup is invalid.');
    const cats = x.item_ids.map(id => wardrobe.find(y => y.id === id).category);
    if (!['top', 'bottom', 'shoes'].every(c => cats.filter(x => x === c).length === 1) || cats.filter(x =>
        x === 'outer').length > 1) throw Error('An outfit is missing a required garment.');
    return {
      id: x.id,
      name: x.name,
      item_ids: x.item_ids
    };
  });
  if (new Set(looks.map(x => x.id)).size !== looks.length) throw Error('Duplicate outfit IDs in backup.');
  const wears = data.wears.map(x => {
    if (!x || typeof x.id !== 'string' || !x.id || x.id.length > 80 || typeof x.look_id !== 'string' || x
      .look_id.length > 80 || typeof x.name !== 'string' || x.name.length > 80 || typeof x.date !==
      'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !Number.isFinite(Date.parse(x.date)))
    throw Error('A wear log in this backup is invalid.');
    return {
      id: x.id,
      look_id: x.look_id,
      name: x.name,
      date: x.date
    };
  });
  return {
    version: 1,
    wardrobe,
    looks,
    wears,
    demo: data.demo === true
  };
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button,[data-page]');
  if (!target) return;
  try {
    if (target.dataset.page) setPage(target.dataset.page);
    if (target.dataset.close) $('#' + target.dataset.close).close();
    if (target.dataset.action === 'add') openEditor();
    if (target.dataset.action === 'demo') await busy(target, addDemo);
    if (target.dataset.filter) {
      filter = target.dataset.filter;
      renderWardrobe();
    }
    if (target.dataset.edit) openEditor(target.dataset.edit);
    if (target.dataset.delete) {
      const item = state.wardrobe.find(x => x.id === target.dataset.delete),
        linked = state.looks.filter(x => x.item_ids.includes(item.id));
      if (await confirmAction('Remove this piece?',
          `Remove ${item.name}${linked.length?' and '+linked.length+' saved outfit(s) that use it':''}? Your past wear journal will remain.`
          )) {
        await saveState({
          ...state,
          wardrobe: state.wardrobe.filter(x => x.id !== item.id),
          looks: state.looks.filter(x => !x.item_ids.includes(item.id))
        });
        selection = {};
        suggestions = [];
        $('#suggestions').innerHTML = '';
        purchaseResult = null;
        resetResults();
        refresh();
        toast('Piece removed.');
      }
    }
    if (target.dataset.pick) {
      const item = state.wardrobe.find(x => x.id === target.dataset.pick);
      if (item?.available) {
        selection[item.category] = item.id;
        renderStudio();
      }
    }
    if (target.dataset.removeSlot) {
      delete selection[target.dataset.removeSlot];
      renderStudio();
    }
    if (target.dataset.useLook !== undefined) {
      selection = {};
      suggestions[Number(target.dataset.useLook)].item_ids.forEach(id => {
        const x = state.wardrobe.find(y => y.id === id);
        if (x) selection[x.category] = id;
      });
      renderStudio();
      $('#canvas').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
    if (target.dataset.loadLook) {
      const look = state.looks.find(x => x.id === target.dataset.loadLook);
      selection = {};
      look.item_ids.forEach(id => {
        const x = state.wardrobe.find(y => y.id === id);
        selection[x.category] = id;
      });
      $('#outfit-name').value = look.name;
      setPage('studio');
    }
    if (target.dataset.wear) {
      const look = state.looks.find(x => x.id === target.dataset.wear);
      if (state.wears.length >= 5000) throw Error('Wear journal is full. Export a backup.');
      const today = new Date().toLocaleDateString('en-CA');
      if (state.wears.some(x => x.look_id === look.id && x.date === today)) return toast(
        'Already logged this outfit today.');
      await saveState({
        ...state,
        wears: [...state.wears, {
          id: uid(),
          look_id: look.id,
          name: look.name,
          date: today
        }]
      });
      refresh();
      toast('Wear logged.');
    }
    if (target.dataset.removeLook && await confirmAction('Remove saved outfit?',
        'Its past wear journal entries will remain.')) {
      await saveState({
        ...state,
        looks: state.looks.filter(x => x.id !== target.dataset.removeLook)
      });
      refresh();
    }
    if (target.dataset.removePhoto) {
      const p = target.dataset.removePhoto;
      images[p] = null;
      $(`#${p}-photo`).value = '';
      $(`#${p}-preview`).innerHTML = silhouette({
        category: 'top',
        color: 'beige',
        pattern: 'plain'
      });
    }
    if (target.id === 'add-purchase') {
      if (!purchase || state.wardrobe.some(x => x.id === purchase.id)) return;
      if (state.wardrobe.length >= 60) throw Error('Wardrobe is full.');
      await saveState({
        ...state,
        wardrobe: [...state.wardrobe, purchase]
      });
      target.disabled = true;
      target.textContent = 'Added to wardrobe';
      refresh();
      toast('Added as an owned piece.');
    }
  } catch (error) {
    toast(error.message);
  }
});
$('#hero-add').onclick = () => openEditor();
$('#add-item').onclick = () => openEditor();
$('#how').onclick = () => $('#info-dialog').showModal();
$('#search').oninput = renderWardrobe;
$('#reset-outfit').onclick = () => {
  selection = {};
  $('#outfit-name').value = '';
  renderStudio();
};
$('#clear-demo').onclick = async () => {
  try {
    if (await confirmAction('Start your wardrobe?',
        'This clears the current collection, saved outfits and wear log. Export a backup first if you have added your own data.'
        )) {
      await saveState(blankState());
      selection = {};
      suggestions = [];
      $('#suggestions').innerHTML = '';
      resetResults();
      refresh();
      toast('Ready for your own clothes.');
    }
  } catch (e) {
    toast(e.message);
  }
};
$('#item-form').onsubmit = event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const item = readItem(event.target, editId || uid(), 'item');
    await rpc('check_outfit', {
      wardrobe: state.wardrobe.filter(x => x.id !== item.id).map(metadata).concat(metadata(item)),
      item_ids: []
    });
    const wardrobe = editId ? state.wardrobe.map(x => x.id === editId ? item : x) : [...state
      .wardrobe, item
    ];
    await saveState({
      ...state,
      wardrobe
    });
    $('#item-dialog').close();
    suggestions = [];
    $('#suggestions').innerHTML = '';
    resetResults();
    refresh();
    toast('Piece saved.');
  });
};
$('#save-outfit').onclick = event => busy(event.target, async () => {
  const ids = categories.map(c => selection[c]).filter(Boolean),
    name = $('#outfit-name').value.trim() || 'My combination';
  const result = await rpc('check_outfit', {
    wardrobe: state.wardrobe.map(metadata),
    item_ids: ids,
    style: $('#studio-style').value,
    season: $('#studio-season').value
  });
  $('#outfit-check').textContent = result.valid ? result.reasons.join(' · ') : result.issues.join(' ');
  $('#outfit-check').classList.toggle('ok', result.valid);
  if (!result.valid) throw Error('Check the outfit notes before saving.');
  if (state.looks.length >= 300) throw Error(
    'Saved outfits are full. Remove one before adding another.');
  if (state.looks.some(x => [...x.item_ids].sort().join('|') === [...ids].sort().join('|')))
  throw Error('This exact combination is already saved.');
  await saveState({
    ...state,
    looks: [...state.looks, {
      id: uid(),
      name,
      item_ids: ids
    }]
  });
  renderWardrobe();
  toast('Combination saved. Find it under Saved & worn.');
});
$('#suggest').onclick = event => busy(event.target, async () => {
  const result = await rpc('build_outfits', {
    wardrobe: state.wardrobe.map(metadata),
    style: $('#studio-style').value,
    season: $('#studio-season').value
  });
  suggestions = result.outfits;
  $('#suggestions').innerHTML =
    `<div class="section-head"><h2>${result.total} compatible combinations</h2></div><p class="fine">${escapeHtml(result.note)}</p>` +
    (result.total ?
      `<div class="outfit-list">${suggestions.map((x,i)=>lookMarkup(x,state.wardrobe,i,'suggest')).join('')}</div>` :
      `<div class="empty"><h2>Let’s fill the gaps.</h2><p>${escapeHtml(result.missing_categories.length?'Add available '+result.missing_categories.map(x=>labels[x]).join(', ')+'.':'Try broader filters, shared style/season tags, or a simpler colour and pattern mix.')}</p></div>`
      );
});

function resetResults() {
  purchaseResult = null;
  $('#purchase-results').innerHTML =
    '<div class="result-placeholder"><span>↗</span><h2>Let your wardrobe<br>have a say.</h2><p>Choose the item’s tags and test it.<br>Your existing clothes will do the rest.</p></div>';
}
$('#purchase-form').onsubmit = event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const form = event.target,
      data = new FormData(form),
      candidate = readItem(form, uid(), 'purchase');
    const result = await rpc('compare_purchase', {
      wardrobe: state.wardrobe.map(metadata),
      candidate: metadata(candidate),
      style: data.get('match_style'),
      season: data.get('match_season'),
      price: data.get('price') === '' ? null : Number(data.get('price')),
      expected_wears: data.get('expected_wears') === '' ? null : Number(data.get(
        'expected_wears'))
    });
    purchase = candidate;
    purchaseResult = result;
    $('#purchase-results').innerHTML =
      `<div class="result-summary"><p class="eyebrow">${escapeHtml(candidate.name.toUpperCase())}</p><div class="result-number">${result.compatible_count}</div><p class="muted">tag-compatible outfits with your wardrobe</p><h2>${escapeHtml(result.summary)}</h2><div class="result-stats"><div><strong>${result.new_tag_combinations}</strong><span>combinations without an available same-tag substitute</span></div><div><strong>${result.cost_per_wear===null?'—':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(result.cost_per_wear)}</strong><span>estimated cost per wear</span></div></div></div>${result.similar_items.length?`<div class="similar-list"><strong>Pieces with the same tags</strong><br>${result.similar_items.map(id=>escapeHtml(state.wardrobe.find(x=>x.id===id).name)).join(' · ')}</div>`:''}<p class="fine">${escapeHtml(result.note)}</p>${result.missing_categories.length?`<p class="muted">Missing available pieces: ${escapeHtml(result.missing_categories.map(x=>labels[x]).join(', '))}.</p>`:''}<button class="secondary" id="add-purchase">I own this now · add to wardrobe ＋</button>${result.outfits.length?`<div class="section-head"><h2>Explore the pairings</h2></div><p class="fine">Showing up to 24 tag-compatible outfits.</p><div class="outfit-list">${result.outfits.map((x,i)=>lookMarkup(x,[...state.wardrobe,candidate],i,'purchase')).join('')}</div>`:''}`;
  });
};
$('#backup').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json'
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'rewear-wardrobe-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#restore').onchange = async event => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw Error('Use a backup smaller than 20 MB.');
    const next = validateBackup(JSON.parse(await file.text()));
    if (await confirmAction('Replace your current wardrobe?',
        `Restore ${next.wardrobe.length} pieces, ${next.looks.length} outfits and ${next.wears.length} wear entries? This replaces the collection on this browser.`
        )) {
      await saveState(next);
      selection = {};
      suggestions = [];
      $('#suggestions').innerHTML = '';
      resetResults();
      refresh();
      toast('Backup restored.');
    }
  } catch (error) {
    toast(error.message);
  } finally {
    event.target.value = '';
  }
};
$('#undo-wear').onclick = async () => {
  try {
    await saveState({
      ...state,
      wears: state.wears.slice(0, -1)
    });
    refresh();
    toast('Last wear undone.');
  } catch (e) {
    toast(e.message);
  }
};
document.addEventListener('dragstart', event => {
  const card = event.target.closest('[data-drag]');
  if (card) event.dataTransfer.setData('text/plain', card.dataset.drag);
});
document.addEventListener('dragover', event => {
  const slot = event.target.closest('[data-slot]');
  if (slot) {
    event.preventDefault();
    slot.classList.add('over');
  }
});
document.addEventListener('dragleave', event => event.target.closest('[data-slot]')?.classList.remove(
'over'));
document.addEventListener('drop', event => {
  const slot = event.target.closest('[data-slot]');
  if (!slot) return;
  event.preventDefault();
  slot.classList.remove('over');
  const item = state.wardrobe.find(x => x.id === event.dataTransfer.getData('text/plain'));
  if (!item || !item.available) return;
  if (item.category !== slot.dataset.slot) return toast('Drop this piece into its matching category.');
  selection[item.category] = item.id;
  renderStudio();
});
async function start() {
  $('#hero-items').innerHTML = [{
    category: 'top',
    color: 'white'
  }, {
    category: 'bottom',
    color: 'blue'
  }, {
    category: 'outer',
    color: 'brown'
  }].map(x => `<div class="hero-piece">${silhouette(x)}</div>`).join('');
  $('#studio-style').innerHTML = options(styles, 'any', 'Any shared style');
  $('#studio-season').innerHTML = options(seasons, 'any', 'Any shared season');
  $('#purchase-fields').innerHTML = fieldMarkup('purchase');
  initPhoto('purchase');
  $('#purchase-form [name="match_style"]').innerHTML = options(styles, 'any', 'Any shared style');
  $('#purchase-form [name="match_season"]').innerHTML = options(seasons, 'any', 'Any shared season');
  try {
    db = await openDatabase();
    state = validateBackup(await readState());
  } catch (error) {
    toast(error.message);
  }
  renderWardrobe();
  setPage(location.hash.slice(1) || 'wardrobe');
}
start();
