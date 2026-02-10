# SecureShare Threat Model

## Executive Summary

SecureShare is designed to provide secure document sharing with forensic watermarking, access control, and deep analytics. This document outlines what the system **prevents**, **deters**, **detects**, and what is **impossible** to prevent.

**Last Updated:** 2024  
**Version:** 1.0

---

## Security Guarantees

### ✅ **PREVENTED** (Technical Enforcement)

#### Android Platform
1. **Screenshots** - Blocked via `FLAG_SECURE`
   - Screenshots show black screen
   - System-level enforcement, cannot be bypassed by apps
   - **Limitation:** Rooted devices may bypass (detected and logged)

2. **Screen Recording** - Blocked via `FLAG_SECURE`
   - Screen recordings show black screen
   - Works for system screen recorder and third-party apps

3. **App Preview Capture** - Blocked via `FLAG_SECURE`
   - Recent apps preview shows black screen
   - Task switcher cannot capture content

4. **OS-Level Sharing** - Prevented
   - Documents never exposed to file system
   - No "Open With" functionality
   - No system share sheet access

#### iOS Platform
1. **Screenshot Detection** - Detected and logged
   - Native notification when screenshot taken
   - Content immediately blurred (if implemented)
   - Owner notified
   - **Note:** iOS cannot prevent screenshots, only detect them

2. **Screen Recording Detection** - Detected and logged
   - Native notification when recording starts
   - Owner notified
   - **Note:** iOS cannot prevent recording, only detect it

#### Cross-Platform
1. **Text Selection** - Disabled in secure viewer
   - Users cannot select and copy text
   - Long-press context menu blocked

2. **Clipboard Access** - Monitored and blocked
   - Clipboard changes detected
   - Previous content restored
   - Event logged

3. **Unauthorized Access** - Prevented
   - Access grants validated server-side
   - Expired grants automatically blocked
   - Revoked access immediately enforced
   - Token validation on every view

---

### ⚠️ **DETERRED** (Psychological/Attribution)

1. **Camera Capture**
   - **Visible Watermark:** Floating watermark with recipient email, timestamp, and "SecureShare"
   - **Behavior:** Moves randomly every 3-7 seconds, appears in corners and center
   - **Purpose:** Ensures any photo contains attribution
   - **Effectiveness:** High deterrence, makes cropping difficult

2. **Content Re-sharing**
   - **Invisible Forensic Watermark:** Embedded in document content
   - **Payload:** Document UUID, recipient email, timestamp, device hash
   - **Survival:** Survives screenshots, camera photos (quality ≥90%), basic edits
   - **Purpose:** Attribution if content leaks
   - **Effectiveness:** Probabilistic - higher quality = better survival

3. **Cropping/Editing**
   - Visible watermark appears in multiple positions
   - Invisible watermark distributed throughout content
   - Makes complete removal difficult

---

### 📊 **DETECTED** (Logged and Reported)

1. **Screenshot Attempts**
   - Android: Blocked, event logged
   - iOS: Detected, event logged, owner notified

2. **Screen Recording Attempts**
   - Android: Blocked, event logged
   - iOS: Detected, event logged, owner notified

3. **Copy Attempts**
   - Clipboard monitoring detects changes
   - Event logged with timestamp and recipient

4. **App Backgrounding During View**
   - Detected when app goes to background
   - Event logged (may indicate screenshot on some devices)

5. **Access Denials**
   - Expired grant attempts logged
   - Revoked access attempts logged
   - Failed token validation logged

6. **View Analytics**
   - First open time
   - Last open time
   - Total view time
   - Session count
   - View duration per session
   - Device information

---

### ❌ **IMPOSSIBLE** (Physical/Technical Limitations)

1. **External Camera Capture**
   - **Reality:** Cannot prevent someone from using another device to photograph the screen
   - **Mitigation:** Visible watermark ensures attribution in photo
   - **Honesty:** We explicitly state this limitation

2. **Manual Retyping**
   - **Reality:** Cannot prevent someone from manually retyping content
   - **Mitigation:** Watermarking makes this time-consuming, analytics show viewing patterns
   - **Honesty:** We acknowledge this limitation

3. **Rooted/Jailbroken Devices**
   - **Reality:** Compromised devices can bypass security measures
   - **Mitigation:** Device security checks detect and log compromised devices
   - **Response:** Access may be restricted or flagged for review

4. **Memory Dumps**
   - **Reality:** Advanced attackers with root/jailbreak can dump memory
   - **Mitigation:** Content encrypted in memory, but decrypted during viewing
   - **Response:** Detected devices logged, access may be restricted

5. **Network Interception**
   - **Reality:** Encrypted content transmitted, but keys managed server-side
   - **Mitigation:** TLS encryption, client-side encryption before upload
   - **Limitation:** Server has access to encrypted blobs (but not keys without user auth)

6. **Server Compromise**
   - **Reality:** If server is compromised, encrypted blobs accessible
   - **Mitigation:** Client-side encryption means server cannot decrypt without keys
   - **Limitation:** Keys stored server-side (encrypted by owner's key in production)

---

## Threat Scenarios

### Scenario 1: Recipient Takes Screenshot

**Android:**
- ✅ Screenshot blocked (black screen)
- ✅ Event logged
- ✅ Owner notified

**iOS:**
- ⚠️ Screenshot taken (cannot prevent)
- ✅ Event detected and logged
- ✅ Owner notified
- ✅ Visible watermark in screenshot (if taken)

**Mitigation:** Visible watermark ensures attribution even if screenshot succeeds

---

### Scenario 2: Recipient Uses Another Phone to Photograph Screen

**Reality:**
- ❌ Cannot prevent external cameras
- ✅ Visible watermark appears in photo
- ✅ Invisible watermark may survive (if photo quality sufficient)
- ✅ Analytics show viewing session

**Mitigation:** Attribution via watermark, deterrence via visible overlay

---

### Scenario 3: Recipient Copies Content

**Prevention:**
- ✅ Text selection disabled
- ✅ Clipboard monitoring active
- ✅ Copy attempts blocked and logged

**Limitation:**
- ⚠️ Manual retyping cannot be prevented
- ✅ Analytics show viewing patterns (suspicious if content retyped)

---

### Scenario 4: Recipient Shares Document

**Prevention:**
- ✅ Document never exposed to file system
- ✅ No "Open With" or share sheet access
- ✅ OS-level sharing blocked

**Limitation:**
- ⚠️ Screenshot/camera capture still possible
- ✅ Watermarking provides attribution

---

### Scenario 5: Access Grant Expired/Revoked

**Enforcement:**
- ✅ Server-side validation on every view
- ✅ Expired grants automatically blocked
- ✅ Revoked access immediately enforced
- ✅ Attempts logged

**Effectiveness:** 100% - server-side enforcement cannot be bypassed

---

### Scenario 6: Compromised Device (Rooted/Jailbroken)

**Detection:**
- ✅ Device security checks detect compromise
- ✅ Event logged
- ✅ Access may be restricted

**Limitation:**
- ⚠️ Compromised devices can bypass client-side protections
- ✅ Server-side access control still enforced
- ✅ Watermarking still effective

---

## Security Claims (App Store Safe)

### ✅ **What We Can Claim:**

1. "Encrypted document sharing with access control"
2. "Forensic watermarking for attribution"
3. "Screen capture protection on Android"
4. "Screen capture detection on iOS"
5. "Deep analytics and security event logging"
6. "Zero-trust architecture with server-side validation"

### ❌ **What We CANNOT Claim:**

1. ❌ "100% screenshot prevention" (iOS limitation)
2. ❌ "Unbreakable watermarking" (probabilistic)
3. ❌ "Military-grade encryption" (use "AES-256 encryption")
4. ❌ "Impossible to leak" (physical limitations)
5. ❌ "Complete protection" (be specific about what's protected)

### ✅ **Recommended Wording:**

> "SecureShare uses multiple layers of protection including AES-256 encryption, access control, forensic watermarking, and screen capture protection (Android). While no system can prevent all forms of content extraction, SecureShare provides strong deterrence and attribution capabilities. Screen capture is blocked on Android and detected on iOS. Forensic watermarks survive screenshots and camera captures, enabling attribution if content leaks."

---

## Security Architecture

### Encryption
- **Algorithm:** AES-256-GCM
- **Key Management:** Document keys encrypted and stored server-side
- **Client-Side:** Encryption/decryption happens on device
- **Transit:** TLS 1.3

### Access Control
- **Model:** Zero-trust, recipient-bound access grants
- **Validation:** Server-side on every view
- **Enforcement:** Immediate (expiry, revocation)
- **Storage:** Supabase Row Level Security (RLS)

### Watermarking
- **Visible:** Floating overlay with recipient info
- **Invisible:** Forensic watermark embedded in content
- **Payload:** Document UUID, recipient email, timestamp, device hash
- **Survival:** Probabilistic (quality-dependent)

### Analytics
- **Collection:** Client-side, batched
- **Storage:** Server-side, immutable
- **Privacy:** No PII beyond email (required for access)

---

## Compliance Notes

### GDPR
- User data stored securely
- Analytics anonymized where possible
- Users can request data deletion

### App Store Guidelines
- No false security claims
- Honest about limitations
- Clear about what's protected vs detected

---

## Updates and Maintenance

This threat model should be reviewed:
- After major security updates
- When new features are added
- Annually as part of security audit
- When new threats are identified

---

**Document Status:** Active  
**Next Review:** After production launch + 3 months
