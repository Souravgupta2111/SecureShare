package com.secureshare.watermark
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream

class SecureWatermarkModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SecureWatermark")

        // Async function to embed watermark
        AsyncFunction("embedLSB") { imageBase64: String, watermarkText: String ->
            try {
                val decodedBytes = Base64.decode(imageBase64, Base64.DEFAULT)
                if (decodedBytes.isEmpty()) {
                    throw Exception("Invalid image data: empty base64")
                }

                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    ?: throw Exception("Failed to decode image bitmap")

                val watermarkedBitmap = Steganography.embed(bitmap, watermarkText)
                    ?: throw Exception("Failed to embed watermark: image too large or message too long")

                val outputStream = ByteArrayOutputStream()
                watermarkedBitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                val outputBytes = outputStream.toByteArray()

                // Recycle bitmaps to free memory
                if (!bitmap.isRecycled) bitmap.recycle()
                if (!watermarkedBitmap.isRecycled) watermarkedBitmap.recycle()

                Base64.encodeToString(outputBytes, Base64.NO_WRAP)
            } catch (e: Exception) {
                throw Exception("Failed to embed watermark: ${e.message}")
            }
        }

        // Async function to extract watermark - returns FULL message with delimiters
        AsyncFunction("extractLSB") { imageBase64: String ->
            try {
                val decodedBytes = Base64.decode(imageBase64, Base64.DEFAULT)
                if (decodedBytes.isEmpty()) {
                    return@AsyncFunction null
                }

                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    ?: return@AsyncFunction null

                val result = Steganography.extract(bitmap)

                // Recycle bitmap to free memory
                if (!bitmap.isRecycled) bitmap.recycle()

                // Return null if no watermark found, otherwise return full message
                result
            } catch (e: Exception) {
                // Return null on any error - extraction failures are expected for non-watermarked images
                null
            }
        }

        // Async function to verify watermark presence
        AsyncFunction("verifyLSB") { imageBase64: String ->
            try {
                val decodedBytes = Base64.decode(imageBase64, Base64.DEFAULT)
                if (decodedBytes.isEmpty()) {
                    return@AsyncFunction false
                }

                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    ?: return@AsyncFunction false

                val result = Steganography.verify(bitmap)

                // Recycle bitmap to free memory
                if (!bitmap.isRecycled) bitmap.recycle()

                result
            } catch (e: Exception) {
                false
            }
        }

        // Legacy synchronous methods (not recommended for large images, but kept for compatibility)
        Function("embed") { imageBase64: String, watermarkText: String ->
            try {
                val decodedBytes = Base64.decode(imageBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    ?: throw Exception("Failed to decode image")

                val watermarkedBitmap = Steganography.embed(bitmap, watermarkText)
                    ?: throw Exception("Failed to embed watermark")

                val outputStream = ByteArrayOutputStream()
                watermarkedBitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)

                // Recycle bitmaps
                if (!bitmap.isRecycled) bitmap.recycle()
                if (!watermarkedBitmap.isRecycled) watermarkedBitmap.recycle()

                Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
            } catch (e: Exception) {
                throw Exception("Embed failed: ${e.message}")
            }
        }

        Function("verify") { imageBase64: String ->
            try {
                val decodedBytes = Base64.decode(imageBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    ?: return@Function false

                val result = Steganography.verify(bitmap)

                // Recycle bitmap
                if (!bitmap.isRecycled) bitmap.recycle()

                result
            } catch (e: Exception) {
                false
            }
        }
    }
}
