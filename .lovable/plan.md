## Promo Code System — Plan

### Concept
Referral system thakbei (sob user pabe). Promo code ekta **alada** system — sudhu admin-issued YouTuber der jonno.

### Flow
1. Admin panel theke admin notun promo code create kore — `code` (e.g. `RAKIB50`) + `owner user UID/guest_id` set kore
2. User registration form e referral code er **niche** ekta alada "Promo Code (Optional)" box thakbe
3. User promo code use kore signup korle:
   - User account e `promo_code_used` save hoye jabe (lifetime — change kora jabe na)
4. Prottek **re-verified account** er against e:
   - **User**: rewardRate er 5% bonus paabe (default 40৳ × 5% = 2৳ per account)
   - **Promo owner (YouTuber)**: rewardRate er 5% USDT commission paabe (USDT balance e jomma — withdraw kora jabe)
5. **Referral + Promo dutoi kaaj korbe** — referrer 0.05$ paabe (jemon ache), promo owner 5% paabe alada bhabe

### Database changes

**New table `promo_codes`:**
```text
- id (uuid)
- code (text, unique, uppercase)
- owner_user_id (integer, FK to users.id)
- is_active (boolean, default true)
- total_uses (integer, default 0)
- total_earned_usdt (numeric, default 0)
- created_at (timestamptz)
```

**`users` table — notun column:**
- `promo_code_used` (text, nullable) — registration e set hoy
- `promo_owner_user_id` (integer, nullable) — cached owner id
- `promo_user_bonus_bdt` (integer, default 0) — user er accumulated 5% bonus
- `promo_owner_usdt_earnings` (numeric, default 0) — owner er accumulated 5% commission

**New settings:**
- `promoUserBonusPct` = `5`
- `promoOwnerCommissionPct` = `5`

### Backend logic

**Trigger update — `award_promo_on_reverify`:**
`users` table e `reverify_count` barle (existing trigger er pashei):
- Jodi `promo_code_used` ache → user.promo_user_bonus_bdt += diff × rewardRate × 5%
- Jodi `promo_owner_user_id` ache → owner.promo_owner_usdt_earnings += diff × (rewardRate × 5% / usdtToBdtRate)
- Owner er `promo_codes.total_uses` o update hobe

**`sync_user_shared_balance` update korte hobe** — balance calculation e add korbe:
- `+ promo_user_bonus_bdt` (BDT side e direct)
- `+ (promo_owner_usdt_earnings × usdtToBdtRate)` (owner er earnings)

**`handle_new_auth_user` update** — `promo_code` o metadata theke porbe, validate kore `promo_code_used` + `promo_owner_user_id` set korbe

### Frontend changes

**`src/pages/Register.tsx`:**
- Referral code box er niche notun "🎬 Promo Code (Optional)" box add
- Description: "YouTuber/Telegram admin theke code thakle din — 5% extra bonus paben"
- Signup metadata te `promo_code` pathabe

**`src/pages/AdminPanel.tsx`:**
- Notun tab "Promo Codes":
  - List of all codes (code, owner name+UID, total uses, total earned, active toggle)
  - "Create New Code" form: code (text), owner guest_id (text) — submit korle validate kore create
  - Delete/Deactivate button
- Settings section e: `promoUserBonusPct`, `promoOwnerCommissionPct` editable input

**Dashboard (`src/pages/Dashboard.tsx`):**
- User er kache jodi `promo_owner_user_id == self` (mane she promo owner) — alada card "🎬 Promo Earnings" dekhabe: total uses + USDT earned
- Sob user — jodi promo_user_bonus_bdt > 0 — small badge "Promo bonus: ৳X" dekhabe

### Files to edit
- New migration (promo_codes table, users columns, settings, trigger, sync function update)
- `src/pages/Register.tsx` — promo code input
- `src/pages/AdminPanel.tsx` — promo codes management tab + settings fields
- `src/pages/Dashboard.tsx` — promo owner earnings card
- Possibly `src/lib/balance.ts` — display logic

### Edge cases handled
- Same code repeat use korle uppercase normalize
- Invalid code use korle silent ignore (signup succeed korbe but promo set hobe na)
- Owner deleted/blocked → commission stop
- User nijer code use korte parbe na (validate)
- Admin code delete korle existing users der bonus thakbe but future re-verify e ar bonus barbe na

### Confirm korun
Eta diye build korbo? Naki kichu change korte chan (jemon — bonus % onno kichu, ba bonus rewardRate er bodole USDT rate er upor calculate korte chan)?