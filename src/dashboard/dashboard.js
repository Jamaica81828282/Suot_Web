import { signOut } from '../db/supabase.js'

function initDashboard() {
    import('../db/supabase.js').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { window.location.href = '../auth/login.html'; return; }
            supabase.from('profiles').select('username,display_name,avatar_url,pts,role,ban_reason')
                .eq('id', session.user.id).single().then(({ data: profile }) => {
                    if (!profile) return;

                    // ── Ban check ──
                    if (profile.role === 'banned') {
                        import('../db/supabase.js').then(({ supabase: sb }) => sb.auth.signOut())
                        localStorage.removeItem('suotUserId')
                        localStorage.removeItem('suotUser')
                        localStorage.removeItem('suotEmail')
                        // Store ban reason so login page can display it
                        if (profile.ban_reason) {
                            localStorage.setItem('suotBanReason', profile.ban_reason)
                        } else {
                            localStorage.removeItem('suotBanReason')
                        }
                        window.location.href = '../auth/login.html?banned=true'
                        return
                    }

                    const name = profile.display_name || profile.username || 'Swapper';
                    const greeting = document.getElementById('welcomeGreeting');
                    if (greeting) greeting.innerHTML = `Welcome back, <em>${name}!</em>`;
                    const profileName = document.getElementById('profileName');
                    if (profileName) profileName.innerText = name;
                    const userAvatar = document.getElementById('userAvatar');
                    if (userAvatar) userAvatar.src = profile.avatar_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7&bold=true`;
                    const ptsEl = document.getElementById('currentPoints');
                    if (ptsEl && profile.pts != null) ptsEl.innerText = profile.pts.toLocaleString();
                });
        });
    });

    function filterItems(filter) {
        document.querySelectorAll('.cat-link').forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === filter));
        document.querySelectorAll('.item-card').forEach(item => {
            if (filter === 'all' || item.getAttribute('data-category') === filter) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
    window.filterItems = filterItems;

    document.querySelectorAll('.cat-link[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            filterItems(filter);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

async function logout() {
    if (!confirm('Are you sure you want to log out?')) return
    try {
        const { supabase } = await import('../db/supabase.js')
        await supabase.auth.signOut()
        localStorage.removeItem('suotUserId')
        localStorage.removeItem('suotUser')
        localStorage.removeItem('suotEmail')
        window.location.href = '../index.html'
    } catch (e) {
        localStorage.removeItem('suotUserId')
        localStorage.removeItem('suotUser')
        localStorage.removeItem('suotEmail')
        window.location.href = '../index.html'
    }
}
window.logout = logout

function openTopUpModal() { document.getElementById('topUpModal').style.display = 'flex'; }
function closeTopUpModal() { document.getElementById('topUpModal').style.display = 'none'; }

function buyPack(pts, tax) {
    if(confirm(`Add ${pts} points?`)) { processPoints(pts); }
}

function processPoints(pts) {
    const ptsDisplay = document.getElementById('currentPoints');
    let current = parseInt(ptsDisplay.innerText.replace(/,/g, ''));
    ptsDisplay.innerText = (current + pts).toLocaleString();
    closeTopUpModal();
}

function updateWishlistCount() {
    const __suot_uid = localStorage.getItem('suotUserId') || 'anon';
    const wishlist = JSON.parse(localStorage.getItem(`suot_wishlist_${__suot_uid}`) || '[]');
    const countBadge = document.getElementById('wishlistNavCount');
    if (wishlist.length > 0) {
        countBadge.innerText = wishlist.length;
        countBadge.style.display = 'flex';
    } else {
        countBadge.style.display = 'none';
    }
}

updateWishlistCount();