const socket=io();

let myRole="";
let myName="";
let myUserId="";

let teacherSocketId=null;

let localStream=null;
let peerConnection=null;

let canvas;
let ctx;
let codeArea;
let chatBox;

let drawing=false;
let canDraw=false;

let currentColor="#FFD54F";
let currentSize=3;
let currentTool="pen";
let currentBoard="board";

let undoStack=[];
let redoStack=[];

const rtcConfig={
iceServers:[
{
urls:"stun:stun.l.google.com:19302"
}
]
};

function initLiveCore(role,username,userId){

myRole=role;
myName=username;
myUserId=userId;

canDraw=role==="teacher";

cacheDOM();
setupCanvas();
setupSocket();
setupControls();

socket.emit("join-class",{
role,
name:username,
userId
});

}
function cacheDOM(){

canvas=document.getElementById("wbCanvas");
ctx=canvas.getContext("2d");

codeArea=document.getElementById("codeArea");
chatBox=document.getElementById("chatBox");

resizeCanvas();

window.addEventListener(
"resize",
resizeCanvas
);

}

function resizeCanvas(){

canvas.width=canvas.clientWidth;
canvas.height=canvas.clientHeight;

ctx.lineCap="round";
ctx.lineJoin="round";

}

function setupCanvas(){

canvas.addEventListener("mousedown",startDraw);

canvas.addEventListener("mousemove",draw);

window.addEventListener("mouseup",stopDraw);

}

function startDraw(e){

if(!canDraw)return;

drawing=true;

ctx.beginPath();

ctx.moveTo(
e.offsetX,
e.offsetY
);

undoStack.push(
canvas.toDataURL()
);

redoStack=[];

}


function draw(e){

if(!drawing||!canDraw)return;

ctx.strokeStyle=currentColor;
ctx.lineWidth=currentSize;

ctx.lineTo(
e.offsetX,
e.offsetY
);

ctx.stroke();


socket.emit("draw",{

x:e.offsetX,
y:e.offsetY,

color:currentColor,
size:currentSize

});

}


function stopDraw(){

drawing=false;

ctx.closePath();

}

function drawRemote(data){

ctx.strokeStyle=data.color;
ctx.lineWidth=data.size;

ctx.lineTo(
data.x,
data.y
);

ctx.stroke();

}

function setupSocket(){


socket.on("class-status",live=>{

const status=document.getElementById("liveStatus");

if(status){
status.innerText=live?"Live":"Not Live";
}

});


socket.on("no-teacher-assigned",()=>{

const status=document.getElementById("liveStatus");

if(status){
status.innerText="No teacher assigned yet";
}

});


socket.on("code-update",code=>{

if(codeArea){
codeArea.value=code;
}

});


socket.on("draw",data=>{

drawRemote(data);

});


socket.on("clear-all",()=>{

ctx.clearRect(
0,
0,
canvas.width,
canvas.height
);

});


socket.on("chat",data=>{

if(!chatBox)return;

const div=document.createElement("div");

div.className="msg";

div.innerText=
`${data.name}: ${data.message}`;

chatBox.appendChild(div);

chatBox.scrollTop=
chatBox.scrollHeight;

});


socket.on("participants",list=>{

const box=document.getElementById(
"participantsList"
);

if(!box)return;

box.innerHTML="";


list.forEach(p=>{

const div=document.createElement("div");

div.innerText=
`${p.name} (${p.role})`;

box.appendChild(div);

});

});


socket.on("new-student",student=>{

showWaitingStudent(student);

});


socket.on("admitted",data=>{

teacherSocketId=data.socketId;

startStudentCamera();

createAnswer(data.offer);

});

}

function showWaitingStudent(student){

const list=document.getElementById("waitingList");

if(!list)return;

const div=document.createElement("div");

div.className="waiting-student";

div.innerHTML=`
<span>${student.username}</span>
<button class="btn primary">Admit</button>
`;

const btn=div.querySelector("button");

btn.onclick=()=>{

socket.emit("admit-student",{
socketId:student.socketId,
offer:null
});

div.remove();

};


list.appendChild(div);

}

function setupControls(){


const send=document.getElementById(
"btnSendChat"
);


if(send){

send.onclick=()=>{

const input=document.getElementById(
"chatInput"
);

const message=input.value.trim();

if(!message)return;


socket.emit("chat",{
name:myName,
role:myRole,
message
});


input.value="";

};

}


const clear=document.getElementById(
"btnClear"
);


if(clear){

clear.onclick=()=>{

ctx.clearRect(
0,
0,
canvas.width,
canvas.height
);


socket.emit("clear-all");

};

}


const colorButtons=
document.querySelectorAll(".color-swatch");


colorButtons.forEach(btn=>{

btn.onclick=()=>{

currentColor=
btn.dataset.color;

};

});


const size=document.getElementById(
"penSize"
);


if(size){

size.oninput=()=>{

currentSize=size.value;

};

}


if(codeArea&&myRole==="teacher"){

codeArea.addEventListener(
"input",
()=>{

socket.emit(
"code-update",
codeArea.value
);

});

}

}

async function startStudentCamera(){

try{

localStream=
await navigator.mediaDevices.getUserMedia({
video:true,
audio:true
});


const video=
document.getElementById(
"studentVideo"
);


if(video){

video.srcObject=localStream;

}


createPeer();


}catch(err){

console.log(
"Camera error",
err
);

}

}

//Webrtc

function createPeer(){

peerConnection=
new RTCPeerConnection(
rtcConfig
);


if(localStream){

localStream.getTracks()
.forEach(track=>{

peerConnection.addTrack(
track,
localStream
);

});

}


peerConnection.onicecandidate=e=>{

if(e.candidate){

socket.emit(
"ice-candidate",
{
to:teacherSocketId,
candidate:e.candidate
}
);

}

};


peerConnection.ontrack=e=>{

const video=
document.getElementById(
"teacherVideo"
);

if(video){

video.srcObject=
e.streams[0];

}

};

}

async function createAnswer(offer){

if(!peerConnection){

createPeer();

}


await peerConnection.setRemoteDescription(
offer
);


const answer=
await peerConnection.createAnswer();


await peerConnection.setLocalDescription(
answer
);


socket.emit("answer",{

to:teacherSocketId,

answer

});

}
socket.on("offer",async(data)=>{

if(!peerConnection){

createPeer();

}


await peerConnection.setRemoteDescription(
data.offer
);


const answer=
await peerConnection.createAnswer();


await peerConnection.setLocalDescription(
answer
);


socket.emit("answer",{

to:data.from,

answer

});


});
socket.on("answer",async(data)=>{

if(peerConnection){

await peerConnection.setRemoteDescription(
data.answer
);

}

});

socket.on("ice-candidate",async(data)=>{

try{

if(peerConnection){

await peerConnection.addIceCandidate(
data.candidate
);

}

}catch(err){

console.log(
"ICE error",
err
);

}

});

async function startTeacherCamera(){

try{

localStream=
await navigator.mediaDevices.getUserMedia({
video:true,
audio:true
});


const video=
document.getElementById(
"teacherVideo"
);


if(video){

video.srcObject=
localStream;

}


createPeer();


}catch(err){

console.log(err);

}

}

document.addEventListener(
"DOMContentLoaded",
()=>{


const cam=
document.getElementById(
"btnCamToggle"
);


if(cam){

cam.onclick=()=>{

if(!localStream){

startTeacherCamera();

}
else{

localStream.getTracks()
.forEach(t=>{
t.enabled=!t.enabled;
});

}

};

}



const mic=
document.getElementById(
"btnMicToggle"
);


if(mic){

mic.onclick=()=>{

if(localStream){

const audio=
localStream.getAudioTracks()[0];

if(audio){

audio.enabled=
!audio.enabled;

}

}

};

}


});