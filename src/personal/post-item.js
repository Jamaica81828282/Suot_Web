import { supabase, postItem } from '../db/supabase.js'

  /* ══════════════════════════════════════════
     AUTH & SIDEBAR BOOT
     ══════════════════════════════════════════ */
  ;(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '../auth/login.html'; return }
    localStorage.setItem('suotUserId', session.user.id)

    const { data: profile } = await supabase
        .from('profiles').select('username, display_name, avatar_url, pts')
        .eq('id', session.user.id).single()

    if (profile) {
        const displayName = profile.display_name || profile.username || 'Swapper'
        document.getElementById('profileName').textContent = displayName
        document.getElementById('userAvatar').src = profile.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=EBE0E3&color=C994A7&size=100`
        if (profile.pts != null)
            document.getElementById('currentPoints').textContent = profile.pts.toLocaleString()
    }

    // Wishlist badge
    const wishlist = JSON.parse(localStorage.getItem(`suot_wishlist_${session.user.id}`) || '[]')
    const wBadge = document.getElementById('wishlistNavCount')
    if (wBadge && wishlist.length > 0) { wBadge.textContent = wishlist.length; wBadge.style.display = 'flex' }

    // Message badge
    const updateMsgBadge = async () => {
      const { data: msgs } = await supabase.from('messages')
        .select('from_user_id').eq('to_user_id', session.user.id).eq('read', false)
      const mBadge = document.getElementById('messageNavBadge')
      if (mBadge && msgs) {
        const u = new Set(msgs.map(m => m.from_user_id))
        if (u.size > 0) { mBadge.textContent = u.size; mBadge.style.display = 'flex' }
        else mBadge.style.display = 'none'
      }
    }
    updateMsgBadge()
    setInterval(updateMsgBadge, 5000)
  })()

  /* ══════════════════════════════════════════
     MAP
     ══════════════════════════════════════════ */
  let map, marker
  let meetupLat = null, meetupLng = null, meetupAddress = ''

  map = L.map('meetupMap', { zoomControl: true }).setView([12.8797, 121.774], 6)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors', maxZoom: 19
  }).addTo(map)

  const rosePinIcon = L.divIcon({
    html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <filter id="ds"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/></filter>
      <path d="M14 0C8.477 0 4 4.477 4 10c0 7.5 10 25 10 25S24 17.5 24 10C24 4.477 19.523 0 14 0z" fill="#C994A7" filter="url(#ds)"/>
      <circle cx="14" cy="10" r="4.5" fill="#fff"/>
    </svg>`,
    className: '', iconSize: [28,38], iconAnchor: [14,38], popupAnchor:[0,-38]
  })

  map.on('click', async e => {
    placePin(e.latlng.lat, e.latlng.lng)
    const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng)
    showLocPill(e.latlng.lat, e.latlng.lng, addr)
  })

  function placePin(lat, lng) {
    if (marker) map.removeLayer(marker)
    marker = L.marker([lat, lng], { icon: rosePinIcon }).addTo(map)
    meetupLat = lat; meetupLng = lng
  }

  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'en' } })
      const d = await r.json()
      return d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}` }
  }

  function showLocPill(lat, lng, address) {
    meetupAddress = address
    const short = address.split(',').slice(0, 3).join(',').trim()
    document.getElementById('locAddr').textContent   = short
    document.getElementById('locCoords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    document.getElementById('locPill').classList.add('show')
    document.getElementById('previewLocText').textContent = short
  }

  window.clearLocation = () => {
    if (marker) { map.removeLayer(marker); marker = null }
    meetupLat = null; meetupLng = null; meetupAddress = ''
    document.getElementById('locPill').classList.remove('show')
    document.getElementById('previewLocText').textContent = 'No meetup location set'
  }

  window.useMyLocation = () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported by your browser.'); return }
    const btn = document.getElementById('locateBtn')
    btn.classList.add('busy')
    btn.innerHTML = `<span class="spinner" style="border-color:rgba(201,148,167,.35);border-top-color:#C994A7;"></span>&nbsp;Locating…`
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        map.setView([lat, lng], 15); placePin(lat, lng)
        const addr = await reverseGeocode(lat, lng)
        showLocPill(lat, lng, addr)
        btn.classList.remove('busy')
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> Use My Location`
        showToast('📍 Location pinned!')
      },
      () => {
        btn.classList.remove('busy')
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> Use My Location`
        showToast('Could not get location — allow access in your browser.')
      },
      { timeout: 10000 }
    )
  }

  window.searchAddress = async () => {
    const q = document.getElementById('mapSearch').value.trim(); if (!q) return
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=ph`, { headers: { 'Accept-Language': 'en' } })
      const d = await r.json()
      if (!d.length) { showToast('Location not found. Try a different search.'); return }
      const { lat, lon, display_name } = d[0]
      map.setView([parseFloat(lat), parseFloat(lon)], 15)
      placePin(parseFloat(lat), parseFloat(lon))
      showLocPill(parseFloat(lat), parseFloat(lon), display_name)
      document.getElementById('mapSearch').value = ''
    } catch { showToast('Search failed. Please check your connection.') }
  }

  /* ══════════════════════════════════════════
     FORM HELPERS
     ══════════════════════════════════════════ */
  function toggleTag(el)  { el.classList.toggle('selected') }
  function setPrice(v)    { document.getElementById('ptsPrice').value = v; updatePreview() }
  function selectSize(el) {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'))
    el.classList.add('selected')
  }

  const conditions      = ['Well Loved','Good','Very Good','Like New','Brand New']
  const condFill        = document.getElementById('conditionFill')
  const condLabel       = document.getElementById('conditionLabel')
  const condTrack       = document.getElementById('conditionTrack')
  let   currentCondition = 3

  condTrack.addEventListener('click', e => {
    const ratio = (e.clientX - condTrack.getBoundingClientRect().left) / condTrack.offsetWidth
    currentCondition = Math.max(0, Math.min(4, Math.round(ratio * 4))); updateCondition()
  })
  function updateCondition() {
    condFill.style.width = Math.max(10, (currentCondition / 4) * 100) + '%'
    condLabel.textContent = conditions[currentCondition]
  }
  updateCondition()

  function updatePreview() {
    const name = document.getElementById('itemName').value.trim() || 'Your Item'
    const pts  = parseInt(document.getElementById('ptsPrice').value) || 500
    document.getElementById('previewName').textContent = name
    document.getElementById('previewPts').textContent  = pts.toLocaleString() + ' pts'
  }

  /* FILE UPLOAD */
  let uploadedImages = []
  const mainUpload  = document.getElementById('mainUpload')
  const previewGrid = document.getElementById('previewGrid')
  const uploadZone  = document.getElementById('uploadZone')

  mainUpload.addEventListener('change', handleFiles)
  uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('dragging') })
  uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('dragging'))
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('dragging')
    handleFiles({ target: { files: e.dataTransfer.files } })
  })

  function handleFiles(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => { uploadedImages.push(ev.target.result); renderPreviews() }
      reader.readAsDataURL(file)
    })
  }

  function renderPreviews() {
    if (!uploadedImages.length) { previewGrid.style.display = 'none'; return }
    previewGrid.style.display = 'grid'; previewGrid.innerHTML = ''
    uploadedImages.forEach((src, i) => {
      const t = document.createElement('div')
      t.className = 'preview-thumb' + (i === 0 ? ' main-photo' : '')
      t.innerHTML = `<img src="${src}"/>${i===0?'<span class="badge-main">Main</span>':''}<button class="remove-btn" onclick="removeImage(${i})">×</button>`
      previewGrid.appendChild(t)
    })
    if (uploadedImages.length < 6) {
      const a = document.createElement('div'); a.className = 'add-more-thumb'
      a.innerHTML = `<input type="file" accept="image/*" multiple onchange="handleFiles(event)"/> +`
      previewGrid.appendChild(a)
    }
  }

  function removeImage(idx) { uploadedImages.splice(idx, 1); renderPreviews() }

  /* AI PRICING */
  let aiSuggestedPrice = null
  const AI_BTN_DEFAULT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="18" cy="6" r="3" fill="currentColor" stroke="none"/></svg> ✦ Suggest Price with AI`

  async function getAIPrice() {
    const name      = document.getElementById('itemName').value.trim()
    const category  = document.getElementById('category').value
    const brand     = document.getElementById('brand').value.trim()
    const desc      = document.getElementById('description').value.trim()
    const condition = conditions[currentCondition]
    const tags      = [...document.querySelectorAll('.tag-chip.selected')].map(t => t.textContent).join(', ')
    const size      = document.querySelector('.size-btn.selected')?.textContent || 'Not specified'

    if (!name && !category) { showToast('Fill in item name and category first!'); return }
    if (typeof CONFIG === 'undefined' || !CONFIG.GEMINI_API_KEY) {
      showToast('❌ No API key — check config.js is in personal/ folder.'); return
    }

    const btn = document.getElementById('aiBtn')
    btn.disabled = true
    btn.innerHTML = `<span class="spinner"></span>&nbsp;Analyzing your item…`

    const prompt = `You are a pricing expert for Suot, a sustainable fashion marketplace in the Philippines using virtual "Pasa-Points" (≈ ₱1 = 1 pt).

Item details:
- Name: ${name || 'Not specified'}
- Category: ${category || 'Not specified'}
- Brand: ${brand || 'Unbranded'}
- Condition: ${condition}
- Size: ${size}
- Style Tags: ${tags || 'None'}
- Description: ${desc || 'None'}

Suggest a fair Pasa-Points price for the Philippine secondhand market. Consider brand value, condition, and category demand.

Respond ONLY in valid JSON (no markdown, no backticks):
{"suggested":<number>,"min":<number>,"max":<number>,"reasoning":"<2-3 sentences>"}`

    try {
      const res  = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 500 } }) }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        showToast(`❌ API Error: ${data.error?.message || 'HTTP ' + res.status}`)
        btn.disabled = false; btn.innerHTML = AI_BTN_DEFAULT; return
      }
      const raw    = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      aiSuggestedPrice = parsed.suggested
      document.getElementById('aiPrice').innerHTML       = `${parsed.suggested.toLocaleString()} <small>pts recommended</small>`
      document.getElementById('aiReasoning').textContent = parsed.reasoning
      document.getElementById('aiRange').innerHTML       = `<span class="ai-pill">🔻 Min: ${parsed.min.toLocaleString()} pts</span><span class="ai-pill">🔺 Max: ${parsed.max.toLocaleString()} pts</span>`
      document.getElementById('aiResult').classList.add('visible')
    } catch (err) {
      console.error('AI Pricing failed:', err)
      showToast(`❌ ${err.message || 'Network error — check F12 Console'}`)
    }
    btn.disabled = false; btn.innerHTML = AI_BTN_DEFAULT
  }

  function applyAIPrice() {
    if (!aiSuggestedPrice) return
    document.getElementById('ptsPrice').value = aiSuggestedPrice
    updatePreview(); showToast('AI price applied! ✦')
  }

  /* ══════════════════════════════════════════════════════════════════
     SUBMIT — FIXED: fully async, page only navigates AFTER DB confirms
     
     THE ORIGINAL BUG:
       submitPost() was not async. It fired the DB insert in a
       fire-and-forget IIFE then redirected via setTimeout after ~1600ms.
       For any user with images or a slightly slow connection, the page
       navigated BEFORE the insert completed → browser aborted the request
       → item never saved to DB. User A was just lucky (fast/no images).
     
     THE FIX:
       submitPost is now async. It awaits postItem() fully before
       doing anything else. The button is disabled while posting so
       users can't double-submit. The redirect only happens on success.
  ══════════════════════════════════════════════════════════════════ */
  window.submitPost = async function() {
    const name     = document.getElementById('itemName').value.trim()
    const category = document.getElementById('category').value
    const pts      = document.getElementById('ptsPrice').value

    if (!name || !category || !pts) {
      showToast('Please fill in name, category & price first!'); return
    }

    const btn = document.getElementById('postBtn')
    btn.disabled = true
    btn.textContent = '⏳ Posting…'

    try {
      // Convert base64 previews back to File objects for Supabase Storage upload
      const imageFiles = await Promise.all(uploadedImages.map(async (dataUrl, i) => {
        const res  = await fetch(dataUrl)
        const blob = await res.blob()
        const ext  = (blob.type && blob.type.split('/').pop()) || 'jpg'
        return new File([blob], `item-${Date.now()}-${i}.${ext}`, { type: blob.type })
      }))

      // ★ THE KEY FIX: await postItem — nothing else runs until DB confirms
      const result = await postItem({
        name,
        category:       category.toLowerCase(),
        brand:          document.getElementById('brand').value.trim(),
        description:    document.getElementById('description').value.trim(),
        size:           document.querySelector('.size-btn.selected')?.textContent || '',
        condition:      conditions[currentCondition],
        pts:            parseInt(pts),
        tags:           [...document.querySelectorAll('.tag-chip.selected')].map(t => t.textContent),
        imageFiles,
        latitude:       meetupLat,
        longitude:      meetupLng,
        meetup_address: meetupAddress || null
      })

      if (!result || !result.id) throw new Error('No item ID returned from database.')

      // Save to localStorage cache only AFTER confirmed DB insert
      const uid = localStorage.getItem('suotUserId') || 'anon'
      const existing = JSON.parse(localStorage.getItem(`suot_posted_items_${uid}`) || '[]')
      existing.unshift({
        id:        result.id,
        name,
        category:  category.toLowerCase(),
        brand:     document.getElementById('brand').value.trim(),
        desc:      document.getElementById('description').value.trim(),
        size:      document.querySelector('.size-btn.selected')?.textContent || '',
        condition: conditions[currentCondition],
        pts:       parseInt(pts),
        tags:      [...document.querySelectorAll('.tag-chip.selected')].map(t => t.textContent),
        image:     result.images?.[0] || null,
        postedAt:  result.created_at
      })
      localStorage.setItem(`suot_posted_items_${uid}`, JSON.stringify(existing))

      // Also add to My Collection
      const uid2 = localStorage.getItem('suotUserId') || 'anon'
      const existingCol = JSON.parse(localStorage.getItem(`suotCollection_${uid2}`) || '[]')
      existingCol.unshift({
        id: 'p' + result.id, name,
        category: category.charAt(0).toUpperCase() + category.slice(1),
        size: document.querySelector('.size-btn.selected')?.textContent || '—',
        condition: conditions[currentCondition],
        how: 'Posted', from: 'My Closet', img: result.images?.[0] || '',
        date: result.created_at, notes: document.getElementById('description').value.trim()
      })
      localStorage.setItem(`suotCollection_${uid2}`, JSON.stringify(existingCol))

      // Success — navigate to the new item
      showToast(`"${name}" is now live on Suot! 🎉`)
      setTimeout(() => { window.location.href = `item-detail.html?id=${result.id}` }, 800)

    } catch (err) {
      console.error('[Suot] Post failed:', err)
      const msg = err?.message || err?.error_description || JSON.stringify(err) || 'Unknown error'
      showToast('❌ Post failed: ' + msg)
      // Re-enable button so user can try again
      btn.disabled = false
      btn.textContent = 'Post to Suot ✦'
    }
  }

  /* UTILS */
  function showToast(msg) {
    const t = document.getElementById('toast')
    document.getElementById('toastMsg').textContent = msg
    t.classList.add('show')
    setTimeout(() => t.classList.remove('show'), 3500)
  }
  function logout() { location.href = '../auth/login.html' }

  window.toggleTag     = toggleTag
  window.selectSize    = selectSize
  window.setPrice      = setPrice
  window.getAIPrice    = getAIPrice
  window.applyAIPrice  = applyAIPrice
  window.removeImage   = removeImage
  window.updatePreview = updatePreview
  window.handleFiles   = handleFiles
  window.logout        = logout
