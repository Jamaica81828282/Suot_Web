import { supabase, refundSwapPts, transferSwapPts, earnPtsFromSwap } from '../db/supabase.js'

const EMOJIS   = ['😊','😂','❤️','😍','🙏','👍','🔥','💅','✨','😭','🥰','😅','💯','🎉','👏','😤','👀','🫶']
const FALLBACK = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'

let me=null, myP=null, convs=[], allSwaps=[], pid=null, itmId=null, swId=null, sw=null, rts=null, pendImgs=[]
let activeTab='msgs', currentItemData=null, myOtpCode=null, currentSwapId=null

// ══════════════════════════════════════════════════════════════
//  VIDEO CALL STATE
// ══════════════════════════════════════════════════════════════
let callChannel        = null
let currentCallPid     = null
let partnerCallChannel = null
let ringInterval       = null
let callTimerInt       = null
let callSeconds        = 0
let ringCtx            = null
let callTimeout        = null
let pendingOffer       = null
let peerConn           = null
let localStream        = null
let micMuted           = false
let camOff             = false
let iceCandidateQueue  = []
let outboundIceBuf     = []
let answerApplied      = false
let processingAnswer   = false

const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:hk-turn1.xirsys.com'] },
    {
      username: 'iZqgYbnzH_Brq4IFMFYfnMd9RPtOS-beV1TTLHIUVNKBtDReVRjCvQZix-0AhxuwAAAAAGnH4Z1KYW1haWNh',
      credential: '0b3e8f18-2ab0-11f1-8861-aa4d1230739f',
      urls: [
        'turn:hk-turn1.xirsys.com:80?transport=udp',
        'turn:hk-turn1.xirsys.com:3478?transport=udp',
        'turn:hk-turn1.xirsys.com:80?transport=tcp',
        'turn:hk-turn1.xirsys.com:3478?transport=tcp',
        'turns:hk-turn1.xirsys.com:443?transport=tcp',
        'turns:hk-turn1.xirsys.com:5349?transport=tcp'
      ]
    }
  ]
}
function hideConnecting() {
  const overlay = document.getElementById('vcConnecting')
  if (overlay) overlay.style.display = 'none'
}

let connectingPollInterval = null
function startConnectingPoll() {
  stopConnectingPoll()
  connectingPollInterval = setInterval(() => {
    const remVid = document.getElementById('remoteVideo')
    const overlay = document.getElementById('vcConnecting')
    if (!overlay || overlay.style.display === 'none') { stopConnectingPoll(); return }
    if (remVid?.srcObject) {
      const tracks = remVid.srcObject.getTracks?.()
      if (tracks?.length > 0) { hideConnecting(); stopConnectingPoll(); return }
    }
    const ice = peerConn?.iceConnectionState
    if (ice === 'connected' || ice === 'completed') {
      hideConnecting(); stopConnectingPoll()
    }
  }, 500)
}
function stopConnectingPoll() {
  if (connectingPollInterval) { clearInterval(connectingPollInterval); connectingPollInterval = null }
}

// ── GET LOCAL CAMERA/MIC ──────────────────────────────────────
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    const locVid = document.getElementById('localVideo')
    if (locVid) locVid.srcObject = localStream
    return true
  } catch(e) {
    showToast('Allow camera & microphone to make video calls.')
    return false
  }
}

// ── CREATE PEER CONNECTION ────────────────────────────────────
function setupPeerConnection() {
  if (peerConn) { peerConn.close(); peerConn = null }
  answerApplied = false
  // processingAnswer intentionally NOT reset here — owned by acceptCall()
  // Force 'relay' — skip broken mDNS/local candidates, use only TURN
peerConn = new RTCPeerConnection(ICE_SERVERS) // remove iceTransportPolicy

  if (localStream) {
    // FIX: Use addStream when available — react-native-webrtc's onaddstream
    // fires reliably when the caller uses addStream. When the web uses addTrack,
    // the mobile's onaddstream never fires, causing permanent black screen.
    if (typeof peerConn.addStream === 'function') {
      peerConn.addStream(localStream)
      console.log('[CALL] Web using addStream')
    } else {
      localStream.getTracks().forEach(track => peerConn.addTrack(track, localStream))
      console.log('[CALL] Web using addTrack fallback')
    }
  }

  // FIX: Collect tracks manually in case e.streams[0] is undefined
  // (happens in some browser/rn-webrtc version combos with addTrack)
  const collectedTracks = []
 peerConn.ontrack = (e) => {
  console.log('[CALL] Web ontrack fired')
  const remVid = document.getElementById('remoteVideo')
  if (!remVid) return
  if (e.streams?.[0]) { remVid.srcObject = e.streams[0] }
  else if (e.track) { collectedTracks.push(e.track); remVid.srcObject = new MediaStream(collectedTracks) }
  remVid.style.display = 'block'
  hideConnecting(); stopConnectingPoll()
}
  // Buffer outbound ICE if partnerCallChannel not ready yet
  peerConn.onicecandidate = (e) => {
    if (!e.candidate) return
    if (partnerCallChannel) {
      partnerCallChannel.send({
        type: 'broadcast', event: 'ice_candidate',
        payload: { candidate: e.candidate.toJSON() }
      }).catch(err => console.warn('[CALL] ICE send failed:', err))
    } else {
      console.log('[CALL] Buffering outbound ICE candidate')
      outboundIceBuf.push(e.candidate.toJSON())
    }
  }

 peerConn.onconnectionstatechange = () => {
  const state = peerConn?.connectionState
  console.log('[CALL] Web connectionState:', state)
  if (state === 'connected') { hideConnecting(); stopConnectingPoll() }
  if (state === 'failed') { showToast('Call disconnected.'); endCall() }
}

peerConn.oniceconnectionstatechange = () => {
  const ice = peerConn?.iceConnectionState
  console.log('[CALL] Web iceConnectionState:', ice)
  if (ice === 'connected' || ice === 'completed') { hideConnecting(); stopConnectingPoll() }
}

  iceCandidateQueue = []
}

// ── FLUSH INBOUND ICE (arrived before remote desc) ───────────
async function flushIceCandidates() {
  for (const c of iceCandidateQueue) {
    try { await peerConn.addIceCandidate(new RTCIceCandidate(c)) } catch(e) {}
  }
  iceCandidateQueue = []
}

// ── FLUSH OUTBOUND ICE (arrived before channel ready) ────────
async function flushOutboundIce() {
  const buf = outboundIceBuf.splice(0)
  console.log('[CALL] Flushing', buf.length, 'buffered outbound ICE candidates')
  for (const c of buf) {
    if (partnerCallChannel) {
      await partnerCallChannel.send({
        type: 'broadcast', event: 'ice_candidate', payload: { candidate: c }
      }).catch(e => console.warn('[CALL] buffered ICE warn:', e))
    }
  }
}

// ── SHARED HELPER: set remote desc + create + send answer ─────
async function processOfferAndAnswer(offer) {
  if (!peerConn)                  { console.log('[CALL] processOfferAndAnswer: no peerConn'); return }
  if (peerConn.remoteDescription) { console.log('[CALL] processOfferAndAnswer: remote already set, skip'); return }
  try {
    await peerConn.setRemoteDescription(new RTCSessionDescription(offer))
    await flushIceCandidates()
    const answer = await peerConn.createAnswer()
    await peerConn.setLocalDescription(answer)
    // FIX: flush outbound ICE after setLocalDescription so mobile gets all candidates
    await flushOutboundIce()
    if (partnerCallChannel) {
      await partnerCallChannel.send({
        type: 'broadcast', event: 'call_answer', payload: { answer }
      }).catch(e => console.warn('[CALL] answer send warn:', e))
      console.log('[CALL] Web SENT call_answer')
    }
  } catch(e) {
    console.error('[CALL] processOfferAndAnswer error:', e)
    throw e
  }
}

// ── CLEANUP ───────────────────────────────────────────────────
function cleanupWebRTC() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null }
  if (peerConn) { peerConn.close(); peerConn = null }
  if (partnerCallChannel) { supabase.removeChannel(partnerCallChannel); partnerCallChannel = null }
  const rv = document.getElementById('remoteVideo')
  const lv = document.getElementById('localVideo')
  if (rv) { rv.srcObject = null; rv.style.display = 'block' }
  if (lv) lv.srcObject = null
  const camOffEl = document.getElementById('vcPartnerCamOff')
  if (camOffEl) camOffEl.style.display = 'none'
  pendingOffer = null; micMuted = false; camOff = false
  iceCandidateQueue = []
  outboundIceBuf = []
  answerApplied = false; processingAnswer = false
  document.getElementById('muteMicBtn')?.classList.remove('muted')
  document.getElementById('muteVidBtn')?.classList.remove('muted')
  stopConnectingPoll()
}

// ── MIC / CAM TOGGLES ─────────────────────────────────────────
window.toggleMic = function() {
  if (!localStream) return
  micMuted = !micMuted
  localStream.getAudioTracks().forEach(t => t.enabled = !micMuted)
  document.getElementById('muteMicBtn').classList.toggle('muted', micMuted)
}

window.toggleCam = async function() {
  if (!localStream) return
  camOff = !camOff
  localStream.getVideoTracks().forEach(t => t.enabled = !camOff)
  document.getElementById('muteVidBtn').classList.toggle('muted', camOff)
  if (partnerCallChannel) {
    await partnerCallChannel.send({ type: 'broadcast', event: 'cam_state', payload: { camOff } })
      .catch(e => console.warn('[CALL] cam_state send failed:', e))
  }
}

// ── RING ──────────────────────────────────────────────────────
function startRinging() {
  stopRinging()
  function playRing() {
    try {
      if (!ringCtx) ringCtx = new (window.AudioContext||window.webkitAudioContext)()
      const make = (freq, t0, t1) => {
        const o=ringCtx.createOscillator(), g=ringCtx.createGain()
        o.connect(g); g.connect(ringCtx.destination)
        o.type='sine'; o.frequency.value=freq
        g.gain.setValueAtTime(0,ringCtx.currentTime+t0)
        g.gain.linearRampToValueAtTime(0.22,ringCtx.currentTime+t0+0.05)
        g.gain.setValueAtTime(0.22,ringCtx.currentTime+t1-0.05)
        g.gain.linearRampToValueAtTime(0,ringCtx.currentTime+t1)
        o.start(ringCtx.currentTime+t0); o.stop(ringCtx.currentTime+t1)
      }
      make(480,0,.45); make(440,.5,.95)
    } catch(e){}
  }
  playRing(); ringInterval=setInterval(playRing,2500)
}
function stopRinging() { if(ringInterval){clearInterval(ringInterval);ringInterval=null} }

// ── CALL TIMER ────────────────────────────────────────────────
function startCallTimer() {
  callSeconds=0; callTimerInt=setInterval(()=>{
    callSeconds++
    const m=String(Math.floor(callSeconds/60)).padStart(2,'0'), s=String(callSeconds%60).padStart(2,'0')
    document.getElementById('callTimer').textContent=`${m}:${s}`
  },1000)
}
function stopCallTimer() {
  if(callTimerInt){clearInterval(callTimerInt);callTimerInt=null}
  callSeconds=0
  const ct = document.getElementById('callTimer'); if(ct) ct.textContent='00:00'
}

// ── START CALL (web → mobile) ─────────────────────────────────
window.startVideoCall = async function() {
  if (!pid) { showToast('Open a conversation first.'); return }

  const gotMedia = await getLocalStream()
  if (!gotMedia) return

  currentCallPid   = pid
  processingAnswer = false
  answerApplied    = false
  outboundIceBuf   = []
  setupPeerConnection()

  const offer = await peerConn.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
  await peerConn.setLocalDescription(offer)
  // ICE gathering starts here — candidates buffer in outboundIceBuf

  document.getElementById('callerTargetAv').src           = document.querySelector('.ch-hdr-av img')?.src || av('U')
  document.getElementById('callerTargetName').textContent = document.querySelector('.ch-hdr-name')?.textContent || 'Swapper'
  document.getElementById('callerOverlay').classList.add('open')
  startRinging()

  partnerCallChannel = supabase.channel(`call-${pid}`, { config: { broadcast: { ack: true } } })
  await new Promise(resolve => {
    partnerCallChannel.subscribe(status => {
      console.log('[CALL] Web partner channel:', status)
      if (status === 'SUBSCRIBED') resolve()
    })
  })
  // Channel ready — flush any ICE that buffered during setup
  await flushOutboundIce()

  await partnerCallChannel.send({
    type: 'broadcast', event: 'incoming_call',
    payload: { callerId: me.id, callerName: myP.display_name || myP.username || 'Someone', callerAvatar: myP.avatar_url || av(myP.display_name || 'U'), ts: Date.now() }
  }).catch(e => console.warn('[CALL] incoming_call warn:', e))
  console.log('[CALL] Web SENT incoming_call to:', pid)

  // FIX: Reduced from 1500ms → 500ms. Mobile's call channel is subscribed at boot
  // so it's already listening. 500ms is enough for incoming_call to be processed.
  await new Promise(r => setTimeout(r, 500))

  await partnerCallChannel.send({
    type: 'broadcast', event: 'call_offer', payload: { offer }
  }).catch(e => console.warn('[CALL] call_offer warn:', e))
  console.log('[CALL] Web SENT call_offer to:', pid)

  callTimeout = setTimeout(() => {
    if (document.getElementById('callerOverlay').classList.contains('open')) {
      cancelCall(); showToast('No answer.')
    }
  }, 30000)
}

// ── CANCEL CALL ───────────────────────────────────────────────
window.cancelCall = function() {
  stopRinging()
  if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
  document.getElementById('callerOverlay').classList.remove('open')
  const savedPid = currentCallPid
  cleanupWebRTC()
  if (savedPid) {
    const ch = supabase.channel(`call-${savedPid}`, { config: { broadcast: { ack: true } } })
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'call_cancelled', payload: {} }).catch(()=>{}) })
  }
  currentCallPid = null
}

// ── ACCEPT CALL (web callee ← mobile caller) ──────────────────
window.acceptCall = async function() {
  stopRinging()
  if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
  document.getElementById('incomingOverlay').classList.remove('open')

  const gotMedia = await getLocalStream()
  if (!gotMedia) { window.declineCall(); return }

  // Set lock BEFORE setupPeerConnection — call_offer handler defers to us
  processingAnswer = true
  answerApplied    = false
  outboundIceBuf   = []

  // setupPeerConnection does NOT reset processingAnswer
  setupPeerConnection()

  partnerCallChannel = supabase.channel(`call-${currentCallPid}`, { config: { broadcast: { ack: true } } })
  await new Promise(resolve => {
    partnerCallChannel.subscribe(s => {
      console.log('[CALL] Web accept channel:', s)
      if (s === 'SUBSCRIBED') resolve()
    })
  })
  // Channel ready — flush any ICE that buffered during setup
  await flushOutboundIce()

  const offer = pendingOffer
  if (offer) {
    console.log('[CALL] Web acceptCall: processing buffered offer')
    pendingOffer = null
    try {
      await processOfferAndAnswer(offer)
    } catch(e) {
      console.error('[CALL] Web acceptCall failed:', e)
      processingAnswer = false
      cleanupWebRTC()
      document.getElementById('activeCallOverlay').classList.remove('open')
      return
    }
  } else {
    console.log('[CALL] Web acceptCall: no offer yet, releasing lock for call_offer handler')
    processingAnswer = false
  }

  processingAnswer = false
  openActiveCall()
}

// ── DECLINE CALL ──────────────────────────────────────────────
window.declineCall = function() {
  stopRinging()
  if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
  document.getElementById('incomingOverlay').classList.remove('open')
  const savedPid = currentCallPid
  cleanupWebRTC()
  if (savedPid) {
    const ch = supabase.channel(`call-${savedPid}`, { config: { broadcast: { ack: true } } })
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'call_declined', payload: {} }).catch(()=>{}) })
  }
  currentCallPid = null; pendingOffer = null
}

// ── OPEN ACTIVE CALL SCREEN ───────────────────────────────────
function openActiveCall() {
  const partnerName = document.getElementById('incomingCallerName')?.textContent
    || document.getElementById('callerTargetName')?.textContent
    || document.querySelector('.ch-hdr-name')?.textContent || 'Swapper'
  const partnerAv = document.getElementById('incomingCallerAv')?.src
    || document.getElementById('callerTargetAv')?.src
    || document.querySelector('.ch-hdr-av img')?.src || av('U')

  document.getElementById('activeCallName').textContent   = partnerName
  document.getElementById('activeCallAv').src             = partnerAv
  document.getElementById('vcConnectingName').textContent = partnerName
  document.getElementById('vcConnectingAv').src           = partnerAv
  document.getElementById('vcConnecting').style.display   = 'flex'
  document.getElementById('activeCallOverlay').classList.add('open')
  document.getElementById('callerOverlay').classList.remove('open')

  const camOffEl = document.getElementById('vcPartnerCamOff')
  if (camOffEl) {
    camOffEl.style.display = 'none'
    const avEl = document.getElementById('vcPartnerCamAvatar'); const nmEl = document.getElementById('vcPartnerCamName')
    if (avEl) avEl.src = partnerAv; if (nmEl) nmEl.textContent = partnerName
  }
  const rv = document.getElementById('remoteVideo')
  if (rv) { rv.style.display = 'block'; rv.style.objectFit = 'contain' }

  startCallTimer()
  startConnectingPoll()
setTimeout(() => { hideConnecting(); stopConnectingPoll() }, 15000)
}

// ── END CALL ──────────────────────────────────────────────────
window.endCall = function() {
  stopRinging(); stopCallTimer()
  if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
  document.getElementById('activeCallOverlay').classList.remove('open')
  const savedPid = currentCallPid
  cleanupWebRTC()
  if (savedPid) {
    const ch = supabase.channel(`call-${savedPid}`, { config: { broadcast: { ack: true } } })
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'call_ended', payload: {} }).catch(()=>{}) })
  }
  currentCallPid = null
  showToast('Call ended.')
}

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
const {data:{session}} = await supabase.auth.getSession()
if (!session) { location.href='../auth/login.html' }
me = session.user
const {data:p} = await supabase.from('profiles').select('*').eq('id',me.id).single()
myP = p||{}
const myName = myP.display_name||myP.username||'You'
const myAv   = myP.avatar_url||av(myName)
document.getElementById('navName').textContent=myName
document.getElementById('navAv').src=myAv
document.getElementById('eqBar').innerHTML = EMOJIS.map(e=>`<span class="eq-e" onclick="insE('${e}')">${e}</span>`).join('')

// ── SUBSCRIBE TO CALL SIGNALS ─────────────────────────────────
callChannel = supabase.channel(`call-${me.id}`, { config: { broadcast: { ack: true } } })

  .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
    // Ignore stale replayed signals (older than 30s)
    if (payload.ts && Date.now() - payload.ts > 30000) {
      console.log('[CALL] Ignoring stale incoming_call signal')
      return
    }
    if (document.getElementById('activeCallOverlay').classList.contains('open')) return
    if (document.getElementById('callerOverlay').classList.contains('open')) return
    currentCallPid   = payload.callerId
    pendingOffer     = null
    answerApplied    = false
    processingAnswer = false
    outboundIceBuf   = []
    document.getElementById('incomingCallerAv').src           = payload.callerAvatar || av(payload.callerName)
    document.getElementById('incomingCallerName').textContent = payload.callerName || 'Someone'
    document.getElementById('incomingOverlay').classList.add('open')
    startRinging()
    callTimeout = setTimeout(() => {
      if (document.getElementById('incomingOverlay').classList.contains('open')) declineCall()
    }, 30000)
  })

  .on('broadcast', { event: 'call_offer' }, async ({ payload }) => {
    console.log('[CALL] Web received call_offer — peerConn:', !!peerConn, 'processingAnswer:', processingAnswer, 'answerApplied:', answerApplied)
    pendingOffer = payload.offer

    if (processingAnswer) { console.log('[CALL] acceptCall in progress — buffered'); return }
    if (answerApplied)    { console.log('[CALL] answer already applied, skip'); return }
    if (!peerConn)        { console.log('[CALL] No peer yet — buffered for acceptCall'); return }

    if (!peerConn.remoteDescription) {
      console.log('[CALL] Processing offer in call_offer handler')
      processingAnswer = true
      try {
        await processOfferAndAnswer(payload.offer)
        answerApplied = true
      } catch(e) {
        console.error('[CALL] call_offer handler error:', e)
      } finally {
        processingAnswer = false
      }
    }
  })

  .on('broadcast', { event: 'call_answer' }, async ({ payload }) => {
    // Web is the caller — mobile accepted
    console.log('[CALL] Web received call_answer, answerApplied:', answerApplied)
    stopRinging()
    if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
    document.getElementById('callerOverlay').classList.remove('open')

    if (answerApplied || !peerConn || peerConn.remoteDescription) {
      console.log('[CALL] Web: already applied or no peer, opening active call')
      openActiveCall()
      return
    }

    try {
      answerApplied = true
      await peerConn.setRemoteDescription(new RTCSessionDescription(payload.answer))
      await flushIceCandidates()
      // FIX: flush outbound ICE after remote desc set so mobile gets all candidates
      await flushOutboundIce()
      console.log('[CALL] Web caller: remote answer applied')
    } catch(e) {
      answerApplied = false
      console.error('[CALL] Web error applying answer:', e)
    }
    openActiveCall()
  })

  .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
    if (!payload.candidate) return
    if (peerConn && peerConn.remoteDescription) {
      try { await peerConn.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch(e) {}
    } else {
      iceCandidateQueue.push(payload.candidate)
    }
  })

  .on('broadcast', { event: 'cam_state' }, ({ payload }) => {
    const remVid = document.getElementById('remoteVideo')
    const camOffEl = document.getElementById('vcPartnerCamOff')
    if (payload.camOff) {
      if (remVid) remVid.style.display = 'none'
      if (camOffEl) camOffEl.style.display = 'flex'
    } else {
      if (remVid) remVid.style.display = 'block'
      if (camOffEl) camOffEl.style.display = 'none'
    }
  })

  .on('broadcast', { event: 'call_declined' }, () => {
    stopRinging()
    if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
    document.getElementById('callerOverlay').classList.remove('open')
    cleanupWebRTC(); currentCallPid = null
    showToast('Call declined.')
  })

  .on('broadcast', { event: 'call_cancelled' }, () => {
    stopRinging()
    if (callTimeout) { clearTimeout(callTimeout); callTimeout = null }
    document.getElementById('incomingOverlay').classList.remove('open')
    cleanupWebRTC(); currentCallPid = null
  })

  .on('broadcast', { event: 'call_ended' }, () => {
    stopCallTimer()
    document.getElementById('activeCallOverlay').classList.remove('open')
    cleanupWebRTC(); currentCallPid = null
    showToast('Call ended.')
  })

  // .subscribe() MUST be LAST — after all .on() handlers
  .subscribe((status) => { console.log('[CALL] Web call channel status:', status) })

// ══════════════════════════════════════════════════════════════
//  INBOX / MESSAGES
// ══════════════════════════════════════════════════════════════
const params = new URLSearchParams(location.search)
await loadIb()
await loadAllSwaps()
if (params.get('with')) openConv(params.get('with'), params.get('item'), params.get('swap'))

supabase.channel('new-messages-global')
  .on('postgres_changes', {event:'INSERT', schema:'public', table:'messages', filter:`to_user_id=eq.${me.id}`}, async () => {
    await loadIb(); updBadge(); updMsgTabBadge()
  }).subscribe()

window.switchTab = function(tab) {
  activeTab = tab
  document.getElementById('tabMsgs').classList.toggle('active', tab==='msgs')
  document.getElementById('tabSwaps').classList.toggle('active', tab==='swaps')
  document.getElementById('ibList').style.display   = tab==='msgs'  ? 'block' : 'none'
  document.getElementById('swapList').style.display = tab==='swaps' ? 'block' : 'none'
  document.getElementById('searchWrap').style.display = tab==='msgs' ? 'block' : 'none'
  if (tab==='swaps') renderSwapList()
}

async function loadIb() {
  const { data: msgs } = await supabase.from('messages')
    .select('id,from_user_id,to_user_id,body,read,created_at,msg_type,swap_id,item_id')
    .or(`from_user_id.eq.${me.id},to_user_id.eq.${me.id}`)
    .order('created_at', { ascending: false }).limit(100)
  if (!msgs?.length) { renderIbEmpty(); return }
  const map = new Map(); const pids = new Set()
  for (const m of msgs) {
    const isMe = m.from_user_id === me.id
    const p2   = isMe ? m.to_user_id : m.from_user_id
    if (!map.has(p2)) map.set(p2, { p2, partner:null, last:m, unread:0, swap:null })
    if (!isMe && !m.read) map.get(p2).unread++
    pids.add(p2)
  }
  const swapIds = [...new Set(msgs.filter(m=>m.swap_id).map(m=>m.swap_id))].slice(0,30)
  const [profRes, swRes] = await Promise.all([
    supabase.from('profiles').select('id,username,display_name,avatar_url').in('id',[...pids]),
    swapIds.length ? supabase.from('swaps').select('id,status').in('id',swapIds) : {data:[]}
  ])
  const profMap={}, swMap={}
  profRes.data?.forEach(p=>profMap[p.id]=p)
  swRes.data?.forEach(s=>swMap[s.id]=s)
  for (const [p2,conv] of map) {
    conv.partner = profMap[p2]||{id:p2,username:'user',display_name:'User',avatar_url:null}
    const sm = msgs.find(m=>m.swap_id&&(m.from_user_id===p2||m.to_user_id===p2))
    if (sm&&swMap[sm.swap_id]) conv.swap=swMap[sm.swap_id]
  }
  convs=[...map.values()]
  renderIb(convs); updBadge(); updMsgTabBadge()
}

function renderIb(list) {
  const el=document.getElementById('ibList')
  if (!list.length){renderIbEmpty();return}
  const swapIcon=`<img src="swap.png" alt="Swap" style="width:1.05em;height:1.05em;object-fit:contain;display:inline-block;vertical-align:-0.15em;margin-right:.35em;">`
  el.innerHTML=list.map(c=>{
    const pp=c.partner,name=pp.display_name||pp.username||'User',ava=pp.avatar_url||av(name)
    const isAct=pp.id===pid
    const preHtml=c.last?.msg_type==='swap_request'?`${swapIcon}Swap request`:(c.last?.msg_type==='image'?'📷 Photo':esc(c.last?.body||'…'))
    const pill=c.swap?`<div class="c-swap-pill ${c.swap.status}">⇄ ${c.swap.status}</div>`:''
    return `<div class="conv ${isAct?'active':''} ${c.unread?'unread':''}" data-pid="${pp.id}" onclick="window.__oc('${pp.id}','${c.last?.item_id||''}','${c.last?.swap_id||''}')">
      <div class="c-av"><img src="${ava}" alt=""/></div>
      <div class="c-body"><div class="c-r1"><span class="c-name">${esc(name)}</span><span class="c-time">${ago(c.last?.created_at)}</span></div><div class="c-pre">${preHtml}</div>${pill}</div>
      ${c.unread?`<div class="c-badge">${c.unread}</div>`:''}
    </div>`
  }).join('')
}
function renderIbEmpty(){document.getElementById('ibList').innerHTML=`<div class="ib-empty"><div class="ib-empty-icon">💌</div><h4>No messages yet</h4><p>Browse items and tap "Message Swapper" to start a conversation.</p></div>`}
window.__oc=(a,b,c)=>openConv(a,b||null,c||null)
window.filterIb=q=>renderIb(q?convs.filter(c=>(c.partner.display_name||c.partner.username||'').toLowerCase().includes(q.toLowerCase())):convs)

async function loadAllSwaps() {
  const {data}=await supabase.from('swaps')
    .select(`*,ri:items!requested_item_id(id,name,images,pts,category),oi:items!offered_item_id(id,name,images,pts,category),requester:profiles!requester_id(id,username,display_name,avatar_url),owner:profiles!owner_id(id,username,display_name,avatar_url)`)
    .or(`requester_id.eq.${me.id},owner_id.eq.${me.id}`).order('created_at',{ascending:false})
  allSwaps=data||[]; updSwapTabBadge()
}

function renderSwapList(){
  const el=document.getElementById('swapList')
  if(!allSwaps.length){el.innerHTML=`<div class="ib-empty"><div class="ib-empty-icon"><img src="swap.png" style="width:1.35em;height:1.35em;object-fit:contain;display:inline-block;vertical-align:middle;"></div><h4>No swaps yet</h4><p>Send a swap request from any item's detail page.</p></div>`;return}
  const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
  const lck=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
  const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
  const lbl={pending:'⏳ Pending',accepted:`${chk}Accepted`,declined:'❌ Declined',cancelled:'🚫 Cancelled',swapped:`${dn}Swapped`,otp_pending:`${lck}OTP Required`}
  el.innerHTML=allSwaps.map(s=>{
    const ri=s.ri?.images?.[0]||FALLBACK,oi=s.oi?.images?.[0]||FALLBACK
    const rn=s.ri?.name||'Item',on=s.oi?.name||'Item'
    const isRequester=s.requester_id===me.id
    const partner=isRequester?s.owner:s.requester
    const pName=partner?.display_name||partner?.username||'User'
    const isOtpReady=s.status==='accepted'||s.status==='otp_pending'
    const otpBtn=isOtpReady?`<button class="sr-otp-btn" onclick="openOtpModal('${s.id}',event)">${lck}Enter OTP to Complete</button>`:''
    const ptsPill=s.offered_pts>0?`<div class="sr-pts-pill">💰 +${s.offered_pts.toLocaleString()} pts included</div>`:''
    return `<div class="swap-row ${sw&&sw.id===s.id?'active':''}" onclick="openSwapConv('${s.id}')">
      <div class="sr-top"><div class="sr-imgs">${s.offered_item_id?`<img class="sr-img" src="${oi}"/>`:`<div class="sr-img" style="background:linear-gradient(135deg,#f0fdf4,#e8f5f0);display:flex;align-items:center;justify-content:center;font-size:16px;">💰</div>`}<img class="sr-img" src="${ri}"/></div>
      <div class="sr-arr">⇄</div><div class="sr-info"><div class="sr-names">${esc(on)} ⇄ ${esc(rn)}</div><div class="sr-partner">${isRequester?'You offered to':'Request from'} ${esc(pName)}</div>${ptsPill}</div></div>
      <div class="sr-status"><span class="sr-badge ${s.status}">${lbl[s.status]||s.status}</span><span class="sr-time">${ago(s.created_at)}</span></div>${otpBtn}
    </div>`
  }).join('')
}

window.openSwapConv=async function(swapId){
  const s=allSwaps.find(x=>x.id===swapId);if(!s)return
  const partnerId=s.requester_id===me.id?s.owner_id:s.requester_id
  openConv(partnerId,s.requested_item_id,swapId);switchTab('msgs')
}

window.toggleSwapPanel=function(){
  const panel=document.getElementById('swapPanel');panel.classList.toggle('show')
  if(panel.classList.contains('show'))renderSwapPanel()
}

function renderSwapPanel(){
  const el=document.getElementById('spContent')
  if(!sw){el.innerHTML=`<div class="sp-no-swap">No active swap request.</div>`;return}
  const lck=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
  const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
  const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
  const lbl={pending:'⏳ Pending',accepted:`${chk}Accepted`,otp_pending:`${lck}OTP Required`,declined:'❌ Declined',cancelled:'🚫 Cancelled',swapped:`${dn}Swapped`}
  const isOwner=sw.owner_id===me.id,isReq=sw.requester_id===me.id
  const ptsLine=sw.offered_pts>0?`<div style="font-size:12px;color:#16a34a;font-weight:700;margin-bottom:8px;">💰 +${sw.offered_pts.toLocaleString()} pts included</div>`:''
  let btns=''
  if(sw.status==='pending'){
    if(isOwner)btns=`<div class="sp-btns"><button class="sp-btn-accept" onclick="respSwap('${sw.id}','accepted');toggleSwapPanel()">✓ Accept</button><button class="sp-btn-decline" onclick="respSwap('${sw.id}','declined');toggleSwapPanel()">✗ Decline</button></div>`
    else if(isReq)btns=`<div class="sp-btns"><button class="sp-btn-cancel" onclick="respSwap('${sw.id}','cancelled');toggleSwapPanel()">🚫 Cancel</button></div>`
  }else if(sw.status==='otp_pending'||sw.status==='accepted'){
    btns=`<button class="sp-btn-otp" onclick="openOtpModal('${sw.id}',event);toggleSwapPanel()">${lck}Enter OTP</button>`
  }
  el.innerHTML=`<div class="sp-status-row"><span class="sp-badge ${sw.status}">${lbl[sw.status]||sw.status}</span><span style="font-size:11px;color:var(--muted);">${sw.ri?.name||'Item'} ⇄ ${sw.oi?.name||'Item'}</span></div>${ptsLine}${btns}`
}

async function openConv(partnerId, itemId=null, swapId=null) {
  pid=partnerId; itmId=itemId&&itemId!=='null'?itemId:null; swId=swapId&&swapId!=='null'?swapId:null; sw=null
  currentItemData=null
  document.querySelectorAll('.conv').forEach(el=>{el.classList.toggle('active',el.dataset.pid===partnerId);if(el.dataset.pid===partnerId)el.classList.remove('unread')})
  supabase.from('messages').update({read:true}).eq('from_user_id',partnerId).eq('to_user_id',me.id).eq('read',false).then(()=>{
    const c=convs.find(c=>c.partner.id===partnerId);if(c){c.unread=0;updBadge();updMsgTabBadge()}
  })
  const c=convs.find(c=>c.partner.id===partnerId);if(c){c.unread=0;updBadge();updMsgTabBadge();renderIb(convs)}
  const {data:partner}=await supabase.from('profiles').select('*').eq('id',partnerId).single()
  if(!partner)return
  const pName=partner.display_name||partner.username||'User', pAv=partner.avatar_url||av(pName)

  document.getElementById('chHdr').innerHTML=`
    <div class="ch-hdr-av"><img src="${pAv}" alt=""/></div>
    <div class="ch-hdr-info"><div class="ch-hdr-name">${esc(pName)}</div><div class="ch-hdr-sub">@${esc(partner.username||'user')}</div></div>
    <button class="btn-hdr" onclick="location.href='../profile/profile.html?userId=${partner.id}'">View Profile</button>
    ${itmId?`<button class="btn-hdr" onclick="location.href='../personal/item-detail.html?id=${itmId}'">View Item</button>`:''}
    <button class="btn-hdr" onclick="startVideoCall()" style="display:flex;align-items:center;gap:6px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
      Video Call
    </button>
  `

  if(itmId){try{const{data:itm}=await supabase.from('items').select('*').eq('id',itmId).single();if(itm){currentItemData=itm;renderItemContextBar(itm,null)}}catch(e){}}
  if(swId){
    let{data:s}=await supabase.from('swaps').select('*,ri:items!requested_item_id(id,name,images,pts,category)').eq('id',swId).single()
    if(s?.offered_item_id){const{data:oi}=await supabase.from('items').select('id,name,images,pts,category').eq('id',s.offered_item_id).single();if(oi)s.oi=oi}
    if(s){sw=s;renderBanner(s);if(currentItemData)renderItemContextBar(currentItemData,s)}
  }
  document.getElementById('chEmpty').style.display='none'
  document.getElementById('chActive').style.display='flex'
  await loadMsgs(partnerId,partner)
  if(rts)supabase.removeChannel(rts)
  rts=supabase.channel(`c-${partnerId}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`to_user_id=eq.${me.id}`},async pl=>{
      const m=pl.new
      if(m.from_user_id!==pid){await loadIb();return}
      supabase.from('messages').update({read:true}).eq('id',m.id).then(()=>{})
      if(m.swap_id){
        let{data:s}=await supabase.from('swaps').select('*,ri:items!requested_item_id(id,name,images,pts,category)').eq('id',m.swap_id).single()
        if(s?.offered_item_id){const{data:oi}=await supabase.from('items').select('id,name,images,pts,category').eq('id',s.offered_item_id).single();if(oi)s.oi=oi}
        if(s){sw=s;swId=s.id;renderBanner(s);if(currentItemData)renderItemContextBar(currentItemData,s)}
      }
      const{data:ptnr}=await supabase.from('profiles').select('*').eq('id',pid).single()
      appendMsg(m,ptnr,true)
      const conv=convs.find(c=>c.partner.id===pid);if(conv)conv.last=m
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'swaps'},async pl=>{
      if(sw&&pl.new.id===sw.id){
        let{data:s}=await supabase.from('swaps').select('*,ri:items!requested_item_id(id,name,images,pts,category)').eq('id',sw.id).single()
        if(s?.offered_item_id){const{data:oi}=await supabase.from('items').select('id,name,images,pts,category').eq('id',s.offered_item_id).single();if(oi)s.oi=oi}
        if(s){sw=s;renderBanner(s);if(currentItemData)renderItemContextBar(currentItemData,s);document.querySelectorAll(`.sc[data-sid="${s.id}"]`).forEach(card=>updateCard(card,s))}
        const conv=convs.find(c=>c.partner.id===pid);if(conv&&conv.swap)conv.swap.status=pl.new.status;renderIb(convs)
        await loadAllSwaps();renderSwapList()
      }
    })
    .subscribe()
  updSwapPanelBtn()
}

function updSwapPanelBtn(){
  const btn=document.getElementById('swapPanelBtn');if(!btn)return
  if(sw&&sw.status!=='swapped'){btn.style.display='flex';btn.classList.toggle('has-swap',sw.status==='pending'&&sw.owner_id===me.id)}
  else{btn.style.display='none';document.getElementById('swapPanel').classList.remove('show')}
}

function renderItemContextBar(itm,swapData){
  const bar=document.getElementById('itemContextBar');if(!itm){bar.classList.remove('show');return}
  const img=(itm.images&&itm.images[0])||itm.image||FALLBACK,status=swapData?.status
  const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
  const lck=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
  const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
  const badgeCls=status||'no_swap',badgeTxt=status?(({pending:'⏳ Pending',accepted:`${chk}Accepted`,declined:'❌ Declined',cancelled:'🚫 Cancelled',swapped:`${dn}Swapped`,otp_pending:`${lck}OTP Required`})[status]||status):`<img src="swap.png" style="width:1.05em;height:1.05em;object-fit:contain;display:inline-block;vertical-align:-0.15em;margin-right:.35em;">Available`
  const ptsNote=swapData?.offered_pts>0?`<span style="font-size:10.5px;color:#16a34a;font-weight:700;margin-left:6px;">+${swapData.offered_pts.toLocaleString()} pts</span>`:''
  bar.innerHTML=`<img class="icb-img" src="${img}" alt="${esc(itm.name)}" onclick="location.href='../personal/item-detail.html?id=${itm.id}'" title="View item"/>
    <div class="icb-info"><div class="icb-name">${esc(itm.name)}</div><div class="icb-pts">${(itm.pts||0).toLocaleString()} pts · ${esc(itm.category||'')}${ptsNote}</div></div>
    <div class="icb-status"><span class="icb-badge ${badgeCls}">${badgeTxt}</span><button class="icb-view-btn" onclick="location.href='../personal/item-detail.html?id=${itm.id}'">View ↗</button></div>`
  bar.classList.add('show')
}

function renderBanner(s){
  const bn=document.getElementById('swBanner');if(!s){bn.classList.remove('show');return}
  const ri=s.ri?.images?.[0]||FALLBACK,oi=s.oi?.images?.[0]||FALLBACK,rn=s.ri?.name||'Item',on=s.oi?.name||'Item'
  const lck=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
  const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
  const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
  const lbl={pending:'⏳ Pending',accepted:`${chk}Accepted`,declined:'❌ Declined',cancelled:'🚫 Cancelled',swapped:`${dn}Swapped`,otp_pending:`${lck}OTP Required`}
  const otpBtn=(s.status==='otp_pending'||s.status==='accepted')&&s.status!=='swapped'?`<button onclick="openOtpModal('${s.id}',event)" style="padding:6px 14px;border-radius:50px;border:none;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">${lck}OTP</button>`:''
  const ptsStrip=s.offered_pts>0?`<div class="sc-pts-strip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>+${s.offered_pts.toLocaleString()} pts included</div>`:''
  const oiDisplay=s.offered_item_id?`<img class="sw-thumb" src="${oi}" title="${on}"/>`:`<div class="sw-thumb" style="background:linear-gradient(135deg,#f0fdf4,#e8f5f0);display:flex;align-items:center;justify-content:center;font-size:18px;border-radius:9px;">💰</div>`
  bn.innerHTML=`<div class="sw-inner"><div class="sw-pair">${oiDisplay}<span class="sw-arr">⇄</span><img class="sw-thumb" src="${ri}" title="${rn}"/><div><div class="sw-info-t">${esc(s.offered_item_id?on:(s.offered_pts>0?s.offered_pts.toLocaleString()+' pts':'?'))} ⇄ ${esc(rn)}</div><div class="sw-info-s">Swap request</div></div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;"><div class="sw-badge ${s.status}">${lbl[s.status]||s.status}</div>${otpBtn}</div></div>${ptsStrip}`
  bn.classList.add('show')
}

async function loadMsgs(partnerId,partner){
  const el=document.getElementById('chMsgs')
  el.innerHTML='<div class="ldr"><div class="spin"></div></div>'
  const itemCardHtml=currentItemData?buildItemLinkCard(currentItemData):''
  const{data:msgs}=await supabase.from('messages').select('*')
    .or(`and(from_user_id.eq.${me.id},to_user_id.eq.${partnerId}),and(from_user_id.eq.${partnerId},to_user_id.eq.${me.id})`)
    .order('created_at',{ascending:true})
  el.innerHTML=''
  if(itemCardHtml){const pin=document.createElement('div');pin.style.cssText='display:flex;justify-content:center;margin:8px 0 14px;';pin.innerHTML=itemCardHtml;el.appendChild(pin)}
  if(!msgs?.length){el.innerHTML+='<div style="text-align:center;color:#ccc;font-size:13px;margin-top:16px;">No messages yet — say hi! 👋</div>';return}
  const sids=[...new Set(msgs.filter(m=>m.swap_id).map(m=>m.swap_id))];let smap={}
  if(sids.length){
    const{data:swaps}=await supabase.from('swaps').select('*,ri:items!requested_item_id(id,name,images)').in('id',sids)
    if(swaps){
      const offerIds=[...new Set(swaps.filter(s=>s.offered_item_id).map(s=>s.offered_item_id))]
      if(offerIds.length){const{data:ois}=await supabase.from('items').select('id,name,images').in('id',offerIds);ois?.forEach(oi=>swaps.forEach(s=>{if(s.offered_item_id===oi.id)s.oi=oi}))}
      swaps.forEach(s=>{smap[s.id]=s;if(!sw&&s.id===swId){sw=s;renderBanner(s);if(currentItemData)renderItemContextBar(currentItemData,s)}})
    }
  }
  if(!sw){const lsm=[...msgs].reverse().find(m=>m.swap_id);if(lsm&&smap[lsm.swap_id]){sw=smap[lsm.swap_id];swId=sw.id}}
  if(sw){const{data:freshSw}=await supabase.from('swaps').select('*').eq('id',sw.id).single();if(freshSw){sw={...sw,...freshSw};smap[sw.id]=sw};renderBanner(sw);if(currentItemData)renderItemContextBar(currentItemData,sw)}
  let lastDate=null
  for(let i=0;i<msgs.length;i++){
    const m=msgs[i],prev=msgs[i-1],next=msgs[i+1],md=new Date(m.created_at).toDateString()
    if(md!==lastDate){lastDate=md;const d=document.createElement('div');d.className='date-sep';d.textContent=fmtDate(m.created_at);el.appendChild(d)}
    appendMsg(m,partner,false,(sw&&m.swap_id===sw.id?sw:smap[m.swap_id])||null,prev,next)
  }
  if(sw)document.querySelectorAll(`.sc[data-sid="${sw.id}"]`).forEach(card=>updateCard(card,sw))
  scrollB()
}

function buildItemLinkCard(itm){
  const img=(itm.images&&itm.images[0])||itm.image||FALLBACK,isSwapped=itm.status==='swapped'
  const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
  const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
  return `<a class="item-link-card" href="../personal/item-detail.html?id=${itm.id}" target="_blank"><img class="ilc-img" src="${img}" alt="${esc(itm.name)}"/><div class="ilc-body"><div class="ilc-cat">${esc(itm.category||'Item')}</div><div class="ilc-name">${esc(itm.name)}</div><div class="ilc-footer"><span class="ilc-pts">${(itm.pts||0).toLocaleString()} pts</span><span class="ilc-avail ${isSwapped?'swapped':'available'}">${isSwapped?`${dn}Swapped`:`${chk}Available`}</span></div></div></a>`
}

function appendMsg(m,partner,scroll=true,swData=null,prev=null,next=null){
  const el=document.getElementById('chMsgs'),isMe=m.from_user_id===me.id,pAv=partner?.avatar_url||av(partner?.display_name||'U'),rx=m.reactions||{}
  const samePrev=prev&&prev.from_user_id===m.from_user_id&&(new Date(m.created_at)-new Date(prev.created_at))<120000
  const sameNext=next&&next.from_user_id===m.from_user_id&&(new Date(next.created_at)-new Date(m.created_at))<120000
  const gc=samePrev&&sameNext?'grp-mid same-sender':samePrev?'grp-last same-sender':sameNext?'grp-first':''
  const row=document.createElement('div');row.className=`mr ${isMe?'mine':''} ${gc}`;row.dataset.mid=m.id
  const rr=isMe?`<div class="rr">${m.read?`<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 13 13"/><polyline points="9 9 3 15 7 19"/></svg>`:`<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`}</div>`:''
  const epop=`<div id="ep-${m.id}" class="ep">${EMOJIS.map(e=>`<span class="ep-e" onclick="reactTo('${m.id}','${e}')">${e}</span>`).join('')}</div>`
  const rxs=`<div class="rx" id="rx-${m.id}">${rxHTML(rx,m.id)}</div>`
  let inner=''
  if(m.msg_type==='swap_request'&&swData){
    const ri=swData.ri?.images?.[0]||FALLBACK,oi=swData.oi?.images?.[0]||FALLBACK,rn=swData.ri?.name||'Item',on=swData.oi?.name||swData.offered_item_id||'Item'
    const isOwn=swData.owner_id===me.id,stat=swData.status
    const lck=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
    const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
    const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
    const lbl={pending:'⏳ Pending',accepted:`${chk}Accepted`,declined:'❌ Declined',cancelled:'🚫 Cancelled',swapped:`${dn}Swapped`,otp_pending:`${lck}OTP Required`}
    const ptsStrip=swData.offered_pts>0?`<div class="sc-pts-strip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>+${swData.offered_pts.toLocaleString()} pts included</div>`:''
    const oiDisplay=swData.offered_item_id?`<img src="${oi}" alt="${on}"/>`:`<div style="width:100%;aspect-ratio:1;border-radius:10px;border:1px solid var(--border);background:linear-gradient(135deg,#f0fdf4,#e8f5f0);display:flex;align-items:center;justify-content:center;font-size:2rem;margin-bottom:5px;">💰</div>`
    let swBot=''
    if(stat==='otp_pending'||stat==='accepted')swBot=`<div class="sc-acts"><button class="btn-accept" onclick="openOtpModal('${swData.id}',event)">${lck}Enter OTP</button></div>`
    else if(stat==='swapped')swBot=`<div class="sc-status swapped">${dn}Swap completed!</div>`
    else if(stat!=='pending')swBot=`<div class="sc-status ${stat}">${lbl[stat]}</div>`
    else if(isOwn)swBot=`<div class="sc-acts"><button class="btn-accept" onclick="respSwap('${swData.id}','accepted')">✓ Accept</button><button class="btn-decline" onclick="respSwap('${swData.id}','declined')">✗ Decline</button></div>`
    else swBot=`<button class="btn-cancel-swap" onclick="respSwap('${swData.id}','cancelled')">Cancel Request</button>`
    inner=`<div class="bw"><div class="sc" data-sid="${swData.id}"><div class="sc-hdr"><span class="sc-hdr-icon"><img src="swap.png" style="width:1.05em;height:1.05em;object-fit:contain;display:inline-block;vertical-align:middle;"></span><div><div class="sc-hdr-t">Swap Request</div><div class="sc-hdr-s">${isMe?'You offered':'They offered'}</div></div></div>
      <div class="sc-items"><div class="sc-i">${oiDisplay}<div class="sc-i-n">${esc(swData.offered_item_id?on:(swData.offered_pts>0?swData.offered_pts.toLocaleString()+' pts':'?'))}</div><div class="sc-i-p">${isMe?'Your offer':'Their offer'}</div></div><div class="sc-arr">⇄</div><div class="sc-i"><img src="${ri}" alt="${rn}"/><div class="sc-i-n">${esc(rn)}</div><div class="sc-i-p">${isMe?'Their item':'Your item'}</div></div></div>
      ${ptsStrip}${m.body?`<div class="sc-note">"${esc(m.body)}"</div>`:''}
      <div class="sc-bot">${swBot}</div></div>${rxs}</div>`
  }else if(['swap_accepted','swap_declined','swap_cancelled','swap_swapped'].includes(m.msg_type)){
    inner=`<div class="bw"><div class="bubble">${esc(m.body)}${rr}</div></div>`
  }else if(m.msg_type==='image'&&m.body){
    inner=`<div class="bw"><div class="msg-acts"><div class="mac" onclick="openEp('${m.id}',this)">😊</div></div><div class="bubble" style="padding:5px;"><img class="bub-img" src="${esc(m.body)}" onclick="openLb(this.src)"/>${rr}</div>${epop}${rxs}</div>`
  }else{
    inner=`<div class="bw"><div class="msg-acts"><div class="mac" onclick="openEp('${m.id}',this)">😊</div></div><div class="bubble">${esc(m.body)}${rr}</div>${epop}${rxs}</div>`
  }
  row.innerHTML=isMe?`<div class="mr-av-sp"></div>${inner}`:`<div class="mr-av"><img src="${pAv}" alt=""/></div>${inner}`
  el.appendChild(row);if(scroll)scrollB()
}

function rxHTML(rx,mid){return Object.entries(rx).filter(([e,u])=>u?.length).map(([e,u])=>{const mine=u.includes(me.id);return`<div class="rxp ${mine?'mine':''}" onclick="reactTo('${mid}','${e}')" title="${u.length}">${e}<span>${u.length}</span></div>`}).join('')}

function updateCard(card,s){
  const bot=card.querySelector('.sc-bot');if(!bot)return
  const lck=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
  const chk=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><polyline points="20 6 9 17 4 12"/></svg>`
  const dn=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.15em;margin-right:.35em;"><path d="M7.5 13.5c1.5 1.5 3.2 2.3 4.5 2.3 1.4 0 3.2-.8 4.5-2.3"/><path d="M7 12c-1.2-1.2-2-2.3-2-3.6 0-1.4 1.1-2.4 2.4-2.4 1 0 1.8.6 2.6 1.4"/><path d="M17 12c1.2-1.2 2-2.3 2-3.6 0-1.4-1.1-2.4-2.4-2.4-1 0-1.8.6-2.6 1.4"/></svg>`
  const lbl={swapped:`${dn}Swap completed!`,otp_pending:`${lck}OTP Required`,accepted:`${chk}Accepted`,declined:'❌ Declined',cancelled:'🚫 Cancelled',pending:'⏳ Pending'}
  const isOwn=s.owner_id===me.id
  if(s.status==='swapped')bot.innerHTML=`<div class="sc-status swapped">${dn}Swap completed!</div>`
  else if(s.status==='otp_pending'||s.status==='accepted')bot.innerHTML=`<div class="sc-acts"><button class="btn-accept" onclick="openOtpModal('${s.id}',event)">${lck}Enter OTP</button></div>`
  else if(s.status!=='pending')bot.innerHTML=`<div class="sc-status ${s.status}">${lbl[s.status]||s.status}</div>`
  else if(isOwn)bot.innerHTML=`<div class="sc-acts"><button class="btn-accept" onclick="respSwap('${s.id}','accepted')">✓ Accept</button><button class="btn-decline" onclick="respSwap('${s.id}','declined')">✗ Decline</button></div>`
  else bot.innerHTML=`<button class="btn-cancel-swap" onclick="respSwap('${s.id}','cancelled')">Cancel Request</button>`
}

window.sendMsg=async function(){
  const inp=document.getElementById('chInp'),body=inp.value.trim()
  if(!body&&!pendImgs.length)return;if(!pid)return
  document.getElementById('sendBtn').disabled=true
  for(const f of pendImgs){const ext=f.name.split('.').pop(),path=`chat/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const{error:ue}=await supabase.storage.from('item-images').upload(path,f,{upsert:false});if(!ue){const{data:{publicUrl}}=supabase.storage.from('item-images').getPublicUrl(path);await supabase.from('messages').insert({from_user_id:me.id,to_user_id:pid,item_id:itmId||null,body:publicUrl,msg_type:'image',read:false})}}
  pendImgs=[];document.getElementById('imgStrip').innerHTML='';document.getElementById('imgStrip').classList.remove('show')
  if(body){const{data:nm}=await supabase.from('messages').insert({from_user_id:me.id,to_user_id:pid,item_id:itmId||null,body,msg_type:'text',read:false}).select().single();if(nm){const{data:ptnr}=await supabase.from('profiles').select('*').eq('id',pid).single();appendMsg(nm,ptnr,true);const c=convs.find(c=>c.partner.id===pid);if(c){c.last=nm;renderIb(convs)}}}
  inp.value='';autoRz(inp);document.getElementById('sendBtn').disabled=false;inp.focus()
}

window.respSwap=async function(sid,ns){
  const cl={accepted:'Accept this swap?',declined:'Decline this swap?',cancelled:'Cancel your swap request?'}
  if(!confirm(cl[ns]))return
  if(ns==='declined'||ns==='cancelled')await refundSwapPts(sid)
  const{error:swErr}=await supabase.from('swaps').update({status:ns==='accepted'?'otp_pending':ns}).eq('id',sid)
  if(swErr){showToast('❌ Failed: '+swErr.message);return}
  const bm={accepted:'Swap accepted! Use the OTP button to confirm.',declined:'❌ Swap declined.',cancelled:'🚫 Swap cancelled.'}
  const mt=ns==='accepted'?'swap_accepted':ns==='declined'?'swap_declined':'swap_cancelled'
  await supabase.from('messages').insert({from_user_id:me.id,to_user_id:pid,body:bm[ns],msg_type:mt,swap_id:sid,read:false})
  if(sw){sw.status=ns==='accepted'?'otp_pending':ns;renderBanner(sw);if(currentItemData)renderItemContextBar(currentItemData,sw)}
  document.querySelectorAll(`.sc[data-sid="${sid}"]`).forEach(c=>updateCard(c,{...sw,status:ns==='accepted'?'otp_pending':ns}))
  updSwapPanelBtn();renderSwapPanel()
  showToast({accepted:'Swap accepted!',declined:'Swap declined.',cancelled:'Swap cancelled.'}[ns])
  await loadAllSwaps();renderSwapList()
  if(ns==='accepted')openOtpModal(sid,null)
}

function gen4(){return String(Math.floor(1000+Math.random()*9000))}

window.openOtpModal=async function(swapId,e){
  if(e)e.stopPropagation();currentSwapId=swapId
  const{data:swapRow}=await supabase.from('swaps').select('id,requester_id,owner_id,otp_requester,otp_owner,status,offered_pts').eq('id',swapId).single()
  if(!swapRow){showToast('Could not load swap.');return}
  const amRequester=swapRow.requester_id===me.id,myField=amRequester?'otp_requester':'otp_owner',storeKey=`suot_otp_${swapId}_${me.id}`
  let code=localStorage.getItem(storeKey)||swapRow[myField]
  if(!code){code=gen4();localStorage.setItem(storeKey,code);await supabase.from('swaps').update({[myField]:code,status:'otp_pending'}).eq('id',swapId)}
  else{localStorage.setItem(storeKey,code);const ud={};if(!swapRow[myField])ud[myField]=code;if(swapRow.status!=='otp_pending'&&swapRow.status!=='swapped')ud.status='otp_pending';if(Object.keys(ud).length)await supabase.from('swaps').update(ud).eq('id',swapId)}
  myOtpCode=code
  document.getElementById('otpMain').style.display='block';document.getElementById('otpSuccess').style.display='none'
  document.getElementById('otpMyCode').textContent=code
  document.querySelectorAll('#otpInputs input').forEach(i=>{i.value='';i.classList.remove('filled')})
  document.getElementById('otpVerifyBtn').disabled=true
  document.getElementById('otpOverlay').classList.add('open')
}

window.closeOtp=function(){document.getElementById('otpOverlay').classList.remove('open');myOtpCode=null;currentSwapId=null}
window.copyOtp=function(){if(myOtpCode)navigator.clipboard.writeText(myOtpCode).then(()=>showToast('Code copied!')).catch(()=>showToast('Code: '+myOtpCode))}
window.otpInput=function(el,idx){el.value=el.value.replace(/\D/g,'').slice(-1);el.classList.toggle('filled',el.value!=='');if(el.value&&idx<3)document.querySelectorAll('#otpInputs input')[idx+1]?.focus();document.getElementById('otpVerifyBtn').disabled=[...document.querySelectorAll('#otpInputs input')].some(i=>i.value==='')}
window.otpKey=function(el,e,idx){if(e.key==='Backspace'&&!el.value&&idx>0)document.querySelectorAll('#otpInputs input')[idx-1]?.focus()}

window.verifyOtp=async function(){
  const entered=[...document.querySelectorAll('#otpInputs input')].map(i=>i.value).join('')
  if(!currentSwapId)return
  const{data:swapRow}=await supabase.from('swaps').select('otp_requester,otp_owner,requester_id,owner_id').eq('id',currentSwapId).single()
  if(!swapRow){showToast('Could not verify.');return}
  const amRequester=swapRow.requester_id===me.id
  const partnerCode=amRequester?swapRow.otp_owner:swapRow.otp_requester
  const myStoredCode=amRequester?swapRow.otp_requester:swapRow.otp_owner
  if(!myStoredCode){showToast('Generate your code first.');return}
  if(!partnerCode){showToast("Partner hasn't generated their code yet.");return}
  if(entered!==partnerCode){showToast('❌ Wrong code — check with your swap partner.');return}
  await transferSwapPts(currentSwapId)
  const{data:swapFull2}=await supabase.from('swaps').select('requester_id,owner_id,offered_pts,requested_pts').eq('id',currentSwapId).single()
  if(swapFull2){if(swapFull2.offered_pts>0)await earnPtsFromSwap(swapFull2.owner_id,swapFull2.offered_pts,`Earned from swap #${currentSwapId}`);if(swapFull2.requested_pts>0)await earnPtsFromSwap(swapFull2.requester_id,swapFull2.requested_pts,`Earned from swap #${currentSwapId}`)}
  await supabase.from('swaps').update({status:'swapped'}).eq('id',currentSwapId)
  const{data:swapFull}=await supabase.from('swaps').select('requested_item_id,offered_item_id').eq('id',currentSwapId).single()
  if(swapFull){const updates=[supabase.from('items').update({status:'swapped'}).eq('id',swapFull.requested_item_id)];if(swapFull.offered_item_id)updates.push(supabase.from('items').update({status:'swapped'}).eq('id',swapFull.offered_item_id));await Promise.all(updates)}
  await supabase.from('messages').insert({from_user_id:me.id,to_user_id:pid,body:'Swap confirmed! Both codes matched. Items are now marked as swapped.',msg_type:'swap_swapped',swap_id:currentSwapId,read:false})
  localStorage.removeItem(`suot_otp_${currentSwapId}_${me.id}`)
  if(sw){sw.status='swapped';renderBanner(sw);if(currentItemData){currentItemData.status='swapped';renderItemContextBar(currentItemData,sw)}}
  document.querySelectorAll(`.sc[data-sid="${currentSwapId}"]`).forEach(c=>updateCard(c,{...sw,status:'swapped'}))
  await loadAllSwaps();renderSwapList()
  document.getElementById('otpMain').style.display='none';document.getElementById('otpSuccess').style.display='flex'
}

window.reactTo=async function(mid,emoji){
  document.querySelectorAll('.ep.open').forEach(p=>p.classList.remove('open'))
  const{data:m}=await supabase.from('messages').select('reactions').eq('id',mid).single()
  const rx=m?.reactions||{};if(!rx[emoji])rx[emoji]=[];const i=rx[emoji].indexOf(me.id);if(i>-1)rx[emoji].splice(i,1);else rx[emoji].push(me.id);if(!rx[emoji].length)delete rx[emoji]
  await supabase.from('messages').update({reactions:rx}).eq('id',mid)
  const strip=document.getElementById(`rx-${mid}`);if(strip)strip.innerHTML=rxHTML(rx,mid)
}
window.openEp=function(mid,btn){const ep=document.getElementById(`ep-${mid}`);if(!ep)return;document.querySelectorAll('.ep.open').forEach(p=>{if(p!==ep)p.classList.remove('open')});ep.classList.toggle('open')}
document.addEventListener('click',e=>{if(!e.target.closest('.mac')&&!e.target.closest('.ep'))document.querySelectorAll('.ep.open').forEach(p=>p.classList.remove('open'))})

window.handleImgs=function(input){const files=[...input.files];if(!files.length)return;pendImgs.push(...files);const strip=document.getElementById('imgStrip');strip.classList.add('show');files.forEach((f,i)=>{const r=new FileReader();r.onload=ev=>{const t=document.createElement('div');t.className='img-th';t.innerHTML=`<img src="${ev.target.result}"/><button class="img-rm" onclick="rmImg(${pendImgs.length-files.length+i})">×</button>`;strip.appendChild(t)};r.readAsDataURL(f)});input.value=''}
window.rmImg=function(i){pendImgs.splice(i,1);const s=document.getElementById('imgStrip');s.querySelectorAll('.img-th')[i]?.remove();if(!pendImgs.length)s.classList.remove('show')}
window.openLb=function(src){document.getElementById('lbImg').src=src;document.getElementById('lb').classList.add('open')}
window.closeLb=function(){document.getElementById('lb').classList.remove('open')}
window.toggleEq=function(){document.getElementById('eqBar').classList.toggle('show')}
window.insE=function(e){const i=document.getElementById('chInp');i.value+=e;i.focus()}
window.onKey=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();window.sendMsg()};if(e.key==='Escape')document.getElementById('eqBar').classList.remove('show')}
window.onInp=function(el){autoRz(el);document.getElementById('eqBar').classList.remove('show')}

function updBadge(){const t=convs.filter(c=>c.unread>0).length,b=document.getElementById('navBadge');if(t>0){b.textContent=t;b.style.display='flex'}else b.style.display='none'}
function updMsgTabBadge(){const t=convs.filter(c=>c.unread>0).length,b=document.getElementById('msgTabBadge');if(t>0){b.textContent=t;b.style.display='flex'}else b.style.display='none'}
function updSwapTabBadge(){const t=allSwaps.filter(s=>s.status==='pending'&&s.owner_id===me.id).length,b=document.getElementById('swapTabBadge');if(t>0){b.textContent=t;b.style.display='flex'}else b.style.display='none'}
function scrollB(){const e=document.getElementById('chMsgs');e.scrollTop=e.scrollHeight}
function autoRz(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px'}
function av(name){return`https://ui-avatars.com/api/?name=${encodeURIComponent(name||'U')}&background=EBE0E3&color=C994A7&size=100`}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}
function ago(iso){if(!iso)return'';const d=Date.now()-new Date(iso).getTime(),m=Math.floor(d/60000),h=Math.floor(d/3600000),dy=Math.floor(d/86400000);if(m<1)return'now';if(m<60)return m+'m';if(h<24)return h+'h';if(dy<7)return dy+'d';return new Date(iso).toLocaleDateString('en-PH',{month:'short',day:'numeric'})}
function fmtDate(iso){const d=new Date(iso),t=new Date();if(d.toDateString()===t.toDateString())return'Today';const y=new Date(t);y.setDate(t.getDate()-1);if(d.toDateString()===y.toDateString())return'Yesterday';return d.toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'})}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200)}
window.doLogout=async function(){if(confirm('Log out?')){await supabase.auth.signOut();location.href='../auth/login.html'}}