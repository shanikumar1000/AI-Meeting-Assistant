const { DeepgramClient } = require("@deepgram/sdk");

const deepgram = new DeepgramClient({
    apiKey: process.env.DEEPGRAM_API_KEY
});

async function transcribeAudio(audioUrl) {
    try {
        const response = await deepgram.listen.v1.media.transcribeUrl({
            url: audioUrl,
            model: "nova-3",
            language: "multi",
            smart_format: true
        });

        const channel = response.results?.channels?.[0];
        const alternative = channel?.alternatives?.[0];

        const transcript = alternative?.transcript?.trim();

        console.log("Deepgram detected language:", channel?.detected_language);
        console.log("Transcript:", transcript);

        if (!transcript) {
            throw new Error(
                "No speech detected. Please upload an audio file containing clear speech."
            );
        }

        return transcript;

    } catch (error) {
        console.error("Transcription Error:", error.message);
        throw error;
    }
}

module.exports = { transcribeAudio };