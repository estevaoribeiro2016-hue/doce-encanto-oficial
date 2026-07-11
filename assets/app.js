const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const BRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BASE_PRODUCTS = [
  { id: 'brigadeiro', name: 'Brigadeiro', emoji: '🍫', price: 5, stock: 20, min: 8, desc: 'Clássica, cremosa e intensa. Perfeita para quem ama chocolate.' },
  { id: 'oreo', name: 'Oreo', emoji: '🖤', price: 5, stock: 20, min: 8, desc: 'Mais docinha, com biscoito preto e recheio branco crocante.' },
  { id: 'maracuja', name: 'Maracujá', emoji: '💛', price: 5, stock: 20, min: 8, desc: 'Equilibrada, com toque cítrico que combina muito com chocolate.' },
  { id: 'coco', name: 'Coco', emoji: '🥥', price: 5, stock: 20, min: 8, desc: 'Suave, cremosa e delicada.' },
  { id: 'morango', name: 'Morango', emoji: '🍓', price: 5, stock: 0, min: 0, unavailable: true, desc: 'Sabor de morango. Visível no cardápio e indisponível no momento.' },
  { id: 'uva-verde', name: 'Uva Verde', emoji: '🍇', price: 5, stock: 0, min: 0, unavailable: true, desc: 'Sabor de uva verde. Visível no cardápio e indisponível no momento.' }
];

const STORE = 'de_v54_clean_';
const LEGACY_STORES = ['de_v40_', 'de_v41_', 'de_v42_'];
const STORE_ADDRESS = 'Rua Aletes, 78, Pindorama, Belo Horizonte/MG, 30865-180';
const DELIVERY_MODE = 'Uber Moto';
const DELIVERY_FEES = { pindorama: 5, filadelfia: 5, 'jardim filadelfia': 5, 'novo gloria': 6, gloria: 6, coqueiros: 6 };
const DEFAULT_DELIVERY_FEE = 10;
const BUSINESS_WHATSAPP = '5531982263220'; // WhatsApp corporativo: (31) 98226-3220
const PIX_KEY = '31992180872';
let newOrderAlarmEnabled = localStorage.getItem(STORE + 'newOrderAlarm') === '1';
const ADMIN_USERS = {
  'teteu.trufa': { name: 'Teteu', role: 'Administrador', fullAccess: true },
  'ingrid.trufa': { name: 'Ingrid', role: 'Administradora', fullAccess: true }
};


// ===============================
// V51 ESTÁVEL — SUPABASE / TEMPO REAL
// ===============================
let supabaseClient=null;
let supabaseReady=false;
let supabaseStatus='não configurado';
let realtimeChannel=null;
const ADMIN_EMAILS={'teteu.trufa':'teteu.trufa@doceencanto.local','ingrid.trufa':'ingrid.trufa@doceencanto.local'};
function isSupabaseConfigured(){const c=window.DoceEncantoSupabaseConfig||{},k=c.publishableKey||c.anonKey;return !!(c.url&&k&&!String(c.url).includes('COLE_AQUI')&&!String(k).includes('COLE_AQUI'));}
async function initSupabase(){if(!window.supabase||!isSupabaseConfigured()){console.warn('Supabase não configurado.');return;}try{const c=window.DoceEncantoSupabaseConfig;supabaseClient=window.supabase.createClient(c.url,c.publishableKey||c.anonKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});await loadPublicInventory();subscribeInventoryRealtime();supabaseReady=true;supabaseStatus='online';}catch(e){supabaseStatus='erro';console.error(e);}}
function supabaseStatusHtml(){return supabaseReady?'<span class="pill ok">🟢 Banco online conectado</span>':'<span class="pill danger">🔴 Banco online não configurado</span>';}
async function loadPublicInventory(){if(!supabaseClient)return;const [inv,zones]=await Promise.all([supabaseClient.from('inventory').select('*').order('flavor_id'),supabaseClient.from('delivery_zones').select('*').eq('active',true).order('name')]);if(inv.error)throw inv.error;if(zones.error)console.warn(zones.error);if(inv.data?.length){inventory=inv.data.map(r=>({id:r.flavor_id,stock:Number(r.stock||0),min:Number(r.min_stock||0)}));products=BASE_PRODUCTS.map(p=>({...p,...(inventory.find(i=>i.id===p.id)||{})}));}deliveryZones=(zones.data||[]).map(z=>({id:z.id,name:z.name,normalizedName:z.normalized_name,fee:Number(z.fee||0),active:!!z.active,latitude:z.latitude,longitude:z.longitude}));saveLocalOnly();}
async function loadAdminSupabaseState(){if(!supabaseClient)return;const [o,m,z]=await Promise.all([supabaseClient.from('orders').select('*').order('created_at',{ascending:false}).limit(1000),supabaseClient.from('stock_movements').select('*').order('created_at',{ascending:false}).limit(1000),supabaseClient.from('delivery_zones').select('*').order('name')]);if(o.error)throw o.error;if(m.error)throw m.error;if(z.error)throw z.error;orders=(o.data||[]).map(orderFromSupabase);stockMoves=(m.data||[]).map(moveFromSupabase);deliveryZones=(z.data||[]).map(x=>({id:x.id,name:x.name,normalizedName:x.normalized_name,fee:Number(x.fee||0),active:!!x.active,latitude:x.latitude,longitude:x.longitude}));deliveryZonesDraft=deliveryZones.map(x=>({...x}));saveLocalOnly();}
function orderFromSupabase(r){return{id:r.id,created:r.created_label||new Date(r.created_at).toLocaleString('pt-BR'),customerName:r.customer_name,customerPhone:r.customer_phone,items:r.items||[],subtotal:Number(r.subtotal||0),freight:Number(r.freight||0),total:Number(r.total||0),fulfillment:r.fulfillment,deliveryMethod:r.delivery_method,deliveryRegion:r.delivery_region,address:r.address,payment:r.payment,paymentLabel:r.payment_label,status:r.status,stockRestored:!!r.stock_restored,createdAt:r.created_at,readyAt:r.ready_at?new Date(r.ready_at).toLocaleString('pt-BR'):'',deliveredAt:r.delivered_at?new Date(r.delivered_at).toLocaleString('pt-BR'):'',canceledAt:r.canceled_at?new Date(r.canceled_at).toLocaleString('pt-BR'):''};}
function moveFromSupabase(r){return{id:r.id,date:new Date(r.created_at).toLocaleString('pt-BR'),type:r.type,productId:r.flavor_id,productName:r.flavor_name,emoji:r.emoji,qty:Number(r.qty||0),reason:r.reason,orderId:r.order_id||''};}
function subscribeInventoryRealtime(){if(!supabaseClient)return;supabaseClient.channel('public-inventory-v50').on('postgres_changes',{event:'*',schema:'public',table:'inventory'},async()=>{await loadPublicInventory();renderProducts();renderPromo();renderCart();if(currentAdmin)renderAdmin();}).subscribe();}
function subscribeAdminRealtime(){if(!supabaseClient)return;if(realtimeChannel)supabaseClient.removeChannel(realtimeChannel);realtimeChannel=supabaseClient.channel('admin-v54-safe').on('postgres_changes',{event:'*',schema:'public',table:'orders'},async(payload)=>{await loadAdminSupabaseState();if(currentAdmin){renderAdmin();if(payload?.eventType==='INSERT')notifyNewOrder(payload.new);}}).on('postgres_changes',{event:'*',schema:'public',table:'stock_movements'},async()=>{await loadAdminSupabaseState();if(currentAdmin)renderAdmin();}).on('postgres_changes',{event:'*',schema:'public',table:'delivery_zones'},async()=>{await loadAdminSupabaseState();if(currentAdmin)renderAdmin();}).subscribe();}
function playNewOrderAlarm(){
  if(!newOrderAlarmEnabled)return;
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    const ctx=new AudioCtx();
    const now=ctx.currentTime;
    [0,0.24,0.48].forEach((delay,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=i===1?880:1046;gain.gain.setValueAtTime(0.0001,now+delay);gain.gain.exponentialRampToValueAtTime(0.22,now+delay+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.18);osc.connect(gain);gain.connect(ctx.destination);osc.start(now+delay);osc.stop(now+delay+0.2);});
    setTimeout(()=>ctx.close?.(),1000);
  }catch(e){console.warn('Alarme indisponível',e);}
}
function notifyNewOrder(row){
  playNewOrderAlarm();
  const nome=row?.customer_name||'Novo cliente';
  const antigo=document.title;document.title='🔔 NOVO PEDIDO — Doce Encanto';setTimeout(()=>document.title=antigo,8000);
  if('Notification'in window&&Notification.permission==='granted')new Notification('Novo pedido na Doce Encanto',{body:`${nome} fez um novo pedido.`});
}
async function toggleNewOrderAlarm(){
  newOrderAlarmEnabled=!newOrderAlarmEnabled;
  localStorage.setItem(STORE+'newOrderAlarm',newOrderAlarmEnabled?'1':'0');
  if(newOrderAlarmEnabled){if('Notification'in window&&Notification.permission==='default')await Notification.requestPermission();playNewOrderAlarm();alert('Alarme de pedido novo ativado.');}else alert('Alarme de pedido novo desativado.');
  if(currentAdmin)renderAdmin();
}
function saveLocalOnly(){localStorage.setItem(STORE+'inventory',JSON.stringify(products.map(({id,stock,min})=>({id,stock,min}))));localStorage.setItem(STORE+'cart',JSON.stringify(cart));localStorage.setItem(STORE+'orders',JSON.stringify(orders));localStorage.setItem(STORE+'stockMoves',JSON.stringify(stockMoves));}
function loadJSON(key, fallback) {
  const current = localStorage.getItem(STORE + key);
  if (current) {
    try { return JSON.parse(current); } catch { }
  }
  for (const prefix of LEGACY_STORES) {
    const raw = localStorage.getItem(prefix + key);
    if (raw) {
      try { return JSON.parse(raw); } catch { }
    }
  }
  return fallback;
}

let inventory = loadJSON('inventory', BASE_PRODUCTS.map(p => ({ id: p.id, stock: p.stock, min: p.min })));
let products = BASE_PRODUCTS.map(p => ({ ...p, ...(inventory.find(i => i.id === p.id) || {}) }));
let cart = loadJSON('cart', []);
let orders = loadJSON('orders', []);
let stockMoves = loadJSON('stockMoves', []);
let promo = [];
let currentAdmin = null;
let deliveryInfo = { type: 'retirada', fee: 0, status: 'Retirada na loja', method: 'Retirada', applied: false, region: '' };
let deliveryZones = [];
let deliveryZonesDraft = [];
let deliveryZoneSearch = '';
let printPaperWidth = Number(localStorage.getItem(STORE+'paperWidth') || 58);

const normalizeText = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const productById = (id) => products.find(p => p.id === id);
const faceKey = (u) => STORE + 'faceid_' + u;
const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const base64ToBytes = (value) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const hasFaceId = (u) => {
  try { return !!JSON.parse(localStorage.getItem(faceKey(u)) || 'null')?.credentialId; }
  catch { return false; }
};

function save() {
  saveLocalOnly();
}
function say(t) { const s = $('#speech'); if (s) s.innerHTML = t; }
function jump(t) { say(t); const tr = $('#trufita'); if (tr) { tr.classList.add('jump'); setTimeout(() => tr.classList.remove('jump'), 800); } }
function pointPix(t) { say(t); const tr = $('#trufita'); if (tr) { tr.classList.add('point'); setTimeout(() => tr.classList.remove('point'), 2200); } }
function confetti() { for (let i = 0; i < 26; i++) { const e = document.createElement('span'); e.className = 'confetti'; e.textContent = ['🍫', '✨', '💖', '🎉'][i % 4]; e.style.left = Math.random() * 100 + 'vw'; e.style.animationDelay = Math.random() * .18 + 's'; document.body.append(e); setTimeout(() => e.remove(), 1400); } }
function fly(btn, emoji) { if (!btn || !$('#cartOpen')) return; const r = btn.getBoundingClientRect(), c = $('#cartOpen').getBoundingClientRect(), el = document.createElement('div'); el.className = 'fly'; el.textContent = emoji; el.style.left = r.left + r.width / 2 + 'px'; el.style.top = r.top + r.height / 2 + 'px'; document.body.append(el); requestAnimationFrame(() => { el.style.transform = `translate(${c.left - r.left}px,${c.top - r.top}px) scale(.25) rotate(360deg)`; el.style.opacity = '.15'; }); setTimeout(() => { el.remove(); $('#cartOpen').classList.add('pop'); setTimeout(() => $('#cartOpen').classList.remove('pop'), 500); }, 760); }

function deliveryFeeByRegion(bairro) { const key=normalizeText(bairro); const found=deliveryZones.find(z=>z.active && (normalizeText(z.name)===key || z.normalizedName===key)); return found ? Number(found.fee) : (DELIVERY_FEES[key] ?? DEFAULT_DELIVERY_FEE); }
function deliveryFeeLabel(bairro) { const key=normalizeText(bairro); const found=deliveryZones.find(z=>z.active&&(normalizeText(z.name)===key||z.normalizedName===key)); return found ? 'Taxa cadastrada pela central' : 'Taxa padrão para bairro não cadastrado'; }
function calc() { return cart.reduce((a, i) => a + Number(i.price || 0) * Number(i.qty || 0), 0); }
function stockReservedInCart(id) { return cart.reduce((a, i) => a + (i.flavors ? i.flavors.filter(f => f.id === id).length * (i.qty || 1) : (i.id === id ? (i.qty || 0) : 0)), 0); }
function stockNeededByCart() {
  const need = {};
  for (const i of cart) {
    if (i.flavors) i.flavors.forEach(f => need[f.id] = (need[f.id] || 0) + (i.qty || 1));
    else need[i.id] = (need[i.id] || 0) + (i.qty || 0);
  }
  return need;
}
function canAddProduct(id, qty = 1) { const p = productById(id); return p && !p.unavailable && p.stock > 0 && stockReservedInCart(id) + qty <= p.stock; }
function canAddPromoBatch(item, extraQty = 1) {
  const need = {};
  (item.flavors || []).forEach(f => need[f.id] = (need[f.id] || 0) + extraQty);
  for (const [id, qty] of Object.entries(need)) if (stockReservedInCart(id) + qty > productById(id).stock) return false;
  return true;
}
function checkCartStock() {
  const need = stockNeededByCart();
  for (const [id, qty] of Object.entries(need)) {
    const p = productById(id);
    if (!p || p.unavailable || p.stock <= 0) return { ok: false, msg: `${p?.name || id} está indisponível.` };
    if (qty > p.stock) return { ok: false, msg: `Não temos estoque suficiente de ${p.name}. Disponível: ${p.stock}. No carrinho: ${qty}.` };
  }
  return { ok: true };
}
function addStockMove(type, productId, qty, reason, orderId = '') {
  const p = productById(productId) || BASE_PRODUCTS.find(x => x.id === productId);
  const move = { id: 'MV' + Date.now().toString().slice(-7) + Math.floor(Math.random() * 90), date: new Date().toLocaleString('pt-BR'), type, productId, productName: p?.name || productId, emoji: p?.emoji || '📦', qty, reason, orderId };
  stockMoves.unshift(move);
  stockMoves = stockMoves.slice(0, 300);
  
}
function deductStockForOrder(order) {
  const need = {};
  order.items.forEach(i => {
    if (i.flavors) i.flavors.forEach(f => need[f.id] = (need[f.id] || 0) + (i.qty || 1));
    else need[i.id] = (need[i.id] || 0) + (i.qty || 0);
  });
  for (const [id, qty] of Object.entries(need)) {
    const p = productById(id);
    p.stock = Math.max(0, p.stock - qty);
    addStockMove('Saída', id, -qty, 'Pedido finalizado', order.id);
  }
}
function restoreStockForOrder(order) {
  if (order.stockRestored) return;
  const need = {};
  order.items.forEach(i => {
    if (i.flavors) i.flavors.forEach(f => need[f.id] = (need[f.id] || 0) + (i.qty || 1));
    else need[i.id] = (need[i.id] || 0) + (i.qty || 0);
  });
  for (const [id, qty] of Object.entries(need)) {
    const p = productById(id);
    p.stock += qty;
    addStockMove('Cancelamento', id, qty, 'Pedido cancelado / estoque devolvido', order.id);
  }
  order.stockRestored = true;
}

function syncProducts() { products = BASE_PRODUCTS.map(p => ({ ...p, ...(products.find(i => i.id === p.id) || {}) })); save(); renderProducts(); renderPromo(); renderCart(); if (currentAdmin) renderAdmin(); }
function renderProducts() {
  if (!$('#products')) return;
  $('#products').innerHTML = products.map(p => {
    const out = p.unavailable || p.stock <= 0;
    return `<article class="product ${out ? 'soldout' : ''}"><div class="art">${p.emoji}</div><h3>Trufa de ${p.name}</h3><p>${p.desc}</p><small class="stockBadge ${out ? 'danger' : ''}">${out ? 'Indisponível' : 'Estoque: ' + p.stock}</small><div class="price">${BRL(p.price)}</div><button class="primary full add" data-id="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Indisponível' : 'Adicionar'}</button></article>`;
  }).join('');
  $$('.add').forEach(b => b.onclick = () => addItem(b.dataset.id, b));
}
function renderPromo() {
  if (!$('#promoChoices')) return;
  const count = promo.length, percent = (count / 3) * 100;
  $$('.slots span').forEach((s, i) => { const id = promo[i]; s.textContent = id ? productById(id).emoji : ''; s.classList.toggle('filled', !!id); });
  $('#promoProgress').style.width = percent + '%'; $('#promoCounter').textContent = `${count} de 3 escolhidas`;
  $('#promoChoices').innerHTML = products.map(p => {
    const selected = promo.filter(x => x === p.id).length, out = p.unavailable || p.stock <= 0, limit = stockReservedInCart(p.id) + selected >= p.stock;
    return `<div class="choice ${out ? 'soldout' : ''}"><div class="emoji">${p.emoji}</div><h3>${p.name}</h3><p>${p.desc}</p><small>${out ? 'Indisponível' : `Estoque: ${p.stock} • Selecionadas: ${selected}`}</small><div class="qty"><button data-minus="${p.id}" ${selected === 0 ? 'disabled' : ''}>-</button><b>${selected}</b><button data-plus="${p.id}" ${(out || promo.length >= 3 || limit) ? 'disabled' : ''}>+</button></div></div>`;
  }).join('');
  $$('[data-plus]').forEach(b => b.onclick = () => promoPlus(b.dataset.plus, b));
  $$('[data-minus]').forEach(b => b.onclick = () => promoMinus(b.dataset.minus));
  const add = $('#addPromo'), msg = $('#promoMsg'); add.disabled = count !== 3;
  msg.innerHTML = count === 0 ? 'Escolha 3 trufas. Pode repetir sabores normalmente. 💖' : count === 1 ? 'Ótimo começo! Falta escolher mais 2 trufas.' : count === 2 ? 'Quase lá! Falta só mais 1 trufa para fechar sua promoção. 😍' : `🏆 Promoção pronta! Sua caixa: <b>${promo.map(id => productById(id).name).join(', ')}</b>.`;
  $('#promoResult').classList.toggle('complete', count === 3);
}
function promoPlus(id, btn) { const p = productById(id); if (promo.length >= 3) return; if (stockReservedInCart(id) + promo.filter(x => x === id).length >= p.stock) return say(`Você atingiu o limite de estoque de ${p.name}.`); promo.push(id); fly(btn, p.emoji); renderPromo(); if (promo.length === 3) { confetti(); jump('Promoção desbloqueada! Agora é só adicionar ao carrinho 🎉'); } }
function promoMinus(id) { const idx = promo.lastIndexOf(id); if (idx >= 0) { promo.splice(idx, 1); renderPromo(); } }
function addPromo() { if (promo.length !== 3) return; const flavors = promo.map(id => ({ id, name: productById(id).name, emoji: productById(id).emoji })); const item = { id: 'promo-' + Date.now(), name: 'Promoção 3 trufas', emoji: '🎁', qty: 1, price: 14, flavors }; if (!canAddPromoBatch(item, 0)) return say('Estoque insuficiente para essa promoção.'); cart.push(item); promo = []; save(); renderPromo(); renderCart(); jump('Promoção adicionada ao carrinho! 🛒'); }
function suggestPromo() { promo = []; for (const id of ['maracuja', 'coco', 'oreo', 'brigadeiro']) { if (promo.length < 3 && productById(id).stock > stockReservedInCart(id) + promo.filter(x => x === id).length) promo.push(id); } renderPromo(); say('Minha sugestão equilibrada: Maracujá, Coco e Oreo. Uma cítrica, uma suave e uma mais docinha 💖'); }
function addItem(id, btn) { const p = productById(id); if (!p || p.unavailable || p.stock <= 0) return say(`${p?.name || 'Produto'} está indisponível hoje.`); if (!canAddProduct(id, 1)) return say(`Você atingiu o limite de estoque de ${p.name}.`); const item = cart.find(i => i.id === id && !i.flavors); if (item) item.qty++; else cart.push({ id: p.id, name: p.name, emoji: p.emoji, price: p.price, qty: 1 }); fly(btn, p.emoji); jump(`${p.name} foi para o carrinho! Excelente escolha 🍫`); save(); renderCart(); }

function freeShippingProgress() { const sub = calc(), missing = Math.max(0, 30 - sub), pct = Math.min(100, (sub / 30) * 100); if (sub >= 30) return `<div class="freeShip unlocked"><b>🎉 Frete grátis desbloqueado!</b><small>Seu pedido passou de R$30,00.</small></div>`; return `<div class="freeShip"><b>🎁 Frete grátis acima de R$30,00</b><div class="freeBar"><i style="width:${pct}%"></i></div><small>Faltam ${BRL(missing)} para ganhar frete grátis.</small></div>`; }
function deliveryFee() { const f = $('[name=fulfillment]:checked')?.value || 'retirada'; if (f !== 'entrega') return 0; if (calc() >= 30) return 0; if (deliveryInfo && deliveryInfo.applied && typeof deliveryInfo.fee === 'number') return deliveryInfo.fee; return 0; }
function refreshDeliveryQuote(showMessage = false) {
  const bairro = $('#bairro')?.value?.trim() || '';
  const box = $('#deliveryQuote');
  if (!bairro) {
    deliveryInfo = { type: 'entrega', fee: 0, status: 'Aguardando bairro', method: DELIVERY_MODE, applied: false, region: '' };
    if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
    return false;
  }
  const sub = calc();
  const baseFee = deliveryFeeByRegion(bairro);
  const region = deliveryFeeLabel(bairro);
  const fee = sub >= 30 ? 0 : baseFee;
  deliveryInfo = { type: 'entrega', fee, status: fee === 0 ? 'Frete grátis aplicado' : 'Frete por bairro aplicado', method: DELIVERY_MODE, bairro, region, applied: true, baseFee };
  if (box) {
    box.classList.remove('hidden');
    box.innerHTML = `<b>🛵 Entrega por ${DELIVERY_MODE}</b><br><b>📍 Bairro: ${bairro}</b><br><b>🚚 Frete: ${fee === 0 ? '🎉 GRÁTIS' : BRL(fee)}</b><br><b>💰 Total com entrega: ${BRL(sub + fee)}</b><br><small>${fee === 0 ? 'Pedido a partir de R$30,00.' : region + '. Frete aplicado por bairro.'}</small>${freeShippingProgress()}`;
  }
  if (showMessage) say(fee === 0 ? `Parabéns! Você desbloqueou frete grátis para ${bairro}. Total: ${BRL(sub)} 🎉` : `Frete para ${bairro}: ${BRL(fee)}. Total com entrega: ${BRL(sub + fee)} 💖`);
  return true;
}
function applyDeliveryByRegion(showMessage = true) {
  const applied = refreshDeliveryQuote(showMessage);
  updateTotals({ skipQuoteRefresh: true });
  return applied;
}
function updateTotals(options = {}) {
  const sub = calc();
  const isDelivery = $('[name=fulfillment]:checked')?.value === 'entrega';
  if (isDelivery && !options.skipQuoteRefresh) refreshDeliveryQuote(false);
  const fee = isDelivery ? deliveryFee() : 0;
  const total = sub + fee;
  if ($('#subtotal')) $('#subtotal').textContent = BRL(sub);
  if ($('#frete')) $('#frete').textContent = isDelivery ? (fee === 0 && sub >= 30 ? 'Grátis' : BRL(fee)) : BRL(0);
  if ($('#grandTotal')) $('#grandTotal').textContent = BRL(total);
  if ($('#distanceLabel')) $('#distanceLabel').textContent = isDelivery ? DELIVERY_MODE : 'Retirada';
  if ($('#cartTotal')) $('#cartTotal').textContent = BRL(sub);
  if ($('#freeShipSummary')) $('#freeShipSummary').innerHTML = isDelivery ? freeShippingProgress() : '';
}
function renderCart() { const totalQty = cart.reduce((a, i) => a + (i.qty || 0), 0); if ($('#cartCount')) $('#cartCount').textContent = totalQty; const html = cart.length ? cart.map((i, idx) => `<div class="cartRow"><div><b>${i.emoji} ${i.name}</b><br><small>${i.flavors ? i.flavors.map(f => f.name).join(', ') + (i.qty > 1 ? ` • ${i.qty} promoções iguais` : '') : ''}</small></div><div class="qty"><button data-dec="${idx}">-</button><b>${i.qty}</b><button data-inc="${idx}">+</button></div></div>`).join('') : '<p>Seu carrinho está vazio.</p>'; if ($('#cartItems')) $('#cartItems').innerHTML = html; if ($('#checkoutItems')) $('#checkoutItems').innerHTML = html; $$('[data-dec]').forEach(b => b.onclick = () => { const i = cart[Number(b.dataset.dec)]; if (!i) return; i.qty--; if (i.qty <= 0) cart.splice(Number(b.dataset.dec), 1); save(); renderCart(); renderPromo(); }); $$('[data-inc]').forEach(b => b.onclick = () => { const i = cart[Number(b.dataset.inc)]; if (!i) return; if (i.flavors) { if (!canAddPromoBatch(i, 1)) return say('Estoque insuficiente para adicionar mais uma promoção igual.'); i.qty++; } else { if (!canAddProduct(i.id, 1)) return say(`Limite de ${i.name} atingido.`); i.qty++; } save(); renderCart(); renderPromo(); }); updateTotals(); }

function onlyDigits(v) { return (v || '').replace(/\D/g, ''); }
function maskCep(v) { v = onlyDigits(v).slice(0, 8); return v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v; }

const LOCAL_CEP_FALLBACK = {
  '30865060': { logradouro: 'Rua Macarena', bairro: 'Pindorama', localidade: 'Belo Horizonte', uf: 'MG' },
  '30865130': { logradouro: 'Rua Arauto', bairro: 'Pindorama', localidade: 'Belo Horizonte', uf: 'MG' },
  '30865180': { logradouro: 'Rua Aletes', bairro: 'Pindorama', localidade: 'Belo Horizonte', uf: 'MG' },
  '30865300': { logradouro: 'Rua Aredius', bairro: 'Pindorama', localidade: 'Belo Horizonte', uf: 'MG' }
};
let cepLookupSequence = 0;
let lastResolvedCep = '';

function applyCepData(data, source = 'ViaCEP', rawCep = '') {
  const street = data.logradouro || data.street || '';
  const neighborhood = data.bairro || data.neighborhood || '';
  const city = data.localidade || data.city || '';
  const state = data.uf || data.state || '';
  if ($('#rua')) $('#rua').value = street;
  if ($('#bairro')) $('#bairro').value = neighborhood;
  if ($('#cidade')) $('#cidade').value = city;
  if ($('#estado')) $('#estado').value = state;
  lastResolvedCep = rawCep || onlyDigits($('#cep')?.value || '');
  const status = $('#cepStatus');
  if (status) {
    const complete = !!street;
    status.textContent = source === 'local'
      ? (complete ? 'Endereço reconhecido pela base local. Complete o número.' : 'Bairro reconhecido. Complete a rua e o número.')
      : 'Endereço preenchido automaticamente. Complete o número.';
    status.className = 'cepStatus ok';
  }
  if (neighborhood) refreshDeliveryQuote(false);
  updateTotals({ skipQuoteRefresh: true });
  setTimeout(() => $('#numero')?.focus(), 60);
}
function localCepFallback(raw) {
  if (LOCAL_CEP_FALLBACK[raw]) return LOCAL_CEP_FALLBACK[raw];
  if (raw.startsWith('30865')) return { logradouro: '', bairro: 'Pindorama', localidade: 'Belo Horizonte', uf: 'MG' };
  return null;
}
async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      mode: 'cors',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function fetchViaCepJsonp(raw, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__doceEncantoCep_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.remove();
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Tempo esgotado ao consultar o CEP')); }, timeoutMs);
    window[callbackName] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Falha ao carregar o ViaCEP')); };
    script.src = `https://viacep.com.br/ws/${raw}/json/?callback=${callbackName}&t=${Date.now()}`;
    document.head.appendChild(script);
  });
}

async function lookupCep(force = false) {
  const cepEl = $('#cep');
  if (!cepEl) return;
  const status = $('#cepStatus');
  const raw = onlyDigits(cepEl.value);
  cepEl.value = maskCep(raw);

  if (raw.length !== 8) {
    if (status) { status.textContent = 'Digite os 8 números do CEP.'; status.className = 'cepStatus'; }
    return;
  }
  if (!force && raw === lastResolvedCep && $('#bairro')?.value?.trim()) return;

  const requestId = ++cepLookupSequence;
  if (status) { status.textContent = 'Buscando endereço pelo CEP...'; status.className = 'cepStatus loading'; }

  let data = null;
  let source = '';

  // 1) ViaCEP por JSON normal.
  try {
    const via = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${raw}/json/?t=${Date.now()}`);
    if (via && !via.erro) { data = via; source = 'ViaCEP'; }
  } catch (e) { console.warn('ViaCEP por fetch falhou:', e); }

  // 2) BrasilAPI como segunda fonte.
  if (!data) {
    try {
      const brasil = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v1/${raw}?t=${Date.now()}`);
      if (brasil?.cep) { data = brasil; source = 'BrasilAPI'; }
    } catch (e) { console.warn('BrasilAPI falhou:', e); }
  }

  // 3) ViaCEP por JSONP. Funciona mesmo quando o navegador bloqueia o fetch/CORS.
  if (!data) {
    try {
      const viaJsonp = await fetchViaCepJsonp(raw);
      if (viaJsonp && !viaJsonp.erro) { data = viaJsonp; source = 'ViaCEP'; }
    } catch (e) { console.warn('ViaCEP por JSONP falhou:', e); }
  }

  if (requestId !== cepLookupSequence) return;
  if (data) {
    applyCepData(data, source, raw);
    return;
  }

  const fallback = localCepFallback(raw);
  if (fallback) {
    applyCepData(fallback, 'local', raw);
    return;
  }

  lastResolvedCep = '';
  if (status) {
    status.textContent = 'Não foi possível consultar este CEP. Confira os números ou preencha o endereço manualmente.';
    status.className = 'cepStatus error';
  }
}

function bindCepLookup() {
  const cepInput = $('#cep');
  if (!cepInput || cepInput.dataset.cepBound === '1') return;
  cepInput.dataset.cepBound = '1';
  let cepTimer = null;

  const scheduleLookup = (force = false, delay = 250) => {
    const raw = onlyDigits(cepInput.value);
    cepInput.value = maskCep(raw);
    if (raw !== lastResolvedCep) lastResolvedCep = '';
    const status = $('#cepStatus');
    if (status) {
      status.textContent = raw.length === 8 ? 'Buscando endereço pelo CEP...' : 'Digite os 8 números do CEP.';
      status.className = raw.length === 8 ? 'cepStatus loading' : 'cepStatus';
    }
    clearTimeout(cepTimer);
    if (raw.length === 8) cepTimer = setTimeout(() => lookupCep(force), delay);
  };

  cepInput.addEventListener('input', () => scheduleLookup(false, 250));
  cepInput.addEventListener('keyup', () => {
    if (onlyDigits(cepInput.value).length === 8) scheduleLookup(false, 100);
  });
  cepInput.addEventListener('blur', () => {
    if (onlyDigits(cepInput.value).length === 8) lookupCep(true);
  });
  cepInput.addEventListener('change', () => {
    if (onlyDigits(cepInput.value).length === 8) lookupCep(true);
  });
  cepInput.addEventListener('paste', () => setTimeout(() => scheduleLookup(true, 0), 20));
}

function resetDeliveryQuote() {
  deliveryInfo = { type: $('[name=fulfillment]:checked')?.value || 'retirada', fee: 0, status: 'Não aplicado', method: deliveryInfo?.method || DELIVERY_MODE, applied: false, region: '' };
  const box = $('#deliveryQuote');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  updateTotals({ skipQuoteRefresh: true });
}
function calculateDeliveryDistance() {
  return applyDeliveryByRegion(true);
}
function orderItemsText(items) {
  return items.map(i => {
    if (i.flavors) {
      const counts = {};
      i.flavors.forEach(f => counts[f.name] = (counts[f.name] || 0) + 1);
      const flavors = Object.entries(counts).map(([name, qty]) => `   • ${qty}x ${name}`).join('\n');
      return `🎁 ${i.qty}x Promoção 3 trufas por R$14\n${flavors}`;
    }
    return `${i.emoji} ${i.qty}x Trufa de ${i.name} — ${BRL(i.price * i.qty)}`;
  }).join('\n\n');
}
function buildWhatsappMessage(order) {
  const isDelivery = order.fulfillment === 'entrega';
  const lines = [];
  lines.push('🍫 *NOVO PEDIDO - DOCE ENCANTO*');
  lines.push('');
  lines.push(`📦 *Pedido:* #${order.id}`);
  lines.push(`📅 *Data:* ${order.created}`);
  lines.push('');
  lines.push('👤 *Cliente*');
  lines.push(`Nome: ${order.customerName}`);
  lines.push(`Telefone: ${order.customerPhone}`);
  lines.push('');
  lines.push('🛒 *Itens*');
  lines.push(orderItemsText(order.items));
  lines.push('');
  lines.push('💰 *Resumo*');
  lines.push(`Produtos: ${BRL(order.subtotal)}`);
  lines.push(`Frete: ${order.freight === 0 && isDelivery ? '🎉 GRÁTIS' : BRL(order.freight)}`);
  lines.push(`Total: *${BRL(order.total)}*`);
  lines.push('');
  if (isDelivery) {
    lines.push('🚚 *Entrega*');
    lines.push(`Modalidade: ${DELIVERY_MODE}`);
    lines.push(`CEP: ${order.address.cep}`);
    lines.push(`Rua: ${order.address.rua}`);
    lines.push(`Número: ${order.address.numero}`);
    if (order.address.complemento) lines.push(`Complemento: ${order.address.complemento}`);
    lines.push(`Bairro: ${order.address.bairro}`);
    lines.push(`Cidade/UF: ${order.address.cidade}/${order.address.estado}`);
    lines.push(`Região: ${order.deliveryRegion || 'Frete por bairro'}`);
    lines.push('');
  } else {
    lines.push('🏪 *Retirada na loja*');
    lines.push(STORE_ADDRESS);
    lines.push('');
  }
  lines.push('💳 *Pagamento*');
  lines.push(`Forma: ${order.paymentLabel}`);
  lines.push(order.payment === 'pix' ? 'Status: Aguardando confirmação do Pix' : 'Status: A combinar na retirada');
  lines.push('');
  lines.push('📌 *Status inicial:* Recebido');
  return lines.join('\n');
}
function normalizePaymentLabel(v) {
  if (v === 'pix') return 'PIX';
  if (v === 'dinheiro') return 'Dinheiro';
  if (v === 'cartao') return 'Cartão';
  return v || 'Não informado';
}
async function finish(){
  if(!supabaseReady)return alert('O banco online ainda não está configurado. Siga o README da V50 REAL.');
  if(!cart.length)return alert('Seu carrinho está vazio.');
  const customerName=($('#customerName')?.value||'').trim(),customerPhone=($('#customerPhone')?.value||'').trim();
  if(!customerName){$('#customerName')?.focus();return alert('Informe o nome do cliente.');}
  if(!customerPhone){$('#customerPhone')?.focus();return alert('Informe o telefone/WhatsApp do cliente.');}
  const fulfillment=$('[name=fulfillment]:checked')?.value||'retirada';let payment=$('#payment')?.value||'pix';let address=null;
  if(fulfillment==='entrega'){payment='pix';$('#payment').value='pix';const cep=($('#cep')?.value||'').trim(),rua=($('#rua')?.value||'').trim(),numero=($('#numero')?.value||'').trim(),bairro=($('#bairro')?.value||'').trim(),cidade=($('#cidade')?.value||'').trim(),estado=($('#estado')?.value||'').trim();if(!cep||!rua||!numero||!bairro||!cidade||!estado)return alert('Preencha CEP, rua, número, bairro, cidade e UF para entrega.');address={cep,rua,numero,complemento:($('#complemento')?.value||'').trim(),bairro,cidade,estado};}
  const btn=$('#finishOrder');btn.disabled=true;btn.textContent='Finalizando...';
  try{const payload={customerName,customerPhone,items:JSON.parse(JSON.stringify(cart)),fulfillment,address,payment,paymentLabel:normalizePaymentLabel(payment)};const {data,error}=await supabaseClient.rpc('create_order_v54_clean',{p_payload:payload});if(error)throw error;const order=orderFromSupabase(data);orders.unshift(order);cart=[];save();await loadPublicInventory();renderCart();renderProducts();renderPromo();confetti();jump('Pedido salvo online! Teteu e Ingrid verão em tempo real. 💖');window.open(`https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(buildWhatsappMessage(order))}`,'_blank');location.hash='empresa';}
  catch(e){console.error(e);alert(e.message||'Não foi possível finalizar o pedido.');}
  finally{btn.disabled=false;btn.textContent='Finalizar pedido';}
}
function enableEnterToNextField() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (!el.matches('input, select, button')) return;
    if (el.closest('#aiForm')) return;
    if (el.tagName === 'BUTTON') return;
    e.preventDefault();
    const focusables = $$('input, select, button, a[href], textarea')
      .filter(x => !x.disabled && x.offsetParent !== null && x.tabIndex !== -1 && !x.closest('.hidden'));
    const idx = focusables.indexOf(el);
    const next = focusables[idx + 1];
    if (next) next.focus();
  });
}

function stockStatus(p) { if (p.stock <= 0) return ['Sem estoque', 'danger', 'Produzir hoje']; if (p.stock <= p.min) return ['Atenção', 'warn', 'Repor em breve']; return ['OK', 'ok', 'Estoque saudável']; }
function orderIsDelivered(o) { return normalizeText(o.status) === 'entregue'; }
function orderIsCanceled(o) { return normalizeText(o.status) === 'cancelado'; }
function orderIsProduction(o) { return ['pagamento confirmado','producao', 'produção', 'pronto', 'saiu para entrega', 'aguardando retirada'].includes(normalizeText(o.status)) && !orderIsDelivered(o) && !orderIsCanceled(o); }
function nextProductionStatus(current, fulfillment) { const c = normalizeText(current); if (c === 'pagamento confirmado') return 'Produção'; if (c === 'recebido') return 'Produção'; if (c === 'producao' || c === 'produção') return 'Pronto'; if (c === 'pronto') return fulfillment === 'entrega' ? 'Saiu para entrega' : 'Aguardando retirada'; if (c === 'saiu para entrega' || c === 'aguardando retirada') return 'Entregue'; return 'Produção'; }
function statusBadgeClass(status) { const s = normalizeText(status); if (s === 'recebido' || s === 'aguardando pagamento') return 'warn'; if (s === 'pagamento confirmado') return 'ok'; if (s === 'producao' || s === 'produção') return 'doing'; if (s === 'pronto' || s === 'saiu para entrega' || s === 'aguardando retirada') return 'ready'; if (s === 'entregue') return 'done'; if (s === 'cancelado') return 'danger'; return ''; }
function orderShortItems(o) { return o.items.map(i => i.flavors ? `🎁 ${i.qty}× Promoção: ${i.flavors.map(f => f.name).join(', ')}` : `${i.emoji} ${i.qty}× ${i.name}`).join('<br>'); }
function cleanPhoneBR(phone) { let d = onlyDigits(phone || ''); if (!d) return ''; if (!d.startsWith('55')) d = '55' + d; return d; }
function orderNotifyMessage(o, type) { const loja = STORE_ADDRESS; if(type==='paid') return `🍫 *Doce Encanto*\n\nOlá, *${o.customerName}*! 💖\n\nRecebemos e confirmamos o comprovante do pedido *#${o.id}*.\n\nSeu pedido seguirá agora para produção. ✅`;  if (type === 'ready') return `🍫 *Doce Encanto*\n\nOlá, *${o.customerName}*! 💖\n\nSeu pedido *#${o.id}* já está *pronto*!\n\n${o.fulfillment === 'retirada' ? `Você já pode retirar em:\n📍 *${loja}*` : `Ele será enviado em breve por *Uber Moto*. 🛵`}\n\nObrigado pela preferência! 🍫✨`; if (type === 'delivery') return `🍫 *Doce Encanto*\n\nOlá, *${o.customerName}*! 💖\n\nSeu pedido *#${o.id}* já saiu para entrega.\n\n🛵 A entrega será realizada por um parceiro *Uber Moto*.\n\nFique atento ao telefone, pois o entregador poderá entrar em contato caso necessário.\n\nObrigado pela confiança! ❤️`; if (type === 'delivered') return `🍫 *Doce Encanto*\n\nOlá, *${o.customerName}*!\n\nConsta para nós que seu pedido *#${o.id}* foi entregue. 😍\n\nQue você possa aproveitar esse doce momento 💖🍫\n\nAgradecemos pela preferência e esperamos ver você novamente em breve. 💖🍫`; if (type === 'canceled') return `🍫 *Doce Encanto*\n\nOlá, *${o.customerName}*!\n\nSeu pedido *#${o.id}* foi cancelado. Se precisar, fale com a gente por aqui. 💖`; return ''; }
function openClientWhatsApp(o, msg = '') { const phone = cleanPhoneBR(o.customerPhone); if (!phone) return alert('Este pedido não possui telefone válido do cliente.'); window.open(`https://wa.me/${phone}${msg ? '?text=' + encodeURIComponent(msg) : ''}`, '_blank'); }
async function setOrderStatusAndNotify(id,status,type){if(!supabaseReady||!currentAdmin)return alert('Entre na central online.');try{const {data,error}=await supabaseClient.rpc('admin_update_order_status',{p_order_id:id,p_status:status});if(error)throw error;const updated=orderFromSupabase(data);const idx=orders.findIndex(x=>x.id===id);if(idx>=0)orders[idx]=updated;await loadPublicInventory();await loadAdminSupabaseState();renderAdmin();renderProducts();renderPromo();const msg=type?orderNotifyMessage(updated,type):'';if(msg||type==='chat')openClientWhatsApp(updated,msg);}catch(e){console.error(e);alert(e.message||'Não foi possível atualizar o pedido.');}}

function renderPendingOrders(pending) {
  if (!pending.length) return '<p class="emptyState">Nenhum pedido pendente no momento.</p>';
  return pending.map(o => {
    const raw=normalizeText(o.status);
    const awaitingPix=o.payment==='pix'&&raw==='recebido';
    const shownStatus=awaitingPix?'Aguardando pagamento':o.status;
    const canAdvance=!awaitingPix;
    return `<article class="orderCard status-${statusBadgeClass(shownStatus)}"><div class="orderTop"><div><b>#${o.id}</b><small>${o.created}</small></div><span class="pill ${statusBadgeClass(shownStatus)}">${shownStatus}</span></div><div class="orderClient"><b>${o.customerName}</b><small>${o.customerPhone}</small></div><div class="orderItemsMini">${orderShortItems(o)}</div><div class="orderMeta"><span>${o.fulfillment === 'entrega' ? '🛵 Entrega' : '🏪 Retirada'}</span><b>${BRL(o.total)}</b></div><div class="orderActions smartActions"><select data-status="${o.id}"><option ${awaitingPix?'selected':''}>Aguardando pagamento</option><option ${o.status === 'Pagamento confirmado' ? 'selected' : ''}>Pagamento confirmado</option><option ${o.status === 'Produção' ? 'selected' : ''}>Produção</option><option ${o.status === 'Pronto' ? 'selected' : ''}>Pronto</option><option ${o.status === 'Saiu para entrega' ? 'selected' : ''}>Saiu para entrega</option><option ${o.status === 'Aguardando retirada' ? 'selected' : ''}>Aguardando retirada</option><option ${o.status === 'Entregue' ? 'selected' : ''}>Entregue</option></select>${awaitingPix?`<button class="primary" data-proof="${o.id}">✅ Confirmar comprovante</button>`:`<button class="secondary" data-next="${o.id}" ${canAdvance?'':'disabled'}>Avançar</button>`}<button class="primary" data-ready="${o.id}">🟢 Pedido pronto</button>${o.fulfillment === 'entrega' ? `<button class="secondary" data-delivery="${o.id}">🛵 Saiu para entrega</button>` : ''}<button class="secondary" data-delivered="${o.id}">✅ Entregue</button><button class="ghost" data-chat="${o.id}">💬 Conversar</button><button class="dangerBtn" data-cancel="${o.id}">Cancelar</button></div></article>`;
  }).join('');
}
function renderProductionQueue(queue) { if (!queue.length) return '<p class="emptyState">Nenhum pedido aguardando produção.</p>'; return queue.map(o => `<article class="productionTicket"><div class="ticketHead"><b>#${o.id}</b><span class="pill ${statusBadgeClass(o.status)}">${o.status}</span></div><h4>${o.customerName}</h4><p>${orderShortItems(o)}</p><div class="ticketFoot"><small>${o.fulfillment === 'entrega' ? '🛵 Entrega Uber Moto' : '🏪 Retirada na loja'}</small><button class="primary" data-next="${o.id}">${nextProductionStatus(o.status, o.fulfillment) === 'Entregue' ? 'Marcar entregue' : 'Avançar etapa'}</button></div></article>`).join(''); }
function renderHistory(history) { if (!history.length) return '<p class="emptyState">Nenhum pedido entregue ou cancelado ainda.</p>'; return `<div class="historyTable"><div class="historyHead"><b>Pedido</b><b>Cliente</b><b>Total</b><b>Finalizado</b></div>${history.map(o => `<div class="historyRow"><span>#${o.id}<br><small>${o.status}</small></span><span>${o.customerName}</span><b>${BRL(o.total)}</b><span>${o.deliveredAt || o.canceledAt || o.created}</span></div>`).join('')}</div>`; }
function renderStockMoves() { if (!stockMoves.length) return '<p class="emptyState">Nenhuma movimentação de estoque ainda.</p>'; return `<div class="historyTable stockMoves"><div class="historyHead"><b>Data</b><b>Produto</b><b>Qtd</b><b>Motivo</b></div>${stockMoves.map(m => `<div class="historyRow"><span>${m.date}</span><span>${m.emoji} ${m.productName}<br><small>${m.type}${m.orderId ? ' • ' + m.orderId : ''}</small></span><b>${m.qty > 0 ? '+' : ''}${m.qty}</b><span>${m.reason}</span></div>`).join('')}</div>`; }
function renderAdmin() { const pending = orders.filter(o => !orderIsDelivered(o) && !orderIsCanceled(o)); const history = orders.filter(o => orderIsDelivered(o) || orderIsCanceled(o)); const production = pending.filter(orderIsProduction); const revenue = orders.filter(o => !orderIsCanceled(o)).reduce((a, o) => a + o.total, 0), deliveredRevenue = orders.filter(orderIsDelivered).reduce((a, o) => a + o.total, 0), low = products.filter(p => p.stock <= p.min).length; $('#adminPanel').innerHTML = `<div class="adminHero"><div><p class="tag">Centro de Controle</p><h2>Área da Empresa</h2><p>Pedidos entram em <b>pendentes</b>, descontam estoque ao finalizar e só vão ao histórico quando entregues ou cancelados.</p></div><div class="adminTopActions">${supabaseStatusHtml()}<button id="toggleOrderAlarm" class="secondary">${newOrderAlarmEnabled?'🔔 Alarme ligado':'🔕 Ativar alarme'}</button><button id="adminBack" class="secondary">Voltar ao site</button><button id="adminLogout" class="ghost">Sair</button></div></div><div class="dashCards"><div><small>Pendentes</small><b>${pending.length}</b></div><div><small>Produção</small><b>${production.length}</b></div><div><small>Estoque baixo</small><b>${low}</b></div><div><small>Faturamento entregue</small><b>${BRL(deliveredRevenue)}</b></div></div><div class="adminTabs"><button class="active" data-tabbtn="pending">📌 Pendentes</button><button data-tabbtn="production">🏭 Produção</button><button data-tabbtn="history">📚 Histórico</button><button data-tabbtn="stock">📦 Estoque</button><button data-tabbtn="moves">🔁 Movimentações</button><button data-tabbtn="finance">💰 Financeiro</button></div><div class="tabPanel active" data-tab="pending"><section class="adminCard wide"><h3>📌 Pedidos pendentes</h3><p class="helper">Todo pedido novo fica aqui e não sai enquanto não for marcado como entregue ou cancelado.</p><div class="ordersGrid">${renderPendingOrders(pending)}</div></section></div><div class="tabPanel" data-tab="production"><section class="adminCard wide"><h3>🏭 Painel de Produção Inteligente</h3><div class="productionBoard"><div><h4>🔴 Recebidos</h4>${renderProductionQueue(production.filter(o => normalizeText(o.status) === 'recebido'))}</div><div><h4>🟡 Em produção</h4>${renderProductionQueue(production.filter(o => ['producao', 'produção'].includes(normalizeText(o.status))))}</div><div><h4>🟢 Prontos / Saída</h4>${renderProductionQueue(production.filter(o => ['pronto', 'saiu para entrega', 'aguardando retirada'].includes(normalizeText(o.status))))}</div></div></section></div><div class="tabPanel" data-tab="history"><section class="adminCard wide"><h3>📚 Histórico</h3>${renderHistory(history)}</section></div><div class="tabPanel" data-tab="stock"><section class="adminCard wide"><h3>📦 Estoque inteligente</h3><p class="helper">Cadastre quantas trufas existem por sabor. Se zerar, o sabor fica indisponível no site.</p><div class="stockTable">${products.map(p => { const [label, cls, act] = stockStatus(p); return `<div class="stockRow"><div><b>${p.emoji} ${p.name}</b><small>${act}</small></div><input data-stock="${p.id}" type="number" min="0" value="${p.stock}"><input data-min="${p.id}" type="number" min="1" value="${p.min}"><span class="pill ${cls}">${label}</span></div>`; }).join('')}</div><button id="saveStock" class="primary full">Salvar estoque</button></section></div><div class="tabPanel" data-tab="moves"><section class="adminCard wide"><h3>🔁 Histórico de movimentação do estoque</h3>${renderStockMoves()}</section></div><div class="tabPanel" data-tab="finance"><section class="adminCard wide"><h3>💰 Financeiro simples</h3><div class="line"><span>Faturamento total sem cancelados</span><b>${BRL(revenue)}</b></div><div class="line"><span>Faturamento entregue</span><b>${BRL(deliveredRevenue)}</b></div><div class="line"><span>Ticket médio</span><b>${BRL(orders.length ? revenue / Math.max(1, orders.filter(o => !orderIsCanceled(o)).length) : 0)}</b></div></section></div>`;
  $('#adminBack').onclick=()=>location.hash='home'; $('#adminLogout').onclick=async()=>{await supabaseClient?.auth.signOut();currentAdmin=null;orders=[];stockMoves=[];$('#adminPanel').classList.add('hidden');$('.login').classList.remove('hidden');};
  $$('[data-tabbtn]').forEach(btn => btn.onclick = () => { $$('[data-tabbtn]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); $$('[data-tab]').forEach(p => p.classList.toggle('active', p.dataset.tab === btn.dataset.tabbtn)); });
  $('#saveStock')?.addEventListener('click', async () => {if(!supabaseReady||!currentAdmin)return alert('Entre na central online.');const btn=$('#saveStock');btn.disabled=true;btn.textContent='Salvando...';try{for(const inp of $$('[data-stock]')){const id=inp.dataset.stock,minInp=$(`[data-min="${id}"]`);const {error}=await supabaseClient.rpc('admin_set_inventory',{p_flavor_id:id,p_stock:Math.max(0,Number(inp.value)||0),p_min_stock:Math.max(0,Number(minInp?.value)||0)});if(error)throw error;}await loadPublicInventory();await loadAdminSupabaseState();renderAdmin();renderProducts();renderPromo();jump('Estoque salvo online e sincronizado para todos. ✅');}catch(e){console.error(e);alert(e.message||'Erro ao salvar estoque.');}finally{btn.disabled=false;btn.textContent='Salvar estoque';}});
  $$('[data-status]').forEach(sel => sel.onchange = () => setOrderStatusAndNotify(sel.dataset.status, sel.value));
  $$('[data-next]').forEach(btn => btn.onclick = () => { const o = orders.find(x => x.id === btn.dataset.next); if (!o) return; setOrderStatusAndNotify(o.id, nextProductionStatus(o.status, o.fulfillment)); });
  $$('[data-ready]').forEach(btn => btn.onclick = () => setOrderStatusAndNotify(btn.dataset.ready, 'Pronto', 'ready'));
  $$('[data-delivery]').forEach(btn => btn.onclick = () => setOrderStatusAndNotify(btn.dataset.delivery, 'Saiu para entrega', 'delivery'));
  $$('[data-delivered]').forEach(btn => btn.onclick = () => setOrderStatusAndNotify(btn.dataset.delivered, 'Entregue', 'delivered'));
  $$('[data-chat]').forEach(btn => btn.onclick = () => { const o = orders.find(x => x.id === btn.dataset.chat); if (o) openClientWhatsApp(o, ''); });
  $$('[data-cancel]').forEach(btn => btn.onclick = () => { if (confirm('Cancelar este pedido e devolver o estoque?')) setOrderStatusAndNotify(btn.dataset.cancel, 'Cancelado', 'canceled'); });
}

function aiAnswer(q) { q = q.toLowerCase(); if (/menos doce|não.*doce|nao.*doce|enjoativo/.test(q)) return '💛 Eu recomendo a trufa de Maracujá. O recheio cítrico equilibra muito bem o chocolate e deixa o sabor menos enjoativo. Se quiser algo mais suave, Coco também é uma ótima escolha.'; if (/promo|3|14/.test(q)) return '🎉 A promoção é 3 trufas por R$14. Você pode escolher Brigadeiro, Oreo, Maracujá e Coco, repetindo sabores se quiser. Exemplo: 3 Maracujá ou 2 Oreo + 1 Coco.'; if (/estoque|tem hoje|sabores/.test(q)) return 'Hoje temos: ' + products.map(p => `${p.emoji} ${p.name}: ${p.stock > 0 ? p.stock + ' disponíveis' : 'indisponível'}`).join(', ') + '.'; if (/20|vinte/.test(q)) return 'Com R$20 eu aproveitaria a promoção de 3 por R$14. Minha sugestão: Maracujá, Oreo e Brigadeiro.'; if (/presente|namorada|esposa|anivers/.test(q)) return '🎁 Para presente eu montaria uma caixa com Brigadeiro, Oreo, Maracujá e Coco. Fica bonita, variada e agrada vários gostos.'; if (/cart|dinheiro|pix|pagamento/.test(q)) return 'Para retirada aceitamos Pix, dinheiro ou cartão. Para entrega, somente Pix.'; return 'Me conta seu gosto: você prefere mais chocolate, mais docinha, mais suave ou mais equilibrada? Eu monto uma sugestão para você. 🍫'; }
function addChat(t, who = 'bot') { if (!$('#chatLog')) return; $('#chatLog').innerHTML += `<div class="msg ${who}">${t}</div>`; $('#chatLog').scrollTop = $('#chatLog').scrollHeight; }
async function requireFaceId(u) {
  if (!hasFaceId(u)) return true;
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
    alert('A biometria exige HTTPS e um navegador compatível. Entre usando a senha.');
    return true;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(faceKey(u)) || '{}');
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: base64ToBytes(saved.credentialId), type: 'public-key' }],
      timeout: 60000,
      userVerification: 'required'
    }});
    return true;
  } catch (e) {
    console.warn('Biometria cancelada ou indisponível', e);
    alert('A confirmação biométrica foi cancelada. Tente novamente ou remova o cadastro biométrico deste navegador.');
    return false;
  }
}
async function registerFaceId() {
  const u = ($('#user')?.value || currentAdmin || '').trim();
  const p = ($('#pass')?.value || '').trim();
  if (!ADMIN_USERS[u]) return alert('Digite primeiro um usuário autorizado.');
  if (!currentAdmin && !p) return alert('Informe a senha e entre na central antes de cadastrar a biometria.');
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) return alert('Face ID/Windows Hello exige o site publicado em HTTPS e um aparelho compatível.');
  try {
    const credential = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Doce Encanto' },
      user: { id: new TextEncoder().encode(u), name: u, displayName: ADMIN_USERS[u].name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      timeout: 60000,
      attestation: 'none'
    }});
    localStorage.setItem(faceKey(u), JSON.stringify({ credentialId: bytesToBase64(credential.rawId), createdAt: new Date().toISOString() }));
    alert('Face ID/Touch ID/Windows Hello cadastrado neste aparelho.');
  } catch (e) {
    console.error(e);
    alert('Não foi possível cadastrar a biometria. Verifique se o site está em HTTPS e se a biometria está configurada no aparelho.');
  }
}
async function loginAdmin(){const u=$('#user').value.trim(),p=$('#pass').value,email=ADMIN_EMAILS[u];if(!email)return alert('Usuário ou senha incorretos.');if(!supabaseReady)return alert('Configure o Supabase antes de acessar a central online.');const btn=$('#loginBtn');btn.disabled=true;btn.textContent='Entrando...';try{const {error}=await supabaseClient.auth.signInWithPassword({email,password:p});if(error)throw error;const ok=await requireFaceId(u);if(!ok)return;currentAdmin=u;await loadAdminSupabaseState();subscribeAdminRealtime();$('#adminPanel').classList.remove('hidden');$('.login').classList.add('hidden');renderAdmin();}catch(e){console.error(e);alert('Usuário ou senha incorretos, ou o usuário ainda não foi criado no Supabase.');}finally{btn.disabled=false;btn.textContent='Entrar';}}

async function init() {
  bindCepLookup();
  initSupabase().catch(e => console.error('Falha ao iniciar Supabase:', e));
  renderProducts(); renderPromo(); renderCart(); addChat('Oii! Eu sou a Trufita AI 💖. Posso indicar sabores, explicar promoções e consultar o estoque para você.');
  $('#cartOpen').onclick = () => { $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('show'); };
  $('#cartClose').onclick = $('#overlay').onclick = () => { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('show'); };
  $('#clearCart').onclick = () => { cart = []; save(); renderCart(); renderPromo(); say('Carrinho limpo. Posso te ajudar a montar uma nova promoção 😊'); };
  $('#goCheckout').onclick = () => { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('show'); };
  $$('[name=fulfillment]').forEach(r => r.onchange = () => { const entrega = $('[name=fulfillment]:checked').value === 'entrega'; $('#addressBox').classList.toggle('hidden', !entrega); $('#storeAddress').classList.toggle('hidden', entrega); resetDeliveryQuote(); if (entrega) { $('#payment').value = 'pix'; pointPix('Para entrega, usamos Pix e envio por Uber Moto. Informe o endereço para aplicar o frete por bairro. Frete grátis acima de R$30 💖'); } renderCart(); });
  $('#payment').onchange = () => { if ($('[name=fulfillment]:checked').value === 'entrega' && $('#payment').value !== 'pix') { $('#payment').value = 'pix'; alert('Para entrega, somente Pix.'); } if ($('#payment').value === 'pix') pointPix('Aqui está o QR Code Pix. Depois é só finalizar o pedido. 📱'); };
  $('#copyPix').onclick = () => navigator.clipboard?.writeText($('#pixCode').value).then(() => alert('Pix copia e cola copiado!'));
  $('#finishOrder').onclick = finish; $('#addPromo').onclick = addPromo; $('#resetPromo').onclick = () => { promo = []; renderPromo(); }; $('#suggestPromo').onclick = suggestPromo;
  $('#aiForm').onsubmit = e => { e.preventDefault(); const q = $('#aiInput').value.trim(); if (!q) return; addChat(q, 'user'); const a = aiAnswer(q); setTimeout(() => { addChat(a); say(a.split('.')[0] + '.'); }, 160); $('#aiInput').value = ''; };
  $$('.chips button').forEach(b => b.onclick = () => { $('#aiInput').value = b.dataset.q; $('#aiForm').dispatchEvent(new Event('submit')); });
  $('#loginBtn').onclick = loginAdmin; $('#faceRegister') && ($('#faceRegister').onclick = registerFaceId);
  const THEME_KEY = STORE + 'theme';
  const savedTheme = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialDark = savedTheme ? savedTheme === 'dark' : prefersDark;
  document.body.classList.toggle('dark', initialDark);
  $('#themeToggle').textContent = initialDark ? '☀️' : '🌙';
  $('#themeToggle').setAttribute('aria-label', initialDark ? 'Ativar modo claro' : 'Ativar modo noite');
  $('#themeToggle').onclick = () => {
    const isDark = !document.body.classList.contains('dark');
    document.body.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    $('#themeToggle').textContent = isDark ? '☀️' : '🌙';
    $('#themeToggle').setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo noite');
    const metaTheme = document.querySelector('meta[name=theme-color]');
    if (metaTheme) metaTheme.setAttribute('content', isDark ? '#20110e' : '#ff69a8');
  };
  bindCepLookup();
  ['rua','numero','bairro','cidade','estado'].forEach(id => $('#' + id)?.addEventListener('input', () => {
    if ($('[name=fulfillment]:checked')?.value === 'entrega' && $('#bairro')?.value.trim()) refreshDeliveryQuote(false);
    updateTotals({ skipQuoteRefresh: true });
  }));
  $('#calcDistance')?.addEventListener('click', calculateDeliveryDistance);
  enableEnterToNextField();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => { });
}


// ===============================
// V54 OFICIAL — FINANCEIRO, IMPRESSÃO E TAXAS
// ===============================
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function orderDate(o){const d=o.createdAt?new Date(o.createdAt):null;return d&&!isNaN(d)?d:null;}
function monthlyFinanceHtml(){
  const delivered=orders.filter(orderIsDelivered);
  const now=new Date(); const year=now.getFullYear();
  const months=Array.from({length:12},(_,i)=>{const list=delivered.filter(o=>{const d=orderDate(o);return d&&d.getFullYear()===year&&d.getMonth()===i});const total=list.reduce((a,o)=>a+o.total,0);const freight=list.reduce((a,o)=>a+o.freight,0);const units=list.reduce((a,o)=>a+o.items.reduce((n,it)=>n+(it.flavors?it.flavors.length:1)*(it.qty||1),0),0);return {i,name:new Date(year,i,1).toLocaleDateString('pt-BR',{month:'long'}),count:list.length,total,freight,units};});
  const annual=months.reduce((a,m)=>a+m.total,0);
  return `<div class="financeSummary"><div class="dashCards"><div><small>Ano ${year}</small><b>${BRL(annual)}</b></div><div><small>Pedidos entregues</small><b>${delivered.filter(o=>orderDate(o)?.getFullYear()===year).length}</b></div><div><small>Taxas de entrega</small><b>${BRL(months.reduce((a,m)=>a+m.freight,0))}</b></div><div><small>Ticket médio</small><b>${BRL(annual/Math.max(1,months.reduce((a,m)=>a+m.count,0)))}</b></div></div><div class="monthGrid">${months.map(m=>`<article class="monthCard ${m.i===now.getMonth()?'current':''}"><h4>${m.name[0].toUpperCase()+m.name.slice(1)}</h4><b>${BRL(m.total)}</b><small>${m.count} pedidos • ${m.units} trufas</small><small>Fretes: ${BRL(m.freight)}</small></article>`).join('')}</div></div>`;
}
function receiptItems(o){return o.items.map(i=>i.flavors?`${i.qty||1}x PROMOÇÃO 3 TRUFAS\n${i.flavors.map(f=>'  - '+f.name).join('\n')}`:`${i.qty||1}x ${i.name}    ${BRL((i.price||5)*(i.qty||1))}`).join('\n');}
function receiptText(o,kind='client'){
 const addr=o.address||{}; const isDelivery=o.fulfillment==='entrega';
 return `DOCE ENCANTO\n${'-'.repeat(32)}\n${kind==='production'?'VIA DA PRODUÇÃO':'VIA DO CLIENTE'}\nPEDIDO #${o.id}\n${isDelivery?'******** ENTREGA ********':'******* RETIRADA *******'}\n${'-'.repeat(32)}\nCliente: ${o.customerName}\nTelefone: ${o.customerPhone}\nPedido: ${o.created}\n${o.readyAt?'Pronto: '+o.readyAt+'\n':''}${isDelivery?`Endereço: ${addr.rua||''}, ${addr.numero||''}\nBairro: ${addr.bairro||o.deliveryRegion||''}\nCEP: ${addr.cep||''}\n`:''}${'-'.repeat(32)}\n${receiptItems(o)}\n${'-'.repeat(32)}\nSubtotal: ${BRL(o.subtotal)}\nFrete: ${BRL(o.freight)}\nTOTAL: ${BRL(o.total)}\nPagamento: ${o.paymentLabel||o.payment}\n${'-'.repeat(32)}\nObrigado pela preferência!`;
}
function printReceipt(id,mode='both'){
 const o=orders.find(x=>x.id===id); if(!o)return alert('Pedido não encontrado.');
 const parts=mode==='both'?[receiptText(o,'production'),receiptText(o,'client')]:[receiptText(o,mode)];
 const w=window.open('','_blank','width=420,height=700'); if(!w)return alert('Libere pop-ups para imprimir.');
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${escapeHtml(o.id)}</title><style>@page{size:${printPaperWidth}mm auto;margin:2mm}body{font-family:monospace;width:${printPaperWidth-4}mm;margin:0;font-size:11px}.ticket{white-space:pre-wrap;page-break-after:always}.ticket:last-child{page-break-after:auto}</style></head><body>${parts.map(t=>`<div class="ticket">${escapeHtml(t)}</div>`).join('')}<script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>`);w.document.close();
}
async function markReadyAndPrint(id){await setOrderStatusAndNotify(id,'Pronto','ready');setTimeout(()=>printReceipt(id,'both'),250);}
function renderZoneRows(){const q=normalizeText(deliveryZoneSearch);const rows=deliveryZonesDraft.filter(z=>!q||normalizeText(z.name).includes(q));if(!rows.length)return '<p class="emptyState">Nenhum bairro encontrado.</p>';return rows.map((z,i)=>`<div class="zoneRow" data-zone-id="${z.id||''}"><input data-zone-name="${i}" value="${escapeHtml(z.name)}" placeholder="Nome do bairro"><input data-zone-fee="${i}" type="number" min="0" step="0.50" value="${Number(z.fee).toFixed(2)}"><label><input data-zone-active="${i}" type="checkbox" ${z.active?'checked':''}> Ativo</label><button class="dangerBtn" data-zone-remove="${i}">Excluir</button></div>`).join('');}
function syncZoneDraftFromInputs(){$$('[data-zone-name]').forEach(i=>deliveryZonesDraft[+i.dataset.zoneName].name=i.value.trim());$$('[data-zone-fee]').forEach(i=>deliveryZonesDraft[+i.dataset.zoneFee].fee=Math.max(0,Number(i.value)||0));$$('[data-zone-active]').forEach(i=>deliveryZonesDraft[+i.dataset.zoneActive].active=i.checked);}
async function saveDeliveryZones(){syncZoneDraftFromInputs();const valid=deliveryZonesDraft.filter(z=>z.name.trim());const {error}=await supabaseClient.rpc('admin_save_delivery_zones',{p_zones:valid});if(error)throw error;await loadAdminSupabaseState();renderAdmin();alert('Taxas salvas e atualizadas para os clientes.');}
async function resetOfficialData(){const typed=prompt('Para apagar pedidos e movimentações de teste, digite ZERAR TESTES');if(typed!=='ZERAR TESTES')return alert('Limpeza cancelada.');if(!confirm('Confirma a limpeza? Produtos, estoque atual, usuários e taxas serão preservados.'))return;const {error}=await supabaseClient.rpc('admin_reset_test_data');if(error)throw error;cart=[];localStorage.removeItem(STORE+'orders');localStorage.removeItem(STORE+'stockMoves');await loadAdminSupabaseState();renderAdmin();alert('Pedidos, faturamento e movimentações foram zerados com segurança.');}
function zoneMapHtml(){return `<div class="mapBox"><iframe title="Mapa de bairros" src="https://www.openstreetmap.org/export/embed.html?bbox=-44.05%2C-20.02%2C-43.85%2C-19.82&amp;layer=mapnik" loading="lazy"></iframe><p><a href="https://www.openstreetmap.org/search?query=Belo%20Horizonte%20MG" target="_blank" rel="noopener">Abrir mapa e pesquisar localização</a></p><small>O mapa ajuda a localizar o bairro. O valor cobrado é sempre o cadastrado e salvo na tabela acima.</small></div>`;}

function renderAdmin(){
 const pending=orders.filter(o=>!orderIsDelivered(o)&&!orderIsCanceled(o)),history=orders.filter(o=>orderIsDelivered(o)||orderIsCanceled(o)),production=pending.filter(orderIsProduction),deliveredRevenue=orders.filter(orderIsDelivered).reduce((a,o)=>a+o.total,0),low=products.filter(p=>!p.unavailable&&p.stock<=p.min).length;
 $('#adminPanel').innerHTML=`<div class="adminHero"><div><p class="tag">Centro de Controle V54</p><h2>Área da Empresa</h2><p>Pedidos, estoque, financeiro mensal, impressão térmica e taxas de entrega online.</p></div><div class="adminTopActions">${supabaseStatusHtml()}<button id="toggleOrderAlarm" class="secondary">${newOrderAlarmEnabled?'🔔 Alarme ligado':'🔕 Ativar alarme'}</button><button id="adminBack" class="secondary">Voltar ao site</button><button id="adminLogout" class="ghost">Sair</button></div></div><div class="dashCards"><div><small>Pendentes</small><b>${pending.length}</b></div><div><small>Produção</small><b>${production.length}</b></div><div><small>Estoque baixo</small><b>${low}</b></div><div><small>Faturamento entregue</small><b>${BRL(deliveredRevenue)}</b></div></div><div class="adminTabs"><button class="active" data-tabbtn="pending">📌 Pendentes</button><button data-tabbtn="production">🏭 Produção</button><button data-tabbtn="history">📚 Histórico</button><button data-tabbtn="stock">📦 Estoque</button><button data-tabbtn="moves">🔁 Movimentações</button><button data-tabbtn="finance">💰 Financeiro mensal</button><button data-tabbtn="zones">🛵 Taxas</button><button data-tabbtn="settings">⚙️ Configurações</button></div>
 <div class="tabPanel active" data-tab="pending"><section class="adminCard wide"><h3>📌 Pedidos pendentes</h3><div class="ordersGrid">${renderPendingOrders(pending)}</div></section></div>
 <div class="tabPanel" data-tab="production"><section class="adminCard wide"><h3>🏭 Produção</h3><div class="productionBoard"><div><h4>🔴 Recebidos</h4>${renderProductionQueue(production.filter(o=>['recebido','pagamento confirmado'].includes(normalizeText(o.status))))}</div><div><h4>🟡 Em produção</h4>${renderProductionQueue(production.filter(o=>['producao','produção'].includes(normalizeText(o.status))))}</div><div><h4>🟢 Prontos / Saída</h4>${renderProductionQueue(production.filter(o=>['pronto','saiu para entrega','aguardando retirada'].includes(normalizeText(o.status))))}</div></div></section></div>
 <div class="tabPanel" data-tab="history"><section class="adminCard wide"><h3>📚 Histórico</h3>${renderHistory(history)}</section></div>
 <div class="tabPanel" data-tab="stock"><section class="adminCard wide"><h3>📦 Estoque inteligente</h3><div class="stockTable">${products.filter(p=>!p.unavailable).map(p=>{const [label,cls,act]=stockStatus(p);return `<div class="stockRow"><div><b>${p.emoji} ${p.name}</b><small>${act}</small></div><input data-stock="${p.id}" type="number" min="0" value="${p.stock}"><input data-min="${p.id}" type="number" min="0" value="${p.min}"><span class="pill ${cls}">${label}</span></div>`}).join('')}</div><button id="saveStock" class="primary full">Salvar estoque</button></section></div>
 <div class="tabPanel" data-tab="moves"><section class="adminCard wide"><h3>🔁 Movimentações</h3>${renderStockMoves()}</section></div>
 <div class="tabPanel" data-tab="finance"><section class="adminCard wide"><h3>💰 Faturamento por mês</h3><p class="helper">Somente pedidos marcados como Entregue entram no faturamento.</p>${monthlyFinanceHtml()}</section></div>
 <div class="tabPanel" data-tab="zones"><section class="adminCard wide"><h3>🛵 Taxas de entrega</h3><div class="zoneToolbar"><input id="zoneSearch" value="${escapeHtml(deliveryZoneSearch)}" placeholder="Pesquisar bairro"><button id="zoneAdd" class="secondary">+ Adicionar bairro</button></div><div id="zoneRows">${renderZoneRows()}</div><div class="zoneActions"><button id="zoneSave" class="primary">Salvar alterações</button><button id="zoneDiscard" class="ghost">Descartar alterações</button></div>${zoneMapHtml()}</section></div>
 <div class="tabPanel" data-tab="settings"><section class="adminCard wide"><h3>⚙️ Configurações</h3><label>Largura da mini impressora <select id="paperWidth"><option value="58" ${printPaperWidth===58?'selected':''}>58 mm</option><option value="80" ${printPaperWidth===80?'selected':''}>80 mm</option></select></label><hr><h4>Início oficial</h4><p>Apaga pedidos, faturamento e movimentações de teste. Mantém produtos, estoque atual, usuários e taxas.</p><button id="resetOfficial" class="dangerBtn">Zerar testes e iniciar oficialmente</button></section></div>`;
 $('#adminBack').onclick=()=>location.hash='home';$('#adminLogout').onclick=async()=>{await supabaseClient?.auth.signOut();currentAdmin=null;orders=[];stockMoves=[];$('#adminPanel').classList.add('hidden');$('.login').classList.remove('hidden')};
 $$('[data-tabbtn]').forEach(btn=>btn.onclick=()=>{$$('[data-tabbtn]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');$$('[data-tab]').forEach(p=>p.classList.toggle('active',p.dataset.tab===btn.dataset.tabbtn))});
 $('#saveStock')?.addEventListener('click',async()=>{try{for(const inp of $$('[data-stock]')){const id=inp.dataset.stock,minInp=$(`[data-min="${id}"]`);const {error}=await supabaseClient.rpc('admin_set_inventory',{p_flavor_id:id,p_stock:Math.max(0,Number(inp.value)||0),p_min_stock:Math.max(0,Number(minInp?.value)||0)});if(error)throw error}await loadPublicInventory();await loadAdminSupabaseState();renderAdmin();renderProducts();renderPromo();alert('Estoque salvo.')}catch(e){alert(e.message)}});
 $$('[data-status]').forEach(sel=>sel.onchange=()=>setOrderStatusAndNotify(sel.dataset.status,sel.value==='Aguardando pagamento'?'Recebido':sel.value));$$('[data-proof]').forEach(btn=>btn.onclick=()=>setOrderStatusAndNotify(btn.dataset.proof,'Pagamento confirmado','paid'));$$('[data-next]').forEach(btn=>btn.onclick=()=>{const o=orders.find(x=>x.id===btn.dataset.next);if(o)setOrderStatusAndNotify(o.id,nextProductionStatus(o.status,o.fulfillment))});$$('[data-ready]').forEach(btn=>btn.onclick=()=>markReadyAndPrint(btn.dataset.ready));$$('[data-delivery]').forEach(btn=>btn.onclick=()=>setOrderStatusAndNotify(btn.dataset.delivery,'Saiu para entrega','delivery'));$$('[data-delivered]').forEach(btn=>btn.onclick=()=>setOrderStatusAndNotify(btn.dataset.delivered,'Entregue','delivered'));$$('[data-chat]').forEach(btn=>btn.onclick=()=>{const o=orders.find(x=>x.id===btn.dataset.chat);if(o)openClientWhatsApp(o,'')});$$('[data-cancel]').forEach(btn=>btn.onclick=()=>{if(confirm('Cancelar e devolver o estoque?'))setOrderStatusAndNotify(btn.dataset.cancel,'Cancelado','canceled')});
 // add print buttons to each order card
 $$('.orderCard').forEach(card=>{const id=card.querySelector('[data-status]')?.dataset.status;if(id){const actions=card.querySelector('.orderActions');actions?.insertAdjacentHTML('beforeend',`<button class="ghost" data-print="${id}">🖨️ Reimprimir</button>`);}});$$('[data-print]').forEach(b=>b.onclick=()=>printReceipt(b.dataset.print,'both'));
 $('#zoneSearch')?.addEventListener('input',e=>{syncZoneDraftFromInputs();deliveryZoneSearch=e.target.value;$('#zoneRows').innerHTML=renderZoneRows();bindZoneButtons()});$('#zoneAdd')?.addEventListener('click',()=>{syncZoneDraftFromInputs();deliveryZonesDraft.push({id:null,name:'',fee:5,active:true,latitude:null,longitude:null});$('#zoneRows').innerHTML=renderZoneRows();bindZoneButtons();$('#zoneRows input:last-of-type')?.focus()});$('#zoneSave')?.addEventListener('click',()=>saveDeliveryZones().catch(e=>alert(e.message)));$('#zoneDiscard')?.addEventListener('click',()=>{deliveryZonesDraft=deliveryZones.map(x=>({...x}));deliveryZoneSearch='';renderAdmin()});bindZoneButtons();
 $('#toggleOrderAlarm')?.addEventListener('click',toggleNewOrderAlarm);$('#paperWidth')?.addEventListener('change',e=>{printPaperWidth=Number(e.target.value);localStorage.setItem(STORE+'paperWidth',String(printPaperWidth));alert('Tamanho salvo.')});$('#resetOfficial')?.addEventListener('click',()=>resetOfficialData().catch(e=>alert(e.message)));
}
function bindZoneButtons(){$$('[data-zone-remove]').forEach(b=>b.onclick=()=>{syncZoneDraftFromInputs();deliveryZonesDraft.splice(+b.dataset.zoneRemove,1);$('#zoneRows').innerHTML=renderZoneRows();bindZoneButtons()})}

// WebAuthn local: usa biometria do dispositivo; a senha do Supabase continua sendo a autenticação principal.
async function registerFaceId(){const u=($('#user')?.value||currentAdmin||'').trim(),p=($('#pass')?.value||'').trim();if(!ADMIN_USERS[u])return alert('Digite um usuário autorizado.');if(!window.isSecureContext||!window.PublicKeyCredential||!navigator.credentials)return alert('A biometria exige site HTTPS e navegador compatível.');if(!currentAdmin){const email=ADMIN_EMAILS[u];const {error}=await supabaseClient.auth.signInWithPassword({email,password:p});if(error)return alert('Usuário ou senha incorretos.');}
 const challenge=crypto.getRandomValues(new Uint8Array(32)),userId=new TextEncoder().encode(u.padEnd(16,'0').slice(0,32));try{const cred=await navigator.credentials.create({publicKey:{challenge,rp:{name:'Doce Encanto'},user:{id:userId,name:u,displayName:ADMIN_USERS[u].name},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000,attestation:'none'}});localStorage.setItem(faceKey(u),JSON.stringify({id:Array.from(new Uint8Array(cred.rawId))}));alert('Face ID/Windows Hello cadastrado neste aparelho.')}catch(e){alert('Não foi possível cadastrar: '+(e.message||e.name))}}
async function requireFaceId(u){const raw=localStorage.getItem(faceKey(u));if(!raw)return true;if(!window.isSecureContext||!navigator.credentials)return confirm('Biometria indisponível. Continuar somente com a senha?');try{const saved=JSON.parse(raw),challenge=crypto.getRandomValues(new Uint8Array(32));await navigator.credentials.get({publicKey:{challenge,allowCredentials:[{type:'public-key',id:new Uint8Array(saved.id)}],userVerification:'required',timeout:60000}});return true}catch(e){alert('Biometria não confirmada.');return false}}

init();
