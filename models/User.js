const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

    username:{
        type:String,
        required:true,
        unique:true,
        trim:true
    },

    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true
    },

    password:{
        type:String,
        required:true
    },

    role:{
        type:String,
        enum:["teacher","student","admin"],
        default:"student"
    },

    // Manual roster: which teacher this student has been assigned to (set by admin)
    assignedTeacher:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        default:null
    },

    createdAt:{
        type:Date,
        default:Date.now
    }

});

module.exports = mongoose.model("User",userSchema);