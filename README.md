# 💭 ThoughtStream

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Claude 4.5 Opus](https://img.shields.io/badge/AI-Claude_4.5_Opus-D966C4?style=for-the-badge&logo=anthropic&logoColor=white)

> A social web platform where users can share thoughts, engage in discussions, and connect with others in real-time. Built with Node.js and PostgreSQL.

---

## 🚀 Features

Here is what makes this project special:

* **🔐 Secure Authentication:** Full user signup and login system.
* **🔄 Smart Session Management:** Synchronized logout—if you log out from one tab, you are automatically logged out from all active tabs for security.
* **📝 Share Your Thoughts:** Users can post thoughts (tweets) visible to the community.
* **⏱️ Precise Timestamping:** Every post displays the exact date, time, and seconds of upload.
* **📸 Profile Customization:** Users can upload and update their profile pictures.
* **❤️ Interactive Community:**
    * **Like System:** A live counter for likes on posts.
    * **Reply System:** Users can reply to others' thoughts to start a conversation.
* **🗑️ Content Control:** Users have full control to delete their own thoughts.

---

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL
* **Frontend:** HTML, CSS, JavaScript (EJS/Views)
* **Database Connection:** `db.js` configuration

---

## ⚙️ Installation & Setup

Follow these steps to run the project locally:

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/DarkCoder03/ThoughtStream.git](https://github.com/DarkCoder03/ThoughtStream.git)
    cd ThoughtStream
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Database Configuration**
    * Make sure you have **PostgreSQL** installed and running.
    * Create a database for the project.
    * **⚠️ Important:** Open the `db.js` file and update the `password`, `user`, and `database` fields with your local PostgreSQL credentials.

4.  **Run the Project**
    ```bash
    node app.js
    ```
    * The server should start (usually on port 3000 or 8080).

5.  **Open in Browser**
    * Visit `http://localhost:3000` to see the app in action.

---

## 📂 Project Structure

```text
├── public/          # Static files (CSS, Images, Client-side JS)
├── views/           # Frontend templates (HTML/EJS)
├── app.js           # Main application entry point
├── db.js            # Database connection logic
├── .gitignore       # Files to ignore (node_modules, env)
└── package.json     # Project dependencies
