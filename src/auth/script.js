import { supabase } from '../db/supabase.js'

// ── Toggle between login / signup ──────────────────────────────
function toggleAuth() {
    const login  = document.getElementById('loginSection')
    const signup = document.getElementById('signupSection')
    const isLogin = login.style.display !== 'none'
    login.style.display  = isLogin ? 'none'  : 'block'
    signup.style.display = isLogin ? 'block' : 'none'
    clearError()
}
window.toggleAuth = toggleAuth


// ── Helpers ────────────────────────────────────────────────────
function showError(msg) {
    clearError()
    const el = document.createElement('p')
    el.id        = 'authError'
    el.innerText = '⚠ ' + msg
    el.style.cssText = `
        color:#c0392b; font-size:13px; font-weight:600;
        margin: 8px 0 0; text-align:center;
        animation: fadeIn .25s ease;
    `
    // Insert after the active form's submit button
    const activeForm = document.querySelector('#loginSection form, #signupSection form:not([style*="none"])')
    if (activeForm) activeForm.appendChild(el)
}

function clearError() {
    const el = document.getElementById('authError')
    if (el) el.remove()
}

function setLoading(btn, loading) {
    btn.disabled    = loading
    btn.dataset.orig = btn.dataset.orig || btn.textContent
    btn.textContent  = loading ? 'Please wait…' : btn.dataset.orig
    btn.style.opacity = loading ? '0.7' : '1'
}


// ── SIGN IN ────────────────────────────────────────────────────
const loginForm = document.querySelector('#loginSection form')
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        clearError()

        const email    = loginForm.querySelector('input[type="email"]').value.trim()
        const password = loginForm.querySelector('input[type="password"]').value
        const btn      = loginForm.querySelector('button[type="submit"]')

        if (!email || !password) {
            showError('Please fill in all fields.')
            return
        }

        setLoading(btn, true)

        const { data, error } = await supabase.auth.signInWithPassword({ email, password })

        setLoading(btn, false)

        if (error) {
            // Make Supabase errors human-readable
            const msgs = {
                'Invalid login credentials': 'Incorrect email or password.',
                'Email not confirmed':       'Please verify your email first. Check your inbox.',
                'Too many requests':         'Too many attempts. Please wait a moment.',
            }
            showError(msgs[error.message] || error.message)
            return
        }

        // Save name and id to localStorage for dashboard display and namespaced storage
        const name = data.user.user_metadata?.full_name
              || data.user.user_metadata?.name
              || data.user.email.split('@')[0]
        localStorage.setItem('suotUser', name)
        localStorage.setItem('suotEmail', data.user.email)
        localStorage.setItem('suotUserId', data.user.id)

        window.location.href = '../dashboard/dashboard.html'
    })
}


// ── SIGN UP ────────────────────────────────────────────────────
const signupForm = document.getElementById('signupForm')
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        clearError()

        const fullName = document.getElementById('signupName').value.trim()
        const email    = signupForm.querySelector('input[type="email"]').value.trim()
        const password = signupForm.querySelector('input[type="password"]').value
        const btn      = signupForm.querySelector('button[type="submit"]')

        if (!fullName || !email || !password) {
            showError('Please fill in all fields.')
            return
        }
        if (password.length < 6) {
            showError('Password must be at least 6 characters.')
            return
        }

        setLoading(btn, true)

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName }   // stored in user_metadata
            }
        })

        setLoading(btn, false)

        if (error) {
            const msgs = {
                'User already registered': 'An account with this email already exists.',
                'Password should be at least 6 characters': 'Password must be at least 6 characters.',
            }
            showError(msgs[error.message] || error.message)
            return
        }

        // Supabase may require email confirmation depending on your settings
        if (data.user && !data.session) {
            // Email confirmation required — show message instead of redirecting
            signupForm.innerHTML = `
                <div style="text-align:center; padding: 20px 0; display:flex; flex-direction:column; gap:12px;">
                    <div style="font-size:2.5rem;">📬</div>
                    <h3 style="margin:0; font-size:1.1rem; font-weight:700;">Check your inbox!</h3>
                    <p style="margin:0; color:#888; font-size:13px; line-height:1.6;">
                        We sent a confirmation link to<br>
                        <strong style="color:#4A635D;">${email}</strong><br>
                        Click it to activate your account, then sign in.
                    </p>
                    <button onclick="toggleAuth()" style="
                        padding:10px 20px; background:#4A635D; color:#fff; border:none;
                        border-radius:50px; font-family:inherit; font-weight:700;
                        font-size:13px; cursor:pointer; margin-top:4px;">
                        Back to Sign In
                    </button>
                </div>`
            return
        }

        // If email confirmation is OFF in Supabase — session is returned immediately
        if (data.session) {
            localStorage.setItem('suotUser',  fullName)
            localStorage.setItem('suotEmail', email)
            localStorage.setItem('suotUserId', data.user.id)
            window.location.href = '../dashboard/dashboard.html'
        }
    })
}


// ── GOOGLE SIGN IN ─────────────────────────────────────────────
const googleBtn = document.querySelector('.btn-google')
if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/dashboard/dashboard.html'
            }
        })
        if (error) showError('Google sign-in failed. Please try again.')
    })
}


// ── AUTH STATE: redirect if already logged in ──────────────────
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        // Already logged in — skip the auth page
        const name = session.user.user_metadata?.full_name
                  || session.user.email.split('@')[0]
        localStorage.setItem('suotUser',  name)
        localStorage.setItem('suotEmail', session.user.email)
        localStorage.setItem('suotUserId', session.user.id)
        window.location.href = '../dashboard/dashboard.html'
    }
})