require("dotenv").config();

const ai = require("./config/gemini");

async function testGemini() {
    try {
        console.log("Testing Gemini connection...");

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: "Summarize this sentence: Our team discussed the project deadline and assigned development tasks."
        });

        console.log("\nGemini connection successful!");
        console.log(response.text);

    } catch (error) {
        console.error("Gemini Error:", error.message);
    }
}

testGemini();