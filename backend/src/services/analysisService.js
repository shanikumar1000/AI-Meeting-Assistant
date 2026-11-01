const ai = require("../config/gemini");

async function analyzeMeeting(transcript) {
    try {
        const prompt = `
Analyze the following meeting transcript.

Return the response in valid JSON with these five fields:
{
    "title": "Short meeting title",
    "summary": "Brief meeting summary",
    "key_points": ["Point 1", "Point 2"],
    "decisions": ["Decision 1", "Decision 2"],
    "questions": ["Question 1", "Question 2"],
    "tasks": [
        {
            "title": "Task title",
            "description": "Task description"
        }
    ]
}

Meeting Transcript:
${transcript}
`;

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: prompt
        });

        const result = response.text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        return JSON.parse(result);

    } catch (error) {
        console.error("Meeting Analysis Error:", error.message);
        throw error;
    }
}

module.exports = { analyzeMeeting };