// assets/js/auth.js - ROBUST VERSION WITH PROFILE CREATION

// ========== SIMPLE TOAST ==========
function showToast(msg, type) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:6px;color:white;font-weight:500;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.1);background:${type==='error'?'#ef4444':'#10b981'}; transition: opacity 0.3s;`;
  t.innerHTML = `<span>${msg}</span><span onclick="this.parentElement.remove()" style="margin-left:12px;cursor:pointer">✕</span>`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, type==='error'?5000:3000);
}
function showError(m) { showToast(m, 'error'); console.error('❌', m); }
function showSuccess(m) { showToast(m, 'success'); console.log('✅', m); }

// ========== MAIN AUTH LOGIC ==========
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for config
  let retries = 0;
  while ((!window.CONFIG || !window.supabaseClient) && retries < 30) {
    await new Promise(r => setTimeout(r, 100)); retries++;
  }

  if (!window.CONFIG || !window.supabaseClient) {
    showError("Configuration error. Please refresh.");
    return;
  }

  const supabase = window.supabaseClient;
  const CONFIG = window.CONFIG;
  const container = document.getElementById('container');
  const signUpBtn = document.getElementById('signUp');
  const signInBtn = document.getElementById('signIn');

  // Panel Toggling
  if (signUpBtn) signUpBtn.addEventListener('click', () => container?.classList.add("right-panel-active"));
  if (signInBtn) signInBtn.addEventListener('click', () => container?.classList.remove("right-panel-active"));

  // SIGN UP HANDLER
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('signupUsername')?.value?.trim();
      const fullName = document.getElementById('signupFullName')?.value?.trim();
      const email = document.getElementById('signupEmail')?.value?.trim();
      const password = document.getElementById('signupPassword')?.value;
      const role = document.getElementById('signupRole')?.value || 'staff';

      if (!username || !fullName || !email || !password) {
        showError("Please fill in all fields.");
        return;
      }

      const btn = signupForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = "Creating Account...";

      try {
        // 1. Create Auth User
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, full_name: fullName, role },
            emailConfirmations: false // Auto-confirm for testing/dev
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // 2. CREATE PROFILE & USER RECORDS (Critical for Inventory System)
          // We need an Integer ID for the inventory system, so we insert into 'users' first

          // Insert into 'users' table to get an Integer ID
          const {  newUser, error: userInsertError } = await supabase
            .from('users')
            .insert({
              username: username,
              email: email,
              full_name: fullName,
              role: role,
              is_active: true
            })
            .select()
            .single();

          if (userInsertError) throw userInsertError;

          // Update 'profiles' table to link UUID to Integer ID
          const { error: profileUpdateError } = await supabase
            .from('profiles')
            .update({
              username: username,
              full_name: fullName,
              role: role,
              user_id: newUser.id // Link the Integer ID
            })
            .eq('id', authData.user.id); // Match by Auth UUID

          if (profileUpdateError) throw profileUpdateError;

          showSuccess("✅ Account created! Logging you in...");

          // 3. Sign In Immediately
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email, password
          });

          if (signInError) throw signInError;

          setTimeout(() => {
            window.location.href = CONFIG.routes?.dashboard || 'dashboard.html';
          }, 1500);
        }
      } catch (err) {
        console.error(err);
        showError(err.message || "Sign up failed");
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }

  // SIGN IN HANDLER
  const signinForm = document.getElementById('signinForm');
  if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signinEmail')?.value?.trim();
      const password = document.getElementById('signinPassword')?.value;

      if (!email || !password) {
        showError("Please enter email and password.");
        return;
      }

      const btn = signinForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = "Signing in...";

      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
          showSuccess("✅ Welcome back!");
          setTimeout(() => {
            window.location.href = CONFIG.routes?.dashboard || 'dashboard.html';
          }, 1000);
        }
      } catch (err) {
        console.error(err);
        showError("Invalid email or password");
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }
  // Auto-redirect if already signed in
  try {
    // Correct destructuring: Get 'session' from 'data' object
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      console.log("User already logged in. Redirecting...");
      // Ensure CONFIG.routes.dashboard exists, otherwise fallback to dashboard.html
      const redirectUrl = (CONFIG && CONFIG.routes && CONFIG.routes.dashboard)
                          ? CONFIG.routes.dashboard
                          : 'dashboard.html';

      window.location.href = redirectUrl;
    }
  } catch (e) {
    console.warn('⚠️ Auth check skipped:', e.message);
  }
});

// Password toggle
window.togglePassword = function(id, iconId) {
  const input = document.getElementById(id);
  const icon = document.getElementById(iconId);
  if (!input || !icon) return;

  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace('fa-eye','fa-eye-slash');
  } else {
    input.type = "password";
    icon.classList.replace('fa-eye-slash','fa-eye');
  }
};