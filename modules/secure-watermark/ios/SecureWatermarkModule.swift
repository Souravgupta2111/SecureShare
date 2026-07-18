import ExpoModulesCore
import UIKit
import CryptoKit
import Vision

// ============================================================================
// SecureWatermark — iOS implementation (parity with Android Kotlin module)
//
// This is the "render-time" forensic engine. It must produce watermarks that
// are detectable by BOTH platforms and detect watermarks embedded by BOTH
// platforms, so the spread-spectrum math below is a bit-for-bit port of
// android/.../SpreadSpectrumWatermark.kt. Do not "optimize" the PRNG, seed, or
// coordinate mapping without changing the Kotlin side identically — any drift
// breaks cross-platform correlation.
//
// Exposed methods (match the Kotlin module + what the JS app calls):
//   renderSecureImage(encryptedInput, aesKeyHex, userId, docId) -> base64 JPEG
//   embedWatermark(base64Image, userId, docId)                  -> base64 JPEG
//   detectLeaker(base64Image, docId, candidatesJson)            -> {userId, confidence} | nil
//   detectDocumentId(base64Image, docIdsJson)                   -> docId | nil
//   extractVisibleWatermark(base64Image)                        -> OCR text (Vision)
//   isScreenBeingMirrored()                                     -> Bool
//   embedLSB / extractLSB / verifyLSB                           -> legacy no-op mocks
// ============================================================================

// MARK: - Spread Spectrum core (mirror of SpreadSpectrumWatermark.kt)

enum SpreadSpectrum {
    static let tileSize = 256
    static let strength: Float = 18            // must match Kotlin STRENGTH
    static let detectionThreshold: Float = 0.5 // must match Kotlin DETECTION_THRESHOLD

    /// Shared secret for the deterministic PRNG. MUST equal Android's
    /// BuildConfig.WATERMARK_SECRET (env `WATERMARK_SECRET`, else `DEV_FALLBACK_KEY`).
    /// For production, set `WATERMARK_SECRET` in the app's Info.plist to the same
    /// value used for the Android build; otherwise cross-platform detection fails.
    static var secret: String {
        if let s = Bundle.main.object(forInfoDictionaryKey: "WATERMARK_SECRET") as? String, !s.isEmpty {
            return s
        }
        return "DEV_FALLBACK_KEY"
    }

    /// HMAC-SHA256(secret, id) -> first 8 bytes as a big-endian signed Int64.
    /// Matches Kotlin `ByteBuffer.wrap(hash.copyOf(8)).long` (BIG_ENDIAN).
    static func stableSeed(_ id: String) -> Int64 {
        let key = SymmetricKey(data: Data(secret.utf8))
        let mac = HMAC<SHA256>.authenticationCode(for: Data(id.utf8), using: key)
        let bytes = Array(mac) // 32 bytes
        var u: UInt64 = 0
        for i in 0..<8 { u = (u << 8) | UInt64(bytes[i]) }
        return Int64(bitPattern: u)
    }

    /// 256x256 bipolar PRNG tile (+strength / -strength). Mirrors Kotlin generateTile.
    static func generateTile(_ id: String) -> [Float] {
        var tile = [Float](repeating: 0, count: tileSize * tileSize)
        var s = stableSeed(id)
        for i in 0..<tile.count {
            // 64-bit LCG with two's-complement wraparound (matches Kotlin Long math).
            s = s &* 6364136223846793005 &+ 1442695040888963407
            let bit = (UInt64(bitPattern: s) >> 32) & 1 // logical (unsigned) shift == Kotlin ushr
            tile[i] = (bit == 1) ? strength : -strength
        }
        return tile
    }

    /// Embed two orthogonal tiles (60% user, 40% doc) into RGB luminance in place.
    static func embed(_ pixels: inout [UInt8], width w: Int, height h: Int, userId: String, docId: String) {
        let userTile = generateTile(userId)
        let docTile = generateTile(docId)
        let count = w * h
        for i in 0..<count {
            let x = i % w
            let y = i / w
            // Scale-invariant virtual grid (fixed 1024 relative units), matches Kotlin.
            let normX = (x * 1024) / w
            let normY = (y * 1024) / h
            let tileIdx = (normY % tileSize) * tileSize + (normX % tileSize)
            let delta = userTile[tileIdx] * 0.6 + docTile[tileIdx] * 0.4

            let p = i * 4
            // R, G, B modified equally; alpha (p+3) untouched.
            for c in 0..<3 {
                let v = Float(pixels[p + c]) + delta
                let iv = Int(v) // truncates toward zero, matches Kotlin Float.toInt()
                pixels[p + c] = UInt8(min(max(iv, 0), 255))
            }
        }
    }

    /// Normalized cross-correlation of the recovered luma vs candidate tiles.
    /// Mirrors Kotlin correlate(). Returns (id, score) if score > threshold.
    static func correlate(pixels: [UInt8], width w: Int, height h: Int, candidates: [String], weight: Float) -> (String, Float)? {
        let count = w * h
        if count == 0 { return nil }

        // BT.601 luma
        var luma = [Float](repeating: 0, count: count)
        for i in 0..<count {
            let p = i * 4
            let r = Float(pixels[p])
            let g = Float(pixels[p + 1])
            let b = Float(pixels[p + 2])
            luma[i] = 0.299 * r + 0.587 * g + 0.114 * b
        }

        // Histogram normalize to [0,255]
        var mn = Float.greatestFiniteMagnitude
        var mx = -Float.greatestFiniteMagnitude
        for v in luma { if v < mn { mn = v }; if v > mx { mx = v } }
        var normalized: [Float]
        if mx <= mn {
            normalized = luma
        } else {
            let range = mx - mn
            normalized = luma.map { (($0 - mn) / range) * 255.0 }
        }

        // Zero-mean shift
        var mean: Float = 0
        for v in normalized { mean += v }
        mean /= Float(normalized.count)
        for i in 0..<normalized.count { normalized[i] -= mean }

        var bestId: String? = nil
        var bestScore: Float = 0
        for id in candidates {
            let tile = generateTile(id)
            var dot: Float = 0
            for i in 0..<count {
                let x = i % w
                let y = i / w
                let normX = (x * 1024) / w
                let normY = (y * 1024) / h
                let tileVal = tile[(normY % tileSize) * tileSize + (normX % tileSize)]
                dot += normalized[i] * tileVal * weight
            }
            let score = dot / Float(count)
            if score > bestScore {
                bestScore = score
                bestId = id
            }
        }

        if bestScore > detectionThreshold, let id = bestId {
            return (id, bestScore)
        }
        return nil
    }

    static func detectDocId(pixels: [UInt8], width: Int, height: Int, allDocIds: [String]) -> String? {
        return correlate(pixels: pixels, width: width, height: height, candidates: allDocIds, weight: 0.4)?.0
    }

    static func detectUserId(pixels: [UInt8], width: Int, height: Int, candidates: [String]) -> (String, Float)? {
        return correlate(pixels: pixels, width: width, height: height, candidates: candidates, weight: 0.6)
    }

    /// Decode a CGImage into a top-left-origin RGBA (premultipliedLast) byte buffer.
    /// This ordering matches Android's Bitmap.getPixels row-major traversal.
    static func rgbaPixels(from cgImage: CGImage) -> (pixels: [UInt8], width: Int, height: Int)? {
        let w = cgImage.width
        let h = cgImage.height
        if w == 0 || h == 0 { return nil }
        let bytesPerRow = 4 * w
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: w,
            height: h,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: cs,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let dataPtr = ctx.data else { return nil }
        let buf = dataPtr.bindMemory(to: UInt8.self, capacity: w * h * 4)
        let pixels = Array(UnsafeBufferPointer(start: buf, count: w * h * 4))
        return (pixels, w, h)
    }
}

// MARK: - Expo Module

public class SecureWatermarkModule: Module {

    public func definition() -> ModuleDefinition {
        Name("SecureWatermark")

        // -------------------------------------------------------------------
        // RENDER-TIME ENGINE: AES-GCM decrypt -> embed -> overlay -> JPEG
        // -------------------------------------------------------------------
        AsyncFunction("renderSecureImage") { (encryptedInput: String, aesKeyHex: String, userId: String, docId: String) -> String in
            guard let cipher = Data(base64Encoded: encryptedInput) else {
                throw NSError(domain: "SecureWatermark", code: 10, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 ciphertext"])
            }
            let keyData = self.hexToData(aesKeyHex)
            let key = SymmetricKey(data: keyData)

            // JS/WebCrypto layout is iv(12) || ciphertext || tag(16), which is exactly
            // CryptoKit's "combined" SealedBox representation (nonce||ct||tag).
            let sealed = try AES.GCM.SealedBox(combined: cipher)
            let plain = try AES.GCM.open(sealed, using: key)

            var base64String = String(decoding: plain, as: UTF8.self)
            // Strip legacy LSB delimiter suffix ("###SWMK##" -> base64 "IyMjU1dNSyMj").
            if let range = base64String.range(of: "IyMjU1dNSyMj", options: .backwards) {
                base64String = String(base64String[..<range.lowerBound])
            }
            guard let imgData = Data(base64Encoded: base64String),
                  let uiImage = UIImage(data: imgData),
                  let cg = uiImage.cgImage else {
                throw NSError(domain: "SecureWatermark", code: 11, userInfo: [NSLocalizedDescriptionKey: "Failed to decode decrypted image"])
            }
            return try self.watermarkAndEncode(cgImage: cg, userId: userId, docId: docId)
        }

        // -------------------------------------------------------------------
        // EMBED-ONLY (JS already decrypted): embed -> overlay -> JPEG
        // -------------------------------------------------------------------
        AsyncFunction("embedWatermark") { (base64Image: String, userId: String, docId: String) -> String in
            guard let imgData = Data(base64Encoded: base64Image),
                  let uiImage = UIImage(data: imgData),
                  let cg = uiImage.cgImage else {
                throw NSError(domain: "SecureWatermark", code: 12, userInfo: [NSLocalizedDescriptionKey: "Failed to decode image bitmap"])
            }
            return try self.watermarkAndEncode(cgImage: cg, userId: userId, docId: docId)
        }

        // -------------------------------------------------------------------
        // DETECT LEAKER (user id) via normalized cross-correlation
        // -------------------------------------------------------------------
        AsyncFunction("detectLeaker") { (base64Image: String, docId: String, candidatesJson: String) -> [String: Any]? in
            guard let data = Data(base64Encoded: base64Image),
                  let uiImage = UIImage(data: data),
                  let cg = uiImage.cgImage,
                  let res = SpreadSpectrum.rgbaPixels(from: cg) else {
                throw NSError(domain: "SecureWatermark", code: 13, userInfo: [NSLocalizedDescriptionKey: "Failed to parse suspect image"])
            }
            let candidates = self.parseJsonStringArray(candidatesJson)
            guard let match = SpreadSpectrum.detectUserId(pixels: res.pixels, width: res.width, height: res.height, candidates: candidates) else {
                return nil
            }
            return ["userId": match.0, "confidence": Double(match.1)]
        }

        // -------------------------------------------------------------------
        // DETECT DOCUMENT ID
        // -------------------------------------------------------------------
        AsyncFunction("detectDocumentId") { (base64Image: String, docIdsJson: String) -> String? in
            guard let data = Data(base64Encoded: base64Image),
                  let uiImage = UIImage(data: data),
                  let cg = uiImage.cgImage,
                  let res = SpreadSpectrum.rgbaPixels(from: cg) else {
                throw NSError(domain: "SecureWatermark", code: 14, userInfo: [NSLocalizedDescriptionKey: "Failed to parse suspect image"])
            }
            let ids = self.parseJsonStringArray(docIdsJson)
            return SpreadSpectrum.detectDocId(pixels: res.pixels, width: res.width, height: res.height, allDocIds: ids)
        }

        // -------------------------------------------------------------------
        // VISIBLE WATERMARK READER (Apple Vision OCR — replaces ML Kit)
        // -------------------------------------------------------------------
        AsyncFunction("extractVisibleWatermark") { (base64Image: String) -> String in
            guard let data = Data(base64Encoded: base64Image),
                  let uiImage = UIImage(data: data),
                  let cg = uiImage.cgImage,
                  let enhanced = self.contrastBoosted(cgImage: cg) else {
                throw NSError(domain: "SecureWatermark", code: 15, userInfo: [NSLocalizedDescriptionKey: "Failed to parse suspect image for OCR"])
            }

            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false

            let handler = VNImageRequestHandler(cgImage: enhanced, options: [:])
            do {
                try handler.perform([request])
            } catch {
                return "" // don't crash on OCR failure, mirror Android behavior
            }

            var lines: [String] = []
            if let results = request.results {
                for obs in results {
                    if let candidate = obs.topCandidates(1).first {
                        lines.append(candidate.string)
                    }
                }
            }
            return lines.joined(separator: "\n")
        }

        // -------------------------------------------------------------------
        // SCREEN MIRRORING DRM: external display attached?
        // -------------------------------------------------------------------
        AsyncFunction("isScreenBeingMirrored") { () -> Bool in
            var mirrored = false
            DispatchQueue.main.sync {
                mirrored = UIScreen.screens.count > 1
            }
            return mirrored
        }

        // -------------------------------------------------------------------
        // LEGACY LSB MOCKS — embedding happens at render time (Option D).
        // Kept so JS calls resolve identically to Android's mocks.
        // -------------------------------------------------------------------
        AsyncFunction("embedLSB") { (base64Image: String, _: String) -> String in
            return base64Image // upload pristine; watermark applied at render time
        }
        AsyncFunction("extractLSB") { (_: String) -> String? in
            return nil
        }
        AsyncFunction("verifyLSB") { (_: String) -> Bool in
            return false
        }
    }

    // MARK: - Helpers

    /// Embed spread-spectrum + draw the visible overlay grid, return base64 JPEG (q=0.92).
    private func watermarkAndEncode(cgImage: CGImage, userId: String, docId: String) throws -> String {
        guard let res = SpreadSpectrum.rgbaPixels(from: cgImage) else {
            throw NSError(domain: "SecureWatermark", code: 20, userInfo: [NSLocalizedDescriptionKey: "Failed to read pixels"])
        }
        var pixels = res.pixels
        let w = res.width
        let h = res.height
        SpreadSpectrum.embed(&pixels, width: w, height: h, userId: userId, docId: docId)

        let cs = CGColorSpaceCreateDeviceRGB()
        var watermarkedCG: CGImage?
        pixels.withUnsafeMutableBytes { raw in
            if let ctx = CGContext(
                data: raw.baseAddress,
                width: w,
                height: h,
                bitsPerComponent: 8,
                bytesPerRow: 4 * w,
                space: cs,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) {
                watermarkedCG = ctx.makeImage() // copies buffer, safe to use after closure
            }
        }
        guard let base = watermarkedCG else {
            throw NSError(domain: "SecureWatermark", code: 21, userInfo: [NSLocalizedDescriptionKey: "Failed to build watermarked image"])
        }

        let rendered = self.drawVisibleOverlay(base: base, width: w, height: h, userId: userId, docId: docId)
        guard let jpeg = rendered.jpegData(compressionQuality: 0.92) else {
            throw NSError(domain: "SecureWatermark", code: 22, userInfo: [NSLocalizedDescriptionKey: "Failed to encode JPEG"])
        }
        return jpeg.base64EncodedString()
    }

    /// Draw the faint "userId|docId" text 4x5 across the image, diagonally tilted.
    /// Mirrors the Kotlin drawVisibleOverlay (white, ~12% alpha, monospace, -30deg).
    private func drawVisibleOverlay(base: CGImage, width w: Int, height h: Int, userId: String, docId: String) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format)

        return renderer.image { rendererCtx in
            let ctx = rendererCtx.cgContext
            UIImage(cgImage: base).draw(in: CGRect(x: 0, y: 0, width: w, height: h))

            let textSize = CGFloat(w) / 18.0
            let font = UIFont(name: "Menlo", size: textSize)
                ?? UIFont.monospacedSystemFont(ofSize: textSize, weight: .regular)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: UIColor(white: 1.0, alpha: 30.0 / 255.0)
            ]
            let text = "\(userId)|\(docId)" as NSString

            let rows = 4
            let cols = 5
            for r in 0..<rows {
                for c in 0..<cols {
                    let x = CGFloat(c) * CGFloat(w) / CGFloat(cols) + 10.0
                    let y = CGFloat(r) * CGFloat(h) / CGFloat(rows) + textSize + 10.0
                    ctx.saveGState()
                    ctx.translateBy(x: x, y: y)
                    ctx.rotate(by: -30.0 * CGFloat.pi / 180.0)
                    text.draw(at: .zero, withAttributes: attrs)
                    ctx.restoreGState()
                }
            }
        }
    }

    /// High-contrast grayscale to amplify the faint overlay for OCR.
    /// Mirrors Kotlin: v = clamp(128 + (luma - meanLuma) * 8).
    private func contrastBoosted(cgImage: CGImage) -> CGImage? {
        guard let res = SpreadSpectrum.rgbaPixels(from: cgImage) else { return nil }
        var pixels = res.pixels
        let w = res.width
        let h = res.height
        let count = w * h

        var total = 0.0
        for i in 0..<count {
            let p = i * 4
            let r = Double(pixels[p])
            let g = Double(pixels[p + 1])
            let b = Double(pixels[p + 2])
            total += 0.299 * r + 0.587 * g + 0.114 * b
        }
        let mean = total / Double(count)

        for i in 0..<count {
            let p = i * 4
            let r = Double(pixels[p])
            let g = Double(pixels[p + 1])
            let b = Double(pixels[p + 2])
            let luma = 0.299 * r + 0.587 * g + 0.114 * b
            let delta = Int((luma - mean) * 8.0)
            let v = UInt8(min(max(128 + delta, 0), 255))
            pixels[p] = v
            pixels[p + 1] = v
            pixels[p + 2] = v
            pixels[p + 3] = 255
        }

        let cs = CGColorSpaceCreateDeviceRGB()
        var out: CGImage?
        pixels.withUnsafeMutableBytes { raw in
            if let ctx = CGContext(
                data: raw.baseAddress,
                width: w,
                height: h,
                bitsPerComponent: 8,
                bytesPerRow: 4 * w,
                space: cs,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) {
                out = ctx.makeImage()
            }
        }
        return out
    }

    private func hexToData(_ hex: String) -> Data {
        let clean = hex.count % 2 == 0 ? hex : "0" + hex
        var data = Data(capacity: clean.count / 2)
        var idx = clean.startIndex
        while idx < clean.endIndex {
            let next = clean.index(idx, offsetBy: 2)
            if let b = UInt8(clean[idx..<next], radix: 16) {
                data.append(b)
            }
            idx = next
        }
        return data
    }

    private func parseJsonStringArray(_ json: String) -> [String] {
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
            return []
        }
        return arr.compactMap { $0 as? String }
    }
}
