require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        // Remove old demo users if they exist
        await User.deleteMany({
            username: { $in: ["teacher1", "student1"] }
        });

        const teacherPassword = await bcrypt.hash("joyke", 10);
        const studentPassword = await bcrypt.hash("1234", 10);

        await User.create({
            username: "teacher1",
            email: "teacher1@aptech.local",
            password: teacherPassword,
            role: "teacher"
        });

        await User.create({
            username: "student1",
            email: "student1@aptech.local",
            password: studentPassword,
            role: "student"
        });

        console.log("✅ Demo users created successfully.");

        process.exit();

    } catch (err) {

        console.error(err);
        process.exit(1);

    }
}

seed();