import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { jsPDF } from "jspdf";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";
function AnalyticsIcon({ type }) {
  const commonProps = {
    className: "analytics-svg-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  const icons = {
    microphone: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3M8 21h8" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9 5.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" />
        <path d="M8.5 11h7M8.5 15h7" />
      </>
    ),
    completed: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    pending: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    )
  };

  return <svg {...commonProps}>{icons[type]}</svg>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  const [selectedFile, setSelectedFile] = useState(null);
  const [processing, setProcessing] = useState(false);

  const [analytics, setAnalytics] = useState({
    totalMeetings: 0,
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    completionPercentage: 0
  });

  async function getToken() {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("Please log in again.");
    }

    return session.access_token;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadMeetings();
    } else {
      setMeetings([]);
      setSelectedMeeting(null);
      setAnalytics({
        totalMeetings: 0,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        completionPercentage: 0
      });
    }
  }, [user]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthLoading(true);
    setMessage("");

    try {
      let result;

      if (authMode === "login") {
        result = await supabase.auth.signInWithPassword({
          email,
          password
        });
      } else {
        result = await supabase.auth.signUp({
          email,
          password
        });
      }

      if (result.error) throw result.error;

      if (authMode === "signup" && !result.data.session) {
        setMessage("Account created. Please check your email to confirm.");
      } else {
        setMessage("Authentication successful!");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadMeetings() {
    try {
      setLoading(true);

      const token = await getToken();

      const headers = {
        Authorization: `Bearer ${token}`
      };

      const [historyResponse, analyticsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/meetings/history`, {
          headers
        }),
        fetch(`${API_BASE_URL}/api/meetings/analytics`, {
          headers
        })
      ]);

      const historyData = await historyResponse.json();
      const analyticsData = await analyticsResponse.json();

      if (!historyResponse.ok) {
        throw new Error(historyData.message || "Could not load meetings.");
      }

      if (!analyticsResponse.ok) {
        throw new Error(
          analyticsData.message || "Could not load analytics."
        );
      }

      setMeetings(historyData.meetings || []);

      if (analyticsData.success) {
        setAnalytics(analyticsData.analytics);
      }

      const meetingList = historyData.meetings || [];

      setMessage(
        meetingList.length ? "" : "No meetings found."
      );

    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadMeeting() {
    if (!selectedFile) {
      setMessage("Please select an audio file first.");
      return;
    }

    if (selectedFile.size > 35 * 1024 * 1024) {
      setMessage("File is too large. Maximum allowed size is 35 MB.");
      return;
    }

    try {
      setProcessing(true);
      setMessage("Preparing audio file...");

      const token = await getToken();

      const fileBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read audio file."));

        reader.readAsDataURL(selectedFile);
      });

      setMessage("Uploading audio...");

      const uploadResponse = await fetch(
        `${API_BASE_URL}/api/meetings/upload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileType: selectedFile.type || "audio/mpeg",
            fileBase64
          })
        }
      );

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploadData.message || "Audio upload failed.");
      }

      setMessage("Transcribing and analyzing meeting...");

      const processResponse = await fetch(
        `${API_BASE_URL}/api/meetings/process`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            audioUrl: uploadData.audioUrl,
            audioPath: uploadData.audioPath
          })
        }
      );

      const processData = await processResponse.json();

      if (!processResponse.ok) {
        throw new Error(processData.message || "Meeting processing failed.");
      }

      setSelectedFile(null);
      setMessage("Meeting processed successfully!");

      await loadMeetings();

    } catch (error) {
      setMessage(error.message);
    } finally {
      setProcessing(false);
    }
  }

  async function openMeeting(meetingId) {
    setLoading(true);
    setMessage("Loading meeting details...");

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/api/meetings/${meetingId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) throw new Error(data.message);

      setSelectedMeeting(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId, status) {
    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/api/meetings/tasks/${taskId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ status })
        }
      );

      const data = await response.json();

      if (!response.ok) throw new Error(data.message);

      setSelectedMeeting((previous) => ({
        ...previous,
        tasks: previous.tasks.map((task) =>
          task.id === taskId ? data.task : task
        )
      }));

      await loadMeetings();

    } catch (error) {
      alert(error.message);
    }
  }

  // Export meeting report as PDF
  function exportMeetingPDF() {
    try {
      const { meeting, transcript, analysis, tasks } = selectedMeeting;

      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      let y = 25;

      function addPageIfNeeded(requiredHeight) {
        if (y + requiredHeight > pageHeight - 20) {
          pdf.addPage();
          y = 20;
        }
      }

      function addHeading(text) {
        addPageIfNeeded(16);

        y += 5;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text(text, margin, y);
        y += 8;
      }

      function addParagraph(text) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);

        const lines = pdf.splitTextToSize(
          String(text || "Not available."),
          contentWidth
        );

        const lineHeight = 5;
        const maxLinesPerPage = Math.floor(
          (pageHeight - 35) / lineHeight
        );

        for (let i = 0; i < lines.length; i += maxLinesPerPage) {
          const chunk = lines.slice(i, i + maxLinesPerPage);

          addPageIfNeeded(chunk.length * lineHeight + 4);

          pdf.text(chunk, margin, y);
          y += chunk.length * lineHeight + 4;
        }
      }

      function addList(items) {
        if (!items || items.length === 0) {
          addParagraph("No items available.");
          return;
        }

        items.forEach((item, index) => {
          addParagraph(`${index + 1}. ${item}`);
        });
      }

      // Report title
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text("AI Meeting Assistant", margin, y);

      y += 10;

      pdf.setFontSize(15);
      pdf.text("Meeting Report", margin, y);

      y += 10;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      pdf.text(
        `Meeting: ${meeting.title || "Untitled Meeting"}`,
        margin,
        y
      );

      y += 6;

      pdf.text(
        `Date: ${new Date(meeting.created_at).toLocaleString()}`,
        margin,
        y
      );

      y += 6;

      pdf.text(
        `Generated for: ${user.email}`,
        margin,
        y
      );

      y += 8;

      pdf.setDrawColor(190);
      pdf.line(margin, y, pageWidth - margin, y);

      y += 5;

      // Summary
      addHeading("1. Meeting Summary");
      addParagraph(analysis?.summary);

      // Key points
      addHeading("2. Key Points");
      addList(analysis?.key_points);

      // Decisions
      addHeading("3. Decisions");
      addList(analysis?.decisions);

      // Tasks
      addHeading("4. Action Items");

      if (tasks?.length) {
        tasks.forEach((task, index) => {
          addPageIfNeeded(20);

          addParagraph(`${index + 1}. ${task.title}`);

          if (task.description) {
            addParagraph(`Description: ${task.description}`);
          }

          addParagraph(
            `Status: ${(task.status || "pending").replace("_", " ")}`
          );

          y += 2;
        });
      } else {
        addParagraph("No action items found.");
      }

      // Questions
      addHeading("5. Questions Raised");
      addList(analysis?.questions);

      // Transcript
      addHeading("6. Full Transcript");
      addParagraph(transcript);

      // Page numbers
      const totalPages = pdf.internal.getNumberOfPages();

      for (let page = 1; page <= totalPages; page++) {
        pdf.setPage(page);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);

        pdf.text(
          `AI Meeting Assistant | Page ${page} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
      }

      const safeTitle = (meeting.title || "meeting")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .substring(0, 60);

      pdf.save(`${safeTitle}_report.pdf`);

    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("Could not generate the PDF report.");
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) setMessage(error.message);
    else setMessage("Logged out successfully.");
  }

  async function deleteMeeting(meetingId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this meeting?"
    );

    if (!confirmed) return;

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/api/meetings/${meetingId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) throw new Error(data.message);

      setMeetings((previous) =>
        previous.filter((meeting) => meeting.id !== meetingId)
      );

      setMessage("Meeting deleted successfully.");

      await loadMeetings();

    } catch (error) {
      setMessage(error.message);
    }
  }

  // Authentication
  if (!user) {
    return (
      <div className="auth-container">
        <h1>AI Meeting Assistant</h1>
        <h2>{authMode === "login" ? "Welcome Back" : "Create Account"}</h2>

        <form onSubmit={handleAuth}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          <button type="submit" disabled={authLoading}>
            {authLoading
              ? "Please wait..."
              : authMode === "login"
                ? "Login"
                : "Sign Up"}
          </button>
        </form>

        <p>{message}</p>

        <p>
          {authMode === "login"
            ? "Don't have an account?"
            : "Already have an account?"}
        </p>

        <button
          onClick={() => {
            setAuthMode(authMode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {authMode === "login" ? "Create Account" : "Back to Login"}
        </button>
      </div>
    );
  }

  // Meeting details
  if (selectedMeeting) {
    const { meeting, transcript, analysis, tasks } = selectedMeeting;

    const completedTasks = tasks?.filter(
      (task) => task.status === "completed"
    ).length || 0;

    return (
      <div className="page-container">
        <header className="dashboard-header">
          <div>
            <h1>Meeting Details</h1>
            <p>{user.email}</p>
          </div>

          <div>
            <button onClick={() => setSelectedMeeting(null)}>
              Back to Dashboard
            </button>

            <button onClick={exportMeetingPDF}>
              Download PDF Report
            </button>

            <button onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="details-hero">
          <span className="section-label">MEETING OVERVIEW</span>
          <h1>{meeting.title}</h1>
          <p>{new Date(meeting.created_at).toLocaleString()}</p>
          <span className="status-badge">{meeting.status}</span>
        </section>

        <section className="summary-card">
          <h2>Meeting Summary</h2>
          <p>{analysis?.summary || "No summary available."}</p>
        </section>

        <div className="insights-grid">
          <section className="insight-card">
            <h2>Key Points</h2>
            {analysis?.key_points?.length ? (
              <ul>
                {analysis.key_points.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            ) : (
              <p>No key points found.</p>
            )}
          </section>

          <section className="insight-card">
            <h2>Decisions</h2>
            {analysis?.decisions?.length ? (
              <ul>
                {analysis.decisions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No decisions found.</p>
            )}
          </section>
        </div>

        <section className="tasks-section">
          <div className="section-heading">
            <div>
              <h2>Action Items</h2>
              <p>Track the tasks identified during this meeting.</p>
            </div>

            <span className="task-count">
              {completedTasks}/{tasks?.length || 0} completed
            </span>
          </div>

          {tasks?.length ? (
            tasks.map((task) => (
              <div className="task-card" key={task.id}>
                <div>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                </div>

                <select
                  className={`task-status ${task.status}`}
                  value={task.status}
                  onChange={(e) =>
                    updateTaskStatus(task.id, e.target.value)
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            ))
          ) : (
            <p>No action items found.</p>
          )}
        </section>

        <section className="insight-card questions-card">
          <h2>Questions Raised</h2>

          {analysis?.questions?.length ? (
            <ul>
              {analysis.questions.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          ) : (
            <p>No questions identified.</p>
          )}
        </section>

        <section className="transcript-section">
          <h2>Full Transcript</h2>
          <p className="transcript">
            {transcript?.content || "No transcript available."}
          </p>
        </section>
      </div>
    );
  }

  // Dashboard
  const completionRate = analytics.completionPercentage;

  const unfinishedTasks =
    analytics.pendingTasks + analytics.inProgressTasks;

  return (
    <div className="page-container">
      <header className="dashboard-header">
        <div>
          <h1>AI Meeting Assistant</h1>
          <p>Welcome, {user.email}</p>
        </div>

        <button onClick={logout}>Logout</button>
      </header>

      {/* Analytics */}
      <section className="analytics-section">
        <div className="section-heading">
          <div>
            <h2>Meeting Analytics</h2>
            <p>Your overall meeting productivity at a glance.</p>
          </div>

          <button onClick={loadMeetings} disabled={loading}>
            {loading ? "Updating..." : "Refresh Analytics"}
          </button>
        </div>

        <div className="analytics-grid">
          <div className="analytics-card">
            <span className="analytics-icon"><AnalyticsIcon type="microphone" /></span>
            <p>Total Meetings</p>
            <h2>{analytics.totalMeetings}</h2>
          </div>

          <div className="analytics-card">
            <span className="analytics-icon"><AnalyticsIcon type="clipboard" /></span>
            <p>Total Action Items</p>
            <h2>{analytics.totalTasks}</h2>
          </div>

          <div className="analytics-card">
            <span className="analytics-icon"><AnalyticsIcon type="completed" /></span>
            <p>Completed Tasks</p>
            <h2>{analytics.completedTasks}</h2>
          </div>

          <div className="analytics-card">
            <span className="analytics-icon"><AnalyticsIcon type="pending" /></span>
            <p>Pending / In Progress</p>
            <h2>{unfinishedTasks}</h2>
          </div>
        </div>

        <div className="completion-card">
          <div className="completion-heading">
            <strong>Task Completion Rate</strong>
            <strong>{completionRate}%</strong>
          </div>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${completionRate}%` }}
            />
          </div>

          <p>
            {analytics.completedTasks} out of {analytics.totalTasks} tasks completed.
          </p>
        </div>
      </section>

      {/* Upload */}
      <section className="upload-section">
        <h2>Upload New Meeting</h2>
        <p>Upload an audio recording to generate meeting insights.</p>

        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setSelectedFile(e.target.files[0] || null)}
          disabled={processing}
        />

        {selectedFile && (
          <p>
            Selected: {selectedFile.name} (
            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
          </p>
        )}

        <button
          onClick={uploadMeeting}
          disabled={processing || !selectedFile}
        >
          {processing ? "Processing Meeting..." : "Upload & Analyze"}
        </button>

        {processing && (
          <p>Please wait while your meeting is transcribed and analyzed.</p>
        )}
      </section>

      {/* History */}
      <section className="history-section">
        <h2>Meeting History</h2>
        <p>Total Meetings: {meetings.length}</p>

        <div className="meeting-controls">
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="az">Title A–Z</option>
            <option value="za">Title Z–A</option>
          </select>

          <button onClick={loadMeetings} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Meetings"}
          </button>
        </div>

        {message && <p className="status-message">{message}</p>}

        {meetings
          .filter((meeting) =>
            meeting.title.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .sort((a, b) => {
            if (sortOrder === "newest") {
              return new Date(b.created_at) - new Date(a.created_at);
            }

            if (sortOrder === "oldest") {
              return new Date(a.created_at) - new Date(b.created_at);
            }

            if (sortOrder === "az") {
              return a.title.localeCompare(b.title);
            }

            return b.title.localeCompare(a.title);
          })
          .map((meeting) => (
            <article
              key={meeting.id}
              className="meeting-card"
              onClick={() => openMeeting(meeting.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openMeeting(meeting.id);
                }
              }}
              role="group"
              tabIndex={0}
              aria-label={`View meeting: ${meeting.title}`}
            >
              <div className="meeting-card-info">
                <h3>{meeting.title || "Untitled Meeting"}</h3>
                <div className="meeting-card-meta">
                  <span className={`meeting-status-badge ${String(meeting.status || "unknown").toLowerCase()}`}>
                    {String(meeting.status || "unknown").replaceAll("_", " ")}
                  </span>
                  <span className="meeting-date">
                    {new Date(meeting.created_at).toLocaleString()}
                  </span>
                </div>
                <span className="meeting-view-hint">View meeting details <span aria-hidden="true">→</span></span>
              </div>

              <div className="meeting-card-actions">
                <button
                  type="button"
                  className="meeting-delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMeeting(meeting.id);
                  }}
                >
                  Delete Meeting
                </button>
              </div>
            </article>
          ))}
      </section>
    </div>
  );
}

export default App;