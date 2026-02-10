# 🔐 SecureShare

[![React Native](https://img.shields.io/badge/React_Native-0.81.5-blue.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_54-black.svg)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-97%2F102_passing-green.svg)]()
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A **zero-trust, secure document sharing mobile application** built with React Native and Expo. SecureShare implements military-grade encryption, forensic watermarking, and comprehensive security features to protect sensitive documents from unauthorized access and leaks.

![SecureShare Demo](docs/demo-screenshot.png)

## ✨ Features

### 🔐 Security-First Architecture
- **End-to-End Encryption**: Client-side AES-256-GCM encryption before upload
- **Zero-Trust Model**: Documents encrypted with recipient's public key (RSA-OAEP)
- **Forensic Watermarking**: Native LSB steganography + visible watermarks to identify leakers
- **Device Security**: Screenshot blocking, clipboard monitoring, root/jailbreak detection
- **Biometric Authentication**: Face ID, Touch ID, and fingerprint support

### 📱 Cross-Platform Mobile App
- **React Native + Expo**: Single codebase for iOS and Android
- **Modern UI/UX**: Glassmorphism design, haptic feedback, smooth animations
- **Offline Capability**: Local document storage with intelligent sync
- **Real-time Updates**: Supabase PostgreSQL subscriptions for instant sync

### 👥 Document Sharing
- **Secure Sharing**: Share with specific recipients via email
- **Access Control**: Time-based expiry, device hash validation, access revocation
- **Audit Trail**: Complete security event logging and view analytics
- **Multiple Formats**: Support for PDF, images (JPEG/PNG), DOCX, TXT

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐ │
│  │ HomeScreen  │ │ ShareScreen │ │ ViewerScreen  │ │
│  └─────────────┘ └─────────────┘ └───────────────┘ │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC                    │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐ │
│  │   Crypto    │ │  Watermark  │ │    Storage    │ │
│  │  (AES/RSA)  │ │   (LSB)     │ │ (Local/Cloud) │ │
│  └─────────────┘ └─────────────┘ └───────────────┘ │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│                   DATA LAYER                        │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐ │
│  │  Supabase   │ │  SecureStore│ │   FileSystem  │ │
│  │  (Backend)  │ │ (PrivateKey)│ │  (Documents)  │ │
│  └─────────────┘ └─────────────┘ └───────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Expo CLI: `npm install -g expo-cli`
- iOS: macOS with Xcode (for iOS simulator)
- Android: Android Studio with SDK

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/SecureShare.git
   cd SecureShare
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

4. **Configure Supabase**
   - Create a project at [supabase.com](https://supabase.com)
   - Run the SQL migrations in `supabase/migrations/`
   - Copy your project URL and anon key to `.env`

5. **Start the development server**
   ```bash
   npm start
   # or
   expo start
   ```

### Environment Variables

Create a `.env` file in the root directory:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run linting
npm run lint

# Run TypeScript check
npx tsc --noEmit
```

**Test Coverage:** 97/102 tests passing (95% pass rate)

## 📁 Project Structure

```
SecureShare/
├── screens/              # 16 screen components
│   ├── HomeScreen.js          # Document list with filtering
│   ├── ShareScreen.js         # Upload and share flow
│   ├── ViewerScreen.js        # Secure document viewer
│   └── ...
├── components/          # 25+ reusable components
│   ├── ErrorBoundary.js       # Global error handling
│   ├── BiometricLock.js       # Auth gate
│   ├── FloatingWatermark.js   # Visible watermark
│   └── ...
├── utils/               # Business logic
│   ├── crypto.js              # Encryption/decryption
│   ├── watermark.js           # Watermark embed/extract
│   └── storage.js             # Local persistence
├── lib/                 # API layer
│   └── supabase.js            # Database operations
├── supabase/            # Backend
│   ├── migrations/            # 25+ SQL migrations
│   └── functions/             # Edge functions
├── __tests__/           # Test suite
│   └── 9 test files
└── assets/              # Images, fonts, icons
```

## 🔒 Security Features

### Encryption
- **AES-256-GCM**: Symmetric encryption for document content
- **RSA-2048-OAEP**: Asymmetric encryption for key exchange
- **Client-side only**: Documents encrypted before leaving device
- **Key chunking**: Private keys split to fit SecureStore limits

### Watermarking
- **Native LSB**: Least Significant Bit steganography for images
- **Visible Watermarks**: Dynamic floating watermarks with recipient info
- **HMAC-SHA256**: Tamper-proof payload signatures
- **Forensic Extraction**: Identify document leakers from screenshots

### Access Control
- **Device Hashing**: Unique device fingerprints
- **Expiry Dates**: Time-limited access grants
- **Access Revocation**: Instant removal of permissions
- **Audit Logging**: Complete view and download history

## 🛠️ Built With

- **React Native 0.81.5** - Cross-platform mobile framework
- **Expo SDK 54** - Development platform and native modules
- **React Navigation 7** - Navigation with deep linking
- **Supabase** - PostgreSQL database with real-time subscriptions
- **react-native-quick-crypto** - Native cryptographic operations
- **expo-secure-store** - Hardware-backed key storage

## 📝 API Documentation

### Core Functions

#### Crypto Module
```javascript
// Generate RSA key pair
const keys = await generateKeyPair();

// Encrypt document
const encrypted = await encryptData(data, aesKey);

// Encrypt key for sharing
const encryptedKey = await encryptKey(aesKey, recipientPublicKey);
```

#### Watermark Module
```javascript
// Create signed watermark
const payload = await createSignedWatermarkPayload(docId, email, deviceHash, key);

// Embed in image
const result = await embedImageWatermarkAsync(imageBase64, payload);

// Verify watermark
const verified = await verifyWatermarkSignature(extractedPayload, key);
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Expo](https://expo.dev/) for the amazing development platform
- [Supabase](https://supabase.com/) for the open-source Firebase alternative
- [React Native](https://reactnative.dev/) community for continuous improvements
- All contributors who helped make this project possible

## 📞 Contact

Your Name - [@yourtwitter](https://twitter.com/yourtwitter) - email@example.com

Project Link: [https://github.com/YOUR_USERNAME/SecureShare](https://github.com/YOUR_USERNAME/SecureShare)

---

⭐ Star this repo if you find it helpful!
