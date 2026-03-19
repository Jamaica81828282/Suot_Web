import { signOut } from '../db/supabase.js'

// initialization routine, safe whether or not DOMContentLoaded has already fired
 function initDashboard() {
    // 1. Sync User Data from Supabase (not localStorage)
    import('../db/supabase.js').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { window.location.href = '../auth/login.html'; return; }
            supabase.from('profiles').select('username,display_name,avatar_url,pts')
                .eq('id', session.user.id).single().then(({ data: profile }) => {
                    if (!profile) return;
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
    // helper exposed so other code can apply a filter programmatically
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

    // 2. Category Filter – tie buttons to the helper
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

// Logout logic — sign out from Supabase, clear user state, then go to index
async function logout() {
    if (!confirm('Are you sure you want to log out?')) return
    try {
        await signOut('../index.html')
    } catch (e) {
        // Fallback: clear local UI state and redirect to index
        try { localStorage.removeItem('suotUserId'); localStorage.removeItem('suotUser'); localStorage.removeItem('suotEmail') } catch(_){}
        window.location.href = '../index.html'
    }
}
window.logout = logout

// Modal Functions
function openTopUpModal() { document.getElementById('topUpModal').style.display = 'flex'; }
function closeTopUpModal() { document.getElementById('topUpModal').style.display = 'none'; }

function buyPack(pts, tax) {
    if(confirm(`Add ${pts} points?`)) {
        processPoints(pts);
    }
}

function processPoints(pts) {
    const ptsDisplay = document.getElementById('currentPoints');
    let current = parseInt(ptsDisplay.innerText.replace(/,/g, ''));
    ptsDisplay.innerText = (current + pts).toLocaleString();
    closeTopUpModal();
}
function updateWishlistCount() {
    // Assuming you store wishlist items in localStorage under namespaced 'suot_wishlist_<uid>'
    const __suot_uid = localStorage.getItem('suotUserId') || 'anon';
    const wishlist = JSON.parse(localStorage.getItem(`suot_wishlist_${__suot_uid}`) || '[]');
    const countBadge = document.getElementById('wishlistNavCount');
    
    if (wishlist.length > 0) {
        countBadge.innerText = wishlist.length;
        countBadge.style.display = 'flex'; // Show if there are items
    } else {
        countBadge.style.display = 'none'; // Hide if empty
    }
}

// Call it when the page loads
updateWishlistCount();