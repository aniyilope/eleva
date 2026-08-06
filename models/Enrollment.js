const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
{
    fullName: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    phone: {
        type: String,
        required: true
    },

    gender: String,

    dob: Date,

    address: String,

    course: {
        type: String,
        required: true
    },

    learningMode: {
        type: String,
        default: "Physical"
    },

    schedule: String,

    guardianName: String,

    guardianPhone: String,

    username: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending"
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("Enrollment", enrollmentSchema);