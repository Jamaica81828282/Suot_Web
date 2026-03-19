
    import { supabase, saveTopup } from '../db/supabase.js'

    let selectedPts = 0, selectedPhp = 0, selectedMethod = '', currentBalance = 0

    ;(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { window.location.href = '../auth/login.html'; return }
        const { data: p } = await supabase.from('profiles').select('username,display_name,avatar_url,pts').eq('id', session.user.id).single()
        if (p) {
            const name = p.display_name || p.username || 'Swapper'
            document.getElementById('profileName').textContent = name
            document.getElementById('userAvatar').src = p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7`
            currentBalance = p.pts || 0
            document.getElementById('balanceDisplay').textContent = currentBalance.toLocaleString() + ' pts'
        }
    })()

    window.selectPack = function(el) {
        document.querySelectorAll('.pack-card').forEach(c => c.classList.remove('selected'))
        el.classList.add('selected')
        selectedPts = parseInt(el.dataset.pts); selectedPhp = parseFloat(el.dataset.php)
        document.getElementById('customAmt').value = ''
        document.getElementById('customPtsPreview').textContent = '—'
        document.getElementById('customPhpPreview').textContent = '₱0.00'
        document.getElementById('nextBtn1').disabled = false
        updateSummary()
    }

    window.onCustomInput = function() {
        const val = parseFloat(document.getElementById('customAmt').value)
        document.querySelectorAll('.pack-card').forEach(c => c.classList.remove('selected'))
        if (val && val >= 50) {
            const total = val * 1.05
            selectedPts = Math.floor(val); selectedPhp = parseFloat(total.toFixed(2))
            document.getElementById('customPtsPreview').textContent = selectedPts.toLocaleString() + ' pts'
            document.getElementById('customPhpPreview').textContent = '₱' + total.toFixed(2)
            document.getElementById('nextBtn1').disabled = false
            updateSummary()
        } else {
            selectedPts = 0; selectedPhp = 0
            document.getElementById('customPtsPreview').textContent = '—'
            document.getElementById('customPhpPreview').textContent = '₱0.00'
            document.getElementById('nextBtn1').disabled = true
        }
    }

    window.selectMethod = function(el) {
        document.querySelectorAll('.method-card').forEach(c => c.classList.remove('selected'))
        el.classList.add('selected'); selectedMethod = el.dataset.method
        document.getElementById('nextBtn2').disabled = false
    }

    function updateSummary() {
        const base = (selectedPhp / 1.05).toFixed(2)
        const tax  = (selectedPhp - parseFloat(base)).toFixed(2)
        ;['','2'].forEach(s => {
            const get = id => document.getElementById(id + s)
            if (get('summaryPts'))   get('summaryPts').textContent   = selectedPts.toLocaleString() + ' pts'
            if (get('summaryBase'))  get('summaryBase').textContent  = '₱' + parseFloat(base).toLocaleString('en-PH',{minimumFractionDigits:2})
            if (get('summaryTax'))   get('summaryTax').textContent   = '₱' + parseFloat(tax).toLocaleString('en-PH',{minimumFractionDigits:2})
            if (get('summaryTotal')) get('summaryTotal').textContent = '₱' + selectedPhp.toLocaleString('en-PH',{minimumFractionDigits:2})
        })
        document.getElementById('confirmAmt').textContent = '— ₱' + selectedPhp.toLocaleString('en-PH',{minimumFractionDigits:2})
    }

    function renderDetailsForm() {
        const wrap = document.getElementById('detailsForm')
        const titles = { gcash:'GCash Details', maya:'Maya Details', card:'Card Details', bank:'Bank Details', otc:'Payment Details' }
        const bannerInfo = `<div class="info-banner"><div class="info-banner-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>`
        const bannerWarm = `<div class="info-banner warm"><div class="info-banner-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`
        const forms = {
            gcash: `${bannerInfo}<div><strong>GCash Instructions</strong>Enter your registered GCash mobile number. You'll receive a payment prompt on your GCash app.</div></div><div class="form-field"><label>GCash Mobile Number</label><input type="tel" placeholder="09XX XXX XXXX" maxlength="11"></div><div class="form-field"><label>Account Name (optional)</label><input type="text" placeholder="Name on your GCash account"></div>`,
            maya:  `${bannerInfo}<div><strong>Maya Instructions</strong>Enter your Maya-registered number. You'll receive a payment request on your app.</div></div><div class="form-field"><label>Maya Mobile Number</label><input type="tel" placeholder="09XX XXX XXXX" maxlength="11"></div>`,
            card:  `<div class="form-field"><label>Cardholder Name</label><input type="text" placeholder="Full name as on card"></div><div class="form-field"><label>Card Number</label><input type="text" id="f_card" placeholder="0000 0000 0000 0000" maxlength="19" oninput="formatCard(this)"></div><div class="form-row"><div class="form-field"><label>Expiry Date</label><input type="text" placeholder="MM / YY" maxlength="7"></div><div class="form-field"><label>CVV</label><input type="password" placeholder="•••" maxlength="4"></div></div>`,
            bank:  `<div class="form-field"><label>Select Bank</label><select><option value="" disabled selected>Choose your bank</option><option>BDO Unibank</option><option>BPI</option><option>UnionBank</option><option>Metrobank</option><option>Security Bank</option><option>PNB</option><option>Landbank</option></select></div><div class="form-field"><label>Account Number</label><input type="text" placeholder="Your bank account number"></div>`,
            otc:   `${bannerWarm}<div><strong>Over-the-Counter Payment</strong>A reference number will be generated. Bring it to any partner outlet (7-Eleven, Bayad Center) within 24 hours.</div></div><div class="form-field"><label>Your Name</label><input type="text" placeholder="Full name for reference"></div><div class="form-field"><label>Email for Receipt</label><input type="email" placeholder="you@email.com"></div>`
        }
        wrap.innerHTML = `<div class="form-section-title">${titles[selectedMethod] || 'Payment Details'}</div>` + (forms[selectedMethod] || '')
    }

    window.formatCard = function(el) {
        let v = el.value.replace(/\D/g,'').substring(0,16)
        el.value = v.replace(/(.{4})/g,'$1 ').trim()
    }

    window.goToStep = function(n) {
        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'))
        document.getElementById('panel-' + n).classList.add('active')
        for (let i = 1; i <= 4; i++) {
            const ind  = document.getElementById('step-indicator-' + i)
            const line = document.getElementById('line-' + i)
            if      (i < n)  { ind.classList.add('done');   ind.classList.remove('active') }
            else if (i === n) { ind.classList.add('active'); ind.classList.remove('done')  }
            else              { ind.classList.remove('active','done') }
            if (line) line.classList.toggle('done', i < n)
        }
        if (n === 2 || n === 3) updateSummary()
        if (n === 3) renderDetailsForm()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    window.confirmPayment = async function() {
        const btn = document.getElementById('confirmBtn')
        btn.disabled = true
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .7s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>&nbsp;Processing…`
        try {
            const newBal = await saveTopup({ pts: selectedPts, amountPhp: selectedPhp, method: selectedMethod })
            currentBalance = newBal
            document.getElementById('balanceDisplay').textContent = newBal.toLocaleString() + ' pts'
            document.getElementById('successPtsLabel').textContent = '+' + selectedPts.toLocaleString() + ' pts'
            document.getElementById('successBalLabel').textContent = 'New balance: ' + newBal.toLocaleString() + ' pts'
            goToStep(4)
        } catch (err) {
            console.error('Topup failed:', err)
            showToast('Top-up failed: ' + (err.message || 'Unknown error'), true)
            btn.disabled = false
            btn.innerHTML = `Confirm &amp; Pay <span id="confirmAmt"></span> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`
            updateSummary()
        }
    }

    function showToast(msg, isError = false) {
        const t = document.getElementById('toast')
        t.textContent = msg; t.className = 'toast show' + (isError ? ' error' : '')
        setTimeout(() => t.className = 'toast', 3500)
    }
