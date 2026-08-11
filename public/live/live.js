const socket = io();

let myRole = "";
let myName = "";
let myUserId = "";

let teacherSocketId = null;

let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let localStreamReady = null;

// TEACHER: one RTCPeerConnection per connected student
let peerConnections = {};

// STUDENT: connection to the teacher
let peerConnection = null;

// STUDENT: mesh connections to other students
let studentPeerConnections = {};
let pendingIceCandidates = {};

let canvas;
let ctx;
let codeArea;
let chatBox;

let drawing = false;
let canDraw = false;
let lastX = 0;
let lastY = 0;

let currentColor = "#FFD54F";
let currentSize = 3;
let currentTool = "pen";
let eraserColor = "#ffffff";

let currentBoard = "canvas";

let history = [];
let redoStack = [];

// Participant tiles
let participantTiles = {};

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turn:openrelay.metered.ca:443?transport=tcp"
            ],
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ]
};

function initLiveCore(role, username, userId) {

    myRole = role;
    myName = username;
    myUserId = userId;

    canDraw = role === "teacher";

    cacheDOM();
    setupCanvas();
    setupSocket();
    setupControls();

    socket.emit("join-class", {
        role,
        name: username,
        userId
    });
}

function cacheDOM() {

    canvas = document.getElementById("wbCanvas");

    if (canvas) {
        ctx = canvas.getContext("2d");
        resizeCanvas();

        window.addEventListener("resize", resizeCanvas);
    }

    codeArea = document.getElementById("codeArea");
    chatBox = document.getElementById("chatBox");
}

function resizeCanvas() {

    if (!canvas || !ctx) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    redrawCanvas();
}

function setupCanvas() {

    if (!canvas) return;

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);

    window.addEventListener("mouseup", stopDraw);
}

function startDraw(e) {

    if (!canDraw) return;

    drawing = true;

    lastX = e.offsetX;
    lastY = e.offsetY;
}

function draw(e) {

    if (!drawing || !canDraw) return;

    drawLine(
        lastX,
        lastY,
        e.offsetX,
        e.offsetY,
        currentColor,
        currentSize,
        true
    );

    lastX = e.offsetX;
    lastY = e.offsetY;
}

function stopDraw() {

    drawing = false;
}

function drawLine(x1, y1, x2, y2, color, size, emit) {

    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.stroke();

    if (!emit) return;

    history.push({
        x1,
        y1,
        x2,
        y2,
        color,
        size
    });

    redoStack = [];

    socket.emit("draw", {
        x1,
        y1,
        x2,
        y2,
        color,
        size
    });
}

function redrawCanvas() {

    if (!ctx || !canvas) return;

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    history.forEach(line => {

        drawLine(
            line.x1,
            line.y1,
            line.x2,
            line.y2,
            line.color,
            line.size,
            false
        );

    });
}

function applyBoardToggle(board) {

    if (!canvas || !codeArea) return;

    canvas.style.display =
        board === "canvas" ? "block" : "none";

    codeArea.style.display =
        board === "code" ? "block" : "none";
}

// ===============================
// PARTICIPANT TILES
// ===============================

function addParticipantTile(id, name, role, stream) {

    const list =
        document.getElementById("participantsList");

    if (!list) return null;

    const div = document.createElement("div");

    div.className = "participant";

    div.innerHTML = `
        <video autoplay playsinline ${role === "teacher" ? "muted" : ""}></video>
        <div class="participant-name">${name}</div>
    `;

    const video = div.querySelector("video");

    if (stream) {
        video.srcObject = stream;
    }

    list.appendChild(div);

    const tile = {
        element: div,
        video,
        name,
        role,
        stream
    };

    participantTiles[id] = tile;

    return tile;
}

function removeParticipantTile(id) {

    const tile = participantTiles[id];

    if (tile) {

        tile.element.remove();

        delete participantTiles[id];
    }
}

// ===============================
// SOCKET EVENTS
// ===============================

function setupSocket() {

    socket.on("class-status", live => {

        const status =
            document.getElementById("liveStatus");

        if (status) {
            status.innerText =
                live ? "Live" : "Not Live";
        }

        if (!live) {

            Object.values(peerConnections).forEach(pc => {
                pc.close();
            });

            peerConnections = {};

            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }

            Object.values(studentPeerConnections).forEach(pc => {
                pc.close();
            });

            studentPeerConnections = {};

            const teacherVideo =
                document.getElementById("teacherVideo");

            if (teacherVideo && myRole === "student") {
                teacherVideo.srcObject = null;
            }
        }
    });

    socket.on("no-teacher-assigned", () => {

        const status =
            document.getElementById("liveStatus");

        if (status) {
            status.innerText =
                "No teacher assigned yet";
        }
    });

    socket.on("code-update", code => {

        if (codeArea) {
            codeArea.value = code;
        }
    });

    socket.on("draw", data => {

        drawLine(
            data.x1,
            data.y1,
            data.x2,
            data.y2,
            data.color,
            data.size,
            false
        );
    });

    socket.on("clear-all", () => {

        if (ctx && canvas) {

            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );
        }

        history = [];
        redoStack = [];
    });

    socket.on("board-toggle", board => {

        currentBoard = board;

        applyBoardToggle(board);
    });

    socket.on("share-board", board => {

        alert(
            `Teacher is sharing ${
                board === "canvas"
                    ? "the Whiteboard"
                    : "the Code"
            }`
        );
    });

    socket.on("undo", () => {

        if (history.length === 0) return;

        const last = history.pop();

        redoStack.push(last);

        redrawCanvas();
    });

    socket.on("redo", action => {

        history.push(action);

        drawLine(
            action.x1,
            action.y1,
            action.x2,
            action.y2,
            action.color,
            action.size,
            false
        );
    });

    socket.on("chat", data => {

        if (!chatBox) return;

        const div = document.createElement("div");

        div.className = "msg";

        div.innerText =
            `${data.name}: ${data.message}`;

        chatBox.appendChild(div);

        chatBox.scrollTop =
            chatBox.scrollHeight;
    });

    socket.on("participants", list => {

        const currentIds =
            list.map(p => p.id);

        Object.keys(participantTiles).forEach(id => {

            const tile = participantTiles[id];

            if (
                tile.isRemote &&
                !currentIds.includes(id)
            ) {

                const pc =
                    peerConnections[id];

                if (pc) {

                    pc.close();

                    delete peerConnections[id];
                }

                removeParticipantTile(id);
            }
        });

        list.forEach(p => {

            if (!participantTiles[p.id]) {

                const tile =
                    addParticipantTile(
                        p.id,
                        p.name,
                        p.role,
                        null
                    );

                if (tile) {
                    tile.isRemote = true;
                }
            }
        });

        if (myRole === "student") {

            list.forEach(p => {

                if (p.id === socket.id) return;

                if (p.role !== "student") return;

                if (socket.id < p.id) {
                    connectToPeerStudent(p.id);
                }
            });
        }
    });

    socket.on("new-student", student => {

        showWaitingStudent(student);
    });

    socket.on("admitted", async data => {

        teacherSocketId = data.socketId;

        await startStudentCamera();
    });

    socket.on("peer-left", ({ socketId }) => {

        if (myRole === "teacher") {

            const pc =
                peerConnections[socketId];

            if (pc) {

                pc.close();

                delete peerConnections[socketId];
            }

            removeParticipantTile(socketId);

        } else if (socketId === teacherSocketId) {

            if (peerConnection) {

                peerConnection.close();

                peerConnection = null;
            }

            const teacherVideo =
                document.getElementById("teacherVideo");

            if (teacherVideo) {
                teacherVideo.srcObject = null;
            }
        }

        if (studentPeerConnections[socketId]) {

            studentPeerConnections[socketId].close();

            delete studentPeerConnections[socketId];
        }
    });
}

// ===============================
// WAITING STUDENT
// ===============================

function showWaitingStudent(student) {

    const list =
        document.getElementById("waitingList");

    if (!list) return;

    const div =
        document.createElement("div");

    div.className = "waiting-student";

    div.innerHTML = `
        <span>${student.username}</span>
        <button class="btn primary">Admit</button>
    `;

    const btn =
        div.querySelector("button");

    btn.onclick = () => {

        socket.emit("admit-student", {
            socketId: student.socketId,
            offer: null
        });

        callStudent(
            student.socketId,
            student.username
        );

        div.remove();
    };

    list.appendChild(div);
}

// ===============================
// CONTROLS
// ===============================

function setupControls() {

    const send =
        document.getElementById("btnSendChat");

    if (send) {

        send.onclick = () => {

            const input =
                document.getElementById("chatInput");

            const message =
                input.value.trim();

            if (!message) return;

            socket.emit("chat", {
                name: myName,
                role: myRole,
                message
            });

            input.value = "";
        };
    }

    const clear =
        document.getElementById("btnClear");

    if (clear) {

        clear.onclick = () => {

            if (myRole !== "teacher") return;

            if (ctx && canvas) {

                ctx.clearRect(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
            }

            history = [];
            redoStack = [];

            socket.emit("clear-all");
        };
    }

    const colorButtons =
        document.querySelectorAll(".color-swatch");

    colorButtons.forEach(btn => {

        btn.onclick = () => {

            document
                .querySelectorAll(".color-swatch")
                .forEach(b =>
                    b.classList.remove("selected")
                );

            btn.classList.add("selected");

            currentColor =
                btn.dataset.color;

            currentTool = "pen";

            const toolLabel =
                document.getElementById("currentTool");

            if (toolLabel) {
                toolLabel.innerText = "Tool: Pen";
            }

            const preview =
                document.getElementById("colorPreview");

            if (preview) {
                preview.style.background =
                    currentColor;
            }
        };
    });

    const size =
        document.getElementById("penSize");

    if (size) {

        size.oninput = () => {

            currentSize = size.value;
        };
    }

    const erase =
        document.getElementById("btnErase");

    if (erase) {

        erase.onclick = () => {

            if (myRole !== "teacher") return;

            currentColor = eraserColor;
            currentTool = "eraser";

            const toolLabel =
                document.getElementById("currentTool");

            if (toolLabel) {
                toolLabel.innerText =
                    "Tool: Eraser";
            }
        };
    }

    const undoBtn =
        document.getElementById("btnUndo");

    if (undoBtn) {

        undoBtn.onclick = () => {

            if (myRole !== "teacher") return;

            if (history.length === 0) return;

            const last =
                history.pop();

            redoStack.push(last);

            redrawCanvas();

            socket.emit("undo");
        };
    }

    const redoBtn =
        document.getElementById("btnRedo");

    if (redoBtn) {

        redoBtn.onclick = () => {

            if (myRole !== "teacher") return;

            if (redoStack.length === 0) return;

            const action =
                redoStack.pop();

            history.push(action);

            drawLine(
                action.x1,
                action.y1,
                action.x2,
                action.y2,
                action.color,
                action.size,
                false
            );

            socket.emit("redo", action);
        };
    }

    const toggleBoard =
        document.getElementById("btnToggleBoard");

    if (toggleBoard) {

        toggleBoard.onclick = () => {

            if (myRole !== "teacher") return;

            const nextBoard =
                currentBoard === "canvas"
                    ? "code"
                    : "canvas";

            currentBoard = nextBoard;

            applyBoardToggle(nextBoard);

            socket.emit(
                "board-toggle",
                nextBoard
            );
        };
    }

    const shareBoard =
        document.getElementById(
            "btnShareWhiteboard"
        );

    if (shareBoard) {

        shareBoard.onclick = () => {

            if (myRole !== "teacher") return;

            socket.emit(
                "share-board",
                currentBoard
            );
        };
    }

    const saveBoard =
        document.getElementById("btnSaveBoard");

    if (saveBoard) {

        saveBoard.onclick = () => {

            if (!canvas) return;

            const dataURL =
                canvas.toDataURL("image/png");

            const link =
                document.createElement("a");

            link.href = dataURL;
            link.download = "whiteboard.png";

            link.click();
        };
    }

    const saveCode =
        document.getElementById("btnSaveCode");

    if (saveCode) {

        saveCode.onclick = () => {

            const code =
                codeArea
                    ? codeArea.value
                    : "";

            const blob =
                new Blob(
                    [code],
                    { type: "text/plain" }
                );

            const link =
                document.createElement("a");

            link.href =
                URL.createObjectURL(blob);

            link.download = "code.txt";

            link.click();
        };
    }

    const addStudent =
        document.getElementById("btnAddStudent");

    if (addStudent) {

        addStudent.onclick = async () => {

            if (myRole !== "teacher") return;

            const name =
                prompt(
                    "Student Name",
                    "Student"
                );

            if (!name) return;

            let stream;

            try {

                stream =
                    await navigator.mediaDevices
                        .getUserMedia({
                            video: true,
                            audio: true
                        });

            } catch (err) {

                return alert(
                    "Camera Error: " + err
                );
            }

            addParticipantTile(
                "demo-" + Date.now(),
                name,
                "student",
                stream
            );
        };
    }

    const screenShare =
        document.getElementById("btnScreenShare");

    if (screenShare) {

        screenShare.onclick = async () => {

            if (myRole !== "teacher") return;

            if (!localStream) {

                return alert(
                    "Start class first"
                );
            }

            if (isScreenSharing) {

                await stopScreenSharing();

                return;
            }

            try {

                screenStream =
                    await navigator.mediaDevices
                        .getDisplayMedia({
                            video: true
                        });

                const screenTrack =
                    screenStream
                        .getVideoTracks()[0];

                isScreenSharing = true;

                const teacherVideo =
                    document.getElementById(
                        "teacherVideo"
                    );

                if (teacherVideo) {

                    teacherVideo.srcObject =
                        new MediaStream([
                            screenTrack,
                            ...localStream.getAudioTracks()
                        ]);
                }

                Object.values(peerConnections)
                    .forEach(pc => {

                        const sender =
                            pc.getSenders()
                                .find(
                                    s =>
                                        s.track &&
                                        s.track.kind ===
                                            "video"
                                );

                        if (sender) {

                            sender.replaceTrack(
                                screenTrack
                            );
                        }
                    });

                screenShare.innerText =
                    "🛑 Stop Sharing";

                screenTrack.onended = () => {

                    stopScreenSharing();
                };

            } catch (err) {

                console.log(
                    "Screen share error:",
                    err
                );
            }
        };
    }

    const startTabletBtn =
        document.getElementById("startTablet");

    if (startTabletBtn) {

        startTabletBtn.onclick = async () => {

            if (myRole !== "teacher") return;

            try {

                const res =
                    await fetch("/tablet-link");

                const data =
                    await res.json();

                const qrCanvas =
                    document.getElementById(
                        "tabletQR"
                    );

                const container =
                    document.getElementById(
                        "tabletQRContainer"
                    );

                const status =
                    document.getElementById(
                        "tabletStatus"
                    );

                if (
                    qrCanvas &&
                    window.QRious
                ) {

                    new QRious({
                        element: qrCanvas,
                        value: data.url,
                        size: 180
                    });
                }

                if (container) {
                    container.style.display =
                        "block";
                }

                if (status) {
                    status.style.display =
                        "inline-block";
                }

            } catch (err) {

                console.log(
                    "Tablet link error",
                    err
                );

                alert(
                    "Unable to generate tablet link"
                );
            }
        };
    }

    if (
        codeArea &&
        myRole === "teacher"
    ) {

        codeArea.addEventListener(
            "input",
            () => {

                socket.emit(
                    "code-update",
                    codeArea.value
                );
            }
        );
    }
}

// ===============================
// SCREEN SHARING
// ===============================

async function stopScreenSharing() {

    if (!screenStream || !localStream) {
        return;
    }

    const cameraTrack =
        localStream.getVideoTracks()[0];

    for (
        const pc of Object.values(peerConnections)
    ) {

        const sender =
            pc.getSenders().find(
                s =>
                    s.track &&
                    s.track.kind === "video"
            );

        if (sender && cameraTrack) {

            await sender.replaceTrack(
                cameraTrack
            );
        }
    }

    screenStream
        .getTracks()
        .forEach(track => {
            track.stop();
        });

    screenStream = null;

    isScreenSharing = false;

    const teacherVideo =
        document.getElementById(
            "teacherVideo"
        );

    if (teacherVideo) {
        teacherVideo.srcObject =
            localStream;
    }

    const screenShare =
        document.getElementById(
            "btnScreenShare"
        );

    if (screenShare) {

        screenShare.innerText =
            "🖥️ Share Screen";
    }
}

// ===============================
// STUDENT CAMERA
// ===============================

async function startStudentCamera() {

    if (localStreamReady) {
        return localStreamReady;
    }

    localStreamReady =
        (async () => {

            try {

                localStream =
                    await navigator.mediaDevices
                        .getUserMedia({
                            video: true,
                            audio: true
                        });

                const video =
                    document.getElementById(
                        "studentVideo"
                    );

                if (video) {
                    video.srcObject =
                        localStream;
                }

            } catch (err) {

                console.log(
                    "Camera error",
                    err
                );
            }
        })();

    return localStreamReady;
}

// ===============================
// WEBRTC - OFFER
// ===============================

socket.on("offer", async data => {

    if (myRole !== "student") return;

    const kind =
        data.kind || "teacher";

    try {

        await startStudentCamera();

        if (kind === "peer") {

            const fromId =
                data.from;

            let pc =
                studentPeerConnections[fromId];

            if (!pc) {

                pc =
                    createStudentPeerConnection(
                        fromId
                    );
            }

            await pc.setRemoteDescription(
                data.offer
            );

            await flushIceCandidates(
                pc,
                fromId
            );

            const answer =
                await pc.createAnswer();

            await pc.setLocalDescription(
                answer
            );

            socket.emit("answer", {
                to: fromId,
                answer,
                kind: "peer"
            });

            return;
        }

        teacherSocketId =
            data.from;

        if (!peerConnection) {

            peerConnection =
                new RTCPeerConnection(
                    rtcConfig
                );

            if (localStream) {

                localStream
                    .getTracks()
                    .forEach(track => {

                        peerConnection.addTrack(
                            track,
                            localStream
                        );
                    });
            }

            peerConnection.onicecandidate =
                e => {

                    if (e.candidate) {

                        socket.emit(
                            "ice-candidate",
                            {
                                to: data.from,
                                candidate:
                                    e.candidate,
                                kind: "teacher"
                            }
                        );
                    }
                };

            peerConnection.ontrack =
                e => {

                    console.log(
                        "Teacher stream received"
                    );

                    const video =
                        document.getElementById(
                            "teacherVideo"
                        );

                    if (video) {

                        video.srcObject =
                            e.streams[0];
                    }
                };
        }

        await peerConnection.setRemoteDescription(
            data.offer
        );

        await flushIceCandidates(
            peerConnection,
            "teacher"
        );

        const answer =
            await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(
            answer
        );

        socket.emit("answer", {
            to: data.from,
            answer,
            kind: "teacher"
        });

    } catch (err) {

        console.error(
            "Student offer error:",
            err
        );
    }
});

// ===============================
// WEBRTC - ANSWER
// ===============================

socket.on("answer", async data => {

    const kind =
        data.kind || "teacher";

    try {

        if (kind === "peer") {

            const pc =
                studentPeerConnections[
                    data.from
                ];

            if (pc) {

               await pc.setRemoteDescription(data.answer);

              await flushIceCandidates(
                  pc,
                  data.from
              );
              
              console.log(
                  "Student answer received:",
                  data.from
              );
            }

            return;
        }

        if (myRole !== "teacher") return;

        const pc =
            peerConnections[data.from];

        if (!pc) {

            console.log(
                "No peer connection for:",
                data.from
            );

            return;
        }

        await pc.setRemoteDescription(
            data.answer
        );

        await flushIceCandidates(
            pc,
            data.from
        );

        console.log(
            "Student answer received:",
            data.from
        );

    } catch (err) {

        console.error(
            "Teacher answer error:",
            err
        );
    }
});

// ===============================
// WEBRTC - ICE CANDIDATES
// ===============================

socket.on(
    "ice-candidate",
    async data => {

        const kind =
            data.kind || "teacher";

        try {

            let pc = null;
            let key = null;

            if (kind === "peer") {

                key = data.from;

                pc =
                    studentPeerConnections[
                        data.from
                    ];

            } else if (
                myRole === "teacher"
            ) {

                key = data.from;

                pc =
                    peerConnections[
                        data.from
                    ];

            } else {

                key = "teacher";

                pc =
                    peerConnection;
            }

            if (!pc) {

                if (
                    !pendingIceCandidates[key]
                ) {

                    pendingIceCandidates[key] =
                        [];
                }

                pendingIceCandidates[key]
                    .push(data.candidate);

                console.log(
                    "Queued ICE candidate for:",
                    key
                );

                return;
            }

            if (!pc.remoteDescription) {

                if (
                    !pendingIceCandidates[key]
                ) {

                    pendingIceCandidates[key] =
                        [];
                }

                pendingIceCandidates[key]
                    .push(data.candidate);

                console.log(
                    "Queued ICE candidate because remote description isn't ready:",
                    key
                );

                return;
            }

            await pc.addIceCandidate(
                data.candidate
            );

            console.log(
                "ICE candidate added:",
                key
            );

        } catch (err) {

            console.error(
                "ICE error:",
                err
            );
        }
    }
);

// ===============================
// TEACHER CALLS STUDENT
// ===============================

async function callStudent(socketId, name) {

    if (myRole !== "teacher") return;

    if (peerConnections[socketId]) {

        console.log(
            "Already connected:",
            name
        );

        return;
    }

    if (!localStream) {

        console.log(
            "Teacher camera is not ready"
        );

        return;
    }

    const pc =
        new RTCPeerConnection(
            rtcConfig
        );

    peerConnections[socketId] =
        pc;

    localStream
        .getAudioTracks()
        .forEach(track => {

            pc.addTrack(
                track,
                localStream
            );
        });

    const videoTrack =
        isScreenSharing &&
        screenStream
            ? screenStream.getVideoTracks()[0]
            : localStream.getVideoTracks()[0];

    if (videoTrack) {

        const videoStream =
            isScreenSharing &&
            screenStream
                ? screenStream
                : localStream;

        pc.addTrack(
            videoTrack,
            videoStream
        );
    }

    pc.onicecandidate = e => {

        if (e.candidate) {

            socket.emit(
                "ice-candidate",
                {
                    to: socketId,
                    candidate: e.candidate,
                    kind: "teacher"
                }
            );
        }
    };

    pc.ontrack = e => {

        console.log(
            "Student stream received:",
            name
        );

        let tile =
            participantTiles[socketId];

        if (!tile) {

            tile =
                addParticipantTile(
                    socketId,
                    name,
                    "student",
                    e.streams[0]
                );

            if (tile) {
                tile.isRemote = true;
            }

        } else {

            tile.video.srcObject =
                e.streams[0];
        }
    };

    pc.onconnectionstatechange = () => {

    console.log(
        "Student:",
        name,
        "connectionState:",
        pc.connectionState
    );

    console.log(
        "ICE state:",
        pc.iceConnectionState
    );

    console.log(
        "ICE gathering:",
        pc.iceGatheringState
    );

    console.log(
        "Signaling:",
        pc.signalingState
    );

    if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
    ) {

        console.log(
            "WebRTC connection failed for:",
            socketId
        );

        
    }

};
    try {

        const offer =
            await pc.createOffer();

        await pc.setLocalDescription(
            offer
        );

        socket.emit("offer", {
            to: socketId,
            offer,
            kind: "teacher"
        });

        console.log(
            "Offer sent to:",
            name
        );

    } catch (err) {

        console.error(
            "Offer error:",
            err
        );
    }
}

// ===============================
// STUDENT-TO-STUDENT CONNECTION
// ===============================

function createStudentPeerConnection(
    otherId
) {

    const pc =
        new RTCPeerConnection(
            rtcConfig
        );

    studentPeerConnections[otherId] =
        pc;

    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                pc.addTrack(
                    track,
                    localStream
                );
            });
    }

    pc.onicecandidate = e => {

        if (e.candidate) {

            socket.emit(
                "ice-candidate",
                {
                    to: otherId,
                    candidate: e.candidate,
                    kind: "peer"
                }
            );
        }
    };

    pc.ontrack = e => {

        console.log(
            "Peer student stream received:",
            otherId
        );

        const tile =
            participantTiles[otherId];

        if (tile) {

            tile.video.srcObject =
                e.streams[0];
        }
    };

    pc.onconnectionstatechange = () => {

        console.log(
            "Peer",
            otherId,
            "connection:",
            pc.connectionState
        );

        if (
            pc.connectionState === "failed" ||
            pc.connectionState === "closed" ||
            pc.connectionState ===
                "disconnected"
        ) {

            delete studentPeerConnections[
                otherId
            ];
        }
    };

    return pc;
}

// ===============================
// STUDENT INITIATES MESH CONNECTION
// ===============================

async function connectToPeerStudent(
    otherId
) {

    if (
        studentPeerConnections[
            otherId
        ]
    ) {
        return;
    }

    await startStudentCamera();

    const pc =
        createStudentPeerConnection(
            otherId
        );

    try {

        const offer =
            await pc.createOffer();

        await pc.setLocalDescription(
            offer
        );

        socket.emit("offer", {
            to: otherId,
            offer,
            kind: "peer"
        });

    } catch (err) {

        console.error(
            "Peer offer error:",
            err
        );
    }
}

// ===============================
// FLUSH QUEUED ICE CANDIDATES
// ===============================

async function flushIceCandidates(
    pc,
    key
) {

    const candidates =
        pendingIceCandidates[key];

    if (
        !candidates ||
        candidates.length === 0
    ) {
        return;
    }

    console.log(
        "Flushing",
        candidates.length,
        "queued ICE candidates for:",
        key
    );

    for (
        const candidate of candidates
    ) {

        try {

            await pc.addIceCandidate(
                candidate
            );

        } catch (err) {

            console.error(
                "Queued ICE candidate error:",
                err
            );
        }
    }

    delete pendingIceCandidates[
        key
    ];
}

