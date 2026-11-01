require("dotenv").config();

const { DeepgramClient } = require("@deepgram/sdk");

const deepgram = new DeepgramClient({
    apiKey: process.env.DEEPGRAM_API_KEY
});

async function testTranscription() {
    try {
        console.log("Testing Deepgram connection...");

        const response = await deepgram.listen.v1.media.transcribeUrl({
            url: "https://dpgr.am/spacewalk.wav",
            model: "nova-3",
            language: "multi",
            smart_format: true
        });

        const transcript =
            response.results.channels[0].alternatives[0].transcript;

        console.log("\nTranscription successful!");
        console.log("\nTranscript:\n", transcript);

    } catch (error) {
        console.error("Deepgram Error:", error.message);
    }
}

testTranscription();