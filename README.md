# Library Management System

A beginner-friendly library management app built with Node.js, Express, MySQL, HTML, CSS, and JavaScript.

This version runs with Node.js. The older ASP.NET files are still included as reference, but you do not need .NET to run the current application.

## What you need to install

Install these before opening the project:

1. [Visual Studio Code](https://code.visualstudio.com/download) — the editor used to open this project.
2. [Node.js LTS](https://nodejs.org/en/download) — choose the LTS version. Node.js includes `npm`, which installs the project's packages.
3. [MySQL Community Server](https://dev.mysql.com/downloads/mysql/) — the database used by the application.

You may also install [MySQL Workbench](https://dev.mysql.com/downloads/workbench/) if you want a visual tool for viewing the database. It is optional.

During the MySQL installation, remember the password you create for the `root` user. You will use it below.

## Download the project

If you received the project as a ZIP file, extract it first.

If you are using Git, open a terminal and run:

```sh
git clone https://github.com/HorusTheHeretic/LibraryManagementSystem
cd LibraryManagementSystem
```

## Open the project in VS Code

1. Open Visual Studio Code.
2. Select **File > Open Folder**.
3. Choose the `LibraryManagementSystem` folder.
4. Select **Terminal > New Terminal**.

The commands below should be entered in the terminal inside VS Code.

## Install the project packages

Run this once after downloading the project:

```sh
npm install
```

This downloads the packages required by the application into the local `node_modules` folder.

## Start MySQL

Make sure the MySQL service is running before starting the application. On Windows, you can usually start it from the **Services** app or from MySQL Workbench.

The MySQL account used below must be allowed to create a database and tables. The application creates the `librarydb` database automatically the first time it starts.

## Configure and run the application

### Windows PowerShell

In the VS Code terminal, run the following commands. Replace `your-mysql-password` with the password you created during MySQL installation.

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "3306"
$env:DB_NAME = "librarydb"
$env:DB_USER = "root"
$env:DB_PASSWORD = "your-mysql-password"
npm start
```

When the server starts, open [http://localhost:5080](http://localhost:5080) in your browser.

These database settings apply only to the current terminal window. If you close the terminal, enter them again before running `npm start`.

### macOS or Linux

Use the equivalent commands in the VS Code terminal:

```sh
export DB_HOST=localhost
export DB_PORT=3306
export DB_NAME=librarydb
export DB_USER=root
export DB_PASSWORD='your-mysql-password'
npm start
```

## Demo accounts

The first run creates sample users and books when the database is empty.

| Role | Email | Password |
|---|---|---|
| Admin | admin@library.local | Admin@123 |
| Staff | staff@library.local | Staff@123 |
| Student | student@library.local | Student@123 |

These accounts are for local testing. Change or remove them before putting the application on the internet.

## What each account can do

- **Student:** browse books, view personal loans and fines, and register for an account.
- **Staff:** issue and return books, mark fines as paid, view loans, and view members.
- **Admin:** manage books and users, view reports, and export CSV files.

Students can borrow up to three books for fourteen days. Borrowing is blocked when a student has overdue books or unpaid fines. The default overdue fine is 5 per day.

## Run the tests

Open a second VS Code terminal and run:

```sh
npm test
```

## Useful commands

```sh
npm start       # start the application
npm run dev     # start with automatic restart while editing
npm test        # run the tests
```

## Troubleshooting

### `npm` or `node` is not recognized

Node.js is not installed correctly, or VS Code was open while Node.js was installed. Install the [Node.js LTS version](https://nodejs.org/en/download), close VS Code, reopen it, and try again.

### MySQL access denied

Check that MySQL is running and that `DB_USER`, `DB_PASSWORD`, and `DB_PORT` match your MySQL installation. The default MySQL port is `3306`.

### The page does not open

Check that `npm start` is still running in the terminal. Then visit [http://localhost:5080](http://localhost:5080). If port `5080` is already in use, choose another port before starting:

```powershell
$env:PORT = "5081"
npm start
```

Then open [http://localhost:5081](http://localhost:5081).