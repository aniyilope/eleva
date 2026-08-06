const steps = document.querySelectorAll(".form-step");

const circles = document.querySelectorAll(".steps span");

const progressBar = document.getElementById("progressBar");


const nextBtn = document.getElementById("nextBtn");

const previousBtn = document.getElementById("previousBtn");

const submitBtn = document.getElementById("submitBtn");


const form = document.getElementById("enrollmentForm");

const reviewBox = document.getElementById("reviewBox");



let currentStep = 0;


showStep(currentStep);


nextBtn.addEventListener("click", () => {


    if(currentStep < steps.length - 1){


        currentStep++;


        showStep(currentStep);


    }


});



previousBtn.addEventListener("click", () => {


    if(currentStep > 0){


        currentStep--;


        showStep(currentStep);


    }


});



function showStep(index){



    steps.forEach(step => {

        step.classList.remove("active");

    });



    steps[index].classList.add("active");




    updateProgress(index);



    updateButtons(index);



}



function updateProgress(index){


    const percentage = ((index + 1) / steps.length) * 100;


    progressBar.style.width = percentage + "%";



    circles.forEach((circle, i)=>{


        circle.classList.remove("active");



        if(i <= index){

            circle.classList.add("active");

        }


    });



}


function updateButtons(index){



    previousBtn.style.display =
    index === 0 ? "none" : "block";



    if(index === steps.length - 1){


        nextBtn.style.display="none";


        submitBtn.style.display="block";


        generateReview();



    }

    else{


        nextBtn.style.display="block";


        submitBtn.style.display="none";


    }



}


function generateReview(){


    const data = new FormData(form);



    reviewBox.innerHTML = `

    <strong>Full Name:</strong>
    ${data.get("fullName")}
    <br>


    <strong>Email:</strong>
    ${data.get("email")}
    <br>


    <strong>Phone:</strong>
    ${data.get("phone")}
    <br>


    <strong>Course:</strong>
    ${data.get("course")}
    <br>


    <strong>Learning Mode:</strong>
    ${data.get("learningMode")}
    <br>


    <strong>Schedule:</strong>
    ${data.get("schedule")}
    <br>


    <strong>Username:</strong>
    ${data.get("username")}


    `;


}



form.addEventListener("submit", async (e)=>{


    e.preventDefault();



    const formData = new FormData(form);



    const enrollmentData = Object.fromEntries(formData);




    try{


        const response = await fetch(
            "http://localhost:3000/enroll",
            {

                method:"POST",

                headers:{

                    "Content-Type":"application/json"

                },

                body:JSON.stringify(enrollmentData)


            }
        );




        const result = await response.json();





        if(result.success){


            alert(
                "Application submitted successfully. Eleva will contact you soon."
            );


            form.reset();


            window.location.href="index.html";


        }

        else{


            alert(result.message);


        }



    }



    catch(error){


        console.log(error);


        alert(
            "Unable to submit application. Try again."
        );


    }



});

