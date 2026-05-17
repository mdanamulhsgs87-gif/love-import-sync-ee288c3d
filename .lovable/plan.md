## পরিবর্তন সারাংশ

আপনার নতুন logic:
- **1st verify** = শুধু count হবে, কোনো টাকা/USDT add হবে না, কোনো request system o nei
- **Re-verify** (3-4 দিন পর) = তখনই account "complete" hobe → balance (TK + USDT) add hobe
- Admin panel এ **USDT rate per account** boshabo (ex: 0.05$)
- TK = USDT × 124 (admin-configurable rate) hisab e show হবে
- User TK ba USDT — দুটোই withdraw করতে parbe, kintu শুধু re-verified accounts er against e

---

## 1. Backend / Data model

### `users` table এর জন্য নতুন hisab
- `key_count` = total 1st verified (just counter, no money)
- `reverify_count` = completed accounts (money এর base)
- `usdt_paid_count` = already withdrawn as USDT

**Available balance source = `reverify_count` only** (1st verify count থেকে কোনো balance হবে না)

### Settings (admin panel এ editable)
- `usdtRatePerAccount` → per re-verified account USDT amount (default 0.05)
- `usdtToBdtRate` → 1 USDT = কত TK (default 124) **[নতুন]**
- `referralBonusUsd` → already আছে, admin থেকে set হবে

### `recalculate_all_balances` function update
Ekhon `key_count + reverify_count` use kore. Change kore শুধু `reverify_count × rate` use korbe (BDT side).

---

## 2. Frontend changes

### Dashboard / Header
- USDT balance card: `reverify_count × usdtRate + referralEarnings`
- BDT balance card: `(reverify_count × usdtRate × 124) − pendingWithdrawals` (referral o convert)
- 1st verify count আলাদা ভাবে দেখাবে "অপেক্ষমাণ — re-verify দরকার" tag দিয়ে

### "Account complete" বুঝানোর UI
Verified Keys section এ প্রতিটা key এর status:
- 🟡 **"১ম ভেরিফাই সম্পন্ন — ৩-৪ দিন পর re-verify করুন"** (pending)
- 🟢 **"Account সম্পন্ন ✓ — ব্যালেন্স যুক্ত হয়েছে"** (re-verified)

Plus একটা info banner top এ:
> 📌 শুধু re-verify শেষ হলেই একটা account complete হয় এবং টাকা যোগ হয়। ১ম ভেরিফাই শুধু গণনা হয়, টাকা যোগ হয় না।

### WithdrawForm
- 1st verify count আর কোথাও balance hisab e ashbe na
- "User request" system সরানো (যেটা 1st verify er against e onno user er kache request dito)
- শুধু **direct withdraw**: TK (bKash/Nagad) ও USDT
- Available = `reverify_count × usdtRate` (+ referral USDT)
- TK option e: ওই same USDT × 124 = TK
- Disabled message: "Re-verify সম্পন্ন না হলে withdraw করা যাবে না"

### User request / transfer system সরানো
- `UserAuditCard`, `user-requests.ts`, related Dashboard sections — 1st verify based request flow সরাবো
- Admin panel এর "User Requests" tab — যদি শুধু এই purpose এর জন্য থাকে, সরাবো (নাকি রাখবো সেটা confirm করবেন)

### Admin Panel
- নতুন setting field: **"USDT → BDT Rate (1 USDT = ? টাকা)"** default 124
- USDT rate & referral bonus field গুলো একই section এ গুছিয়ে দেবো

### Referral
- Bug check: `award_referral_on_first_verify` trigger `key_count` change এ trigger হয় — eta thik ache (1st verify হলেই referral pawa uchit, naki re-verify hole?)
  - **আপনার comment অনুযায়ী**: "she account verify korbe" — পুরাতন decision ছিল first verify এ। এখন logic বদলেছে — referral কখন award হবে?
- Admin rate change → existing balances retroactive update korbo na (ekhon থেকে যা hobe सেটাই)

---

## প্রশ্ন আপনার কাছে

1. **Referral bonus কখন award হবে** — referred user 1st verify করলে, নাকি re-verify (complete) করলে?
2. **User request/transfer system** — পুরোপুরি সরাবো নাকি admin panel এ history দেখার জন্য রাখবো?
3. **পুরাতন user দের 1st verify count এর জন্য balance** — যেটা আগেই যোগ হয়ে গেছে সেটা থাকবে, নাকি reset করবো?

উত্তর দিলে আমি implement করবো।