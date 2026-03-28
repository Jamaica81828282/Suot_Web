import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL  = 'https://ltsgzhgmpkfqlrmuwdbn.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0c2d6aGdtcGtmcWxybXV3ZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNjY4OTQsImV4cCI6MjA4NzY0Mjg5NH0.boFXXeyy6pUnEYZpxoUCR7dM8yUndozcGyn1XgeE4Es'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export async function requireAuth(loginPath = '../auth/login.html') {
  const user = await getUser()
  if (!user) window.location.href = loginPath
  return user
}

export async function signOut(loginPath = '../auth/login.html') {
  await supabase.auth.signOut()
  try {
    localStorage.removeItem('suotUserId')
    localStorage.removeItem('suotUser')
    localStorage.removeItem('suotEmail')
  } catch (e) {}
  window.location.href = loginPath
}

// FIX 1: .neq('status','swapped') silently excludes NULL rows in postgres
// Use .or() so items with no status (newly posted) still appear
export async function fetchItems(category = null) {
  let query = supabase
    .from('items')
    .select('*, profiles(id, username, display_name, avatar_url)')
    .or('status.neq.swapped,status.is.null')
    .order('created_at', { ascending: false })

  if (category && category !== 'all') {
    query = query.ilike('category', category)
  }

  const { data, error } = await query
  if (error) console.error('fetchItems:', error)
  return data || []
}

export async function fetchItem(id) {
  const { data, error } = await supabase
    .from('items')
    .select('*, profiles(id, username, display_name, avatar_url)')
    .eq('id', id)
    .single()
  if (error) console.error('fetchItem:', error)
  return data
}

// FIX 2: accept and save latitude, longitude, meetup_address
export async function postItem({
  name, category, brand, description, size, condition, pts, tags, imageFiles,
  latitude, longitude, meetup_address
}) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')

  const imageUrls = []
  for (const file of (imageFiles || [])) {
    try {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('item-images')
        .upload(path, file, { upsert: false })
      if (uploadErr) {
        console.warn('Image upload skipped (storage error):', uploadErr.message)
        continue
      }
      const { data: urlData } = supabase.storage.from('item-images').getPublicUrl(path)
      if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl)
    } catch (imgErr) {
      console.warn('Image upload exception, skipping:', imgErr)
    }
  }

  const payload = {
    user_id: user.id, name, category, brand, description,
    size, condition, pts, tags, images: imageUrls
  }
  if (latitude  != null) payload.latitude       = latitude
  if (longitude != null) payload.longitude      = longitude
  if (meetup_address)    payload.meetup_address = meetup_address

  const { data, error } = await supabase.from('items').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function fetchWishlist() {
  const user = await getUser()
  if (!user) return []
  const { data } = await supabase
    .from('wishlist')
    .select('*, items(*, profiles(username, display_name, avatar_url))')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false })
  return data || []
}

export async function toggleWishlist(itemId) {
  const user = await getUser()
  if (!user) return
  const { data: existing } = await supabase.from('wishlist').select('id')
    .eq('user_id', user.id).eq('item_id', itemId).maybeSingle()
  if (existing) {
    await supabase.from('wishlist').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('wishlist').insert({ user_id: user.id, item_id: itemId })
    return true
  }
}

export async function isWishlisted(itemId) {
  const user = await getUser()
  if (!user) return false
  const { data } = await supabase.from('wishlist').select('id')
    .eq('user_id', user.id).eq('item_id', itemId).maybeSingle()
  return !!data
}

// ── Story helpers ─────────────────────────────────────────────

export async function fetchStories(userId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('user_id', userId)
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
  if (error) console.error('fetchStories:', error)
  return data || []
}

export async function postStory({ imageUrl, label }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data, error } = await supabase.from('stories')
    .insert({ user_id: user.id, image_url: imageUrl, label }).select().single()
  if (error) throw error
  return data
}

export async function pruneExpiredStories(userId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('stories')
    .delete()
    .eq('user_id', userId)
    .lt('created_at', cutoff)
  if (error) console.warn('pruneExpiredStories:', error)
}

// ── Comment helpers ───────────────────────────────────────────

export async function fetchComments(itemId) {
  const { data, error } = await supabase
    .from('item_comments')
    .select('id, text, created_at, parent_comment_id, profiles(id, username, display_name, avatar_url)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true })
  if (error) console.error('fetchComments:', error)
  return data || []
}

export async function addComment({ itemId, text }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data, error } = await supabase
    .from('item_comments')
    .insert({ item_id: itemId, user_id: user.id, text })
    .select('id, text, created_at, parent_comment_id, profiles(id, username, display_name, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function addReply({ itemId, parentCommentId, text }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data, error } = await supabase
    .from('item_comments')
    .insert({ item_id: itemId, user_id: user.id, text, parent_comment_id: parentCommentId })
    .select('id, text, created_at, parent_comment_id, profiles(id, username, display_name, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function toggleCommentLike(commentId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data: existing } = await supabase
    .from('comment_likes').select('id')
    .eq('comment_id', commentId).eq('user_id', user.id).maybeSingle()
  if (existing) {
    await supabase.from('comment_likes').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id })
    return true
  }
}

export async function fetchCommentLikes(itemId) {
  const user = await getUser()
  const { data } = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id',
      (await supabase.from('item_comments').select('id').eq('item_id', itemId))
        .data?.map(c => c.id) || []
    )
  const counts    = {}
  const likedByMe = new Set()
  for (const row of (data || [])) {
    counts[row.comment_id] = (counts[row.comment_id] || 0) + 1
    if (user && row.user_id === user.id) likedByMe.add(row.comment_id)
  }
  return { counts, likedByMe }
}

// ── Story view helpers ────────────────────────────────────────

export async function recordStoryView(storyId) {
  const user = await getUser()
  if (!user) return
  await supabase.from('story_views')
    .upsert({ story_id: storyId, viewer_id: user.id }, { onConflict: 'story_id,viewer_id' })
}

export async function fetchStoryViewers(storyId) {
  const { data, error } = await supabase
    .from('story_views')
    .select('viewed_at, profiles!viewer_id(id, username, display_name, avatar_url)')
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false })
  if (error) console.warn('fetchStoryViewers:', error)
  return (data || []).map(r => ({ ...r.profiles, viewed_at: r.viewed_at }))
}

export async function deleteStory(storyId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { error } = await supabase.from('stories')
    .delete().eq('id', storyId).eq('user_id', user.id)
  if (error) throw error
}

// ── Notification helpers ──────────────────────────────────────

export async function createNotification({ userId, type, message, link, thumbnailUrl }) {
  const actor = await getUser()
  if (!actor || actor.id === userId) return
  const { error } = await supabase.from('notifications').insert({
    user_id:       userId,
    type,
    message,
    link:          link || null,
    thumbnail_url: thumbnailUrl || null,
    read:          false
  })
  if (error) console.warn('createNotification:', error.message)
}

export async function markAllNotificationsRead() {
  const user = await getUser()
  if (!user) return
  await supabase.from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)
}

// ── Follow helpers ────────────────────────────────────────────

export async function followUser(targetId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId })
  const { data: target } = await supabase.from('profiles').select('followers_count').eq('id', targetId).single()
  if (target) await supabase.from('profiles').update({ followers_count: (target.followers_count||0)+1 }).eq('id', targetId)
  const { data: me } = await supabase.from('profiles').select('following_count').eq('id', user.id).single()
  if (me) await supabase.from('profiles').update({ following_count: (me.following_count||0)+1 }).eq('id', user.id)
}

export async function unfollowUser(targetId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId)
  const { data: target } = await supabase.from('profiles').select('followers_count').eq('id', targetId).single()
  if (target) await supabase.from('profiles').update({ followers_count: Math.max((target.followers_count||0)-1,0) }).eq('id', targetId)
  const { data: me } = await supabase.from('profiles').select('following_count').eq('id', user.id).single()
  if (me) await supabase.from('profiles').update({ following_count: Math.max((me.following_count||0)-1,0) }).eq('id', user.id)
}

export async function isFollowing(targetId) {
  const user = await getUser()
  if (!user) return false
  const { data } = await supabase.from('follows').select('id')
    .eq('follower_id', user.id).eq('following_id', targetId).maybeSingle()
  return !!data
}

export async function fetchFollowers(userId) {
  const { data: rows } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', userId)
  if (!rows?.length) return []
  const ids = rows.map(r => r.follower_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids)
  return profiles || []
}

export async function fetchFollowing(userId) {
  const { data: rows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
  if (!rows?.length) return []
  const ids = rows.map(r => r.following_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids)
  return profiles || []
}

export async function sendMessage({ toUserId, itemId, body }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { error } = await supabase.from('messages').insert({
    from_user_id: user.id, to_user_id: toUserId, item_id: itemId || null, body
  })
  if (error) throw error
}

export async function fetchMessages() {
  const user = await getUser()
  if (!user) return []
  const { data } = await supabase
    .from('messages')
    .select('*, from_profile:profiles!from_user_id(username, display_name, avatar_url), items(name, images)')
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
  return data || []
}

// ── Top-up helpers ────────────────────────────────────────────

export async function saveTopup({ pts, amountPhp, method }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')

  const { error: txErr } = await supabase.from('topup_transactions').insert({
    user_id: user.id, pts, amount_php: amountPhp, method, status: 'completed'
  })
  if (txErr) throw txErr

  const { data: profile, error: fetchErr } = await supabase
    .from('profiles').select('pts').eq('id', user.id).single()
  if (fetchErr) throw fetchErr

  const currentPts = profile.pts || 0
  const ACTIVE_CAP = 2500

  let newActivePts  = currentPts + pts
  let overflowPts   = 0

  // If adding pts would exceed the cap, overflow the excess to the buffer
  if (newActivePts > ACTIVE_CAP) {
    overflowPts  = newActivePts - ACTIVE_CAP
    newActivePts = ACTIVE_CAP
  }

  const { error: updateErr } = await supabase
    .from('profiles').update({ pts: newActivePts }).eq('id', user.id)
  if (updateErr) throw updateErr

  // Log the topup event
  try {
    await supabase.from('wallet_events').insert({
      user_id: user.id, event_type: 'topup', amount: pts - overflowPts,
      from_wallet: 'external', to_wallet: 'active',
      note: `Top-up via ${method} — ₱${amountPhp}`
    })
  } catch (_) {}

  // If there is overflow, push it to the buffer with a 30-day expiry
  if (overflowPts > 0) {
    await addToBuffer({ userId: user.id, amount: overflowPts, note: `Overflow from top-up via ${method}` })
  }

  // Fetch final state to return accurate balances
  const { data: final } = await supabase
    .from('profiles').select('pts').eq('id', user.id).single()
  return final?.pts ?? newActivePts
}

export async function fetchTopupHistory() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('topup_transactions').select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) console.error('fetchTopupHistory:', error)
  return data || []
}

// ── Swap pts helpers ──────────────────────────────────────────

export async function refundSwapPts(swapId) {
  const { data: swap, error } = await supabase
    .from('swaps')
    .select('requester_id, owner_id, offered_pts, requested_pts, pts_reserved_requester, pts_reserved_owner')
    .eq('id', swapId).single()
  if (error || !swap) return
  const refunds = []
  if (swap.pts_reserved_requester && swap.offered_pts > 0) {
    const { data: p } = await supabase.from('profiles').select('pts').eq('id', swap.requester_id).single()
    if (p) refunds.push(supabase.from('profiles').update({ pts: (p.pts||0) + swap.offered_pts }).eq('id', swap.requester_id))
  }
  if (swap.pts_reserved_owner && swap.requested_pts > 0) {
    const { data: p } = await supabase.from('profiles').select('pts').eq('id', swap.owner_id).single()
    if (p) refunds.push(supabase.from('profiles').update({ pts: (p.pts||0) + swap.requested_pts }).eq('id', swap.owner_id))
  }
  await Promise.all(refunds)
  await supabase.from('swaps').update({ pts_reserved_requester: false, pts_reserved_owner: false }).eq('id', swapId)
}

export async function transferSwapPts(swapId) {
  const { data: swap, error } = await supabase
    .from('swaps')
    .select('requester_id, owner_id, offered_pts, requested_pts, pts_reserved_requester, pts_reserved_owner')
    .eq('id', swapId).single()
  if (error || !swap) return
  const transfers = []
  if (swap.pts_reserved_requester && swap.offered_pts > 0) {
    const { data: owner } = await supabase.from('profiles').select('pts').eq('id', swap.owner_id).single()
    if (owner) transfers.push(supabase.from('profiles').update({ pts: (owner.pts||0) + swap.offered_pts }).eq('id', swap.owner_id))
  }
  if (swap.pts_reserved_owner && swap.requested_pts > 0) {
    const { data: req } = await supabase.from('profiles').select('pts').eq('id', swap.requester_id).single()
    if (req) transfers.push(supabase.from('profiles').update({ pts: (req.pts||0) + swap.requested_pts }).eq('id', swap.requester_id))
  }
  await Promise.all(transfers)
  await supabase.from('swaps').update({ pts_reserved_requester: false, pts_reserved_owner: false }).eq('id', swapId)
}

/**
 * NEW: Call this when a user EARNS pts from a completed swap.
 * If their active wallet is already at/above the 2,500 cap,
 * the earned pts go straight to the buffer (with 30-day expiry).
 * If partially over cap, the excess overflows to buffer.
 *
 * @param {string} userId  - The user receiving the points
 * @param {number} earnedPts - How many pts they earned
 * @param {string} note - Description (e.g. 'Earned from swap #123')
 */
export async function earnPtsFromSwap(userId, earnedPts, note = 'Points earned from swap') {
  if (!userId || !earnedPts || earnedPts <= 0) return

  const ACTIVE_CAP = 2500
  const { data: profile } = await supabase
    .from('profiles').select('pts').eq('id', userId).single()

  const currentPts  = profile?.pts || 0
  let newActivePts  = currentPts + earnedPts
  let overflowPts   = 0

  if (newActivePts > ACTIVE_CAP) {
    overflowPts  = newActivePts - ACTIVE_CAP
    newActivePts = ACTIVE_CAP
  }

  // Update active wallet
  await supabase.from('profiles').update({ pts: newActivePts }).eq('id', userId)

  // Log the earn event for the active portion
  const activePortion = earnedPts - overflowPts
  if (activePortion > 0) {
    try {
      await supabase.from('wallet_events').insert({
        user_id: userId, event_type: 'earn', amount: activePortion,
        from_wallet: 'external', to_wallet: 'active', note
      })
    } catch (_) {}
  }

  // Overflow the rest to buffer (with 30-day expiry)
  if (overflowPts > 0) {
    await addToBuffer({ userId, amount: overflowPts, note: `Overflow from swap earn — ${note}` })
  }
}

// ── Home feed helpers ─────────────────────────────────────────

export async function fetchFeedPosts({ userId, page = 0, pageSize = 20 } = {}) {
  const { data: followRows } = await supabase
    .from('follows').select('following_id').eq('follower_id', userId)
  const followingIds = (followRows || []).map(r => r.following_id)
  const authorIds = [userId, ...followingIds]

  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles(id, username, display_name, avatar_url)')
    .in('user_id', authorIds)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) console.error('fetchFeedPosts:', error)
  return data || []
}

export async function createPost({ caption, imageFiles = [] }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')

  const imageUrls = []
  for (const file of imageFiles) {
    try {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `posts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('post-images').upload(path, file, { upsert: false })
      if (upErr) { console.warn('post image upload skipped:', upErr.message); continue }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      imageUrls.push(publicUrl)
    } catch (e) { console.warn('post image error:', e) }
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({ user_id: user.id, caption, images: imageUrls })
    .select('*, profiles(id, username, display_name, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function deletePost(postId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { error } = await supabase.from('posts').delete()
    .eq('id', postId).eq('user_id', user.id)
  if (error) throw error
}

export async function togglePostLike(postId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data: existing } = await supabase.from('post_likes').select('id')
    .eq('post_id', postId).eq('user_id', user.id).maybeSingle()

  if (existing) {
    await supabase.from('post_likes').delete().eq('id', existing.id)
    const { data: p } = await supabase.from('posts').select('likes_count').eq('id', postId).single()
    const newCount = Math.max(0, (p?.likes_count || 1) - 1)
    await supabase.from('posts').update({ likes_count: newCount }).eq('id', postId)
    return { liked: false, newCount }
  } else {
    await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
    const { data: p } = await supabase.from('posts').select('likes_count').eq('id', postId).single()
    const newCount = (p?.likes_count || 0) + 1
    await supabase.from('posts').update({ likes_count: newCount }).eq('id', postId)
    return { liked: true, newCount }
  }
}

export async function fetchPostLikedByMe(postIds) {
  const user = await getUser()
  if (!user || !postIds.length) return new Set()
  const { data } = await supabase.from('post_likes').select('post_id')
    .eq('user_id', user.id).in('post_id', postIds)
  return new Set((data || []).map(r => r.post_id))
}

export async function togglePostSave(postId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data: existing } = await supabase.from('post_saves').select('id')
    .eq('post_id', postId).eq('user_id', user.id).maybeSingle()
  if (existing) {
    await supabase.from('post_saves').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('post_saves').insert({ post_id: postId, user_id: user.id })
    return true
  }
}

export async function fetchPostSavedByMe(postIds) {
  const user = await getUser()
  if (!user || !postIds.length) return new Set()
  const { data } = await supabase.from('post_saves').select('post_id')
    .eq('user_id', user.id).in('post_id', postIds)
  return new Set((data || []).map(r => r.post_id))
}

export async function fetchPostComments(postId) {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, text, created_at, parent_comment_id, profiles(id, username, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) console.error('fetchPostComments:', error)
  return data || []
}

export async function addPostComment({ postId, text }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data, error } = await supabase.from('post_comments')
    .insert({ post_id: postId, user_id: user.id, text })
    .select('id, text, created_at, parent_comment_id, profiles(id, username, display_name, avatar_url)')
    .single()
  if (error) throw error
  const { data: p } = await supabase.from('posts').select('comments_count').eq('id', postId).single()
  await supabase.from('posts').update({ comments_count: (p?.comments_count || 0) + 1 }).eq('id', postId)
  return data
}

export async function addPostReply({ postId, parentCommentId, text }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data, error } = await supabase.from('post_comments')
    .insert({ post_id: postId, user_id: user.id, text, parent_comment_id: parentCommentId })
    .select('id, text, created_at, parent_comment_id, profiles(id, username, display_name, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function togglePostCommentLike(commentId) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')
  const { data: existing } = await supabase.from('post_comment_likes').select('id')
    .eq('comment_id', commentId).eq('user_id', user.id).maybeSingle()
  if (existing) {
    await supabase.from('post_comment_likes').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('post_comment_likes').insert({ comment_id: commentId, user_id: user.id })
    return true
  }
}

export async function fetchPostCommentLikes(postId) {
  const user = await getUser()
  const { data: commentRows } = await supabase
    .from('post_comments').select('id').eq('post_id', postId)
  const commentIds = (commentRows || []).map(c => c.id)
  if (!commentIds.length) return { counts: {}, likedByMe: new Set() }

  const { data } = await supabase.from('post_comment_likes')
    .select('comment_id, user_id').in('comment_id', commentIds)
  const counts = {}, likedByMe = new Set()
  for (const row of (data || [])) {
    counts[row.comment_id] = (counts[row.comment_id] || 0) + 1
    if (user && row.user_id === user.id) likedByMe.add(row.comment_id)
  }
  return { counts, likedByMe }
}

export async function fetchCampaigns() {
  const { data, error } = await supabase.from('campaigns')
    .select('*').eq('active', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) console.error('fetchCampaigns:', error)
  return data || []
}

// ── Home Feed v2 — Reactions, Hashtags, Linked Items ─────────

export async function togglePostReaction(postId, reactionType) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')

  const { data: existing } = await supabase.from('post_reactions').select('id, reaction_type')
    .eq('post_id', postId).eq('user_id', user.id).maybeSingle()

  if (existing) {
    if (existing.reaction_type === reactionType) {
      await supabase.from('post_reactions').delete().eq('id', existing.id)
      return { reactionType: null }
    } else {
      await supabase.from('post_reactions').update({ reaction_type: reactionType }).eq('id', existing.id)
      return { reactionType }
    }
  } else {
    await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction_type: reactionType })
    return { reactionType }
  }
}

export async function fetchPostReactions(postIds) {
  const user = await getUser()
  if (!postIds.length) return { counts: {}, myReactions: {} }

  const { data } = await supabase.from('post_reactions')
    .select('post_id, user_id, reaction_type').in('post_id', postIds)

  const counts = {}, myReactions = {}
  for (const row of (data || [])) {
    if (!counts[row.post_id]) counts[row.post_id] = { heart: 0, fire: 0, love: 0, green_heart: 0 }
    counts[row.post_id][row.reaction_type] = (counts[row.post_id][row.reaction_type] || 0) + 1
    if (user && row.user_id === user.id) myReactions[row.post_id] = row.reaction_type
  }
  return { counts, myReactions }
}

export async function fetchSuggestedPeople(userId) {
  const { data: myFollows } = await supabase.from('follows')
    .select('following_id').eq('follower_id', userId)
  const myFollowIds = new Set((myFollows || []).map(r => r.following_id))
  myFollowIds.add(userId)

  const { data: friendFollows } = await supabase.from('follows')
    .select('following_id').in('follower_id', [...myFollowIds])
  const candidates = [...new Set((friendFollows || []).map(r => r.following_id))]
    .filter(id => !myFollowIds.has(id)).slice(0, 10)

  if (!candidates.length) {
    const { data: recent } = await supabase.from('profiles')
      .select('id, username, display_name, avatar_url, followers_count')
      .neq('id', userId).order('followers_count', { ascending: false }).limit(8)
    return (recent || []).filter(p => !myFollowIds.has(p.id)).slice(0, 5)
  }

  const { data: profiles } = await supabase.from('profiles')
    .select('id, username, display_name, avatar_url, followers_count')
    .in('id', candidates).limit(5)
  return profiles || []
}

export async function fetchTrendingItems() {
  const { data, error } = await supabase.from('items')
    .select('id, name, pts, images, category')
    .or('status.neq.swapped,status.is.null')
    .order('created_at', { ascending: false })
    .limit(4)
  if (error) console.error('fetchTrendingItems:', error)
  return data || []
}

export async function createPostV2({ caption, imageFiles = [], linkedItemId = null }) {
  const user = await getUser()
  if (!user) throw new Error('Not logged in')

  const imageUrls = []
  for (const file of imageFiles) {
    try {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `posts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('post-images').upload(path, file, { upsert: false })
      if (upErr) { console.warn('post image upload skipped:', upErr.message); continue }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      imageUrls.push(publicUrl)
    } catch (e) { console.warn('post image error:', e) }
  }

  const hashtagMatches = caption.match(/#[\w]+/g) || []
  const hashtags = [...new Set(hashtagMatches.map(h => h.toLowerCase()))]

  const payload = {
    user_id:  user.id,
    caption,
    images:   imageUrls,
    hashtags
  }
  if (linkedItemId) payload.linked_item_id = linkedItemId

  const { data, error } = await supabase
    .from('posts')
    .insert(payload)
    .select('*, profiles(id, username, display_name, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function fetchPostsByHashtag(tag, { page = 0, pageSize = 20 } = {}) {
  const normalised = tag.toLowerCase().replace(/^#/, '')
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles(id, username, display_name, avatar_url)')
    .contains('hashtags', [`#${normalised}`])
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) console.error('fetchPostsByHashtag:', error)
  return data || []
}

export async function fetchLinkedItem(itemId) {
  if (!itemId) return null
  const { data } = await supabase.from('items')
    .select('id, name, pts, images, category, size, condition, profiles(id, username, display_name, avatar_url)')
    .eq('id', itemId).single()
  return data || null
}

// ══════════════════════════════════════════════════════════════
// ── Wallet & Circulation helpers (UPDATED) ────────────────────
// ══════════════════════════════════════════════════════════════

const BUFFER_TTL_DAYS = 30 // Buffer entries expire after 30 days
const ACTIVE_CAP      = 2500
const REFILL_TRIGGER  = 500
const REFILL_TARGET   = 2500

/**
 * Add points to the circulation buffer with a 30-day expiry.
 * Each call creates one row in `buffer_entries`.
 * Also updates the denormalized `circulation_buffer` column on `profiles`.
 *
 * Required Supabase table (run once in SQL editor):
 *
 *   create table buffer_entries (
 *     id          uuid primary key default gen_random_uuid(),
 *     user_id     uuid references profiles(id) on delete cascade not null,
 *     amount      integer not null check (amount > 0),
 *     remaining   integer not null,          -- how much hasn't been used yet
 *     expires_at  timestamptz not null,
 *     created_at  timestamptz default now()
 *   );
 *   create index on buffer_entries(user_id, expires_at);
 *
 * @param {string} userId
 * @param {number} amount
 * @param {string} [note]
 */
export async function addToBuffer({ userId, amount, note = 'Points added to buffer' }) {
  if (!userId || amount <= 0) return

  const expiresAt = new Date(Date.now() + BUFFER_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Insert the buffer entry
  const { error: insertErr } = await supabase.from('buffer_entries').insert({
    user_id:    userId,
    amount,
    remaining:  amount,
    expires_at: expiresAt
  })
  if (insertErr) console.error('addToBuffer insert:', insertErr)

  // Update the denormalized circulation_buffer on profiles (sum of active remaining)
  await syncBufferBalance(userId)

  // Log overflow event
  try {
    await supabase.from('wallet_events').insert({
      user_id: userId, event_type: 'overflow', amount,
      from_wallet: 'active', to_wallet: 'buffer',
      note
    })
  } catch (_) {}
}

/**
 * Recalculate and update the `circulation_buffer` column on profiles
 * by summing all non-expired, non-zero `remaining` entries.
 */
async function syncBufferBalance(userId) {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('buffer_entries')
    .select('remaining')
    .eq('user_id', userId)
    .gt('expires_at', now)
    .gt('remaining', 0)

  const total = (data || []).reduce((sum, r) => sum + (r.remaining || 0), 0)
  await supabase.from('profiles').update({ circulation_buffer: total }).eq('id', userId)
}

/**
 * Fetch the current user's wallet balances.
 * The buffer balance is the live sum of non-expired buffer_entries.
 * Returns { pts, circulation_buffer, bufferEntries }
 * where bufferEntries is the list of individual entries (for expiry display).
 */
export async function fetchWalletBalances() {
  const user = await getUser()
  if (!user) return { pts: 0, circulation_buffer: 0, bufferEntries: [] }

  // First, expire any overdue entries (soft-expiry: just filter them out)
  const now = new Date().toISOString()

  // Fetch active pts
  const { data: profile } = await supabase
    .from('profiles')
    .select('pts, circulation_buffer')
    .eq('id', user.id)
    .single()

  // Fetch live buffer entries (non-expired, has remaining)
  const { data: entries } = await supabase
    .from('buffer_entries')
    .select('id, amount, remaining, expires_at, created_at')
    .eq('user_id', user.id)
    .gt('expires_at', now)
    .gt('remaining', 0)
    .order('expires_at', { ascending: true }) // soonest to expire first

  const bufferEntries = entries || []
  const liveBuffer = bufferEntries.reduce((sum, e) => sum + (e.remaining || 0), 0)

  // Keep the denormalized column in sync
  if (liveBuffer !== (profile?.circulation_buffer || 0)) {
    await supabase.from('profiles').update({ circulation_buffer: liveBuffer }).eq('id', user.id)
  }

  return {
    pts:                profile?.pts || 0,
    circulation_buffer: liveBuffer,
    bufferEntries
  }
}

/**
 * Auto-refill: if active wallet is at or below REFILL_TRIGGER (500),
 * pull from buffer entries (FIFO by soonest expiry) to top up to REFILL_TARGET.
 * Called automatically after any spend operation.
 */
export async function checkAndRefill(userId) {
  const { data: profile } = await supabase
    .from('profiles').select('pts').eq('id', userId).single()
  if (!profile || profile.pts > REFILL_TRIGGER) return

  const shortage = REFILL_TARGET - profile.pts
  const now = new Date().toISOString()

  // Get buffer entries sorted by soonest-to-expire first (use these up first)
  const { data: entries } = await supabase
    .from('buffer_entries')
    .select('id, remaining')
    .eq('user_id', userId)
    .gt('expires_at', now)
    .gt('remaining', 0)
    .order('expires_at', { ascending: true })

  if (!entries?.length) return

  let leftToFill = shortage
  let totalRefilled = 0

  for (const entry of entries) {
    if (leftToFill <= 0) break
    const take = Math.min(entry.remaining, leftToFill)
    const newRemaining = entry.remaining - take

    await supabase.from('buffer_entries')
      .update({ remaining: newRemaining })
      .eq('id', entry.id)

    leftToFill   -= take
    totalRefilled += take
  }

  if (totalRefilled > 0) {
    const newPts = profile.pts + totalRefilled
    await supabase.from('profiles').update({ pts: newPts }).eq('id', userId)
    await syncBufferBalance(userId)

    // Log refill event
    try {
      await supabase.from('wallet_events').insert({
        user_id: userId, event_type: 'refill', amount: totalRefilled,
        from_wallet: 'buffer', to_wallet: 'active',
        note: `Auto-refill from buffer (active was ${profile.pts} pts)`
      })
    } catch (_) {}
  }
}

/**
 * Fetch wallet event log for the current user (newest first, limited).
 */
export async function fetchWalletEvents(limit = 30) {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('wallet_events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) console.error('fetchWalletEvents:', error)
  return data || []
}
// ══════════════════════════════════════════════════════════════
// ── BADGE HELPERS — paste at the bottom of src/db/supabase.js ──
// ══════════════════════════════════════════════════════════════

/**
 * Fetch all badge definitions (created by admin).
 */
export async function fetchBadges() {
    const { data, error } = await supabase
        .from('badges')
        .select('*')
        .order('created_at', { ascending: false })
    if (error) console.error('fetchBadges:', error)
    return data || []
}

/**
 * Fetch all badges WITH the current user's progress for each one.
 * Returns an array of:
 * {
 *   badge:    { id, name, icon, description, criteria_type, threshold },
 *   progress: number,   // how many the user has (e.g. 7 swaps)
 *   earned:   boolean,  // progress >= threshold
 *   claimed:  boolean,  // user has claimed the badge
 *   earnedAt: string|null,
 * }
 */
export async function fetchUserBadgeProgress(userId) {
    if (!userId) return []

    // 1. Get all badge definitions
    const { data: badges, error: bErr } = await supabase
        .from('badges')
        .select('*')
        .order('created_at', { ascending: false })
    if (bErr || !badges?.length) return []

    // 2. Get this user's already-earned badges
    const { data: earned } = await supabase
        .from('user_badges')
        .select('badge_id, claimed, earned_at')
        .eq('user_id', userId)
    const earnedMap = {}
    ;(earned || []).forEach(e => { earnedMap[e.badge_id] = e })

    // 3. Get raw counts for each criteria type in one go
    const [
        { count: swapsDone },
        { count: itemsPosted },
        { count: wishlisted },
    ] = await Promise.all([
        supabase.from('swaps').select('*', { count:'exact', head:true })
            .eq('status','swapped')
            .or(`requester_id.eq.${userId},owner_id.eq.${userId}`),
        supabase.from('items').select('*', { count:'exact', head:true })
            .eq('user_id', userId),
        supabase.from('wishlist').select('*', { count:'exact', head:true })
            .eq('user_id', userId),
    ])

    const { data: profile } = await supabase
        .from('profiles')
        .select('followers_count')
        .eq('id', userId)
        .single()

    const countsMap = {
        swaps_completed:  swapsDone   || 0,
        items_posted:     itemsPosted || 0,
        items_wishlisted: wishlisted  || 0,
        followers:        profile?.followers_count || 0,
    }

    // 4. Build result array
    const results = []
    for (const badge of badges) {
        const progress  = countsMap[badge.criteria_type] || 0
        const isEarned  = progress >= badge.threshold
        const earnedRow = earnedMap[badge.id]

        // Auto-insert into user_badges if earned but not yet recorded
        if (isEarned && !earnedRow) {
            await supabase.from('user_badges').upsert(
                { user_id: userId, badge_id: badge.id, claimed: false },
                { onConflict: 'user_id,badge_id' }
            )
        }

        results.push({
            badge,
            progress,
            earned:   isEarned,
            claimed:  earnedRow?.claimed || false,
            earnedAt: earnedRow?.earned_at || null,
        })
    }

    return results
}

/**
 * Claim a badge that the user has earned.
 * Returns true on success, false on failure.
 */
export async function claimBadge(badgeId) {
    const user = await getUser()
    if (!user) return false
    const { error } = await supabase
        .from('user_badges')
        .update({ claimed: true, claimed_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('badge_id', badgeId)
    if (error) { console.error('claimBadge:', error); return false }
    return true
}