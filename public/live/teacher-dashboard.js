// teacher-dashboard.js

document.addEventListener("DOMContentLoaded", async () => {
  const usernameSpan = document.getElementById("username");
  const liveStatus = document.getElementById("liveStatus");
  const toggle = document.getElementById("themeToggle");

  // ----- CHECK SESSION -----
  let user;
  try {
    const res = await fetch("/session");
    const data = await res.json();
    if (!data.loggedIn || data.user.role !== "teacher") {
      window.location.href = "/"; // not logged in or not teacher
      return;
    }
    user = data.user;
    usernameSpan.textContent = user.username;
  } catch (err) {
    console.error("Session fetch failed:", err);
    window.location.href = "/";
    return;
  }

  // ----- SOCKET.IO -----
  const socket = io();

  // Joins this teacher's room so we get live stats-update / class-status pushes
  socket.emit("dashboard-join", { role: "teacher", userId: user._id });

  socket.on("class-status", (isLive) => {
    liveStatus.textContent = isLive ? "Live Class" : "Offline";
    liveStatus.classList.toggle("online", isLive);
    liveStatus.classList.toggle("offline", !isLive);
  });

  socket.on("code-update", (code) => {
    console.log("Code update received:", code);
  });

  // ----- THEME TOGGLE -----
  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    toggle.textContent = document.body.classList.contains("dark") ? "Light" : "Dark";
  });

  // ----- SIDEBAR ACTIVE STATE -----
  const links = document.querySelectorAll(".sidebar a");
  links.forEach(link => {
    link.addEventListener("click", () => {
      links.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
    });
  });

  // ----- LOGOUT -----
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await fetch("/logout", { method: "POST" });
    window.location.href = "/";
  });

  // ----- DASHBOARD CONTENT -----
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="dashboard-grid">
      <div class="card"><h3>Total Students</h3><p id="statTotalStudents">--</p></div>
      <div class="card"><h3>Active Courses</h3><p id="statActiveCourses">--</p></div>
      <div class="card"><h3>Waiting Room</h3><p id="statWaiting">--</p></div>
      <div class="card"><h3>In Class Now</h3><p id="statParticipants">--</p></div>
    </div>
    <div class="section">
      <h2>My Students</h2>
      <table>
        <thead><tr><th>Username</th><th>Email</th></tr></thead>
        <tbody id="rosterBody">
          <tr><td colspan="2">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  function renderStats(stats) {
    document.getElementById("statTotalStudents").textContent = stats.totalStudents;
    document.getElementById("statActiveCourses").textContent = stats.activeCourses;
    document.getElementById("statWaiting").textContent = stats.waitingCount;
    document.getElementById("statParticipants").textContent = stats.participantsCount;

    liveStatus.textContent = stats.liveClass ? "Live Class" : "Offline";
    liveStatus.classList.toggle("online", stats.liveClass);
    liveStatus.classList.toggle("offline", !stats.liveClass);
  }

  // Initial numbers
  try {
    const statsRes = await fetch("/teacher/stats");
    renderStats(await statsRes.json());
  } catch (err) {
    console.error("Stats fetch failed:", err);
  }

  // My assigned students ("who I'm going to be taking")
  try {
    const rosterRes = await fetch("/teacher/roster");
    const roster = await rosterRes.json();
    const rosterBody = document.getElementById("rosterBody");

    rosterBody.innerHTML = roster.length
      ? roster.map(s => `<tr><td>${s.username}</td><td>${s.email}</td></tr>`).join("")
      : `<tr><td colspan="2">No students assigned yet</td></tr>`;
  } catch (err) {
    console.error("Roster fetch failed:", err);
  }

  // Live updates pushed whenever a student is admitted/leaves, or class starts/ends
  socket.on("stats-update", renderStats);

  // ----- TEACHER CLASS CONTROLS -----
  window.startClass = () => socket.emit("start-class");
  window.endClass = () => socket.emit("end-class");
});
