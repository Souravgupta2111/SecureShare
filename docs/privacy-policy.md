# SecureShare Privacy Policy

**Last Updated:** February 2, 2026

SecureShare ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application ("App").

---

## 1. Information We Collect

### 1.1 Account Information
- **Email address**: Required for account creation and recipient identification
- **Authentication data**: Securely managed by our authentication provider (Supabase Auth)

### 1.2 Usage Analytics (with consent only)
When you opt-in to analytics, we may collect:
- Document view events (not content)
- Session duration
- Feature usage patterns
- App performance metrics

### 1.3 Security Event Data
To protect your documents, we automatically log:
- Screenshot/screen recording attempts
- Access validation events
- Device authentication events

### 1.4 Technical Data
- Device type and operating system
- Anonymous device hash (for access control)
- App version

---

## 2. Information We Do NOT Collect

**We are committed to Zero-Trust architecture:**

- ❌ **Document content**: All documents are encrypted client-side before upload. We cannot read your files.
- ❌ **Encryption keys**: Keys are never transmitted to our servers and exist only on your device.
- ❌ **Location data**: We do not track your location.
- ❌ **Contacts**: We do not access your contact list.
- ❌ **Personal identifiers**: We do not collect names, phone numbers, or other personal data beyond email.

---

## 3. How We Use Your Information

We use the collected information to:

| Purpose | Data Used |
|---------|-----------|
| Provide secure document sharing | Email, device hash |
| Verify access permissions | Email, authentication state |
| Protect against unauthorized access | Security events, device hash |
| Improve app performance (with consent) | Usage analytics |
| Communicate important updates | Email |

---

## 4. Encryption & Security

### 4.1 Client-Side Encryption
All documents are encrypted using **AES-256-GCM** directly on your device before upload. The encryption key never leaves your device and is protected by RSA-OAEP asymmetric encryption.

### 4.2 Zero-Knowledge Architecture
- Our servers store only encrypted data
- We cannot decrypt your documents
- You control who can access your documents

### 4.3 Key Management
- Private keys are stored in your device's secure enclave (iOS) or encrypted storage (Android)
- If you uninstall the app, your private key is permanently deleted
- **Lost private keys cannot be recovered** - this is by design for maximum security

---

## 5. Data Sharing & Disclosure

We do **NOT** sell your data. We may share information only:

- **With your consent**: When you explicitly share documents with recipients
- **For legal compliance**: If required by law or valid legal process
- **For security**: To protect against fraud, abuse, or security threats

### Third-Party Services
- **Supabase**: Database and authentication (GDPR compliant)
- **Expo**: Build and delivery infrastructure
- **No advertising networks**
- **No analytics SDKs** (we use first-party analytics with consent)

---

## 6. Your Rights & Choices

### 6.1 Access & Portability
You can request a copy of your data by contacting us at support@secureshare.app.

### 6.2 Deletion
You can delete your account and all associated data at any time through the app settings.

### 6.3 Analytics Opt-Out
Analytics collection is **disabled by default**. You can control this setting in the app's onboarding or settings screen.

### 6.4 Error Reporting Opt-Out
Error reporting is **disabled by default**. When enabled, we collect:
- Error type and message
- Stack trace (no personal data)
- App version and device type

We explicitly **exclude** from error reports:
- Document content
- Encryption keys
- Email addresses
- Any personal identifiers

---

## 7. Data Retention

| Data Type | Retention Period |
|-----------|------------------|
| Account data | Until account deletion |
| Shared documents | Until expiration or deletion by owner |
| Access logs | 90 days |
| Security events | 1 year |
| Analytics events (if opted-in) | 90 days |

---

## 8. Children's Privacy

SecureShare is not intended for users under 13 years of age. We do not knowingly collect information from children under 13.

---

## 9. International Data Transfers

Your data may be processed in countries outside your residence. We ensure appropriate safeguards are in place through:
- Standard contractual clauses
- GDPR-compliant data processing agreements

---

## 10. Changes to This Policy

We may update this Privacy Policy periodically. We will notify you of material changes through:
- In-app notification
- Email notification (for significant changes)

---

## 11. Contact Us

For questions about this Privacy Policy or your data:

**Email:** support@secureshare.app

**Data Protection Officer:**
privacy@secureshare.app

---

## 12. GDPR Rights (EU Users)

Under GDPR, you have the right to:
- Access your personal data
- Rectify inaccurate data
- Erase your data ("right to be forgotten")
- Restrict processing
- Data portability
- Object to processing
- Withdraw consent

To exercise these rights, contact privacy@secureshare.app.

---

## 13. CCPA Rights (California Residents)

Under CCPA, you have the right to:
- Know what personal information is collected
- Know whether your data is sold or disclosed
- Say no to the sale of personal information (we do not sell data)
- Access your personal information
- Equal service and price, even if you exercise privacy rights

---

*This privacy policy is effective as of February 2, 2026.*
