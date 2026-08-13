// ═══════════════════════════════════════════════════
//  ZAHRAT ELMADINA RESTAURANT & CAFE — Firebase Backend v2
//  All features: loyalty, stock, WhatsApp, feedback,
//  dietary, scheduled orders, dynamic pricing, split bill
// ═══════════════════════════════════════════════════

// ── YOUR FIREBASE CONFIG ───────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD0fFEilVq5sJud3E2nzTEZ9wezpim3o7k",
  authDomain:        "system-fb58f.firebaseapp.com",
  projectId:         "system-fb58f",
  storageBucket:     "system-fb58f.firebasestorage.app",
  messagingSenderId: "206434677599",
  appId:             "1:206434677599:web:6ab4658982fa9942dcbcea"
};

// ── WHATSAPP CONFIG ────────────────────────────────
// 1. Go to callmebot.com → register your WhatsApp number
// 2. You'll receive an API key via WhatsApp
// 3. Fill these in:
const WHATSAPP_CONFIG = {
  phone: '',        // e.g. "201012345678" (no + sign)
  apikey: '',       // e.g. "123456"
  enabled: false,   // set to true once configured
};

// ── ANTHROPIC API KEY ──────────────────────────────
// For AI features (recommendations, upsell, menu writer, demand prediction)
// Get from: console.anthropic.com
const ANTHROPIC_KEY = '';  // 'sk-ant-...'

// ── FIREBASE INIT ──────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const firestore = firebase.firestore();
const auth      = firebase.auth();

// ── ANONYMOUS AUTH (fixes "Missing or insufficient permissions") ──
// Signs in anonymously so Firestore rules that require auth pass.
// This runs once at startup and resolves before DB calls.
const _authReady = auth.signInAnonymously()
  .then(() => console.log('[FH] Auth ready (anonymous)'))
  .catch(err => console.warn('[FH] Anonymous auth failed — check Firebase Console → Authentication → Sign-in providers → Anonymous is ENABLED:', err.message));

// ── ORDER NUMBER COUNTER ───────────────────────────
async function getNextOrderNumber() {
  const ref = firestore.collection('meta').doc('counters');
  return firestore.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = doc.exists ? (doc.data().order_number || 0) + 1 : 1;
    tx.set(ref, { order_number: next }, { merge: true });
    return next;
  });
}

// ── RESERVATION NUMBER COUNTER ─────────────────────
async function getNextReservationNumber() {
  const ref = firestore.collection('meta').doc('counters');
  return firestore.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = doc.exists ? (doc.data().reservation_number || 0) + 1 : 1;
    tx.set(ref, { reservation_number: next }, { merge: true });
    return next;
  });
}

// ═══════════════════════════════════════════════════
//  DB API
// ═══════════════════════════════════════════════════

const DEMO_CATEGORIES = [
  { id:'cat-appetizers', name:'Appetizers', name_ar:'المقبلات', icon:'🥗', color:'#1F6B4F', sort_order:1, enabled:true },
  { id:'cat-grills', name:'Grills', name_ar:'المشاوي', icon:'🔥', color:'#B45309', sort_order:2, enabled:true },
  { id:'cat-main', name:'Main Dishes', name_ar:'الأطباق الرئيسية', icon:'🍽️', color:'#1F6B4F', sort_order:3, enabled:true },
  { id:'cat-sandwiches', name:'Sandwiches', name_ar:'السندوتشات', icon:'🥪', color:'#166534', sort_order:4, enabled:true },
  { id:'cat-coffee', name:'Coffee & Drinks', name_ar:'القهوة والمشروبات', icon:'☕', color:'#92400E', sort_order:5, enabled:true },
  { id:'cat-desserts', name:'Desserts', name_ar:'الحلويات', icon:'🍰', color:'#9D174D', sort_order:6, enabled:true },
];
const DEMO_MENU_ITEMS = [
  ['demo-mixed-grill','Mixed Grill','مشويات مشكلة','A generous platter of grilled kofta, chicken and kebab.','طبق مشويات متنوع من الكفتة والفراخ والكباب.',320,'cat-grills','🔥'],
  ['demo-chicken-kebab','Chicken Kebab','كباب فراخ','Tender marinated chicken grilled to perfection.','قطع فراخ متبلة ومشوية بعناية.',220,'cat-grills','🍗'],
  ['demo-kofta','Kofta Kebab','كفتة','Juicy seasoned kofta served with fresh sides.','كفتة متبلة وعصيرية مع أطباق جانبية طازجة.',210,'cat-grills','🥩'],
  ['demo-chicken-shawarma','Chicken Shawarma','شاورما فراخ','Warm pita, seasoned chicken, garlic sauce and pickles.','عيش دافئ وفراخ متبلة وثومية ومخلل.',135,'cat-sandwiches','🌯'],
  ['demo-beef-burger','Zahrat Burger','برجر زهرة','House burger with cheese, lettuce and signature sauce.','برجر البيت بالجبنة والخس والصوص الخاص.',185,'cat-sandwiches','🍔'],
  ['demo-chicken-pasta','Creamy Chicken Pasta','مكرونة فراخ بالكريمة','Creamy pasta with grilled chicken and herbs.','مكرونة بصوص كريمي وفراخ مشوية وأعشاب.',190,'cat-main','🍝'],
  ['demo-rice','Oriental Rice Bowl','طبق أرز شرقي','Fragrant rice served with vegetables and your choice of protein.','أرز شرقي مع خضروات واختيارك من البروتين.',160,'cat-main','🍚'],
  ['demo-fattah','Meat Fattah','فتة باللحمة','Egyptian-style rice, crispy bread, sauce and tender beef.','أرز وعيش محمص وصوص ولحمة طرية على الطريقة المصرية.',240,'cat-main','🥘'],
  ['demo-hummus','Classic Hummus','حمص كلاسيك','Silky chickpea hummus with olive oil.','حمص ناعم بزيت الزيتون.',75,'cat-appetizers','🧆'],
  ['demo-fries','Truffle Parmesan Fries','بطاطس بالبارميزان','Crispy fries finished with parmesan and herbs.','بطاطس مقرمشة بالبارميزان والأعشاب.',90,'cat-appetizers','🍟'],
  ['demo-cappuccino','Cappuccino','كابتشينو','Smooth espresso, steamed milk and a light foam.','إسبريسو مع حليب مبخر ورغوة خفيفة.',85,'cat-coffee','☕'],
  ['demo-iced-latte','Iced Latte','آيس لاتيه','Chilled espresso and milk over ice.','إسبريسو وحليب بارد مع الثلج.',95,'cat-coffee','🧊'],
  ['demo-cheesecake','Lotus Cheesecake','تشيز كيك لوتس','Creamy cheesecake with Lotus biscuit crumble.','تشيز كيك كريمي مع بسكويت لوتس.',125,'cat-desserts','🍰'],
  ['demo-icecream','Ice Cream Scoop','آيس كريم','A refreshing scoop of the day.','سكوب آيس كريم منعش من اختيار اليوم.',70,'cat-desserts','🍨'],
].map((x,i)=>({ id:x[0], name:x[1], name_ar:x[2], description:x[3], description_ar:x[4], price:x[5], category_id:x[6], image_url:(['https://images.unsplash.com/photo-1544025162-d76694265947','https://images.unsplash.com/photo-1529193591184-b1d58069ecdd','https://images.unsplash.com/photo-1568901346375-23c9450c58cd','https://images.unsplash.com/photo-1555939594-58d7cb561ad1','https://images.unsplash.com/photo-1551183053-bf91a1d81141','https://images.unsplash.com/photo-1515003197210-e0cd71810b5f','https://images.unsplash.com/photo-1509042239860-f550ce710b93','https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd','https://images.unsplash.com/photo-1488477181946-6428a0291777','https://images.unsplash.com/photo-1573080496219-bb080dd4f877','https://images.unsplash.com/photo-1495474472287-4d71bcdd2085','https://images.unsplash.com/photo-1461023058943-07fcbe16d735','https://images.unsplash.com/photo-1578985545062-69928b1d9587','https://images.unsplash.com/photo-1570197788417-0e82375c9371'][i%14]+'?auto=format&fit=crop&w=900&q=80'), available:true, enabled:true, featured:i<4, popular:i<6, new:i>=10, sort_order:i+1, prep_time_min:20, stock_count:null, categories:DEMO_CATEGORIES.find(c=>c.id===x[6]) }));

const RESTAURANT_DEFAULT_SETTINGS = {
  restaurant_name: 'Zahrat Elmadina Restaurant & Cafe',
  restaurant_name_ar: 'مطعم وكافيه زهرة المدينة',
  restaurant_icon: '🌿',
  tagline: 'Authentic flavors, warm moments.',
  contact_address: 'Avenue Mall, Obour City, Egypt',
  open_time: '10:00 AM',
  close_time: '12:00 AM',
  wifi_name: 'Zahrat_Guest',
  wifi_pass: 'Ask staff for Wi-Fi password',
  currency_symbol: 'ج.م',
  hero_title1: 'Taste the heart of',
  hero_title2: 'Zahrat Elmadina.',
  hero_subtitle: 'A warm dining experience with delicious food, great coffee, and memorable moments.',
  stat1_num: '30+',
  stat1_label: 'Signature Dishes',
  stat2_num: '4.9★',
  stat2_label: 'Guest Rating',
  stat3_num: '20 min',
  stat3_label: 'Avg Prep Time',
  menu_section_label: 'Our Menu',
  menu_section_title: 'Made fresh, served with care',
  menu_section_label_ar: 'قائمتنا',
  accent_color: '#1F6B4F',
  tax_rate: '14',
  service_charge: '10',
  loyalty_enabled: 'yes',
  loyalty_points_per_currency: '1',
  loyalty_tiers_enabled: 'yes',
  loyalty_silver_threshold: '500',
  loyalty_gold_threshold: '1000',
  landing_order_video_mode: 'template',
  landing_order_video_template: 'order_steps',
  landing_order_video_url: '',
  landing_book_video_mode: 'template',
  landing_book_video_template: 'book_steps',
  landing_book_video_url: '',
  landing_videos_enabled: 'yes'
};

const DB = {

  // ── MENU ──────────────────────────────────────────
  async getMenuItems() {
    const snap = await firestore.collection('menu_items')
      .orderBy('sort_order', 'asc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return items.length ? items : DEMO_MENU_ITEMS;
  },

  async getCategories() {
    const snap = await firestore.collection('categories')
      .orderBy('sort_order', 'asc').get();
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const usable = cats.length ? cats : DEMO_CATEGORIES;
    return [{ id: null, name: 'All', name_ar: 'الكل', icon: '✨', enabled:true }, ...usable];
  },

  async upsertCategory(cat) {
    const { id, ...data } = cat;
    data.updated_at = firebase.firestore.FieldValue.serverTimestamp();
    if (!data.sort_order) data.sort_order = Date.now();
    if (id) {
      await firestore.collection('categories').doc(id).set(data, { merge: true });
      return { id, ...data };
    } else {
      const ref = await firestore.collection('categories').add(data);
      return { id: ref.id, ...data };
    }
  },

  async deleteCategory(id) {
    await firestore.collection('categories').doc(id).delete();
  },

  async upsertMenuItem(item) {
    const { id, categories: _c, ...data } = item;
    data.updated_at = firebase.firestore.FieldValue.serverTimestamp();
    if (id) {
      await firestore.collection('menu_items').doc(id).set(data, { merge: true });
      const snap = await firestore.collection('menu_items').doc(id).get();
      const saved = { id: snap.id, ...snap.data() };
      if (saved.category_id) {
        const catSnap = await firestore.collection('categories').doc(saved.category_id).get();
        if (catSnap.exists) saved.categories = catSnap.data();
      }
      return saved;
    } else {
      data.created_at = firebase.firestore.FieldValue.serverTimestamp();
      data.sort_order = data.sort_order || 999;
      data.stock_count = data.stock_count ?? null; // null = unlimited
      const ref = await firestore.collection('menu_items').add(data);
      const snap = await ref.get();
      const saved = { id: snap.id, ...snap.data() };
      if (saved.category_id) {
        const catSnap = await firestore.collection('categories').doc(saved.category_id).get();
        if (catSnap.exists) saved.categories = catSnap.data();
      }
      return saved;
    }
  },

  async deleteMenuItem(id) {
    await firestore.collection('menu_items').doc(id).delete();
  },

  async toggleMenuItemAvailability(id, available) {
    await firestore.collection('menu_items').doc(id).update({ available });
  },

  // ── STOCK MANAGEMENT ───────────────────────────────
  async updateMenuItemStock(id, stockCount) {
    const available = stockCount === null || stockCount > 0;
    await firestore.collection('menu_items').doc(id).update({
      stock_count: stockCount,
      available,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async decrementStockForOrder(items) {
    // Atomically decrement stock for all items in an order
    const batch = firestore.batch();
    for (const item of items) {
      if (!item.id) continue;
      const ref = firestore.collection('menu_items').doc(item.id);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data();
      if (data.stock_count === null || data.stock_count === undefined) continue; // unlimited
      const newCount = Math.max(0, (data.stock_count || 0) - item.qty);
      batch.update(ref, {
        stock_count: newCount,
        available: newCount > 0,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
  },

  async resetDailyStock(itemId, resetTo) {
    await firestore.collection('menu_items').doc(itemId).update({
      stock_count: resetTo,
      available: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // ── ORDERS ─────────────────────────────────────────
  async insertOrder(order) {
    const order_number = await getNextOrderNumber();
    const data = {
      ...order,
      order_number,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await firestore.collection('orders').add(data);
    const inserted = { id: ref.id, ...data, order_number };

    // Decrement stock
    if (order.items?.length) {
      try { await DB.decrementStockForOrder(order.items); } catch(e) { console.warn('Stock decrement failed:', e); }
    }

    // Points-based loyalty: earn points + consume an applied reward — only after
    // the order has actually been created, so nothing is ever deducted for a
    // failed/abandoned checkout.
    if (order.customer_phone) {
      try {
        const settingsSnap = await firestore.collection('settings').doc('main').get();
        const s = settingsSnap.exists ? settingsSnap.data() : {};
        if (s.loyalty_enabled === 'yes') {
          const loyaltyDocSnap = await firestore.collection('loyalty').doc(order.customer_phone).get();
          const isNewMember = !loyaltyDocSnap.exists;

          if (isNewMember) {
            const bonus = (parseFloat(s.loyalty_signup_bonus) || 0) + (parseFloat(s.loyalty_first_order_bonus) || 0);
            if (bonus > 0) await DB.awardLoyaltyPoints(order.customer_phone, bonus, 'Welcome bonus', { related_order_id: ref.id });
          }

          const perCurrency = parseFloat(s.loyalty_points_per_currency) || 0;
          if (perCurrency > 0 && order.total > 0) {
            const earned = Math.floor(order.total * perCurrency);
            if (earned > 0) await DB.awardLoyaltyPoints(order.customer_phone, earned, `Order #${order_number}`, { related_order_id: ref.id });
          }

          if (order.applied_loyalty_reward) {
            try { await DB.redeemLoyaltyReward(order.customer_phone, order.applied_loyalty_reward, ref.id); }
            catch(e) { console.warn('Loyalty reward redemption failed (order still placed):', e); }
          }
        }
      } catch(e) { console.warn('Loyalty points failed:', e); }
    }

    // WhatsApp notification
    try { await sendWhatsAppAlert(inserted); } catch(e) { console.warn('WhatsApp failed:', e); }

    return inserted;
  },

  async getOrders(limit = 200) {
    const snap = await firestore.collection('orders')
      .orderBy('created_at', 'desc').limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async updateOrderStatus(id, status) {
    await firestore.collection('orders').doc(id).update({
      status,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      ...(status === 'preparing' ? { prep_started_at: firebase.firestore.FieldValue.serverTimestamp() } : {}),
      ...(status === 'done' ? { completed_at: firebase.firestore.FieldValue.serverTimestamp() } : {}),
    });
  },

  async getOrderById(id) {
    const snap = await firestore.collection('orders').doc(id).get();
    if (!snap.exists) throw new Error('Order not found');
    return { id: snap.id, ...snap.data() };
  },

  async getOrdersByPhone(phone) {
    const snap = await firestore.collection('orders').where('customer_phone', '==', phone).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)).slice(0, 20);
  },

  async getOrdersByTable(tableNumber) {
    const snap = await firestore.collection('orders')
      .where('table_number', '==', tableNumber)
      .where('status', 'in', ['pending','confirmed','preparing','ready'])
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ── TABLES ─────────────────────────────────────────
  async getTables() {
    const snap = await firestore.collection('tables')
      .orderBy('table_number', 'asc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async upsertTable(data) {
    const { id, ...rest } = data;
    if (id) {
      await firestore.collection('tables').doc(id).set(rest, { merge: true });
      const snap = await firestore.collection('tables').doc(id).get();
      return { id: snap.id, ...snap.data() };
    } else {
      const ref = await firestore.collection('tables').add(rest);
      const snap = await ref.get();
      return { id: snap.id, ...snap.data() };
    }
  },

  async deleteTable(id) {
    await firestore.collection('tables').doc(id).delete();
  },

  // ── RESERVATIONS ───────────────────────────────────
  async insertReservation(res) {
    const reservation_number = await getNextReservationNumber();
    const data = {
      ...res,
      reservation_number,
      status: 'pending',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await firestore.collection('reservations').add(data);
    const inserted = { id: ref.id, ...data, reservation_number };
    try { await sendWhatsAppReservationAlert(inserted); } catch(e) { console.warn('WhatsApp reservation alert failed:', e); }
    return inserted;
  },

  async getReservations(limit = 300) {
    const snap = await firestore.collection('reservations')
      .orderBy('created_at', 'desc').limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getReservationById(id) {
    const snap = await firestore.collection('reservations').doc(id).get();
    if (!snap.exists) throw new Error('Reservation not found');
    return { id: snap.id, ...snap.data() };
  },

  async getReservationsByPhone(phone) {
    const snap = await firestore.collection('reservations').where('customer_phone', '==', phone).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)).slice(0, 20);
  },

  async updateReservationStatus(id, status) {
    await firestore.collection('reservations').doc(id).update({
      status, updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  async cancelReservation(id) {
    await firestore.collection('reservations').doc(id).update({
      status: 'cancelled', updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  // ── SETTINGS ───────────────────────────────────────
  async uploadLandingVideo(file, kind) {
    if (!file) throw new Error('No video selected');
    if (!firebase.storage) throw new Error('Firebase Storage is not available in this build');
    if (file.size > 80 * 1024 * 1024) throw new Error('Video is too large. Maximum is 80MB.');
    const safeKind = kind === 'book' ? 'book' : 'order';
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g,'');
    const ref = firebase.storage().ref(`landing-videos/${safeKind}-${Date.now()}.${ext}`);
    const snap = await ref.put(file, { contentType: file.type || 'video/mp4' });
    return await snap.ref.getDownloadURL();
  },

  async getSettings() {
    const snap = await firestore.collection('settings').doc('main').get();
    return snap.exists ? { ...RESTAURANT_DEFAULT_SETTINGS, ...snap.data() } : { ...RESTAURANT_DEFAULT_SETTINGS };
  },

  async updateSetting(key, value) {
    await firestore.collection('settings').doc('main')
      .set({ [key]: value }, { merge: true });
  },

  // ── COUPONS ────────────────────────────────────────
  async validateCoupon(code) {
    const snap = await firestore.collection('coupons')
      .where('code', '==', code.toUpperCase())
      .where('active', '==', true)
      .limit(1).get();
    if (snap.empty) return null;
    const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() };
    if (coupon.max_uses && coupon.uses >= coupon.max_uses) return null;
    if (coupon.expires_at && coupon.expires_at.toDate() < new Date()) return null;
    return coupon;
  },

  async getActiveCoupons() {
    const snap = await firestore.collection('coupons').where('active', '==', true).get();
    const now = new Date();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => (!c.max_uses || c.uses < c.max_uses) && (!c.expires_at || c.expires_at.toDate() > now));
  },

  async incrementCouponUse(id) {
    await firestore.collection('coupons').doc(id).update({
      uses: firebase.firestore.FieldValue.increment(1)
    });
  },

  async generateOneShotCoupon(discountPct, expiryDays = 30, prefix = 'SHARE') {
    const code = prefix + Math.random().toString(36).slice(2,6).toUpperCase();
    const expires = new Date();
    expires.setDate(expires.getDate() + expiryDays);
    await firestore.collection('coupons').add({
      code, discount_pct: discountPct, max_uses: 1, uses: 0, active: true,
      expires_at: firebase.firestore.Timestamp.fromDate(expires),
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return code;
  },

  // ── LOYALTY ────────────────────────────────────────
  async getLoyalty(phone) {
    const snap = await firestore.collection('loyalty').doc(phone).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  },

  // ── LOYALTY POINTS & REWARDS (new points-based system, alongside the punch card above) ──
  async getLoyaltyProfile(phone) {
    const snap = await firestore.collection('loyalty').doc(phone).get();
    return snap.exists
      ? { id: snap.id, ...snap.data() }
      : { id: phone, phone, points: 0, lifetime_points: 0, redeemed_rewards: [] };
  },

  async getLoyaltyRewards() {
    const snap = await firestore.collection('loyalty_rewards').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },

  async saveLoyaltyReward(reward) {
    if (reward.id) {
      const { id, ...data } = reward;
      await firestore.collection('loyalty_rewards').doc(id).set(data, { merge: true });
      return id;
    }
    const ref = await firestore.collection('loyalty_rewards').add(reward);
    return ref.id;
  },

  async deleteLoyaltyReward(id) {
    await firestore.collection('loyalty_rewards').doc(id).delete();
  },

  async getLoyaltyTransactions(phone, limit = 50) {
    const snap = await firestore.collection('loyalty_transactions').where('phone', '==', phone).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)).slice(0, limit);
  },

  async getRecentLoyaltyTransactions(limit = 200) {
    const snap = await firestore.collection('loyalty_transactions').orderBy('created_at', 'desc').limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async awardLoyaltyPoints(phone, points, description, meta = {}) {
    if (!phone || !points) return null;
    const ref = firestore.collection('loyalty').doc(phone);
    const newBalance = await firestore.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const current = doc.exists ? doc.data() : { phone, points: 0, lifetime_points: 0, redeemed_rewards: [], punch_count: 0, total_orders: 0, order_ids: [] };
      const newPoints = Math.max(0, (current.points || 0) + points);
      const newLifetime = points > 0 ? (current.lifetime_points || 0) + points : (current.lifetime_points || 0);
      tx.set(ref, { ...current, phone, points: newPoints, lifetime_points: newLifetime, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return newPoints;
    });
    await firestore.collection('loyalty_transactions').add({
      phone, type: points > 0 ? 'earn' : 'adjust', points, description: description || '',
      ...meta, balance_after: newBalance,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return newBalance;
  },

  async redeemLoyaltyReward(phone, reward, orderId) {
    const ref = firestore.collection('loyalty').doc(phone);
    const code = 'RWD' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const newBalance = await firestore.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const current = doc.exists ? doc.data() : { phone, points: 0, lifetime_points: 0, redeemed_rewards: [] };
      const bal = current.points || 0;
      if (bal < reward.points_cost) throw new Error('INSUFFICIENT_POINTS');
      const newBalance = bal - reward.points_cost;
      const redemption = { reward_id: reward.id, title: reward.title, code, order_id: orderId || null, redeemed_at: new Date().toISOString() };
      const redeemed = [...(current.redeemed_rewards || []), redemption].slice(-50);
      tx.set(ref, { ...current, phone, points: newBalance, redeemed_rewards: redeemed, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return newBalance;
    });
    await firestore.collection('loyalty_transactions').add({
      phone, type: 'redeem', points: -reward.points_cost, description: `Redeemed: ${reward.title}`,
      related_reward_id: reward.id, related_order_id: orderId || null, balance_after: newBalance,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    try { await firestore.collection('loyalty_rewards').doc(reward.id).update({ redemption_count: firebase.firestore.FieldValue.increment(1) }); } catch (e) {}
    return { code, balance: newBalance };
  },

  async adjustLoyaltyPoints(phone, delta, reason, adminName) {
    const ref = firestore.collection('loyalty').doc(phone);
    const newBalance = await firestore.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const current = doc.exists ? doc.data() : { phone, points: 0, lifetime_points: 0, redeemed_rewards: [] };
      const newPoints = Math.max(0, (current.points || 0) + delta);
      const newLifetime = delta > 0 ? (current.lifetime_points || 0) + delta : (current.lifetime_points || 0);
      tx.set(ref, { ...current, phone, points: newPoints, lifetime_points: newLifetime, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return newPoints;
    });
    await firestore.collection('loyalty_transactions').add({
      phone, type: 'adjust', points: delta, description: reason || 'Manual adjustment', admin: adminName || 'Admin',
      balance_after: newBalance, created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return newBalance;
  },

  // ── FEEDBACK ───────────────────────────────────────
  async submitFeedback(orderId, tableNumber, emoji, comment, orderItems) {
    await firestore.collection('feedback').add({
      order_id: orderId,
      table_number: tableNumber,
      emoji,          // 1, 2, or 3 (😐 😊 🤩)
      comment: comment || null,
      items: orderItems || [],
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async getFeedback(limit = 100) {
    const snap = await firestore.collection('feedback')
      .orderBy('created_at', 'desc').limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ── DYNAMIC PRICING RULES ─────────────────────────
  async getPricingRules() {
    const snap = await firestore.collection('settings').doc('pricing_rules').get();
    return snap.exists ? (snap.data().rules || []) : [];
  },

  async savePricingRules(rules) {
    await firestore.collection('settings').doc('pricing_rules').set({ rules }, { merge: true });
  },

  // Check if a pricing rule is currently active
  getActiveDiscount(rules) {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
    for (const rule of rules) {
      if (!rule.active) continue;
      const start = parseFloat(rule.start_hour || 0);
      const end = parseFloat(rule.end_hour || 24);
      const days = rule.days || [0,1,2,3,4,5,6];
      if (days.includes(day) && hours >= start && hours < end) {
        return rule; // { label, discount_pct, start_hour, end_hour, days }
      }
    }
    return null;
  },

  // ── SCHEDULED ORDERS ──────────────────────────────
  async insertScheduledOrder(order) {
    const order_number = await getNextOrderNumber();
    const data = {
      ...order,
      order_number,
      status: 'scheduled',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await firestore.collection('orders').add(data);
    return { id: ref.id, ...data };
  },

  async getScheduledOrders() {
    const now = new Date();
    const snap = await firestore.collection('orders')
      .where('status', '==', 'scheduled')
      .orderBy('scheduled_for', 'asc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ── DEMAND PREDICTION (reads order history) ────────
  async getOrderHistoryForPrediction() {
    // Returns last 90 days grouped by day-of-week and hour
    const snap = await firestore.collection('orders')
      .where('status', '==', 'done')
      .orderBy('created_at', 'desc')
      .limit(500).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ── AUTH ───────────────────────────────────────────
  async signIn(email, password) {
    if (email === 'admin' && password === 'admin123') return { user: { email: 'admin' } };
    throw new Error('Invalid credentials');
  },
  async signOut() { sessionStorage.removeItem('fh_admin'); },
  async getSession() {
    if (sessionStorage.getItem('fh_admin') === '1') return { user: { email: 'admin' } };
    return null;
  },

  // ── REALTIME ───────────────────────────────────────
  subscribeToOrders(callback) {
    const unsub = firestore.collection('orders')
      .orderBy('created_at', 'desc').limit(1)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          callback({ eventType: change.type === 'added' ? 'INSERT' : 'UPDATE', new: { id: change.doc.id, ...change.doc.data() } });
        });
      });
    return { unsubscribe: unsub };
  },

  unsubscribe(channel) {
    if (channel && typeof channel.unsubscribe === 'function') channel.unsubscribe();
  }
};

// ═══════════════════════════════════════════════════
//  WHATSAPP NOTIFICATION
// ═══════════════════════════════════════════════════
async function sendWhatsAppAlert(order) {
  if (!WHATSAPP_CONFIG.enabled || !WHATSAPP_CONFIG.phone || !WHATSAPP_CONFIG.apikey) return;
  const pmEmoji = { cash: '💵', card: '💳', instapay: '📲' };
  const items = order.items?.map(i => `  • ${i.name} ×${i.qty}`).join('\n') || '';
  const msg = `🔔 *New Order #${order.order_number}*\n📍 Table ${order.table_number}\n${items}\n💰 ج.م ${Math.round(order.total).toLocaleString()}\n${pmEmoji[order.payment_method || 'cash']} ${order.payment_method || 'cash'}${order.notes ? `\n📝 ${order.notes}` : ''}`;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_CONFIG.phone}&text=${encodeURIComponent(msg)}&apikey=${WHATSAPP_CONFIG.apikey}`;
  try { await fetch(url); } catch(e) { console.warn('WhatsApp notification failed:', e); }
}

async function sendWhatsAppReservationAlert(res) {
  if (!WHATSAPP_CONFIG.enabled || !WHATSAPP_CONFIG.phone || !WHATSAPP_CONFIG.apikey) return;
  const msg = `📅 *New Reservation RES-${1000 + res.reservation_number}*\n👤 ${res.customer_name}\n📞 ${res.customer_phone}\n🗓️ ${res.date} at ${res.time}\n👥 ${res.guests} guests${res.notes ? `\n📝 ${res.notes}` : ''}`;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_CONFIG.phone}&text=${encodeURIComponent(msg)}&apikey=${WHATSAPP_CONFIG.apikey}`;
  try { await fetch(url); } catch(e) { console.warn('WhatsApp reservation notification failed:', e); }
}


// ═══════════════════════════════════════════════════
//  AI HELPERS (Claude API)
// ═══════════════════════════════════════════════════
const AI = {

  async callClaude(systemPrompt, userMessage, maxTokens = 600) {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_KEY not configured');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  },

  // Meal recommendations
  async recommend(userMood, menuItems, lang = 'en') {
    const menuSummary = menuItems
      .filter(i => i.available)
      .map(i => `[${i.id}] ${i.name} — ${i.description || ''} — ج.م ${i.price}${i.calories ? ` (${i.calories}cal)` : ''}`)
      .join('\n');
    const system = `You are a friendly restaurant assistant for Zahrat Elmadina Restaurant & Cafe. Based on what the customer feels like eating, recommend 2–3 dishes from the menu. Respond in ${lang === 'ar' ? 'Arabic' : 'English'}. Return ONLY valid JSON: {"recommendations":[{"id":"...","name":"...","reason":"..."}]}. Keep reasons short and appealing (max 12 words).`;
    const text = await AI.callClaude(system, `Customer says: "${userMood}"\n\nMenu:\n${menuSummary}`, 400);
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean).recommendations || [];
    } catch { return []; }
  },

  // Cart upsell
  async upsell(cartItems, menuItems, lang = 'en') {
    const cartSummary = cartItems.map(i => i.name).join(', ');
    const available = menuItems.filter(i => i.available && !cartItems.find(c => c.id === i.id));
    const menuSummary = available.slice(0, 20).map(i => `[${i.id}] ${i.name} — ج.م ${i.price}`).join('\n');
    const system = `You are a smart upsell engine for Zahrat Elmadina Restaurant & Cafe restaurant. Suggest ONE item that pairs well with the cart. Respond in ${lang === 'ar' ? 'Arabic' : 'English'}. Return ONLY valid JSON: {"id":"...","name":"...","reason":"..."}. Keep reason under 10 words. Only suggest if there's a genuine pairing.`;
    const text = await AI.callClaude(system, `Cart: ${cartSummary}\n\nAvailable to suggest:\n${menuSummary}`, 200);
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch { return null; }
  },

  // Generate menu item description
  async generateMenuDescription(name, category, price, lang = 'both') {
    const system = `You are a professional food writer for Zahrat Elmadina Restaurant & Cafe restaurant in Egypt. Write compelling, appetizing menu descriptions. Return ONLY valid JSON: {"description":"...","description_ar":"...","tags":["..."],"calories_estimate":number}. Description max 20 words each. Tags: 2-4 short relevant tags.`;
    const text = await AI.callClaude(system, `Dish: ${name}\nCategory: ${category}\nPrice: ج.م ${price}`, 400);
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch { return null; }
  },

  // Demand prediction
  async predictDemand(orderHistory) {
    if (!orderHistory.length) return null;
    const itemCounts = {};
    const dayItemCounts = {};
    orderHistory.forEach(o => {
      const ts = o.created_at?.toDate ? o.created_at.toDate() : new Date(o.created_at || Date.now());
      const day = ts.getDay();
      o.items?.forEach(i => {
        itemCounts[i.name] = (itemCounts[i.name] || 0) + i.qty;
        if (!dayItemCounts[day]) dayItemCounts[day] = {};
        dayItemCounts[day][i.name] = (dayItemCounts[day][i.name] || 0) + i.qty;
      });
    });
    const top = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    const tomorrowDay = tomorrow.getDay();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const tomorrowData = dayItemCounts[tomorrowDay] || {};
    const system = `You are a restaurant analytics AI for Zahrat Elmadina Restaurant & Cafe. Based on order history, predict tomorrow's demand. Return ONLY valid JSON: {"predictions":[{"item":"...","expected_qty":number,"confidence":"high|medium|low"}],"alerts":["..."]}. Max 6 predictions, max 3 alerts.`;
    const text = await AI.callClaude(system,
      `Tomorrow: ${dayNames[tomorrowDay]}\nTop items overall: ${JSON.stringify(top)}\nHistorical data for ${dayNames[tomorrowDay]}s: ${JSON.stringify(tomorrowData)}\nTotal orders analyzed: ${orderHistory.length}`, 600);
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch { return null; }
  },

  // Photo to order (vision)
  async identifyDish(base64Image, menuItems) {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_KEY not configured');
    const menuNames = menuItems.filter(i => i.available).map(i => i.name).join(', ');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image.split(',')[1] || base64Image } },
            { type: 'text', text: `Our menu items: ${menuNames}. What menu item does this photo show? Return ONLY JSON: {"matched_name":"...","confidence":"high|medium|low","message":"..."}. If no match, set matched_name to null.` }
          ]
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch { return null; }
  },
};

window.DB = DB;
window.AI = AI;
window.sendWhatsAppAlert = sendWhatsAppAlert;
window.ANTHROPIC_KEY = ANTHROPIC_KEY;
