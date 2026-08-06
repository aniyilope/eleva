require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("./models/User");


mongoose.connect(process.env.MONGO_URI)
.then(async()=>{

    const password = await bcrypt.hash(
        "admin123",
        10
    );


   await User.create({

    username:"admin",

    email:"admin@eleva.com",

    password,

    role:"admin"

});


    console.log("Admin created");

    mongoose.connection.close();

})
.catch(err=>{
    console.log(err);
});

