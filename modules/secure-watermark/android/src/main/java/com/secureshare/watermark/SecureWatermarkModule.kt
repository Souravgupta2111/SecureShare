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
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

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

    /**
     * Draw the visible watermark overlay (userId|docId) 20 times across a mutable bitmap.
     * Uses a 4x5 grid with diagonal rotation for maximum coverage.
     */
    private fun drawVisibleOverlay(bitmap: Bitmap, userId: String, docId: String) {
        val canvas = android.graphics.Canvas(bitmap)
        val paint = android.graphics.Paint().apply {
            color = android.graphics.Color.WHITE
            alpha = 30 // ~12% opacity — invisible to casual eye, survives screenshots
            isAntiAlias = true
            textSize = (bitmap.width / 18).toFloat()
            typeface = android.graphics.Typeface.MONOSPACE
        }
        val overlayText = "$userId|$docId"
        val rows = 4
        val cols = 5
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val x = (c.toFloat() * bitmap.width / cols) + 10f
                val y = (r.toFloat() * bitmap.height / rows) + paint.textSize + 10f
                canvas.save()
                canvas.rotate(-30f, x, y) // Diagonal tilt for harder removal
                canvas.drawText(overlayText, x, y, paint)
                canvas.restore()
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("SecureWatermark")

        // ---------------------------------------------------------------------
        // THE RENDER-TIME ENGINE
        // AES-256-GCM local decryption -> Spread Spectrum Embed -> Visible Overlay -> Secure Render
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
                android.util.Log.d("SecureWatermark", "Step 1: cipherBuffer size=${cipherBuffer.size}, keyBytes size=${keyBytes.size}")

                // 2. Separate IV (first 12 bytes) from GCM ciphertext
                if (cipherBuffer.size < 12) {
                    throw Exception("Ciphertext too short to contain IV")
                }
                val iv = cipherBuffer.copyOfRange(0, 12)
                val encryptedBytes = cipherBuffer.copyOfRange(12, cipherBuffer.size)
                android.util.Log.d("SecureWatermark", "Step 2: IV=${iv.size} bytes, encrypted=${encryptedBytes.size} bytes")

                // 3. AES-GCM Decryption (NoPadding format mapped to JS WebCrypto)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                val secretKey = SecretKeySpec(keyBytes, "AES")
                val gcmSpec = GCMParameterSpec(128, iv)
                cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
                
                cleanUtf8Bytes = cipher.doFinal(encryptedBytes)
                android.util.Log.d("SecureWatermark", "Step 3: Decrypted ${cleanUtf8Bytes!!.size} bytes")
                
                // 4. Decode String to get Base64
                var base64String = String(cleanUtf8Bytes, Charsets.UTF_8)
                android.util.Log.d("SecureWatermark", "Step 4: base64String length=${base64String.length}, first 80 chars=${base64String.take(80)}")
                
                // BACKWARDS COMPATIBILITY HACK: 
                // Legacy LSB images uploaded previously have a payload appended to the Base64 string.
                // The magic sequence 'IyMjU1dNSyMj' (base64 for ###SWMK##) starts the garbage suffix.
                // If we don't strip it, Kotlin's Base64.decode will throw IllegalArgumentException.
                val magic = "IyMjU1dNSyMj"
                val garbageIndex = base64String.lastIndexOf(magic)
                if (garbageIndex != -1) {
                    android.util.Log.d("SecureWatermark", "Step 4b: Found legacy delimiter at index $garbageIndex, stripping")
                    base64String = base64String.substring(0, garbageIndex)
                }

                // 5. Decode Image Pixel Array
                imageBytes = Base64.decode(base64String, Base64.DEFAULT)
                android.util.Log.d("SecureWatermark", "Step 5: imageBytes size=${imageBytes!!.size}, first 4 bytes=${imageBytes.take(4).map { it.toInt() and 0xFF }}")
                
                // 6. Decode bitmap from raw image bytes
                cleanBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                    ?: throw Exception("Failed to decode native image bitmap (imageBytes=${imageBytes.size}, header=${imageBytes.take(8).map { String.format("%02X", it) }.joinToString(" ")})")

                // 7. Embed Spread-Spectrum Watermark IMMEDIATELY into in-memory bitmap
                watermarkedBitmap = SpreadSpectrumWatermark.embed(cleanBitmap, userId, docId)

                // 8. Draw visible overlay text (userId|docId) 20 times across image
                drawVisibleOverlay(watermarkedBitmap, userId, docId)

                // 9. Compress into JPEG (Calibration Quality: 92)
                val outputStream = ByteArrayOutputStream()
                watermarkedBitmap.compress(Bitmap.CompressFormat.JPEG, 92, outputStream)
                val outputBytes = outputStream.toByteArray()

                // Return final watermarked safe buffer to JS
                return@AsyncFunction Base64.encodeToString(outputBytes, Base64.NO_WRAP)

            } catch (e: Exception) {
                throw Exception("Secure render failed: ${e.message}")
            } finally {
                // 10. Explicitly ZERO OUT unencrypted native memory structures
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
        // LIGHTWEIGHT EMBED-ONLY (JS decrypts, Kotlin only embeds watermark)
        // Use this when the JS layer has already decrypted the image.
        // ---------------------------------------------------------------------
        AsyncFunction("embedWatermark") { base64Image: String, userId: String, docId: String ->
            var cleanBitmap: Bitmap? = null
            var watermarkedBitmap: Bitmap? = null

            try {
                // 1. Decode the clean base64 image directly
                val imageBytes = Base64.decode(base64Image, Base64.DEFAULT)
                if (imageBytes.isEmpty()) {
                    throw Exception("Empty image data received")
                }

                // 2. Parse into Bitmap
                cleanBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                    ?: throw Exception("Failed to decode image bitmap (size=${imageBytes.size})")

                // 3. Embed Spread-Spectrum Watermark
                watermarkedBitmap = SpreadSpectrumWatermark.embed(cleanBitmap, userId, docId)

                // 4. Draw visible overlay text (userId|docId) 20 times across image
                drawVisibleOverlay(watermarkedBitmap, userId, docId)

                // 5. Compress to JPEG
                val outputStream = ByteArrayOutputStream()
                watermarkedBitmap.compress(Bitmap.CompressFormat.JPEG, 92, outputStream)
                val outputBytes = outputStream.toByteArray()

                return@AsyncFunction Base64.encodeToString(outputBytes, Base64.NO_WRAP)

            } catch (e: Exception) {
                throw Exception("Watermark embed failed: ${e.message}")
            } finally {
                if (cleanBitmap?.isRecycled == false) cleanBitmap.recycle()
                if (watermarkedBitmap?.isRecycled == false) watermarkedBitmap.recycle()
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

        // ---------------------------------------------------------------------
        // VISIBLE WATERMARK READER (ML Kit On-Device OCR)
        // Reads the visible userId|docId overlay text from a suspect image.
        // Returns the raw extracted text so JS can parse it for known emails.
        // ---------------------------------------------------------------------
        AsyncFunction("extractVisibleWatermark") { base64Image: String ->
            val bytes = Base64.decode(base64Image, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw Exception("Failed to parse suspect image for OCR")

            try {
                // Step 1: Boost contrast to amplify the faint overlay
                val w = bitmap.width
                val h = bitmap.height
                val pixels = IntArray(w * h)
                bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

                // Compute mean luminance
                var totalLuma = 0.0
                for (px in pixels) {
                    val r = (px shr 16) and 0xFF
                    val g = (px shr 8) and 0xFF
                    val b = px and 0xFF
                    totalLuma += 0.299 * r + 0.587 * g + 0.114 * b
                }
                val meanLuma = totalLuma / pixels.size

                // Create high-contrast version: amplify deviation from mean by 8x
                val enhancedPixels = IntArray(pixels.size)
                for (i in pixels.indices) {
                    val r = (pixels[i] shr 16) and 0xFF
                    val g = (pixels[i] shr 8) and 0xFF
                    val b = pixels[i] and 0xFF
                    val luma = 0.299 * r + 0.587 * g + 0.114 * b
                    val delta = ((luma - meanLuma) * 8.0).toInt()
                    val v = (128 + delta).coerceIn(0, 255)
                    enhancedPixels[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
                }

                val enhancedBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                enhancedBitmap.setPixels(enhancedPixels, 0, w, 0, 0, w, h)

                // Step 2: Run ML Kit OCR on enhanced image
                val inputImage = InputImage.fromBitmap(enhancedBitmap, 0)
                val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

                val extractedText = suspendCoroutine<String> { cont ->
                    recognizer.process(inputImage)
                        .addOnSuccessListener { visionText ->
                            android.util.Log.d("SecureWatermark", "[OCR] Full text: ${visionText.text}")
                            cont.resume(visionText.text)
                        }
                        .addOnFailureListener { e ->
                            android.util.Log.e("SecureWatermark", "[OCR] Failed: ${e.message}")
                            cont.resume("") // Return empty on failure, don't crash
                        }
                }

                enhancedBitmap.recycle()
                bitmap.recycle()
                recognizer.close()

                return@AsyncFunction extractedText

            } catch (e: Exception) {
                if (!bitmap.isRecycled) bitmap.recycle()
                throw Exception("Visible watermark extraction failed: ${e.message}")
            }
        }
        
        // Ensure legacy LSB definitions are kept to prevent missing module crashes on startup
        // LEGACY MOCK IMPLEMENTATIONS (To prevent JS crashes when switching from Option B to Option D)
        AsyncFunction("embedLSB") { base64Image: String, _: String -> 
            // Option D handles embedding at Render-Time.
            // Upload the pristine unaltered image base64.
            return@AsyncFunction base64Image 
        }
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
