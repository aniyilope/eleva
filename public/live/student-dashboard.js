const socket = io();

fetch("/session")
  .then(res => res.json())
  .then(async data => {
    if (!data.loggedIn) return window.location.href = "/";
    document.getElementById("username").textContent = data.user.username;

    // Join this student's assigned-teacher room so class-status pushes reach us live
    socket.emit("dashboard-join", { role: "student", userId: data.user._id });

    try {
      const infoRes = await fetch("/student/info");
      const info = await infoRes.json();

      if (!info.hasTeacher) {
        document.getElementById("main-content").innerHTML = '<p>No teacher assigned yet</p>';
      } else {
        document.getElementById("main-content").innerHTML = info.liveClass
          ? '<button>Join Live Class</button>'
          : `<p>No live class now. Your teacher: ${info.teacherName}</p>`;
      }
    } catch (err) {
      console.error("Student info fetch failed:", err);
    }
  });

// Listen for live class updates
socket.on("class-status", live => {
  document.getElementById("main-content").innerHTML =
    live ? '<button>Join Live Class</button>' : '<p>No live class now</p>';
});
