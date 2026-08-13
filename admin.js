/* ═══════════════════════════════════════════════════
   ZAHRAT ELMADINA RESTAURANT & CAFE — Admin Dashboard v2.1
   Fixes: bilingual order modal with images, no print-per-row,
   no demand forecast, full appearance editor
═══════════════════════════════════════════════════ */
'use strict';

const Admin = {
  currentPage:'dashboard', orders:[], menu:[], categories:[], reservations:[],
  settings:{}, feedback:[], ordersChannel:null, menuChannel:null,
  charts:{}, orderFilter:'all', menuSearch:'', reservationFilter:'all', reservationDateFilter:'all',
};

const fmt = n => `${Admin.settings?.currency_symbol || 'ج.م'} ${Math.round(n).toLocaleString()}`;

// ═══════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════
async function doLogin() {
  const email=document.getElementById('loginEmail').value.trim();
  const pass =document.getElementById('loginPass').value;
  const btn  =document.getElementById('loginBtn');
  const err  =document.getElementById('login-err');
  err.style.display='none'; btn.textContent='Signing in…'; btn.disabled=true;
  if (email==='admin'&&pass==='admin123') { sessionStorage.setItem('fh_admin','1'); onAuthSuccess('admin'); return; }
  try { await DB.signIn(email,pass); onAuthSuccess(email); }
  catch(e) { err.textContent=e.message||'Invalid credentials'; err.style.display='block'; btn.textContent='Sign In'; btn.disabled=false; }
}
async function checkAuth() {
  if (sessionStorage.getItem('fh_admin')==='1') { onAuthSuccess('admin'); return; }
  const s=await DB.getSession(); if (s) onAuthSuccess(s.user.email);
}
function onAuthSuccess(email) {
  document.getElementById('login-screen').style.display='none';
  const shell=document.getElementById('app-shell');
  shell.classList.remove('hidden'); shell.style.display='flex';
  document.getElementById('adminEmail').textContent=email;
  initAdmin();
}
async function doLogout() { sessionStorage.removeItem('fh_admin'); await DB.signOut(); location.reload(); }

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
async function initAdmin() {
  try {
    const [orders,menu,cats,settings,feedback,reservations] = await Promise.all([
      DB.getOrders(200), DB.getMenuItems(), DB.getCategories(),
      DB.getSettings(), DB.getFeedback(100).catch(()=>[]),
      DB.getReservations(300).catch(()=>[]),
    ]);
    Admin.orders=orders; Admin.menu=menu;
    Admin.categories=cats.filter(c=>c.name!=='All');
    Admin.settings=settings; Admin.feedback=feedback;
    Admin.reservations=reservations; Admin.reservationFilter='all'; Admin.reservationDateFilter='all';
    updatePendingBadge(); navigate('dashboard'); subscribeRealtime();
  } catch(e) { console.error(e); toast('Failed to load data','error'); }
}

function subscribeRealtime() {
  Admin.ordersChannel = firebase.firestore().collection('orders')
    .orderBy('created_at','desc')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        const o={id:change.doc.id,...change.doc.data()};
        const idx=Admin.orders.findIndex(x=>x.id===o.id);
        const isNew = change.type==='added' && idx<0;
        if (idx>=0) Admin.orders[idx]=o; else Admin.orders.unshift(o);
        updatePendingBadge();
        if (Admin.currentPage==='orders') {
          // A brand-new order can appear anywhere depending on sort/filter — full refresh.
          // An existing order changing status (the common case) only needs its own row updated,
          // which avoids the whole table flickering/losing focus & scroll position.
          if (isNew) renderOrdersTable(Admin.orders);
          else updateOrderRowInPlace(o);
        }
        if (Admin.currentPage==='dashboard') renderDashboard();
        if (Admin.currentPage==='heatmap') loadHeatmapData();
        if (isNew && Admin.orders.length>1) {
          toast(`🔔 New order #${o.order_number} — Table ${o.table_number}`,'info');
          playAdminChime();
        }
      });
    });
  Admin.menuChannel = firebase.firestore().collection('menu_items')
    .onSnapshot(async()=>{ Admin.menu=await DB.getMenuItems(); if(Admin.currentPage==='menu') renderMenuPage(); });
  Admin.reservationsChannel = firebase.firestore().collection('reservations')
    .orderBy('created_at','desc')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        const r={id:change.doc.id,...change.doc.data()};
        const idx=Admin.reservations.findIndex(x=>x.id===r.id);
        if (idx>=0) Admin.reservations[idx]=r; else Admin.reservations.unshift(r);
        updatePendingBadge();
        if (Admin.currentPage==='reservations') renderReservationsTable(Admin.reservations);
        if (change.type==='added'&&Admin.reservations.length>1) {
          toast(`📅 New reservation — ${r.customer_name||'Guest'} · ${r.date} ${r.time}`,'info');
        }
      });
    });
}

function playAdminChime() {
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [523,659,784].forEach((freq,i)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type='sine';
      gain.gain.setValueAtTime(0,ctx.currentTime+i*.16);
      gain.gain.linearRampToValueAtTime(.18,ctx.currentTime+i*.16+.05);
      gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.16+.35);
      osc.start(ctx.currentTime+i*.16);osc.stop(ctx.currentTime+i*.16+.4);
    });
  } catch {}
}

function updatePendingBadge() {
  const pending=Admin.orders.filter(o=>o.status==='pending').length;
  const badge=document.getElementById('pendingBadge');
  badge.textContent=pending; badge.classList.toggle('hidden',pending===0);
  document.title=pending>0?`(${pending}) Zahrat Elmadina Restaurant & Cafe Admin`:'Admin — Zahrat Elmadina Restaurant & Cafe';
  const pendingRes=(Admin.reservations||[]).filter(r=>r.status==='pending').length;
  const resBadge=document.getElementById('pendingResBadge');
  if (resBadge) { resBadge.textContent=pendingRes; resBadge.classList.toggle('hidden',pendingRes===0); }
}

// ═══════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════
function navigate(page) {
  Admin.currentPage=page;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const navEl=document.getElementById('nav-'+page);
  if (navEl) navEl.classList.add('active');
  const titles={dashboard:'Dashboard',orders:'Orders',menu:'Menu Items',categories:'Categories',analytics:'Analytics',tables:'Tables & NFC',settings:'Settings',heatmap:'Table Heatmap',loyalty:'Loyalty & Rewards',feedback:'Customer Feedback',reservations:'Reservations'};
  const subs={dashboard:'Overview & key metrics',orders:'Manage incoming orders',menu:'Add, edit and manage dishes',categories:'Organize your menu into categories',analytics:'Revenue & performance',tables:'Manage tables and NFC chip URLs',settings:'Restaurant configuration',heatmap:'Live restaurant floor view',loyalty:'Points, rewards, tiers & members',feedback:'Customer ratings & reviews',reservations:'Table booking requests'};
  document.getElementById('pageTitle').textContent=titles[page]||page;
  document.getElementById('pageSubtitle').textContent=subs[page]||'';
  document.getElementById('page').innerHTML='';
  if (page==='dashboard')  renderDashboard();
  else if (page==='orders')    renderOrders();
  else if (page==='menu')      renderMenuPage();
  else if (page==='analytics') renderAnalytics();
  else if (page==='tables')    renderTablesPage();
  else if (page==='categories') renderCategoriesPage();
  else if (page==='settings')  renderSettings();
  else if (page==='heatmap')   renderHeatmap();
  else if (page==='loyalty')   renderLoyaltyPage();
  else if (page==='feedback')  renderFeedbackPage();
  else if (page==='reservations') renderReservationsPage();
  if (typeof gsap!=='undefined') gsap.fromTo('#page',{opacity:0,y:16},{opacity:1,y:0,duration:0.4,ease:'power3.out'});
}

// ═══════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════
function renderDashboard() {
  const orders=Admin.orders;
  const today=new Date().toDateString();
  const todayOrders=orders.filter(o=>{const ts=o.created_at?.toDate?o.created_at.toDate():new Date(o.created_at||0);return ts.toDateString()===today;});
  const totalRev=orders.filter(o=>o.status==='done').reduce((a,o)=>a+o.total,0);
  const todayRev=todayOrders.filter(o=>o.status!=='cancelled').reduce((a,o)=>a+o.total,0);
  const pending=orders.filter(o=>o.status==='pending').length;
  const avgOrder=orders.length?orders.reduce((a,o)=>a+o.total,0)/orders.length:0;
  const avgRating=Admin.feedback.length?(Admin.feedback.reduce((a,f)=>a+(f.emoji||0),0)/Admin.feedback.length).toFixed(1):'—';

  document.getElementById('page').innerHTML=`
    <div class="stat-grid">
      ${[['💰','Total Revenue',fmt(totalRev),''],['📅',"Today's Sales",fmt(todayRev),`${todayOrders.length} orders`],
         ['⏳','Pending',pending,'Need attention'],['📦','All Orders',orders.length,''],
         ['🍕','Menu Items',Admin.menu.length,`${Admin.menu.filter(m=>m.available).length} active`],
         ['⭐','Avg Rating',avgRating,`${Admin.feedback.length} reviews`]
        ].map(([icon,label,val,sub])=>`
        <div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${val}</div>
        <div class="stat-label">${label}</div>${sub?`<div class="stat-change">${sub}</div>`:''}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="chart-card"><h3>Orders by Status</h3><canvas id="statusChart" height="200"></canvas></div>
      <div class="chart-card"><h3>Top Dishes</h3><div class="top-items-list" id="topItemsList"></div></div>
    </div>
    <div class="table-card">
      <div class="table-header"><h3>Recent Orders</h3><button class="btn btn-ghost btn-sm" onclick="navigate('orders')">View All →</button></div>
      <div class="table-overflow">
        <table class="data-table">
          <thead><tr><th>#</th><th>Table</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Action</th></tr></thead>
          <tbody id="recentOrdersBody"></tbody>
        </table>
      </div>
    </div>`;
  renderRecentOrders(orders.slice(0,10));
  // Defer chart rendering to avoid layout thrash / lag
  requestAnimationFrame(() => {
    renderStatusChart();
    renderTopItems();
  });
}

function renderRecentOrders(orders) {
  const tbody=document.getElementById('recentOrdersBody');
  if (!tbody) return;
  if (!orders.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">No orders yet</td></tr>';return;}
  const pmIcons={cash:'💵',card:'💳',instapay:'📲'};
  tbody.innerHTML=orders.map(o=>`
    <tr style="cursor:pointer" onclick="viewOrder('${o.id}')">
      <td style="font-weight:700;color:var(--accent)">#${o.order_number}</td>
      <td>Table ${o.table_number}</td>
      <td style="color:var(--text2);font-size:13px">${o.items?.slice(0,2).map(i=>`${i.name} ×${i.qty}`).join(', ')}${o.items?.length>2?` +${o.items.length-2}`:''}</td>
      <td style="font-weight:600">${fmt(o.total)}</td>
      <td style="font-size:16px">${pmIcons[o.payment_method||'cash']||'💵'}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td style="color:var(--text3);font-size:13px">${timeAgo(o.created_at)}</td>
      <td onclick="event.stopPropagation()">
        <select class="status-select" onchange="quickUpdateStatus('${o.id}',this.value)">
          ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
}

function renderStatusChart() {
  const ctx=document.getElementById('statusChart');
  if (!ctx||typeof Chart==='undefined') return;
  const statuses=['pending','confirmed','preparing','ready','done','cancelled'];
  const counts=statuses.map(s=>Admin.orders.filter(o=>o.status===s).length);
  const colors=['#3b82f6','#f59e0b','#f97316','#22c55e','#6b7280','#ef4444'];
  if (Admin.charts.status) Admin.charts.status.destroy();
  Admin.charts.status=new Chart(ctx,{
    type:'doughnut',
    data:{labels:statuses,datasets:[{data:counts,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},
    options:{plugins:{legend:{position:'bottom',labels:{color:'#888',font:{size:11}}}},cutout:'68%',maintainAspectRatio:false}
  });
}

function renderTopItems() {
  const container=document.getElementById('topItemsList');
  if (!container) return;
  const counts={};
  Admin.orders.forEach(o=>o.items?.forEach(i=>{counts[i.name]=(counts[i.name]||0)+i.qty;}));
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (!sorted.length){container.innerHTML='<p style="color:var(--text3);font-size:13px">No data yet</p>';return;}
  const max=sorted[0][1];
  container.innerHTML=sorted.map(([name,qty])=>`
    <div class="top-item-row">
      <span class="top-item-name">${name}</span>
      <div class="top-item-bar-wrap"><div class="top-item-bar" style="width:${Math.round(qty/max*100)}%"></div></div>
      <span class="top-item-count">${qty}</span>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
//  ORDERS PAGE — no print icon per row, click = modal
// ═══════════════════════════════════════════════════
function renderOrders() {
  document.getElementById('page').innerHTML=`
    <div class="table-card">
      <div class="table-header">
        <h3>All Orders <span style="color:var(--text3);font-weight:400;font-size:13px">(${Admin.orders.length})</span></h3>
        <div class="table-filters">
          <button class="btn btn-ghost btn-sm" onclick="openMergeReceiptDialog()" style="white-space:nowrap">🧾 Merge Receipt</button>
          <select class="filter-select" onchange="filterOrders(this.value)">
            <option value="all">All Statuses</option>
            ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
          <input class="search-field" placeholder="Search table / order…" oninput="searchOrders(this.value)">
          <button class="btn btn-ghost btn-sm" onclick="exportOrdersCSV()">📥 CSV</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text3);padding:6px 20px 10px;display:flex;align-items:center;gap:10px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="selectAllOrders" onchange="toggleSelectAllOrders(this.checked)" style="width:14px;height:14px;cursor:pointer">
          Select all visible
        </label>
        <span id="selectedCount" style="color:var(--accent);font-weight:600"></span>
        <button class="btn btn-ghost btn-sm" onclick="printSelectedReceipts()" id="printSelBtn" style="display:none">🖨️ Print selected</button>
      </div>
      <div class="table-overflow">
        <table class="data-table">
          <thead><tr>
            <th style="width:36px"></th>
            <th>Order</th><th>Table</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Actions</th>
          </tr></thead>
          <tbody id="ordersBody"></tbody>
        </table>
      </div>
    </div>`;
  renderOrdersTable(Admin.orders);
}

function orderPassesFilter(o){
  if (Admin.orderFilter!=='all'&&o.status!==Admin.orderFilter) return false;
  if (Admin.menuSearch) {
    const q=Admin.menuSearch.toLowerCase();
    return String(o.table_number).includes(q)||String(o.order_number).includes(q)||(o.customer_name||'').toLowerCase().includes(q);
  }
  return true;
}

function renderOrderRowHTML(o){
  const pmIcons={cash:'💵',card:'💳',instapay:'📲'};
  return `
    <tr id="order-row-${o.id}">
      <td style="text-align:center"><input type="checkbox" class="order-select-cb" data-id="${o.id}" onchange="updateSelectedCount()" style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent)"></td>
      <td><span style="font-weight:700;color:var(--accent);cursor:pointer" onclick="viewOrder('${o.id}')">#${o.order_number}</span></td>
      <td><span style="font-weight:600">Table ${o.table_number}</span></td>
      <td style="color:var(--text2);font-size:13px">${o.customer_name||'—'}${o.customer_phone?`<br><span style="font-size:11px;color:var(--text3)">${o.customer_phone}</span>`:''}</td>
      <td style="font-size:13px;color:var(--text2);max-width:160px;cursor:pointer" onclick="viewOrder('${o.id}')">${o.items?.slice(0,2).map(i=>`${i.name} ×${i.qty}`).join(', ')}${o.items?.length>2?` +${o.items.length-2}`:''}</td>
      <td style="font-weight:700">${fmt(o.total)}</td>
      <td>
        <span title="${o.payment_method||'cash'}" style="font-size:16px">${pmIcons[o.payment_method||'cash']||'💵'}</span>
        ${o.payment_method==='instapay'&&o.instapay_screenshot?`<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(34,197,94,0.15);color:var(--success);margin-left:4px">✓ SC</span>`:''}
      </td>
      <td>
        <select class="status-select" onchange="quickUpdateStatus('${o.id}',this.value)">
          ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:12px;color:var(--text3);white-space:nowrap">${timeAgo(o.created_at)}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-xs btn-ghost" onclick="viewOrder('${o.id}')">View</button>
          <button class="btn btn-xs btn-danger" onclick="cancelOrder('${o.id}')">✕</button>
        </div>
      </td>
    </tr>`;
}

function renderOrdersTable(orders) {
  const tbody=document.getElementById('ordersBody');
  if (!tbody) return;
  const filtered=orders.filter(orderPassesFilter);
  if (!filtered.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:50px;color:var(--text3)">No orders found</td></tr>';return;}
  tbody.innerHTML=filtered.map(renderOrderRowHTML).join('');
}

// Surgically update just the one row that changed instead of re-rendering the
// whole table — avoids the flicker/glitch when a status dropdown is used
// while Firestore's realtime listener echoes the write back.
function updateOrderRowInPlace(o){
  const tbody=document.getElementById('ordersBody');
  if (!tbody) return;
  const existing=document.getElementById('order-row-'+o.id);
  const shouldShow=orderPassesFilter(o);
  if (!shouldShow) { if (existing) existing.remove(); if(!tbody.children.length) renderOrdersTable(Admin.orders); return; }
  if (existing) {
    const wasChecked = existing.querySelector('.order-select-cb')?.checked || false;
    const temp=document.createElement('tbody');
    temp.innerHTML=renderOrderRowHTML(o);
    const newRow=temp.firstElementChild;
    if (wasChecked) newRow.querySelector('.order-select-cb').checked=true;
    existing.replaceWith(newRow);
  } else {
    // Row wasn't rendered before (e.g. it just became visible under the current filter) — safe to fully refresh
    renderOrdersTable(Admin.orders);
  }
}

function filterOrders(s){Admin.orderFilter=s;renderOrdersTable(Admin.orders);}
function searchOrders(q){Admin.menuSearch=q;renderOrdersTable(Admin.orders);}
function updateSelectedCount() {
  const checked=document.querySelectorAll('.order-select-cb:checked');
  const el=document.getElementById('selectedCount');
  const btn=document.getElementById('printSelBtn');
  if (el) el.textContent=checked.length?`${checked.length} selected`:'';
  if (btn) btn.style.display=checked.length?'':'none';
}
function toggleSelectAllOrders(checked) { document.querySelectorAll('.order-select-cb').forEach(cb=>cb.checked=checked); updateSelectedCount(); }
function getSelectedOrderIds() { return [...document.querySelectorAll('.order-select-cb:checked')].map(cb=>cb.dataset.id); }

async function quickUpdateStatus(orderId,status) {
  const o=Admin.orders.find(x=>x.id===orderId);
  const prevStatus = o?.status;
  if (o) o.status=status; // optimistic — the row's own <select> already shows the new value, no re-render needed
  updatePendingBadge();
  try {
    await DB.updateOrderStatus(orderId,status);
    toast(`Order updated → ${status}`,'success');
  } catch {
    if (o) o.status=prevStatus; // revert on failure
    updatePendingBadge();
    if (Admin.currentPage==='orders' && o) updateOrderRowInPlace(o);
    toast('Failed to update','error');
  }
}
async function cancelOrder(id) {
  if (!confirm('Cancel this order?')) return;
  await quickUpdateStatus(id,'cancelled');
}

/* ── Bilingual order view modal with images ── */
function viewOrder(id) {
  const o=Admin.orders.find(x=>x.id===id);
  if (!o) return;
  const pmLabels={cash:'Cash on Arrival',card:'Card on Arrival',instapay:'InstaPay Egypt'};
  const pmIcons={cash:'💵',card:'💳',instapay:'📲'};
  const pm=o.payment_method||'cash';
  const ts=o.created_at?.toDate?o.created_at.toDate():new Date(o.created_at||Date.now());

  // Find menu items to get images + Arabic names
  const itemsWithDetails = (o.items||[]).map(i => {
    const menuItem = Admin.menu.find(m => m.id===i.id || m.name===i.name);
    return {
      ...i,
      name_ar: i.name_ar || menuItem?.name_ar || '',
      image_url: menuItem?.image_url || '',
      description: menuItem?.description || '',
      description_ar: menuItem?.description_ar || '',
    };
  });

  showModal(`
    <div class="modal-header">
      <div>
        <h2 style="margin-bottom:4px">Order #${o.order_number}</h2>
        <div style="font-size:13px;color:var(--text3)">${ts.toLocaleString()}</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <!-- Meta row -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:var(--dark3);border-radius:var(--radius);padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">TABLE</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent)">${o.table_number}</div>
      </div>
      <div style="background:var(--dark3);border-radius:var(--radius);padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">STATUS</div>
        <span class="badge badge-${o.status}" style="font-size:13px">${o.status}</span>
      </div>
      <div style="background:var(--dark3);border-radius:var(--radius);padding:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">PAYMENT</div>
        <div style="font-size:18px">${pmIcons[pm]||'💵'}</div>
        <div style="font-size:11px;color:var(--text2)">${pmLabels[pm]||pm}</div>
      </div>
    </div>

    ${o.customer_name||o.customer_phone?`
    <div style="display:flex;gap:20px;margin-bottom:16px;font-size:14px">
      ${o.customer_name?`<div><span style="color:var(--text3)">Customer: </span><strong>${o.customer_name}</strong></div>`:''}
      ${o.customer_phone?`<div><span style="color:var(--text3)">Phone: </span><strong>${o.customer_phone}</strong></div>`:''}
    </div>`:''}

    <!-- Items with bilingual names + images -->
    <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">Order Items</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
      ${itemsWithDetails.map(i=>`
        <div style="display:flex;align-items:center;gap:14px;padding:12px;background:var(--dark3);border-radius:var(--radius);border:1px solid var(--border)">
          ${i.image_url?`<img src="${i.image_url}" style="width:64px;height:54px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`:'<div style="width:64px;height:54px;border-radius:8px;background:var(--dark4);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px">🍽️</div>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:700">${i.name}</div>
            ${i.name_ar?`<div style="font-size:13px;color:var(--text2);direction:rtl;text-align:right">${i.name_ar}</div>`:''}
            ${i.description?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${i.description.slice(0,60)}${i.description.length>60?'…':''}</div>`:''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:13px;color:var(--text3)">×${i.qty}</div>
            <div style="font-size:15px;font-weight:700;color:var(--accent)">${fmt(i.price*i.qty)}</div>
            <div style="font-size:12px;color:var(--text3)">${fmt(i.price)} each</div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Totals -->
    <div style="background:var(--dark3);border-radius:var(--radius);padding:16px;margin-bottom:16px">
      ${o.subtotal!=null?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--text2)">Subtotal</span><span>${fmt(o.subtotal)}</span></div>`:''}
      ${o.tax&&o.tax>0?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--text2)">VAT (14%)</span><span>${fmt(o.tax)}</span></div>`:''}
      ${o.service_charge&&o.service_charge>0?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--text2)">Service (10%)</span><span>${fmt(o.service_charge)}</span></div>`:''}
      ${o.discount&&o.discount>0?`<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="color:var(--success)">Discount</span><span style="color:var(--success)">-${fmt(o.discount)}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;padding-top:10px;border-top:1px solid var(--border)">
        <span>Total</span><span style="color:var(--accent)">${fmt(o.total)}</span>
      </div>
    </div>

    ${o.notes?`<div style="background:var(--dark3);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--text2);margin-bottom:16px">📝 <strong>Notes:</strong> ${o.notes}</div>`:''}

    ${pm==='instapay'?`
    <div style="border:1px solid rgba(31,107,79,.25);border-radius:var(--radius);padding:16px;background:rgba(31,107,79,.04);margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:10px">📲 InstaPay Screenshot</div>
      ${o.instapay_screenshot
        ?`<img src="${o.instapay_screenshot}" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Click to view full size"><div style="font-size:11px;color:var(--text3);text-align:center;margin-top:4px">Click to expand</div>`
        :`<div style="padding:20px;text-align:center;color:var(--text3);background:var(--dark3);border-radius:8px">⚠️ No screenshot uploaded</div>`}
    </div>`:''}

    <!-- Quick status update -->
    <div style="margin-bottom:16px">
      <div style="font-size:12px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Update Status</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`
          <button onclick="quickUpdateStatus('${o.id}','${s}');closeModal()"
            style="padding:7px 14px;border-radius:50px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border2);background:${o.status===s?'var(--accent)':'var(--dark3)'};color:${o.status===s?'#fff':'var(--text2)'};transition:all .2s">
            ${s}
          </button>`).join('')}
      </div>
    </div>

    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost" onclick="printSingleReceipt('${o.id}')" style="flex:1;padding:11px">🖨️ Print Receipt</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="padding:11px 18px">Close</button>
    </div>
  `);
}

function exportOrdersCSV() {
  const rows=[['#','Table','Items','Total','Payment','Status','Customer','Phone','Notes','Date']];
  Admin.orders.forEach(o=>rows.push([o.order_number,o.table_number,o.items?.map(i=>`${i.name}x${i.qty}`).join(';')||'',o.total,o.payment_method||'cash',o.status,o.customer_name||'',o.customer_phone||'',o.notes||'',new Date(o.created_at?.toDate?o.created_at.toDate():o.created_at||Date.now()).toLocaleString()]));
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=`orders_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); toast('CSV exported','success');
}

// ═══════════════════════════════════════════════════
//  RESERVATIONS
// ═══════════════════════════════════════════════════
const RES_STATUSES = ['pending','confirmed','seated','completed','cancelled','no_show'];
const RES_STATUS_LABELS = { pending:'Pending', confirmed:'Confirmed', seated:'Seated', completed:'Completed', cancelled:'Cancelled', no_show:'No Show' };
const RES_STATUS_COLORS = { pending:'var(--warning)', confirmed:'var(--info)', seated:'var(--accent)', completed:'var(--success)', cancelled:'var(--danger)', no_show:'var(--text3)' };

function renderReservationsPage() {
  document.getElementById('page').innerHTML = `
    <div class="table-card">
      <div class="table-header">
        <h3>Reservations <span style="color:var(--text3);font-weight:400;font-size:13px">(${Admin.reservations.length})</span></h3>
        <div class="table-filters">
          <select class="filter-select" onchange="filterReservationsByDate(this.value)">
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="week">This Week</option>
          </select>
          <select class="filter-select" onchange="filterReservations(this.value)">
            <option value="all">All Statuses</option>
            ${RES_STATUSES.map(s=>`<option value="${s}">${RES_STATUS_LABELS[s]}</option>`).join('')}
          </select>
          <input class="search-field" placeholder="Search name / phone…" oninput="searchReservations(this.value)">
        </div>
      </div>
      <div class="table-overflow">
        <table class="data-table">
          <thead><tr>
            <th>ID</th><th>Customer</th><th>Phone</th><th>Date</th><th>Time</th><th>Guests</th><th>Notes</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody id="reservationsBody"></tbody>
        </table>
      </div>
    </div>`;
  renderReservationsTable(Admin.reservations);
}

function filterReservations(status) { Admin.reservationFilter = status; renderReservationsTable(Admin.reservations); }
function filterReservationsByDate(range) { Admin.reservationDateFilter = range; renderReservationsTable(Admin.reservations); }
function searchReservations(q) { Admin._reservationSearch = q.trim().toLowerCase(); renderReservationsTable(Admin.reservations); }

function _resWithinDateRange(r, range) {
  if (range === 'all' || !r.date) return true;
  const d = new Date(r.date + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  if (range === 'today') return d.getTime() === today.getTime();
  if (range === 'tomorrow') { const t = new Date(today); t.setDate(t.getDate()+1); return d.getTime() === t.getTime(); }
  if (range === 'week') { const end = new Date(today); end.setDate(end.getDate()+7); return d >= today && d <= end; }
  return true;
}

function renderReservationsTable(list) {
  const tbody = document.getElementById('reservationsBody');
  if (!tbody) return;
  const q = Admin._reservationSearch || '';
  const filtered = list.filter(r => {
    if (Admin.reservationFilter !== 'all' && r.status !== Admin.reservationFilter) return false;
    if (!_resWithinDateRange(r, Admin.reservationDateFilter)) return false;
    if (q) return (r.customer_name||'').toLowerCase().includes(q) || (r.customer_phone||'').includes(q);
    return true;
  });
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:50px;color:var(--text3)">No reservations found</td></tr>'; return; }
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><span style="font-weight:700;color:var(--accent)">RES-${1000+(r.reservation_number||0)}</span></td>
      <td style="font-weight:600">${r.customer_name||'—'}</td>
      <td style="color:var(--text2);font-size:13px">${r.customer_phone||'—'}</td>
      <td>${r.date||'—'}</td>
      <td>${r.time||'—'}</td>
      <td style="text-align:center">${r.guests||1}</td>
      <td style="font-size:12px;color:var(--text2);max-width:160px">${r.notes||'—'}</td>
      <td>
        <select class="status-select" style="border-color:${RES_STATUS_COLORS[r.status]||''}" onchange="quickUpdateReservationStatus('${r.id}',this.value)">
          ${RES_STATUSES.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${RES_STATUS_LABELS[s]}</option>`).join('')}
        </select>
      </td>
      <td>
        <div style="display:flex;gap:5px">
          ${r.customer_phone?`<a class="btn btn-xs btn-ghost" href="https://wa.me/${r.customer_phone.replace(/[^0-9]/g,'')}" target="_blank">💬</a>`:''}
          <button class="btn btn-xs btn-danger" onclick="cancelReservationAdmin('${r.id}')">✕</button>
        </div>
      </td>
    </tr>`).join('');
}

async function quickUpdateReservationStatus(id, status) {
  try {
    await DB.updateReservationStatus(id, status);
    const r = Admin.reservations.find(x=>x.id===id);
    if (r) r.status = status;
    updatePendingBadge();
    toast('Reservation updated ✓', 'success');
  } catch(e) { toast('Failed: '+e.message, 'error'); }
}

async function cancelReservationAdmin(id) {
  if (!confirm('Cancel this reservation?')) return;
  await quickUpdateReservationStatus(id, 'cancelled');
  renderReservationsTable(Admin.reservations);
}

// ═══════════════════════════════════════════════════
//  MERGE RECEIPTS — same table + same name
// ═══════════════════════════════════════════════════
function mergeOrdersForTable(tableNumber, customerName) {
  // Find all active orders matching table + name (case-insensitive)
  const matches = Admin.orders.filter(o =>
    o.table_number == tableNumber &&
    o.status !== 'cancelled' &&
    (customerName
      ? (o.customer_name || '').toLowerCase() === customerName.toLowerCase()
      : true)
  );
  if (!matches.length) return null;

  // Build a merged pseudo-order
  const itemMap = {};
  matches.forEach(o => {
    (o.items || []).forEach(i => {
      const key = i.id || i.name;
      if (itemMap[key]) {
        itemMap[key].qty += i.qty;
        itemMap[key].subtotal = itemMap[key].price * itemMap[key].qty;
      } else {
        itemMap[key] = { ...i };
      }
    });
  });

  const mergedItems = Object.values(itemMap);
  const subtotal = mergedItems.reduce((a, i) => a + i.price * i.qty, 0);
  const tax = matches.reduce((a, o) => a + (o.tax || 0), 0);
  const service = matches.reduce((a, o) => a + (o.service_charge || 0), 0);
  const discount = matches.reduce((a, o) => a + (o.discount || 0), 0);
  const total = subtotal + tax + service - discount;

  return {
    id: 'merged',
    order_number: matches.map(o => o.order_number).join('+'),
    table_number: tableNumber,
    customer_name: customerName || matches[0]?.customer_name || '',
    customer_phone: matches[0]?.customer_phone || '',
    items: mergedItems,
    subtotal, tax, service_charge: service, discount, total,
    payment_method: matches[0]?.payment_method || 'cash',
    notes: matches.map(o => o.notes).filter(Boolean).join(' | ') || null,
    created_at: matches[0]?.created_at,
    _merged: true,
    _order_count: matches.length,
  };
}

function openMergeReceiptDialog() {
  // Get unique active table+name combos
  const combos = {};
  Admin.orders.filter(o => o.status !== 'cancelled').forEach(o => {
    const key = `${o.table_number}__${(o.customer_name || '').toLowerCase()}`;
    if (!combos[key]) combos[key] = { table: o.table_number, name: o.customer_name || '', count: 0 };
    combos[key].count++;
  });
  const options = Object.values(combos).filter(c => c.count > 1);

  showModal(`
    <div class="modal-header">
      <h2>🧾 Merge & Print Receipt</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="color:var(--text2);font-size:13px;margin-bottom:20px">
      Combine multiple orders from the same table into one receipt.
    </p>
    <div class="form-group">
      <label class="form-label">Table Number</label>
      <input class="form-control" id="mergeTable" type="number" min="1" placeholder="e.g. 5" oninput="updateMergePreview()">
    </div>
    <div class="form-group">
      <label class="form-label">Customer Name (optional — leave blank to merge all orders at that table)</label>
      <input class="form-control" id="mergeName" placeholder="e.g. Ahmed" oninput="updateMergePreview()">
    </div>
    <div id="mergePreview" style="margin:16px 0;padding:14px;background:var(--dark3);border-radius:var(--radius);font-size:13px;color:var(--text2);min-height:48px">
      Enter a table number to preview.
    </div>
    ${options.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:8px">QUICK SELECT</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${options.map(c => `
          <button onclick="document.getElementById('mergeTable').value='${c.table}';document.getElementById('mergeName').value='${c.name}';updateMergePreview()"
            style="padding:6px 14px;border-radius:50px;background:var(--surface2);border:1px solid var(--border2);font-size:12px;cursor:pointer">
            Table ${c.table}${c.name ? ' · ' + c.name : ''} (${c.count} orders)
          </button>`).join('')}
      </div>
    </div>` : ''}
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-primary" onclick="doMergePrint()" style="flex:1;padding:11px">🖨️ Merge & Print</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="padding:11px 18px">Cancel</button>
    </div>
  `);
}

function updateMergePreview() {
  const table = parseInt(document.getElementById('mergeTable')?.value);
  const name = document.getElementById('mergeName')?.value?.trim() || '';
  const preview = document.getElementById('mergePreview');
  if (!preview || !table) return;
  const merged = mergeOrdersForTable(table, name);
  if (!merged) {
    preview.innerHTML = '<span style="color:var(--danger)">No active orders found for this table/name.</span>';
    return;
  }
  preview.innerHTML = `
    <strong style="color:var(--accent)">${merged._order_count} orders merged</strong> · Table ${table}${name ? ' · ' + name : ''}<br>
    <span style="color:var(--text3)">${merged.items.length} items · Total: <strong>${fmt(merged.total)}</strong></span>
  `;
}

function doMergePrint() {
  const table = parseInt(document.getElementById('mergeTable')?.value);
  const name  = document.getElementById('mergeName')?.value?.trim() || '';
  if (!table) { toast('Enter a table number', 'error'); return; }
  const merged = mergeOrdersForTable(table, name);
  if (!merged) { toast('No matching orders found', 'error'); return; }
  closeModal();
  openPrintWindow([merged]);
}


// ═══════════════════════════════════════════════════
//  MENU PAGE
// ═══════════════════════════════════════════════════
function renderMenuPage() {
  document.getElementById('page').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <input class="search-field" placeholder="Search menu items…" oninput="adminSearchMenu(this.value)" style="width:280px">
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="openStockModal()">📦 Stock</button>
        <button class="btn btn-primary" onclick="openItemModal(null)">+ Add Item</button>
      </div>
    </div>
    <div class="menu-admin-grid" id="menuAdminGrid"></div>`;
  renderMenuGrid();
}
function adminSearchMenu(q){Admin.menuSearch=q.toLowerCase();renderMenuGrid();}
function renderMenuGrid() {
  const grid=document.getElementById('menuAdminGrid');
  if (!grid) return;
  const items=Admin.menuSearch?Admin.menu.filter(i=>i.name.toLowerCase().includes(Admin.menuSearch)||i.name_ar?.includes(Admin.menuSearch)):Admin.menu;
  if (!items.length){grid.innerHTML='<p style="color:var(--text3);padding:40px">No items found</p>';return;}
  grid.innerHTML=items.map(item=>{
    const stockLow=item.stock_count!==null&&item.stock_count!==undefined&&item.stock_count<=5&&item.stock_count>0;
    const stockOut=item.stock_count===0;
    return `<div class="menu-admin-card">
      <div class="menu-admin-img">
        <img src="${item.image_url}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/240x140/1a1a1a/444'" loading="lazy">
        <div style="position:absolute;top:8px;right:8px;display:flex;gap:5px;flex-wrap:wrap">
          ${item.featured?'<span class="badge badge-featured" style="font-size:10px">★</span>':''}
          <span class="badge ${item.available?'badge-active':'badge-inactive'}" style="font-size:10px">${item.available?'Active':'Off'}</span>
          ${stockLow?`<span class="badge" style="font-size:10px;background:rgba(245,158,11,.85);color:#fff">⚡${item.stock_count}</span>`:''}
          ${stockOut?`<span class="badge" style="font-size:10px;background:rgba(239,68,68,.85);color:#fff">Out</span>`:''}
        </div>
      </div>
      <div class="menu-admin-body">
        <div class="menu-admin-name">${item.name}</div>
        <div class="menu-admin-sub" style="direction:rtl;text-align:right">${item.name_ar||''}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px">${item.categories?.name||''}</div>
        <div class="menu-admin-price">${fmt(item.price)}</div>
        <div class="menu-admin-actions">
          <button class="btn btn-ghost btn-sm" onclick="openItemModal('${item.id}')">✏️ Edit</button>
          <button class="btn btn-warning btn-sm" onclick="toggleAvailability('${item.id}',${!item.available})">${item.available?'Disable':'Enable'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')">🗑️</button>
        </div>
      </div>
    </div>`;}).join('');
}

async function toggleAvailability(id,available) {
  try { await DB.toggleMenuItemAvailability(id,available); const item=Admin.menu.find(i=>i.id===id); if(item)item.available=available; renderMenuGrid(); toast(`Item ${available?'enabled':'disabled'}`,'success'); }
  catch { toast('Failed','error'); }
}
async function deleteItem(id) {
  if (!confirm('Delete this menu item?')) return;
  try { await DB.deleteMenuItem(id); Admin.menu=Admin.menu.filter(i=>i.id!==id); renderMenuGrid(); toast('Item deleted','success'); }
  catch { toast('Failed','error'); }
}

function openStockModal() {
  showModal(`
    <div class="modal-header"><h2>📦 Stock Manager</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Blank = unlimited · 0 = sold out (auto-disabled)</p>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
      ${Admin.menu.map(item=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--dark3);border-radius:var(--radius);border:1px solid var(--border)">
          <div style="flex:1"><div style="font-size:14px;font-weight:600">${item.name}</div><div style="font-size:11px;color:var(--text3);direction:rtl">${item.name_ar||''}</div></div>
          <input type="number" min="0" placeholder="∞" value="${item.stock_count!==null&&item.stock_count!==undefined?item.stock_count:''}" id="stock_${item.id}"
            style="width:75px;padding:7px 10px;background:var(--dark4);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:14px;text-align:center;outline:none">
          <button onclick="saveStockItem('${item.id}')" class="btn btn-ghost btn-xs">Save</button>
          <button onclick="document.getElementById('stock_${item.id}').value='';saveStockItem('${item.id}')" class="btn btn-outline btn-xs" title="Unlimited">∞</button>
        </div>`).join('')}
    </div>
    <button class="btn btn-primary" onclick="saveAllStock()" style="width:100%;margin-top:16px;padding:12px">Save All</button>`);
}
async function saveStockItem(itemId) {
  const input=document.getElementById('stock_'+itemId);
  const val=input.value===''?null:parseInt(input.value);
  try { await DB.updateMenuItemStock(itemId,val); const item=Admin.menu.find(i=>i.id===itemId); if(item){item.stock_count=val;item.available=val===null||val>0;} toast('Stock updated','success'); }
  catch { toast('Failed','error'); }
}
async function saveAllStock() {
  try {
    await Promise.all(Admin.menu.map(async item=>{
      const input=document.getElementById('stock_'+item.id); if(!input) return;
      const val=input.value===''?null:parseInt(input.value);
      await DB.updateMenuItemStock(item.id,val); item.stock_count=val; item.available=val===null||val>0;
    }));
    closeModal(); renderMenuGrid(); toast('All stock saved','success');
  } catch { toast('Some saves failed','error'); }
}

function openItemModal(itemId) {
  const item=itemId?Admin.menu.find(i=>i.id===itemId):null;
  const cats=Admin.categories;
  const hasAI=!!window.ANTHROPIC_KEY;
  showModal(`
    <div class="modal-header">
      <h2>${item?'Edit Item':'Add Menu Item'}</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="form-grid">
      <div>
        <div class="form-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="form-label" style="margin:0">Name (English)</label>
            ${hasAI?`<button class="btn btn-xs btn-ghost" onclick="aiGenerateDescription()">✨ AI Generate</button>`:''}
          </div>
          <input class="form-control" id="fi_name" value="${item?.name||''}">
        </div>
        <div class="form-group"><label class="form-label">Name (Arabic)</label><input class="form-control" id="fi_name_ar" value="${item?.name_ar||''}" dir="rtl"></div>
        <div class="form-group"><label class="form-label">Price (EGP)</label><input class="form-control" id="fi_price" type="number" step="0.5" value="${item?.price||''}"></div>
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-control" id="fi_cat">${cats.map(c=>`<option value="${c.id}" ${item?.category_id===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Calories</label><input class="form-control" id="fi_cal" type="number" value="${item?.calories||''}"></div>
        <div class="form-group"><label class="form-label">Prep Time (min)</label><input class="form-control" id="fi_prep" type="number" value="${item?.prep_time_min||15}"></div>
        <div class="form-group"><label class="form-label">Stock (blank = unlimited)</label><input class="form-control" id="fi_stock" type="number" min="0" placeholder="Unlimited" value="${item?.stock_count!==null&&item?.stock_count!==undefined?item.stock_count:''}"></div>
        <div class="form-group"><label class="form-label">Dietary Tags</label><input class="form-control" id="fi_tags" placeholder="vegan, halal, gluten-free" value="${(item?.tags||[]).join(', ')}"></div>
      </div>
      <div>
        <div class="form-group"><label class="form-label">Description (English)</label><textarea class="form-control" id="fi_desc" rows="3">${item?.description||''}</textarea></div>
        <div class="form-group"><label class="form-label">Description (Arabic)</label><textarea class="form-control" id="fi_desc_ar" rows="3" dir="rtl">${item?.description_ar||''}</textarea></div>
        <div class="form-group"><label class="form-label">Image URL</label><input class="form-control" id="fi_img" placeholder="https://…" value="${item?.image_url||''}" oninput="previewImage(this.value)"><img id="fi_img_preview" class="img-preview" src="${item?.image_url||''}" style="${item?.image_url?'display:block':''}"></div>
        <div class="toggle-row"><span style="font-size:14px">Available</span><label class="toggle-switch"><input type="checkbox" id="fi_available" ${!item||item.available?'checked':''}><span class="toggle-slider"></span></label></div>
        <div class="toggle-row"><span style="font-size:14px">Featured / Chef's Pick</span><label class="toggle-switch"><input type="checkbox" id="fi_featured" ${item?.featured?'checked':''}><span class="toggle-slider"></span></label></div>
        <div id="ai_gen_status" style="margin-top:12px;font-size:13px;color:var(--accent);display:none">✨ Generating…</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-top:24px">
      <button class="btn btn-primary" onclick="saveItem('${itemId||''}')" style="flex:1;padding:13px">${item?'Save Changes':'Add Item'}</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="padding:13px 20px">Cancel</button>
    </div>`);
}

async function aiGenerateDescription() {
  const name=document.getElementById('fi_name')?.value?.trim();
  const price=document.getElementById('fi_price')?.value;
  const catId=document.getElementById('fi_cat')?.value;
  if (!name){toast('Enter item name first','error');return;}
  const catName=Admin.categories.find(c=>c.id===catId)?.name||'';
  const statusEl=document.getElementById('ai_gen_status');
  if (statusEl) statusEl.style.display='block';
  try {
    const result=await AI.generateMenuDescription(name,catName,price||0);
    if (!result) throw new Error('No result');
    if (result.description) document.getElementById('fi_desc').value=result.description;
    if (result.description_ar) document.getElementById('fi_desc_ar').value=result.description_ar;
    if (result.calories_estimate&&!document.getElementById('fi_cal').value) document.getElementById('fi_cal').value=result.calories_estimate;
    if (result.tags?.length) document.getElementById('fi_tags').value=result.tags.join(', ');
    toast('AI descriptions generated ✨','success');
  } catch { toast('AI unavailable — set ANTHROPIC_KEY in db.js','error'); }
  finally { if(statusEl)statusEl.style.display='none'; }
}

function previewImage(url) { const p=document.getElementById('fi_img_preview'); if(p){p.src=url;p.style.display=url?'block':'none';} }

async function saveItem(itemId) {
  const tagsRaw=document.getElementById('fi_tags')?.value||'';
  const tags=tagsRaw.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  const stockVal=document.getElementById('fi_stock')?.value;
  const data={
    name:document.getElementById('fi_name').value.trim(),
    name_ar:document.getElementById('fi_name_ar').value.trim(),
    price:parseFloat(document.getElementById('fi_price').value),
    category_id:document.getElementById('fi_cat').value,
    description:document.getElementById('fi_desc').value.trim(),
    description_ar:document.getElementById('fi_desc_ar').value.trim(),
    image_url:document.getElementById('fi_img').value.trim(),
    available:document.getElementById('fi_available').checked,
    featured:document.getElementById('fi_featured').checked,
    calories:parseInt(document.getElementById('fi_cal').value)||null,
    prep_time_min:parseInt(document.getElementById('fi_prep').value)||15,
    stock_count:stockVal===''?null:(parseInt(stockVal)||null),
    tags,
  };
  if (!data.name||!data.price){toast('Name and price required','error');return;}
  if (itemId) data.id=itemId;
  try {
    const saved=await DB.upsertMenuItem(data);
    const idx=Admin.menu.findIndex(i=>i.id===saved.id);
    if (idx>=0) Admin.menu[idx]=saved; else Admin.menu.push(saved);
    closeModal(); renderMenuGrid(); toast(itemId?'Item updated':'Item added','success');
  } catch(e) { toast('Failed: '+e.message,'error'); }
}

// ═══════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════
function renderAnalytics() {
  const orders=Admin.orders, done=orders.filter(o=>o.status==='done');
  const totalRev=done.reduce((a,o)=>a+o.total,0);
  const dayMap={};
  for (let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);dayMap[d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})]=0;}
  orders.filter(o=>o.status!=='cancelled').forEach(o=>{const ts=o.created_at?.toDate?o.created_at.toDate():new Date(o.created_at||0);const d=ts.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});if(d in dayMap)dayMap[d]+=o.total;});
  const pmCounts={cash:0,card:0,instapay:0};
  orders.forEach(o=>{const pm=o.payment_method||'cash';if(pm in pmCounts)pmCounts[pm]++;});
  document.getElementById('page').innerHTML=`
    <div class="stat-grid" style="margin-bottom:24px">
      ${[['💰','Total Revenue (done)',fmt(totalRev)],['📈','Completed',done.length],['❌','Cancelled',orders.filter(o=>o.status==='cancelled').length],['⏱','Avg Order',fmt(orders.length?orders.reduce((a,o)=>a+o.total,0)/orders.length:0)]].map(([icon,label,val])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`).join('')}
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Revenue — Last 14 Days</h3><canvas id="revenueChart" height="240"></canvas></div>
      <div class="chart-card"><h3>Payment Methods</h3><canvas id="pmChart" height="240"></canvas></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="chart-card"><h3>Top Ordered Items</h3><div class="top-items-list" id="analyticsTopItems"></div></div>
      <div class="chart-card"><h3>Customer Ratings</h3><div id="ratingsBreakdown"></div></div>
    </div>`;
  // Destroy stale charts before creating new ones
  if(Admin.charts.revenue){Admin.charts.revenue.destroy();Admin.charts.revenue=null;}
  if(Admin.charts.pm){Admin.charts.pm.destroy();Admin.charts.pm=null;}
  requestAnimationFrame(()=>{
    const ctx=document.getElementById('revenueChart');
    if(ctx&&typeof Chart!=='undefined'){if(Admin.charts.revenue)Admin.charts.revenue.destroy();Admin.charts.revenue=new Chart(ctx,{type:'line',data:{labels:Object.keys(dayMap),datasets:[{label:'Revenue',data:Object.values(dayMap),borderColor:'#1F6B4F',backgroundColor:'rgba(31,107,79,.08)',borderWidth:2,fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#1F6B4F'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#666',font:{size:11}},grid:{color:'rgba(0,0,0,.06)'}},y:{ticks:{color:'#555',font:{size:11},callback:v=>`ج.م ${v}`},grid:{color:'rgba(0,0,0,.06)'}}}}})}
    const pmCtx=document.getElementById('pmChart');
    if(pmCtx&&typeof Chart!=='undefined'){if(Admin.charts.pm)Admin.charts.pm.destroy();Admin.charts.pm=new Chart(pmCtx,{type:'doughnut',data:{labels:['Cash','Card','InstaPay'],datasets:[{data:[pmCounts.cash,pmCounts.card,pmCounts.instapay],backgroundColor:['#22c55e','#3b82f6','#1F6B4F'],borderWidth:0}]},options:{plugins:{legend:{position:'bottom',labels:{color:'#888',font:{size:12}}}},cutout:'65%',maintainAspectRatio:false}})}
    const container=document.getElementById('analyticsTopItems');
    if(container){const counts={};Admin.orders.forEach(o=>o.items?.forEach(i=>{counts[i.name]=(counts[i.name]||0)+i.qty;}));const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);const max=sorted[0]?.[1]||1;container.innerHTML=sorted.map(([name,qty])=>`<div class="top-item-row"><span class="top-item-name">${name}</span><div class="top-item-bar-wrap"><div class="top-item-bar" style="width:${Math.round(qty/max*100)}%"></div></div><span class="top-item-count">${qty}</span></div>`).join('')||'<p style="color:var(--text3)">No data yet</p>';}
    const ratEl=document.getElementById('ratingsBreakdown');
    if(ratEl&&Admin.feedback.length){const emojis=['😐','😊','🤩'];const counts2=[0,0,0];Admin.feedback.forEach(f=>{if(f.emoji>=1&&f.emoji<=3)counts2[f.emoji-1]++;});const max2=Math.max(...counts2,1);ratEl.innerHTML=emojis.map((e,i)=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><span style="font-size:24px;width:32px">${e}</span><div style="flex:1;height:8px;background:var(--dark3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${Math.round(counts2[i]/max2*100)}%;background:var(--accent);border-radius:4px"></div></div><span style="font-size:14px;font-weight:700;min-width:28px">${counts2[i]}</span></div>`).join('');}
    else if(ratEl){ratEl.innerHTML='<p style="color:var(--text3);font-size:13px">No feedback yet</p>';}
  });
}

// ═══════════════════════════════════════════════════
//  TABLE HEATMAP
// ═══════════════════════════════════════════════════
async function renderHeatmap() {
  document.getElementById('page').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <p style="font-size:13px;color:var(--text2)">Live floor view — auto-refreshes every 30s</p>
      <button class="btn btn-ghost btn-sm" onclick="loadHeatmapData()">↺ Refresh</button>
    </div>
    <div id="heatmapGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px"></div>`;
  await loadHeatmapData();
  clearInterval(window._heatmapInterval);
  window._heatmapInterval=setInterval(()=>{if(Admin.currentPage==='heatmap')loadHeatmapData();},30000);
}
async function loadHeatmapData() {
  const grid=document.getElementById('heatmapGrid');
  if (!grid) return;
  try {
    const [tables,orders]=await Promise.all([DB.getTables(),DB.getOrders(200)]);
    const activeByTable={};
    orders.forEach(o=>{if(['pending','confirmed','preparing','ready'].includes(o.status)){if(!activeByTable[o.table_number])activeByTable[o.table_number]=[];activeByTable[o.table_number].push(o);}});
    grid.innerHTML=tables.map(tbl=>{
      const active=activeByTable[tbl.table_number]||[];
      const oldest=active.length?Math.floor((Date.now()-(active[0].created_at?.toDate?active[0].created_at.toDate():new Date(active[0].created_at||Date.now())).getTime())/60000):0;
      let color,label,emoji;
      if(!tbl.active){color='var(--dark4)';label='Inactive';emoji='🔒';}
      else if(!active.length){color='rgba(34,197,94,.12)';label='Free';emoji='✅';}
      else if(oldest<10){color='rgba(245,158,11,.12)';label=`Busy · ${active.length}`;emoji='🍽️';}
      else{color='rgba(239,68,68,.15)';label=`⚠️ ${oldest} min`;emoji='🔴';}
      return `<div onclick="navigate('orders');filterOrders('all');searchOrders('${tbl.table_number}')"
        style="background:${color};border:2px solid ${active.length?'rgba(31,107,79,.3)':'var(--border)'};border-radius:16px;padding:18px 10px;text-align:center;cursor:pointer;transition:all .2s">
        <div style="font-size:26px;margin-bottom:4px">${emoji}</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent)">${tbl.table_number}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">${label}</div>
        ${active.length?`<div style="font-size:10px;color:var(--text3);margin-top:2px">${active.map(o=>`#${o.order_number}`).join(', ')}</div>`:''}
      </div>`;
    }).join('');
  } catch(e){if(grid)grid.innerHTML=`<div style="color:var(--danger)">Error: ${e.message}</div>`;}
}

// ═══════════════════════════════════════════════════
//  LOYALTY
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
//  LOYALTY & REWARDS (admin)
// ═══════════════════════════════════════════════════
const LOYALTY_REWARD_ICONS = { percent:'🏷️', fixed:'💰', free_addon:'🧀', free_delivery:'🚚' };
const LOYALTY_TABS = { overview:'📊 Overview', settings:'⚙️ Program Settings', rewards:'🎁 Rewards', customers:'👥 Customers' };

async function renderLoyaltyPage() {
  Admin.loyaltyTab = Admin.loyaltyTab || 'overview';
  document.getElementById('page').innerHTML = `
    <div class="table-card" style="padding:24px">
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:16px">
        ${Object.entries(LOYALTY_TABS).map(([k,label])=>`<button class="btn btn-sm ${Admin.loyaltyTab===k?'btn-primary':'btn-ghost'}" onclick="switchLoyaltyTab('${k}')">${label}</button>`).join('')}
      </div>
      <div id="loyaltyTabContent"><div style="color:var(--text3);padding:30px;text-align:center">Loading…</div></div>
    </div>`;
  if (!Admin.loyaltyRewards) { try { Admin.loyaltyRewards = await DB.getLoyaltyRewards(); } catch(e) { Admin.loyaltyRewards = []; } }
  renderLoyaltyTabContent();
}
function switchLoyaltyTab(tab) { Admin.loyaltyTab = tab; renderLoyaltyPage(); }
function renderLoyaltyTabContent() {
  const el = document.getElementById('loyaltyTabContent');
  if (!el) return;
  if (Admin.loyaltyTab === 'overview') { el.innerHTML = renderLoyaltyOverviewTab(); loadLoyaltyOverviewStats(); }
  else if (Admin.loyaltyTab === 'settings') el.innerHTML = renderLoyaltySettingsTab();
  else if (Admin.loyaltyTab === 'rewards') el.innerHTML = renderLoyaltyRewardsTab();
  else if (Admin.loyaltyTab === 'customers') el.innerHTML = renderLoyaltyCustomersTab();
}

// ── Overview ──
function renderLoyaltyOverviewTab() {
  const s = Admin.settings || {};
  const enabled = s.loyalty_enabled === 'yes';
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:20px;padding:16px 20px;background:${enabled?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)'};border:1px solid ${enabled?'rgba(34,197,94,.25)':'rgba(239,68,68,.25)'};border-radius:12px">
      <div><div style="font-weight:700">${enabled?'🟢 Loyalty Program is Active':'🔴 Loyalty Program is Disabled'}</div><div style="font-size:12px;color:var(--text3);margin-top:2px">${enabled?'Customers are earning and redeeming points right now.':'Customer points & history are preserved — no new points are earned or redeemed while disabled.'}</div></div>
      <button class="btn ${enabled?'btn-danger':'btn-primary'} btn-sm" onclick="toggleLoyaltyEnabled()">${enabled?'Disable':'Enable'}</button>
    </div>
    <div id="loyaltyStatsGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:24px">
      <div style="color:var(--text3);padding:20px;grid-column:1/-1;text-align:center">Loading stats…</div>
    </div>
    <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Recent Transactions</h3>
    <div id="loyaltyRecentTxns" style="font-size:13px;color:var(--text2);margin-bottom:28px">Loading…</div>
    <div style="margin-top:18px;padding:14px;border-radius:12px;background:rgba(31,107,79,.08);border:1px solid rgba(31,107,79,.18);font-size:12.5px;color:var(--text2)">Simple rewards only: percentage discount, fixed discount, free add-on, or free delivery. The old 10-order free-meal program has been removed.</div>
  `;
}
async function toggleLoyaltyEnabled() {
  const cur = Admin.settings.loyalty_enabled === 'yes';
  const next = cur ? 'no' : 'yes';
  try { await DB.updateSetting('loyalty_enabled', next); Admin.settings.loyalty_enabled = next; toast(`Loyalty program ${next==='yes'?'enabled':'disabled'} ✓`,'success'); renderLoyaltyPage(); }
  catch(e) { toast('Failed','error'); }
}
async function loadLoyaltyOverviewStats() {
  const grid = document.getElementById('loyaltyStatsGrid');
  const txnsEl = document.getElementById('loyaltyRecentTxns');
  const boardEl = document.getElementById('loyaltyPunchLeaderboard');
  if (!grid) return;
  try {
    const txns = await DB.getRecentLoyaltyTransactions(200);
    Admin.loyaltyTxns = txns;
    const members = new Set(txns.map(t=>t.phone));
    const issued = txns.filter(t=>t.points>0).reduce((a,t)=>a+t.points,0);
    const redeemed = txns.filter(t=>t.type==='redeem').reduce((a,t)=>a+Math.abs(t.points),0);
    const redemptions = txns.filter(t=>t.type==='redeem').length;
    const stats = [['👥','Members (recent activity)', members.size],['✨','Points Issued', issued.toLocaleString()],['🎁','Points Redeemed', redeemed.toLocaleString()],['🏆','Rewards Redeemed', redemptions]];
    grid.innerHTML = stats.map(([icon,label,val])=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px"><div style="font-size:22px;margin-bottom:6px">${icon}</div><div style="font-size:22px;font-weight:800">${val}</div><div style="font-size:11.5px;color:var(--text3);margin-top:2px">${label}</div></div>`).join('');
    txnsEl.innerHTML = txns.length ? txns.slice(0,15).map(t=>`
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <span>${t.points>0?'+':''}${t.points} pts — ${t.description||t.type} <span style="color:var(--text3)">(${t.phone})</span></span>
        <span style="color:var(--text3);font-size:11.5px">${t.created_at?.toDate?t.created_at.toDate().toLocaleDateString():''}</span>
      </div>`).join('') : '<p style="color:var(--text3)">No transactions yet</p>';
  } catch(e) { grid.innerHTML = `<p style="color:var(--text3);grid-column:1/-1">Could not load stats: ${e.message}</p>`; }
}

// ── Settings ──
function renderLoyaltySettingsTab() {
  const s = Admin.settings || {};
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:700px">
      <div class="form-group"><label class="form-label">Points earned per 1 currency spent</label><input class="form-control" id="loy_points_per_currency" value="${s.loyalty_points_per_currency||'1'}" type="number" step="0.1"></div>
      <div class="form-group"><label class="form-label">Signup bonus (one-time)</label><input class="form-control" id="loy_signup_bonus" value="${s.loyalty_signup_bonus||'0'}" type="number"></div>
      <div class="form-group"><label class="form-label">First-order bonus</label><input class="form-control" id="loy_first_order_bonus" value="${s.loyalty_first_order_bonus||'0'}" type="number"></div>
      <div class="form-group"><label class="form-label">Points expire after (days, 0 = never)</label><input class="form-control" id="loy_expiry_days" value="${s.loyalty_expiry_days||'0'}" type="number"></div>
    </div>
    <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:16px">
        <input type="checkbox" id="loy_tiers_enabled" ${s.loyalty_tiers_enabled==='yes'?'checked':''} style="width:18px;height:18px">
        <span style="font-weight:600">Enable loyalty tiers (Bronze / Silver / Gold, based on lifetime points)</span>
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:500px">
        <div class="form-group"><label class="form-label">Silver tier — lifetime points needed</label><input class="form-control" id="loy_silver_threshold" value="${s.loyalty_silver_threshold||'500'}" type="number"></div>
        <div class="form-group"><label class="form-label">Gold tier — lifetime points needed</label><input class="form-control" id="loy_gold_threshold" value="${s.loyalty_gold_threshold||'1000'}" type="number"></div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="saveLoyaltySettings()" style="margin-top:10px">💾 Save Program Settings</button>
    <p style="color:var(--text3);font-size:12px;margin-top:16px;max-width:600px">Note: this project has no backend scheduler, so point expiry is informational (customers are warned before points expire) rather than automatically enforced on a fixed clock — that would need a server-side job.</p>
  `;
}
async function saveLoyaltySettings() {
  const keys = ['loyalty_points_per_currency','loyalty_signup_bonus','loyalty_first_order_bonus','loyalty_expiry_days','loyalty_silver_threshold','loyalty_gold_threshold'];
  try {
    await Promise.all(keys.map(k => { const el = document.getElementById('loy_'+k.replace('loyalty_','')); return el ? DB.updateSetting(k, el.value) : null; }));
    await DB.updateSetting('loyalty_tiers_enabled', document.getElementById('loy_tiers_enabled').checked ? 'yes' : 'no');
    keys.forEach(k => { const el = document.getElementById('loy_'+k.replace('loyalty_','')); if (el) Admin.settings[k] = el.value; });
    Admin.settings.loyalty_tiers_enabled = document.getElementById('loy_tiers_enabled').checked ? 'yes' : 'no';
    toast('Loyalty settings saved ✓','success');
  } catch(e) { toast('Failed: '+e.message,'error'); }
}

// ── Rewards ──
function renderLoyaltyRewardsTab() {
  const rewards = Admin.loyaltyRewards || [];
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <p style="color:var(--text3);font-size:13px">Create rewards customers redeem with their points.</p>
      <button class="btn btn-primary btn-sm" onclick="openLoyaltyRewardEditor()">+ New Reward</button>
    </div>
    <div id="loyaltyRewardEditorWrap"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">
      ${rewards.length ? rewards.map(r=>renderLoyaltyRewardCard(r)).join('') : '<p style="color:var(--text3)">No rewards yet — create your first one.</p>'}
    </div>`;
}
function loyaltyRewardSubtitle(r) {
  if (r.type==='percent') return `${r.percent}% OFF`;
  if (r.type==='fixed') return `${fmt2(r.amount)} OFF`;
  if (r.type==='free_addon') return `Free ${r.addon_text||'add-on'}`;
  if (r.type==='free_delivery') return 'Free Delivery';
  return r.addon_text || 'Reward';
}
function fmt2(n) { return `${Admin.settings.currency_symbol||'ج.م'} ${Math.round(n||0).toLocaleString()}`; }
function renderLoyaltyRewardCard(r) {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;${r.active?'':'opacity:.55'}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
      <div style="font-size:24px">${LOYALTY_REWARD_ICONS[r.type]||'🎁'}</div>
      <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:50px;background:${r.active?'rgba(34,197,94,.15)':'rgba(148,163,184,.15)'};color:${r.active?'var(--success)':'var(--text3)'}">${r.active?'Active':'Inactive'}</span>
    </div>
    <div style="font-weight:700;font-size:14.5px;margin-bottom:2px">${r.title||'Untitled reward'}</div>
    <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">${loyaltyRewardSubtitle(r)}</div>
    <div style="font-weight:800;color:var(--accent);font-size:15px;margin-bottom:12px">⭐ ${r.points_cost||0} pts</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-xs" onclick="openLoyaltyRewardEditor('${r.id}')">Edit</button>
      <button class="btn btn-ghost btn-xs" onclick="duplicateLoyaltyReward('${r.id}')">Duplicate</button>
      <button class="btn btn-ghost btn-xs" onclick="toggleLoyaltyRewardActive('${r.id}')">${r.active?'Disable':'Enable'}</button>
      <button class="btn btn-danger btn-xs" onclick="deleteLoyaltyRewardConfirm('${r.id}')">Delete</button>
    </div>
  </div>`;
}
function openLoyaltyRewardEditor(id) {
  const existing = id ? Admin.loyaltyRewards.find(r=>r.id===id) : null;
  Admin._loyaltyEditing = existing ? {...existing} : {
    type:'percent', title:'', title_ar:'', points_cost:100, active:true, sort_order:(Admin.loyaltyRewards||[]).length,
    percent:10, amount:50, addon_text:'',
    min_order:0, max_discount:0, max_redemptions:0, max_redemptions_per_customer:1, start_date:'', end_date:'',
  };
  const wrap = document.getElementById('loyaltyRewardEditorWrap');
  wrap.innerHTML = renderLoyaltyRewardForm();
  wrap.scrollIntoView({behavior:'smooth'});
}
function renderLoyaltyRewardForm() {
  const r = Admin._loyaltyEditing;
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:20px">
    <h3 style="margin-bottom:14px">${r.id?'Edit Reward':'New Reward'}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-group"><label class="form-label">Title (EN)</label><input class="form-control" id="lr_title" value="${(r.title||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label class="form-label">Title (AR)</label><input class="form-control" id="lr_title_ar" dir="rtl" value="${(r.title_ar||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label class="form-label">Reward Type</label>
        <select class="form-control" id="lr_type" onchange="Admin._loyaltyEditing.type=this.value;document.getElementById('loyaltyRewardEditorWrap').innerHTML=renderLoyaltyRewardForm()">
          <option value="percent" ${r.type==='percent'?'selected':''}>🏷️ Percentage Discount</option>
          <option value="fixed" ${r.type==='fixed'?'selected':''}>💰 Fixed Discount</option>
          <option value="free_addon" ${r.type==='free_addon'?'selected':''}>🧀 Free Add-on</option>
          <option value="free_delivery" ${r.type==='free_delivery'?'selected':''}>🚚 Free Delivery</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Points Required</label><input class="form-control" id="lr_points" type="number" value="${r.points_cost||0}"></div>
      ${r.type==='percent'?`<div class="form-group"><label class="form-label">Percentage Off</label><input class="form-control" id="lr_percent" type="number" value="${r.percent||10}"></div>
        <div class="form-group"><label class="form-label">Max discount cap (0 = none)</label><input class="form-control" id="lr_max_discount" type="number" value="${r.max_discount||0}"></div>`:''}
      ${r.type==='fixed'?`<div class="form-group"><label class="form-label">Discount Amount</label><input class="form-control" id="lr_amount" type="number" value="${r.amount||10}"></div>`:''}
      ${r.type==='free_addon'?`<div class="form-group" style="grid-column:1/-1"><label class="form-label">Add-on description</label><input class="form-control" id="lr_addon_text" value="${(r.addon_text||'').replace(/"/g,'&quot;')}" placeholder="Extra Cheese"></div>`:''}
    </div>
    <h4 style="margin:18px 0 10px;font-size:13px;color:var(--text2)">Conditions (optional)</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-group"><label class="form-label">Minimum order value (0 = none)</label><input class="form-control" id="lr_min_order" type="number" value="${r.min_order||0}"></div>
      <div class="form-group"><label class="form-label">Max total redemptions (0 = unlimited)</label><input class="form-control" id="lr_max_redemptions" type="number" value="${r.max_redemptions||0}"></div>
      <div class="form-group"><label class="form-label">Max redemptions per customer (0 = unlimited)</label><input class="form-control" id="lr_max_per_customer" type="number" value="${r.max_redemptions_per_customer||1}"></div>
      <div class="form-group"><label class="form-label">Active</label><select class="form-control" id="lr_active"><option value="yes" ${r.active?'selected':''}>Yes</option><option value="no" ${!r.active?'selected':''}>No</option></select></div>
      <div class="form-group"><label class="form-label">Start date (optional)</label><input class="form-control" id="lr_start_date" type="date" value="${r.start_date||''}"></div>
      <div class="form-group"><label class="form-label">End date (optional)</label><input class="form-control" id="lr_end_date" type="date" value="${r.end_date||''}"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-primary" onclick="saveLoyaltyRewardForm()">💾 Save Reward</button>
      <button class="btn btn-ghost" onclick="document.getElementById('loyaltyRewardEditorWrap').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}
async function saveLoyaltyRewardForm() {
  const r = Admin._loyaltyEditing;
  const val = id => document.getElementById(id)?.value;
  const reward = {
    ...r,
    title: val('lr_title') || 'Reward', title_ar: val('lr_title_ar') || '',
    type: val('lr_type') || r.type,
    points_cost: parseInt(val('lr_points')) || 0,
    active: val('lr_active') === 'yes',
    min_order: parseFloat(val('lr_min_order')) || 0,
    max_redemptions: parseInt(val('lr_max_redemptions')) || 0,
    max_redemptions_per_customer: parseInt(val('lr_max_per_customer')) || 0,
    start_date: val('lr_start_date') || '', end_date: val('lr_end_date') || '',
  };
  if (reward.type === 'percent') { reward.percent = parseFloat(val('lr_percent')) || 0; reward.max_discount = parseFloat(val('lr_max_discount')) || 0; }
  if (reward.type === 'fixed') reward.amount = parseFloat(val('lr_amount')) || 0;
  if (reward.type === 'free_addon') reward.addon_text = val('lr_addon_text') || '';
  try {
    const id = await DB.saveLoyaltyReward(reward);
    reward.id = id;
    const idx = Admin.loyaltyRewards.findIndex(x=>x.id===id);
    if (idx>=0) Admin.loyaltyRewards[idx] = reward; else Admin.loyaltyRewards.push(reward);
    document.getElementById('loyaltyRewardEditorWrap').innerHTML = '';
    renderLoyaltyTabContent();
    toast('Reward saved ✓','success');
  } catch(e) { toast('Failed: '+e.message,'error'); }
}
async function toggleLoyaltyRewardActive(id) {
  const r = Admin.loyaltyRewards.find(x=>x.id===id); if (!r) return;
  try { await DB.saveLoyaltyReward({...r, active:!r.active}); r.active = !r.active; renderLoyaltyTabContent(); toast('Updated ✓','success'); }
  catch(e) { toast('Failed','error'); }
}
async function duplicateLoyaltyReward(id) {
  const r = Admin.loyaltyRewards.find(x=>x.id===id); if (!r) return;
  const copy = {...r, id:undefined, title:r.title+' (copy)'};
  try { const newId = await DB.saveLoyaltyReward(copy); copy.id = newId; Admin.loyaltyRewards.push(copy); renderLoyaltyTabContent(); toast('Duplicated ✓','success'); }
  catch(e) { toast('Failed','error'); }
}
async function deleteLoyaltyRewardConfirm(id) {
  if (!confirm('Delete this reward? This cannot be undone.')) return;
  try { await DB.deleteLoyaltyReward(id); Admin.loyaltyRewards = Admin.loyaltyRewards.filter(x=>x.id!==id); renderLoyaltyTabContent(); toast('Deleted','success'); }
  catch(e) { toast('Failed','error'); }
}

// ── Customers ──
function renderLoyaltyCustomersTab() {
  return `
    <div style="display:flex;gap:8px;margin-bottom:16px;max-width:420px">
      <input class="form-control" id="loyaltyCustomerSearch" placeholder="Search by phone number" type="tel">
      <button class="btn btn-primary btn-sm" onclick="searchLoyaltyCustomer()">Search</button>
    </div>
    <div id="loyaltyCustomerResult"></div>`;
}
function loyaltyTierForPoints(lifetime) {
  const s = Admin.settings || {};
  const gold = parseInt(s.loyalty_gold_threshold)||1000, silver = parseInt(s.loyalty_silver_threshold)||500;
  if (lifetime>=gold) return 'Gold 🥇'; if (lifetime>=silver) return 'Silver 🥈'; return 'Bronze 🥉';
}
async function searchLoyaltyCustomer() {
  const phone = document.getElementById('loyaltyCustomerSearch')?.value?.trim();
  const el = document.getElementById('loyaltyCustomerResult');
  if (!phone) { toast('Enter a phone number','error'); return; }
  el.innerHTML = '<p style="color:var(--text3)">Searching…</p>';
  try {
    const profile = await DB.getLoyaltyProfile(phone);
    const txns = await DB.getLoyaltyTransactions(phone, 30);
    Admin._loyaltyCustomerPhone = phone;
    const tierEnabled = Admin.settings.loyalty_tiers_enabled === 'yes';
    el.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
          <div>
            <div style="font-weight:700;font-size:16px">${phone}</div>
            <div style="font-size:12px;color:var(--text3)">${tierEnabled?`${loyaltyTierForPoints(profile.lifetime_points||0)} · `:''}Lifetime: ${profile.lifetime_points||0} pts · Redeemed: ${(profile.redeemed_rewards||[]).length}</div>
          </div>
          <div style="text-align:right"><div style="font-size:26px;font-weight:800;color:var(--accent)">${profile.points||0}</div><div style="font-size:11px;color:var(--text3)">current points</div></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
          <input class="form-control" id="loyaltyAdjustAmount" type="number" placeholder="e.g. 100 or -50" style="max-width:140px">
          <input class="form-control" id="loyaltyAdjustReason" placeholder="Reason (required)" style="flex:1;min-width:160px">
          <button class="btn btn-primary btn-sm" onclick="adjustLoyaltyCustomerPoints()">Adjust</button>
        </div>
      </div>
      <h4 style="font-size:13px;color:var(--text2);margin-bottom:10px">Transaction History</h4>
      <div>${txns.length ? txns.map(t=>`
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
          <span>${t.points>0?'+':''}${t.points} — ${t.description||t.type}${t.admin?` <span style="color:var(--text3)">(by ${t.admin})</span>`:''}</span>
          <span style="color:var(--text3);font-size:11.5px">${t.created_at?.toDate?t.created_at.toDate().toLocaleDateString():''}</span>
        </div>`).join('') : '<p style="color:var(--text3)">No transactions yet</p>'}</div>
    `;
  } catch(e) { el.innerHTML = '<p style="color:var(--danger)">Could not load customer</p>'; }
}
async function adjustLoyaltyCustomerPoints() {
  const phone = Admin._loyaltyCustomerPhone;
  const amount = parseInt(document.getElementById('loyaltyAdjustAmount')?.value);
  const reason = document.getElementById('loyaltyAdjustReason')?.value?.trim();
  if (!amount) { toast('Enter a points amount','error'); return; }
  if (!reason) { toast('A reason is required','error'); return; }
  try {
    await DB.adjustLoyaltyPoints(phone, amount, reason, Admin.currentAdminName || 'Admin');
    toast('Points adjusted ✓','success');
    searchLoyaltyCustomer();
  } catch(e) { toast('Failed: '+e.message,'error'); }
}

// ═══════════════════════════════════════════════════
//  FEEDBACK
// ═══════════════════════════════════════════════════
function renderFeedbackPage() {
  const fb=Admin.feedback;
  const avg=fb.length?(fb.reduce((a,f)=>a+(f.emoji||0),0)/fb.length).toFixed(1):'—';
  const emojiMap={1:'😐',2:'😊',3:'🤩'};
  document.getElementById('page').innerHTML=`
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${avg}/3</div><div class="stat-label">Avg Rating</div></div>
      <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-value">${fb.length}</div><div class="stat-label">Total Reviews</div></div>
      <div class="stat-card"><div class="stat-icon">🤩</div><div class="stat-value">${fb.filter(f=>f.emoji===3).length}</div><div class="stat-label">Happy</div></div>
      <div class="stat-card"><div class="stat-icon">😐</div><div class="stat-value">${fb.filter(f=>f.emoji===1).length}</div><div class="stat-label">Needs Work</div></div>
    </div>
    <div class="table-card">
      <div class="table-header"><h3>All Feedback</h3></div>
      <div class="table-overflow"><table class="data-table">
        <thead><tr><th>Rating</th><th>Table</th><th>Comment</th><th>Time</th></tr></thead>
        <tbody>${fb.map(f=>{const ts=f.created_at?.toDate?f.created_at.toDate():new Date(f.created_at||0);return`<tr><td style="font-size:24px">${emojiMap[f.emoji]||'—'}</td><td>Table ${f.table_number||'—'}</td><td style="font-size:13px;color:var(--text2);max-width:300px">${f.comment||'<span style="color:var(--text3)">No comment</span>'}</td><td style="font-size:12px;color:var(--text3)">${ts.toLocaleString()}</td></tr>`;}).join('')||'<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text3)">No feedback yet</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}

// ═══════════════════════════════════════════════════
//  SETTINGS — Restaurant Info + Pricing + Appearance Editor
// ═══════════════════════════════════════════════════
function renderSettings() {
  const s=Admin.settings;
  document.getElementById('page').innerHTML=`
    <div class="settings-grid">

      <!-- Logo -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>🖼️ Restaurant Logo</h3>
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
          <div id="logo-preview-wrap">
            ${s.restaurant_logo?`<img id="logo-preview-img" src="${s.restaurant_logo}" style="width:100px;height:100px;object-fit:contain;border-radius:12px;border:2px solid var(--border);background:var(--dark3);padding:6px">`:`<div style="width:100px;height:100px;border-radius:12px;border:2px dashed var(--border);background:var(--dark3);display:flex;align-items:center;justify-content:center;font-size:32px">🏪</div>`}
          </div>
          <div style="flex:1;min-width:200px">
            <label style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:var(--dark3);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;margin-bottom:8px">
              <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none" onchange="handleLogoUpload(this)">
              📁 Choose Logo File
            </label>
            <div style="font-size:11px;color:var(--text3)">PNG, JPG, WebP or SVG — max 2MB</div>
            ${s.restaurant_logo?`<button class="btn btn-danger btn-sm" onclick="removeLogo()" style="margin-top:8px">🗑️ Remove</button>`:''}
          </div>
        </div>
      </div>

      <!-- Restaurant Info -->
      <div class="settings-card">
        <h3>🏪 Restaurant Info</h3>
        ${settingField('Restaurant Name','restaurant_name',s.restaurant_name)}
        ${settingField('Restaurant Name (Arabic)','restaurant_name_ar',s.restaurant_name_ar)}
        ${settingField('Tagline','tagline',s.tagline)}
        ${settingField('WiFi Network','wifi_name',s.wifi_name)}
        ${settingField('WiFi Password','wifi_pass',s.wifi_pass)}
        ${settingField('Opening Time','open_time',s.open_time)}
        ${settingField('Closing Time','close_time',s.close_time)}
        ${settingField('Contact WhatsApp (with country code, no +)','contact_whatsapp',s.contact_whatsapp)}
        ${settingField('Address','contact_address',s.contact_address)}
        <button class="btn btn-primary" onclick="saveSettings()" style="width:100%;margin-top:8px">Save Info</button>
      </div>

      <!-- Pricing + Coupons -->
      <div class="settings-card">
        <h3>💰 Pricing & Tax</h3>
        ${settingField('VAT Rate (%)','tax_rate',s.tax_rate)}
        ${settingField('Service Charge (%)','service_charge',s.service_charge)}
        ${settingField('Currency Symbol','currency_symbol',s.currency_symbol)}
        <button class="btn btn-primary" onclick="saveSettings()" style="width:100%;margin-top:8px">Save Pricing</button>
        <div style="margin-top:20px"><h3 style="font-size:14px;font-weight:700;margin-bottom:14px">🎟 Coupons</h3>${renderCouponsInline()}</div>
      </div>

      <!-- InstaPay -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>📱 InstaPay Egypt</h3>
        <div class="form-group">
          <label class="form-label">Your InstaPay Payment Link</label>
          <input class="form-control" id="setting_instapay_link" value="${s.instapay_link||''}" placeholder="https://ipn.eg/S/yourusername/instapay/…">
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveInstapayLink()">💾 Save Link</button>
      </div>

      <!-- Google Reviews -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>⭐ Google Reviews</h3>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Google Review Link</label>
            <input class="form-control" id="setting_google_review_link" value="${s.google_review_link||''}" placeholder="https://g.page/r/xxxxx/review">
          </div>
          <div class="form-group">
            <label class="form-label">Rating (e.g. 4.9)</label>
            <input class="form-control" id="setting_google_rating" value="${s.google_rating||''}" placeholder="4.9">
          </div>
          <div class="form-group">
            <label class="form-label">Review Count</label>
            <input class="form-control" id="setting_google_review_count" value="${s.google_review_count||''}" placeholder="248">
          </div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin:-6px 0 12px">This is the link customers land on when they tap "Review us on Google" — get it from Google Business Profile → Share review form.</div>
        <button class="btn btn-primary btn-sm" onclick="saveGoogleReviewSettings()">💾 Save</button>
        <div style="margin-top:20px">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:14px">Testimonial Cards</h3>
          ${renderGoogleReviewsInline()}
        </div>
      </div>

            <!-- AI + WhatsApp -->
      <div class="settings-card" style="grid-column:1/-1">
        <h3>🤖 AI & Notifications</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Anthropic API Key</label>
            <input class="form-control" id="setting_anthropic_key" type="password" placeholder="sk-ant-… (set in db.js)">
            <div style="font-size:11px;color:var(--text3);margin-top:4px">Set ANTHROPIC_KEY in db.js to enable AI features</div>
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp Phone (CallMeBot)</label>
            <input class="form-control" id="setting_wa_phone" value="${s.wa_phone||''}" placeholder="201012345678">
          </div>
          <div class="form-group">
            <label class="form-label">CallMeBot API Key</label>
            <input class="form-control" id="setting_wa_apikey" value="${s.wa_apikey||''}" placeholder="Get from callmebot.com">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveAISettings()">Save</button>
      </div>

    </div>`;
  setTimeout(loadCoupons, 100);
}

/* ── Appearance helpers ── */
async function applyThemePreset(key) {
  const themes={dark:'#0a0a0a',midnight:'#070b14',forest:'#071210',wine:'#12070a',light:'#f8f8f6'};
  await DB.updateSetting('theme_preset',key);
  await DB.updateSetting('bg_color',themes[key]);
  Admin.settings.theme_preset=key;
  document.querySelectorAll('[id^="theme-btn-"]').forEach(btn=>{btn.style.borderColor='var(--border2)';});
  const btn=document.getElementById('theme-btn-'+key);
  if (btn) btn.style.borderColor='var(--accent)';
  toast('Theme saved — reload customer site to see','success');
}
async function applyBorderRadius(val,key) {
  await DB.updateSetting('card_radius',val);
  Admin.settings.card_radius=val;
  document.querySelectorAll('[id^="radius-btn-"]').forEach(btn=>{btn.style.borderColor='var(--border2)';});
  const btn=document.getElementById('radius-btn-'+key);
  if (btn) btn.style.borderColor='var(--accent)';
  toast('Corner style saved','success');
}
async function applyHeroFont(font,key) {
  await DB.updateSetting('hero_font',font);
  Admin.settings.hero_font=font;
  document.querySelectorAll('[id^="font-btn-"]').forEach(btn=>{btn.style.borderColor='var(--border2)';});
  const btn=document.getElementById('font-btn-'+key);
  if (btn) btn.style.borderColor='var(--accent)';
  toast('Font saved','success');
}
function updateAccentLive(color) { document.documentElement.style.setProperty('--accent',color); }
async function saveAccentColor() { const color=document.getElementById('accentColorPicker').value; await DB.updateSetting('accent_color',color); Admin.settings.accent_color=color; toast('Accent color saved','success'); }
async function saveHeroText() {
  const keys=['hero_title1','hero_title2','hero_subtitle','tagline'];
  await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value):null;}));
  toast('Hero text saved','success');
}
async function saveHeroStats() {
  const keys=['stat1_num','stat1_label','stat2_num','stat2_label','stat3_num','stat3_label'];
  await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value):null;}));
  toast('Stats saved','success');
}
async function saveMenuLabels() {
  const keys=['menu_section_label','menu_section_title','menu_section_label_ar'];
  await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value):null;}));
  toast('Labels saved','success');
}
async function saveAISettings() {
  try {
    await Promise.all(['wa_phone','wa_apikey'].map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value.trim()):null;}));
    toast('Settings saved','success');
  } catch { toast('Failed','error'); }
}

// ═══════════════════════════════════════════════════
//  TABLES PAGE
// ═══════════════════════════════════════════════════
async function renderTablesPage() {
  document.getElementById('page').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <p style="font-size:13px;color:var(--text2)">Program each NFC chip with its table URL.</p>
      <button class="btn btn-primary" onclick="openTableModal(null)">+ Add Table</button>
    </div>
    <div id="tablesGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      <div style="color:var(--text3);padding:40px;text-align:center;grid-column:1/-1">Loading…</div>
    </div>`;
  await loadTablesGrid();
}
async function loadTablesGrid() {
  const grid=document.getElementById('tablesGrid'); if (!grid) return;
  try {
    const [tables,orders]=await Promise.all([DB.getTables(),DB.getOrders(200)]);
    const activeOrders={};
    orders.forEach(o=>{if(['pending','confirmed','preparing','ready'].includes(o.status)){if(!activeOrders[o.table_number])activeOrders[o.table_number]=[];activeOrders[o.table_number].push(o);}});
    if (!tables.length){grid.innerHTML=`<div style="color:var(--text3);padding:40px;text-align:center;grid-column:1/-1">No tables yet.</div>`;return;}
    const siteBase=Admin.settings.site_url||'https://YOUR-DOMAIN.com/index.html';
    grid.innerHTML=tables.map(tbl=>{
      const nfcUrl=`${siteBase}?table=${tbl.table_number}`;
      const active=activeOrders[tbl.table_number]||[];
      const statusBadge=!tbl.active?'badge-inactive':active.length?'badge-confirmed':'badge-ready';
      const statusLabel=!tbl.active?'Inactive':active.length?`Busy (${active.length})`:'Free';
      return `<div class="table-card" style="border-radius:var(--radius2)">
        <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(31,107,79,.1);border:1px solid rgba(31,107,79,.2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:var(--accent)">${tbl.table_number}</div>
            <div><div style="font-weight:700;font-size:15px">Table ${tbl.table_number}</div><div style="font-size:12px;color:var(--text2)">${tbl.capacity||4} seats</div></div>
          </div>
          <span class="badge ${statusBadge}">${statusLabel}</span>
        </div>
        ${active.length?`<div style="padding:12px 20px;background:rgba(245,158,11,.05);border-bottom:1px solid var(--border)">${active.map(o=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--accent);font-weight:600">#${o.order_number}</span><span class="badge badge-${o.status}" style="font-size:10px">${o.status}</span><span style="color:var(--text2)">${fmt(o.total)}</span><select class="status-select" style="font-size:11px;padding:3px 6px" onchange="quickUpdateStatus('${o.id}',this.value)">${['pending','confirmed','preparing','ready','done','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`).join('')}</div>`:''}
        <div style="padding:16px 20px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:600;letter-spacing:1px;text-transform:uppercase">NFC URL</div>
          <div style="display:flex;gap:8px;align-items:center">
            <code style="flex:1;font-size:11px;background:var(--dark3);padding:8px 10px;border-radius:8px;color:var(--text2);word-break:break-all">${nfcUrl}</code>
            <button class="btn btn-ghost btn-sm" onclick="copyNFCUrl('${nfcUrl}',this)">Copy</button>
          </div>
        </div>
        <div style="padding:0 20px 16px;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="openTableModal('${tbl.id}','${tbl.table_number}','${tbl.capacity||4}','${tbl.active}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTable('${tbl.id}')">🗑️</button>
          ${!tbl.active?`<button class="btn btn-success btn-sm" onclick="toggleTable('${tbl.id}',true)">Enable</button>`:`<button class="btn btn-warning btn-sm" onclick="toggleTable('${tbl.id}',false)">Disable</button>`}
        </div>
      </div>`;
    }).join('');
  } catch(e){if(grid)grid.innerHTML=`<div style="color:var(--danger);padding:40px;grid-column:1/-1">Error: ${e.message}</div>`;}
}
function copyNFCUrl(url,btn){navigator.clipboard.writeText(url).then(()=>{const orig=btn.textContent;btn.textContent='✓ Copied!';btn.style.color='#22c55e';setTimeout(()=>{btn.textContent=orig;btn.style.color='';},2000);}).catch(()=>prompt('Copy this NFC URL:',url));}
function openTableModal(id,num='',cap=4,active=true){showModal(`<div class="modal-header"><h2>${id?'Edit Table':'Add Table'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="form-group"><label class="form-label">Table Number</label><input class="form-control" id="tm_num" type="number" min="1" max="100" value="${num}" placeholder="e.g. 5" ${id?'readonly style="opacity:0.6"':''}></div><div class="form-group"><label class="form-label">Capacity (seats)</label><input class="form-control" id="tm_cap" type="number" min="1" max="20" value="${cap}"></div><div class="toggle-row"><span style="font-size:14px">Table Active</span><label class="toggle-switch"><input type="checkbox" id="tm_active" ${active==='false'?'':'checked'}><span class="toggle-slider"></span></label></div><div style="display:flex;gap:12px;margin-top:24px"><button class="btn btn-primary" onclick="saveTable('${id||''}')" style="flex:1;padding:13px">${id?'Save':'Add Table'}</button><button class="btn btn-ghost" onclick="closeModal()" style="padding:13px 20px">Cancel</button></div>`);}
async function saveTable(id){const num=parseInt(document.getElementById('tm_num').value);const cap=parseInt(document.getElementById('tm_cap').value)||4;const active=document.getElementById('tm_active').checked;if(!num||num<1){toast('Enter valid table number','error');return;}const payload={table_number:num,capacity:cap,active};if(id)payload.id=id;try{await DB.upsertTable(payload);closeModal();toast(id?'Table updated':'Table added','success');await loadTablesGrid();}catch(e){toast('Failed: '+e.message,'error');}}
async function deleteTable(id){if(!confirm('Delete this table?'))return;try{await DB.deleteTable(id);toast('Table deleted','success');await loadTablesGrid();}catch(e){toast('Failed: '+e.message,'error');}}
async function toggleTable(id,active){try{await firebase.firestore().collection('tables').doc(id).update({active});toast(`Table ${active?'enabled':'disabled'}`,'success');await loadTablesGrid();}catch{toast('Failed','error');}}

// ═══════════════════════════════════════════════════
//  SETTINGS HELPERS
// ═══════════════════════════════════════════════════
function settingField(label,key,val){return`<div class="form-group"><label class="form-label">${label}</label><input class="form-control" id="setting_${key}" value="${val||''}"></div>`;}
function renderCouponsInline(){return`<div style="display:flex;gap:8px;margin-bottom:12px"><input class="form-control" id="newCouponCode" placeholder="Code e.g. SAVE15" style="flex:1"><input class="form-control" id="newCouponPct" type="number" placeholder="%" style="width:70px"><button class="btn btn-ghost btn-sm" onclick="addCoupon()">+ Add</button></div><div id="couponList" style="font-size:13px;color:var(--text2)">Loading coupons…</div>`;}
async function loadCoupons(){try{const snap=await firebase.firestore().collection('coupons').orderBy('created_at','desc').get();const data=snap.docs.map(d=>({id:d.id,...d.data()}));const el=document.getElementById('couponList');if(!el)return;el.innerHTML=data?.length?data.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><code style="background:var(--dark3);padding:2px 8px;border-radius:4px;color:var(--accent)">${c.code}</code><span>${c.discount_pct}% off · ${c.uses}/${c.max_uses} uses</span><button class="btn btn-danger btn-xs" onclick="deleteCoupon('${c.id}')">Delete</button></div>`).join(''):'<p style="color:var(--text3)">No coupons</p>';}catch{}}
async function addCoupon(){const code=document.getElementById('newCouponCode')?.value?.trim()?.toUpperCase();const pct=parseFloat(document.getElementById('newCouponPct')?.value);if(!code||!pct){toast('Fill code and %','error');return;}try{await firebase.firestore().collection('coupons').add({code,discount_pct:pct,max_uses:1000,uses:0,active:true,created_at:firebase.firestore.FieldValue.serverTimestamp()});toast('Coupon added','success');loadCoupons();}catch{toast('Failed','error');}}
async function deleteCoupon(id){if(!confirm('Delete coupon?'))return;await firebase.firestore().collection('coupons').doc(id).delete();toast('Deleted','success');loadCoupons();}
function handleLogoUpload(input){if(!input.files||!input.files[0])return;if(input.files[0].size>2*1024*1024){toast('File too large — max 2MB','error');return;}const reader=new FileReader();reader.onload=async e=>{const b64=e.target.result;const wrap=document.getElementById('logo-preview-wrap');if(wrap)wrap.innerHTML=`<img src="${b64}" style="width:100px;height:100px;object-fit:contain;border-radius:12px;border:2px solid var(--accent);background:var(--dark3);padding:6px">`;try{await DB.updateSetting('restaurant_logo',b64);Admin.settings.restaurant_logo=b64;toast('Logo saved ✓','success');renderSettings();}catch{toast('Failed','error');}};reader.readAsDataURL(input.files[0]);}
async function removeLogo(){if(!confirm('Remove logo?'))return;try{await DB.updateSetting('restaurant_logo','');Admin.settings.restaurant_logo='';toast('Logo removed','success');renderSettings();}catch{toast('Failed','error');}}
async function saveInstapayLink(){const el=document.getElementById('setting_instapay_link');if(!el)return;try{await DB.updateSetting('instapay_link',el.value.trim());Admin.settings.instapay_link=el.value.trim();toast('InstaPay link saved ✓','success');}catch{toast('Failed','error');}}

/* ── Google Reviews settings ── */
async function saveGoogleReviewSettings(){
  const keys=['google_review_link','google_rating','google_review_count'];
  try{
    await Promise.all(keys.map(k=>{const el=document.getElementById('setting_'+k);return el?DB.updateSetting(k,el.value.trim()):null;}));
    keys.forEach(k=>{const el=document.getElementById('setting_'+k);if(el)Admin.settings[k]=el.value.trim();});
    toast('Google Reviews settings saved ✓','success');
  }catch{toast('Failed','error');}
}
function renderGoogleReviewsInline(){
  const reviews=Admin.settings.google_reviews||[];
  return `<div style="display:grid;grid-template-columns:1fr 70px 2fr auto;gap:8px;margin-bottom:12px">
    <input class="form-control" id="newReviewName" placeholder="Reviewer name">
    <input class="form-control" id="newReviewRating" type="number" min="1" max="5" placeholder="1-5">
    <input class="form-control" id="newReviewText" placeholder="Review text">
    <button class="btn btn-ghost btn-sm" onclick="addGoogleReview()">+ Add</button>
  </div>
  <div id="googleReviewsList" style="font-size:13px;color:var(--text2)">
    ${reviews.length ? reviews.map((r,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);gap:10px">
      <span style="flex:1">⭐ ${r.rating||5} — <strong>${r.name||''}</strong>: ${(r.text||'').slice(0,70)}${(r.text||'').length>70?'…':''}</span>
      <button class="btn btn-danger btn-xs" onclick="deleteGoogleReview(${i})">Delete</button>
    </div>`).join('') : '<p style="color:var(--text3)">No custom reviews yet — the site shows sample testimonials until you add real ones here.</p>'}
  </div>`;
}
async function addGoogleReview(){
  const name=document.getElementById('newReviewName')?.value?.trim();
  const rating=parseInt(document.getElementById('newReviewRating')?.value)||5;
  const text=document.getElementById('newReviewText')?.value?.trim();
  if(!name||!text){toast('Fill reviewer name and review text','error');return;}
  const reviews=[...(Admin.settings.google_reviews||[]),{name,rating:Math.min(5,Math.max(1,rating)),text,date:'Recently'}];
  try{
    await DB.updateSetting('google_reviews',reviews);
    Admin.settings.google_reviews=reviews;
    toast('Review added ✓','success');
    renderSettings();
  }catch{toast('Failed','error');}
}
async function deleteGoogleReview(idx){
  if(!confirm('Delete this review?'))return;
  const reviews=[...(Admin.settings.google_reviews||[])];
  reviews.splice(idx,1);
  try{
    await DB.updateSetting('google_reviews',reviews);
    Admin.settings.google_reviews=reviews;
    toast('Review deleted','success');
    renderSettings();
  }catch{toast('Failed','error');}
}
async function saveSettings(){const keys=['restaurant_name','restaurant_name_ar','tagline','wifi_name','wifi_pass','open_time','close_time','tax_rate','service_charge','currency_symbol','contact_whatsapp','contact_address'];try{await Promise.all(keys.map(async key=>{const el=document.getElementById('setting_'+key);if(el)await DB.updateSetting(key,el.value);}));toast('Settings saved ✓','success');}catch{toast('Failed','error');}}
async function saveAccentColor(){const color=document.getElementById('accentColorPicker').value;await DB.updateSetting('accent_color',color);Admin.settings.accent_color=color;toast('Color saved','success');}

// ═══════════════════════════════════════════════════
//  RECEIPT DESIGNER — CONFIG, TEMPLATES, SHARED RENDERER
//  (single source of truth used by BOTH the live preview
//   in the Developer Panel and the actual print output)
// ═══════════════════════════════════════════════════
const RECEIPT_DEFAULTS = {
  template:'classic', lang:'en', width:'80mm',
  font:"'Courier New',monospace",
  fontSize:12, headerSize:16, itemFontSize:11, totalFontSize:14,
  lineSpacing:1.4, sectionSpacing:10,
  dividerStyle:'dashed', textAlign:'center', boldTotals:true,
  accent:'#000000',
  logo:{ show:true, size:70, align:'center' },
  header:{
    show:true, name:true, nameAr:false, tagline:true,
    address:false, phone:false, website:false, social:false, customText:false,
    addressValue:'', phoneValue:'', websiteValue:'', socialValue:'', customTextValue:'',
  },
  orderInfo:{ show:true, orderNumber:true, date:true, time:true, table:true, orderType:true, cashier:false, waiter:false },
  customerInfo:{ show:true, name:true, phone:false, address:false },
  items:{ show:true, modifiers:true, notes:true, itemDiscount:true },
  discounts:{ show:true, discount:true, coupon:true },
  totals:{
    show:true, subtotal:true, delivery:true, tax:true, service:true, total:true,
    labels:{
      subtotal:{en:'Subtotal',ar:'المجموع الفرعي'}, discount:{en:'Discount',ar:'خصم'},
      coupon:{en:'Coupon',ar:'كوبون'}, delivery:{en:'Delivery Fee',ar:'رسوم التوصيل'},
      tax:{en:'VAT',ar:'ضريبة القيمة'}, service:{en:'Service',ar:'الخدمة'},
      total:{en:'TOTAL',ar:'الإجمالي'}, paid:{en:'Amount Paid',ar:'المدفوع'}, change:{en:'Change',ar:'الباقي'},
    }
  },
  payment:{ show:true, method:true, paid:false, change:false },
  qr:{ show:false, source:'auto', type:'google', customUrl:'', customImage:'', size:100, align:'center', labelAbove:'Enjoyed your meal?', labelBelow:'Review us on Google ⭐' },
  footer:{ show:true, blocks:['Thank you for dining with us!','See you again soon!'], showWifi:true },
  layout:['logo','header','orderInfo','customerInfo','items','discounts','totals','payment','qr','footer'],
  sectionsEnabled:{ logo:true, header:true, orderInfo:true, customerInfo:true, items:true, discounts:true, totals:true, payment:true, qr:false, footer:true },
  customCSS:'',
};

const RECEIPT_TEMPLATES = {
  classic:   { width:'80mm', font:"'Courier New',monospace", accent:'#000000', dividerStyle:'dashed', textAlign:'center', boldTotals:true },
  modern:    { width:'80mm', font:"Arial,sans-serif",         accent:'#1F6B4F', dividerStyle:'solid',  textAlign:'left',   boldTotals:true },
  minimal:   { width:'80mm', font:"Arial,sans-serif",         accent:'#000000', dividerStyle:'none',   textAlign:'left',   boldTotals:false },
  premium:   { width:'80mm', font:"Georgia,serif",            accent:'#b8860b', dividerStyle:'double', textAlign:'center', boldTotals:true },
  restaurant:{ width:'80mm', font:"'Courier New',monospace",  accent:'#c0392b', dividerStyle:'dashed', textAlign:'center', boldTotals:true },
  arabic:    { width:'80mm', font:"Arial,sans-serif",         accent:'#000000', dividerStyle:'dashed', textAlign:'center', boldTotals:true, lang:'ar' },
  compact:   { width:'58mm', font:"monospace",                accent:'#000000', dividerStyle:'dashed', textAlign:'center', boldTotals:false, fontSize:10, itemFontSize:9, totalFontSize:12, sectionSpacing:5 },
};

function rdDeepMerge(base, override){
  if (override === undefined || override === null) return Array.isArray(base) ? [...base] : (typeof base==='object' ? {...base} : base);
  if (Array.isArray(base)) return [...override];
  if (typeof base === 'object' && base !== null) {
    const out = {...base};
    for (const k in base) if (override[k] !== undefined) out[k] = rdDeepMerge(base[k], override[k]);
    return out;
  }
  return override;
}

// Returns a full, merged receipt config. Auto-migrates the old flat
// receipt_* settings (from the previous single-panel designer) once.
function getReceiptConfig(){
  const s = Admin.settings || {};
  if (!s.receipt_config) {
    const cfg = JSON.parse(JSON.stringify(RECEIPT_DEFAULTS));
    if (s.receipt_header || s.receipt_footer) cfg.footer.blocks = [s.receipt_header, s.receipt_footer].filter(Boolean);
    if (s.receipt_font) cfg.font = s.receipt_font;
    if (s.receipt_width) cfg.width = s.receipt_width;
    if (s.receipt_accent) cfg.accent = s.receipt_accent;
    if (s.receipt_show_wifi) cfg.footer.showWifi = s.receipt_show_wifi === 'yes';
    if (s.receipt_css) cfg.customCSS = s.receipt_css;
    return cfg;
  }
  return rdDeepMerge(RECEIPT_DEFAULTS, s.receipt_config);
}

function isReceiptAr(cfg){ return cfg.lang === 'ar'; }

function sampleReceiptOrder(){
  return {
    id:'preview', _isSample:true, order_number:'1048', table_number:5, order_type:'Dine-in',
    customer_name:'Ahmed Hassan', customer_phone:'0101234567', customer_address:'Avenue Mall, Obour City, Egypt',
    cashier:'Mostafa', waiter:'Sara',
    items:[
      { name:'Classic Burger', name_ar:'برجر كلاسيك', qty:2, price:200, modifiers:'Extra cheese, No pickles', notes:'', discount:0 },
      { name:'French Fries',   name_ar:'بطاطس مقلية',  qty:1, price:50,  modifiers:'', notes:'', discount:0 },
      { name:'Cola',           name_ar:'كولا',         qty:2, price:25,  modifiers:'', notes:'Extra cold', discount:0 },
    ],
    subtotal:525, discount:20, coupon_code:'SAVE10', delivery_fee:0, tax:70.7, service_charge:52.5, total:628.2,
    payment_method:'cash', amount_paid:650, change:21.8,
    created_at:new Date(),
  };
}

function receiptQrUrl(cfg, gs){
  const restName = encodeURIComponent(gs.restaurant_name||'Restaurant');
  let data = '';
  switch(cfg.qr.type){
    case 'google': data = gs.google_review_link || `https://www.google.com/search?q=${restName}+review`; break;
    case 'website': data = gs.site_url || window.location.origin; break;
    case 'menu': data = gs.site_url || (window.location.origin+'/index.html'); break;
    case 'instagram': data = gs.social_instagram || cfg.qr.customUrl || ''; break;
    case 'whatsapp': data = gs.wa_phone ? `https://wa.me/${gs.wa_phone}` : (cfg.qr.customUrl||''); break;
    case 'wifi': data = gs.wifi_name ? `WIFI:T:WPA;S:${gs.wifi_name};P:${gs.wifi_pass||''};;` : ''; break;
    default: data = cfg.qr.customUrl || '';
  }
  if (!data) data = gs.restaurant_name || 'Restaurant';
  const size = cfg.qr.size || 100;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

function rSectionLogo(cfg, order, gs){
  if (!cfg.sectionsEnabled.logo || !cfg.logo.show) return '';
  const logo = gs.restaurant_logo;
  const align = cfg.logo.align || 'center';
  const size = cfg.logo.size || 70;
  const img = logo
    ? `<img src="${logo}" style="max-width:${size}px;max-height:${size}px;object-fit:contain">`
    : `<div class="receipt-logo-placeholder" style="width:${Math.min(size,60)}px;height:${Math.min(size,60)}px;font-size:${Math.min(size,60)/2}px">${(gs.restaurant_name||'R').charAt(0)}</div>`;
  return `<div class="receipt-block receipt-logo-block" style="text-align:${align}">${img}</div>`;
}

function rSectionHeader(cfg, order, gs){
  if (!cfg.sectionsEnabled.header || !cfg.header.show) return '';
  const h = cfg.header;
  const rtl = isReceiptAr(cfg);
  const name = rtl ? (gs.restaurant_name_ar || gs.restaurant_name || '') : (gs.restaurant_name || '');
  let html = `<div class="receipt-block receipt-header-block" style="text-align:${cfg.textAlign}">`;
  if (h.name) html += `<div class="receipt-name">${name}</div>`;
  if (h.nameAr && gs.restaurant_name_ar && !rtl) html += `<div class="receipt-name-ar" dir="rtl">${gs.restaurant_name_ar}</div>`;
  if (h.tagline && gs.tagline) html += `<div class="receipt-tagline">${gs.tagline}</div>`;
  if (h.address && h.addressValue) html += `<div class="receipt-line">${h.addressValue}</div>`;
  if (h.phone && h.phoneValue) html += `<div class="receipt-line">${h.phoneValue}</div>`;
  if (h.website && h.websiteValue) html += `<div class="receipt-line">${h.websiteValue}</div>`;
  if (h.social && h.socialValue) html += `<div class="receipt-line">${h.socialValue}</div>`;
  if (h.customText && h.customTextValue) html += `<div class="receipt-line">${h.customTextValue}</div>`;
  html += `</div>`;
  return html;
}

function rSectionOrderInfo(cfg, order, gs){
  if (!cfg.sectionsEnabled.orderInfo || !cfg.orderInfo.show) return '';
  const rtl = isReceiptAr(cfg);
  const date = new Date(order.created_at?.toDate ? order.created_at.toDate() : (order.created_at || Date.now()));
  const dateStr = date.toLocaleDateString(rtl?'ar-EG':'en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const timeStr = date.toLocaleTimeString(rtl?'ar-EG':'en-GB',{hour:'2-digit',minute:'2-digit'});
  const oi = cfg.orderInfo;
  const row = (l,v) => `<div class="receipt-meta-row"><span>${l}</span><span>${v}</span></div>`;
  let rows = '';
  if (oi.orderNumber) rows += row(rtl?'رقم الطلب':'Order', `#${order.order_number}`);
  if (oi.date) rows += row(rtl?'التاريخ':'Date', dateStr);
  if (oi.time) rows += row(rtl?'الوقت':'Time', timeStr);
  if (oi.orderType) rows += row(rtl?'نوع الطلب':'Order Type', order.order_type||(rtl?'صالة':'Dine-in'));
  if (oi.table && order.table_number) rows += row(rtl?'الطاولة':'Table', order.table_number);
  if (oi.cashier && order.cashier) rows += row(rtl?'الكاشير':'Cashier', order.cashier);
  if (oi.waiter && order.waiter) rows += row(rtl?'النادل':'Waiter', order.waiter);
  if (order._merged) rows += `<div class="receipt-meta-row" style="color:${cfg.accent};font-weight:700"><span>${rtl?'طلبات مدمجة':'Merged orders'}</span><span>${order._order_count}</span></div>`;
  if (!rows) return '';
  return `<div class="receipt-block receipt-meta-block">${rows}</div>`;
}

function rSectionCustomerInfo(cfg, order, gs){
  if (!cfg.sectionsEnabled.customerInfo || !cfg.customerInfo.show) return '';
  const rtl = isReceiptAr(cfg);
  const row = (l,v) => `<div class="receipt-meta-row"><span>${l}</span><span>${v}</span></div>`;
  let rows = '';
  if (cfg.customerInfo.name && order.customer_name) rows += row(rtl?'العميل':'Customer', order.customer_name);
  if (cfg.customerInfo.phone && order.customer_phone) rows += row(rtl?'الهاتف':'Phone', order.customer_phone);
  if (cfg.customerInfo.address && order.customer_address) rows += row(rtl?'العنوان':'Address', order.customer_address);
  if (!rows) return '';
  return `<div class="receipt-block receipt-meta-block">${rows}</div>`;
}

function rSectionItems(cfg, order, gs){
  if (!cfg.sectionsEnabled.items || !cfg.items.show) return '';
  const rtl = isReceiptAr(cfg);
  const currency = gs.currency_symbol || 'ج.م';
  const fmtP = n => `${currency} ${Math.round(n||0).toLocaleString()}`;
  const rows = (order.items||[]).map(i=>{
    const nm = rtl ? (i.name_ar||i.name) : i.name;
    let extra = '';
    if (cfg.items.modifiers && i.modifiers) extra += `<div class="receipt-item-mod">${i.modifiers}</div>`;
    if (cfg.items.notes && i.notes) extra += `<div class="receipt-item-note">"${i.notes}"</div>`;
    if (cfg.items.itemDiscount && i.discount) extra += `<div class="receipt-item-disc">-${fmtP(i.discount)}</div>`;
    return `<tr><td class="ric-name">${nm||''}${extra}</td><td class="ric-qty">${i.qty}</td><td class="ric-price">${fmtP(i.price)}</td><td class="ric-total">${fmtP(i.price*i.qty)}</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `<div class="receipt-block receipt-items-block"><table class="receipt-items">
    <thead><tr><th class="ric-name">${rtl?'الصنف':'Item'}</th><th class="ric-qty">${rtl?'الكمية':'Qty'}</th><th class="ric-price">${rtl?'السعر':'Price'}</th><th class="ric-total">${rtl?'الإجمالي':'Total'}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function rSectionDiscounts(cfg, order, gs){
  if (!cfg.sectionsEnabled.discounts) return '';
  const rtl = isReceiptAr(cfg), lang = rtl?'ar':'en';
  const currency = gs.currency_symbol || 'ج.م';
  const fmtP = n => `${currency} ${Math.round(n||0).toLocaleString()}`;
  const L = cfg.totals.labels;
  let rows = '';
  if (cfg.discounts.discount && order.discount) rows += `<div class="receipt-total-row" style="color:#16a34a"><span>${L.discount[lang]}</span><span>-${fmtP(order.discount)}</span></div>`;
  if (cfg.discounts.coupon && order.coupon_code) rows += `<div class="receipt-total-row"><span>${L.coupon[lang]}</span><span>${order.coupon_code}</span></div>`;
  if (!rows) return '';
  return `<div class="receipt-block receipt-discounts-block">${rows}</div>`;
}

function rSectionTotals(cfg, order, gs){
  if (!cfg.sectionsEnabled.totals || !cfg.totals.show) return '';
  const rtl = isReceiptAr(cfg), lang = rtl?'ar':'en';
  const currency = gs.currency_symbol || 'ج.م';
  const fmtP = n => `${currency} ${Math.round(n||0).toLocaleString()}`;
  const L = cfg.totals.labels;
  let rows = '';
  if (cfg.totals.subtotal && order.subtotal!=null) rows += `<div class="receipt-total-row"><span>${L.subtotal[lang]}</span><span>${fmtP(order.subtotal)}</span></div>`;
  if (cfg.totals.delivery && order.delivery_fee) rows += `<div class="receipt-total-row"><span>${L.delivery[lang]}</span><span>${fmtP(order.delivery_fee)}</span></div>`;
  if (cfg.totals.tax && order.tax) rows += `<div class="receipt-total-row"><span>${L.tax[lang]}</span><span>${fmtP(order.tax)}</span></div>`;
  if (cfg.totals.service && order.service_charge) rows += `<div class="receipt-total-row"><span>${L.service[lang]}</span><span>${fmtP(order.service_charge)}</span></div>`;
  if (cfg.totals.total) rows += `<div class="receipt-total-row grand${cfg.boldTotals?' bold':''}"><span>${L.total[lang]}</span><span>${fmtP(order.total)}</span></div>`;
  if (!rows) return '';
  return `<div class="receipt-block receipt-totals-block">${rows}</div>`;
}

function rSectionPayment(cfg, order, gs){
  if (!cfg.sectionsEnabled.payment || !cfg.payment.show) return '';
  const rtl = isReceiptAr(cfg), lang = rtl?'ar':'en';
  const currency = gs.currency_symbol || 'ج.م';
  const fmtP = n => `${currency} ${Math.round(n||0).toLocaleString()}`;
  const L = cfg.totals.labels;
  const pmLabels = { cash:{en:'Cash',ar:'كاش'}, card:{en:'Card',ar:'بطاقة'}, instapay:{en:'InstaPay',ar:'إنستاباي'} };
  let rows = '';
  if (cfg.payment.method) { const pm = pmLabels[order.payment_method] || {en:order.payment_method||'Cash', ar:order.payment_method||'كاش'}; rows += `<div class="receipt-total-row"><span>${rtl?'طريقة الدفع':'Payment'}</span><span>${pm[lang]}</span></div>`; }
  if (cfg.payment.paid && order.amount_paid!=null) rows += `<div class="receipt-total-row"><span>${L.paid[lang]}</span><span>${fmtP(order.amount_paid)}</span></div>`;
  if (cfg.payment.change && order.change!=null) rows += `<div class="receipt-total-row"><span>${L.change[lang]}</span><span>${fmtP(order.change)}</span></div>`;
  if (order.notes) rows += `<div class="receipt-notes">${isReceiptAr(cfg)?'ملاحظة':'Note'}: ${order.notes}</div>`;
  if (!rows) return '';
  return `<div class="receipt-block receipt-payment-block">${rows}</div>`;
}

function rSectionQr(cfg, order, gs){
  if (!cfg.sectionsEnabled.qr || !cfg.qr.show) return '';
  const url = (cfg.qr.source === 'upload' && cfg.qr.customImage) ? cfg.qr.customImage : receiptQrUrl(cfg, gs);
  return `<div class="receipt-block receipt-qr-block" style="text-align:${cfg.qr.align}">
    ${cfg.qr.labelAbove?`<div class="receipt-qr-label">${cfg.qr.labelAbove}</div>`:''}
    <img src="${url}" class="receipt-qr-img" style="width:${cfg.qr.size}px;height:${cfg.qr.size}px">
    ${cfg.qr.labelBelow?`<div class="receipt-qr-label">${cfg.qr.labelBelow}</div>`:''}
  </div>`;
}

function rSectionFooter(cfg, order, gs){
  if (!cfg.sectionsEnabled.footer || !cfg.footer.show) return '';
  const blocks = (cfg.footer.blocks||[]).filter(Boolean).map(b=>`<div class="receipt-footer-line">${b}</div>`).join('');
  const wifi = cfg.footer.showWifi && gs.wifi_name ? `<div class="receipt-footer-line" style="font-size:10px;margin-top:4px">WiFi: ${gs.wifi_name}${gs.wifi_pass?' · '+gs.wifi_pass:''}</div>` : '';
  if (!blocks && !wifi) return '';
  return `<div class="receipt-block receipt-footer-block">${blocks}${wifi}</div>`;
}

const RECEIPT_SECTION_RENDERERS = {
  logo: rSectionLogo, header: rSectionHeader, orderInfo: rSectionOrderInfo,
  customerInfo: rSectionCustomerInfo, items: rSectionItems, discounts: rSectionDiscounts,
  totals: rSectionTotals, payment: rSectionPayment, qr: rSectionQr, footer: rSectionFooter,
};

const RECEIPT_SECTION_LABELS = {
  logo:'🖼️ Logo', header:'🏪 Restaurant Information', orderInfo:'🧾 Order Information',
  customerInfo:'👤 Customer Information', items:'🍽️ Items', discounts:'🏷️ Discounts',
  totals:'➕ Totals', payment:'💳 Payment Information', qr:'📱 QR Code', footer:'💬 Footer',
};

// Builds just the inner content of one .receipt block (shared by preview + print)
function buildReceiptContent(cfg, order, gs){
  const layout = (cfg.layout && cfg.layout.length) ? cfg.layout : RECEIPT_DEFAULTS.layout;
  const blocks = layout.map(id => (RECEIPT_SECTION_RENDERERS[id] ? RECEIPT_SECTION_RENDERERS[id](cfg, order, gs) : '')).filter(Boolean);
  const dividerHtml = cfg.dividerStyle === 'none' ? '' : `<div class="receipt-divider-line ds-${cfg.dividerStyle}"></div>`;
  return blocks.join(dividerHtml);
}

// Builds the <style> contents shared by preview + print
function buildReceiptStyleTag(cfg){
  const rtl = isReceiptAr(cfg);
  const logoMargin = cfg.logo.align==='center' ? '0 auto' : (cfg.logo.align==='right' ? '0 0 0 auto' : '0');
  const qrMargin = cfg.qr.align==='center' ? '0 auto' : (cfg.qr.align==='right' ? '0 0 0 auto' : '0');
  return `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${cfg.font};font-size:${cfg.fontSize}px;line-height:${cfg.lineSpacing};background:#fff;color:#111}
.receipt{width:${cfg.width};margin:0 auto;padding:14px 10px 22px;direction:${rtl?'rtl':'ltr'}}
.receipt-block{margin-bottom:${cfg.sectionSpacing}px}
.receipt-divider-line{margin:${cfg.sectionSpacing}px 0}
.ds-dashed{border-top:1px dashed #999}.ds-solid{border-top:1px solid #999}.ds-dotted{border-top:1px dotted #999}.ds-double{border-top:3px double #999}
.receipt-logo-block img,.receipt-logo-placeholder{margin:${logoMargin}}
.receipt-logo-placeholder{border-radius:50%;background:#111;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.receipt-name{font-size:${cfg.headerSize}px;font-weight:800;letter-spacing:.5px;text-transform:uppercase}
.receipt-name-ar{font-size:${cfg.headerSize-2}px;font-weight:700;margin-top:2px}
.receipt-tagline,.receipt-line{font-size:10px;color:#555;margin-top:2px}
.receipt-meta-row{display:flex;justify-content:space-between;font-size:${cfg.fontSize-1}px;margin-bottom:3px;gap:10px}
.receipt-items{width:100%;border-collapse:collapse;font-size:${cfg.itemFontSize}px}
.receipt-items th{font-size:${Math.max(8,cfg.itemFontSize-1)}px;font-weight:700;text-transform:uppercase;padding:3px 0;border-bottom:1px solid #ccc;text-align:${rtl?'right':'left'}}
.receipt-items th.ric-qty,.receipt-items td.ric-qty{text-align:center}
.receipt-items th.ric-price,.receipt-items td.ric-price,.receipt-items th.ric-total,.receipt-items td.ric-total{text-align:${rtl?'left':'right'}}
.receipt-items td{padding:4px 0;vertical-align:top}
.receipt-items tr+tr td{border-top:1px dotted #e5e5e5}
.receipt-item-mod,.receipt-item-note{font-size:${Math.max(8,cfg.itemFontSize-2)}px;color:#666;margin-top:1px}
.receipt-item-disc{font-size:${Math.max(8,cfg.itemFontSize-2)}px;color:#16a34a}
.receipt-total-row{display:flex;justify-content:space-between;font-size:${cfg.fontSize-1}px;padding:2px 0;gap:10px}
.receipt-total-row.grand{font-size:${cfg.totalFontSize}px;font-weight:${cfg.boldTotals?800:600};padding:6px 0 2px;border-top:2px solid ${cfg.accent};margin-top:4px;color:${cfg.accent}}
.receipt-notes{font-size:10px;color:#555;font-style:italic;margin-top:4px;text-align:center}
.receipt-qr-block{margin:${cfg.sectionSpacing}px 0;text-align:center}
.receipt-qr-label{font-size:11px;font-weight:600;margin:4px 0}
.receipt-qr-img{margin:${qrMargin}}
.receipt-footer-block{text-align:center;font-size:10px;color:#666;border-top:1px dashed #ccc;padding-top:10px;margin-top:6px}
.receipt-footer-line{margin-bottom:2px}
@media print{ body{margin:0} .receipt{width:auto;padding:4px} button{display:none!important} }
${cfg.customCSS||''}
`;
}


function printSingleReceipt(orderId){const o=Admin.orders.find(x=>x.id===orderId);if(o)openPrintWindow([o]);}
function printSelectedReceipts() {
  const ids = getSelectedOrderIds();
  if (!ids.length) { toast('Select at least one order to print', 'error'); return; }
  const selected = ids.map(id => Admin.orders.find(o => o.id === id)).filter(Boolean);
  if (!selected.length) { toast('Orders not found', 'error'); return; }
  openPrintWindow(selected);
}

// Normalize a real Firestore order into the shape the receipt renderer expects
function normalizeOrderForReceipt(o){
  return {
    order_number: o.order_number, table_number: o.table_number,
    order_type: o.order_type || (o.table_number ? 'Dine-in' : 'Takeaway'),
    customer_name: o.customer_name, customer_phone: o.customer_phone, customer_address: o.customer_address,
    cashier: o.cashier, waiter: o.waiter,
    items: (o.items||[]).map(i => ({ name:i.name, name_ar:i.name_ar, qty:i.qty, price:i.price, modifiers:i.modifiers||i.notes_item||'', notes:i.notes||'', discount:i.discount||0 })),
    subtotal: o.subtotal, discount: o.discount, coupon_code: o.coupon_code,
    delivery_fee: o.delivery_fee, tax: o.tax, service_charge: o.service_charge, total: o.total,
    payment_method: o.payment_method, amount_paid: o.amount_paid, change: o.change,
    notes: o.notes, _merged: o._merged, _order_count: o._order_count,
    created_at: o.created_at || Date.now(),
  };
}

// Print one or more real orders (or preview/sample orders) using the shared receipt renderer.
// cfgOverride lets the Receipt Designer print a live, unsaved draft or a forced width (58mm/80mm test print).
function openPrintWindow(orders, cfgOverride){
  const cfg = cfgOverride || getReceiptConfig();
  const gs = Admin.settings || {};
  const normalized = orders.map(o => o.id === 'preview' || o._isSample ? o : normalizeOrderForReceipt(o));
  const receiptsHtml = normalized.map((o,idx) => `<div class="receipt${idx<normalized.length-1?' page-break':''}">${buildReceiptContent(cfg,o,gs)}</div>`).join('');
  const styleTag = buildReceiptStyleTag(cfg);

  // Use a hidden iframe instead of popup — works even with popup blockers
  let printFrame = document.getElementById('_printFrame');
  if (printFrame) printFrame.remove();
  printFrame = document.createElement('iframe');
  printFrame.id = '_printFrame';
  printFrame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff';
  document.body.appendChild(printFrame);
  const fdoc = printFrame.contentDocument || printFrame.contentWindow.document;
  fdoc.open();
  fdoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipts</title><style>${styleTag}.page-break{page-break-after:always;border-bottom:3px dashed #ccc;margin-bottom:24px;padding-bottom:24px}</style></head><body><div style="text-align:center;padding:16px 0 12px;border-bottom:2px solid #eee;margin-bottom:16px" class="_print-toolbar"><button onclick="window.print()" style="padding:10px 32px;background:#111;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px">🖨️ Print Receipt</button><div style="font-size:11px;color:#999;margin-top:4px">Printed ${new Date().toLocaleString()} · ${normalized.length} receipt${normalized.length>1?'s':''} · ${cfg.width}</div></div>${receiptsHtml}<style>@media print{._print-toolbar{display:none!important}}</style></body></html>`);
  fdoc.close();
  // Add close button inside the frame
  const closeBtn = fdoc.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = 'position:fixed;top:12px;right:12px;padding:8px 18px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;z-index:10000';
  closeBtn.onclick = () => { printFrame.remove(); };
  fdoc.body.appendChild(closeBtn);
}

// ═══════════════════════════════════════════════════
//  MODAL + TOAST + HELPERS
// ═══════════════════════════════════════════════════
function showModal(html){document.getElementById('modal-root').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;setTimeout(()=>{const el=document.getElementById('couponList');if(el)loadCoupons();},50);}
function closeModal(){document.getElementById('modal-root').innerHTML='';}
function toast(msg,type='info',dur=3000){const root=document.getElementById('toast-root');const el=document.createElement('div');el.className=`toast toast-${type}`;el.textContent=msg;root.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .4s';setTimeout(()=>el.remove(),400);},dur);}
function timeAgo(dateVal){if(!dateVal)return'—';const ts=dateVal?.toDate?dateVal.toDate():new Date(dateVal);const diff=Date.now()-ts.getTime();const m=Math.floor(diff/60000);if(m<1)return'Just now';if(m<60)return`${m}m ago`;const h=Math.floor(m/60);if(h<24)return`${h}h ago`;return Math.floor(h/24)+'d ago';}

// ═══════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',async()=>{
  await checkAuth();
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
});

// ═══════════════════════════════════════════════════
//  DEVELOPER PANEL
// ═══════════════════════════════════════════════════
const DEV_USER = 'beshoy';
const DEV_PASS = '1959';
let devUnlocked = false;

function openDevPanel() {
  const overlay = document.getElementById('dev-lock-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('devUser').focus(), 100);
}

function closeDevLock() {
  document.getElementById('dev-lock-overlay').style.display = 'none';
  document.getElementById('devErr').style.display = 'none';
  document.getElementById('devUser').value = '';
  document.getElementById('devPass').value = '';
}

function devLogin() {
  const user = document.getElementById('devUser').value.trim().toLowerCase();
  const pass = document.getElementById('devPass').value.trim();
  if (user === DEV_USER && pass === DEV_PASS) {
    closeDevLock();
    devUnlocked = true;
    showDevPanel();
  } else {
    document.getElementById('devErr').style.display = 'block';
    document.getElementById('devPass').value = '';
  }
}

function showDevPanel() {
  const panel = document.getElementById('dev-panel');
  panel.style.display = 'block';
  document.body.style.overflow = 'hidden';
  devLoadCurrentValues();
}


function devLandingModeChanged(kind) {
  const mode = document.getElementById(`dev_${kind}_video_mode`)?.value || 'template';
  const tw = document.getElementById(`dev_${kind}_template_wrap`);
  const uw = document.getElementById(`dev_${kind}_upload_wrap`);
  if (tw) tw.style.display = mode === 'template' ? '' : 'none';
  if (uw) uw.style.display = mode === 'upload' ? '' : 'none';
}
async function devSaveLandingVideos() {
  try {
    const enabled = document.getElementById('dev_landing_videos_enabled')?.checked ? 'yes' : 'no';
    const payload = {
      landing_videos_enabled: enabled,
      landing_order_video_mode: document.getElementById('dev_order_video_mode')?.value || 'template',
      landing_order_video_template: document.getElementById('dev_order_video_template')?.value || 'order_steps',
      landing_book_video_mode: document.getElementById('dev_book_video_mode')?.value || 'template',
      landing_book_video_template: document.getElementById('dev_book_video_template')?.value || 'book_steps'
    };
    for (const [k,v] of Object.entries(payload)) { await DB.updateSetting(k,v); Admin.settings[k]=v; }
    for (const kind of ['order','book']) {
      const mode = payload[`landing_${kind}_video_mode`];
      if (mode === 'upload') {
        const file = document.getElementById(`dev_${kind}_video_file`)?.files?.[0];
        if (file) {
          toast(`Uploading ${kind} tutorial…`, 'info');
          const url = await DB.uploadLandingVideo(file, kind);
          const key = `landing_${kind}_video_url`;
          await DB.updateSetting(key, url); Admin.settings[key]=url;
        }
      }
    }
    toast('Landing page tutorials saved ✓','success');
    devLandingModeChanged('order'); devLandingModeChanged('book');
    devLoadCurrentValues();
  } catch(e) { toast('Landing video save failed: '+e.message,'error'); }
}
function previewLandingTutorial(kind) {
  const mode = document.getElementById(`dev_${kind}_video_mode`)?.value || 'template';
  if (mode === 'upload') {
    const file = document.getElementById(`dev_${kind}_video_file`)?.files?.[0];
    if (file) { const url=URL.createObjectURL(file); showLandingVideoPreview(url, kind, true); return; }
    const url=Admin.settings?.[`landing_${kind}_video_url`];
    if (url) { showLandingVideoPreview(url, kind, false); return; }
  }
  const template = document.getElementById(`dev_${kind}_video_template`)?.value || (kind==='order'?'order_steps':'book_steps');
  showLandingTemplatePreview(template, kind);
}
function showLandingVideoPreview(url, kind, revoke) {
  const title = kind==='order' ? 'How to Order' : 'How to Book a Table';
  const root=document.getElementById('modal-root') || document.body;
  const wrap=document.createElement('div'); wrap.className='modal-overlay';
  wrap.innerHTML=`<div class="modal" style="max-width:860px;padding:18px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="margin:0">${title}</h2><button class="cart-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div><video src="${url}" controls autoplay muted playsinline style="width:100%;max-height:65vh;border-radius:14px;background:#000"></video></div>`;
  root.appendChild(wrap);
  if(revoke) wrap.querySelector('video').addEventListener('ended',()=>URL.revokeObjectURL(url),{once:true});
}
function showLandingTemplatePreview(template, kind) {
  const title = kind==='order' ? 'How to Order' : 'How to Book a Table';
  const data = landingTemplateData(template);
  const root=document.getElementById('modal-root') || document.body;
  const wrap=document.createElement('div'); wrap.className='modal-overlay';
  wrap.innerHTML=`<div class="modal" style="max-width:720px;padding:18px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h2 style="margin:0">${title}</h2><button class="cart-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div><div class="landing-animation ${data.theme}" style="border-radius:16px;overflow:hidden"><div class="la-title">${data.title}</div><div class="la-steps">${data.steps.map((x,i)=>`<div class="la-step" style="--i:${i}"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div><div class="la-caption">${data.caption}</div></div></div>`;
  root.appendChild(wrap);
}
function landingTemplateData(template) {
  const all={
    order_steps:{title:'How to Order',steps:[['1','Open the Menu'],['2','Choose Your Food'],['3','Customize'],['4','Checkout'],['5','Enjoy']],caption:'Simple, quick, delicious.',theme:'la-green'},
    order_fast:{title:'Fast Ordering',steps:[['1','Browse'],['2','Add'],['3','Checkout'],['4','Done']],caption:'Your favorite food in a few taps.',theme:'la-orange'},
    order_table:{title:'Scan & Order at Your Table',steps:[['1','Scan QR'],['2','Browse Menu'],['3','Order'],['4','Relax']],caption:'No waiting. We bring it to you.',theme:'la-green'},
    order_premium:{title:'Premium Ordering Experience',steps:[['🍽','Discover'],['✦','Customize'],['✓','Confirm'],['♥','Enjoy']],caption:'Made around your taste.',theme:'la-dark'},
    book_steps:{title:'Book a Table',steps:[['1','Choose Date'],['2','Choose Time'],['3','Guests'],['4','Confirm'],['5','Arrive']],caption:'Reserve your table in seconds.',theme:'la-green'},
    book_simple:{title:'Simple Reservation',steps:[['1','Date'],['2','Time'],['3','Guests'],['4','Confirm']],caption:'We will have your table ready.',theme:'la-orange'},
    book_premium:{title:'Premium Dinner Reservation',steps:[['✦','Choose Date'],['◷','Choose Time'],['♟','Select Guests'],['✓','Confirm']],caption:'Make your next dinner special.',theme:'la-dark'},
    book_arrival:{title:'Reserve → Arrive → Enjoy',steps:[['1','Reserve'],['2','Get Confirmation'],['3','Arrive'],['4','Enjoy']],caption:'A smoother dining experience starts here.',theme:'la-green'}
  }; return all[template]||all.order_steps;
}

function closeDevPanel() {
  document.getElementById('dev-panel').style.display = 'none';
  document.body.style.overflow = '';
}

function devLoadCurrentValues() {
  const s = Admin.settings || {};
  const fields = [
    'restaurant_name','restaurant_name_ar','restaurant_icon','tagline',
    'open_time','close_time','hero_title1','hero_title2','hero_subtitle',
    'stat1_num','stat1_label','stat2_num','stat2_label','stat3_num','stat3_label',
    'wifi_name','wifi_pass'
  ];
  fields.forEach(key => {
    const el = document.getElementById('dev_' + key);
    if (el && s[key] !== undefined) el.value = s[key];
  });
  const lm = ['order','book'];
  lm.forEach(kind=>{
    const modeEl=document.getElementById(`dev_${kind}_video_mode`);
    const tplEl=document.getElementById(`dev_${kind}_video_template`);
    if(modeEl) modeEl.value=s[`landing_${kind}_video_mode`]||'template';
    if(tplEl) tplEl.value=s[`landing_${kind}_video_template`]||(kind==='order'?'order_steps':'book_steps');
    const cur=document.getElementById(`dev_${kind}_video_current`); if(cur) cur.textContent=s[`landing_${kind}_video_url`]? '✓ Uploaded video saved' : 'No uploaded video';
    devLandingModeChanged(kind);
  });
  const lev=document.getElementById('dev_landing_videos_enabled'); if(lev) lev.checked=(s.landing_videos_enabled||'yes')==='yes';
  // Colors
  const colorMap = {
    'dev_accent_color': s.accent_color || '#1F6B4F',
    'dev_bg_color': s.bg_color || '#ffffff',
    'dev_card_color': s.card_color || '#f5f3ff',
    'dev_text_color': s.text_color || '#1a1a2e',
    'dev_text2_color': s.text2_color || '#4b4b6a',
    'dev_border_color': s.border_color || '#ddd6fe',
  };
  Object.entries(colorMap).forEach(([id, val]) => {
    const picker = document.getElementById(id);
    const hex = document.getElementById(id + '_hex');
    if (picker) picker.value = val;
    if (hex) hex.value = val;
  });
  // sync color picker ↔ hex input
  Object.keys(colorMap).forEach(id => {
    const picker = document.getElementById(id);
    const hex = document.getElementById(id + '_hex');
    if (picker && hex) {
      picker.oninput = () => { hex.value = picker.value; };
      hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value; };
    }
  });
  // Selects
  if (s.hero_font) { const el=document.getElementById('dev_hero_font'); if(el) el.value = s.hero_font; }
  if (s.body_font) { const el=document.getElementById('dev_body_font'); if(el) el.value = s.body_font; }
  if (s.card_radius) { const el=document.getElementById('dev_card_radius'); if(el) el.value = s.card_radius; }
  if (s.btn_radius) { const el=document.getElementById('dev_btn_radius'); if(el) el.value = s.btn_radius; }
  if (s.custom_css) { const el=document.getElementById('dev_custom_css'); if(el) el.value = s.custom_css; }
  // Logo preview
  if (s.restaurant_logo) {
    const preview = document.getElementById('dev-logo-preview');
    if (preview) preview.innerHTML = `<img src="${s.restaurant_logo}" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`;
  }
  if (s.restaurant_icon) { const el=document.getElementById('dev_nav_icon'); if(el) el.value = s.restaurant_icon; }
  if (s.tagline) { const el=document.getElementById('dev_footer_tagline'); if(el) el.value = s.tagline; }
  if (s.restaurant_logo) { const el=document.getElementById('dev_logo_url'); if(el && s.restaurant_logo.startsWith('http')) el.value = s.restaurant_logo; }
}

async function devSaveSection(keys, inputIds = null) {
  try {
    await Promise.all(keys.map((k, i) => {
      const id = inputIds ? inputIds[i] : ('dev_' + k);
      const el = document.getElementById(id);
      return el ? DB.updateSetting(k, el.value.trim()) : null;
    }));
    Object.assign(Admin.settings, Object.fromEntries(keys.map((k,i) => {
      const id = inputIds ? inputIds[i] : ('dev_' + k);
      const el = document.getElementById(id);
      return [k, el ? el.value.trim() : ''];
    })));
    toast('Saved ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devSaveColors() {
  try {
    const colorKeys = ['accent_color','bg_color','card_color','text_color','text2_color','border_color'];
    const inputIds  = ['dev_accent_color_hex','dev_bg_color_hex','dev_card_color_hex','dev_text_color_hex','dev_text2_color_hex','dev_border_color_hex'];
    await Promise.all(colorKeys.map((k, i) => {
      const el = document.getElementById(inputIds[i]);
      const val = el ? el.value.trim() : '';
      if (val) { Admin.settings[k] = val; return DB.updateSetting(k, val); }
    }));
    toast('Colors saved — reload customer site to see ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

function devApplyColorTheme(accent, bg, card, text, text2, border) {
  const map = { accent, bg, card, text, text2, border };
  const inputMap = {
    accent: ['dev_accent_color', 'dev_accent_color_hex'],
    bg:     ['dev_bg_color',     'dev_bg_color_hex'],
    card:   ['dev_card_color',   'dev_card_color_hex'],
    text:   ['dev_text_color',   'dev_text_color_hex'],
    text2:  ['dev_text2_color',  'dev_text2_color_hex'],
    border: ['dev_border_color', 'dev_border_color_hex'],
  };
  Object.entries(map).forEach(([key, val]) => {
    const [pickerId, hexId] = inputMap[key];
    const picker = document.getElementById(pickerId);
    const hex    = document.getElementById(hexId);
    if (picker) picker.value = val;
    if (hex)    hex.value    = val;
  });
  toast('Theme applied — click Save All Colors to persist', 'info');
}

async function devSaveTypography() {
  try {
    const fields = [
      ['hero_font','dev_hero_font'],
      ['body_font','dev_body_font'],
      ['card_radius','dev_card_radius'],
      ['btn_radius','dev_btn_radius'],
    ];
    await Promise.all(fields.map(([k, id]) => {
      const el = document.getElementById(id);
      if (el) { Admin.settings[k] = el.value; return DB.updateSetting(k, el.value); }
    }));
    toast('Typography saved ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devSaveCustomCSS() {
  try {
    const el = document.getElementById('dev_custom_css');
    const css = el ? el.value : '';
    await DB.updateSetting('custom_css', css);
    Admin.settings.custom_css = css;
    toast('Custom CSS saved — reload customer site ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devSaveLogoUrl() {
  try {
    const url = document.getElementById('dev_logo_url')?.value?.trim();
    const icon = document.getElementById('dev_nav_icon')?.value?.trim();
    if (url) { await DB.updateSetting('restaurant_logo', url); Admin.settings.restaurant_logo = url; }
    if (icon) { await DB.updateSetting('restaurant_icon', icon); Admin.settings.restaurant_icon = icon; }
    toast('Logo saved ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

function devHandleLogoUpload(input) {
  if (!input.files || !input.files[0]) return;
  if (input.files[0].size > 3 * 1024 * 1024) { toast('File too large — max 3MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const b64 = e.target.result;
    const preview = document.getElementById('dev-logo-preview');
    if (preview) preview.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`;
    try {
      await DB.updateSetting('restaurant_logo', b64);
      Admin.settings.restaurant_logo = b64;
      toast('Logo uploaded & saved ✓', 'success');
    } catch(e) { toast('Failed: ' + e.message, 'error'); }
  };
  reader.readAsDataURL(input.files[0]);
}

async function devRemoveLogo() {
  try {
    await DB.updateSetting('restaurant_logo', '');
    Admin.settings.restaurant_logo = '';
    const preview = document.getElementById('dev-logo-preview');
    if (preview) preview.innerHTML = '🏪';
    toast('Logo removed ✓', 'success');
  } catch(e) { toast('Failed', 'error'); }
}

async function devResetAllSettings() {
  if (!confirm('Reset ALL design settings to defaults? This cannot be undone.')) return;
  const defaults = {
    accent_color:'#1F6B4F', bg_color:'#ffffff', card_color:'#f7faf8',
    text_color:'#16231c', text2_color:'#52645a', border_color:'#d7e5dc',
    hero_font:'Playfair Display', body_font:'Inter', card_radius:'20px', btn_radius:'50px',
    hero_title1:'Taste the heart of', hero_title2:'Zahrat Elmadina.',
    hero_subtitle:'A warm dining experience with delicious food, great coffee, and memorable moments.',
    tagline:'Authentic flavors, warm moments.',
    custom_css:'', restaurant_icon:'🌿', restaurant_name:'Zahrat Elmadina Restaurant & Cafe', restaurant_name_ar:'مطعم وكافيه زهرة المدينة', contact_address:'Avenue Mall, Obour City, Egypt', open_time:'10:00 AM', close_time:'12:00 AM', wifi_name:'Zahrat_Guest', wifi_pass:'Ask staff for Wi-Fi password',
  };
  try {
    await Promise.all(Object.entries(defaults).map(([k,v]) => DB.updateSetting(k,v)));
    Object.assign(Admin.settings, defaults);
    devLoadCurrentValues();
    toast('Reset to defaults ✓', 'success');
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function devExportSettings() {
  const snap = await firebase.firestore().collection('settings').doc('main').get();
  const data = snap.exists ? snap.data() : {};
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zahrat-elmadina-settings.json';
  a.click();
  toast('Settings exported ✓', 'success');
}

function devImportSettings() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!confirm(`Import ${Object.keys(data).length} settings? This will overwrite current values.`)) return;
      await Promise.all(Object.entries(data).map(([k,v]) => DB.updateSetting(k, v)));
      Object.assign(Admin.settings, data);
      devLoadCurrentValues();
      toast('Settings imported ✓', 'success');
    } catch(e) { toast('Invalid JSON file', 'error'); }
  };
  input.click();
}

// ═══════════════════════════════════════════════════
//  RECEIPT DESIGNER (Developer Panel) — drag & drop UI
// ═══════════════════════════════════════════════════
let _receiptDraft = null;
let _receiptTab = 'templates';

function rdGet(path){ return path.split('.').reduce((o,k)=>(o==null?o:o[k]), _receiptDraft); }
function rdSet(path, value){
  const keys = path.split('.');
  let obj = _receiptDraft;
  for (let i=0;i<keys.length-1;i++) obj = obj[keys[i]];
  obj[keys[keys.length-1]] = value;
  renderReceiptPreview();
}
function rdToggleRow(label, path, hint){
  const checked = rdGet(path) ? 'checked' : '';
  return `<div class="rd-toggle-row"><div><div class="rd-tlabel">${label}</div>${hint?`<div class="rd-thint">${hint}</div>`:''}</div><label class="rd-toggle"><input type="checkbox" ${checked} onchange="rdSet('${path}', this.checked)"><span class="rd-toggle-slider"></span></label></div>`;
}
function rdToggleShowRow(label, path){
  const checked = rdGet(path) ? 'checked' : '';
  return `<div class="rd-toggle-row"><div class="rd-tlabel">${label}</div><label class="rd-toggle"><input type="checkbox" ${checked} onchange="rdSet('${path}', this.checked); switchReceiptTab(_receiptTab)"><span class="rd-toggle-slider"></span></label></div>`;
}
function rdTextRow(label, path, placeholder){
  const val = (rdGet(path)||'')+'';
  return `<div class="dev-field" style="margin-top:10px"><label>${label}</label><input class="dev-input" value="${val.replace(/"/g,'&quot;')}" placeholder="${placeholder||''}" oninput="rdSet('${path}', this.value)"></div>`;
}
function rdRangeRow(label, path, min, max, step, unit){
  const val = rdGet(path);
  const isFloat = step && step < 1;
  return `<div class="dev-field" style="margin-top:10px"><label>${label}</label><div class="rd-range-row"><input type="range" min="${min}" max="${max}" step="${step||1}" value="${val}" oninput="rdSet('${path}', ${isFloat?'parseFloat(this.value)':'parseInt(this.value)'}); this.nextElementSibling.textContent=this.value+'${unit||''}'"><span class="rd-range-val">${val}${unit||''}</span></div></div>`;
}
function rdSelectRow(label, path, options){
  const val = rdGet(path);
  return `<div class="dev-field" style="margin-top:10px"><label>${label}</label><select class="dev-input" onchange="rdSet('${path}', this.value); switchReceiptTab(_receiptTab)">${options.map(([v,l])=>`<option value="${v}" ${v===val?'selected':''}>${l}</option>`).join('')}</select></div>`;
}
function rdAlignGroup(path){
  const val = rdGet(path);
  const opts = [['left','◀ Left'],['center','↔ Center'],['right','Right ▶']];
  return `<div class="rd-align-group">${opts.map(([v,l])=>`<button type="button" class="rd-align-btn${v===val?' active':''}" onclick="rdSet('${path}','${v}');switchReceiptTab(_receiptTab)">${l}</button>`).join('')}</div>`;
}
const rdLabel = txt => `<label style="font-size:11px;font-weight:700;color:#1F6B4F;text-transform:uppercase;letter-spacing:1px;display:block;margin:12px 0 6px">${txt}</label>`;

function renderReceiptTabPanel(tab){
  const cfg = _receiptDraft;
  switch(tab){
    case 'templates':
      return `<div class="rd-templates">${Object.keys(RECEIPT_TEMPLATES).map(k=>`<button class="rd-template-chip${cfg.template===k?' active':''}" onclick="applyReceiptTemplate('${k}')">${k.charAt(0).toUpperCase()+k.slice(1)}</button>`).join('')}</div>
        <p style="color:#7a6a9a;font-size:12.5px;line-height:1.6">Pick a starting look, then fine-tune it in any tab above. Templates just set sensible defaults — nothing is locked.</p>`;
    case 'logo':
      return `${rdToggleShowRow('Show logo on receipt', 'logo.show')}
        ${cfg.logo.show ? `<div class="rd-sub">
          ${rdRangeRow('Logo size', 'logo.size', 30, 140, 2, 'px')}
          ${rdLabel('Alignment')}${rdAlignGroup('logo.align')}
          <p style="color:#7a6a9a;font-size:11.5px;margin-top:12px">Uses the logo from the "Logo &amp; Favicon" section above — upload or change it there and it appears here automatically.</p>
        </div>` : ''}`;
    case 'header': { const h=cfg.header; return `${rdToggleShowRow('Show restaurant header', 'header.show')}
        ${h.show ? `<div class="rd-sub">
          ${rdToggleRow('Restaurant name (EN)', 'header.name')}
          ${rdToggleRow('Restaurant name (AR)', 'header.nameAr')}
          ${rdToggleRow('Tagline', 'header.tagline')}
          ${rdToggleRow('Address', 'header.address')}${h.address?rdTextRow('Address text','header.addressValue','Avenue Mall, Obour City, Egypt'):''}
          ${rdToggleRow('Phone', 'header.phone')}${h.phone?rdTextRow('Phone text','header.phoneValue','+20 100 000 0000'):''}
          ${rdToggleRow('Website', 'header.website')}${h.website?rdTextRow('Website text','header.websiteValue','www.zahratelmadina.com'):''}
          ${rdToggleRow('Social media', 'header.social')}${h.social?rdTextRow('Social text','header.socialValue','@zahratelmadina'):''}
          ${rdToggleRow('Custom header text', 'header.customText')}${h.customText?rdTextRow('Custom text','header.customTextValue',''):''}
        </div>` : ''}`; }
    case 'orderInfo': { const oi=cfg.orderInfo; return `${rdToggleShowRow('Show order information', 'orderInfo.show')}
        ${oi.show ? `<div class="rd-sub">
          ${rdToggleRow('Order number','orderInfo.orderNumber')}
          ${rdToggleRow('Date','orderInfo.date')}
          ${rdToggleRow('Time','orderInfo.time')}
          ${rdToggleRow('Order type (dine-in / takeaway)','orderInfo.orderType')}
          ${rdToggleRow('Table number','orderInfo.table')}
          ${rdToggleRow('Cashier','orderInfo.cashier')}
          ${rdToggleRow('Waiter','orderInfo.waiter')}
        </div>` : ''}`; }
    case 'customerInfo': { const ci=cfg.customerInfo; return `${rdToggleShowRow('Show customer information', 'customerInfo.show')}
        ${ci.show ? `<div class="rd-sub">
          ${rdToggleRow('Customer name','customerInfo.name')}
          ${rdToggleRow('Customer phone','customerInfo.phone')}
          ${rdToggleRow('Customer address','customerInfo.address')}
        </div>` : ''}`; }
    case 'items': { const it=cfg.items; return `${rdToggleShowRow('Show ordered items', 'items.show')}
        ${it.show ? `<div class="rd-sub">
          ${rdToggleRow('Modifiers / add-ons','items.modifiers')}
          ${rdToggleRow('Item notes','items.notes')}
          ${rdToggleRow('Per-item discount','items.itemDiscount')}
        </div>` : ''}`; }
    case 'discounts':
      return `${rdToggleShowRow('Show discounts section', 'discounts.show')}
        ${cfg.discounts.show ? `<div class="rd-sub">
          ${rdToggleRow('Order discount','discounts.discount')}
          ${rdToggleRow('Coupon code','discounts.coupon')}
        </div>` : ''}`;
    case 'totals': { const to=cfg.totals; return `${rdToggleShowRow('Show totals section', 'totals.show')}
        ${to.show ? `<div class="rd-sub">
          ${rdToggleRow('Subtotal','totals.subtotal')}
          ${rdToggleRow('Delivery fee','totals.delivery')}
          ${rdToggleRow('Tax / VAT','totals.tax')}
          ${rdToggleRow('Service fee','totals.service')}
          ${rdToggleRow('Grand total','totals.total')}
        </div>
        <div class="rd-sub" style="margin-top:10px">
          ${rdLabel('Labels (EN / AR)')}
          ${['subtotal','discount','coupon','delivery','tax','service','total','paid','change'].map(k=>`
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <input class="dev-input" style="font-size:12px;padding:8px 10px" value="${(to.labels[k].en||'').replace(/"/g,'&quot;')}" oninput="rdSet('totals.labels.${k}.en', this.value)" placeholder="${k} (EN)">
              <input class="dev-input" style="font-size:12px;padding:8px 10px" dir="rtl" value="${(to.labels[k].ar||'').replace(/"/g,'&quot;')}" oninput="rdSet('totals.labels.${k}.ar', this.value)" placeholder="${k} (AR)">
            </div>`).join('')}
        </div>` : ''}`; }
    case 'payment': { const pm=cfg.payment; return `${rdToggleShowRow('Show payment information', 'payment.show')}
        ${pm.show ? `<div class="rd-sub">
          ${rdToggleRow('Payment method','payment.method')}
          ${rdToggleRow('Amount paid','payment.paid')}
          ${rdToggleRow('Change due','payment.change')}
        </div>` : ''}`; }
    case 'qr': { const qr=cfg.qr; return `${rdToggleShowRow('Show QR code', 'qr.show')}
        ${qr.show ? `<div class="rd-sub">
          ${rdLabel('QR source')}
          <div class="rd-align-group">
            <button type="button" class="rd-align-btn${qr.source!=='upload'?' active':''}" onclick="rdSet('qr.source','auto');switchReceiptTab('qr')">⚡ Auto-generate</button>
            <button type="button" class="rd-align-btn${qr.source==='upload'?' active':''}" onclick="rdSet('qr.source','upload');switchReceiptTab('qr')">📁 Upload image</button>
          </div>
          ${qr.source==='upload' ? `
            <div style="margin-top:14px">
              ${qr.customImage?`<img src="${qr.customImage}" style="width:90px;height:90px;object-fit:contain;background:#fff;border-radius:8px;padding:6px;margin-bottom:10px;display:block">`:''}
              <label style="display:inline-flex;align-items:center;gap:8px;padding:9px 16px;background:#1a0a2e;border:1px solid #4c1d95;border-radius:12px;cursor:pointer;font-size:12.5px;color:#a855f7;font-weight:600">
                <input type="file" accept="image/*" style="display:none" onchange="rdHandleQrUpload(this)">
                📁 ${qr.customImage?'Replace QR image':'Upload QR image'}
              </label>
              ${qr.customImage?`<button class="dev-btn small secondary" style="margin-left:8px" onclick="rdSet('qr.customImage','');switchReceiptTab('qr')">Remove</button>`:''}
              <p style="color:#7a6a9a;font-size:11.5px;margin-top:10px">Upload a QR code image you generated elsewhere (e.g. your Google review QR). It's printed exactly as uploaded — nothing is auto-generated.</p>
            </div>
          ` : `
            ${rdSelectRow('QR links to', 'qr.type', [['google','Google Reviews'],['website','Restaurant Website'],['menu','Online Menu'],['instagram','Instagram'],['whatsapp','WhatsApp'],['wifi','Wi-Fi'],['custom','Custom URL']])}
            ${qr.type==='custom'?rdTextRow('Custom URL','qr.customUrl','https://...'):''}
            <p style="color:#7a6a9a;font-size:11.5px;margin-top:-4px">Generated automatically as an image from a QR code API — needs an internet connection to load.</p>
          `}
          ${rdRangeRow('QR size','qr.size',60,200,5,'px')}
          ${rdLabel('Alignment')}${rdAlignGroup('qr.align')}
          ${rdTextRow('Label above QR','qr.labelAbove','Enjoyed your meal?')}
          ${rdTextRow('Label below QR','qr.labelBelow','Review us on Google ⭐')}
        </div>` : ''}`; }
    case 'footer': { const f=cfg.footer; return `${rdToggleShowRow('Show footer', 'footer.show')}
        ${f.show ? `<div class="rd-sub">
          ${rdToggleRow('Show WiFi name & password','footer.showWifi')}
          ${rdLabel('Footer message blocks')}
          <div id="rdFooterBlocks">${f.blocks.map((b,i)=>`
            <div class="rd-footer-block-row">
              <input class="dev-input" value="${(b||'').replace(/"/g,'&quot;')}" oninput="rdSetFooterBlock(${i}, this.value)">
              <button class="dev-btn small secondary" onclick="rdRemoveFooterBlock(${i})">✕</button>
            </div>`).join('')}</div>
          <button class="dev-btn small secondary" onclick="rdAddFooterBlock()">+ Add footer line</button>
        </div>` : ''}`; }
    case 'layout':
      return `<p style="color:#7a6a9a;font-size:12.5px;margin-bottom:14px">Drag sections to reorder the receipt. Turn a section off to hide it — its settings are remembered in its own tab.</p>
        <div class="rd-drag-list" id="rdDragList">
          ${cfg.layout.map(id=>`
            <div class="rd-drag-item${cfg.sectionsEnabled[id]?'':' disabled'}" draggable="true" data-id="${id}" ondragstart="rdDragStart(event)" ondragover="rdDragOver(event)" ondrop="rdDrop(event)" ondragend="rdDragEnd(event)">
              <span class="rd-grip">☰</span>
              <span class="rd-drag-label">${RECEIPT_SECTION_LABELS[id]||id}</span>
              <label class="rd-toggle"><input type="checkbox" ${cfg.sectionsEnabled[id]?'checked':''} onchange="rdSet('sectionsEnabled.${id}', this.checked); switchReceiptTab('layout')"><span class="rd-toggle-slider"></span></label>
            </div>`).join('')}
        </div>
        <button class="dev-btn small secondary" style="margin-top:14px" onclick="rdResetLayout()">↺ Reset layout order</button>`;
    case 'style':
      return `${rdSelectRow('Receipt width', 'width', [['58mm','58mm (small thermal)'],['80mm','80mm (standard thermal)'],['100%','Full page (A4)']])}
        ${rdSelectRow('Font family', 'font', [["'Courier New',monospace","Courier New (classic thermal)"],["monospace","Monospace"],["Arial,sans-serif","Arial (clean)"],["Georgia,serif","Georgia (elegant)"]])}
        ${rdSelectRow('Language / direction', 'lang', [['en','English (LTR)'],['ar','Arabic (RTL)']])}
        ${rdRangeRow('Base font size','fontSize',9,16,1,'px')}
        ${rdRangeRow('Header size','headerSize',12,24,1,'px')}
        ${rdRangeRow('Item font size','itemFontSize',8,16,1,'px')}
        ${rdRangeRow('Total font size','totalFontSize',10,22,1,'px')}
        ${rdRangeRow('Line spacing','lineSpacing',1,2,0.1,'')}
        ${rdRangeRow('Section spacing','sectionSpacing',2,24,1,'px')}
        ${rdSelectRow('Divider style', 'dividerStyle', [['dashed','Dashed'],['solid','Solid'],['dotted','Dotted'],['double','Double'],['none','None']])}
        ${rdSelectRow('Header text align', 'textAlign', [['center','Center'],['left','Left'],['right','Right']])}
        ${rdToggleRow('Bold totals row','boldTotals')}
        <div class="dev-field" style="margin-top:10px"><label>Accent / Brand Color</label><div style="display:flex;gap:8px;align-items:center"><input type="color" class="dev-color-input" value="${cfg.accent}" oninput="rdSet('accent', this.value); document.getElementById('rd_accent_hex').value=this.value"><input class="dev-input" id="rd_accent_hex" value="${cfg.accent}" oninput="rdSet('accent', this.value)" style="flex:1"></div></div>
        <div style="margin-top:16px"><label class="dev-label">Custom Receipt CSS</label><textarea class="dev-input" rows="4" style="font-family:monospace;font-size:12px;resize:vertical;margin-top:6px" oninput="rdSet('customCSS', this.value)" placeholder="/* e.g. */
.receipt-name { font-size: 20px; }">${cfg.customCSS||''}</textarea></div>`;
    default: return '';
  }
}

function switchReceiptTab(tab){
  _receiptTab = tab;
  const root = document.getElementById('receiptTabContent');
  if (!root) return;
  document.querySelectorAll('.rd-tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  root.innerHTML = renderReceiptTabPanel(tab);
  renderReceiptPreview();
}

function rdSetFooterBlock(i, val){ _receiptDraft.footer.blocks[i]=val; renderReceiptPreview(); }
function rdAddFooterBlock(){ _receiptDraft.footer.blocks.push(''); switchReceiptTab('footer'); }
function rdRemoveFooterBlock(i){ _receiptDraft.footer.blocks.splice(i,1); switchReceiptTab('footer'); }

function rdHandleQrUpload(input){
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { toast('Image too large — please use an image under 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    _receiptDraft.qr.customImage = e.target.result;
    _receiptDraft.qr.source = 'upload';
    switchReceiptTab('qr');
    toast('QR image loaded — click Save Receipt Design to keep it ✓', 'success');
  };
  reader.readAsDataURL(file);
}

let _rdDragSrc = null;
function rdDragStart(e){ _rdDragSrc = e.currentTarget.dataset.id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function rdDragOver(e){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function rdDragEnd(){ document.querySelectorAll('.rd-drag-item').forEach(el=>el.classList.remove('dragging','drag-over')); }
function rdDrop(e){
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  e.currentTarget.classList.remove('drag-over');
  if (!_rdDragSrc || _rdDragSrc===targetId) return;
  const layout = _receiptDraft.layout;
  const from = layout.indexOf(_rdDragSrc), to = layout.indexOf(targetId);
  if (from<0||to<0) return;
  layout.splice(from,1); layout.splice(to,0,_rdDragSrc);
  switchReceiptTab('layout');
}
function rdResetLayout(){ _receiptDraft.layout = [...RECEIPT_DEFAULTS.layout]; switchReceiptTab('layout'); }

function applyReceiptTemplate(name){
  const preset = RECEIPT_TEMPLATES[name];
  if (!preset || !_receiptDraft) return;
  Object.assign(_receiptDraft, JSON.parse(JSON.stringify(preset)));
  _receiptDraft.template = name;
  renderReceiptDesignerCard(true);
  toast(`Applied "${name}" template — customize further in any tab`, 'info');
}

function renderReceiptDesignerCard(preserveDraft){
  const root = document.getElementById('receiptDesignerRoot');
  if (!root) return;
  if (!preserveDraft || !_receiptDraft) _receiptDraft = getReceiptConfig();
  const cfg = _receiptDraft;
  const tabs = ['templates','logo','header','orderInfo','customerInfo','items','discounts','totals','payment','qr','footer','layout','style'];
  const tabLabels = { templates:'🎨 Templates', logo:'🖼️ Logo', header:'🏪 Header', orderInfo:'🧾 Order Info', customerInfo:'👤 Customer', items:'🍽️ Items', discounts:'🏷️ Discounts', totals:'➕ Totals', payment:'💳 Payment', qr:'📱 QR Code', footer:'💬 Footer', layout:'☰ Layout', style:'✍️ Style' };
  const paperW = cfg.width==='58mm' ? '220px' : (cfg.width==='100%' ? '320px' : '300px');
  root.innerHTML = `
    <div class="rd-grid">
      <div>
        <div class="rd-tabs">${tabs.map(t=>`<button class="rd-tab-btn${t===_receiptTab?' active':''}" data-tab="${t}" onclick="switchReceiptTab('${t}')">${tabLabels[t]}</button>`).join('')}</div>
        <div class="rd-panel" id="receiptTabContent">${renderReceiptTabPanel(_receiptTab)}</div>
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;border-top:1px solid #2d1b4e;padding-top:20px">
          <button class="dev-btn" onclick="devSaveReceiptConfig()">💾 Save Receipt Design</button>
          <button class="dev-btn secondary" onclick="devTestReceipt()">🧾 Generate Test Receipt</button>
          <button class="dev-btn secondary" onclick="devResetReceiptDesign()">🔄 Reset to Default</button>
          <button class="dev-btn secondary" onclick="devExportReceiptConfig()">📤 Export Config</button>
          <button class="dev-btn secondary" onclick="devImportReceiptConfig()">📥 Import Config</button>
        </div>
      </div>
      <div class="rd-preview-col">
        <div class="rd-paper-wrap"><div class="rd-paper" style="width:${paperW}"><iframe id="receiptPreviewFrame"></iframe></div></div>
        <div class="rd-preview-actions">
          <button class="dev-btn small secondary" onclick="devPrintReceiptDraft('58mm')">🖨️ 58mm Test</button>
          <button class="dev-btn small secondary" onclick="devPrintReceiptDraft('80mm')">🖨️ 80mm Test</button>
          <button class="dev-btn small" onclick="devPrintReceiptDraft()">🖨️ Print Preview</button>
        </div>
      </div>
    </div>`;
  renderReceiptPreview();
}

function renderReceiptPreview(){
  const cfg = _receiptDraft || getReceiptConfig();
  const gs = Admin.settings || {};
  const order = sampleReceiptOrder();
  const content = buildReceiptContent(cfg, order, gs);
  const styleTag = buildReceiptStyleTag(cfg);
  const iframe = document.getElementById('receiptPreviewFrame');
  if (!iframe) return;
  const paper = iframe.closest('.rd-paper');
  if (paper) paper.style.width = cfg.width==='58mm' ? '220px' : (cfg.width==='100%' ? '320px' : '300px');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{background:#fff}${styleTag}</style></head><body><div class="receipt">${content}</div></body></html>`);
  doc.close();
  setTimeout(()=>{ try{ iframe.style.height=(doc.body.scrollHeight+30)+'px'; }catch(e){} },40);
}

async function devSaveReceiptConfig(){
  if (!_receiptDraft) return;
  try{
    await DB.updateSetting('receipt_config', _receiptDraft);
    Admin.settings.receipt_config = JSON.parse(JSON.stringify(_receiptDraft));
    toast('Receipt design saved ✓','success');
  }catch(e){ toast('Save failed: '+e.message,'error'); }
}
async function devResetReceiptDesign(){
  if (!confirm('Reset the receipt design to default? This discards your saved customization.')) return;
  _receiptDraft = JSON.parse(JSON.stringify(RECEIPT_DEFAULTS));
  try{ await DB.updateSetting('receipt_config', _receiptDraft); Admin.settings.receipt_config = JSON.parse(JSON.stringify(_receiptDraft)); }catch(e){}
  renderReceiptDesignerCard(true);
  toast('Receipt design reset to default ✓','success');
}
function devExportReceiptConfig(){
  const blob = new Blob([JSON.stringify(_receiptDraft||getReceiptConfig(), null, 2)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='receipt-design.json'; a.click();
  toast('Receipt config exported ✓','success');
}
function devImportReceiptConfig(){
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange=async e=>{
    const file=e.target.files[0]; if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      _receiptDraft = rdDeepMerge(RECEIPT_DEFAULTS, data);
      renderReceiptDesignerCard(true);
      toast('Receipt config imported — click Save to apply ✓','success');
    }catch(err){ toast('Invalid JSON file','error'); }
  };
  input.click();
}
function devTestReceipt(){ openPrintWindow([sampleReceiptOrder()], _receiptDraft || getReceiptConfig()); }
function devPrintReceiptDraft(forceWidth){
  const cfg = { ...(_receiptDraft||getReceiptConfig()) };
  if (forceWidth) cfg.width = forceWidth;
  openPrintWindow([sampleReceiptOrder()], cfg);
}

async function devSaveLogo(){
  try{
    const preview = document.getElementById('dev-logo-preview');
    const img = preview ? preview.querySelector('img') : null;
    const urlField = document.getElementById('dev_logo_url')?.value?.trim();
    const icon = document.getElementById('dev_nav_icon')?.value?.trim();
    const logoValue = img ? img.getAttribute('src') : (urlField || '');
    if (logoValue) { await DB.updateSetting('restaurant_logo', logoValue); Admin.settings.restaurant_logo = logoValue; }
    if (icon) { await DB.updateSetting('restaurant_icon', icon); Admin.settings.restaurant_icon = icon; }
    renderReceiptPreview();
    toast('Logo saved ✓','success');
  }catch(e){ toast('Failed: '+e.message,'error'); }
}

// Load receipt designer when dev panel opens (fresh draft each time it's opened)
const _origDevLoad = devLoadCurrentValues;
devLoadCurrentValues = function() {
  _origDevLoad();
  _receiptTab = 'templates';
  renderReceiptDesignerCard(false);
};

// ═══════════════════════════════════════════════════
//  CATEGORIES PAGE
// ═══════════════════════════════════════════════════
function renderCategoriesPage() {
  document.getElementById('page').innerHTML = `
    <div style="max-width:860px">

      <!-- Add / Edit form card -->
      <div class="settings-card" style="margin-bottom:24px">
        <h3 id="catFormTitle">➕ Add New Category</h3>
        <input type="hidden" id="catEditId">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
          <div class="form-group">
            <label class="form-label">Name (English) <span style="color:var(--danger)">*</span></label>
            <input class="form-control" id="catNameEn" placeholder="e.g. Starters">
          </div>
          <div class="form-group">
            <label class="form-label">Name (Arabic)</label>
            <input class="form-control" id="catNameAr" placeholder="e.g. المقبلات" dir="rtl">
          </div>
          <div class="form-group">
            <label class="form-label">Icon (emoji)</label>
            <input class="form-control" id="catIcon" placeholder="🍢" style="font-size:22px;text-align:center;width:80px">
          </div>
          <div class="form-group">
            <label class="form-label">Accent Color</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="color" id="catColor" value="#1F6B4F" style="width:44px;height:38px;border:none;cursor:pointer;border-radius:8px;background:transparent">
              <input class="form-control" id="catColorHex" placeholder="#1F6B4F" style="flex:1" oninput="syncCatColor()">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Sort Order <span style="color:var(--text3);font-weight:400">(lower = first)</span></label>
            <input class="form-control" id="catSortOrder" type="number" min="0" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Description (optional)</label>
            <input class="form-control" id="catDesc" placeholder="Brief description...">
          </div>
          <label style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;padding:10px 0">
            <input type="checkbox" id="catEnabled" checked style="width:18px;height:18px">
            Category enabled on customer website
          </label>
        </div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-primary" onclick="saveCategoryForm()" style="padding:11px 28px">💾 Save Category</button>
          <button class="btn btn-ghost" id="catCancelBtn" onclick="resetCategoryForm()" style="display:none;padding:11px 20px">Cancel</button>
        </div>
      </div>

      <!-- Categories list -->
      <div class="table-card">
        <div class="table-header">
          <h3>All Categories <span id="catCount" style="color:var(--text3);font-weight:400;font-size:13px"></span></h3>
          <div style="font-size:12px;color:var(--text3)">Drag rows to reorder (updates sort order)</div>
        </div>
        <div id="catListContainer" style="padding:8px 0">
          <div style="text-align:center;padding:40px;color:var(--text3)">Loading...</div>
        </div>
      </div>
    </div>`;

  // Sync color picker ↔ hex input
  document.getElementById('catColor').oninput = function() {
    document.getElementById('catColorHex').value = this.value;
  };

  loadCategoriesList();
}

function syncCatColor() {
  const hex = document.getElementById('catColorHex').value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById('catColor').value = hex;
  }
}

async function loadCategoriesList() {
  const container = document.getElementById('catListContainer');
  if (!container) return;
  try {
    // Reload fresh from DB
    const all = await DB.getCategories();
    const cats = all.filter(c => c.id !== null); // exclude virtual "All"
    Admin.categories = cats;

    const countEl = document.getElementById('catCount');
    if (countEl) countEl.textContent = `(${cats.length})`;

    if (!cats.length) {
      container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:48px;margin-bottom:12px">🏷️</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:6px">No categories yet</div>
        <div style="font-size:13px">Add your first category using the form above.</div>
      </div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:44px"></th>
            <th>Icon</th>
            <th>Name (EN)</th>
            <th>Name (AR)</th>
            <th>Color</th>
            <th>Sort</th>
            <th>Items</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="catTbody">
          ${cats.map(c => renderCatRow(c)).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    container.innerHTML = `<div style="padding:24px;color:var(--danger)">Error: ${e.message}</div>`;
  }
}

function renderCatRow(c) {
  const itemCount = Admin.menu.filter(m => m.category_id === c.id).length;
  return `<tr id="catrow-${c.id}">
    <td style="cursor:grab;color:var(--text3);font-size:18px;text-align:center">⋮⋮</td>
    <td style="font-size:26px;text-align:center">${c.icon || '🏷️'}</td>
    <td><strong>${c.name}</strong></td>
    <td style="direction:rtl;text-align:right;color:var(--text2)">${c.name_ar || '—'}</td>
    <td>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:20px;height:20px;border-radius:50%;background:${c.color || '#1F6B4F'}"></div>
        <span style="font-size:12px;color:var(--text3)">${c.color || '#1F6B4F'}</span>
      </div>
    </td>
    <td style="color:var(--text3)">${c.sort_order ?? '—'}</td>
    <td>
      <span style="background:var(--surface2);padding:3px 10px;border-radius:50px;font-size:12px;font-weight:600">${itemCount}</span>
    </td>
    <td>
      <button class="btn btn-xs ${c.enabled === false ? 'btn-warning' : 'btn-primary'}" onclick="toggleCategoryEnabled('${c.id}',${c.enabled !== false})">${c.enabled === false ? 'Disabled' : 'Enabled'}</button>
    </td>
    <td>
      <div style="display:flex;gap:6px">
        <button class="btn btn-xs btn-ghost" onclick="editCategory('${c.id}')">✏️ Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteCategory('${c.id}','${c.name.replace(/'/g,"\\'")}')">🗑️</button>
      </div>
    </td>
  </tr>`;
}

function editCategory(id) {
  const c = Admin.categories.find(x => x.id === id);
  if (!c) return;
  document.getElementById('catEditId').value = id;
  document.getElementById('catNameEn').value = c.name || '';
  document.getElementById('catNameAr').value = c.name_ar || '';
  document.getElementById('catIcon').value = c.icon || '';
  document.getElementById('catColor').value = c.color || '#1F6B4F';
  document.getElementById('catColorHex').value = c.color || '#1F6B4F';
  document.getElementById('catSortOrder').value = c.sort_order ?? '';
  document.getElementById('catDesc').value = c.description || '';
  document.getElementById('catEnabled').checked = c.enabled !== false;
  document.getElementById('catFormTitle').textContent = `✏️ Edit Category — ${c.name}`;
  document.getElementById('catCancelBtn').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetCategoryForm() {
  document.getElementById('catEditId').value = '';
  document.getElementById('catNameEn').value = '';
  document.getElementById('catNameAr').value = '';
  document.getElementById('catIcon').value = '';
  document.getElementById('catColor').value = '#1F6B4F';
  document.getElementById('catColorHex').value = '#1F6B4F';
  document.getElementById('catSortOrder').value = '';
  document.getElementById('catDesc').value = '';
  document.getElementById('catEnabled').checked = true;
  document.getElementById('catFormTitle').textContent = '➕ Add New Category';
  document.getElementById('catCancelBtn').style.display = 'none';
}

async function saveCategoryForm() {
  const nameEn = document.getElementById('catNameEn').value.trim();
  if (!nameEn) { toast('Category name (English) is required', 'error'); return; }

  const id = document.getElementById('catEditId').value || null;
  const cat = {
    id,
    name:        nameEn,
    name_ar:     document.getElementById('catNameAr').value.trim(),
    icon:        document.getElementById('catIcon').value.trim() || '🏷️',
    color:       document.getElementById('catColorHex').value.trim() || '#1F6B4F',
    sort_order:  parseInt(document.getElementById('catSortOrder').value) || 0,
    description: document.getElementById('catDesc').value.trim(),
    enabled: document.getElementById('catEnabled').checked,
  };

  try {
    const saved = await DB.upsertCategory(cat);
    // Update in-memory list
    const idx = Admin.categories.findIndex(c => c.id === saved.id);
    if (idx >= 0) Admin.categories[idx] = saved;
    else Admin.categories.push(saved);
    Admin.categories.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));

    toast(id ? 'Category updated ✓' : 'Category added ✓', 'success');
    resetCategoryForm();
    loadCategoriesList();
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
}

async function toggleCategoryEnabled(id, currentEnabled) {
  const next = !currentEnabled;
  try {
    const c = Admin.categories.find(x => x.id === id);
    await DB.upsertCategory({ ...(c || {id}), id, enabled: next });
    if (c) c.enabled = next;
    toast(`Category ${next ? 'enabled' : 'disabled'} ✓`, 'success');
    loadCategoriesList();
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

async function deleteCategory(id, name) {
  const itemCount = Admin.menu.filter(m => m.category_id === id).length;
  const msg = itemCount > 0
    ? `Delete "${name}"? It has ${itemCount} menu item${itemCount > 1 ? 's' : ''} assigned to it. They will become uncategorized.`
    : `Delete category "${name}"?`;
  if (!confirm(msg)) return;
  try {
    await DB.deleteCategory(id);
    Admin.categories = Admin.categories.filter(c => c.id !== id);
    toast('Category deleted', 'success');
    loadCategoriesList();
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
}
