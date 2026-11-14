# Security Specification & Red-Team Audit Plan

## 1. Data Invariants
1. **Authenticated & Verified Identity**: Every user write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: Player email and Telebirr phone numbers in `/users/{userId}/private/info` are readable only by `isOwner(userId)` or `isAdmin()`.
3. **Minimum Deposit & Withdrawal Enforcement**:
   - Deposits must be `>= 100` ETB and `<= 500000` ETB.
   - Withdrawals must be `>= 500` ETB and `<= existingBalance`.
4. **Anti-Replay Transaction IDs**: `/usedTxIds/{txId}` is create-only (`update` and `delete` forbidden) and `/deposits/{depositId}` must use `depositId == txId` and atomically create both `/usedTxIds/{txId}` and update `/users/{uid}`.
5. **Deposit-Before-Withdraw & Matching Telebirr Phone**: Players cannot submit a withdrawal unless `/users/{uid}.data.hasDeposited == true` and `playerPhone == get(/users/{uid}/private/info).data.telebirrPhone`.
6. **Atomic Wallet Accounting**: `/users/{uid}` balance cannot be arbitrarily updated; every balance mutation must match `lastActionType` (`deposit`, `bet`, `withdraw`) and reference an atomic `existsAfter`/`getAfter` document in `/deposits`, `/bets`, or `/withdrawals` (or admin refund).
7. **Terminal State Locking on Withdrawals**: Once a withdrawal reaches `status == 'completed'` or `status == 'rejected'`, no further updates are permitted. Only `isAdmin()` can transition a withdrawal from `pending` to `completed` or `rejected`.
8. **Server Timestamps**: All `createdAt` and `updatedAt` fields must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Admin Spoof**: `auth = { uid: "attacker", token: { email: "yirsawbiniyam@gmail.com", email_verified: false } }` attempting to write `/settings/telebirr` -> MUST BE DENIED.
2. **Shadow Field Injection on User Wallet**: Creating `/users/{uid}` with extra field `isAdmin: true` or `role: "admin"` -> MUST BE DENIED (`hasOnly` check).
3. **Arbitrary Balance Inflation**: Updating `/users/{uid}` to `{ balance: 999999 }` with `lastActionType: "init"` or without atomic `deposit`/`bet` doc -> MUST BE DENIED.
4. **Under-Minimum Deposit**: Creating `/deposits/{txId}` with `amount: 50` (< 100) -> MUST BE DENIED.
5. **Duplicate Transaction ID Replay**: Re-creating or updating `/usedTxIds/{txId}` for an already-used `txId` -> MUST BE DENIED.
6. **Under-Minimum Withdrawal**: Creating `/withdrawals/{id}` with `amount: 250` (< 500) -> MUST BE DENIED.
7. **Withdrawal Phone Mismatch**: Creating `/withdrawals/{id}` where `playerPhone != users/{uid}/private/info.telebirrPhone` -> MUST BE DENIED.
8. **Player Self-Completing Withdrawal**: Player updating `/withdrawals/{id}` to `{ status: "completed", adminPinConfirmed: true }` -> MUST BE DENIED.
9. **Terminal Withdrawal Re-Open**: Updating a `completed` withdrawal back to `pending` -> MUST BE DENIED.
10. **Cross-User PII Read**: Authenticated user A reading `/users/userB/private/info` -> MUST BE DENIED.
11. **Unscoped List Query**: Authenticated user A running `getDocs(collection(db, "deposits"))` without `where("uid", "==", userA)` -> MUST BE DENIED.
12. **Client Timestamp Forgery**: Creating `/bets/{betId}` with `createdAt` set to a past `Timestamp` instead of `serverTimestamp()` -> MUST BE DENIED.
