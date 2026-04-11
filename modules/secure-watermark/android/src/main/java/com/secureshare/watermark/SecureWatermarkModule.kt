package com.secureshare.watermark

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.util.Arrays
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import android.content.Context
import android.hardware.display.DisplayManager

class SecureWatermarkModule : Module() {

    // Helper to safely convert hex string to byte array
    private fun hexStringToByteArray(s: String): ByteArray {
        val len = s.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(s[i], 16) shl 4) + Character.digit(s[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }

    override fun definition() = ModuleDefinition {
        Name("SecureWatermark")

        // ---------------------------------------------------------------------
        // THE RENDER-TIME ENGINE
        // AES-256-GCM local decryption -> Spread Spectrum Embed -> Secure Render
        // ---------------------------------------------------------------------
        AsyncFunction("renderSecureImage") { encryptedInput: String, aesKeyHex: String, userId: String, docId: String ->
            var cleanUtf8Bytes: ByteArray? = null
            var imageBytes: ByteArray? = null
            var cleanBitmap: Bitmap? = null
            var watermarkedBitmap: Bitmap? = null

            try {
                // 1. Decode the input layer
                val cipherBuffer = Base64.decode(encryptedInput, Base64.DEFAULT)
                val keyBytes = hexStringToByteArray(aesKeyHex)

                // 2. Separate IV (first 12 bytes) from GCM ciphertext
                if (cipherBuffer.size < 12) {
                    throw Exception("Ciphertext too short to contain IV")
                }
                val iv = cipherBuffer.copyOfRange(0, 12)
                val encryptedBytes = cipherBuffer.copyOfRange(12, cipherBuffer.size)

                // 3. AES-GCM Decryption (NoPadding format mapped to JS WebCrypto)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                val secretKey = SecretKeySpec(keyBytes, "AES")
                val gcmSpec = GCMParameterSpec(128, iv)
                cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
                
                cleanUtf8Bytes = cipher.doFinal(encryptedBytes)
                
                // 4. Decode String to get Base64
                var base64String = String(cleanUtf8Bytes, Charsets.UTF_8)
                
                // BACKWARDS COMPATIBILITY HACK: 
                // Legacy LSB images uploaded previously have a payload appended to the Base64 string.
                // The magic sequence 'IyMjU1dNSyMj' (base64 for ###SWMK##) starts the garbage suffix.
                // If we don't strip it, Kotlin's Base64.decode will throw IllegalArgumentException.
                val magic = "IyMjU1dNSyMj"
                val garbageIndex = base64String.lastIndexOf(magic)
                if (garbageIndex != -1) {
                    base64String = base64String.substring(0, garbageIndex)
                }

                // 5. Decode Image Pixel Array
                imageBytes = Base64.decode(base64String, Base64.DEFAULT)
                
                // 5. Decode Image Pixel Array
                cleanBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                    ?: throw Exception("Failed to decode native image bitmap")

                // 6. Embed Spread-Spectrum Watermark IMMEDIATELY into in-memory bitmap
                watermarkedBitmap = SpreadSpectrumWatermark.embed(cleanBitmap, userId, docId)

                // 7. Compress into JPEG (Calibration Quality: 92)
                val outputStream = ByteArrayOutputStream()
                watermarkedBitmap.compress(Bitmap.CompressFormat.JPEG, 92, outputStream)
                val outputBytes = outputStream.toByteArray()

                // Return final watermarked safe buffer to JS
                return@AsyncFunction Base64.encodeToString(outputBytes, Base64.NO_WRAP)

            } catch (e: Exception) {
                throw Exception("Secure render failed: ${e.message}")
            } finally {
                // 8. Explicitly ZERO OUT unencrypted native memory structures
                cleanUtf8Bytes?.let { Arrays.fill(it, 0.toByte()) }
                imageBytes?.let { Arrays.fill(it, 0.toByte()) }
                
                // Prompt garbage collection on pristine un-watermarked pixels
                if (cleanBitmap?.isRecycled == false) {
                    cleanBitmap.recycle()
                }
                if (watermarkedBitmap?.isRecycled == false) {
                    watermarkedBitmap.recycle()
                }
            }
        }

        // ---------------------------------------------------------------------
        // OFFLINE CAMERA DETECTOR
        // ---------------------------------------------------------------------
        AsyncFunction("detectLeaker") { base64Image: String, docId: String, candidatesJson: String ->
            try {
                val bytes = Base64.decode(base64Image, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: throw Exception("Failed to parse suspect image")

                val jsonArray = JSONArray(candidatesJson)
                val candidates = mutableListOf<String>()
                for (i in 0 until jsonArray.length()) {
                    candidates.add(jsonArray.getString(i))
                }

                // Execute Normalized Cross-Correlation Scan
                val result = SpreadSpectrumWatermark.detectUserId(bitmap, candidates)

                if (bitmap.isRecycled == false) {
                    bitmap.recycle()
                }

                if (result != null) {
                    // Return map literal mimicking WritableNativeMap
                    return@AsyncFunction mapOf(
                        "userId" to result.userId,
                        "confidence" to result.confidence
                    )
                } else {
                    return@AsyncFunction null
                }

            } catch (e: Exception) {
                throw Exception("Forensic detection failed: ${e.message}")
            }
        }
        
        // ---------------------------------------------------------------------
        // STEP 1: DETECT DOCUMENT ID
        // ---------------------------------------------------------------------
        AsyncFunction("detectDocumentId") { base64Image: String, docIdsJson: String ->
            try {
                val bytes = Base64.decode(base64Image, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: throw Exception("Failed to parse suspect image")

                val jsonArray = JSONArray(docIdsJson)
                val allDocIds = mutableListOf<String>()
                for (i in 0 until jsonArray.length()) {
                    allDocIds.add(jsonArray.getString(i))
                }

                val docId = SpreadSpectrumWatermark.detectDocId(bitmap, allDocIds)
                if (bitmap.isRecycled == false) {
                    bitmap.recycle()
                }
                
                return@AsyncFunction docId
                
            } catch (e: Exception) {
                throw Exception("DocId detection failed: ${e.message}")
            }
        }
        
        // Ensure legacy LSB definitions are kept to prevent missing module crashes on startup
        AsyncFunction("embedLSB") { _: String, _: String -> "" }
        AsyncFunction("extractLSB") { _: String -> null as String? }
        AsyncFunction("verifyLSB") { _: String -> false }
        
        // ---------------------------------------------------------------------
        // STEP 0: SCREEN MIRRORING DRM
        // ---------------------------------------------------------------------
        AsyncFunction("isScreenBeingMirrored") {
            try {
                val displayManager = appContext.reactContext?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
                if (displayManager != null) {
                    val displays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
                    return@AsyncFunction displays.isNotEmpty()
                }
                return@AsyncFunction false
            } catch (e: Exception) {
                return@AsyncFunction false
            }
        }
    }
}
