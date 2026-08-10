# Meditation Flow Tracker

Maharishi Institute Meditation Attendance Management System

Build a modern, secure, responsive web application called Maharishi Institute Meditation Attendance Management System. The design should be clean, professional, calming, and use white, green, and gold as the primary colors.

Purpose

This system is used to manage meditation attendance for students during academic blocks. Students must achieve a minimum of 80% attendance by the end of each block. The maximum attendance is 100%.

User Roles

Administrator

Only the administrator has permission to:

* Create, edit, and delete students.
* Enter student names.
* Assign student numbers.
* Create new meditation blocks.
* Edit block durations.
* Open and close blocks.
* Record morning meditation attendance.
* Record afternoon meditation attendance.
* Add or remove attendance points.
* Correct attendance mistakes.
* Reset attendance for a new block.
* View reports and analytics.
* Export reports to PDF and Excel.
* Search for any student.

Student

Students have read-only access. They can:

* Log in securely.
* View their attendance percentage.
* View their attendance history.
* See the current block information.
* See how many points they have earned.
* See how many more points they need to reach 80%.
* View attendance status.

Students must never be able to edit attendance or student information.

Administrator Login

The administrator account is provisioned directly in Supabase Auth. Credentials are never stored in this repository or in any committed file.

No public registration is allowed. Only the administrator can create student accounts.

Meditation Blocks

The administrator must be able to create blocks of any duration.

Examples:

* 2-week block
* 3-week block
* 4-week block
* 5-week block
* 6-week block

For every block, the administrator can enter:

* Block name
* Start date
* End date
* Number of weeks
* Number of meditation days
* Status (Upcoming, Active, Closed)

The system must automatically calculate attendance percentages based on the selected block.

Attendance System

Each meditation day has:

Morning Meditation = 2%

Afternoon Meditation = 2%

The administrator marks:

* Present
* Absent
* Excused

If Present:
Morning = +2%
Afternoon = +2%

If Absent:
0%

Excused sessions should not unfairly reduce the student’s percentage and should be excluded from the percentage calculation.

The system must automatically calculate:

* Total attendance percentage
* Remaining percentage needed
* Number of remaining sessions
* Maximum possible percentage
* Whether the student has reached 80%

Attendance Status

Green
80–100%
Status: Requirement Met

Yellow
70–79%
Status: Warning

Red
Below 70%
Status: At Risk

Student Dashboard

Display:

* Student photo (optional)
* Student name
* Student number
* Current block
* Attendance percentage
* Circular progress bar
* Morning sessions attended
* Afternoon sessions attended
* Sessions missed
* Sessions remaining
* Attendance history
* Status badge

Display messages such as:

“Congratulations! You have reached the required 80%.”

or

“You need 6% more attendance to reach the required minimum.”

Admin Dashboard

Show:

* Total students
* Current block
* Students above 80%
* Students below 80%
* Daily attendance statistics
* Weekly attendance statistics
* Block completion progress
* Charts showing attendance trends

Reports

Generate reports for:

* Individual student attendance
* Entire class attendance
* Students below 80%
* Students with 100% attendance
* Attendance per block
* Attendance history across all blocks

Allow reports to be exported as PDF and Excel.

Notifications

Students should receive dashboard notifications when:

* They are below 80%.
* They have reached 80%.
* A new meditation block begins.
* A meditation block closes.

Design

Use a modern glassmorphism design with:

* Smooth animations
* Rounded cards
* Responsive layout
* Mobile-friendly interface
* Professional dashboard
* Green progress indicators
* Clean typography
* Fast loading

Security

* Authentication required for all users.
* Only administrators can edit data.
* Students have read-only access.
* Passwords must be securely encrypted.
* Every attendance edit must be recorded in an audit log showing who made the change and when.

Database

Store:

* Students
* User accounts
* Meditation blocks
* Attendance records
* Attendance percentages
* Reports
* Audit logs

Automatic Calculations

Whenever the administrator records attendance, the system must instantly:

* Update the student’s percentage.
* Update the progress bar.
* Calculate how much more attendance is needed to reach 80%.
* Display whether the student has met the requirement.
* Lock attendance records once a block is closed unless reopened by the administrator.

The system should feel like a professional institutional attendance platform that is simple to use, accurate, secure, and fully automated.

You can also enhance it by asking Lovable to automatically calculate the percentage based on the number of meditation sessions in each block, rather than assuming fixed 2% increments. That way, if a block is 2 weeks, 4 weeks, or 6 weeks, the system will always scale the percentages correctly so that 100% represents attending every required session in that specific block, and 80% is always the minimum requirement regardless of the block length. This makes the system flexible for any future block duration.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e05b2c1f-edbe-4cca-ab54-e9a273dbb78a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
