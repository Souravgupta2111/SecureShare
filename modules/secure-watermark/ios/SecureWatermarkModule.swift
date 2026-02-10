import ExpoModulesCore
import UIKit

/**
 * SecureWatermark - iOS LSB Steganography Implementation
 *
 * Embeds watermark data into the Least Significant Bits of image pixels.
 * Uses 3x redundancy and CRC-16 for error correction.
 */
public class SecureWatermarkModule: Module {
    
    private let MAGIC_HEADER = "SECURESHARE_LSB_V1"
    private let BITS_PER_PIXEL = 3 // LSB of R, G, B channels
    private let REDUNDANCY_FACTOR = 3
    
    public func definition() -> ModuleDefinition {
        Name("SecureWatermark")
        
        AsyncFunction("embedLSB") { (imageBase64: String, watermarkText: String) -> String in
            guard let imageData = Data(base64Encoded: imageBase64),
                  let image = UIImage(data: imageData),
                  let cgImage = image.cgImage else {
                throw NSError(domain: "SecureWatermark", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to decode image"])
            }
            
            let width = cgImage.width
            let height = cgImage.height
            let bytesPerRow = 4 * width
            let bitsPerComponent = 8
            
            // Create bitmap context
            guard let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: bitsPerComponent,
                bytesPerRow: bytesPerRow,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else {
                throw NSError(domain: "SecureWatermark", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create context"])
            }
            
            // Draw image
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            
            guard let pixelData = context.data else {
                throw NSError(domain: "SecureWatermark", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to get pixel data"])
            }
            
            let pixels = pixelData.bindMemory(to: UInt8.self, capacity: width * height * 4)
            
            // Prepare payload
            let payload = "\(MAGIC_HEADER)|\(watermarkText)"
            let payloadBytes = Array(payload.utf8)
            
            // Calculate capacity
            let maxBits = width * height * BITS_PER_PIXEL
            let requiredBits = (32 + 16 + payloadBytes.count * 8) * REDUNDANCY_FACTOR
            
            guard requiredBits <= maxBits else {
                throw NSError(domain: "SecureWatermark", code: 4, userInfo: [NSLocalizedDescriptionKey: "Image too small for watermark"])
            }
            
            // Calculate CRC-16
            let crc = calculateCRC16(payloadBytes)
            
            // Build bit stream
            let bitStream = buildBitStream(length: payloadBytes.count, crc: crc, payload: payloadBytes)
            
            // Embed bits into pixels
            var bitIndex = 0
            for y in 0..<height {
                for x in 0..<width {
                    if bitIndex >= bitStream.count { break }
                    
                    let pixelIndex = (y * width + x) * 4
                    
                    // Modify R channel LSB
                    if bitIndex < bitStream.count {
                        if bitStream[bitIndex] {
                            pixels[pixelIndex] = pixels[pixelIndex] | 1
                        } else {
                            pixels[pixelIndex] = pixels[pixelIndex] & 0xFE
                        }
                        bitIndex += 1
                    }
                    
                    // Modify G channel LSB
                    if bitIndex < bitStream.count {
                        if bitStream[bitIndex] {
                            pixels[pixelIndex + 1] = pixels[pixelIndex + 1] | 1
                        } else {
                            pixels[pixelIndex + 1] = pixels[pixelIndex + 1] & 0xFE
                        }
                        bitIndex += 1
                    }
                    
                    // Modify B channel LSB
                    if bitIndex < bitStream.count {
                        if bitStream[bitIndex] {
                            pixels[pixelIndex + 2] = pixels[pixelIndex + 2] | 1
                        } else {
                            pixels[pixelIndex + 2] = pixels[pixelIndex + 2] & 0xFE
                        }
                        bitIndex += 1
                    }
                }
            }
            
            // Create output image
            guard let outputCGImage = context.makeImage() else {
                throw NSError(domain: "SecureWatermark", code: 5, userInfo: [NSLocalizedDescriptionKey: "Failed to create output image"])
            }
            
            let outputImage = UIImage(cgImage: outputCGImage)
            guard let pngData = outputImage.pngData() else {
                throw NSError(domain: "SecureWatermark", code: 6, userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG"])
            }
            
            return pngData.base64EncodedString()
        }

        AsyncFunction("embedLSBFromFile") { (filePath: String, watermarkText: String) -> String in
            // Handle file URL scheme
            let url = URL(fileURLWithPath: filePath.replacingOccurrences(of: "file://", with: ""))
            
            guard let imageData = try? Data(contentsOf: url),
                  let image = UIImage(data: imageData),
                  let cgImage = image.cgImage else {
                throw NSError(domain: "SecureWatermark", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to load image from file"])
            }
            
            let width = cgImage.width
            let height = cgImage.height
            let bytesPerRow = 4 * width
            let bitsPerComponent = 8
            
            // Create bitmap context
            guard let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: bitsPerComponent,
                bytesPerRow: bytesPerRow,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else {
                throw NSError(domain: "SecureWatermark", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create context"])
            }
            
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            
            guard let pixelData = context.data else {
                throw NSError(domain: "SecureWatermark", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to get pixel data"])
            }
            
            let pixels = pixelData.bindMemory(to: UInt8.self, capacity: width * height * 4)
            
            // Prepare payload
            let payload = "\(MAGIC_HEADER)|\(watermarkText)"
            let payloadBytes = Array(payload.utf8)
            
            // Calculate capacity
            let maxBits = width * height * BITS_PER_PIXEL
            let requiredBits = (32 + 16 + payloadBytes.count * 8) * REDUNDANCY_FACTOR
            
            guard requiredBits <= maxBits else {
                throw NSError(domain: "SecureWatermark", code: 4, userInfo: [NSLocalizedDescriptionKey: "Image too small for watermark"])
            }
            
            let crc = calculateCRC16(payloadBytes)
            let bitStream = buildBitStream(length: payloadBytes.count, crc: crc, payload: payloadBytes)
            
            // Embed bits (Copied logic from embedLSB due to swift limitations on shared helper with unsafe ptr)
            // Ideally we'd factor this out but UnsafeMutableRawPointer is tricky.
            var bitIndex = 0
            for y in 0..<height {
                for x in 0..<width {
                    if bitIndex >= bitStream.count { break }
                    let pixelIndex = (y * width + x) * 4
                    
                    if bitIndex < bitStream.count {
                        if bitStream[bitIndex] { pixels[pixelIndex] |= 1 } else { pixels[pixelIndex] &= 0xFE }
                        bitIndex += 1
                    }
                    if bitIndex < bitStream.count {
                        if bitStream[bitIndex] { pixels[pixelIndex + 1] |= 1 } else { pixels[pixelIndex + 1] &= 0xFE }
                        bitIndex += 1
                    }
                    if bitIndex < bitStream.count {
                        if bitStream[bitIndex] { pixels[pixelIndex + 2] |= 1 } else { pixels[pixelIndex + 2] &= 0xFE }
                        bitIndex += 1
                    }
                }
            }
            
            guard let outputCGImage = context.makeImage() else {
               throw NSError(domain: "SecureWatermark", code: 5, userInfo: [NSLocalizedDescriptionKey: "Failed to create output image"])
            }
            
            let outputImage = UIImage(cgImage: outputCGImage)
            guard let pngData = outputImage.pngData() else {
                throw NSError(domain: "SecureWatermark", code: 6, userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG"])
            }
            
            // Write to temp file
            let tempDir = FileManager.default.temporaryDirectory
            let fileName = UUID().uuidString + ".png"
            let fileUrl = tempDir.appendingPathComponent(fileName)
            
            try pngData.write(to: fileUrl)
            return fileUrl.absoluteString
        
        AsyncFunction("extractLSB") { (imageBase64: String) -> String? in
            guard let imageData = Data(base64Encoded: imageBase64),
                  let image = UIImage(data: imageData),
                  let cgImage = image.cgImage else {
                return nil
            }
            
            let width = cgImage.width
            let height = cgImage.height
            let bytesPerRow = 4 * width
            
            guard let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return nil }
            
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            
            guard let pixelData = context.data else { return nil }
            let pixels = pixelData.bindMemory(to: UInt8.self, capacity: width * height * 4)
            
            // Extract bits
            let maxBits = width * height * BITS_PER_PIXEL
            var bits = [Bool](repeating: false, count: maxBits)
            var bitIndex = 0
            
            for y in 0..<height {
                for x in 0..<width {
                    if bitIndex >= maxBits { break }
                    let pixelIndex = (y * width + x) * 4
                    
                    // Extract R LSB
                    if bitIndex < maxBits {
                        bits[bitIndex] = (pixels[pixelIndex] & 1) == 1
                        bitIndex += 1
                    }
                    // Extract G LSB
                    if bitIndex < maxBits {
                        bits[bitIndex] = (pixels[pixelIndex + 1] & 1) == 1
                        bitIndex += 1
                    }
                    // Extract B LSB
                    if bitIndex < maxBits {
                        bits[bitIndex] = (pixels[pixelIndex + 2] & 1) == 1
                        bitIndex += 1
                    }
                }
            }
            
            // Read length with redundancy
            let length = readIntWithRedundancy(bits: bits, startBit: 0)
            guard length > 0 && length < 10000 else { return nil }
            
            // Read CRC
            let storedCRC = readShortWithRedundancy(bits: bits, startBit: 32 * REDUNDANCY_FACTOR)
            
            // Read payload
            let payloadStartBit = (32 + 16) * REDUNDANCY_FACTOR
            var payloadBytes = [UInt8](repeating: 0, count: length)
            for i in 0..<length {
                payloadBytes[i] = readByteWithRedundancy(bits: bits, startBit: payloadStartBit + i * 8 * REDUNDANCY_FACTOR)
            }
            
            // Verify CRC
            let calculatedCRC = calculateCRC16(payloadBytes)
            guard storedCRC == calculatedCRC else { return nil }
            
            // Parse payload
            guard let payload = String(bytes: payloadBytes, encoding: .utf8),
                  payload.hasPrefix(MAGIC_HEADER) else { return nil }
            
            return String(payload.dropFirst(MAGIC_HEADER.count + 1))
        }
        
        AsyncFunction("verifyLSB") { (imageBase64: String) -> Bool in
            guard let imageData = Data(base64Encoded: imageBase64),
                  let image = UIImage(data: imageData),
                  let cgImage = image.cgImage else { return false }
            
            // Quick check - just verify magic header exists
            let width = cgImage.width
            let height = cgImage.height
            
            guard let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: 4 * width,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            
            guard let pixelData = context.data else { return false }
            let pixels = pixelData.bindMemory(to: UInt8.self, capacity: width * height * 4)
            
            // Extract just enough bits to check length and header
            let checkBits = min(10000, width * height * BITS_PER_PIXEL)
            var bits = [Bool](repeating: false, count: checkBits)
            var bitIndex = 0
            
            for y in 0..<height {
                for x in 0..<width {
                    if bitIndex >= checkBits { break }
                    let pixelIndex = (y * width + x) * 4
                    
                    if bitIndex < checkBits {
                        bits[bitIndex] = (pixels[pixelIndex] & 1) == 1
                        bitIndex += 1
                    }
                    if bitIndex < checkBits {
                        bits[bitIndex] = (pixels[pixelIndex + 1] & 1) == 1
                        bitIndex += 1
                    }
                    if bitIndex < checkBits {
                        bits[bitIndex] = (pixels[pixelIndex + 2] & 1) == 1
                        bitIndex += 1
                    }
                }
            }
            
            let length = readIntWithRedundancy(bits: bits, startBit: 0)
            guard length > 0 && length < 10000 else { return false }
            
            // Check for magic header
            let headerBytes = Array(MAGIC_HEADER.utf8)
            guard length >= headerBytes.count else { return false }
            
            let payloadStartBit = (32 + 16) * REDUNDANCY_FACTOR
            var firstBytes = [UInt8](repeating: 0, count: headerBytes.count)
            for i in 0..<headerBytes.count {
                firstBytes[i] = readByteWithRedundancy(bits: bits, startBit: payloadStartBit + i * 8 * REDUNDANCY_FACTOR)
            }
            
            return firstBytes == headerBytes
        }
    }
    
    private func buildBitStream(length: Int, crc: UInt16, payload: [UInt8]) -> [Bool] {
        let totalBits = (32 + 16 + payload.count * 8) * REDUNDANCY_FACTOR
        var bits = [Bool](repeating: false, count: totalBits)
        var bitIndex = 0
        
        // Write length (32 bits) with redundancy
        for i in stride(from: 31, through: 0, by: -1) {
            let bit = ((length >> i) & 1) == 1
            for _ in 0..<REDUNDANCY_FACTOR {
                bits[bitIndex] = bit
                bitIndex += 1
            }
        }
        
        // Write CRC (16 bits) with redundancy
        for i in stride(from: 15, through: 0, by: -1) {
            let bit = ((Int(crc) >> i) & 1) == 1
            for _ in 0..<REDUNDANCY_FACTOR {
                bits[bitIndex] = bit
                bitIndex += 1
            }
        }
        
        // Write payload with redundancy
        for byte in payload {
            for i in stride(from: 7, through: 0, by: -1) {
                let bit = ((Int(byte) >> i) & 1) == 1
                for _ in 0..<REDUNDANCY_FACTOR {
                    bits[bitIndex] = bit
                    bitIndex += 1
                }
            }
        }
        
        return bits
    }
    
    private func readIntWithRedundancy(bits: [Bool], startBit: Int) -> Int {
        var value = 0
        for i in 0..<32 {
            var ones = 0
            for r in 0..<REDUNDANCY_FACTOR {
                let idx = startBit + i * REDUNDANCY_FACTOR + r
                if idx < bits.count && bits[idx] { ones += 1 }
            }
            let bit = ones > REDUNDANCY_FACTOR / 2
            value = (value << 1) | (bit ? 1 : 0)
        }
        return value
    }
    
    private func readShortWithRedundancy(bits: [Bool], startBit: Int) -> UInt16 {
        var value: UInt16 = 0
        for i in 0..<16 {
            var ones = 0
            for r in 0..<REDUNDANCY_FACTOR {
                let idx = startBit + i * REDUNDANCY_FACTOR + r
                if idx < bits.count && bits[idx] { ones += 1 }
            }
            let bit = ones > REDUNDANCY_FACTOR / 2
            value = (value << 1) | (bit ? 1 : 0)
        }
        return value
    }
    
    private func readByteWithRedundancy(bits: [Bool], startBit: Int) -> UInt8 {
        var value: UInt8 = 0
        for i in 0..<8 {
            var ones = 0
            for r in 0..<REDUNDANCY_FACTOR {
                let idx = startBit + i * REDUNDANCY_FACTOR + r
                if idx < bits.count && bits[idx] { ones += 1 }
            }
            let bit = ones > REDUNDANCY_FACTOR / 2
            value = (value << 1) | (bit ? 1 : 0)
        }
        return value
    }
    
    private func calculateCRC16(_ data: [UInt8]) -> UInt16 {
        var crc: UInt16 = 0xFFFF
        for byte in data {
            crc ^= UInt16(byte)
            for _ in 0..<8 {
                if (crc & 1) != 0 {
                    crc = (crc >> 1) ^ 0xA001
                } else {
                    crc = crc >> 1
                }
            }
        }
        return crc
    }
}
