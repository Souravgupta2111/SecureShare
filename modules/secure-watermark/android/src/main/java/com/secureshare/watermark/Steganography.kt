package com.secureshare.watermark

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Log

object Steganography {
    private const val TAG = "Steganography"

    // Delimiters matching JS implementation
    private const val START_DELIMITER = "###SWMK###"
    private const val END_DELIMITER = "###ENDWM###"

    // Maximum image dimensions to prevent OOM
    private const val MAX_WIDTH = 4096
    private const val MAX_HEIGHT = 4096
    private const val MAX_MESSAGE_LENGTH = 1000

    /**
     * Embeds a secret message into the image using LSB steganography.
     * The message is wrapped in delimiters for verification.
     * Memory-safe version with size limits.
     */
    fun embed(image: Bitmap, message: String): Bitmap? {
        // Validate image dimensions
        if (image.width > MAX_WIDTH || image.height > MAX_HEIGHT) {
            Log.e(TAG, "Image too large: ${image.width}x${image.height}")
            return null
        }

        // Validate message length
        if (message.length > MAX_MESSAGE_LENGTH) {
            Log.e(TAG, "Message too long: ${message.length} chars")
            return null
        }

        val encodedMessage = START_DELIMITER + message + END_DELIMITER
        val width = image.width
        val height = image.height

        // Check capacity
        val maxCapacity = width * height
        val requiredBits = (encodedMessage.length + 1) * 8 // +1 for null terminator
        if (requiredBits > maxCapacity) {
            Log.e(TAG, "Message too long for image. Capacity: $maxCapacity bits, Required: $requiredBits bits")
            return null
        }

        val newImage = image.copy(Bitmap.Config.ARGB_8888, true) ?: return null

        // Convert message to binary string
        val binaryMessage = StringBuilder()
        for (char in encodedMessage) {
            val binaryChar = Integer.toBinaryString(char.code).padStart(8, '0')
            binaryMessage.append(binaryChar)
        }

        // Add null terminator (8 zeros)
        binaryMessage.append("00000000")

        var messageIndex = 0
        val totalBits = binaryMessage.length

        for (y in 0 until height) {
            for (x in 0 until width) {
                if (messageIndex >= totalBits) break

                try {
                    val pixel = image.getPixel(x, y)
                    val r = Color.red(pixel)
                    val g = Color.green(pixel)
                    val b = Color.blue(pixel)
                    val a = Color.alpha(pixel)

                    // Get the bit to hide (0 or 1)
                    val bit = binaryMessage[messageIndex].toString().toInt()

                    // Modify the LSB of the blue channel
                    val newB = (b and 0xFE) or bit

                    newImage.setPixel(x, y, Color.argb(a, r, g, newB))
                    messageIndex++
                } catch (e: Exception) {
                    Log.e(TAG, "Error embedding at ($x, $y): ${e.message}")
                }
            }
        }

        return newImage
    }

    /**
     * Extracts the hidden message from the image.
     * Returns the FULL message including delimiters (caller handles parsing).
     */
    fun extract(image: Bitmap): String? {
        val width = image.width
        val height = image.height
        val binaryMessage = StringBuilder()

        loop@ for (y in 0 until height) {
            for (x in 0 until width) {
                val pixel = try {
                    image.getPixel(x, y)
                } catch (e: Exception) {
                    continue
                }
                val b = Color.blue(pixel)

                // Extract LSB
                val lsb = b and 1
                binaryMessage.append(lsb)

                // Check for null terminator every 8 bits
                if (binaryMessage.length % 8 == 0) {
                    val lastByte = binaryMessage.takeLast(8).toString()
                    if (lastByte == "00000000") {
                        // Null terminator found, stop extraction
                        break@loop
                    }
                }

                // Safety limit to prevent infinite loops
                if (binaryMessage.length > width * height * 2) {
                    Log.w(TAG, "Extraction exceeded safety limit")
                    break@loop
                }
            }
        }

        // Convert binary to string
        val message = StringBuilder()
        val binaryStr = binaryMessage.toString()
        val dataBits = if (binaryStr.length >= 8) binaryStr.substring(0, binaryStr.length - 8) else binaryStr

        for (i in 0 until dataBits.length step 8) {
            if (i + 8 <= dataBits.length) {
                val byte = dataBits.substring(i, i + 8)
                try {
                    val charCode = Integer.parseInt(byte, 2)
                    if (charCode in 1..0x10FFFF) { // Valid Unicode range
                        message.append(charCode.toChar())
                    }
                } catch (e: NumberFormatException) {
                    // Skip invalid bytes
                }
            }
        }

        val result = message.toString()

        // Return FULL result including delimiters for JS to parse
        return if (result.isNotEmpty()) result else null
    }

    /**
     * Verifies if the image contains a valid watermark.
     * Checks for presence of start delimiter.
     */
    fun verify(image: Bitmap): Boolean {
        return extract(image)?.contains(START_DELIMITER) == true
    }

    /**
     * Extract payload from a full message with delimiters.
     * Returns the content between START_DELIMITER and END_DELIMITER.
     */
    fun extractPayload(fullMessage: String): String? {
        if (fullMessage.contains(START_DELIMITER) && fullMessage.contains(END_DELIMITER)) {
            return fullMessage.substringAfter(START_DELIMITER)
                .substringBefore(END_DELIMITER)
        }
        return null
    }
}
