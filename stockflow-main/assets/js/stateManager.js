// assets/js/stateManager.js
(function () {
  'use strict';

  window.APP = window.APP || {};
  
  // Enforce structured initialization baselines
  window.APP.academic = window.APP.academic || { years: [], terms: [], weeks: [], currentWeek: null };
  window.APP.inventory = { items: [], stats: { totalRevenue: 0, itemsSold: 0, lowStockCount: 0 } };
  window.APP._initialized = false;

  // Clear authentication validator helper
  window.APP.isAuthenticated = function() { 
    return !!this.user; 
  };
    
  // Primary boot manager called by dashboard.js
  window.APP.init = async function() {
    if (this._initialized) return;
    
    await this._waitForSupabase();
    await this._loadAuth();
    await this._loadAcademic();
    this._setupAuthListener();
    
    this._initialized = true;
    console.log('✅ Global state engine initialized cleanly.');
  };

  // Safe timeout loop to verify config.js loaded the SDK dependency
  window.APP._waitForSupabase = async function(timeout = 5000) {
    if (this.supabase || window.supabaseClient) {
      this.supabase = this.supabase || window.supabaseClient;
      return;
    }
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (window.supabaseClient || (window.supabase && window.CONFIG)) {
          if (!window.supabaseClient) {
            window.supabaseClient = window.supabase.createClient(window.CONFIG.supabase.url, window.CONFIG.supabase.key);
          }
          this.supabase = window.supabaseClient;
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error("Supabase initialization sequence timeout"));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  };

  // Safe extraction of the active session mapped to your profiles table record
  window.APP._loadAuth = async function() {
    try {
      const { data: { session }, error: authError } = await this.supabase.auth.getSession();
      if (authError) throw authError;

      if (!session?.user) {
        this.user = null;
        console.log('📋 Auth State Check -> No Session Active');
        return;
      }

      // Query database profile using the Supabase auth user UUID matching profiles.id
      const { data: profile, error: dbError } = await this.supabase
        .from('profiles')
        .select('id, username, full_name, role, is_active, user_id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (dbError) throw dbError;

      if (!profile) {
        console.warn(`⚠️ Auth user found but no row exists in 'profiles' table for ID: ${session.user.id}`);
        // Fallback to basic meta token if database row hasn't initialized yet
        this.user = {
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name || "System User",
          role: "staff"
        };
      } else {
        // Enforce account check status
        if (profile.is_active === false) {
          console.error("🚫 Authenticated profile has been marked inactive inside database.");
          this.user = null;
          await this.supabase.auth.signOut();
          return;
        }

        // Attach custom fields from database profile directly to application state object
        this.user = {
          id: profile.id,
          email: session.user.email,
          username: profile.username,
          full_name: profile.full_name, // Extracted directly from table field
          role: profile.role || 'staff',
          legacy_user_id: profile.user_id
        };
        console.log(`📋 Profile Fully Hydrated: ${this.user.full_name} (${this.user.role.toUpperCase()})`);
      }
    } catch (err) {
      console.error("Auth hydration state breakdown:", err);
      this.user = null;
    }
  };

  // Global channel manager for session status updates
  window.APP._setupAuthListener = function() {
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      const pastUser = this.user;
      
      console.log(`📡 Supabase Auth Event Fired: [${event}]`);
      
      // CRITICAL LOOP RECOVERY: Only bounce if session explicitly logs out or transitions state changes
      if (event === 'SIGNED_OUT' && pastUser) {
        console.warn("User explicitly logged out. Clearing context routing thread.");
        this.user = null;
        window.location.href = window.CONFIG?.routes?.login || 'index.html';
      } else if (event === 'SIGNED_IN' && !pastUser) {
        // If a sign-in transition occurs after boot, run re-hydration
        await this._loadAuth();
      }
    });
  };

  // Hydrate academic parameters using real table tracking references
  window.APP._loadAcademic = async function() {
    try {
      const [yearsRes, termsRes, weeksRes] = await Promise.all([
        this.supabase.from("academic_years").select("*").order("name"),
        this.supabase.from("terms").select("*").order("name"),
        this.supabase.from("term_weeks").select("*").order("week_number")
      ]);

      this.academic.years = yearsRes.data || [];
      this.academic.terms = termsRes.data || [];
      
      // Dynamically transform text string 'status' to front-end expected 'is_open' boolean
      this.academic.weeks = (weeksRes.data || []).map(w => ({
        ...w,
        is_open: w.status === 'OPEN'
      }));
    } catch (e) {
      console.error("Failed to hydrate structural global academic data sets", e);
    }
  };

  // Map loadStock smoothly directly to weekly_stock without throwing layout crashes
  window.APP.loadStock = async function(weekId) {
    try {
      if (!weekId) {
        this.inventory.items = [];
        this.inventory.stats = this._calculateStats([]);
        return;
      }

      const weekMeta = this.academic.weeks?.find(w => w.id === weekId);
      if (!weekMeta) {
        console.warn(`Timeframe context for week ID "${weekId}" is not hydrated yet. Postponing live rendering.`);
        this.inventory.items = [];
        this.inventory.stats = this._calculateStats([]);
        return;
      }

      const term = this.academic.terms?.find(t => t.id === weekMeta.term_id);
      const academicYearObj = this.academic.years?.find(y => y.id === term?.academic_year_id);
      const numericYear = academicYearObj ? parseInt(academicYearObj.name, 10) : new Date().getFullYear();

      const { data, error } = await this.supabase
        .from("weekly_stock")
        .select(`
          id,
          opening_stock,
          add_stock,
          total_stock,
          quantity_sold,
          closing_stock,
          revenue,
          products (
            product_name,
            size,
            unit_price
          )
        `)
        .eq("year", numericYear)
        .eq("week_number", weekMeta.week_number);

      if (error) throw error;
      
      this.inventory.items = (data || []).map(row => ({
        id: row.id,
        name: row.products?.product_name || "Unknown Item",
        size: row.products?.size || "N/A",
        opening: row.opening_stock || 0,
        add: row.add_stock || 0,
        total: row.total_stock || ((row.opening_stock || 0) + (row.add_stock || 0)),
        sold: row.quantity_sold || 0,
        price: row.products?.unit_price || 0,
        closing: row.closing_stock || 0,
        revenue: row.revenue || 0
      }));

      this.inventory.stats = this._calculateStats(this.inventory.items);
    } catch (err) {
      console.error("Error loading database data from weekly_stock table:", err);
      this.inventory.items = [];
      this.inventory.stats = this._calculateStats([]);
    }
  };

  // Core business metrics calculator engine
  window.APP._calculateStats = function(items) {
    let totalRevenue = 0;
    let itemsSold = 0;
    let lowStockCount = 0;
    const threshold = window.CONFIG?.settings?.lowStockThreshold || 5;

    items.forEach(item => {
      totalRevenue += parseFloat(item.revenue || 0);
      itemsSold += parseInt(item.sold || 0, 10);
      if (parseInt(item.closing || 0, 10) <= threshold) {
        lowStockCount++;
      }
    });

    return { totalRevenue, itemsSold, lowStockCount };
  };

  // Global dynamic element notifier
  window.APP.showToast = function(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      background: ${type === 'success' ? '#2ec4b6' : '#e71d36'};
      color: #fff; padding: 12px 24px; margin-bottom: 10px;
      border-radius: 6px; font-weight: 500; display: inline-block;
    `;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), window.CONFIG?.settings?.toastDuration || 3000);
  };

  // Hard logout termination routine
  window.APP.signOut = async function() {
    try {
      this.user = null;
      await this.supabase.auth.signOut();
      window.location.href = window.CONFIG?.routes?.login || 'index.html';
    } catch(e) {
      window.location.href = window.CONFIG?.routes?.login || 'index.html';
    }
  };
})();