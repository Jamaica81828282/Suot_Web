import { supabase } from '../db/supabase.js'

let currentUser  = null
let wishlist     = []
let activeFilter = 'all'

// ── BOOT ──
async function boot() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '../auth/login.html'; return }
    currentUser = session.user

    const { data: profile } = await supabase
        .from('profiles').select('username,display_name,avatar_url').eq('id', currentUser.id).single()
    if (profile) {
        document.getElementById('profileName').textContent = profile.display_name || profile.username || 'Swapper'
        if (profile.avatar_url) document.getElementById('userAvatar').src = profile.avatar_url
    }

    await loadWishlist()
}

// ── LOAD FROM SUPABASE ──
async function loadWishlist() {
    document.getElementById('pageLoading').style.display = 'flex'
    document.getElementById('wishlistGrid').style.display = 'none'
    document.getElementById('emptyState').style.display  = 'none'

    const { data, error } = await supabase
        .from('wishlist')
        .select(`id, saved_at, items ( id, name, category, brand, pts, condition, size, images, profiles ( username, display_name ) )`)
        .eq('user_id', currentUser.id)
        .order('saved_at', { ascending: false })

    document.getElementById('pageLoading').style.display = 'none'
    document.getElementById('wishlistGrid').style.display = 'grid'

    if (error) { console.error('Wishlist error:', error); showToast('Could not load wishlist.'); return }

    wishlist = (data || []).filter(r => r.items).map(r => ({
        wishlist_id: r.id,
        saved_at:    r.saved_at,
        item_id:     r.items.id,
        name:        r.items.name,
        category:    r.items.category,
        brand:       r.items.brand,
        pts:         r.items.pts,
        condition:   r.items.condition,
        size:        r.items.size,
        image:       (r.items.images || [])[0] || null,
        swapper:     r.items.profiles?.display_name || r.items.profiles?.username || ''
    }))

    syncLocalStorage()
    updateNavBadge()
    render()
}

// ── RENDER ──
window.render = function() {
    const sort = document.getElementById('sortSelect').value
    let items  = [...wishlist]
    if (activeFilter !== 'all') items = items.filter(i => (i.category||'').toLowerCase() === activeFilter)
    switch(sort) {
        case 'newest':     items.sort((a,b)=>new Date(b.saved_at)-new Date(a.saved_at)); break
        case 'oldest':     items.sort((a,b)=>new Date(a.saved_at)-new Date(b.saved_at)); break
        case 'price-low':  items.sort((a,b)=>(a.pts||0)-(b.pts||0)); break
        case 'price-high': items.sort((a,b)=>(b.pts||0)-(a.pts||0)); break
        case 'name':       items.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); break
    }

    document.getElementById('statTotal').textContent   = wishlist.length
    document.getElementById('statTops').textContent    = wishlist.filter(i=>(i.category||'').toLowerCase()==='tops').length
    document.getElementById('statBottoms').textContent = wishlist.filter(i=>(i.category||'').toLowerCase()==='bottoms').length
    document.getElementById('statOther').textContent   = wishlist.filter(i=>!['tops','bottoms'].includes((i.category||'').toLowerCase())).length
    document.getElementById('btnClearAll').style.display = wishlist.length ? 'block' : 'none'

    const grid  = document.getElementById('wishlistGrid')
    const empty = document.getElementById('emptyState')
    if (items.length === 0) { grid.innerHTML=''; empty.style.display='flex'; return }
    empty.style.display = 'none'

    const fb = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600'
    grid.innerHTML = items.map((item,idx) => `
        <div class="wish-card" style="animation-delay:${idx*0.05}s">
            <div class="wish-img-wrap">
                <img src="${item.image||fb}" alt="${item.name}" loading="lazy"/>
                <span class="wish-cat-badge">${item.category||'—'}</span>
                <button class="wish-heart-btn" onclick="removeItem('${item.wishlist_id}')">
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                </button>
                <div class="wish-overlay">
                    <button class="btn-wish-swap" onclick="goToItem('${item.item_id}')">Swap Now</button>
                    <button class="btn-wish-remove-overlay" onclick="removeItem('${item.wishlist_id}')">Remove</button>
                </div>
            </div>
            <div class="wish-card-body">
                <p class="wish-item-cat">${item.category||'—'}</p>
                <h4 class="wish-item-name">${item.name}</h4>
                <div class="wish-item-footer">
                    <span class="wish-item-price">${(item.pts||0).toLocaleString()} pts</span>
                    <span class="wish-item-swapper">${item.swapper?'@'+item.swapper:''}</span>
                </div>
                <p class="wish-saved-date">Saved ${timeAgo(item.saved_at)}</p>
            </div>
        </div>`).join('')
}

// ── REMOVE ONE ──
window.removeItem = async function(wishlistId) {
    const { error } = await supabase.from('wishlist').delete().eq('id', wishlistId).eq('user_id', currentUser.id)
    if (error) { console.error(error); showToast('Could not remove item.'); return }
    wishlist = wishlist.filter(w => w.wishlist_id !== wishlistId)
    syncLocalStorage(); updateNavBadge(); render()
    showToast('Removed from wishlist.')
}

// ── CLEAR ALL ──
window.clearAll = async function() {
    if (!confirm('Remove all items from your wishlist?')) return
    const { error } = await supabase.from('wishlist').delete().eq('user_id', currentUser.id)
    if (error) { console.error(error); showToast('Could not clear wishlist.'); return }
    wishlist = []; syncLocalStorage(); updateNavBadge(); render()
    showToast('Wishlist cleared.')
}

window.setFilter = function(btn, filter) {
    document.querySelectorAll('.filter-tab').forEach(b=>b.classList.remove('active'))
    btn.classList.add('active'); activeFilter=filter; render()
}
window.goToItem = function(id) { location.href=`../personal/item-detail.html?id=${id}` }

function syncLocalStorage() {
    localStorage.setItem('suot_wishlist', JSON.stringify(
        wishlist.map(w=>({id:w.item_id,name:w.name,category:w.category,pts:w.pts,image:w.image,condition:w.condition,size:w.size,brand:w.brand,savedAt:w.saved_at}))
    ))
}

function updateNavBadge() {
    const b = document.getElementById('wishlistNavCount')
    if (!b) return
    if (wishlist.length > 0) { b.textContent=wishlist.length; b.style.display='flex' }
    else b.style.display='none'
}

function timeAgo(iso) {
    if (!iso) return 'recently'
    const d=Date.now()-new Date(iso).getTime(), m=Math.floor(d/60000), h=Math.floor(d/3600000), dy=Math.floor(d/86400000)
    if(m<1)return'just now'; if(m<60)return`${m}m ago`; if(h<24)return`${h}h ago`; if(dy<7)return`${dy}d ago`
    return new Date(iso).toLocaleDateString('en-PH',{month:'short',day:'numeric'})
}

function showToast(msg) {
    const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show')
    setTimeout(()=>t.classList.remove('show'),3000)
}

window.logout = async function() { await supabase.auth.signOut(); location.href='../auth/login.html' }

boot()

// Message badge notification
async function updateMsgBadge() {
    const {data:{session}} = await supabase.auth.getSession()
    if (!session) return
    const {data:msgs} = await supabase.from('messages')
        .select('from_user_id,to_user_id,read')
        .eq('to_user_id',session.user.id)
        .eq('read',false)
    const msgBadge = document.getElementById('messageNavBadge')
    if (msgBadge && msgs) {
        const uniqueUsers = new Set(msgs.map(m=>m.from_user_id))
        if (uniqueUsers.size > 0) { msgBadge.textContent=uniqueUsers.size; msgBadge.style.display='flex' }
        else { msgBadge.style.display='none' }
    }
}
updateMsgBadge()
setInterval(updateMsgBadge, 5000)
