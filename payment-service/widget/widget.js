/* ============================================================================
 * unipay widget.js — embeddable privacy checkout.
 * Mount: YourPay.mount('#checkout', { token: 'wt_...', theme: {...} })
 * ==========================================================================*/
(function () {
  'use strict';

  const IRREVERSIBLE = 'Once submitted, payments are immediately applied and non-refundable.';

  const css = `
  :host { all: initial; }
  .upw { font-family: var(--pay-font, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif); 
         background: var(--pay-bg, #ffffff); color: var(--pay-fg, #1a1a2e); 
         border-radius: var(--pay-radius, 12px); border: 1px solid var(--pay-border, #e4e4ef); 
         max-width: 460px; width: 100%; overflow: hidden; box-sizing: border-box; 
         box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
  .upw * { box-sizing: border-box; }
  .upw-head { padding: 16px 20px; border-bottom: 1px solid var(--pay-border, #e4e4ef); background: #fcfcfd; }
  .upw-head-main { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .upw-amount { font-size: 22px; font-weight: 700; color: #0f172a; }
  .upw-expiry { font-size: 12px; opacity: .6; font-family: monospace; }
  
  /* SPLIT BALANCE PROGRESS BAR UI */
  .upw-balance-bar { width: 100%; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .upw-balance-fill { background: var(--pay-accent, #6d5df6); height: 100%; transition: width 0.4s ease; }
  .upw-balance-text { display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; font-weight: 600; color: #475569; }

  .upw-tabs { display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--pay-border, #e4e4ef); background: #fafafa; }
  .upw-tab { flex: 1; min-width: 25%; padding: 12px 6px; font-size: 12px; background: none; border: none;
             cursor: pointer; color: inherit; opacity: .65; border-bottom: 2px solid transparent; transition: all 0.2s; }
  .upw-tab.on { opacity: 1; border-bottom-color: var(--pay-accent, #6d5df6); font-weight: 600; background: #fff; }
  .upw-tab:disabled { opacity: .3; cursor: not-allowed; }
  .upw-body { padding: 20px; }
  .upw-h { font-size: 15px; font-weight: 600; margin: 0 0 8px; color: #0f172a; }
  .upw-sub { font-size: 13px; margin: 0 0 14px; color: #475569; line-height: 1.5; }
  .upw-warn { background: var(--pay-warn-bg, #fffbe6); border: 1px solid var(--pay-warn-border, #ffe58f);
              color: var(--pay-warn-fg, #d48806); border-radius: 8px; padding: 10px 12px; font-size: 12px;
              margin: 12px 0; line-height: 1.5; }
  .upw-irrev { color: var(--pay-danger, #cf1322); font-size: 12px; margin: 10px 0; font-weight: 500; }
  .upw-field { width: 100%; padding: 11px 12px; font-size: 14px; border-radius: 8px; margin-bottom: 12px;
               border: 1px solid var(--pay-border, #cbd5e1); background: var(--pay-input-bg, #fff); color: inherit; outline: none; }
  .upw-field:focus { border-color: var(--pay-accent, #6d5df6); }
  .upw-btn { width: 100%; padding: 12px; font-size: 14px; font-weight: 600; border: none; border-radius: 8px;
             background: var(--pay-accent, #6d5df6); color: var(--pay-accent-fg, #fff); cursor: pointer; transition: background 0.2s; }
  .upw-btn:hover { opacity: 0.95; }
  .upw-btn:disabled { opacity: .5; cursor: not-allowed; }
  .upw-btn.ghost { background: transparent; color: var(--pay-accent, #6d5df6);
                   border: 1px solid var(--pay-accent, #6d5df6); margin-top: 8px; }
  .upw-btn.ghost:hover { background: #f8fafc; }
  .upw-qr { text-align: center; padding: 12px 0; }
  .upw-addr { font-family: monospace; font-size: 11px; word-break: break-all; background: var(--pay-input-bg, #f8fafc);
              padding: 10px; border-radius: 8px; margin: 10px 0; user-select: all; border: 1px solid #e2e8f0; }
  .upw-net { font-size: 16px; font-weight: 700; text-align: center; letter-spacing: .5px; color: #1e293b; }
  .upw-copy { width: 100%; margin-top: 6px; }
  .upw-status { text-align: center; padding: 24px 8px; }
  .upw-status .big { font-size: 44px; margin-bottom: 8px; }
  .upw-status h3 { margin: 6px 0; font-size: 18px; color: #0f172a; }
  .upw-status p { font-size: 13px; color: #64748b; margin: 4px 0; }
  .upw-pin { display: flex; gap: 6px; margin-bottom: 12px; }
  .upw-pin input { width: 25%; text-align: center; font-size: 16px; letter-spacing: 2px; padding: 10px 4px; font-weight: 600; }
  .upw-tiers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
  .upw-tier { border: 2px solid var(--pay-border, #e2e8f0); border-radius: 10px; padding: 12px; cursor: pointer; text-align: center; background: #fff; }
  .upw-tier.on { border-color: var(--pay-accent, #6d5df6); background: #f8fafc; }
  .upw-tier b { display: block; font-size: 13px; color: #0f172a; } 
  .upw-tier span { font-size: 11px; opacity: .75; }
  .upw-credit { background: var(--pay-ok-bg, #f0fdf4); border: 1px solid var(--pay-ok-border, #bbf7d0);
                color: var(--pay-ok-fg, #166534); border-radius: 8px; padding: 10px 12px; font-size: 13px; margin: 12px 0; line-height: 1.4; }
  .upw-photo-tip { font-size: 12px; color: #475569; line-height: 1.5; margin: 8px 0; }
  .upw-photo { width: 100%; padding: 14px; border: 2px dashed var(--pay-border, #cbd5e1); border-radius: 10px;
               text-align: center; cursor: pointer; font-size: 13px; background: #f8fafc; display: block; }
  .upw-photo img { max-width: 100%; border-radius: 8px; margin-top: 8px; }
  .upw-err { color: var(--pay-danger, #cf1322); font-size: 12px; margin: 8px 0; font-weight: 500; }
  .upw-steps { display: flex; gap: 6px; margin-bottom: 16px; }
  .upw-steps i { flex: 1; height: 4px; border-radius: 2px; background: var(--pay-border, #e2e8f0); }
  .upw-steps i.on { background: var(--pay-accent, #6d5df6); }
  `;

  const STATUS_UI = {
    AWAITING_PAYMENT: { icon: '⏳', label: 'Awaiting payment' },
    PARTIALLY_PAID: { icon: '💳', label: 'Partial payment received' },
    DETECTED: { icon: '👀', label: 'Payment detected' },
    CONFIRMING: { icon: '⛓️', label: 'Confirming on network…' },
    COMPLETED: { icon: '✅', label: 'Payment complete' },
    DISPUTED: { icon: '⚠️', label: 'Under review' },
    EXPIRED: { icon: '🕑', label: 'Session expired' },
    FAILED: { icon: '❌', label: 'Payment failed' },
  };

  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class Widget {
    constructor(el, opts) {
      this.opts = opts;
      this.token = opts.token;
      if (opts.baseUrl) {
        this.base = opts.baseUrl.replace(/\/$/, '');
      } else {
        const src = document.currentScript && document.currentScript.src;
        this.base = src ? new URL(src).origin : window.location.origin;
      }
      this.rail = null;
      this.cfg = null;
      this.poll = null;
      this.root = document.createElement('div');
      (el instanceof Element ? el : document.querySelector(el)).appendChild(this.root);
      this.mount();
    }

    async api(path, opts = {}) {
      const res = await fetch(this.base + path, {
        ...opts,
        headers: { authorization: `Bearer ${this.token}`, ...(opts.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    async mount() {
      this.cfg = await this.api(`/api/widget/${this.token}`);
      // Fallback balance assignments if missing from backend initial config
      this.cfg.amount_paid_usd = parseFloat(this.cfg.amount_paid_usd || 0);
      this.cfg.remaining_balance_usd = parseFloat(this.cfg.remaining_balance_usd ?? this.cfg.amount_usd);

      // Notify backend that the widget has been opened (triggers admin notification)
      fetch(`${this.base}/sdk/opened`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          site_id: this.cfg.site_id || 'unknown',
          item_type: this.cfg.item_type || 'Checkout',
          amount_usd: this.cfg.amount_usd
        })
      }).catch(() => { });

      const shadow = this.root.attachShadow({ mode: 'open' });
      const style = document.createElement('style'); style.textContent = css;
      this.shell = h(`<div class="upw" role="dialog" aria-label="Checkout"></div>`);
      shadow.append(style, this.shell);
      if (this.opts.theme) for (const [k, v] of Object.entries(this.opts.theme)) this.shell.style.setProperty(k, v);
      this.renderTabs('CRYPTO');
      this.startStream();
    }

    startStream() {
      try {
        const es = new EventSource(`${this.base}/api/widget/${this.token}/events`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.amount_paid_usd !== undefined) {
            this.updateBalances(data.amount_paid_usd, data.remaining_balance_usd);
          }
          this.onStatus(data.status);
        };
        es.onerror = () => { es.close(); this.startPolling(); };
      } catch { this.startPolling(); }
    }

    startPolling() {
      clearInterval(this.poll);
      this.poll = setInterval(async () => {
        try {
          const res = await this.api(`/api/widget/${this.token}/status`);
          if (res.amount_paid_usd !== undefined) {
            this.updateBalances(res.amount_paid_usd, res.remaining_balance_usd);
          }
          this.onStatus(res.status);
        } catch { }
      }, 4000);
    }

    updateBalances(paid, remaining) {
      this.cfg.amount_paid_usd = parseFloat(paid);
      this.cfg.remaining_balance_usd = parseFloat(remaining);

      // Update dynamic DOM elements if currently rendered
      const fill = this.shell.querySelector('#upw-bar-fill');
      const paidEl = this.shell.querySelector('#upw-paid-text');
      const remEl = this.shell.querySelector('#upw-rem-text');

      const percentage = Math.min(100, Math.max(0, (this.cfg.amount_paid_usd / this.cfg.amount_usd) * 100));
      if (fill) fill.style.width = `${percentage}%`;
      if (paidEl) paidEl.textContent = `$${this.cfg.amount_paid_usd.toFixed(2)} Paid`;
      if (remEl) remEl.textContent = `$${this.cfg.remaining_balance_usd.toFixed(2)} Remaining`;
    }

    onStatus(status) {
      if (['COMPLETED', 'EXPIRED', 'FAILED', 'DISPUTED'].includes(status)) {
        clearInterval(this.poll);
        this.renderStatus(status);
      }
    }

    /* ---------------- Outer Chrome & Dynamic Split Progress Bar ---------------- */
    renderTabs(active) {
      const TABS = [
        ['CRYPTO', 'Crypto'], ['GIFTCARD', 'Gift Card'],
        ['VOUCHER', 'Cash Voucher'], ['CARD', 'Card Guide'],
      ];

      const percentage = Math.min(100, Math.max(0, (this.cfg.amount_paid_usd / this.cfg.amount_usd) * 100));
      const lockMsg = this.rail
        ? `<div class="upw-warn">Active ${esc(this.rail)} transaction in progress. Other payment options are locked to prevent double charges.</div>` : '';

      this.shell.innerHTML = `
        <div class="upw-head">
          <div class="upw-head-main">
            <div class="upw-amount">${esc(this.cfg.currency)} ${esc(this.cfg.amount_usd)}</div>
            <div class="upw-expiry">Order #${esc(this.cfg.order_id.slice(0, 8))}</div>
          </div>
          <div class="upw-balance-bar">
            <div class="upw-balance-fill" id="upw-bar-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="upw-balance-text">
            <span id="upw-paid-text">$${this.cfg.amount_paid_usd.toFixed(2)} Paid</span>
            <span id="upw-rem-text">$${this.cfg.remaining_balance_usd.toFixed(2)} Remaining</span>
          </div>
        </div>
        <div class="upw-tabs">${TABS.map(([id, label]) =>
        `<button class="upw-tab ${id === active ? 'on' : ''}" data-tab="${id}" ${this.rail && id !== active ? 'disabled' : ''}>${label}</button>`).join('')}
        </div>
        <div class="upw-body">${lockMsg}<div class="upw-content"></div></div>`;

      this.shell.querySelectorAll('.upw-tab').forEach(b =>
        b.addEventListener('click', () => !b.disabled && this.renderTabs(b.dataset.tab)));
      this.content = this.shell.querySelector('.upw-content');
      ({ CRYPTO: this.tabCrypto, GIFTCARD: this.tabGiftcard, VOUCHER: this.tabVoucher, CARD: this.tabCard })[active].call(this);
    }

    renderStatus(status) {
      const ui = STATUS_UI[status] || { icon: 'ℹ️', label: status };
      this.content.innerHTML = `
        <div class="upw-status">
          <div class="big">${ui.icon}</div>
          <h3>${ui.label}</h3>
          <p>Order Reference: ${esc(this.cfg.order_id)}</p>
          ${status === 'COMPLETED' ? '<p>Please capture a screenshot of this window as your payment receipt.</p>' : ''}
          ${status === 'DISPUTED' ? '<p>Your submission is undergoing manual review. No further action is required.</p>' : ''}
        </div>`;
    }

    /* ---------------- Tab 1: Bitcoin / Crypto ---------------- */
    tabCrypto() {
      this.content.innerHTML = `
        <p class="upw-h">Pay with Cryptocurrency</p>
        <p class="upw-sub">Instant settlement via Lightning Network, or standard transfer via on-chain Bitcoin.</p>
        <button class="upw-btn" data-m="LNBITS_LIGHTNING">⚡ Lightning Network (Instant)</button>
        <button class="upw-btn ghost" data-m="PHOENIXD_ONCHAIN">₿ Bitcoin On-Chain</button>
        <div class="upw-pay"></div>`;
      this.content.querySelectorAll('[data-m]').forEach(b =>
        b.addEventListener('click', () => this.startInvoice(b.dataset.m)));
    }

    async startInvoice(method) {
      const box = this.content.querySelector('.upw-pay');
      box.innerHTML = '<p class="upw-sub" style="margin-top:10px">Generating secure payment address…</p>';
      try {
        const inv = await this.api(`/v1/widget/${this.token}/invoice`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method }),
        });
        this.rail = 'Bitcoin';
        const isLn = method === 'LNBITS_LIGHTNING';
        box.innerHTML = `
          <div class="upw-net" style="margin-top:12px">${isLn ? '⚡ LIGHTNING NETWORK' : '₿ BITCOIN ON-CHAIN'}</div>
          <div class="upw-qr"><div id="upw-qr"></div></div>
          <div class="upw-addr">${esc(inv.address)}</div>
          <button class="upw-btn upw-copy">Copy ${isLn ? 'Invoice' : 'Address'}</button>
          <div class="upw-credit">Send the exact balance amount. Incoming transfers will update your remaining balance automatically.</div>
          ${!isLn ? `<div class="upw-warn">Send native BTC on-chain only. Do not send Lightning payments to this address.</div>` : ''}
          <p class="upw-sub" style="text-align:center;margin-top:10px">Awaiting transfer confirmation… You may leave this modal open while processing.</p>`;
        this.renderQr(inv.address);
        box.querySelector('.upw-copy').addEventListener('click', (e) =>
          navigator.clipboard.writeText(inv.address).then(() => { e.target.textContent = 'Copied to Clipboard ✓'; }));
        this.renderTabs('CRYPTO');
      } catch (e) { box.innerHTML = `<p class="upw-err">${esc(e.message)}</p>`; }
    }

    renderQr(text) {
      const el = this.shell.querySelector('#upw-qr');
      if (el) el.innerHTML = `<a href="${esc(text)}" style="font-size:13px;color:#6d5df6;text-decoration:none">Open in Wallet App ↗</a>`;
    }

    /* ---------------- Tab 2: Gift Card Stacking (Exact Value Input) ---------------- */
    tabGiftcard() {
      const brands = this.cfg.brands || ['Amazon', 'Apple', 'Steam'];
      const rates = this.cfg.rates || { PHOTO_RATE: { Amazon: 0.8, Apple: 0.8, Steam: 0.8 }, ECODE_RATE: { Amazon: 0.7, Apple: 0.7, Steam: 0.7 } };
      const state = { step: 0, brand: null, value: null, tier: null };
      const steps = () => `<div class="upw-steps">${[0, 1, 2, 3].map(i => `<i class="${i <= state.step ? 'on' : ''}"></i>`).join('')}</div>`;

      const draw = () => {
        // Step 0: Select Brand
        if (state.step === 0) {
          this.content.innerHTML = `${steps()}
            <p class="upw-h">Select Gift Card Brand</p>
            <p class="upw-sub">You can apply multiple gift cards to complete your balance.</p>
            ${brands.map(b => `<button class="upw-btn ghost" data-b="${b}" style="margin-top:6px">${b} Gift Card</button>`).join('')}`;
        }

        // Step 1: Input Exact Face Value (No Presets)
        if (state.step === 1) {
          this.content.innerHTML = `${steps()}
            <p class="upw-h">${esc(state.brand)} — Enter Face Value</p>
            <p class="upw-sub">Enter the exact dollar value printed on your card or e-code.</p>
            <input class="upw-field" type="number" id="upw-exact-val" placeholder="Exact Card Amount ($ USD)" step="0.01" min="1">
            <button class="upw-btn" id="upw-val-next" disabled>Continue</button>`;

          const input = this.content.querySelector('#upw-exact-val');
          const btn = this.content.querySelector('#upw-val-next');
          input.focus();
          input.addEventListener('input', () => {
            btn.disabled = !(parseFloat(input.value) > 0);
          });
          btn.addEventListener('click', () => {
            state.value = parseFloat(input.value);
            state.step = 2;
            draw();
          });
        }

        // Step 2: Format / Tier Selection
        if (state.step === 2) {
          const photoRate = (rates.PHOTO_RATE[state.brand] || 0.8) * 100;
          const ecodeRate = (rates.ECODE_RATE[state.brand] || 0.7) * 100;
          this.content.innerHTML = `${steps()}
            <p class="upw-h">Select Card Format</p>
            <div class="upw-tiers">
              <div class="upw-tier" data-t="PHOTO_RATE"><b>📷 Physical Card + Receipt</b>
                <span>${photoRate.toFixed(0)}% Conversion Value</span></div>
              <div class="upw-tier" data-t="ECODE_RATE"><b>⌨️ Digital E-Code Only</b>
                <span>${ecodeRate.toFixed(0)}% Conversion Value</span></div>
            </div>
            <p class="upw-sub">Physical cards submitted with photo verification yield a higher redemption rate.</p>`;
        }

        // Step 3: Code Submission & Live Conversion Calculation
        if (state.step === 3) {
          const rate = rates[state.tier][state.brand] || 0.75;
          const credit = (state.value * rate).toFixed(2);
          const currentRemaining = this.cfg.remaining_balance_usd;
          const coversFull = parseFloat(credit) >= currentRemaining;

          this.content.innerHTML = `${steps()}
            <p class="upw-h">Submit ${esc(state.brand)} Card Details</p>
            ${state.tier === 'PHOTO_RATE' ? `
              <div class="upw-photo-tip">📸 Ensure the full card and scratch-off PIN are clearly visible under bright light. Including the store receipt speeds up verification.</div>
              <label class="upw-photo"><input type="file" accept="image/*" capture="environment" hidden>
                Upload Card Photo <span class="upw-photo-prev"></span></label>` : ''}
            <input class="upw-field" id="upw-code" placeholder="Enter ${state.brand} Claim / Redeem Code" autocomplete="off" style="margin-top:10px">
            <div class="upw-credit">
              Card Face Value: <b>$${state.value.toFixed(2)}</b><br>
              Applied Credit: <b>$${credit} USD</b> 
              ${coversFull ? '<br>✓ Covers your remaining order balance' : `<br>⚠ Applied toward remaining balance ($${(currentRemaining - credit).toFixed(2)} left after redemption)`}
            </div>
            <p class="upw-irrev">⚠ ${IRREVERSIBLE}</p>
            <button class="upw-btn" id="upw-submit">Submit Card for Processing</button>
            <p class="upw-err" id="upw-gc-err"></p>`;

          const file = this.content.querySelector('input[type=file]');
          if (file) file.addEventListener('change', () => {
            const img = this.content.querySelector('.upw-photo-prev');
            if (file.files[0]) img.innerHTML = `<img src="${URL.createObjectURL(file.files[0])}">`;
          });

          this.content.querySelector('#upw-submit')?.addEventListener('click', async () => {
            const err = this.content.querySelector('#upw-gc-err');
            const btn = this.content.querySelector('#upw-submit');
            const codeInput = this.content.querySelector('#upw-code');

            if (!codeInput.value.trim()) {
              err.textContent = 'Please enter a valid card claim code.';
              return;
            }

            const fd = new FormData();
            fd.append('brand', state.brand);
            fd.append('face_value_usd', state.value);
            fd.append('code', codeInput.value.trim());
            fd.append('tier', state.tier);
            if (file?.files[0]) fd.append('photo', file.files[0]);

            btn.disabled = true; err.textContent = '';
            try {
              const r = await this.api(`/v1/widget/${this.token}/giftcard`, { method: 'POST', body: fd });
              this.rail = 'Gift Card';

              // Local state balance update
              if (r.amount_paid_usd !== undefined) {
                this.updateBalances(r.amount_paid_usd, r.remaining_balance_usd);
              }

              this.renderTabs('GIFTCARD');

              if (this.cfg.remaining_balance_usd <= 0) {
                this.renderStatus('COMPLETED');
              } else {
                this.content.innerHTML = `
                  <div class="upw-status">
                    <div class="big">⏳</div>
                    <h3>Card Submitted Successfully</h3>
                    <p>Applied Credit: <b>+$${credit} USD</b></p>
                    <p>Remaining Unpaid Balance: <b>$${this.cfg.remaining_balance_usd.toFixed(2)} USD</b></p>
                    <button class="upw-btn" id="upw-add-another" style="margin-top:14px">Apply Another Card / Voucher</button>
                  </div>`;
                this.content.querySelector('#upw-add-another').addEventListener('click', () => {
                  this.rail = null;
                  this.renderTabs('GIFTCARD');
                });
              }
            } catch (e) { err.textContent = e.message; btn.disabled = false; }
          });
        }

        this.content.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { state.brand = b.dataset.b; state.step = 1; draw(); }));
        this.content.querySelectorAll('[data-t]').forEach(t => t.addEventListener('click', () => { state.tier = t.dataset.t; state.step = 3; draw(); }));
      };
      draw();
    }

    /* ---------------- Tab 3: Cash Vouchers (Multi-PIN Support) ---------------- */
    tabVoucher() {
      this.content.innerHTML = `
        <p class="upw-h">Pay with Cash Voucher</p>
        <p class="upw-sub">Enter the 16-digit PIN from your voucher. It will be sent to the administration queue for manual redemption.</p>
        <div class="upw-pin">${'<input maxlength="4" inputmode="numeric">'.repeat(4)}</div>
        <p class="upw-irrev">⚠ ${IRREVERSIBLE}</p>
        <button class="upw-btn" id="upw-vc-go" disabled>Redeem Voucher</button>
        <p class="upw-err" id="upw-vc-err"></p>`;

      const inputs = [...this.content.querySelectorAll('.upw-pin input')];
      inputs[0].focus();
      inputs.forEach((inp, i) => inp.addEventListener('input', () => {
        if (inp.value.length === 4 && i < 3) inputs[i + 1].focus();
        const pin = inputs.map(x => x.value).join('');
        this.content.querySelector('#upw-vc-go').disabled = pin.length !== 16;
      }));

      this.content.querySelector('#upw-vc-go').addEventListener('click', async () => {
        const pin = inputs.map(x => x.value).join('');
        const btn = this.content.querySelector('#upw-vc-go'), err = this.content.querySelector('#upw-vc-err');
        btn.disabled = true; err.textContent = '';
        try {
          const res = await this.api(`/v1/widget/${this.token}/voucher`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pin, rail: 'VOUCHER' }),
          });

          if (res.amount_paid_usd !== undefined) {
            this.updateBalances(res.amount_paid_usd, res.remaining_balance_usd);
          }

          if (this.cfg.remaining_balance_usd <= 0) {
            this.renderStatus('COMPLETED');
          } else {
            this.content.innerHTML = `
              <div class="upw-status">
                <div class="big">⏳</div>
                <h3>Voucher Submitted for Review</h3>
                <p>Administration will verify and redeem the voucher manually.</p>
                <button class="upw-btn" id="upw-vc-another" style="margin-top:14px">Add Another Voucher or Card</button>
              </div>`;
            this.content.querySelector('#upw-vc-another').addEventListener('click', () => {
              this.rail = null;
              this.renderTabs('VOUCHER');
            });
          }
        } catch (e) { err.textContent = e.message; btn.disabled = false; }
      });
    }

    /* ---------------- Tab 4: Card Purchase Guide ---------------- */
    tabCard() {
      // Force reliable frontend Amazon & Apple gift card URLs
      const egift = [
        { brand: 'Amazon', url: 'https://www.amazon.com/dp/B004LLIKVU' },
        { brand: 'Apple', url: 'https://www.apple.com/shop/buy-giftcard/giftcard' }
      ];

      // Keep dynamic onramps from backend if provided, or fallback
      const onramps = (this.cfg && this.cfg.card_guide && this.cfg.card_guide.onramps) || [
        { name: 'MoonPay', url: 'https://www.moonpay.com' },
        { name: 'Ramp Network', url: 'https://ramp.network' }
      ];

      this.content.innerHTML = `
        <p class="upw-h">Pay with Debit / Credit Card</p>
        <p class="upw-sub">We never handle or process your payment card directly. Select one of the trusted purchase routes below to complete your payment anonymously.</p>
        
        <p class="upw-h" style="margin-top:16px">Option A — Buy an E-Gift Card (Instant)</p>
        ${egift.map(e => `<a class="upw-btn ghost" style="display:block;text-decoration:none;text-align:center" href="${esc(e.url)}" target="_blank" rel="noopener">Buy ${esc(e.brand)} E-Gift Card ↗</a>`).join('')}
        <p class="upw-sub" style="margin-top:8px">Send the digital card to your own email address, then enter the code under the <b>Gift Card</b> tab above.</p>
        
        <p class="upw-h" style="margin-top:16px">Option B — Buy Cryptocurrency with Card</p>
        ${onramps.map(o => `<a class="upw-btn ghost" style="display:block;text-decoration:none;text-align:center" href="${esc(o.url)}" target="_blank" rel="noopener">Buy BTC via ${esc(o.name)} ↗</a>`).join('')}
        <p class="upw-sub" style="margin-top:8px">Purchases settle in ~5 minutes. Send the funds directly using the address provided in the <b>Crypto</b> tab.</p>`;
    }
  }

  window.YourPay = { mount: (el, opts) => new Widget(el, opts) };
})();