package com.secureshare.watermark

import android.graphics.Bitmap
import android.util.Log
import java.nio.ByteBuffer
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.max
import kotlin.math.min

object SpreadSpectrumWatermark {

    private const val TAG = "SpreadSpectrumWatermark"
    private const val TILE_SIZE = 256
    private const val STRENGTH = 18 // Boosted from 8 to easily survive smartphone ISP noise/blur routines
    private const val DETECTION_THRESHOLD = 1.0f // Lowered to ensure verification successfully catches cropped camera screenshots
    // Securely injected key for deterministic pseudo-random noise generation
    private val SECRET_KEY = BuildConfig.WATERMARK_SECRET

    /**
     * STABLE CROSS-PLATFORM SEED
     * Uses HMAC-SHA256 to ensure determinism across JS, iOS, and Kotlin.
     */
    fun stableSeed(id: String): Long {
        try {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(SECRET_KEY.toByteArray(), "HmacSHA256"))
            val hash = mac.doFinal(id.toByteArray())
            return ByteBuffer.wrap(hash.copyOf(8)).long
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate stable seed: ${e.message}")
            return id.hashCode().toLong()
        }
    }

    /**
     * TILE GENERATOR
     * Generates a 256x256 PRNG noise matrix of bipolar values (+STRENGTH or -STRENGTH)
     */
    fun generateTile(id: String): FloatArray {
        val tile = FloatArray(TILE_SIZE * TILE_SIZE)
        var s = stableSeed(id)
        for (i in tile.indices) {
            s = s * 6364136223846793005L + 1442695040888963407L
            tile[i] = if ((s ushr 32) and 1L == 1L) STRENGTH.toFloat()
            else -STRENGTH.toFloat()
        }
        return tile
    }

    /**
     * EMBED
     * Layers two orthogonal Spread Spectrum tiles (one for userId, one for docId).
     * Modifies the global luminance channel uniformly across RGB to maintain color balance.
     */
    fun embed(bitmap: Bitmap, userId: String, docId: String): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        // Memory efficient native bulk access
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        val userTile = generateTile(userId)
        val docTile = generateTile(docId)

        for (i in pixels.indices) {
            val x = i % w
            val y = i / w
            
            // Normalize physical coordinates to a fixed virtual grid (Scale-Invariant Math)
            // Width is fixed to 1024 relative units, Height is proportional relative to 1024.
            val normX = (x * 1024) / w
            val normY = (y * 1024) / h
            val tileIdx = (normY % TILE_SIZE) * TILE_SIZE + (normX % TILE_SIZE)
            
            // Proportional signal weights (60% user, 40% document)
            val delta = (userTile[tileIdx] * 0.6f) + (docTile[tileIdx] * 0.4f)

            val r = (pixels[i] shr 16) and 0xFF
            val g = (pixels[i] shr 8) and 0xFF
            val b = pixels[i] and 0xFF

            val nr = (r + delta).toInt().coerceIn(0, 255)
            val ng = (g + delta).toInt().coerceIn(0, 255)
            val nb = (b + delta).toInt().coerceIn(0, 255)

            // Reconstruct the 32-bit ARGB pixel (keep alpha unchanged)
            val a = (pixels[i] shr 24) and 0xFF
            pixels[i] = (a shl 24) or (nr shl 16) or (ng shl 8) or nb
        }

        // Return a fresh Bitmap object representing the forensic ciphertext
        val result = bitmap.copy(Bitmap.Config.ARGB_8888, true) ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        result.setPixels(pixels, 0, w, 0, 0, w, h)
        return result
    }

    /**
     * DETECT DOC ID
     * Uses a lower threshold weight (0.4f) to find the primary embedded document.
     */
    fun detectDocId(suspect: Bitmap, allDocIds: List<String>): String? {
        return correlate(suspect, allDocIds, 0.4f)?.first
    }

    /**
     * DETECT USER ID (Scoped)
     * Takes the candidate list from the previously identified DocId.
     */
    fun detectUserId(suspect: Bitmap, candidates: List<String>): DetectionResult? {
        val result = correlate(suspect, candidates, 0.6f) ?: return null
        return DetectionResult(result.first, result.second)
    }

    /**
     * CORE CORRELATION ALGORITHM
     * Calculates the normalized cross-correlation of the recovered luma channel
     * against dynamically re-generated candidate PRNG grids.
     */
    private fun correlate(
        suspect: Bitmap,
        candidates: List<String>,
        weight: Float
    ): Pair<String, Float>? {
        val w = suspect.width
        val h = suspect.height
        val pixels = IntArray(w * h)
        suspect.getPixels(pixels, 0, w, 0, 0, w, h)

        // Flatten to Luma channel using standard BT.601 conversion
        val luma = FloatArray(pixels.size) { i ->
            val r = (pixels[i] shr 16) and 0xFF
            val g = (pixels[i] shr 8) and 0xFF
            val b = pixels[i] and 0xFF
            0.299f * r + 0.587f * g + 0.114f * b
        }

        // Apply Histogram Normalization to thwart contrast/lighting filters
        val normalized = histogramNormalize(luma)
        
        // Zero-Mean Shift: Critical for isolating the PRNG signal from image content
        var mean = 0f
        for (v in normalized) mean += v
        mean /= normalized.size
        for (i in normalized.indices) {
            normalized[i] -= mean
        }

        var bestId: String? = null
        var bestScore = 0f

        for (id in candidates) {
            val tile = generateTile(id)
            var dot = 0f
            for (i in normalized.indices) {
                val x = i % w
                val y = i / w
                
                // Scale-invariant coordinate evaluation for verification (Aspect Ratio Independent)
                val normX = (x * 1024) / w
                val normY = (y * 1024) / h
                val tileVal = tile[(normY % TILE_SIZE) * TILE_SIZE + (normX % TILE_SIZE)]
                dot += normalized[i] * tileVal * weight
            }
            
            val score = dot / normalized.size
            if (score > bestScore) {
                bestScore = score
                bestId = id
            }
        }

        Log.d(TAG, "Correlation search complete. Best score: $bestScore for ID: $bestId")

        return if (bestScore > DETECTION_THRESHOLD && bestId != null)
            Pair(bestId, bestScore)
        else null
    }

    /**
     * HISTOGRAM NORMALIZE
     * Counteracts color grading attacks, bringing limits to mathematically pure distances.
     */
    private fun histogramNormalize(luma: FloatArray): FloatArray {
        var min = Float.MAX_VALUE
        var max = -Float.MAX_VALUE
        for (v in luma) {
            if (v < min) min = v
            if (v > max) max = v
        }
        
        if (max <= min) return luma // Prevent division by zero
        
        val normalized = FloatArray(luma.size)
        val range = max - min
        for (i in luma.indices) {
            normalized[i] = ((luma[i] - min) / range) * 255f
        }
        return normalized
    }
}

data class DetectionResult(val userId: String, val confidence: Float)
