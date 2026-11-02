const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const { transcribeAudio } = require("../services/transcriptionService");
const { analyzeMeeting } = require("../services/analysisService");
const authMiddleware = require("../middleware/authMiddleware");

// 1. Upload audio
router.post("/upload", authMiddleware, async (req, res) => {
    try {
        const { fileName, fileType, fileBase64 } = req.body;

        const allowedTypes = new Set([
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-wav",
            "audio/mp4",
            "audio/m4a",
            "audio/webm",
            "audio/ogg"
        ]);

        if (
            typeof fileName !== "string" ||
            typeof fileType !== "string" ||
            typeof fileBase64 !== "string" ||
            !fileName.trim() ||
            !fileBase64.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid audio file details are required."
            });
        }

        const normalizedFileType = fileType.toLowerCase();

        if (!allowedTypes.has(normalizedFileType)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported audio format."
            });
        }

        // Normalize Base64 data.
        const normalizedBase64 = fileBase64.replace(/\s/g, "");

        if (
            normalizedBase64.length === 0 ||
            normalizedBase64.length % 4 !== 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid audio data."
            });
        }

        // Decode and validate Base64 without a large complex regex.
        const fileBuffer = Buffer.from(normalizedBase64, "base64");

        if (
            fileBuffer.length === 0 ||
            fileBuffer.toString("base64") !== normalizedBase64
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid audio data."
            });
        }

        const maxFileSize = 35 * 1024 * 1024;

        if (fileBuffer.length > maxFileSize) {
            return res.status(413).json({
                success: false,
                message: "Audio file exceeds the 35 MB limit."
            });
        }

        const safeFileName = fileName
            .split(/[\\/]/)
            .pop()
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .slice(0, 120);

        if (!safeFileName) {
            return res.status(400).json({
                success: false,
                message: "Invalid audio filename."
            });
        }

        const filePath = `${req.user.id}/${Date.now()}-${safeFileName}`;

        const { data, error } = await supabase.storage
            .from("meeting-audio")
            .upload(filePath, fileBuffer, {
                contentType: normalizedFileType,
                upsert: false
            });

        if (error) throw error;

        const { data: signedUrl, error: urlError } = await supabase.storage
            .from("meeting-audio")
            .createSignedUrl(data.path, 3600);

        if (urlError) throw urlError;

        return res.status(200).json({
            success: true,
            message: "Audio uploaded successfully.",
            audioPath: data.path,
            audioUrl: signedUrl.signedUrl
        });

    } catch (error) {
        console.error("Audio Upload Error:", error.stack || error);

        return res.status(500).json({
            success: false,
            message: "Audio upload failed. Please try again."
        });
    }
});

// 2. Process meeting
router.post("/process", authMiddleware, async (req, res) => {
    try {
        const { audioPath } = req.body;

        if (typeof audioPath !== "string" || !audioPath.trim()) {
            return res.status(400).json({
                success: false,
                message: "Audio storage path is required."
            });
        }

        const expectedPrefix = `${req.user.id}/`;

        if (!audioPath.startsWith(expectedPrefix) || audioPath.includes("..")) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to process this audio file."
            });
        }

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from("meeting-audio")
            .createSignedUrl(audioPath, 3600);

        if (signedUrlError || !signedUrlData?.signedUrl) {
            console.error("Audio URL generation error:", signedUrlError?.message);

            return res.status(400).json({
                success: false,
                message: "Audio file could not be accessed. Please upload it again."
            });
        }

        console.log("Starting transcription...");

        const transcript = await transcribeAudio(signedUrlData.signedUrl);

        if (!transcript || !transcript.trim()) {
            throw new Error("No speech detected in the audio.");
        }

        console.log("Transcription completed.");
        console.log("Starting meeting analysis...");

        const analysis = await analyzeMeeting(transcript);

        console.log("Meeting analysis completed.");

        const { data: meeting, error: meetingError } = await supabase
            .from("meetings")
            .insert({
                user_id: req.user.id,
                title: analysis.title,
                audio_url: audioPath,
                status: "completed"
            })
            .select()
            .single();

        if (meetingError) throw meetingError;

        const { error: transcriptError } = await supabase
            .from("transcripts")
            .insert({
                meeting_id: meeting.id,
                content: transcript
            });

        if (transcriptError) throw transcriptError;

        const { error: analysisError } = await supabase
            .from("meeting_analysis")
            .insert({
                meeting_id: meeting.id,
                summary: analysis.summary,
                key_points: analysis.key_points,
                decisions: analysis.decisions,
                questions: analysis.questions
            });

        if (analysisError) throw analysisError;

        if (analysis.tasks && analysis.tasks.length > 0) {
            const taskRecords = analysis.tasks.map(task => ({
                meeting_id: meeting.id,
                title: task.title,
                description: task.description
            }));

            const { error: tasksError } = await supabase
                .from("tasks")
                .insert(taskRecords);

            if (tasksError) throw tasksError;
        }

        return res.status(200).json({
            success: true,
            message: "Meeting processed and saved successfully.",
            meetingId: meeting.id,
            transcript,
            analysis
        });

    } catch (error) {
        console.error("Meeting Processing Error:", error.stack || error);

        return res.status(500).json({
            success: false,
            message: "Meeting processing failed. Please try again."
        });
    }
});


// 3. Get meeting history
router.get("/history", authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("meetings")
            .select("*")
            .eq("user_id", req.user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return res.status(200).json({
            success: true,
            meetings: data
        });

    } catch (error) {
        console.error("Meeting History Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch meeting history."
        });
    }
});


// 4. Get analytics
router.get("/analytics", authMiddleware, async (req, res) => {
    try {
        const { count, error: meetingError } = await supabase
            .from("meetings")
            .select("*", { count: "exact", head: true })
            .eq("user_id", req.user.id);

        if (meetingError) throw meetingError;

        const { data: tasks, error: taskError } = await supabase
            .from("tasks")
            .select(`
                id,
                status,
                meetings!inner(user_id)
            `)
            .eq("meetings.user_id", req.user.id);

        if (taskError) throw taskError;

        const totalTasks = tasks.length;

        const completedTasks = tasks.filter(
            task => task.status === "completed"
        ).length;

        const pendingTasks = tasks.filter(
            task => task.status === "pending"
        ).length;

        const inProgressTasks = tasks.filter(
            task => task.status === "in_progress"
        ).length;

        return res.status(200).json({
            success: true,
            analytics: {
                totalMeetings: count || 0,
                totalTasks,
                completedTasks,
                pendingTasks,
                inProgressTasks
            }
        });

    } catch (error) {
        console.error("Analytics Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch analytics."
        });
    }
});


// 5. Get individual meeting details
router.get("/:meetingId", authMiddleware, async (req, res) => {
    try {
        const { meetingId } = req.params;

        const { data: meeting, error: meetingError } = await supabase
            .from("meetings")
            .select("*")
            .eq("id", meetingId)
            .eq("user_id", req.user.id)
            .single();

        if (meetingError || !meeting) {
            return res.status(404).json({
                success: false,
                message: "Meeting not found."
            });
        }

        const { data: transcript, error: transcriptError } = await supabase
            .from("transcripts")
            .select("*")
            .eq("meeting_id", meetingId)
            .maybeSingle();

        if (transcriptError) throw transcriptError;

        const { data: analysis, error: analysisError } = await supabase
            .from("meeting_analysis")
            .select("*")
            .eq("meeting_id", meetingId)
            .maybeSingle();

        if (analysisError) throw analysisError;

        const { data: tasks, error: tasksError } = await supabase
            .from("tasks")
            .select("*")
            .eq("meeting_id", meetingId)
            .order("created_at", { ascending: true });

        if (tasksError) throw tasksError;

        return res.status(200).json({
            success: true,
            meeting,
            transcript,
            analysis,
            tasks: tasks || []
        });

    } catch (error) {
        console.error("Meeting Details Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch meeting details."
        });
    }
});


// 6. Update task status
router.patch("/tasks/:taskId/status", authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;

        const allowedStatuses = [
            "pending",
            "in_progress",
            "completed"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid task status."
            });
        }

        // Verify that the task belongs to the authenticated user.
        const { data: task, error: taskError } = await supabase
            .from("tasks")
            .select(`
                id,
                meeting_id,
                meetings!inner(user_id)
            `)
            .eq("id", taskId)
            .eq("meetings.user_id", req.user.id)
            .maybeSingle();

        if (taskError) throw taskError;

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found."
            });
        }

        const { data: updatedTask, error: updateError } = await supabase
            .from("tasks")
            .update({ status })
            .eq("id", taskId)
            .eq("meeting_id", task.meeting_id)
            .select()
            .single();

        if (updateError) throw updateError;

        return res.status(200).json({
            success: true,
            message: "Task status updated successfully.",
            task: updatedTask
        });

    } catch (error) {
        console.error("Task Update Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to update task status."
        });
    }
});
// 7. Delete meeting
router.delete("/:meetingId", authMiddleware, async (req, res) => {
    try {
        const { meetingId } = req.params;

        // Verify ownership before deleting anything.
        const { data: meeting, error: meetingError } = await supabase
            .from("meetings")
            .select("id, audio_url")
            .eq("id", meetingId)
            .eq("user_id", req.user.id)
            .maybeSingle();

        if (meetingError) throw meetingError;

        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: "Meeting not found."
            });
        }

        // Remove the associated audio file, if available.
        if (meeting.audio_url) {
            const { error: storageError } = await supabase.storage
                .from("meeting-audio")
                .remove([meeting.audio_url]);

            if (storageError) {
                console.error("Storage Delete Error:", storageError.message);
            }
        }

        // Delete only the authenticated user's meeting.
        const { error: deleteError } = await supabase
            .from("meetings")
            .delete()
            .eq("id", meetingId)
            .eq("user_id", req.user.id);

        if (deleteError) throw deleteError;

        return res.status(200).json({
            success: true,
            message: "Meeting deleted successfully."
        });

    } catch (error) {
        console.error("Meeting Delete Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to delete meeting."
        });
    }
});


// Export router
module.exports = router;