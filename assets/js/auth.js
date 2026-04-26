// assets/js/auth.js - CLEAN VERSION

document.addEventListener('DOMContentLoaded', async () => {

    // Check dependencies
    if (typeof CONFIG === 'undefined' || typeof window.supabaseClient === 'undefined') {
        console.error("❌ CONFIG or supabaseClient not loaded");
        return;
    }

    const container = document.getElementById('container');

    // Panel toggle buttons
    const signUpBtn = document.getElementById('signUp');
    const signInBtn = document.getElementById('signIn');

    if (signUpBtn) signUpBtn.addEventListener('click', () => container?.classList.add("right-panel-active"));
    if (signInBtn) signInBtn.addEventListener('click', () => container?.classList.remove("right-panel-active"));

    // SIGN UP
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
                alert("Please fill in all fields.");
                return;
            }

            const btn = signupForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = "Creating...";

            try {
                const { data, error } = await window.supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {  // ✅ FIXED: Added "data" key
                            username,
                            full_name: fullName,
                            role
                        },
                        emailConfirmations: false
                    }
                });

                if (error) throw error;

                if (data.user) {
                    alert("✅ Account created! Welcome.");
                    window.location.href = CONFIG.routes.dashboard;
                }
            } catch (err) {
                console.error(err);
                alert(err.message || "Sign up failed");
            } finally {
                btn.disabled = false;
                btn.textContent = "Sign Up";
            }
        });
    }

    // SIGN IN
    const signinForm = document.getElementById('signinForm');
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('signinEmail')?.value?.trim();
            const password = document.getElementById('signinPassword')?.value;

            if (!email || !password) {
                alert("Please enter email and password.");
                return;
            }

            const btn = signinForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = "Signing in...";

            try {
                const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;

                if (data.user) {
                    alert("✅ Welcome back!");
                    window.location.href = CONFIG.routes.dashboard;
                }
            } catch (err) {
                console.error(err);
                alert("Invalid email or password");
            } finally {
                btn.disabled = false;
                btn.textContent = "Sign In";
            }
        });
    }
});

// Password toggle (simple version)
function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input || !icon) return;

    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}