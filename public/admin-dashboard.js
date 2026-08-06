const applicationTable = document.getElementById(
    "applicationTable"
);


const pendingCount = document.getElementById(
    "pendingCount"
);


async function loadApplications(){


    try{


        const response = await fetch("/admin/enrollments",{
            credentials:"include"
        });

        const applications = await response.json();


        applicationTable.innerHTML = "";




        pendingCount.textContent =
        applications.length;





        if(applications.length === 0){


            applicationTable.innerHTML = `

            <tr>

            <td colspan="6">

            No pending applications

            </td>

            </tr>

            `;


            return;


        }





        applications.forEach(application => {



            const row = document.createElement(
                "tr"
            );



            row.innerHTML = `


            <td>
            ${application.fullName}
            </td>


            <td>
            ${application.email}
            </td>


            <td>
            ${application.course}
            </td>


            <td>
            ${application.learningMode}
            </td>


            <td>
            ${application.status}
            </td>


            <td>


            <button 
            class="approve-btn"
            onclick="approveStudent('${application._id}')">

            Approve

            </button>



            <button
            class="reject-btn"
            onclick="rejectStudent('${application._id}')">

            Reject

            </button>



            </td>



            `;




            applicationTable.appendChild(row);



        });




    }



    catch(error){


        console.log(error);


        alert(
            "Unable to load applications"
        );


    }



}


async function approveStudent(id){



    try{


        const response = await fetch(

            `http://localhost:3000/admin/approve/${id}`,

            {

                method:"POST",

                credentials:"include"

            }

        );



        const result = await response.json();





        alert(result.message);



        loadApplications();



    }



    catch(error){


        console.log(error);


    }


}


async function rejectStudent(id){



    try{


        const response = await fetch(

            `http://localhost:3000/admin/reject/${id}`,

            {

                method:"POST",

                credentials:"include"

            }

        );



        const result = await response.json();





        alert(
            "Application rejected"
        );



        loadApplications();



    }



    catch(error){


        console.log(error);


    }



}


loadApplications();


// ================= ROSTER ASSIGNMENT (who teaches which students) =================

const rosterTable = document.getElementById(
    "rosterTable"
);


async function loadRoster(){


    if(!rosterTable) return;


    try{


        const [teachersRes, studentsRes] = await Promise.all([

            fetch("/admin/teachers",{credentials:"include"}),
            fetch("/admin/students",{credentials:"include"})

        ]);


        const teachers = await teachersRes.json();
        const students = await studentsRes.json();


        rosterTable.innerHTML = "";


        if(students.length === 0){


            rosterTable.innerHTML = `

            <tr>

            <td colspan="3">

            No students yet

            </td>

            </tr>

            `;


            return;


        }


        students.forEach(student => {


            const row = document.createElement(
                "tr"
            );


            const options = teachers.map(t => `

            <option
            value="${t._id}"
            ${student.assignedTeacher && student.assignedTeacher._id === t._id ? "selected" : ""}>
            ${t.username}
            </option>

            `).join("");


            row.innerHTML = `


            <td>
            ${student.username}
            </td>


            <td>
            ${student.assignedTeacher ? student.assignedTeacher.username : "Unassigned"}
            </td>


            <td>

            <select class="teacher-select">
            <option value="">-- choose teacher --</option>
            ${options}
            </select>

            <button
            class="approve-btn"
            onclick="assignTeacher('${student._id}', this)">

            Assign

            </button>

            </td>


            `;


            rosterTable.appendChild(row);


        });


    }


    catch(error){


        console.log(error);

        alert(
            "Unable to load roster"
        );


    }


}


async function assignTeacher(studentId, btn){


    try{


        const row = btn.closest("tr");

        const select = row.querySelector(".teacher-select");

        const teacherId = select.value;


        if(!teacherId){

            alert("Choose a teacher first");

            return;

        }


        const response = await fetch(

            "/admin/assign-teacher",

            {

                method:"POST",

                headers:{"Content-Type":"application/json"},

                credentials:"include",

                body:JSON.stringify({studentId, teacherId})

            }

        );


        const result = await response.json();


        alert(result.message);


        loadRoster();


    }


    catch(error){


        console.log(error);


    }


}


loadRoster();

