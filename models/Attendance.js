const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    className: {
        type: String,
        default: "Live Class"
    },

    joinTime: {
        type: Date,
        default: Date.now
    },

    leaveTime: {
        type: Date
    },

    duration: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        default: "Present"
    }
});

module.exports = mongoose.model("Attendance", attendanceSchema);