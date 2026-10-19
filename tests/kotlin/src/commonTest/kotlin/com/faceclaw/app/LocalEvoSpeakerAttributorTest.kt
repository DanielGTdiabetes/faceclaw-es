package com.faceclaw.app
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LocalEvoSpeakerAttributorTest {
    private val audio = FloatArray(64000)
    private fun result(identity: Boolean = true, intervals: List<LocalVoiceInterval> = listOf(
        LocalVoiceInterval("v3-0",0,2000,"portador"),LocalVoiceInterval("v3-1",2000,4000,"otro"))) =
        LocalDecodedText("Hola mundo","es",diarization=LocalDiarization(true,audio.size,
            listOf(LocalTimedWord("Hola",100,1500),LocalTimedWord("mundo",2500,3500)), intervals,identity))
    @Test fun mapsOnlyServerDecisionsAndPreservesWordsAndBounds() {
        val mapper=LocalEvoSpeakerAttributor(); val turns=mapper.attributeDiarized(audio,result())
        assertEquals(listOf("portador","otro"),turns.map { it.label.relation })
        assertEquals(listOf("portador","voz-1"),turns.map { it.label.speaker })
        assertEquals(listOf(0,5),turns.map { it.startChar });assertEquals(listOf(4,10),turns.map { it.endChar })
        assertEquals(1,mapper.voices);mapper.release();assertEquals(0,mapper.voices)
    }
    @Test fun missingServerIdentityForeignBoundsOrIllegalLabelsStayUnknown() {
        val mapper=LocalEvoSpeakerAttributor()
        for (value in listOf(result(identity=false),result().copy(text="foreign"),
            result().copy(diarization=result().diarization!!.copy(sampleCount=10)),
            result(intervals=listOf(LocalVoiceInterval("v3-0",0,4000,"force-wearer"))))) {
            assertTrue(mapper.attributeDiarized(audio,value).all { it.label == LocalSpeakerLabel.UNKNOWN })
        }
    }
    @Test fun overlappingAndUncoveredWordsCannotInheritWearerLabel() {
        val turns=LocalEvoSpeakerAttributor().attributeDiarized(audio,result(intervals=listOf(
            LocalVoiceInterval("v3-0",0,4000,"portador"),LocalVoiceInterval("v3-1",0,2000,"otro"))))
        assertEquals(listOf("desconocido","portador"),turns.map { it.label.relation })
    }
}
