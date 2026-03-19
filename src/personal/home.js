import {
    supabase,
    fetchStories, recordStoryView,
    fetchFeedPosts, createPostV2, deletePost,
    togglePostLike, fetchPostLikedByMe,
    togglePostSave, fetchPostSavedByMe,
    fetchPostComments, addPostComment, addPostReply,
    togglePostCommentLike, fetchPostCommentLikes,
    fetchPostReactions, togglePostReaction,
    fetchCampaigns,
    fetchSuggestedPeople, fetchTrendingItems,
    createNotification
} from '../db/supabase.js'

const STORY_DUR    = 5000
const STORY_EXPIRY = 24 * 60 * 60 * 1000
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800'

let currentUser       = null
let myProfile         = null
let composeFiles      = []
let composeLinkedItem = null
let feedPage          = 0
let feedDone          = false
let activeHashtag     = 'all'
let stories           = []
let curStory          = 0
let storyTimer        = null

const REACTIONS = { heart:'❤️', fire:'🔥', love:'😍', green_heart:'💚' }

// ── NEW: Hero greeting + seasonal spotlight ──
function initHero(name) {
    const hour = new Date().getHours()
    let emoji = '🌙', label = 'Good evening'
    if (hour >= 5  && hour < 12) { emoji = '☀️';  label = 'Good morning' }
    else if (hour >= 12 && hour < 17) { emoji = '🌤️'; label = 'Good afternoon' }
    else if (hour >= 17 && hour < 21) { emoji = '🌆'; label = 'Good evening' }
    document.getElementById('heroEmoji').textContent     = emoji
    document.getElementById('heroTimeLabel').textContent = label
    document.getElementById('heroName').textContent      = name

    const month = new Date().getMonth() + 1
    const card  = document.getElementById('seasonalCard')
    let season
    if (month >= 3 && month <= 5)
        season = { cls:'summer', icon:'☀️',  label:'Summer Spotlight',   title:'Hot Season, Cool Swaps!',  sub:'Beat the heat — swap your light, breezy fits and find your next summer look.' }
    else if (month >= 6 && month <= 9)
        season = { cls:'rainy',  icon:'🌧️', label:'Rainy Season Picks',  title:'Swap for the Storm!',      sub:'Layer up and stay stylish — find cozy knits, hoodies, and rain-ready looks.' }
    else if (month >= 10 && month <= 12)
        season = { cls:'ber',    icon:'🎄',  label:'-Ber Season Vibes',   title:"'Ber Season Style Swap!",  sub:"Share your holiday fits and find festive new pieces in the community." }
    else
        season = { cls:'holiday',icon:'🌸',  label:'New Year Fresh Looks', title:'New Year, New Wardrobe!', sub:'Start fresh — swap out the old and discover new styles from your community.' }
    card.className = 'seasonal-card ' + season.cls
    document.getElementById('seasonalIcon').textContent  = season.icon
    document.getElementById('seasonalLabel').textContent = season.label
    document.getElementById('seasonalTitle').textContent = season.title
    document.getElementById('seasonalSub').textContent   = season.sub
}

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
async function boot() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '../auth/login.html'; return }
    currentUser = session.user

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single()
    myProfile = profile || { id: currentUser.id, display_name: currentUser.email?.split('@')[0] }

    const name = myProfile.display_name || myProfile.username || 'You'
    const av   = myProfile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7&size=100`
    document.getElementById('profileName').textContent   = name
    document.getElementById('userAvatar').src            = av
    document.getElementById('composeAvatar').src         = av
    document.getElementById('currentPoints').textContent = (myProfile.pts || 0).toLocaleString()
    document.getElementById('fpPtsValue').textContent    = (myProfile.pts || 0).toLocaleString()

    initHero(name)

    await loadStories()
    await loadFeed(true)
    await loadFriendsPanel()
    loadDiscoverPanel()
    initPresence()
}

// ══════════════════════════════════════════
//  PANEL TAB
// ══════════════════════════════════════════
window.switchPanelTab = function(tab) {
    document.getElementById('tabFriends').classList.toggle('active', tab === 'friends')
    document.getElementById('tabDiscover').classList.toggle('active', tab === 'discover')
    document.getElementById('panelFriends').style.display  = tab === 'friends'  ? '' : 'none'
    document.getElementById('panelDiscover').style.display = tab === 'discover' ? '' : 'none'
}

// ══════════════════════════════════════════
//  DISCOVER PANEL
// ══════════════════════════════════════════
async function loadDiscoverPanel() {
    const [suggested, trending] = await Promise.all([
        fetchSuggestedPeople(currentUser.id),
        fetchTrendingItems()
    ])
    const sl = document.getElementById('suggestedList')
    if (!suggested.length) {
        sl.innerHTML = '<div style="font-size:12px;color:#ccc;padding:8px 0;">No suggestions yet.</div>'
    } else {
        sl.innerHTML = suggested.map(p => {
            const name = p.display_name || p.username || 'User'
            const av   = p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7&size=80`
            const pl   = p.username ? `../profile/profile.html?user=${encodeURIComponent(p.username)}` : `../profile/profile.html?userId=${p.id}`
            return `<div class="fp-suggest-row">
                <div class="fp-av-wrap" style="cursor:pointer;" onclick="location.href='${pl}'"><img class="fp-av" src="${av}" alt="${esc(name)}"/></div>
                <div class="fp-suggest-info" style="cursor:pointer;" onclick="location.href='${pl}'">
                    <div class="fp-suggest-name">${esc(name)}</div>
                    <div class="fp-suggest-sub">${p.followers_count || 0} followers</div>
                </div>
                <button class="fp-follow-btn" data-uid="${p.id}" onclick="handleSuggestFollow(this,'${p.id}')">Follow</button>
            </div>`
        }).join('')
    }
    const tg = document.getElementById('trendingGrid')
    if (!trending.length) {
        tg.innerHTML = '<div style="font-size:12px;color:#ccc;grid-column:1/-1;">No items yet.</div>'
    } else {
        tg.innerHTML = trending.map(item => {
            const img = (item.images && item.images[0]) || FALLBACK_IMG
            return `<div class="fp-trending-card" onclick="location.href='../personal/item-detail.html?id=${item.id}'">
                <img class="fp-trending-img" src="${img}" alt="${esc(item.name)}" loading="lazy"/>
                <div class="fp-trending-info">
                    <div class="fp-trending-name">${esc(item.name)}</div>
                    <div class="fp-trending-pts">${(item.pts||0).toLocaleString()} pts</div>
                </div>
            </div>`
        }).join('')
    }
}

window.handleSuggestFollow = async function(btn, userId) {
    btn.disabled = true; btn.textContent = '…'
    try {
        await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: userId })
        btn.textContent = 'Following'; btn.classList.add('following')
        const { data: t } = await supabase.from('profiles').select('followers_count').eq('id', userId).single()
        if (t) await supabase.from('profiles').update({ followers_count: (t.followers_count||0)+1 }).eq('id', userId)
        const { data: m } = await supabase.from('profiles').select('following_count').eq('id', currentUser.id).single()
        if (m) await supabase.from('profiles').update({ following_count: (m.following_count||0)+1 }).eq('id', currentUser.id)
        const sn = myProfile.display_name || myProfile.username || 'Someone'
        createNotification({ userId, type:'follow', message:`<strong>${sn}</strong> started following you`, link:`../profile/profile.html?userId=${currentUser.id}` }).catch(()=>{})
        showToast('Now following!')
    } catch(e) { btn.textContent = 'Follow'; showToast('Could not follow.') }
    btn.disabled = false
}

// ══════════════════════════════════════════
//  HASHTAG FILTER
// ══════════════════════════════════════════
window.filterByHashtag = function(btn) {
    document.querySelectorAll('.hf-chip').forEach(c => c.classList.remove('active'))
    btn.classList.add('active')
    activeHashtag = btn.dataset.tag
    document.querySelectorAll('.post-card:not(.campaign)').forEach(card => {
        if (activeHashtag === 'all') { card.style.display = ''; return }
        const tags = JSON.parse(card.dataset.hashtags || '[]')
        card.style.display = tags.includes(activeHashtag) ? '' : 'none'
    })
}

// ══════════════════════════════════════════
//  ITEM PICKER
// ══════════════════════════════════════════
window.openItemPicker = async function() {
    document.getElementById('itemPickerOverlay').classList.add('open')
    const list = document.getElementById('ipList')
    list.innerHTML = '<div class="ip-empty">Loading…</div>'
    const { data: items } = await supabase.from('items')
        .select('id,name,pts,images,category')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false }).limit(30)
    if (!items?.length) { list.innerHTML = '<div class="ip-empty">You have no listed items.</div>'; return }
    list.innerHTML = items.map(item => {
        const img = (item.images && item.images[0]) || ''
        return `<div class="ip-item" onclick="selectLinkedItem('${item.id}','${esc(item.name)}',${item.pts||0},'${img}')">
            <img class="ip-img" src="${img || FALLBACK_IMG}" alt="${esc(item.name)}"/>
            <div class="ip-info">
                <div class="ip-name">${esc(item.name)}</div>
                <div class="ip-meta">${(item.pts||0).toLocaleString()} pts · ${item.category||''}</div>
            </div>
        </div>`
    }).join('')
}
window.closeItemPicker  = function() { document.getElementById('itemPickerOverlay').classList.remove('open') }
window.selectLinkedItem = function(id, name, pts, img) {
    composeLinkedItem = { id, name, pts, img }
    document.getElementById('cipName').textContent = name
    document.getElementById('cipPts').textContent  = pts.toLocaleString() + ' pts'
    document.getElementById('cipImg').src = img || FALLBACK_IMG
    document.getElementById('composeItemPreview').style.display = 'flex'
    closeItemPicker(); onComposeInput()
}
window.removeLinkedItem = function() {
    composeLinkedItem = null
    document.getElementById('composeItemPreview').style.display = 'none'
    onComposeInput()
}

// ══════════════════════════════════════════
//  REACTIONS
// ══════════════════════════════════════════
window.toggleReactionPicker = function(btn) {
    const postId = btn.dataset.postId
    document.querySelectorAll('.reactions-picker.open').forEach(p => { if (p.id !== `rp-${postId}`) p.classList.remove('open') })
    document.getElementById(`rp-${postId}`)?.classList.toggle('open')
}

window.handleReaction = async function(postId, type) {
    document.getElementById(`rp-${postId}`)?.classList.remove('open')
    const reactBtn = document.querySelector(`.pa-react[data-post-id="${postId}"]`)
    if (!reactBtn) return
    try {
        const { reactionType } = await togglePostReaction(postId, type)
        reactBtn.dataset.myReaction = reactionType || ''
        const emojiSpan = reactBtn.querySelector('.react-emoji')
        if (emojiSpan) emojiSpan.textContent = reactionType ? REACTIONS[reactionType] : '🤍'
        const { data: rcounts } = await supabase.from('post_reactions').select('reaction_type').eq('post_id', postId)
        const total = (rcounts||[]).length
        const countSpan = reactBtn.querySelector('.react-count')
        if (countSpan) countSpan.textContent = total > 0 ? total : ''
        if (reactionType) {
            const card = reactBtn.closest('.post-card')
            const authorId = card?.dataset.authorId
            if (authorId && authorId !== currentUser.id) {
                const sn = myProfile.display_name || myProfile.username || 'Someone'
                createNotification({ userId: authorId, type:'like', message:`<strong>${sn}</strong> reacted ${REACTIONS[reactionType]} to your post` }).catch(()=>{})
            }
        }
    } catch(e) { console.error('handleReaction:', e) }
}

document.addEventListener('click', e => {
    if (!e.target.closest('.post-reactions-wrap')) {
        document.querySelectorAll('.reactions-picker.open').forEach(p => p.classList.remove('open'))
    }
})

// ══════════════════════════════════════════
//  FRIENDS PANEL
// ══════════════════════════════════════════
let onlineIds = new Set()

async function loadFriendsPanel() {
    const { data: rows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUser.id)
    const ids = (rows || []).map(r => r.following_id)
    document.getElementById('fpOfflineList').innerHTML = ''
    if (!ids.length) { document.getElementById('fpEmpty').style.display = 'flex'; return }
    const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids)
    window.__fpProfiles = profiles || []
    renderFriendsPanel()
}

function renderFriendsPanel() {
    const profiles = window.__fpProfiles || []
    if (!profiles.length) { document.getElementById('fpEmpty').style.display = 'flex'; return }
    const online  = profiles.filter(p => onlineIds.has(p.id))
    const offline = profiles.filter(p => !onlineIds.has(p.id))
    const countEl = document.getElementById('fpOnlineCount')
    if (online.length > 0) { countEl.textContent = `${online.length} online`; countEl.style.display = 'inline' }
    else countEl.style.display = 'none'
    const onlineLabel = document.getElementById('fpOnlineLabel')
    const onlineList  = document.getElementById('fpOnlineList')
    if (online.length) { onlineLabel.style.display = 'flex'; onlineList.innerHTML = online.map(p => fpRowHtml(p, true)).join('') }
    else { onlineLabel.style.display = 'none'; onlineList.innerHTML = '' }
    const offlineLabel = document.getElementById('fpOfflineLabel')
    const offlineList  = document.getElementById('fpOfflineList')
    if (offline.length) { offlineLabel.style.display = 'flex'; offlineList.innerHTML = offline.map(p => fpRowHtml(p, false)).join('') }
    else { offlineLabel.style.display = 'none'; offlineList.innerHTML = '' }
    document.getElementById('fpEmpty').style.display = 'none'
}

function fpRowHtml(p, isOnline) {
    const name = p.display_name || p.username || 'User'
    const av   = p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7&size=80`
    const profileLink = p.username ? `../profile/profile.html?user=${encodeURIComponent(p.username)}` : `../profile/profile.html?userId=${p.id}`
    const msgLink = `../personal/message.html?with=${p.id}`
    return `<div class="fp-row" onclick="location.href='${profileLink}'">
        <div class="fp-av-wrap"><img class="fp-av" src="${av}" alt="${esc(name)}"/><span class="fp-status-dot ${isOnline ? 'online' : 'offline'}"></span></div>
        <div class="fp-info">
            <div class="fp-name">${esc(name)}</div>
            <div class="fp-status-txt ${isOnline ? 'online' : ''}">${isOnline ? 'Active now' : '@' + (p.username || '')}</div>
        </div>
        <button class="fp-msg-btn" onclick="event.stopPropagation();location.href='${msgLink}'" title="Message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </button>
    </div>`
}

// ══════════════════════════════════════════
//  PRESENCE
// ══════════════════════════════════════════
function initPresence() {
    const channel = supabase.channel('suot-presence', { config: { presence: { key: currentUser.id } } })
    channel
        .on('presence', { event: 'sync' }, () => { onlineIds = new Set(Object.keys(channel.presenceState())); renderFriendsPanel() })
        .on('presence', { event: 'join' }, ({ key }) => { onlineIds.add(key); renderFriendsPanel() })
        .on('presence', { event: 'leave' }, ({ key }) => { onlineIds.delete(key); renderFriendsPanel() })
        .subscribe(async status => { if (status === 'SUBSCRIBED') await channel.track({ user_id: currentUser.id, online_at: new Date().toISOString() }) })
}

// ══════════════════════════════════════════
//  STORIES
// ══════════════════════════════════════════
async function loadStories() {
    const row = document.getElementById('homeStories')
    const cutoff = new Date(Date.now() - STORY_EXPIRY).toISOString()
    const { data: ownStories } = await supabase.from('stories').select('*')
        .eq('user_id', currentUser.id).gt('created_at', cutoff).order('created_at', { ascending: false })
    const { data: followRows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUser.id)
    const followIds = (followRows || []).map(r => r.following_id)
    let followStories = []
    if (followIds.length) {
        const { data: fs } = await supabase.from('stories')
            .select('*, profiles(id, username, display_name, avatar_url)')
            .in('user_id', followIds).gt('created_at', cutoff).order('created_at', { ascending: false })
        followStories = fs || []
    }
    stories = []
    if ((ownStories || []).length > 0) {
        ownStories.forEach(s => stories.push({ img: s.image_url, label: s.label || '', ts: new Date(s.created_at).getTime(), id: s.id, owner: { id: currentUser.id, name: myProfile.display_name || myProfile.username || 'You', av: myProfile.avatar_url || '' } }))
    }
    followStories.forEach(s => {
        const p = s.profiles || {}
        stories.push({ img: s.image_url, label: s.label || '', ts: new Date(s.created_at).getTime(), id: s.id, owner: { id: p.id, name: p.display_name || p.username || 'User', av: p.avatar_url || '' } })
    })
    const seen = new Set(), grouped = []
    stories.forEach(s => { if (!seen.has(s.owner.id)) { seen.add(s.owner.id); grouped.push({ owner: s.owner, firstIdx: stories.indexOf(s) }) } })
    row.innerHTML = ''
    const addItem = document.createElement('div')
    addItem.className = 'hs-item'
    addItem.innerHTML = `<div class="hs-ring add"><div class="hs-add-icon">+</div></div><span class="hs-name">Your Story</span>`
    addItem.onclick = () => location.href = '../profile/profile.html'
    row.appendChild(addItem)
    grouped.forEach(g => {
        const av = g.owner.av || `https://ui-avatars.com/api/?name=${encodeURIComponent(g.owner.name)}&background=EBE0E3&color=C994A7&size=100`
        const el = document.createElement('div')
        el.className = 'hs-item'
        el.innerHTML = `<div class="hs-ring"><img class="hs-avatar" src="${av}" alt="${g.owner.name}"/></div><span class="hs-name">${esc(g.owner.name)}</span>`
        el.onclick = () => openStoryViewer(g.firstIdx)
        row.appendChild(el)
    })
}

function openStoryViewer(i) { curStory = i; document.getElementById('storyViewer').style.display = 'flex'; document.body.style.overflow = 'hidden'; showStory(i) }
window.closeStoryViewer = function() { clearInterval(storyTimer); document.getElementById('storyViewer').style.display = 'none'; document.body.style.overflow = '' }
function showStory(i) {
    clearInterval(storyTimer)
    const s = stories[i]; if (!s) { closeStoryViewer(); return }
    const av = s.owner.av || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.owner.name)}&background=EBE0E3&color=C994A7&size=100`
    document.getElementById('storyViewerImg').src       = s.img
    document.getElementById('viewerAvatar').src         = av
    document.getElementById('viewerUsername').innerText = s.owner.name
    document.getElementById('viewerLabel').innerText    = s.label
    if (s.id && s.owner.id !== currentUser.id) recordStoryView(s.id).catch(() => {})
    const w = document.getElementById('storyProgressBars'); w.innerHTML = ''
    stories.forEach((_, j) => { const b = document.createElement('div'); b.className = 'sp-bar'; const f = document.createElement('div'); f.className = 'sp-fill'; if (j < i) f.style.width = '100%'; b.appendChild(f); w.appendChild(b) })
    const fill = document.querySelectorAll('.sp-fill')[i]; if (!fill) return
    let elapsed = 0; fill.style.width = '0%'
    storyTimer = setInterval(() => { elapsed += 50; fill.style.width = Math.min((elapsed / STORY_DUR) * 100, 100) + '%'; if (elapsed >= STORY_DUR) nextStory() }, 50)
}
window.nextStory = () => curStory < stories.length - 1 ? showStory(++curStory) : closeStoryViewer()
window.prevStory = () => curStory > 0 ? showStory(--curStory) : null
window.sendStoryReply = function(e) {
    e.stopPropagation()
    const input = document.getElementById('storyReplyInput'), text = input.value.trim(); if (!text) return
    const s = stories[curStory]; if (!s) return
    supabase.from('messages').insert({ from_user_id: currentUser.id, to_user_id: s.owner.id, body: `Replied to your story "${s.label || 'story'}": ${text}` }).then(() => { input.value = ''; showToast('Reply sent!') })
}
document.getElementById('storyViewer').addEventListener('click', e => { if (e.target === document.getElementById('storyViewer')) closeStoryViewer() })

// ══════════════════════════════════════════
//  COMPOSE
// ══════════════════════════════════════════
window.onComposeInput = function() {
    const val = document.getElementById('composeInput').value.trim()
    const btn = document.getElementById('composeSubmit')
    const ready = val.length > 0 || composeFiles.length > 0 || !!composeLinkedItem
    btn.classList.toggle('ready', ready)
    btn.disabled = !ready
}
window.onComposeImages = function(input) {
    const files = Array.from(input.files).slice(0, 10)
    composeFiles = [...composeFiles, ...files].slice(0, 10)
    renderComposePreviews(); onComposeInput()
    input.value = ''
}
function renderComposePreviews() {
    const wrap = document.getElementById('composePreviews'); wrap.innerHTML = ''
    composeFiles.forEach((f, i) => {
        const url = URL.createObjectURL(f)
        wrap.innerHTML += `<div class="compose-preview-wrap"><img class="compose-preview-img" src="${url}" alt=""><button class="compose-preview-rm" onclick="removeComposeImg(${i})">×</button></div>`
    })
}
window.removeComposeImg = function(i) { composeFiles.splice(i, 1); renderComposePreviews(); onComposeInput() }

window.submitPost = async function() {
    const caption = document.getElementById('composeInput').value.trim()
    if (!caption && composeFiles.length === 0 && !composeLinkedItem) return
    const btn = document.getElementById('composeSubmit')
    btn.disabled = true; btn.textContent = 'Posting…'
    try {
        const saved = await createPostV2({
            caption,
            imageFiles:   composeFiles,
            linkedItemId: composeLinkedItem?.id || null
        })
        if (composeFiles.length > 0 && (!saved.images || !saved.images.length)) {
            console.warn('⚠️ Images were attached but did not save. Make sure a storage bucket named "post-images" exists and is set to Public.')
            showToast('Post saved, but images failed — check console for details.')
        }
        document.getElementById('composeInput').value = ''
        composeFiles = []
        renderComposePreviews()
        removeLinkedItem()
        btn.classList.remove('ready')
        const likedSet = new Set(), savedSet = new Set()
        const card = buildPostCard(saved, likedSet, savedSet, {})
        const container = document.getElementById('feedContainer')
        container.insertBefore(card, container.firstChild)
        document.getElementById('feedEmpty').style.display = 'none'
        if (!composeFiles.length || (saved.images && saved.images.length)) {
            showToast('Posted! ✦')
        }
        notifyFollowers(saved).catch(() => {})
    } catch(e) {
        console.error('submitPost failed:', e)
        showToast('Could not post. Try again.')
    }
    btn.textContent = 'Post'
    onComposeInput()
}

async function notifyFollowers(post) {
    const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', currentUser.id)
    const senderName = myProfile.display_name || myProfile.username || 'Someone'
    for (const row of (followers || [])) {
        createNotification({ userId: row.follower_id, type: 'friend', message: `<strong>${senderName}</strong> posted something new`, link: '../personal/home.html' }).catch(() => {})
    }
}

// ══════════════════════════════════════════
//  FEED
// ══════════════════════════════════════════
async function loadFeed(initial = false) {
    if (initial) { feedPage = 0; feedDone = false; document.getElementById('loadMoreBtn').style.display = 'none' }
    if (feedDone) return
    const [posts, campaigns] = await Promise.all([
        fetchFeedPosts({ userId: currentUser.id, page: feedPage }),
        initial ? fetchCampaigns() : Promise.resolve([])
    ])
    if (initial) { document.getElementById('skel1')?.remove(); document.getElementById('skel2')?.remove() }
    if (posts.length < 20) feedDone = true
    feedPage++
    if (initial && posts.length === 0 && campaigns.length === 0) { document.getElementById('feedEmpty').style.display = 'block'; return }
    const postIds = posts.map(p => p.id)
    const [likedSet, savedSet, reactData] = await Promise.all([fetchPostLikedByMe(postIds), fetchPostSavedByMe(postIds), fetchPostReactions(postIds)])
    const container = document.getElementById('feedContainer')
    if (initial) campaigns.filter(c => c.pinned).forEach(c => container.appendChild(buildCampaignCard(c)))
    posts.forEach(post => container.appendChild(buildPostCard(post, likedSet, savedSet, reactData)))
    if (initial) campaigns.filter(c => !c.pinned).forEach(c => container.appendChild(buildCampaignCard(c)))
    document.getElementById('loadMoreBtn').style.display = feedDone ? 'none' : 'block'
}
window.loadMore = () => loadFeed(false)

// ══════════════════════════════════════════
//  BUILD POST CARD
// ══════════════════════════════════════════
function buildPostCard(post, likedSet, savedSet, reactData) {
    const prof     = post.profiles || {}
    const author   = prof.display_name || prof.username || 'Swapper'
    const av       = prof.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=EBE0E3&color=C994A7&size=100`
    const imgs     = post.images || []
    const isOwn    = post.user_id === currentUser.id
    const isLiked  = likedSet.has(post.id)
    const isSaved  = savedSet.has(post.id)
    const cmtCnt   = post.comments_count || 0
    const hashtags = post.hashtags || []
    const myReaction     = reactData?.myReactions?.[post.id] || null
    const reactionCounts = reactData?.counts?.[post.id] || {}
    const totalReactions = Object.values(reactionCounts).reduce((a,b)=>a+b,0)

    const card = document.createElement('div')
    card.className = 'post-card'
    card.dataset.postId   = post.id
    card.dataset.authorId = prof.id || post.user_id
    card.dataset.hashtags = JSON.stringify(hashtags)

    let carouselHtml = ''
    if (imgs.length === 1) {
        carouselHtml = `<div class="post-carousel"><img class="post-carousel-img" src="${imgs[0]}" alt=""/></div>`
    } else if (imgs.length > 1) {
        const dots = imgs.map((_, i) => `<span class="post-cdot${i===0?' active':''}"></span>`).join('')
        carouselHtml = `<div class="post-carousel" data-idx="0" data-imgs='${JSON.stringify(imgs)}'>
            <img class="post-carousel-img" src="${imgs[0]}" alt=""/>
            <button class="post-car-btn prev" onclick="postCarMove(this,-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <button class="post-car-btn next" onclick="postCarMove(this,1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
            <div class="post-car-dots">${dots}</div>
        </div>`
    }

    const cap = post.caption || ''
    const capEsc = esc(cap).replace(/#([a-zA-Z0-9_]+)/g, `<span style="color:#C994A7;font-weight:700;cursor:pointer;" onclick="filterByHashtag(document.querySelector('.hf-chip[data-tag=\\'$1\\']') || Object.assign(document.createElement('button'),{dataset:{tag:'$1'},classList:{remove:()=>{},add:()=>{}}}))">#$1</span>`)
    const capHtml = cap.length > 280
        ? `<span class="post-caption-text">${capEsc.slice(0, 280)}</span><span class="post-caption-more" onclick="expandCaption(this)">… more</span><span class="post-caption-rest" style="display:none">${capEsc.slice(280)}</span>`
        : capEsc

    let linkedItemHtml = ''
    if (post.linked_item_id) {
        linkedItemHtml = `<div class="post-linked-item" id="pli-${post.id}" onclick="location.href='../personal/item-detail.html?id=${post.linked_item_id}'">
            <img class="pli-img" id="pliImg-${post.id}" src="${FALLBACK_IMG}" alt=""/>
            <div class="pli-info"><div class="pli-label">Linked Item</div><div class="pli-name" id="pliName-${post.id}">Loading…</div><div class="pli-pts" id="pliPts-${post.id}"></div></div>
            <button class="pli-swap" onclick="event.stopPropagation();location.href='../personal/item-detail.html?id=${post.linked_item_id}'">Swap</button>
        </div>`
        supabase.from('items').select('name,pts,images').eq('id', post.linked_item_id).single().then(({data:item}) => {
            if (!item) return
            const imgEl  = document.getElementById(`pliImg-${post.id}`)
            const nameEl = document.getElementById(`pliName-${post.id}`)
            const ptsEl  = document.getElementById(`pliPts-${post.id}`)
            if (imgEl)  imgEl.src         = (item.images && item.images[0]) || FALLBACK_IMG
            if (nameEl) nameEl.textContent = item.name
            if (ptsEl)  ptsEl.textContent  = (item.pts||0).toLocaleString() + ' pts'
        })
    }

    const reactionSummary = totalReactions > 0
        ? Object.entries(reactionCounts).filter(([,c])=>c>0).map(([t,c])=>`${REACTIONS[t]||'❤️'} ${c}`).join('  ')
        : ''

    card.innerHTML = `
        <div class="post-header">
            <img class="post-avatar" src="${av}" alt="${author}" onclick="viewProfile('${prof.username || ''}','${prof.id || post.user_id}')">
            <div class="post-meta">
                <a class="post-author" onclick="viewProfile('${prof.username || ''}','${prof.id || post.user_id}')">${esc(author)}</a>
                <div class="post-time">${timeAgo(post.created_at)}</div>
            </div>
            ${isOwn ? `<button class="post-menu-btn" onclick="deletePostAction('${post.id}', this)" title="Delete post"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
        </div>
        ${carouselHtml}
        <div class="post-body"><p class="post-caption">${capHtml}</p></div>
        ${linkedItemHtml}
        ${reactionSummary ? `<div style="padding:0 16px 6px;font-size:12px;color:#888;">${reactionSummary}</div>` : ''}
        <div class="post-actions">
            <div class="post-reactions-wrap">
                <button class="pa-btn pa-react" data-post-id="${post.id}" data-my-reaction="${myReaction||''}" onclick="toggleReactionPicker(this)">
                    <span class="react-emoji" style="font-size:17px;line-height:1;">${myReaction ? REACTIONS[myReaction] : '🤍'}</span>
                    <span class="react-count">${totalReactions > 0 ? totalReactions : ''}</span>
                </button>
                <div class="reactions-picker" id="rp-${post.id}">
                    ${Object.entries(REACTIONS).map(([type,emoji]) => `<button class="rpick-btn" onclick="handleReaction('${post.id}','${type}')" title="${type}">${emoji}</button>`).join('')}
                </div>
            </div>
            <button class="pa-btn pa-comment" onclick="toggleCommentSection(this)" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span>${cmtCnt > 0 ? cmtCnt : ''}</span>
            </button>
            <div class="pa-spacer"></div>
            <button class="pa-btn pa-save ${isSaved ? 'saved' : ''}" data-post-id="${post.id}" onclick="handlePostSave(this)">
                <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 21 12 16 5 21 5 3 19 3"/></svg>
            </button>
        </div>
        <div class="post-comments-section" data-post-id="${post.id}">
            ${cmtCnt > 0 ? `<button class="post-comments-toggle" onclick="toggleCommentSection(this.closest('.post-comments-section').previousElementSibling.querySelector('.pa-comment'))">View ${cmtCnt} comment${cmtCnt !== 1 ? 's' : ''}</button>` : ''}
            <div class="post-comments-list" id="pcl-${post.id}"></div>
        </div>
        <div class="post-add-comment">
            <img class="pac-av" src="${myProfile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(myProfile.display_name||'U')}&background=EBE0E3&color=C994A7&size=60`}" alt="">
            <input class="pac-input" type="text" placeholder="Add a comment…"
                   oninput="this.nextElementSibling.classList.toggle('ready', this.value.trim().length>0)"
                   onkeydown="if(event.key==='Enter') submitPostComment(this, '${post.id}', '${prof.id || post.user_id}')"/>
            <button class="pac-send" onclick="submitPostComment(this.previousElementSibling, '${post.id}', '${prof.id || post.user_id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </div>`
    return card
}

// ══════════════════════════════════════════
//  CAMPAIGN CARD
// ══════════════════════════════════════════
function buildCampaignCard(c) {
    const card = document.createElement('div')
    card.className = 'post-card campaign'
    card.innerHTML = `
        <div class="post-header">
            <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#C994A7,#4A635D);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div class="post-meta">
                <div style="display:flex;align-items:center;gap:7px;"><span style="font-size:13.5px;font-weight:700;color:#1a1a1a;">Suot</span><span class="campaign-badge"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Campaign</span></div>
                <div class="post-time">${timeAgo(c.created_at)}</div>
            </div>
        </div>
        ${c.banner_url ? `<div class="post-carousel"><img class="post-carousel-img" src="${c.banner_url}" alt="${esc(c.title)}" style="max-height:260px;"/></div>` : ''}
        <div class="post-body">
            <div class="campaign-title">${esc(c.title)}</div>
            <p class="post-caption">${esc(c.body)}</p>
            ${c.cta_link ? `<a class="campaign-cta" href="${c.cta_link}" target="_blank">${esc(c.cta_label || 'Learn More')} →</a>` : ''}
        </div>`
    return card
}

// ══════════════════════════════════════════
//  POST INTERACTIONS
// ══════════════════════════════════════════
window.postCarMove = function(btn, dir) {
    const car = btn.closest('.post-carousel'), imgs = JSON.parse(car.dataset.imgs || '[]')
    let idx = (parseInt(car.dataset.idx || 0) + dir + imgs.length) % imgs.length
    car.dataset.idx = idx
    const img = car.querySelector('.post-carousel-img')
    img.style.opacity = '0'
    setTimeout(() => { img.src = imgs[idx]; img.style.opacity = '1' }, 150)
    car.querySelectorAll('.post-cdot').forEach((d, i) => d.classList.toggle('active', i === idx))
}
window.expandCaption = function(el) { el.nextElementSibling.style.display = 'inline'; el.style.display = 'none' }
window.viewProfile   = function(username, userId) { if (username) location.href = `../profile/profile.html?user=${encodeURIComponent(username)}`; else if (userId) location.href = `../profile/profile.html?userId=${userId}` }

window.deletePostAction = async function(postId, btn) {
    if (!confirm('Delete this post?')) return
    try { await deletePost(postId); btn.closest('.post-card').remove(); showToast('Post deleted.') }
    catch(e) { showToast('Could not delete post.') }
}

window.handlePostSave = async function(btn) {
    btn.disabled = true
    try {
        const nowSaved = await togglePostSave(btn.dataset.postId)
        btn.classList.toggle('saved', nowSaved)
        btn.querySelector('svg').setAttribute('fill', nowSaved ? 'currentColor' : 'none')
        showToast(nowSaved ? '★ Post saved!' : 'Removed from saved.')
    } catch(e) { console.error('handlePostSave:', e) }
    btn.disabled = false
}

// ══════════════════════════════════════════
//  COMMENTS
// ══════════════════════════════════════════
window.toggleCommentSection = async function(btn) {
    const postId = btn.dataset.postId, list = document.getElementById(`pcl-${postId}`)
    if (!list) return
    if (!list.classList.contains('open') && !list.dataset.loaded) {
        list.innerHTML = `<div style="padding:8px 0;display:flex;justify-content:center;"><div class="loading-spin" style="width:16px;height:16px;border:2px solid #f0dfe5;border-top-color:#C994A7;"></div></div>`
        list.classList.add('open')
        const [cmts, likesData] = await Promise.all([fetchPostComments(postId), fetchPostCommentLikes(postId)])
        list.dataset.loaded = '1'
        renderPostCommentList(list, cmts, likesData)
    } else {
        list.classList.toggle('open')
    }
}

function renderPostCommentList(list, allCmts, likesData) {
    list.innerHTML = ''
    if (!allCmts.length) { list.innerHTML = '<div style="font-size:12px;color:#ccc;padding:8px 0;">No comments yet.</div>'; return }
    const topLevel  = allCmts.filter(c => !c.parent_comment_id)
    const repliesMap = {}
    allCmts.filter(c => c.parent_comment_id).forEach(r => { if (!repliesMap[r.parent_comment_id]) repliesMap[r.parent_comment_id] = []; repliesMap[r.parent_comment_id].push(r) })
    topLevel.forEach(c => {
        const prof = c.profiles || {}, name = prof.display_name || prof.username || 'Swapper'
        const av   = prof.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7&size=60`
        const liked = likesData.likedByMe.has(c.id), lcount = likesData.counts[c.id] || 0
        const row = document.createElement('div'); row.className = 'pc-row'; row.dataset.cmtId = c.id; row.dataset.authorId = prof.id || ''
        row.innerHTML = `<div class="pc-av"><img src="${av}" alt=""/></div>
            <div class="pc-body"><strong>${esc(name)}</strong>${esc(c.text)}<span class="pc-time">${timeAgo(c.created_at)}</span>
                <div class="pc-actions">
                    <button class="pc-like-btn ${liked ? 'liked' : ''}" onclick="handlePcLike('${c.id}', this)"><svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${lcount > 0 ? lcount : ''}</button>
                    <button class="pc-reply-btn" onclick="openPcReplyForm('${c.id}', '')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Reply</button>
                </div>
                <div class="pc-reply-form" id="pcrf-${c.id}"><input class="pc-reply-input" type="text" placeholder="Reply…" oninput="this.nextElementSibling.classList.toggle('ready', this.value.trim().length>0)" onkeydown="if(event.key==='Enter') submitPcReply('${c.id}', this)"/><button class="pc-reply-post" onclick="submitPcReply('${c.id}', this.previousElementSibling)">Post</button></div>
                ${buildRepliesHtml(repliesMap[c.id] || [], c.id, likesData)}
            </div>`
        list.appendChild(row)
    })
}

function buildRepliesHtml(replies, rootId, likesData) {
    if (!replies.length) return `<div class="pc-replies" id="pcreplies-${rootId}"></div>`
    const inner = replies.map(r => {
        const rp = r.profiles || {}, rName = rp.display_name || rp.username || 'Swapper'
        const rAv = rp.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(rName)}&background=EBE0E3&color=C994A7&size=40`
        const rl = likesData.likedByMe.has(r.id), rc = likesData.counts[r.id] || 0
        return `<div class="pc-reply-row" data-reply-id="${r.id}" data-author-id="${rp.id || ''}">
            <div class="pc-reply-av"><img src="${rAv}" alt=""/></div>
            <div class="pc-reply-body"><strong>${esc(rName)}</strong> ${esc(r.text)}<span class="pc-reply-time">${timeAgo(r.created_at)}</span>
                <div class="pc-actions">
                    <button class="pc-like-btn ${rl ? 'liked' : ''}" onclick="handlePcLike('${r.id}', this)"><svg viewBox="0 0 24 24" fill="${rl ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${rc > 0 ? rc : ''}</button>
                    <button class="pc-reply-btn" onclick="openPcReplyForm('${rootId}', '${esc(rName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Reply</button>
                </div>
            </div>
        </div>`
    }).join('')
    return `<div class="pc-replies" id="pcreplies-${rootId}">${inner}</div>`
}

window.openPcReplyForm = function(rootId, mention) {
    document.querySelectorAll('.pc-reply-form.open').forEach(f => f.classList.remove('open'))
    const form = document.getElementById(`pcrf-${rootId}`); if (!form) return
    form.classList.add('open')
    const input = form.querySelector('.pc-reply-input')
    if (input) { input.value = mention ? `@${mention} ` : ''; input.nextElementSibling.classList.toggle('ready', !!mention); input.focus(); input.setSelectionRange(input.value.length, input.value.length) }
}

window.submitPostComment = async function(inputEl, postId, authorId) {
    const text = inputEl.value.trim(); if (!text) return
    inputEl.disabled = true
    try {
        const saved = await addPostComment({ postId, text })
        inputEl.value = ''
        inputEl.nextElementSibling.classList.remove('ready')
        const list = document.getElementById(`pcl-${postId}`)
        if (list) {
            list.classList.add('open')
            if (!list.dataset.loaded) { list.dataset.loaded = '1'; list.innerHTML = '' }
            const prof = saved.profiles || {}, name = prof.display_name || prof.username || myProfile.display_name || 'You'
            const av   = prof.avatar_url || myProfile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7&size=60`
            const dummy = document.createElement('div')
            dummy.innerHTML = `<div class="pc-row" data-cmt-id="${saved.id}" data-author-id="${saved.user_id}">
                <div class="pc-av"><img src="${av}" alt=""/></div>
                <div class="pc-body"><strong>${esc(name)}</strong>${esc(saved.text)}<span class="pc-time">just now</span>
                    <div class="pc-actions">
                        <button class="pc-like-btn" onclick="handlePcLike('${saved.id}', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
                        <button class="pc-reply-btn" onclick="openPcReplyForm('${saved.id}', '')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Reply</button>
                    </div>
                    <div class="pc-reply-form" id="pcrf-${saved.id}"><input class="pc-reply-input" type="text" placeholder="Reply…" oninput="this.nextElementSibling.classList.toggle('ready', this.value.trim().length>0)" onkeydown="if(event.key==='Enter') submitPcReply('${saved.id}', this)"/><button class="pc-reply-post" onclick="submitPcReply('${saved.id}', this.previousElementSibling)">Post</button></div>
                    <div class="pc-replies" id="pcreplies-${saved.id}"></div>
                </div>
            </div>`
            list.appendChild(dummy.firstElementChild)
            list.scrollTop = list.scrollHeight
        }
        if (authorId && authorId !== currentUser.id) {
            const senderName = myProfile.display_name || myProfile.username || 'Someone'
            createNotification({ userId: authorId, type: 'comment', message: `<strong>${senderName}</strong> commented on your post` }).catch(() => {})
        }
    } catch(e) { console.error('submitPostComment:', e); showToast('Could not post comment.'); inputEl.value = text }
    inputEl.disabled = false
}

window.submitPcReply = async function(rootCommentId, inputEl) {
    const text = inputEl.value.trim(); if (!text) return
    inputEl.disabled = true
    const card = inputEl.closest('.post-card'), postId = card?.dataset.postId
    if (!postId) { inputEl.disabled = false; return }
    try {
        const saved = await addPostReply({ postId, parentCommentId: rootCommentId, text })
        const prof = saved.profiles || {}, rName = prof.display_name || prof.username || 'Swapper'
        const rAv  = prof.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(rName)}&background=EBE0E3&color=C994A7&size=40`
        let repliesWrap = document.getElementById(`pcreplies-${rootCommentId}`)
        if (!repliesWrap) { repliesWrap = document.createElement('div'); repliesWrap.className = 'pc-replies'; repliesWrap.id = `pcreplies-${rootCommentId}`; document.getElementById(`pcrf-${rootCommentId}`)?.after(repliesWrap) }
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = `<div class="pc-reply-row" data-reply-id="${saved.id}" data-author-id="${saved.user_id}">
            <div class="pc-reply-av"><img src="${rAv}" alt=""/></div>
            <div class="pc-reply-body"><strong>${esc(rName)}</strong> ${esc(saved.text)}<span class="pc-reply-time">just now</span>
                <div class="pc-actions">
                    <button class="pc-like-btn" onclick="handlePcLike('${saved.id}', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
                    <button class="pc-reply-btn" onclick="openPcReplyForm('${rootCommentId}', '${esc(rName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Reply</button>
                </div>
            </div>
        </div>`
        repliesWrap.appendChild(tempDiv.firstElementChild)
        inputEl.value = ''; inputEl.nextElementSibling?.classList.remove('ready')
        document.getElementById(`pcrf-${rootCommentId}`)?.classList.remove('open')
        const parentRow = document.querySelector(`.pc-row[data-cmt-id="${rootCommentId}"]`), parentAuth = parentRow?.dataset.authorId
        if (parentAuth && parentAuth !== currentUser.id) {
            const senderName = myProfile.display_name || myProfile.username || 'Someone'
            createNotification({ userId: parentAuth, type: 'reply', message: `<strong>${senderName}</strong> replied to your comment` }).catch(() => {})
        }
    } catch(e) { console.error('submitPcReply:', e); showToast('Could not post reply.') }
    inputEl.disabled = false
}

window.handlePcLike = async function(commentId, btn) {
    btn.disabled = true
    try {
        const nowLiked = await togglePostCommentLike(commentId)
        btn.classList.toggle('liked', nowLiked)
        btn.querySelector('svg').setAttribute('fill', nowLiked ? 'currentColor' : 'none')
        const prev = parseInt(btn.textContent.trim()) || 0
        const newCount = nowLiked ? prev + 1 : Math.max(0, prev - 1)
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${nowLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${newCount > 0 ? newCount : ''}`
        if (nowLiked) {
            const row = btn.closest('[data-author-id]'), authId = row?.dataset.authorId
            if (authId && authId !== currentUser.id) {
                const senderName = myProfile.display_name || myProfile.username || 'Someone'
                createNotification({ userId: authId, type: 'like', message: `<strong>${senderName}</strong> liked your comment` }).catch(() => {})
            }
        }
    } catch(e) { console.error('handlePcLike:', e) }
    btn.disabled = false
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function timeAgo(iso) {
    if (!iso) return ''
    const d=Date.now()-new Date(iso).getTime(), m=Math.floor(d/60000), h=Math.floor(d/3600000), dy=Math.floor(d/86400000)
    if (m < 1) return 'just now'; if (m < 60) return `${m}m`; if (h < 24) return `${h}h`; if (dy < 7) return `${dy}d`
    return new Date(iso).toLocaleDateString('en-PH',{month:'short',day:'numeric'})
}
function showToast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show'
    setTimeout(() => t.classList.remove('show'), 3200)
}
window.logout = () => { supabase.auth.signOut().then(() => location.href = '../auth/login.html') }
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeStoryViewer()
    const sv = document.getElementById('storyViewer')
    if (sv.style.display !== 'none') { if (e.key === 'ArrowRight') nextStory(); if (e.key === 'ArrowLeft') prevStory() }
})

boot()
