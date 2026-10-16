package com.faceclaw.app

/** Result of FaceclawVoiceController.transcribeBuffer, delivered once on the Android main thread. */
interface FaceclawBufferTranscriptionListener {
    /** [text] is the recognized utterance ("" for silence); [error] is non-null when nothing could run. */
    fun onResult(text: String?, error: String?): Unit
}
