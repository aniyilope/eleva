const express=require("express");
const app=express();
require("dotenv").config();

const mongoose=require("mongoose");
const http=require("http").createServer(app);
const io=require("socket.io")(http);

const path=require("path");
const bodyParser=require("body-parser");
const session=require("express-session");
const bcrypt=require("bcrypt");
const os=require("os");

const User=require("./models/User");
const Attendance=require("./models/Attendance");
const Enrollment=require("./models/Enrollment");

const PORT=process.env.PORT||3000;

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("Connected to MongoDB Atlas"))
.catch(err=>{
console.log("MongoDB Error");
console.error(err);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

app.use(session({
secret:process.env.SESSION_SECRET||"super-secret-key",
resave:false,
saveUninitialized:false,
cookie:{maxAge:60*60*1000}
}));

app.use(express.static(path.join(__dirname,"public")));

// Live-class state is now PER TEACHER (keyed by the teacher's User _id as a string)
// so multiple teachers can run separate live classes at the same time, and a
// student only ever sees/joins the room of the teacher they're assigned to.
let liveTeachers={};      // teacherId -> { socketId }
let participants={};      // teacherId -> [ {id, name, role} ]
let waitingStudents={};   // teacherId -> [ {socketId, name, userId} ]
let sharedCode={};        // teacherId -> code string
let activeAttendance={};

function teacherRoom(teacherId){
return "teacher-"+teacherId;
}

// Real-time stats for a teacher's dashboard (roster size, live status, who's in/waiting)
async function getTeacherStats(teacherId){

const totalStudents=await User.countDocuments({
role:"student",
assignedTeacher:teacherId
});

const roster=await User.find({
role:"student",
assignedTeacher:teacherId
}).select("username");

const usernames=roster.map(s=>s.username);

const activeCourses=await Enrollment.distinct("course",{
username:{$in:usernames}
});

return{
totalStudents,
activeCourses:activeCourses.length,
waitingCount:(waitingStudents[teacherId]||[]).length,
participantsCount:(participants[teacherId]||[]).length,
liveClass:!!liveTeachers[teacherId]
};

}

async function pushTeacherStats(teacherId){
try{
const stats=await getTeacherStats(teacherId);
io.to(teacherRoom(teacherId)).emit("stats-update",stats);
}catch(err){
console.log(err);
}
}

app.get("/",(req,res)=>{
res.sendFile(path.join(__dirname,"public","eleva.html"));
});



app.post("/login",async(req,res)=>{
try{
const{username,password}=req.body;
const user=await User.findOne({username});

if(!user){
return res.json({
success:false,
message:"User not found"
});
}

const ok=await bcrypt.compare(password,user.password);

if(!ok){
return res.json({
success:false,
message:"Wrong password"
});
}

req.session.user={
_id:user._id,
username:user.username,
role:user.role
};

req.session.save(()=>{
res.json({
success:true,
role:user.role
});
});

}catch(err){
console.log(err);
res.status(500).json({
success:false,
message:"Server Error"
});
}
});

app.post("/logout",(req,res)=>{
req.session.destroy(()=>{
res.json({success:true});
});
});

app.get("/session",(req,res)=>{
if(req.session.user){
return res.json({
loggedIn:true,
user:req.session.user
});
}
res.json({loggedIn:false});
});

app.get("/me",(req,res)=>{
if(!req.session.user){
return res.status(401).json({
error:"Not logged in"
});
}
res.json(req.session.user);
});

app.get("/dashboard",(req,res)=>{
if(!req.session.user){
return res.redirect("/");
}

if(req.session.user.role==="admin"){
return res.sendFile(path.join(__dirname,"public","admin-dashboard.html"));
}

if(req.session.user.role==="teacher"){
return res.sendFile(path.join(__dirname,"public","teacher-dashboard.html"));
}

res.sendFile(path.join(__dirname,"public","student-dashboard.html"));
});

app.get("/admin/enrollments",(req,res)=>{

    res.json({
        message:"Enrollments route is working"
    });

});
app.post("/enroll",async(req,res)=>{

try{

const {
fullName,
email,
phone,
gender,
dob,
address,
course,
learningMode,
schedule,
guardianName,
guardianPhone,
username,
password
}=req.body;


const exists = await Enrollment.findOne({
$or:[
{email},
{username}
]
});


if(exists){

return res.json({
success:false,
message:"Email or username already exists"
});

}


const hashedPassword = await bcrypt.hash(password,10);


await Enrollment.create({

fullName,
email,
phone,
gender,
dob,
address,
course,
learningMode,
schedule,
guardianName,
guardianPhone,
username,
password:hashedPassword

});


res.json({

success:true,
message:"Application submitted successfully"

});


}catch(err){

console.log(err);

res.status(500).json({

success:false,
message:"Server Error"

});

}

});

// Get Pending Applications

app.get("/admin/enrollments",async(req,res)=>{

try{

if(!req.session.user || req.session.user.role !== "admin"){

return res.status(403).json({
message:"Unauthorized"
});

}


const enrollments = await Enrollment.find({
status:"Pending"
});


res.json(enrollments);


}catch(err){

console.log(err);

res.status(500).json({
message:"Server Error"
});

}

});



// Approve Student

app.post("/admin/approve/:id",async(req,res)=>{

try{


if(!req.session.user || req.session.user.role !== "admin"){

return res.status(403).json({
message:"Unauthorized"
});

}


const enrollment = await Enrollment.findById(req.params.id);


if(!enrollment){

return res.json({
success:false,
message:"Application not found"
});

}



const exists = await User.findOne({
username: enrollment.username
});


if(exists){

return res.json({
success:false,
message:"Student already exists"
});

}



await User.create({

username: enrollment.username,

email: enrollment.email,

password: enrollment.password,

role:"student"

});



enrollment.status="Approved";

await enrollment.save();



res.json({

success:true,

message:"Student approved"

});



}catch(err){

console.log(err);

res.status(500).json({

message:"Server Error"

});

}

});




// Reject Student

app.post("/admin/reject/:id",async(req,res)=>{


try{


await Enrollment.findByIdAndUpdate(

req.params.id,

{
status:"Rejected"
}

);



res.json({

success:true,

message:"Application rejected"

});


}catch(err){

console.log(err);

res.status(500).json({

message:"Server Error"

});

}


});




// ================= ROSTER + REAL-TIME DASHBOARD ROUTES =================

// Teacher's live dashboard numbers (total assigned students, courses, waiting/in-class counts)
app.get("/teacher/stats",async(req,res)=>{

if(!req.session.user || req.session.user.role!=="teacher"){
return res.status(403).json({message:"Unauthorized"});
}

try{

const stats=await getTeacherStats(String(req.session.user._id));

res.json(stats);

}catch(err){

console.log(err);

res.status(500).json({message:"Server Error"});

}

});

// Teacher's assigned student list ("the students he is going to be taking")
app.get("/teacher/roster",async(req,res)=>{

if(!req.session.user || req.session.user.role!=="teacher"){
return res.status(403).json({message:"Unauthorized"});
}

try{

const roster=await User.find({
role:"student",
assignedTeacher:req.session.user._id
}).select("username email");

res.json(roster);

}catch(err){

console.log(err);

res.status(500).json({message:"Server Error"});

}

});

// Student's assigned teacher + whether that teacher is live right now
app.get("/student/info",async(req,res)=>{

if(!req.session.user || req.session.user.role!=="student"){
return res.status(403).json({message:"Unauthorized"});
}

try{

const student=await User.findById(req.session.user._id)
.populate("assignedTeacher","username");

if(!student.assignedTeacher){
return res.json({
hasTeacher:false,
liveClass:false
});
}

res.json({
hasTeacher:true,
teacherName:student.assignedTeacher.username,
teacherId:String(student.assignedTeacher._id),
liveClass:!!liveTeachers[String(student.assignedTeacher._id)]
});

}catch(err){

console.log(err);

res.status(500).json({message:"Server Error"});

}

});

// List teachers (for the admin roster-assignment screen)
app.get("/admin/teachers",async(req,res)=>{

if(!req.session.user || req.session.user.role!=="admin"){
return res.status(403).json({message:"Unauthorized"});
}

const teachers=await User.find({role:"teacher"}).select("username email");

res.json(teachers);

});

// List students with their current assignment (for the admin roster-assignment screen)
app.get("/admin/students",async(req,res)=>{

if(!req.session.user || req.session.user.role!=="admin"){
return res.status(403).json({message:"Unauthorized"});
}

const students=await User.find({role:"student"})
.select("username email assignedTeacher")
.populate("assignedTeacher","username");

res.json(students);

});

// Assign a student to a teacher (manual roster)
app.post("/admin/assign-teacher",async(req,res)=>{

if(!req.session.user || req.session.user.role!=="admin"){
return res.status(403).json({message:"Unauthorized"});
}

try{

const{studentId,teacherId}=req.body;

const student=await User.findOne({_id:studentId,role:"student"});
const teacher=await User.findOne({_id:teacherId,role:"teacher"});

if(!student||!teacher){

return res.json({
success:false,
message:"Invalid student or teacher"
});

}

student.assignedTeacher=teacher._id;

await student.save();

await pushTeacherStats(String(teacher._id));

res.json({
success:true,
message:"Student assigned to teacher"
});

}catch(err){

console.log(err);

res.status(500).json({
success:false,
message:"Server Error"
});

}

});

io.on("connection",(socket)=>{

console.log("Connected:",socket.id);

// Lightweight identify used by the dashboard pages (not the live-class page) so
// they can sit in a teacher's room and receive stats-update / class-status pushes
// without going through the waiting-room logic below.
socket.on("dashboard-join",async({role,userId})=>{

try{

if(role==="teacher"){

socket.join(teacherRoom(userId));

const stats=await getTeacherStats(userId);

socket.emit("stats-update",stats);
socket.emit("class-status",!!liveTeachers[userId]);

return;
}

if(role==="student"){

const user=await User.findById(userId);

if(user&&user.assignedTeacher){

socket.join(teacherRoom(String(user.assignedTeacher)));

socket.emit("class-status",!!liveTeachers[String(user.assignedTeacher)]);

}else{

socket.emit("class-status",false);

}

}

}catch(err){

console.log(err);

}

});

socket.on("join-class",async({role,name,userId})=>{

console.log("JOIN:",role,name,userId);

socket.role=role;
socket.name=name;
socket.userId=userId;

if(role==="teacher"){

socket.teacherId=userId;

socket.join(teacherRoom(userId));

console.log("Teacher Connected");

socket.emit("class-status",!!liveTeachers[userId]);
socket.emit("code-update",sharedCode[userId]||"");
socket.emit("participants",participants[userId]||[]);
socket.emit("waiting-list",waitingStudents[userId]||[]);

(waitingStudents[userId]||[]).forEach(student=>{

io.to(socket.id).emit("new-student",{
socketId:student.socketId,
username:student.name
});

});

return;
}

// Student: look up who they're assigned to and only join THAT teacher's room
const user=await User.findById(userId);

if(!user||!user.assignedTeacher){

console.log("Student has no assigned teacher:",name);

socket.emit("no-teacher-assigned");
socket.emit("class-status",false);

return;
}

const teacherId=String(user.assignedTeacher);

socket.teacherId=teacherId;

socket.join(teacherRoom(teacherId));

socket.emit("class-status",!!liveTeachers[teacherId]);
socket.emit("code-update",sharedCode[teacherId]||"");

if(!liveTeachers[teacherId]){
// Teacher hasn't started class yet - don't add to waiting list until they do
return;
}

waitingStudents[teacherId]=waitingStudents[teacherId]||[];

waitingStudents[teacherId].push({
socketId:socket.id,
name,
userId
});

console.log("Student waiting:",name);

io.to(liveTeachers[teacherId].socketId).emit("new-student",{
socketId:socket.id,
username:name
});

io.to(teacherRoom(teacherId)).emit("waiting-list",waitingStudents[teacherId]);

pushTeacherStats(teacherId);

});

socket.on("start-class",()=>{

if(socket.role!=="teacher"||!socket.userId)return;

const teacherId=socket.userId;

liveTeachers[teacherId]={socketId:socket.id};

waitingStudents[teacherId]=waitingStudents[teacherId]||[];
participants[teacherId]=participants[teacherId]||[];

io.to(teacherRoom(teacherId)).emit("class-status",true);

pushTeacherStats(teacherId);

});

socket.on("end-class",()=>{

if(socket.role!=="teacher"||!socket.userId)return;

const teacherId=socket.userId;

delete liveTeachers[teacherId];
participants[teacherId]=[];
waitingStudents[teacherId]=[];

io.to(teacherRoom(teacherId)).emit("class-status",false);
io.to(teacherRoom(teacherId)).emit("participants",participants[teacherId]);
io.to(teacherRoom(teacherId)).emit("waiting-list",waitingStudents[teacherId]);

pushTeacherStats(teacherId);

});
socket.on("admit-student",async({socketId,offer})=>{

const teacherId=socket.userId;

const studentSocket=io.sockets.sockets.get(socketId);

if(!studentSocket){
console.log("Student socket not found");
return;
}

if(!studentSocket.userId||!teacherId){
console.log("Missing IDs");
console.log("Student:",studentSocket.userId);
console.log("Teacher:",teacherId);
return;
}

const attendance=await Attendance.create({
student:studentSocket.userId,
teacher:teacherId,
className:"Live Class"
});

activeAttendance[socketId]=attendance._id;

participants[teacherId]=participants[teacherId]||[];

participants[teacherId].push({
id:socketId,
name:studentSocket.name,
role:"student"
});

waitingStudents[teacherId]=(waitingStudents[teacherId]||[]).filter(
s=>s.socketId!==socketId
);

io.to(teacherRoom(teacherId)).emit("participants",participants[teacherId]);

io.to(teacherRoom(teacherId)).emit("waiting-list",waitingStudents[teacherId]);

studentSocket.emit("admitted",{
socketId:liveTeachers[teacherId]?liveTeachers[teacherId].socketId:null,
offer
});

console.log(studentSocket.name,"admitted");

pushTeacherStats(teacherId);

});
socket.on("code-update",code=>{
if(!socket.teacherId)return;
sharedCode[socket.teacherId]=code;
socket.to(teacherRoom(socket.teacherId)).emit("code-update",code);
});

socket.on("draw",data=>{
if(!socket.teacherId)return;
socket.to(teacherRoom(socket.teacherId)).emit("draw",data);
});

socket.on("clear-all",()=>{
if(!socket.teacherId)return;
io.to(teacherRoom(socket.teacherId)).emit("clear-all");
});

socket.on("chat",data=>{
if(!socket.teacherId)return;
io.to(teacherRoom(socket.teacherId)).emit("chat",data);
});

socket.on("offer",({to,offer})=>{
io.to(to).emit("offer",{
from:socket.id,
offer
});
});

socket.on("answer",({to,answer})=>{
io.to(to).emit("answer",{
from:socket.id,
answer
});
});

socket.on("ice-candidate",({to,candidate})=>{
io.to(to).emit("ice-candidate",{
from:socket.id,
candidate
});
});

socket.on("disconnect",async()=>{

console.log("Disconnected:",socket.id);

if(activeAttendance[socket.id]){

const attendance=await Attendance.findById(
activeAttendance[socket.id]
);

if(attendance){

attendance.leaveTime=new Date();

attendance.duration=Math.round(
(attendance.leaveTime-attendance.joinTime)/60000
);

await attendance.save();

}

delete activeAttendance[socket.id];

}

const teacherId=socket.teacherId;

if(teacherId){

if(participants[teacherId]){
participants[teacherId]=participants[teacherId].filter(
p=>p.id!==socket.id
);
}

if(waitingStudents[teacherId]){
waitingStudents[teacherId]=waitingStudents[teacherId].filter(
s=>s.socketId!==socket.id
);
}

io.to(teacherRoom(teacherId)).emit("participants",participants[teacherId]||[]);

io.to(teacherRoom(teacherId)).emit("waiting-list",waitingStudents[teacherId]||[]);

}

if(socket.role==="teacher"&&liveTeachers[socket.userId]&&liveTeachers[socket.userId].socketId===socket.id){

const tId=socket.userId;

delete liveTeachers[tId];
participants[tId]=[];
waitingStudents[tId]=[];

io.to(teacherRoom(tId)).emit("class-status",false);
io.to(teacherRoom(tId)).emit("participants",participants[tId]);
io.to(teacherRoom(tId)).emit("waiting-list",waitingStudents[tId]);

}

if(teacherId){
pushTeacherStats(teacherId);
}

});

});

app.get("/tablet-link",(req,res)=>{

const nets=os.networkInterfaces();

let ip="localhost";

for(const name of Object.keys(nets)){

for(const net of nets[name]){

if(net.family==="IPv4"&&!net.internal){
ip=net.address;
}

}

}

res.json({
url:`http://${ip}:${PORT}?tablet=1`
});

});

app.get("/health",(req,res)=>{

const totalParticipants=Object.values(participants)
.reduce((sum,list)=>sum+list.length,0);

const totalWaiting=Object.values(waitingStudents)
.reduce((sum,list)=>sum+list.length,0);

res.json({
success:true,
database:mongoose.connection.readyState===1,
liveClassesRunning:Object.keys(liveTeachers).length,
participants:totalParticipants,
waitingStudents:totalWaiting
});

});

http.listen(PORT,"0.0.0.0",()=>{

console.log(`Server running on http://localhost:${PORT}`);

});