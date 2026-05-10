# Base USDT Auto-Payout System

## Ki banabo (summary)

1. **Admin toggle** — USDT auto-payout system on/off
2. **OFF state (default):** ekhon jemne ache temni — user bKash/Nagad e request dibe, admin manually pay korbe
3. **ON state:** user er kache extra option ashbe — USDT (Base network) select korle **instant auto-payout** hobe wallet theke
4. **Per-account USDT rate** admin set korbe → verified count × rate = user er USDT balance
5. **bKash/Nagad** option o thakbe USDT mode e, kintu "late hobe" note sho hobe; USDT te "fast" note + recommended
6. **2% withdraw fee** user theke kete nibo
7. **Min withdraw 0.5 USDT**
8. **Network select** mandatory + Base address warning (Bangla)

---

## Admin Panel e notun jinish

- **Toggle:** "USDT Auto-Payout System" (ON/OFF)
- **USDT rate per verified account** (e.g., 0.05 USDT per account)
- **Min withdraw** (default 0.5)
- **Fee %** (default 2)
- **Hot wallet address** display + balance check
- **Payout history** table (tx hash, status, recipient)

Settings table e store hobe new keys:
- `usdtPayoutEnabled` (true/false)
- `usdtRatePerAccount` (e.g., "0.05")
- `usdtMinWithdraw` (e.g., "0.5")
- `usdtFeePercent` (e.g., "2")

---

## User Withdraw Form (notun flow)

**Yokhon toggle OFF:** ekhon jemne ache — bKash/Nagad tabs + amount input + "request paathao" button (unchanged)

**Yokhon toggle ON:** 

```
┌──────────────────────────────────────┐
│ Apnar USDT Balance: 2.45 USDT        │
│ (Verified accounts: 49 × 0.05)       │
└──────────────────────────────────────┘

Network select korun:
[ USDT — Base ⚡ Fast (Recommended) ]
[ bKash — ⏰ 24 ghonta lagbe ]
[ Nagad — ⏰ 24 ghonta lagbe ]

→ USDT select korle:
  - Base network er wallet address input
  - Amount (min 0.5 USDT)
  - Warning box (lal): "⚠️ Sotorko thakun! Shudhu BASE network er 
    USDT address din. Onno network (TRC20/BEP20/ERC20) er address 
    dile apnar USDT chiro-tore harie jabe. Wrong address er jonno
    amra dayi noi."
  - Fee preview: "Fee 2% = 0.05 USDT, apni paben 2.45 USDT"
  - [Send Now] button → instant on-chain transfer

→ bKash/Nagad select korle:
  - Number + amount (BDT) → request submit (old flow)
  - Note: "Payment 24 ghonta er moddhe pathano hobe"
```

---

## Backend (edge function)

**Notun edge function:** `usdt-payout`
- Validates: enabled flag, user balance, min amount, valid Base address (0x... regex + checksum)
- Calculates fee: `userAmount = amount - (amount * 0.02)` → user paaye, 2% wallet e thake
- Signs & broadcasts USDT transfer on Base using `viem`
- USDT contract on Base: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`
- RPC: public Base RPC (`https://mainnet.base.org`)
- Records tx in `transactions` table (type=`usdt_payout`, details=tx_hash)
- Decrements user verified_count (or stores separate `usdt_paid_count` ke track korte hobe — niche dekho)
- Telegram notification pathay

**Balance hisab:**
- USDT balance = `(key_count + reverify_count - usdt_paid_count) × ratePerAccount`
- Notun column dorkar `users.usdt_paid_count` (integer default 0) — payout hole increment hobe
- Ekta utility view ba RPC: `get_user_usdt_balance(user_id)`

---

## Secrets dorkar (user theke nibo)

1. `BASE_WALLET_PRIVATE_KEY` — apnar hot wallet er private key (Base network)
2. `BASE_RPC_URL` (optional, default public RPC use korbo)

---

## Schema changes (migration)

```sql
ALTER TABLE users ADD COLUMN usdt_paid_count integer NOT NULL DEFAULT 0;

INSERT INTO settings (key, value) VALUES
  ('usdtPayoutEnabled', 'false'),
  ('usdtRatePerAccount', '0.05'),
  ('usdtMinWithdraw', '0.5'),
  ('usdtFeePercent', '2')
ON CONFLICT (key) DO NOTHING;
```

---

## Files change/create

**New:**
- `supabase/functions/usdt-payout/index.ts` — auto-send USDT on Base
- `supabase/migrations/...` — settings + column

**Edit:**
- `src/components/WithdrawForm.tsx` — conditional USDT UI when enabled
- `src/lib/api.ts` — `getPublicSettings` e USDT fields add, `requestUsdtPayout` function
- `src/pages/AdminPanel.tsx` — toggle + rate inputs section
- `supabase/functions/public-api/index.ts` — expose USDT settings to client

---

## Implementation order

1. Migration (settings + column)
2. `usdt-payout` edge function with viem
3. Admin toggle UI + rate inputs
4. WithdrawForm conditional rendering (Bangla warnings + fee preview)
5. Test: toggle OFF → old flow intact; toggle ON → USDT option visible + works

---

## Confirm korar age 2 ta question:

1. **Wallet e USDT na USDC?** — Base e USDC beshi popular & liquid. User "USDT" boleche. Ami **USDT on Base** (`0xfde4...`) use korbo, but apni chaile USDC korte pari. Konta?
2. **Private key amake dite raji?** — Edge function e secret hisabe rakhbo, code e kokhono show hobe na. Confirm korle `add_secret` request pathabo.

Egulor uttor dile build shuru kori.