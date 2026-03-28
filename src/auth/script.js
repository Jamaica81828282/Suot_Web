import { supabase } from '../db/supabase.js'

// ── Toggle between login / signup ──────────────────────────────
function toggleAuth() {
    const login   = document.getElementById('loginSection')
    const signup  = document.getElementById('signupSection')
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
    const activeForm = document.querySelector('#loginSection form, #signupSection form')
    if (activeForm) activeForm.appendChild(el)
}

function clearError() {
    const el = document.getElementById('authError')
    if (el) el.remove()
}

function setLoading(btn, loading) {
    btn.disabled      = loading
    btn.dataset.orig  = btn.dataset.orig || btn.textContent
    btn.textContent   = loading ? 'Please wait…' : btn.dataset.orig
    btn.style.opacity = loading ? '0.7' : '1'
}

// ── ROLE-BASED REDIRECT ────────────────────────────────────────
async function redirectByRole(userId) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, ban_reason')
        .eq('id', userId)
        .single()

    if (profile?.role === 'banned') {
        await supabase.auth.signOut()
        localStorage.removeItem('suotUserId')
        localStorage.removeItem('suotUser')
        localStorage.removeItem('suotEmail')
        if (profile.ban_reason) {
            localStorage.setItem('suotBanReason', profile.ban_reason)
        } else {
            localStorage.removeItem('suotBanReason')
        }
        window.location.href = '../auth/login.html?banned=true'
        return
    }

    if (profile?.role === 'super_admin') {
        window.location.href = '../dashboard/admin-dashboard.html'
    } else {
        window.location.href = '../dashboard/dashboard.html'
    }
}

// ══════════════════════════════════════════
//  PASSWORD REQUIREMENTS
// ══════════════════════════════════════════
const RULES = [
    { id: 'rule-length',  test: v => v.length >= 8,          label: 'At least 8 characters' },
    { id: 'rule-upper',   test: v => /[A-Z]/.test(v),        label: 'One uppercase letter' },
    { id: 'rule-number',  test: v => /[0-9]/.test(v),        label: 'One number' },
    { id: 'rule-special', test: v => /[^A-Za-z0-9]/.test(v), label: 'One special character' },
]

function calcStrength(pw) {
    const passed = RULES.filter(r => r.test(pw)).length
    if (pw.length === 0) return { score: 0,   label: '—',        color: '#eee' }
    if (passed <= 1)     return { score: 25,  label: 'Weak',     color: '#ef4444' }
    if (passed === 2)    return { score: 50,  label: 'Fair',     color: '#f97316' }
    if (passed === 3)    return { score: 75,  label: 'Good',     color: '#eab308' }
    return                      { score: 100, label: 'Strong ✓', color: '#4A635D' }
}

function updatePasswordUI(pw) {
    const rules     = document.getElementById('pwRules')
    const strengthW = document.getElementById('pwStrengthWrap')
    const fill      = document.getElementById('pwStrengthFill')
    const lbl       = document.getElementById('pwStrengthLabel')
    if (!rules) return
    const show = pw.length > 0
    rules.classList.toggle('visible', show)
    strengthW.classList.toggle('visible', show)
    RULES.forEach(r => {
        const el = document.getElementById(r.id)
        if (el) el.classList.toggle('met', r.test(pw))
    })
    const { score, label, color } = calcStrength(pw)
    fill.style.width      = score + '%'
    fill.style.background = color
    lbl.style.color       = color
    lbl.textContent       = show ? label : '—'
}

function isPasswordValid(pw) {
    return RULES.every(r => r.test(pw))
}

const pwInput = document.getElementById('signupPassword')
if (pwInput) {
    pwInput.addEventListener('input', () => {
        updatePasswordUI(pwInput.value)
        checkMatch()
    })
}

const confirmInput = document.getElementById('signupConfirm')
function checkMatch() {
    const msg = document.getElementById('pwMatchMsg')
    if (!msg || !confirmInput || !pwInput) return
    const pw  = pwInput.value
    const cfm = confirmInput.value
    if (!cfm) { msg.className = 'pw-match-msg'; return }
    msg.classList.add('visible')
    if (pw === cfm) {
        msg.className   = 'pw-match-msg visible ok'
        msg.textContent = '✓ Passwords match'
    } else {
        msg.className   = 'pw-match-msg visible err'
        msg.textContent = '✗ Passwords do not match'
    }
}
if (confirmInput) {
    confirmInput.addEventListener('input', checkMatch)
}

// ── SIGN IN ────────────────────────────────────────────────────
const loginForm = document.querySelector('#loginSection form')
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        clearError()
        const email    = loginForm.querySelector('input[type="email"]').value.trim()
        const password = document.getElementById('loginPassword').value
        const btn      = loginForm.querySelector('button[type="submit"]')
        if (!email || !password) { showError('Please fill in all fields.'); return }
        setLoading(btn, true)
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        setLoading(btn, false)
        if (error) {
            const msgs = {
                'Invalid login credentials': 'Incorrect email or password.',
                'Email not confirmed':       'Please verify your email first. Check your inbox.',
                'Too many requests':         'Too many attempts. Please wait a moment.',
            }
            showError(msgs[error.message] || error.message)
            return
        }
        const name = data.user.user_metadata?.full_name
                  || data.user.user_metadata?.name
                  || data.user.email.split('@')[0]
        localStorage.setItem('suotUser',   name)
        localStorage.setItem('suotEmail',  data.user.email)
        localStorage.setItem('suotUserId', data.user.id)
        await redirectByRole(data.user.id)
    })
}

// ── SIGN UP ────────────────────────────────────────────────────
const signupForm = document.getElementById('signupForm')
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        clearError()
        const fullName = document.getElementById('signupName').value.trim()
        const email    = document.getElementById('signupEmail').value.trim()
        const password = document.getElementById('signupPassword').value
        const confirm  = document.getElementById('signupConfirm').value
        const btn      = document.getElementById('signupBtn')
        if (!fullName || !email || !password || !confirm) {
            showError('Please fill in all fields.')
            return
        }
        if (!isPasswordValid(password)) {
            showError('Please meet all password requirements.')
            document.getElementById('pwRules')?.classList.add('visible')
            document.getElementById('pwStrengthWrap')?.classList.add('visible')
            updatePasswordUI(password)
            return
        }
        if (password !== confirm) {
            showError('Passwords do not match.')
            return
        }
        setLoading(btn, true)
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
        })
        setLoading(btn, false)
        if (error) {
            const msgs = {
                'User already registered':                   'An account with this email already exists.',
                'Password should be at least 6 characters': 'Password must be at least 8 characters and meet all requirements.',
            }
            showError(msgs[error.message] || error.message)
            return
        }
        if (data.user && !data.session) {
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
        if (data.session) {
            localStorage.setItem('suotUser',   fullName)
            localStorage.setItem('suotEmail',  email)
            localStorage.setItem('suotUserId', data.user.id)
            await redirectByRole(data.user.id)
        }
    })
}

// ── GOOGLE SIGN IN / SIGN UP ───────────────────────────────────
async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/src/auth/login.html`
        }
    })
    if (error) showError('Google sign-in failed. Please try again.')
}

const googleSignInBtn = document.getElementById('googleSignInBtn')
const googleSignUpBtn = document.getElementById('googleSignUpBtn')
if (googleSignInBtn) googleSignInBtn.addEventListener('click', signInWithGoogle)
if (googleSignUpBtn) googleSignUpBtn.addEventListener('click', signInWithGoogle)

// ── AUTH STATE: redirect if already logged in ──────────────────
supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
        const name = session.user.user_metadata?.full_name
                  || session.user.email.split('@')[0]
        localStorage.setItem('suotUser',   name)
        localStorage.setItem('suotEmail',  session.user.email)
        localStorage.setItem('suotUserId', session.user.id)
        await redirectByRole(session.user.id)
    }
})

// ── PASSWORD VISIBILITY TOGGLE ─────────────────────────────────
function togglePw(inputId, btn) {
    const input = document.getElementById(inputId)
    if (!input) return
    const isHidden = input.type === 'password'
    input.type = isHidden ? 'text' : 'password'
    btn.querySelector('.eye-open').style.display   = isHidden ? 'none' : ''
    btn.querySelector('.eye-closed').style.display = isHidden ? ''     : 'none'
}
window.togglePw = togglePw